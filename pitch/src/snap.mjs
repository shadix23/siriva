// Screenshots of the local demo with headless Chrome (own profile, does not touch the user's browser).
// Usage: node snap.mjs <outdir>   (demo must run on http://127.0.0.1:3000)
import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
const out = process.argv[2]; const base = 'http://127.0.0.1:3000';
const shots = { 'd2-live.png': '/demo?step=2', 'd3-profile.png': '/demo?step=3', 'd4-bypass.png': '/demo?step=4', 'd5-family.png': '/demo?step=5' };
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; const port = 9400 + Math.floor(Math.random() * 150);
const chrome = spawn(CH, ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TMPDIR || '/tmp'}/es-snap-${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let t; for (let k = 0; k < 50; k++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (t.find(x => x.type === 'page')) break; } catch {} await sleep(200); }
const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
for (const [name, path] of Object.entries(shots)) {
  await send('Page.navigate', { url: base + path }); await sleep(5000);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}`, Buffer.from(r.result.data, 'base64')); console.log('ok', name);
}
ws.close(); chrome.kill();
