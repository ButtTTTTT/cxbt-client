// Run against Vite: node scripts/smoke-avatar-cards.mjs http://127.0.0.1:5175
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  await call('Fetch.enable', {patterns:[{urlPattern:'http://localhost:8081/api/*',requestStage:'Request'}]});
  socket.addEventListener('message', async event => {
    const message=JSON.parse(event.data);
    if (message.method==='Fetch.requestPaused') {
      await call('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,
        responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from('null').toString('base64')});
    }
  });
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('cxbt_token','profession-smoke')"});
  await call('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:base});
  await waitFor('document.querySelector("[data-profession-ready]")');
  await evaluate(`Promise.all(Array.from(document.images,img=>img.decode())).then(()=>document.fonts.ready)`);
  const screenshots = async name => {
    await settle();
    const {data}=await call('Page.captureScreenshot',{format:'png'});
    await writeFile(new URL(name+'.png',import.meta.url),Buffer.from(data,'base64'));
  };
  await evaluate(`new Promise(resolve=>setTimeout(resolve,1500))`);
  await screenshots('profession-guardian-1024');
  assert.equal(await evaluate('document.querySelector(".profession-screen").dataset.job'), 'guardian');
  for(const job of ['assassin','gunner','biochemist','guardian']) {
    await click('.profession-choice[data-job="'+job+'"]');
    assert.equal(await evaluate('document.querySelector(".profession-screen").dataset.job'),job);
    assert.equal(await evaluate('document.querySelectorAll(".profession-choice[aria-pressed=true]").length'),1);
    assert.ok(await evaluate(`document.querySelector('.profession-presentation').getAnimations({subtree:true}).some(animation=>animation.playState==='running')`));
    await evaluate(`Promise.all(Array.from(document.images,img=>img.decode()))`);
    await evaluate(`new Promise(resolve=>setTimeout(resolve,1500))`);
    await screenshots('profession-'+job+'-1024');
  }
  for(const width of [1440,650,390]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await settle();
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.profession-choice,.profession-action')).every(element=>{const r=element.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})`),true);
    await screenshots('profession-guardian-'+width);
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});
  await click('.profession-settings');
  await waitFor('document.querySelector(".settings-menu")');
  await click('.settings-menu-action');
  await click('.settings-menu-check input');
  assert.equal(await evaluate('document.querySelector(".profession-screen").classList.contains("profession-still")'),true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await waitFor('!document.querySelector(".settings-menu")');
  await click('.profession-create');
  await waitFor('document.querySelector(".creation-screen")');
  assert.ok(await evaluate('location.href.includes("job=guardian")'));
  await click('.creation-back');
  await waitFor('document.querySelector("[data-profession-ready]")');
  await click('.profession-back');
  await waitFor('document.querySelector(".auth-overlay")');
  assert.deepEqual(errors,[]);
  console.log('PASS four professions, animated transitions, viewport bounds, settings, creation/back and logout; no browser or HTTP errors.');
} finally {
  socket?.close();
  const stopped=new Promise(resolve=>browser.once('exit',resolve));
  if(browser.exitCode===null&&browser.signalCode===null){browser.kill();await stopped;}
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
