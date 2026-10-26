// Page vs. app: renders staged MusicXML files in the dev app and saves a picture of each score. Usage (from tools/omr, `npm run dev` running in ../../app):
//   node compare.mjs name1 name2 ...      -> work/compare/<name>-app.png ; then `.venv/bin/python compare.py name...` stacks it under the source crop.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const names = process.argv.slice(2);
mkdirSync('work/compare', { recursive: true });
const port = 9344;
const chrome = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--no-sandbox', '--user-data-dir=' + join(tmpdir(), 'omr-compare-profile'), 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1.4, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?view=full' });
await sleep(2500);
await ev(`localStorage.setItem('piano-tutor:app','free'); document.querySelector('#app-mode [data-app=free]')?.click()`);
await sleep(800);
try {
  for (const n of names) {
    const doc = (await send('DOM.getDocument')).result.root.nodeId;
    const node = (await send('DOM.querySelector', { nodeId: doc, selector: '#import' })).result.nodeId;
    await send('DOM.setFileInputFiles', { nodeId: node, files: [resolve(existsSync(`work/staged/${n}.musicxml`) ? `work/staged/${n}.musicxml` : `review/${n}.musicxml`)] });
    await sleep(2500);
    const box = await ev(`(()=>{const e=document.getElementById('score'); e.scrollIntoView(); const r=e.getBoundingClientRect(); const svg=e.querySelector('svg'); return JSON.stringify({x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:Math.max(r.height, svg? svg.getBoundingClientRect().height+24:0)})})()`);
    const b = JSON.parse(box);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } });
    writeFileSync(`work/compare/${n}-app.png`, Buffer.from(shot.result.data, 'base64'));
    console.log(n, Math.round(b.w) + 'x' + Math.round(b.h));
  }
} finally { chrome.kill(); process.exit(0); }
