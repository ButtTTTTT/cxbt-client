// Run with a Vite server: node scripts/prepare-avatar-thumbnails.mjs http://127.0.0.1:5175
// CHROMIUM_PATH can select a Chromium/Edge executable. Each card uses the real preview renderer.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:5175').replace(/\/$/, '');
const output = new URL('../public/assets/avatar-cards/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', output), 'utf8'));
const provenance = JSON.parse(await readFile(new URL('sources.json', output), 'utf8'));
const signatures = {};
const generatorHash = createHash('sha256').update(await readFile(new URL('prepare-avatar-cards.py', import.meta.url))).digest('hex');
await mkdir(new URL('thumbnails/', output), { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'avatar-card-preview-'));
const browser = spawn(process.env.CHROMIUM_PATH ?? (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'chromium'), [
  '--headless', '--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
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
  const pending = new Map();
  const errors = [];
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
  const call = (method, params) => send(method, params, sessionId);
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
    throw new Error('Preview timed out: ' + expression + '; ' + await evaluate('document.body.innerHTML'));
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 160, height: 200, deviceScaleFactor: 1, mobile: false });
  await call('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await call('Page.navigate', { url: base + '/scripts/avatar-cards-preview.html' });
  await waitFor('typeof window.showAvatarCard === "function"');
  for (const [index, card] of catalog.cards.entries()) {
    await evaluate(`window.showAvatarCard(${JSON.stringify(card.id)})`);
    await waitFor(`document.querySelector('.creation-character')?.dataset.loadedPreset === ${JSON.stringify(card.id)} && document.querySelector('.creation-character')?.dataset.previewStatus === 'ready'`);
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 160, height: 200, scale: 1 } });
    const path = `thumbnails/${card.id}.png`;
    await writeFile(new URL(path, output), Buffer.from(data, 'base64'));
    card.icon = '../avatar-cards/' + path;
    provenance[path] = [card.preset.body, ...card.preset.fixedParts.flatMap(part => [part.model, part.texture])];
    signatures[card.id] = createHash('sha256').update(generatorHash + JSON.stringify(card.preset)).digest('hex');
    console.log(`Rendered ${index + 1}/${catalog.cards.length}: ${card.id} ${card.name}`);
  }
  assert.deepEqual(errors, [], 'Browser rendering errors');
  await writeFile(new URL('catalog.json', output), JSON.stringify(catalog));
  await writeFile(new URL('sources.json', output), JSON.stringify(provenance, null, 2));
  await writeFile(new URL('thumbnails/index.json', output), JSON.stringify(signatures, null, 2));
  console.log('Prepared and rendered all ' + catalog.cards.length + ' avatar card thumbnails.');
} finally {
  socket?.close();
  const stopped = new Promise(resolve => browser.once('exit', resolve));
  if (browser.exitCode === null && browser.signalCode === null) { browser.kill(); await stopped; }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
