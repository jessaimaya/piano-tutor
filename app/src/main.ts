import '@fontsource-variable/outfit';
import './style.css';
import { readScoreFile } from './content/mxl';
import { scoreEntries, scoreEntryXml, type ScoreEntry } from './content/scores';
import { techniquePieces } from './content/technique';
import { pieces, pieceXml, STAGE_NAMES, type Piece } from './content/pieces';
import { generateSightReading, LEVELS, MAX_LEVEL } from './content/sight-reading';
import { bindComputerKeyboard, InputBus } from './midi/input';
import { noteName } from './midi/parse';
import { endBeat, readPlayback, schedule, soundingAt, soundsOf, stepIndexAt, type PlayStep, type Sound } from './practice/playback';
import { clampRange, isWholePiece, RangedCursor, type BarRange, type RangeCursor } from './practice/range';
import { CALIBRATION_TAPS, clampLatency, estimateLatency, matchTaps } from './practice/calibration';
import { beatUnitOfXml, bpmRange, QUARTER_BEAT, type BeatUnit } from './practice/meter';
import { describeMissed, describeOffTime, describeWrongNote } from './practice/feedback';
import { CLEAN_ACCURACY, CLEAN_RUNS_TO_FINISH, PracticeLog, type Hands, type PieceStatus } from './practice/log';
import { Session, type RunSummary } from './practice/session';
import { describeOutcome, PASS_ACCURACY, recordResult, startTest, type SightState } from './practice/sight-test';
import { TempoRun, type TempoSummary } from './practice/tempo-mode';
import { readTimeline, type TimedStep } from './practice/timeline';
import { accuracy } from './practice/wait-mode';
import { Synth } from './ui/audio';
import { bindTempoDial } from './ui/dial';
import { KeyboardView } from './ui/keyboard';
import { filterLibrary, isFiltering, NO_FILTER, type LibraryFilter, type SortBy } from './ui/library-filter';
import { ScoreView } from './ui/score';
import { playheadAt, type Spot } from './ui/playhead';
import { bindThemes } from './ui/theme';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const safeStorage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};
const storage = safeStorage();
function safeGet(key: string): string | null {
  try { return storage?.getItem('piano-tutor:' + key) ?? null; } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { storage?.setItem('piano-tutor:' + key, value); } catch { /* storage blocked */ }
}

const log = new PracticeLog(storage);
const bus = new InputBus();
const synth = new Synth();
const score = new ScoreView($('score'));
const pressed = new Set<number>();

const keyboard = new KeyboardView(
  $('keyboard'),
  (n) => bus.noteOn(n, 'screen'),
  (n) => bus.noteOff(n, 'screen'),
);

type Mode = 'wait' | 'tempo';
interface Current {
  id: string;
  title: string;
  handsAvailable: Hands;
  /** In beats per minute of the piece's own beat (`unit`): dotted quarters in 6/8, eighths in 3/8, quarters elsewhere. */
  targetBpm: number;
  /** What one beat is, from the score's first time signature. Set when the score loads. */
  unit: BeatUnit;
}
interface TempoState {
  run: TempoRun;
  cursor: RangeCursor;
  steps: TimedStep[];
  bpm: number;
  cancelClicks: () => void;
  raf: number;
  lastRaw: number;
  /** Where each step sits on the page, for the moving line (indexed like `steps`). */
  spots: Spot[];
}

let current: Current | undefined;
let session: Session | undefined; // wait mode
let tempo: TempoState | undefined; // tempo mode, while a run is going
let hands: Hands = 'both';
let mode: Mode = (safeGet('mode') as Mode | null) === 'tempo' ? 'tempo' : 'wait';

// ───────────── library ─────────────
/** Everything in the library list: our own pieces, generated technique exercises and imported scores, in one shape. */
interface Listed {
  id: string;
  title: string;
  /** Which library section it sits in. */
  section: string;
  /** Sections sort by this; technique sections come after the stages and start collapsed. */
  sectionOrder: number;
  collapsed?: boolean;
  composer: string;
  stage: number;
  skills: readonly string[];
  /** Measured difficulty (imported scores only). */
  difficulty?: number;
  technique: boolean;
  hands: Hands;
  targetBpm: number;
  open: () => Promise<void>;
}
const stageSection = (stage: number) => ({ section: `Stage ${stage} · ${STAGE_NAMES[stage] ?? ''}`, sectionOrder: stage });
const techniqueSection = (group: 'scales' | 'arpeggios') =>
  ({ section: group === 'scales' ? 'Technique · Scales' : 'Technique · Arpeggios', sectionOrder: group === 'scales' ? 100 : 101, collapsed: true });

const catalog: Listed[] = [
  ...pieces.map((p): Listed => ({ id: p.id, title: p.title, composer: p.composer, stage: p.stage, skills: p.skills, technique: false, ...stageSection(p.stage), hands: p.hands, targetBpm: p.targetBpm, open: () => openPiece(p) })),
  ...techniquePieces.map((p): Listed => ({ id: p.id, title: p.title, composer: p.composer, stage: p.stage, skills: p.skills, technique: true, ...(p.group ? techniqueSection(p.group) : stageSection(p.stage)), hands: p.hands, targetBpm: p.targetBpm, open: () => openPiece(p) })),
  ...scoreEntries.map((e): Listed => ({ id: e.id, title: e.title, composer: e.composer, stage: e.stage, skills: e.skills, difficulty: e.difficulty, technique: false, ...stageSection(e.stage), hands: e.hands, targetBpm: e.targetBpm, open: () => openScoreEntry(e) })),
];

let filter: LibraryFilter = { ...NO_FILTER };

const openSections = new Set<string>(); // technique sections the player has expanded

function renderLibrary(): void {
  const host = $('library');
  host.replaceChildren();
  const statusOf = new Map(catalog.map((i) => [i.id, log.status(i.id, i.hands, i.targetBpm)] as const));
  const shown = filterLibrary(catalog.map((i) => ({ ...i, status: statusOf.get(i.id)! })), filter).map((i) => i.id);
  const filtering = isFiltering(filter);
  $('lib-count').textContent = filtering ? `${shown.length} of ${catalog.length}` : `${catalog.length} pieces`;
  if (shown.length === 0) {
    const none = document.createElement('p');
    none.className = 'hint';
    none.textContent = 'Nothing matches. Clear a filter or shorten the search.';
    host.append(none);
    return;
  }
  const byId = new Map(catalog.map((i) => [i.id, i] as const));
  const ordered = shown.map((id) => byId.get(id)!);
  const flat = filter.sort !== 'course';

  const addItem = (container: HTMLElement, piece: Listed): void => {
    const status: PieceStatus = statusOf.get(piece.id)!;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item' + (current?.id === piece.id ? ' current' : '');
    btn.innerHTML = '<span class="name"></span><span class="meta"></span><span class="badge"></span>';
    btn.querySelector('.name')!.textContent = piece.title;
    // Where it sits in the course matters once sections are gone or narrowed by a search.
    if (flat || filtering) {
      const bits = [piece.technique ? null : piece.composer, `stage ${piece.stage}`, piece.difficulty !== undefined ? `difficulty ${piece.difficulty}` : null];
      btn.querySelector('.meta')!.textContent = bits.filter(Boolean).join(' · ');
    }
    const badge = btn.querySelector('.badge')!;
    badge.textContent = status;
    badge.classList.add(status);
    btn.addEventListener('click', () => void piece.open());
    container.append(btn);
  };

  if (flat) {
    for (const piece of ordered) addItem(host, piece);
    return;
  }

  const sections = new Map<string, Listed[]>();
  for (const item of [...ordered].sort((a, b) => a.sectionOrder - b.sectionOrder)) {
    sections.set(item.section, [...(sections.get(item.section) ?? []), item]);
  }
  for (const [name, items] of sections) {
    const collapsible = items[0]!.collapsed === true;
    const container: HTMLElement = collapsible ? document.createElement('details') : host;
    if (collapsible) {
      const details = container as HTMLDetailsElement;
      // Open while searching/filtering, while the current piece is inside, or if the player opened it.
      details.open = filtering || openSections.has(name) || items.some((i) => i.id === current?.id);
      details.addEventListener('toggle', () => {
        if (filtering) return;
        if (details.open) openSections.add(name); else openSections.delete(name);
      });
      const summary = document.createElement('summary');
      summary.textContent = `${name} (${items.length})`;
      container.append(summary);
      host.append(container);
    } else {
      const h = document.createElement('h2');
      h.textContent = name;
      host.append(h);
    }
    for (const piece of items) addItem(container, piece);
  }
}

/** Wire the search box and filter dropdowns above the list. */
function bindLibraryFilter(): void {
  const q = $<HTMLInputElement>('lib-q');
  const stage = $<HTMLSelectElement>('lib-stage');
  const status = $<HTMLSelectElement>('lib-status');
  const hands = $<HTMLSelectElement>('lib-hands');
  const piecesOnly = $<HTMLInputElement>('lib-pieces');
  const sort = $<HTMLSelectElement>('lib-sort');
  for (const n of [...new Set(catalog.map((i) => i.stage))].sort((a, b) => a - b)) {
    stage.append(new Option(`Stage ${n} · ${STAGE_NAMES[n] ?? ''}`, String(n)));
  }
  const read = () => {
    filter = {
      query: q.value,
      stage: stage.value === 'all' ? 'all' : Number(stage.value),
      status: status.value as LibraryFilter['status'],
      hands: hands.value as LibraryFilter['hands'],
      piecesOnly: piecesOnly.checked,
      sort: sort.value as SortBy,
    };
    renderLibrary();
  };
  for (const el of [q, stage, status, hands, piecesOnly, sort]) el.addEventListener('input', read);
  $('lib-clear').addEventListener('click', () => {
    q.value = '';
    stage.value = status.value = hands.value = 'all';
    piecesOnly.checked = false;
    sort.value = 'course';
    read();
  });
}

// ───────────── loading ─────────────
function showResult(text: string, isError = false): void {
  const el = $('result');
  el.hidden = false;
  el.className = 'result' + (isError ? ' error' : '');
  el.textContent = text;
}

let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
/** One line under the status: what you got wrong and by how much. Fades after a few seconds. */
function setFeedback(text: string, kind: 'bad' | 'good' = 'bad'): void {
  const el = $('feedback');
  el.textContent = text;
  el.className = 'feedback ' + kind;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(clearFeedback, 6000);
}
function clearFeedback(): void {
  clearTimeout(feedbackTimer);
  $('feedback').textContent = '';
  keyboard.clearFlashes();
}

async function loadScore(info: Omit<Current, 'unit'>, xml: string, preferredHands: Hands): Promise<void> {
  if (sight && !info.id.startsWith('sr-')) abortSight(false); // opening another piece ends the test
  stopTempo();
  cancelListen();
  $('result').hidden = true;
  try {
    await score.load(xml);
  } catch (err) {
    showResult(`Could not read that score: ${(err as Error).message}`, true);
    return;
  }
  const next: Current = { ...info, unit: beatUnitOfXml(xml) };
  current = next;
  const range = bpmRange(next.unit);
  const bpmInput = $<HTMLInputElement>('bpm');
  bpmInput.min = String(range.min);
  bpmInput.max = String(range.max);
  $('bpm-unit').textContent = next.unit.quarters === 1 ? 'bpm' : `bpm (${next.unit.name} notes)`;
  hands = next.handsAvailable === 'both' ? preferredHands : next.handsAvailable;
  $('piece-title').textContent = next.title;
  const saved = Number(safeGet('bpm:' + next.id));
  bpmInput.value = String(saved >= range.min && saved <= range.max ? saved : startingBpm(next.targetBpm, next.unit));
  restoreRange();
  resetPractice();
  renderLibrary();
}

/** Start comfortably below the target: about 70%, in steps of 4, but never below 40 quarters per minute (or the target itself). */
const startingBpm = (target: number, unit: BeatUnit) =>
  Math.min(target, Math.max(Math.ceil(40 / unit.quarters), Math.round((target * 0.7) / 4) * 4));

async function openPiece(piece: Piece): Promise<void> {
  await loadScore(
    { id: piece.id, title: piece.title, handsAvailable: piece.hands, targetBpm: piece.targetBpm },
    pieceXml(piece),
    (safeGet('hands:' + piece.id) as Hands | null) ?? 'both',
  );
  $('piece-meta').textContent = `${piece.composer} · stage ${piece.stage}`;
  if (!piece.id.startsWith('sr-')) safeSet('piece', piece.id); // generated test pieces are not worth coming back to
}

async function openScoreEntry(entry: ScoreEntry): Promise<void> {
  let xml: string;
  try {
    xml = await scoreEntryXml(entry);
  } catch (err) {
    showResult(`Could not open ${entry.title}: ${(err as Error).message}`, true);
    return;
  }
  await loadScore(
    { id: entry.id, title: entry.title, handsAvailable: entry.hands, targetBpm: entry.targetBpm },
    xml,
    (safeGet('hands:' + entry.id) as Hands | null) ?? 'both',
  );
  $('piece-meta').textContent = `${entry.composer} · stage ${entry.stage} · ${entry.source}` + (entry.notes ? ` · ${entry.notes}` : '');
  safeSet('piece', entry.id);
}

// ───────────── shared view updates ─────────────
function currentExpected(): Iterable<number> {
  if (mode === 'wait') return session && !session.finished ? session.expected : [];
  if (!tempo) return [];
  // Follow the player, not the clock: the target key moves as soon as the previous step is played or missed.
  return $<HTMLInputElement>('showNext').checked ? tempo.run.upcoming() : [];
}

function refreshKeys(): void {
  keyboard.setState('pressed', pressed);
  keyboard.setState('expected', currentExpected());
}

function renderControls(): void {
  const available = current?.handsAvailable ?? 'both';
  for (const b of document.querySelectorAll<HTMLButtonElement>('#hands button')) {
    const h = b.dataset.hands as Hands;
    b.disabled = (available !== 'both' && h !== available) || !!sight; // the test is read with the hands it asks for
    b.setAttribute('aria-pressed', String(h === hands));
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#mode button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
  $('tempo-controls').hidden = mode !== 'tempo';
  $('target').textContent = current ? `target ${current.targetBpm} bpm` : '';
  $('beat-hint').textContent = current && current.unit.quarters !== 1 ? `Beat = ${current.unit.name} note, ${current.unit.perBar} per bar` : '';
  $('restart').textContent = mode === 'tempo' && !tempo ? 'Start' : 'Restart';
  $('stop').hidden = !(mode === 'tempo' && tempo);
  $<HTMLButtonElement>('listen').disabled = !!sight;
  if (current) renderRange();
  renderLatency();
}

function resetPractice(): void {
  cancelLoop();
  firstStep = undefined;
  stopTempo();
  cancelListen();
  clearFeedback();
  $('result').hidden = true;
  session = undefined;
  if (mode === 'wait') session = new Session(activeCursor(), hands);
  else activeCursor().reset();
  renderControls();
  renderStatus();
  refreshKeys();
}

// ───────────── wait mode ─────────────
function renderStatus(): void {
  const status = $('status');
  if (mode === 'wait') {
    const stats = session?.stats;
    if (!session || !stats || session.finished) { status.textContent = ''; return; }
    const want = [...session.expected].sort((a, b) => a - b).map(noteName).join(' + ');
    const wrong = stats.wrong ? `<span class="bad">${stats.wrong} wrong</span> · ` : '';
    status.innerHTML = `Play <strong>${want}</strong> · ${stats.steps} done · ${wrong}${
      stats.steps ? Math.round(accuracy(stats) * 100) + '% first try' : 'waiting for your first note'}`;
    return;
  }
  if (!tempo) {
    status.textContent = current ? 'Set a tempo and press Start. You get a count-in first.' : '';
  }
}

function finishWaitRun(summary: RunSummary): void {
  if (!current) return;
  log.add({ ...summary, mode: 'wait', pieceId: current.id, at: new Date().toISOString(), ...barsField() });
  const pct = Math.round(accuracy(summary) * 100);
  const secs = Math.max(1, Math.round(summary.durationMs / 1000));
  showResult(`Finished: ${pct}% first try, ${summary.wrong} wrong note${summary.wrong === 1 ? '' : 's'}, ${secs}s. ` +
    (loopOn() ? ' Looping: play it again.' : pct >= 90 ? 'Ready to try Tempo mode.' : 'Press Restart to go again.'));
  renderLibrary();
  if (loopOn()) { session?.restart(); renderStatus(); refreshKeys(); }
}

// ───────────── debug log ─────────────
// One JSON object per line, prefixed [pt], so a run can be copied out of the console and analysed.
// `rel` times are ms from beat 0 of the run (negative = count-in); a press at the right moment has offset 0.
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (midi: number) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const r1 = (n: number) => Math.round(n * 10) / 10;
function debug(ev: string, data: Record<string, unknown>): void {
  console.log('[pt]', JSON.stringify({ ev, ...data }));
}

// ───────────── tempo mode ─────────────
function readBpm(): number {
  const el = $<HTMLInputElement>('bpm');
  const { min, max } = bpmRange(current?.unit ?? QUARTER_BEAT);
  const bpm = Math.min(max, Math.max(min, Math.round(Number(el.value) || current?.targetBpm || 60)));
  el.value = String(bpm);
  return bpm;
}

function startTempo(): void {
  if (!current || tempo || calibration || listening) return;
  if (!synth.settled) { void synth.ready().then(startTempo); return; } // the first click must not wait for the audio clock to start
  const cursor = activeCursor();
  const steps = readTimeline(cursor, hands);
  if (!steps.some((s) => s.notes.length > 0)) { showResult('Nothing to play for that hand.', true); return; }
  $('result').hidden = true;
  clearFeedback();

  const bpm = readBpm();
  if (!sight) safeSet('bpm:' + current.id, String(bpm));
  // The player's tempo counts the piece's own beat; the run and the score count quarter notes.
  const { quarters: q, perBar } = current.unit;
  const run = new TempoRun(steps, { bpm: bpm * q, countInBeats: perBar * q, beatQuarters: q });
  const t0 = performance.now();
  run.start(t0);

  // Clicks: always for the count-in; during the piece only if the metronome is on.
  const lastBeat = Math.ceil(Math.max(...steps.map((s) => s.beat)) / q) + 1;
  const withMetronome = $<HTMLInputElement>('metronome').checked;
  const clicks = [];
  for (let k = -perBar; k <= lastBeat; k++) {
    if (k >= 0 && !withMetronome) break;
    clicks.push({ atMs: run.timeOfBeat(k * q), accent: ((k % perBar) + perBar) % perBar === 0 });
  }
  const cancelClicks = synth.scheduleClicks(clicks);

  debug('start', {
    piece: current.id, hands, bpm, beatMs: r1(run.beatMs), windowMs: r1(run.windowMs), latencyMs,
    countInMs: r1(run.beatZeroAt - t0), audio: synth.info,
    schedule: run.schedule.map((e) => ({ note: nm(e.note), beat: e.beat, rel: r1(e.time - run.beatZeroAt) })),
  });
  const spots = stepSpots(cursor, steps);
  tempo = { run, cursor, steps, bpm, cancelClicks, raf: 0, lastRaw: 0, spots };
  cursor.reset();
  renderControls();
  tick();
}

/** Walk the score once to learn where each step sits on the page. */
function stepSpots(cursor: RangeCursor, steps: TimedStep[]): Spot[] {
  const byRaw = new Map<number, Spot>();
  cursor.reset();
  for (let raw = 0; !cursor.done; raw++) {
    const spot = score.spot(cursor.beat());
    if (spot) byRaw.set(raw, spot);
    cursor.next();
  }
  cursor.reset();
  return steps.flatMap((s) => byRaw.get(s.rawIndex) ?? []);
}

function logPress(run: TempoRun, midi: number, source: string, stamp: number, r: ReturnType<TempoRun['press']>): void {
  const rel = stamp - latencyMs - run.beatZeroAt;
  // the nearest note of the same pitch, to see which one this press was aiming at
  const near = run.schedule.filter((e) => e.note === midi)
    .map((e) => ({ rel: e.time - run.beatZeroAt, state: e.state }))
    .sort((a, b) => Math.abs(rel - a.rel) - Math.abs(rel - b.rel))[0];
  const hw = source === 'midi' ? r1(bus.lastMidiStamp - latencyMs - run.beatZeroAt) : undefined;
  debug('press', {
    note: nm(midi), src: source, rel: r1(rel), hwRel: hw, result: r.kind,
    offset: r.kind === 'hit' ? r1(r.offsetMs) : r.kind === 'extra' && r.offsetMs !== undefined ? r1(r.offsetMs) : undefined,
    wanted: r.kind === 'extra' ? r.wanted.map(nm) : undefined,
    nearestSamePitch: near ? { rel: r1(near.rel), state: near.state, delta: r1(rel - near.rel) } : undefined,
    windowMs: r1(run.windowMs),
  });
}

function tick(): void {
  if (!tempo || !current) return;
  const now = performance.now() - latencyMs;
  const u = tempo.run.update(now);
  if (u.cursorRawIndex !== tempo.lastRaw) {
    tempo.lastRaw = u.cursorRawIndex;
    tempo.cursor.moveTo(u.cursorRawIndex);
  }
  if (u.newlyMissed.length) {
    debug('miss', { notes: u.newlyMissed.map(nm), rel: r1(now - tempo.run.beatZeroAt) });
    for (const n of u.newlyMissed) keyboard.flash('should', n, 1500);
    setFeedback(describeMissed(u.newlyMissed));
  }
  score.setPlayhead(playheadAt(tempo.spots, Math.max(0, (now - tempo.run.beatZeroAt) / tempo.run.beatMs)));
  refreshKeys();

  const status = $('status');
  if (u.phase === 'countin') {
    status.innerHTML = `Count-in <span class="count">${u.countInLeft}</span> · ${tempo.bpm} bpm`;
  } else if (u.phase === 'playing') {
    const l = tempo.run.live;
    const next = tempo.run.upcoming();
    const nextText = $<HTMLInputElement>('showNext').checked && next.length
      ? `Next <strong>${next.sort((a, b) => a - b).map(noteName).join(' + ')}</strong> · ` : '';
    status.innerHTML = `${nextText}${l.matched} in time · ${l.missed ? `<span class="bad">${l.missed} missed</span>` : '0 missed'} · ${
      l.extra ? `<span class="bad">${l.extra} extra</span>` : '0 extra'}`;
  }

  if (u.phase === 'done' && u.summary) {
    const summary = u.summary;
    debug('end', { ...summary });
    stopTempo();
    finishTempoRun(summary);
    return;
  }
  tempo.raf = requestAnimationFrame(tick);
}

function stopTempo(): void {
  cancelLoop();
  firstStep = undefined;
  if (!tempo) return;
  cancelAnimationFrame(tempo.raf);
  tempo.cancelClicks();
  tempo = undefined;
  score.setPlayhead(undefined);
  renderControls();
  refreshKeys();
}

function describeTiming(s: TempoSummary): string {
  if (s.matched === 0) return 'no notes were in time';
  const lean = Math.abs(s.biasMs) < 15 ? 'right on the beat' : `${Math.abs(s.biasMs)} ms ${s.biasMs > 0 ? 'late' : 'early'} on average`;
  return `timing: ${lean}${Math.abs(s.biasMs) >= 40 && latencyMs === 0 ? ' (if it is always about the same, press Calibrate timing)' : ''}`;
}

function finishTempoRun(s: TempoSummary): void {
  if (!current) return;
  if (s.matched === 0 && s.extra === 0) {
    showResult("I didn't hear any notes. Check the piano connection in the top bar (or use the keyboard), then press Start again.", true);
    renderLibrary();
    renderStatus();
    return;
  }
  const runBpm = Math.round(s.bpm / current.unit.quarters); // in the piece's own beats, like the target
  if (sight) { finishSightRun(s); return; }
  log.add({
    pieceId: current.id, at: new Date().toISOString(), hands, mode: 'tempo', bpm: runBpm,
    steps: s.steps, firstTry: s.firstTry, wrong: s.wrong, durationMs: s.durationMs,
    meanAbsOffsetMs: s.meanAbsOffsetMs, biasMs: s.biasMs, ...barsField(),
  });
  const pct = Math.round(accuracy(s) * 100);
  const clean = accuracy(s) >= CLEAN_ACCURACY;
  const status = log.status(current.id, current.handsAvailable, current.targetBpm);

  let next = '';
  if (status === 'done') {
    next = ` That is ${CLEAN_RUNS_TO_FINISH} clean runs in a row at ${current.targetBpm}+ bpm: piece finished! 🎉`;
  } else if (clean && runBpm < current.targetBpm) {
    const up = Math.min(current.targetBpm, runBpm + 4);
    $<HTMLInputElement>('bpm').value = String(up);
    next = ` Clean run. Next: ${up} bpm.`;
  } else if (clean) {
    next = barsField().bars
      ? ' Clean at the target tempo on these bars. Now play the whole piece: only full runs finish it.'
      : ` Clean at the target tempo. ${CLEAN_RUNS_TO_FINISH} in a row finish the piece.`;
  } else if (pct < 60 && runBpm > Math.ceil(40 / current.unit.quarters)) {
    const down = Math.max(Math.ceil(40 / current.unit.quarters), runBpm - 8);
    $<HTMLInputElement>('bpm').value = String(down);
    next = ` That was fast for now. Try ${down} bpm.`;
  }
  showResult(`${runBpm} bpm: ${pct}% of steps in time (${s.missed} missed, ${s.extra} extra), ${describeTiming(s)}.${next}`);
  safeSet('bpm:' + current.id, $<HTMLInputElement>('bpm').value);
  renderLibrary();
  renderStatus();
  // Loop: straight into the next pass (at the raised tempo, if the run was clean) until Stop, Escape, or the piece is done.
  if (loopOn() && mode === 'tempo' && !sight && status !== 'done') {
    loopTimer = setTimeout(() => { loopTimer = undefined; if (!tempo && mode === 'tempo' && current && loopOn()) startTempo(); }, 1200);
  }
}

// ───────────── bar range and loop ─────────────
/** Bars to practise, 1-based inclusive; undefined = the whole piece. Set per piece and remembered. */
let barRange: BarRange | undefined;
let loopTimer: ReturnType<typeof setTimeout> | undefined;
const loopOn = () => $<HTMLInputElement>('loop').checked;
function cancelLoop(): void {
  clearTimeout(loopTimer);
  loopTimer = undefined;
}

/** The cursor to practise on: the score itself, or the score limited to the chosen bars. */
function activeCursor(): RangeCursor {
  return barRange && !isWholePiece(barRange, score.measureCount) ? new RangedCursor(score, barRange) : score;
}

/** Marks a log entry as "only some bars" so it never counts towards finishing the piece. */
const barsField = (): { bars?: [number, number] } =>
  barRange && !isWholePiece(barRange, score.measureCount) ? { bars: [barRange.from, barRange.to] } : {};

function renderRange(): void {
  const total = score.measureCount;
  const range = barRange ?? { from: 1, to: total };
  $<HTMLInputElement>('bar-from').value = String(range.from);
  $<HTMLInputElement>('bar-to').value = String(range.to);
  for (const id of ['bar-from', 'bar-to']) $<HTMLInputElement>(id).max = String(total);
  $('bar-total').textContent = total ? String(total) : '–';
  for (const id of ['bar-from', 'bar-to', 'bar-all']) ($(id) as HTMLInputElement | HTMLButtonElement).disabled = !current || !!sight;
}

/** After a piece loads: bring back the bars you last used on it. */
function restoreRange(): void {
  barRange = undefined;
  if (current && !current.id.startsWith('sr-')) {
    const m = /^(\d+)-(\d+)$/.exec(safeGet('range:' + current.id) ?? '');
    if (m) {
      const r = clampRange(Number(m[1]), Number(m[2]), score.measureCount);
      if (!isWholePiece(r, score.measureCount)) barRange = r;
    }
  }
  renderRange();
}

function setRange(from: number, to: number): void {
  if (!current) return;
  const r = clampRange(from, to, score.measureCount);
  barRange = isWholePiece(r, score.measureCount) ? undefined : r;
  if (!current.id.startsWith('sr-')) safeSet('range:' + current.id, barRange ? `${barRange.from}-${barRange.to}` : '');
  renderRange();
  resetPractice();
}
const readRange = () => setRange(Number($<HTMLInputElement>('bar-from').value), Number($<HTMLInputElement>('bar-to').value));
$('bar-from').addEventListener('change', readRange);
$('bar-to').addEventListener('change', readRange);
$('bar-all').addEventListener('click', () => setRange(1, score.measureCount));

// ───────────── sight-reading test ─────────────
interface SightRun { state: SightState; piece?: Piece; pieceNo: number }
let sight: SightRun | undefined;
const levelName = (level: number) => LEVELS[level - 1]?.name ?? '';

interface SightRecord { at: string; level: number }
function sightHistory(): SightRecord[] {
  try { return JSON.parse(safeGet('sr:history') ?? '[]') as SightRecord[]; } catch { return []; }
}
function renderSightLast(): void {
  const last = sightHistory().at(-1);
  $('sr-last').textContent = last ? `Last: level ${last.level} of ${MAX_LEVEL} (${last.at.slice(0, 10)})` : 'Not taken yet';
  $<HTMLButtonElement>('sr-start').disabled = !!sight;
}

function startSightTest(): void {
  if (sight || tempo || calibration || listening) return;
  sight = { state: startTest(), pieceNo: 0 };
  void nextSightPiece();
}

async function nextSightPiece(): Promise<void> {
  if (!sight) return;
  const run = sight;
  const spec = LEVELS[run.state.level - 1]!;
  run.pieceNo++;
  run.piece = generateSightReading(spec.level, Math.floor(Math.random() * 1e9));
  mode = 'tempo'; // not saved: the test is a visit, your own mode comes back afterwards
  $('sr-next').hidden = true;
  $('sr-panel').hidden = false;
  await openPiece(run.piece);
  if (sight !== run) return; // ended while loading
  $<HTMLInputElement>('bpm').value = String(spec.bpm);
  $('piece-title').textContent = `Sight-reading test · level ${spec.level} of ${MAX_LEVEL}`;
  $('piece-meta').textContent = spec.name;
  $('sr-text').innerHTML = `<strong>Level ${spec.level} of ${MAX_LEVEL}</strong>, piece ${run.pieceNo}: ${spec.name}. ` +
    `Look it over first: the key, the rhythm, where your hand sits. Listen is off. Press <strong>Start</strong> when you are ready; ` +
    `${Math.round(PASS_ACCURACY * 100)}% of the notes in time passes the level.`;
  resetPractice();
  renderControls();
  renderSightLast();
}

function finishSightRun(s: TempoSummary): void {
  if (!sight) return;
  const level = sight.state.level;
  const acc = accuracy(s);
  const pct = Math.round(acc * 100);
  sight.state = recordResult(sight.state, acc, MAX_LEVEL);
  const st = sight.state;
  if (st.done) {
    const record: SightRecord = { at: new Date().toISOString(), level: st.passedLevel };
    safeSet('sr:history', JSON.stringify([...sightHistory(), record]));
    const message = `${pct}% in time on that last piece. ${describeOutcome(st.passedLevel, MAX_LEVEL, levelName)}`;
    void leaveSight().then(() => showResult(message));
    return;
  }
  const passed = acc >= PASS_ACCURACY;
  showResult(`${pct}% in time (${s.missed} missed, ${s.extra} extra). ${passed
    ? `Level ${level} passed: next is level ${st.level}.`
    : `Not quite: one more piece at level ${level}.`}`);
  $('sr-text').textContent = passed ? `Level ${level} passed.` : `Level ${level}: one more try with a new piece.`;
  $('sr-next').hidden = false;
  renderStatus();
}

/** End the test and, if asked, bring back the piece and mode you had before it. */
function abortSight(reopen: boolean): Promise<void> {
  if (!sight) return Promise.resolve();
  sight = undefined;
  $('sr-panel').hidden = true;
  mode = (safeGet('mode') as Mode | null) === 'tempo' ? 'tempo' : 'wait';
  renderControls();
  renderSightLast();
  if (!reopen) return Promise.resolve();
  const before = catalog.find((p) => p.id === safeGet('piece')) ?? catalog[0];
  return before ? before.open() : Promise.resolve();
}
const leaveSight = () => abortSight(true);

$('sr-start').addEventListener('click', startSightTest);
$('sr-next').addEventListener('click', () => void nextSightPiece());
$('sr-quit').addEventListener('click', () => {
  void leaveSight().then(() => showResult('Test ended without a result.'));
});

// ───────────── listen (hear the piece first) ─────────────
interface Listening {
  cursor: RangeCursor;
  steps: PlayStep[];
  sounds: Sound[];
  quarterMs: number;
  t0: number;
  endBeat: number;
  cancelAudio: () => void;
  raf: number;
}
let listening: Listening | undefined;

/** Stop the playback without touching the practice state (callers that reset the practice do that themselves). */
function cancelListen(): void {
  if (!listening) return;
  cancelAnimationFrame(listening.raf);
  listening.cancelAudio();
  listening = undefined;
  $('listen').textContent = '▶ Listen';
  $<HTMLButtonElement>('calibrate').disabled = !!calibration || !!tempo;
}

function startListen(): void {
  if (!synth.settled) { void synth.ready().then(startListen); return; } // the first click must not wait for the audio clock to start
  if (sight) { showResult('Listening is off during the sight-reading test: reading it cold is the point.', true); return; }
  if (!current || tempo || calibration || listening) return;
  const cursor = activeCursor();
  const steps = readPlayback(cursor, hands);
  const sounds = soundsOf(steps);
  if (sounds.length === 0) { showResult('Nothing to play for that hand.', true); return; }
  clearFeedback();
  $('result').hidden = true;
  session = undefined; // the playback moves the cursor; the practice starts fresh afterwards
  const bpm = readBpm();
  safeSet('bpm:' + current.id, String(bpm));
  const { quarters: q, perBar } = current.unit;
  const quarterMs = 60000 / (bpm * q);
  const t0 = performance.now() + 300 + perBar * q * quarterMs; // a bar of clicks first, so you feel the tempo
  const end = endBeat(steps);

  const withClicks = $<HTMLInputElement>('listen-clicks').checked;
  const lastBeat = Math.ceil(end / q);
  const clicks = [];
  for (let k = -perBar; k <= lastBeat; k++) {
    if (k >= 0 && !withClicks) break;
    clicks.push({ atMs: t0 + k * q * quarterMs, accent: ((k % perBar) + perBar) % perBar === 0 });
  }
  const cancelClicks = synth.scheduleClicks(clicks);
  const cancelNotes = synth.scheduleNotes(schedule(sounds, t0, quarterMs));
  cursor.reset();
  listening = { cursor, steps, sounds, quarterMs, t0, endBeat: end, cancelAudio: () => { cancelClicks(); cancelNotes(); }, raf: 0 };
  $('listen').textContent = '■ Stop listening';
  renderLatency();
  listenTick();
}

function listenTick(): void {
  const l = listening;
  if (!l) return;
  const beat = (performance.now() - l.t0) / l.quarterMs;
  const status = $('status');
  if (beat < 0) {
    status.textContent = 'Listen: count-in…';
    l.cursor.reset();
  } else {
    l.cursor.moveTo(stepIndexAt(l.steps, beat));
    status.textContent = `Listening · ${Math.round((100 * Math.min(beat, l.endBeat)) / l.endBeat)}%`;
  }
  keyboard.setState('expected', beat < 0 ? [] : soundingAt(l.sounds, beat));
  if (beat > l.endBeat + 0.5) {
    cancelListen();
    resetPractice();
    const part = barsField().bars ? `bars ${barRange!.from}–${barRange!.to}` : 'the whole piece';
    const who = hands === 'both' ? '' : hands === 'rh' ? ', right hand' : ', left hand';
    showResult(`That was ${part}${who}. Now your turn: play it back, and press Listen again as often as you like.`);
    return;
  }
  l.raf = requestAnimationFrame(listenTick);
}

// Escape stops whatever is running, so you never have to scroll back up to the buttons.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (listening) { cancelListen(); resetPractice(); }
  else if (tempo) { stopTempo(); resetPractice(); }
});

$('listen').addEventListener('click', () => {
  if (listening) { cancelListen(); resetPractice(); return; }
  startListen();
});

// ───────────── latency calibration ─────────────
/** Setup delay in ms, measured by tapping along with clicks: subtracted from every key press in tempo mode. */
let latencyMs = clampLatency(Number(safeGet('latencyMs')) || 0);
let calibration: { clicks: number[]; taps: number[]; cancel: () => void; timer: ReturnType<typeof setTimeout> } | undefined;

function renderLatency(): void {
  $('latency').textContent = calibration ? 'Tap any key with each click…'
    : latencyMs === 0 ? 'Timing not calibrated' : `Timing offset ${latencyMs > 0 ? '+' : ''}${latencyMs} ms`;
  $('calib-reset').hidden = latencyMs === 0 || !!calibration;
  $<HTMLButtonElement>('calibrate').disabled = !!calibration || !!tempo || !!listening;
}

function startCalibration(): void {
  if (tempo || calibration || listening) return;
  if (!synth.settled) { void synth.ready().then(startCalibration); return; } // the first click must not wait for the audio clock to start
  clearFeedback();
  $('result').hidden = true;
  const beatMs = 750, lead = 4; // four clicks to get the feel, then the ones that count
  const first = performance.now() + 600;
  const times = Array.from({ length: lead + CALIBRATION_TAPS }, (_, i) => first + i * beatMs);
  const cancel = synth.scheduleClicks(times.map((atMs, i) => ({ atMs, accent: i === lead })));
  const end = times[times.length - 1]! + 500;
  calibration = { clicks: times.slice(lead), taps: [], cancel, timer: setTimeout(finishCalibration, end - performance.now()) };
  $('status').textContent = 'Calibrating: tap any key exactly on each click. The first four clicks are practice, the accented click starts the count.';
  renderLatency();
}

function finishCalibration(): void {
  if (!calibration) return;
  const result = estimateLatency(matchTaps(calibration.clicks, calibration.taps));
  calibration.cancel();
  clearTimeout(calibration.timer);
  calibration = undefined;
  if (result.ok) {
    latencyMs = clampLatency(result.ms);
    safeSet('latencyMs', String(latencyMs));
    const how = Math.abs(latencyMs) < 8 ? 'right on the clicks, so no correction is needed'
      : `${Math.abs(latencyMs)} ms ${latencyMs > 0 ? 'late' : 'early'} (±${result.spreadMs} ms)`;
    showResult(`Your taps were ${how}. Tempo mode now corrects for it.`);
  } else {
    showResult(result.reason, true);
  }
  renderLatency();
  renderStatus();
}

$('calibrate').addEventListener('click', startCalibration);
$('calib-reset').addEventListener('click', () => {
  latencyMs = 0;
  safeSet('latencyMs', '0');
  renderLatency();
});

// ───────────── input ─────────────
bus.on((event, source) => {
  if (event.type === 'sustain') {
    $('pedal-val').textContent = String(event.value);
    $('pedal').classList.toggle('on', event.down);
    return;
  }
  if (event.type === 'noteOff') {
    pressed.delete(event.note);
    if (source !== 'midi') synth.noteOff(event.note);
    refreshKeys();
    return;
  }
  if (event.type !== 'noteOn') return;

  pressed.add(event.note);
  refreshKeys(); // show the key even when no run is active (tempo mode before Start has no `tempo`)
  if (source !== 'midi') synth.noteOn(event.note); // the piano makes its own sound
  if (calibration) { calibration.taps.push(performance.now()); return; }
  if (listening) return; // the cursor belongs to the playback until it ends

  if (mode === 'wait') {
    const at = score.anchor(); // before the press moves the cursor
    const outcome = session?.press(event.note);
    if (outcome?.result.kind === 'wrong') {
      keyboard.flash('wrong', event.note);
      score.showWrong(event.note, at);
      setFeedback(describeWrongNote(event.note, [...(session?.expected ?? [])]));
    }
    if (outcome?.result.kind === 'correct' || outcome?.result.kind === 'advance') {
      keyboard.flash('hit', event.note);
      score.showRight(event.note, at);
    }
    if (outcome?.result.kind === 'advance') score.clearWrong(); // the cursor moved on: the mistake is behind you
    renderStatus();
    refreshKeys();
    if (outcome?.finished) finishWaitRun(outcome.finished);
  } else if (tempo) {
    const at = score.anchor();
    const stamp = performance.now();
    const r = tempo.run.press(event.note, stamp - latencyMs); // minus the measured setup delay
    logPress(tempo.run, event.note, source, stamp, r);
    if (r.kind === 'hit') {
      keyboard.flash('hit', event.note);
      score.showRight(event.note, at);
    }
    if (r.kind === 'extra') {
      keyboard.flash('wrong', event.note);
      if (r.offsetMs === undefined) score.showWrong(event.note, at); // right note at the wrong time is not a pitch error
      for (const w of r.wanted) keyboard.flash('should', w, 1500);
      setFeedback(
        r.offsetMs !== undefined ? describeOffTime(event.note, r.offsetMs)
          : r.wanted.length ? describeWrongNote(event.note, r.wanted)
          : 'Extra note: nothing was due at that moment.',
      );
    }
    refreshKeys();
  } else if (mode === 'tempo' && current) {
    // Tempo mode before Start: no run, no clock. Check the key against the first notes so you can still see where it sits on the staff.
    const wanted = firstStepNotes();
    debug('idle-press', { note: nm(event.note), wanted: wanted.map(nm), right: wanted.includes(event.note) });
    if (wanted.includes(event.note)) {
      keyboard.flash('hit', event.note);
      score.showRight(event.note);
    } else if (wanted.length) {
      keyboard.flash('wrong', event.note);
      score.showWrong(event.note);
      setFeedback(describeWrongNote(event.note, wanted));
    }
  }
});

let firstStep: { key: string; notes: number[] } | undefined;
/**
 * The notes to play first for the chosen hand(s) and bar range. Looked up once, so the cursor moves to that step on the first key
 * and then stays, which keeps earlier red notes on screen. Starting a run puts the cursor back at the start.
 */
function firstStepNotes(): readonly number[] {
  const key = `${current?.id}|${hands}|${barRange?.from}-${barRange?.to}`;
  if (firstStep?.key !== key) firstStep = { key, notes: [...new Session(activeCursor(), hands).expected] };
  return firstStep.notes;
}

// ───────────── controls ─────────────
$('hands').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-hands]');
  if (!b || b.disabled || !current) return;
  hands = b.dataset.hands as Hands;
  safeSet('hands:' + current.id, hands);
  resetPractice();
});

$('mode').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (!b) return;
  if (sight) void abortSight(true);
  mode = b.dataset.mode as Mode;
  safeSet('mode', mode);
  resetPractice();
});

$('restart').addEventListener('click', () => {
  clearFeedback();
  if (listening) { cancelListen(); resetPractice(); if (mode === 'wait') return; }
  if (mode === 'wait') { session?.restart(); $('result').hidden = true; renderStatus(); refreshKeys(); return; }
  if (tempo) stopTempo(); // restart = stop, then straight into a fresh count-in
  startTempo();
});

$('stop').addEventListener('click', () => { stopTempo(); score.reset(); clearFeedback(); renderStatus(); });

$('showNext').addEventListener('change', refreshKeys);
$('bpm').addEventListener('change', () => { readBpm(); if (current) safeSet('bpm:' + current.id, $<HTMLInputElement>('bpm').value); });

$<HTMLInputElement>('import').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  let xml: string;
  try {
    xml = await readScoreFile(file);
  } catch (err) {
    showResult(`Couldn't open ${file.name}: ${(err as Error).message}`, true);
    return;
  }
  await loadScore(
    { id: 'import:' + file.name, title: file.name, handsAvailable: 'both', targetBpm: 60 },
    xml,
    'both',
  );
  $('piece-meta').textContent = 'imported file';
});

// ───────────── MIDI status ─────────────
bus.onStatus((devices, error) => {
  const el = $('midi-status');
  el.className = 'pill ' + (devices.length ? 'ok' : error ? 'bad' : '');
  el.textContent = devices.length ? `MIDI: ${devices.join(', ')}` : error ? error : 'MIDI: no piano found (keyboard and mouse work)';
});
$('midi-retry').addEventListener('click', () => void bus.connectMidi());

bindThemes($('themes'));
bindTempoDial();
bindComputerKeyboard(bus);
void bus.connectMidi();
bindLibraryFilter();
renderLibrary();
renderControls();
renderLatency();
renderSightLast();
const last = catalog.find((p) => p.id === safeGet('piece')) ?? catalog[0];
if (last) void last.open();
