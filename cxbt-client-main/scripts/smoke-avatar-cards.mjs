// Run against Vite: node scripts/smoke-avatar-cards.mjs http://127.0.0.1:5175
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:5175').replace(/\/$/, '');
const profile = await mkdtemp(join(tmpdir(), 'avatar-card-smoke-'));
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
  const ready = id => waitFor(`document.querySelectorAll('.creation-character').length === 2 && Array.from(document.querySelectorAll('.creation-character')).every(element => element.dataset.loadedPreset === ${JSON.stringify(id)} && element.dataset.previewStatus === 'ready')`);
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base + '/scripts/avatar-cards-lobby.html' });
  await waitFor('document.querySelector("[data-lobby-ready]")');
  await click('[data-category=avatars]');
  const cards = await evaluate('fetch("/assets/avatar-cards/catalog.json").then(response => response.json()).then(catalog => catalog.cards)');
  assert.ok(cards.length > 0);
  for (const [index, card] of cards.entries()) {
    if (index > 0 && index % 24 === 0) await click('.lobby-pages button:last-child');
    await click(`[data-item-id="${card.id}"]`);
    await ready(card.id);
    assert.equal(await evaluate('localStorage.getItem("avatarstar.skin.1.avatar-card-test")'), card.id);
    if ((index + 1) % 24 === 0 || index === cards.length - 1) console.log(`PASS ${index + 1}/${cards.length}: matching preview and portrait`);
  }
  for (let page = Math.floor((cards.length - 1) / 24); page > 0; page -= 1) await click('.lobby-pages button:first-child');
  const rapid = cards.slice(1, 4).map(card => card.id);
  await evaluate(`${JSON.stringify(rapid)}.forEach(id => document.querySelector('[data-item-id="' + id + '"]').click())`);
  await ready(rapid.at(-1));
  await evaluate('window.showLobby = undefined');
  await call('Page.reload');
  await waitFor('typeof window.showLobby === "function"');
  await ready(rapid.at(-1));
  await click('[data-category=equipment]');
  await click('.lobby-item[data-item-id]');
  await waitFor(`document.querySelector('.lobby-avatar .creation-character')?.dataset.previewStatus === 'ready' && document.querySelector('.lobby-avatar .creation-character')?.dataset.weapon !== 'none'`);
  const weapon = await evaluate(`document.querySelector('.lobby-avatar .creation-character').dataset.weapon`);
  await click('[data-category=avatars]');
  await click(`[data-item-id="${cards[1].id}"]`);
  await ready(cards[1].id);
  assert.equal(await evaluate(`document.querySelector('.lobby-avatar .creation-character').dataset.weapon`), weapon);
  const search = await evaluate(`(() => { const rect = document.querySelector('.lobby-search input').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...search, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...search, button: 'left', clickCount: 1 });
  await call('Input.insertText', { text: cards[1].id });
  await waitFor(`document.querySelector('.lobby-inventory-grid').dataset.itemCount === '1'`);
  await click('.lobby-preview-controls button');
  await ready('assassin-male');
  assert.equal(await evaluate('localStorage.getItem("avatarstar.skin.1.avatar-card-test")'), null);
  for (const id of ['card-100053', 'card-100064', 'card-100183'].filter(id => cards.some(card => card.id === id))) {
    const battle = await evaluate(`window.checkBattleCard(${JSON.stringify(id)})`);
    assert.ok(battle.meshCount > 5);
    console.log('PASS battle animation and weapons:', id);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${cards.length} cards, pagination, rapid switching, reload persistence, weapon preservation, search, reset, battle loading; no browser or HTTP errors.`);
} finally {
  socket?.close();
  const stopped = new Promise(resolve => browser.once('exit', resolve));
  if (browser.exitCode === null && browser.signalCode === null) { browser.kill(); await stopped; }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
