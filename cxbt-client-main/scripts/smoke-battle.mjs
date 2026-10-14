// Battle integration smoke test: skills carried from the lobby, the quickbar-mirrored
// hotbar, weapon combos, pointer focus and the lobby-styled in-game settings menu.
//
// Needs the Go server (character, rooms, websocket) on :8081 plus Vite:
//   node scripts/smoke-battle.mjs http://127.0.0.1:5173
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const api = process.env.CXBT_API ?? 'http://localhost:8081/api';
// The fourth lobby quickbar slot, matching the four profession screenshots.
const FIRST_SLOT = 3;
// Scratch account: the round reads the host name back from the database, so the
// character has to exist server-side. Only that one row is written.
const userId = 987654;
const character = { version: 1, name: '青衫骨', jobId: 'assassin',
  appearance: { gender: 0, hair: 0, eyes: 0, mouth: 0, accessory: 0 } };
const CARRY = [
  { jobId: 'guardian', skills: ['cure'] },
  { jobId: 'gunner', skills: ['shield'] },
  { jobId: 'biochemist', skills: ['conduction', 'overreaction'] },
  { jobId: 'assassin', skills: ['spurt'] },
];

const skills = JSON.parse(readFileSync(join(CLIENT, 'public/assets/lobby/skills.json'), 'utf8'));
const creation = JSON.parse(readFileSync(join(CLIENT, 'public/assets/creation/config.json'), 'utf8'));
const plan = CARRY.map((entry) => {
  for (const skillId of entry.skills) {
    const skill = skills.jobs[entry.jobId].skills.find((candidate) => candidate.id === skillId);
    assert.ok(skill?.kind === 'active', `${entry.jobId} ${skillId} is an active skill`);
  }
  return { ...entry, weapons: creation.jobs[entry.jobId].weapons.length };
});

const token = (() => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ userId, username: character.name, exp: Math.floor(Date.now() / 1000) + 7200 });
  const signature = createHmac('sha256', 'cxbt-super-secret-key-change-in-prod')
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
})();
const apiCall = async (endpoint, options = {}) => {
  const response = await fetch(`${api}${endpoint}`, { ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } });
  if (!response.ok) throw new Error(`${endpoint} -> ${response.status} ${await response.text()}`);
  return response.json();
};
try {
  await apiCall('/character', { method: 'POST', body: JSON.stringify(character) });
  assert.equal((await apiCall('/character')).name, character.name, 'scratch character saved');
} catch (error) {
  throw new Error(`cxbt-server must be running on :8081 (${error.message})`);
}

const output = await mkdtemp(join(tmpdir(), 'avatar-battle-smoke-'));
const defaultBrowser = process.platform === 'win32'
  ? (existsSync('C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    ? 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
    : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  : 'chromium';
const browser = spawn(process.env.CHROMIUM_PATH ?? defaultBrowser, [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--remote-debugging-port=0', `--user-data-dir=${output}/profile`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    browser.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    browser.once('error', reject);
    browser.once('exit', (code) => reject(new Error(`Chromium exited: ${code}`)));
    setTimeout(() => reject(new Error('Chromium startup timed out')), 15000).unref();
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push(message.params.response.url);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 90000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (expression, label = expression) => {
    for (let i = 0; i < 400; i += 1) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    const state = await evaluate(`JSON.stringify({ url: location.href, room: !!document.querySelector('[data-room-settings-ready]'),
      battlefield: !!document.querySelector('[data-gameplay-ready="true"]'), lock: document.pointerLockElement?.tagName ?? null })`)
      .catch(() => 'unavailable');
    throw new Error(`Timed out waiting for ${label}; ${JSON.stringify(errors)}; state: ${state}; screenshots: ${output}`);
  };
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const pointerClick = async (selector) => {
    const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  };
  const key = async (code, hold = 0) => {
    const name = code.replace(/^Key/, '').replace(/^Digit/, '');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code });
    if (hold) await new Promise((resolve) => setTimeout(resolve, hold));
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code });
  };
  const carry = async (jobId, skillId, slot) => {
    const skill = skills.jobs[jobId].skills.find((candidate) => candidate.id === skillId);
    await waitFor(`document.querySelector('[data-skill-id="${skillId}"]') !== null`, `${skill.name} skill row`);
    await evaluate(`(() => {
      const icon = document.querySelector('[data-skill-id="${skillId}"] .lobby-skill-icon');
      const target = document.querySelectorAll('.lobby-quick-slot')[${slot}];
      const data = new DataTransfer();
      icon.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }));
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    })()`);
    assert.match(await evaluate(`document.querySelectorAll('.lobby-quick-slot')[${slot}].getAttribute('aria-label')`),
      new RegExp(skill.name), `${skill.name} assigned to the quickbar`);
    return skill;
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `${base}/` });
  await waitFor(`document.readyState === 'complete'`, 'client shell');
  await evaluate(`localStorage.setItem('cxbt_token', ${JSON.stringify(token)})`);

  for (const entry of plan) {
    // The lobby reads the saved character, so every job needs its own server row.
    await apiCall('/character', { method: 'POST', body: JSON.stringify({ ...character, jobId: entry.jobId }) });
    await call('Page.navigate', { url: `${base}/lobby` });
    await waitFor(`document.querySelector('.lobby-play') !== null`, `${entry.jobId} lobby`);
    await click('.lobby-main-tabs button:nth-child(2)');
    const carried = [];
    for (const [index, skillId] of entry.skills.entries()) {
      carried.push(await carry(entry.jobId, skillId, FIRST_SLOT + index));
    }

    await click('.lobby-play');
    await waitFor(`document.querySelector('[aria-label="练习赛"]') !== null`, 'practice entry');
    await click('[aria-label="练习赛"]');
    await waitFor(`document.querySelector('[aria-label="创建战场"]') !== null`, 'create room');
    await click('[aria-label="创建战场"]');
    await waitFor(`document.querySelector('[data-map-id="level1"]') !== null`, 'map list');
    await click('[data-map-id="level1"]');
    await click('.create-room-dialog-actions button:first-child');
    await waitFor(`document.querySelector('[data-room-settings-ready]') !== null`, 'room settings');
    // One click is enough: RoomSettings also watches the room state in case the
    // Redis start event races the websocket subscription.
    await pointerClick('.room-start');
    await waitFor(`document.querySelector('[data-gameplay-ready="true"]') !== null`, 'battlefield');
    // Entering the round grabs the mouse right away.
    await waitFor('document.pointerLockElement === document.body', 'pointer lock on entry');

    // The battle hotbar mirrors the lobby quickbar instead of the whole bag.
    assert.equal(await evaluate(`document.querySelectorAll('.battle-inventory .battle-slot').length`), 12);
    assert.equal(await evaluate(`document.querySelectorAll('.battle-inventory .battle-skill').length`), carried.length);
    assert.equal(await evaluate(`document.querySelector('.battle-inventory .battle-skill').title`), `${FIRST_SLOT + 1} · ${carried[0].name}`);
    assert.equal(Number(await evaluate(`document.querySelector('[data-gameplay-canvas]').dataset.hotbar`)), entry.weapons + carried.length);
    assert.equal(await evaluate(`document.querySelectorAll('.battle-inventory .battle-slot.empty').length`), 12 - entry.weapons - carried.length);

    // Every carried skill fires from its own hotkey and starts cooling down.
    for (const [index, skill] of carried.entries()) {
      const slot = FIRST_SLOT + index + 1;
      await key(`Digit${slot}`);
      await waitFor(`document.querySelector('.battle-inventory .battle-slot:nth-child(${slot}) .battle-slot-cooldown') !== null`, `${skill.name} cooldown`);
      assert.equal(await evaluate(`document.querySelectorAll('.battle-abilities span.cooling').length`), index + 1);
    }
    if (entry.skills.includes('shield')) {
      assert.ok(Number(await evaluate(`document.querySelector('.battle-shield').textContent`)) >= 600, '能量盾 grants 600 shield');
    }
    if (entry.skills.includes('overreaction')) {
      assert.match(await evaluate(`document.querySelector('.battle-health').getAttribute('aria-label')`), /3225|4225/, '过激反应 raises the health ceiling');
    }

    if (entry.jobId === 'assassin') {
      // Holding the mouse chains the knife through its three attack clips.
      await key('Digit3');
      assert.match(await evaluate(`document.querySelector('.battle-inventory button.active').title`), /^3 · /, 'third quickbar slot is the active weapon');
      const centre = await evaluate(`(() => { const r = document.querySelector('.battle-canvas canvas').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: centre.x, y: centre.y, button: 'left', clickCount: 1 });
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const held = Number(await evaluate(`document.querySelector('[data-gameplay-canvas]').dataset.attackStep`));
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: centre.x, y: centre.y, button: 'left', clickCount: 1 });
      assert.ok(held >= 3, `mouse hold should chain the weapon combo, saw step ${held}`);

      // Esc (and losing the pointer) opens the very same settings UI as the lobby.
      await key('Escape');
      await waitFor(`document.querySelector('.settings-menu') !== null`, 'settings menu');
      assert.equal(await evaluate(`document.querySelectorAll('.battle-pause').length`), 0);
      const settings = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(output, 'battle-settings.png'), Buffer.from(settings.data, 'base64'));
      await click('.settings-menu-close');
      await waitFor(`document.querySelector('.settings-menu') === null`, 'settings closed');
      await waitFor(`document.pointerLockElement === document.body`, 'pointer lock returns after settings');
      const battle = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(output, 'battle-skills.png'), Buffer.from(battle.data, 'base64'));
    }
  }

  assert.deepEqual(errors, []);
  console.log(`PASS: carried skills for ${plan.length} jobs, quickbar hotbar, mouse-hold combo, pointer focus and lobby settings; screenshots: ${output}`);
} finally {
  socket?.close();
  browser.kill();
}
