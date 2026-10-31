// Screenshots of the full view for the README: node tools/screenshots/full.mjs
// Needs Chrome and the dev server (cd app && npm run dev:http). Uses only the app's own exercises and a public-domain tune, never a
// score from a book, and a stand-in piano. Piece mode shows the piece list and a note card: no notation of the piece itself.
// The minimal view has its own script, minimal.mjs.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const OUT = resolve(process.env.OUT ?? 'docs/screenshots');
const DESKTOP = { width: 1080, height: 1150 };
const PORT = 9351;

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
  await run('window.scrollTo(0, 0)');
  const r = await send('Page.captureScreenshot', { format: 'webp', quality: 92 });
  writeFileSync(join(OUT, `${name}.webp`), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { ...DESKTOP, deviceScaleFactor: 2, mobile: false });
// A stand-in piano, so no MIDI warning shows.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `navigator.requestMIDIAccess = async () => ({ inputs: new Map([['p115', { name: 'Yamaha P-115', onmidimessage: null }]]), onstatechange: null });`,
});

/** A fresh start in the light theme, with these settings saved (app: free, piece, mode…). */
async function seed(extra) {
  await goto(BASE + '/');
  await run(`(() => {
    localStorage.clear();
    localStorage.setItem('piano-tutor:theme', 'warm');
    for (const [k, v] of Object.entries(${JSON.stringify(extra)})) localStorage.setItem('piano-tutor:' + k, v);
  })()`);
  await goto(BASE + '/');
}
const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)})?.click()`);
const status = () => run(`document.getElementById('status').innerText`);
const press = (midis) => run(`(async () => { const b = __piano.bus; for (const m of ${JSON.stringify(midis)}) b.noteOn(m, 'midi'); await new Promise((r) => setTimeout(r, 60)); for (const m of ${JSON.stringify(midis)}) b.noteOff(m, 'midi'); })()`);
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "Play C3 + E4 · 1 done" -> [48, 64] */
const wanted = async () => {
  const m = /^Play ([^·]+)/.exec(await status());
  return m ? m[1].split('+').map((n) => { const [, l, s, o] = /([A-G])([#b]?)(\d)/.exec(n.trim()); return (Number(o) + 1) * 12 + PITCH[l] + (s === '#' ? 1 : s === 'b' ? -1 : 0); }) : [];
};

// 1. Wait mode on Ode to Joy: the first chord right (green), then a wrong key (red) and the line saying how far off it was.
await seed({ app: 'free', piece: 's1-ode-ht' });
await press(await wanted());
await sleep(300);
await press([72]);
await sleep(600);
await shot('full-wait-mode');

// 2. Tempo mode: the moving line, a green hit and a red wrong key. The notes are played by script, one skipped and one wrong.
await seed({ app: 'free', piece: 's0-two-notes', mode: 'tempo', 'bpm:s0-two-notes': '60', theme: 'night' });
await click('#restart');
await run(`(async () => {
  const status = document.getElementById('status');
  while (!status.innerText.startsWith('Count-in')) await new Promise((r) => setTimeout(r, 5));
  const t0 = performance.now();
  const beats = [0, 4, 8, 10, 12, 13, 14, 15, 16], notes = [60, 62, 60, 62, 62, 60, 62, 60, 60];
  beats.forEach((b, i) => { if (i !== 4) setTimeout(() => { __piano.bus.noteOn(notes[i], 'midi'); __piano.bus.noteOff(notes[i], 'midi'); }, 4000 + b * 1000 - (performance.now() - t0)); });
  setTimeout(() => { __piano.bus.noteOn(65, 'midi'); __piano.bus.noteOff(65, 'midi'); }, 4000 + 3500 - (performance.now() - t0)); // a wrong key between two notes, early enough that its red note has not faded yet
})()`);
await sleep(8700);
await shot('full-tempo-mode');

// 3. The result card after two runs of the same piece: the second one better than the first.
await seed({ app: 'free', piece: 's0-two-notes', theme: 'cold' });
for (const wrongAt of [[1, 3, 4], [2]]) {
  let step = 0;
  while ((await status()).startsWith('Play')) {
    step++;
    if (wrongAt.includes(step)) await press([83]);
    await press(await wanted());
    await sleep(60);
  }
  if (wrongAt.length > 1) { await run(`document.getElementById('result').hidden = true`); await click('#restart'); await sleep(400); }
}
await run(`(async () => { const r = document.getElementById('result'); while (r.hidden) await new Promise((x) => setTimeout(x, 100)); })()`);
await sleep(500);
await shot('full-scores');

// 4. The sight-reading test, level 1.
await seed({ app: 'free', piece: 's0-two-notes' });
await click('#sr-start');
await sleep(2500);
await shot('full-sight-reading');

// 5. Piece mode: the pieces grouped by artist, then the first step, with the dots for how far along the path you are.
const fit = (height) => send('Emulation.setDeviceMetricsOverride', { ...DESKTOP, height, deviceScaleFactor: 2, mobile: false }); // these pages are short
await fit(330);
await seed({ app: 'piece' });
await sleep(800);
await shot('piece-home');
await fit(840);
await click('.piece-pick');
await sleep(6000);
await shot('piece-step');

chrome.kill();
process.exit(0);
