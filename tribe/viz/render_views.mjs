// Render cortex views for the TRIBE v2 figures in headless Chrome (real GPU via Metal on macOS, SwiftShader otherwise).
// Usage: node viz/render_views.mjs <workdir>
//   <workdir>/maps.json  {name: [20484 fs5 values], ...}
//   <workdir>/jobs.json  [{out, name, maskName?, h: 0|1, side: -1|1, w, hgt, lineW?}]
// Serves render_views.html, three.js from es/web/node_modules and the cortex from es/web/public/brain/cortex.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIZ = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(VIZ, '../../web');
const work = resolve(process.argv[2]);
const routes = {
  '/render.html': join(VIZ, 'render_views.html'),
  '/three.module.js': join(WEB, 'node_modules/three/build/three.module.js'),
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream' };
const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  let file = routes[url];
  if (!file && url.startsWith('/cortex/')) file = join(WEB, 'public/brain/cortex', url.slice(8));
  if (!file && url.startsWith('/work/')) file = join(work, url.slice(6));
  if (!file || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dbg = 9800 + Math.floor(Math.random() * 150);
const gpu = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const chrome = spawn(CH, ['--headless=new', ...gpu, `--remote-debugging-port=${dbg}`, `--user-data-dir=/tmp/.crender-${dbg}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t;
for (let k = 0; k < 60; k++) { try { t = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json(); if (t.find((x) => x.type === 'page')) break; } catch {} await sleep(200); }
const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result?.result?.value;
};
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/render.html` });
  for (let k = 0; k < 150 && !(await ev('!!window.ready')); k++) await sleep(200);
  if (!(await ev('!!window.ready'))) throw new Error('renderer not ready: ' + logs.join(' | '));
  console.log('gpu:', await ev(`(() => { const g = document.querySelector('canvas').getContext('webgl2'); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`));
  await ev(`fetch('/work/maps.json').then(r => r.json()).then(m => { window.MAPS = m; return Object.keys(m).length; })`);
  const jobs = JSON.parse(readFileSync(join(work, 'jobs.json'), 'utf8'));
  for (const j of jobs) {
    const args = JSON.stringify({ ...j, out: undefined });
    const url = await ev(`(() => { const j = ${args}; j.values = MAPS[j.name]; j.mask = j.maskName ? MAPS[j.maskName] : null; return window.renderView(j); })()`);
    writeFileSync(j.out, Buffer.from(url.split(',')[1], 'base64'));
    console.log('view', j.out);
  }
  if (logs.length) console.log('console:', logs.join(' | '));
} finally {
  ws.close(); chrome.kill(); server.close();
  setTimeout(() => rmSync(`/tmp/.crender-${dbg}`, { recursive: true, force: true }), 500); // temporary Chrome profile
}
