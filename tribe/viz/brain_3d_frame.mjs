// Large still of the site's 3D brain player (story retell, 20 s) for the README, like public/site/brain-static-*.webp.
// Needs the site running (npm run dev or start in es/web) and Google Chrome; renders on the real GPU (Metal) on macOS.
// Usage: node viz/brain_3d_frame.mjs http://localhost:3000 ru viz/brain_3d_story_retell_ru.png [cssWidth=600] [dpr=3.4]
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

const [site, lang = 'ru', out, cssW = '600', dpr = '3.4'] = process.argv.slice(2);
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9950 + Math.floor(Math.random() * 40);
const gpu = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const chrome = spawn(CH, ['--headless=new', ...gpu, '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/.cframe-${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t;
for (let k = 0; k < 60; k++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (t.find((x) => x.type === 'page')) break; } catch {} await sleep(200); }
const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: +dpr, mobile: false });
  // language of the landing lives in localStorage (es/web/src/components/site/i18n.ts, LANG_KEY)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('siriva-site-lang', ${JSON.stringify(lang)}); } catch {}` });
  await send('Page.navigate', { url: `${site}/#brain` });
  for (let k = 0; k < 100 && !(await ev("!!document.querySelector('.s-bp__stage')")); k++) await sleep(200);
  const ok = await ev(`(async () => {
    const st = document.createElement('style');
    st.textContent = '.s-bp--section .s-bp__stage{aspect-ratio:1200/1110!important;width:${cssW}px!important;max-height:none!important;border:0!important;border-radius:0!important}.s-bp__bar,.s-bp__hint{display:none!important}.s-bp__stage .s-bp__legend{position:absolute;left:0;right:0;bottom:26px;margin:0;justify-content:center;z-index:3}';
    document.head.appendChild(st);
    document.querySelector('.s-bp__stage').scrollIntoView({ block: 'center' });
    const t0 = performance.now();
    while (!performance.getEntriesByName('brain:ico7-live').length && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
    document.querySelector('.s-bp__play')?.click(); // pause
    const r = document.querySelector('.s-bp__range');
    r.value = '15'; // 20 s of the exercise
    r.dispatchEvent(new Event('input', { bubbles: true }));
    const lg = document.querySelector('.s-bp__ctrl .s-bp__legend');
    if (lg) document.querySelector('.s-bp__stage').appendChild(lg.cloneNode(true));
    await new Promise((r) => setTimeout(r, 1200));
    return performance.getEntriesByName('brain:ico7-live').length > 0;
  })()`);
  const rect = await ev(`(() => { const r = document.querySelector('.s-bp__stage').getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 }, captureBeyondViewport: true });
  if (!shot.result) throw new Error('screenshot failed: ' + JSON.stringify(shot.error) + ' rect ' + JSON.stringify(rect));
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(ok ? 'ico7' : 'WARNING: ico7 not loaded', out);
} finally {
  ws.close(); chrome.kill();
  setTimeout(() => rmSync(`/tmp/.cframe-${port}`, { recursive: true, force: true }), 500); // temporary Chrome profile
}
