// Скриншоты ключевых экранов и проверка горизонтальной прокрутки и ошибок консоли (headless Chrome).
// Запуск: node scripts/screens.mjs [baseUrl]   (нужны запущенные es-api и es-web)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = new URL("../docs/screens/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9400 + Math.floor(Math.random() * 150);
const chrome = spawn(CH, ["--headless=new", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/.es-shots-${port}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let k = 0; k < 60; k++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    if (list.find((x) => x.type === "page")) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(list.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const consoleErrors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Runtime.enable");

// Пациент для экранов пациента: синтетический demo-trend («Сауле, 68 лет»).
const SHOTS = [
  { name: "d1-problem", url: "/demo?step=1", w: 1280 },
  { name: "d2-live", url: "/demo?step=2", w: 1280 },
  { name: "d3-profile", url: "/demo?step=3", w: 1280 },
  { name: "d4-bypass", url: "/demo?step=4", w: 1280, click: "С обходным путём" },
  { name: "d5-family", url: "/demo?step=5", w: 1280 },
  { name: "d6-numbers", url: "/demo?step=6", w: 1280 },
  { name: "p1-today-375", url: "/app?patient=demo-trend", w: 375 },
  { name: "p1-today-1280", url: "/app?patient=demo-trend", w: 1280 },
  { name: "p1-today-390", url: "/app?patient=demo-trend", w: 390 },
  { name: "c1-consent-390", url: "/consent?step=1", w: 390, noPatient: true },
  { name: "c1-consent-375", url: "/consent?step=1", w: 375, noPatient: true },
  { name: "c5-consent-375", url: "/consent?step=5", w: 375, noPatient: true },
  { name: "e0-picture-375", url: "/exercise/picture_description?patient=demo-trend", w: 375 },
  { name: "e0-retell-1280", url: "/exercise/story_retell?patient=demo-trend", w: 1280 },
  { name: "f1-family-375", url: "/family?patient=demo-trend", w: 375 },
  { name: "f2-profile-1280", url: "/family/profile?patient=demo-trend", w: 1280 },
  { name: "s1-settings-375", url: "/settings?patient=demo-trend", w: 375 },
  { name: "d2-live-375", url: "/demo?step=2", w: 375 },
  { name: "d4-bypass-375", url: "/demo?step=4", w: 375 },
];

const only = process.env.ONLY?.split(",");
const report = [];
for (const s of SHOTS) {
  if (only && !only.includes(s.name)) continue;
  await send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.w < 600 ? 812 : 800, deviceScaleFactor: 1, mobile: s.w < 600 });
  await send("Page.navigate", { url: `${BASE}/demo?step=1` });
  await sleep(800);
  await evaluate(`(() => { try { ${s.noPatient ? 'localStorage.removeItem("es.patient");' : ""} } catch (e) {} })()`);
  consoleErrors.length = 0;
  await send("Page.navigate", { url: BASE + s.url });
  await sleep(3500);
  if (s.click) {
    await evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.includes(${JSON.stringify(s.click)}))?.click()`);
    await sleep(600);
  }
  const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
  const h = await evaluate("Math.min(4000, document.documentElement.scrollHeight)");
  await send("Emulation.setDeviceMetricsOverride", { width: s.w, height: h, deviceScaleFactor: 1, mobile: s.w < 600 });
  await sleep(400);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}${s.name}.png`, Buffer.from(shot.result.data, "base64"));
  report.push({ name: s.name, overflowPx: overflow, consoleErrors: [...consoleErrors] });
}
console.log(JSON.stringify(report, null, 1));
ws.close();
chrome.kill();
