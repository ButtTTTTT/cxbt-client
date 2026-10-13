// Run against Vite: node scripts/smoke-skills.mjs http://127.0.0.1:5175
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:5175').replace(/\/$/, '');
const profile = await mkdtemp(join(tmpdir(), 'skill-smoke-'));
const browser = spawn(process.env.CHROMIUM_PATH ?? (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'chromium'), [
  '--headless', '--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    browser.stderr.on('data', data => {
      const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    browser.once('error', reject);
    browser.once('exit', code => reject(new Error('Browser exited ' + code)));
    setTimeout(() => reject(new Error('Browser startup timed out')), 15000).unref();
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push(message.params.response.url);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value ?? arg.description));
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 150; i += 1) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('Timed out: ' + expression + '; ' + await evaluate('document.body.innerHTML'));
  };
  const settle = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await settle(); };
  const state = () => evaluate(`(() => ({
    points: document.querySelector('.lobby-skill-points b')?.textContent ?? null,
    rows: Array.from(document.querySelectorAll('.lobby-skill-row')).map(row => ({
      id: row.dataset.skillId,
      name: row.querySelector('.lobby-skill-name').textContent,
      level: Number(row.dataset.skillLevel),
      learned: Number(row.dataset.skillLearned),
      pendingWidth: row.querySelector('.lobby-skill-bar-pending').style.width,
      learnedWidth: row.querySelector('.lobby-skill-bar-learned').style.width,
      icon: row.querySelector('.lobby-skill-icon').getAttribute('src'),
      plus: !row.querySelector('.lobby-skill-add').disabled,
      minus: !row.querySelector('.lobby-skill-remove').disabled,
    })),
  }))()`);
  const drop = (skillId, slot) => evaluate(`(() => {
    const icon = document.querySelector('[data-skill-id="' + ${JSON.stringify(skillId)} + '"] .lobby-skill-icon');
    const target = document.querySelectorAll('.lobby-quick-slot')[${slot}];
    const data = new DataTransfer();
    icon.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }));
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    return true;
  })()`);

  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await call('Page.navigate', { url: `${base}/scripts/skills-lobby.html?job=guardian` });
  await waitFor('document.querySelector("[data-lobby-ready]")');
  const catalog = await evaluate(`fetch('${base}/assets/lobby/skills.json').then(response => response.json())`);
  assert.equal(catalog.maxLevel, 5);
  assert.deepEqual(catalog.barWidths, [0, 74, 146, 218, 290, 364]);
  assert.deepEqual(Object.keys(catalog.jobs).sort(), ['assassin', 'biochemist', 'guardian', 'gunner']);

  for (const job of ['guardian', 'gunner', 'biochemist', 'assassin']) {
    await call('Page.navigate', { url: `${base}/scripts/skills-lobby.html?job=${job}` });
    await waitFor('document.querySelector("[data-lobby-ready]")');
    await click('.lobby-main-tabs button:nth-child(2)');
    await waitFor('document.querySelector(".lobby-skills")');
    const expected = catalog.jobs[job];
    const before = await state();
    assert.equal(before.rows.length, 5, job);
    assert.deepEqual(before.rows.map(row => row.id), expected.skills.map(skill => skill.id), job);
    assert.deepEqual(before.rows.map(row => row.name), expected.skills.map(skill => `${skill.name}（${skill.kind === 'active' ? '主动' : '被动'}）`), job);
    assert.deepEqual(before.rows.map(row => row.level), [1, 1, 1, 1, 1], job);
    assert.deepEqual(before.rows.map(row => row.pendingWidth), ['74px', '74px', '74px', '74px', '74px'], job);
    assert.equal(before.points, '10', job);
    assert.equal(await evaluate('document.querySelector(".lobby-skill-finish").disabled'), true, job);
    assert.equal(await evaluate('document.querySelector(".lobby-skill-reset").disabled'), false, job);
    assert.equal(await evaluate('document.querySelectorAll(".lobby-skill-tabs button").length'), 2, job);
    assert.equal(await evaluate('document.querySelector(".lobby-skill-tabs button.active").textContent'), '职业技能', job);

    await click('[data-skill-id] .lobby-skill-add');
    await click('[data-skill-id]:nth-child(3) .lobby-skill-add');
    const pending2 = await state();
    assert.deepEqual(pending2.rows.map(row => row.level), [2, 1, 2, 1, 1], job);
    assert.deepEqual(pending2.rows.map(row => row.pendingWidth), ['146px', '74px', '146px', '74px', '74px'], job);
    assert.deepEqual(pending2.rows.map(row => row.learnedWidth), ['74px', '74px', '74px', '74px', '74px'], job);
    assert.equal(pending2.points, '8', job);
    assert.equal(await evaluate('document.querySelector(".lobby-skill-finish").disabled'), false, job);
    assert.equal(pending2.rows[0].minus, true, job);

    await click('[data-skill-id] .lobby-skill-remove');
    assert.equal((await state()).points, '9', job);
    await click('[data-skill-id] .lobby-skill-add');

    if (expected.skills[0].kind === 'active') {
      await drop(expected.skills[0].id, 9);
      const slot = await evaluate(`document.querySelectorAll('.lobby-quick-slot')[9].getAttribute('aria-label')`);
      assert.ok(slot.includes(expected.skills[0].name), `${job} quickbar: ${slot}`);
      await evaluate(`document.querySelectorAll('.lobby-quick-slot')[9].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
      await settle();
    }

    await click('.lobby-skill-finish');
    const done = await state();
    assert.deepEqual(done.rows.map(row => row.learned), [2, 1, 2, 1, 1], job);
    assert.deepEqual(done.rows.map(row => row.learnedWidth), ['146px', '74px', '146px', '74px', '74px'], job);
    assert.equal(await evaluate('document.querySelector(".lobby-skill-finish").disabled'), true, job);

    await click('.lobby-skill-reset');
    const reset = await state();
    assert.deepEqual(reset.rows.map(row => row.level), [0, 0, 0, 0, 0], job);
    assert.deepEqual(reset.rows.map((row, index) => row.icon.endsWith(expected.skills[index].disabledIcon ?? expected.skills[index].icon)),
      [true, true, true, true, true], job);
    assert.equal(reset.points, '15', job);
    assert.equal(await evaluate('document.querySelector(".lobby-skill-finish").disabled'), true, job);

    await click('.lobby-skill-tabs button:nth-child(2)');
    assert.equal(await evaluate('document.querySelectorAll(".lobby-boss-skill").length'), 6, job);
    assert.equal(await evaluate('document.querySelector(".lobby-skill-points")'), null, job);
    await click('.lobby-boss-skill-get');
    assert.ok((await evaluate('document.querySelector(".lobby-status").textContent')).length > 0, job);
    console.log(`PASS ${job}: 5 skills, pending/learned bars, points, drag to quickbar, reset, boss tab`);
  }

  assert.deepEqual(errors, []);
  console.log('PASS: 4 classes, skill points, two-layer bars, quickbar drag, reset, boss placeholder; no browser or HTTP errors.');
} finally {
  socket?.close();
  const stopped = new Promise(resolve => browser.once('exit', resolve));
  if (browser.exitCode === null && browser.signalCode === null) { browser.kill(); await stopped; }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}