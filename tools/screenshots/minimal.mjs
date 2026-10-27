// Screenshots of the minimal view for the README: node tools/screenshots/minimal.mjs
// Needs Chrome and the dev server (cd app && npm run dev:http). Uses only the app's own exercises and a public-domain tune,
// never a score from a book, and a stand-in piano so the top bar reads "Yamaha P-115". The course history is sample data.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const OUT = resolve(process.env.OUT ?? 'docs/screenshots');
const LANDSCAPE = { width: 533, height: 340 }; // a 4.3" phone on its side, minus the browser's own bars
const PORTRAIT = { width: 400, height: 600 };
const PORTRAIT_TALL = { width: 400, height: 560 }; // the course page, whole
const LANDSCAPE_TALL = { width: 533, height: 470 }; // free mode has more controls beside the score
const PORT = 9350;

const profile = mkdtempSync(join(tmpdir(), 'piano-shots-'));
const chrome = spawn(process.env.CHROME ?? 'google-chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const goto = async (url) => { await send('Page.navigate', { url }); await sleep(2500); };
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'webp', quality: 92 });
  writeFileSync(join(OUT, `${name}.webp`), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
const size = (s) => send('Emulation.setDeviceMetricsOverride', { ...s, deviceScaleFactor: 2, mobile: true, screenWidth: s.width, screenHeight: s.height });

await send('Page.enable');
// A stand-in piano, so the top bar shows a device instead of "access denied".
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `navigator.requestMIDIAccess = async () => ({ inputs: new Map([['p115', { name: 'Yamaha P-115', onmidimessage: null }]]), onstatechange: null });`,
});

const minimal = `${BASE}/?view=minimal`;
/** Start from a saved course state (sample data), optionally in Free mode with a piece. */
async function seed(course, extra = {}) {
  await goto(minimal);
  await run(`(() => {
    localStorage.clear();
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('piano-tutor:course:v1', JSON.stringify({ version: 1, placementSkipped: true, minutes: 25, sessions: 5, streak: 3, bestStreak: 3, lastCompleteDate: yesterday, ...${JSON.stringify(course)} }));
    for (const [k, v] of Object.entries(${JSON.stringify(extra)})) localStorage.setItem('piano-tutor:' + k, v);
  })()`);
  await goto(minimal);
}
const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)})?.click()`);

// 1. The course page: the streak, the time for today, and today's six steps.
await size(PORTRAIT_TALL);
await seed({ unitId: '0.3', unitDays: 2, readingLevel: 10 });
await shot('minimal-course-home');
await size(LANDSCAPE);

// 2. A step: the warm-up, left hand only. The right hand's staff is faded.
await seed({ unitId: 'I.2', unitDays: 0 });
await click('#course-start');
await sleep(1800);
await shot('minimal-warmup');

// 3. Reading: a freshly generated piece, here the hands taking turns.
await seed({ unitId: '0.3', unitDays: 2, readingLevel: 10 });
await click('#course-start');
await sleep(1500);
await click('#course-primary'); // skip the warm-up
await sleep(2000);
await shot('minimal-reading');

// 4. A note card (stage 0): a note on the staff, you play it.
await seed({ unitId: '0.1', unitDays: 3 });
await click('#course-start');
await sleep(2000);
await shot('minimal-cards');

// 5. Free mode, wait mode: the key you play shows on the staff, filled when right and dashed when wrong.
await size(LANDSCAPE_TALL);
await seed({ unitId: '0.1' }, { app: 'free', piece: 's1-ode-rh' });
await run(`(() => { const b = __piano.bus; b.noteOn(64, 'midi'); b.noteOff(64, 'midi'); setTimeout(() => b.noteOn(69, 'midi'), 150); return 1; })()`);
await sleep(500);
await shot('minimal-wait');

// 6. A timed run (tempo mode): the count-in and the cue, then which notes counted. The notes are played by script, one skipped.
await size(LANDSCAPE);
await seed({ unitId: '0.1' }, { app: 'free', piece: 's0-two-notes', mode: 'tempo', 'bpm:s0-two-notes': '60' });
await click('#restart');
await run(`(async () => {
  const status = document.getElementById('status');
  while (!status.innerText.startsWith('Count-in')) await new Promise((r) => setTimeout(r, 5));
  const t0 = performance.now();
  const beats = [0, 4, 8, 10, 12, 13, 14, 15, 16], notes = [60, 62, 60, 62, 62, 60, 62, 60, 60];
  beats.forEach((b, i) => { if (i !== 4) setTimeout(() => { __piano.bus.noteOn(notes[i], 'midi'); __piano.bus.noteOff(notes[i], 'midi'); }, 4000 + b * 1000 - (performance.now() - t0)); });
  window.__runStart = t0;
})()`);
await sleep(8700);
await shot('minimal-tempo');
// 7. The result card, with Try again.
await run(`(async () => { const r = document.getElementById('result'); while (r.hidden) await new Promise((x) => setTimeout(x, 100)); })()`);
await sleep(400);
await shot('minimal-result');

// 8. The same app held upright.
await size(PORTRAIT);
await seed({ unitId: '0.3', unitDays: 2, readingLevel: 10 });
await click('#course-start');
await sleep(1500);
await click('#course-primary');
await sleep(2000);
await shot('minimal-portrait');

chrome.kill();
process.exit(0);
