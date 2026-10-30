import '@fontsource-variable/outfit';
import './style.css';
import { readScoreFile } from './content/mxl';
import { scoreEntries, scoreEntryXml, type ScoreEntry } from './content/scores';
import { positionPieces, techniquePieces } from './content/technique';
import { pieces, pieceXml, STAGE_NAMES, type Piece } from './content/pieces';
import { generateReading, MAX_RUNG, rungOf } from './content/reading';
import { generateSightReading, LEVELS, MAX_LEVEL } from './content/sight-reading';
import { bindComputerKeyboard, InputBus } from './midi/input';
import { noteName } from './midi/parse';
import { endBeat, readPlayback, schedule, soundingAt, soundsOf, stepIndexAt, type PlayStep, type Sound } from './practice/playback';
import { clampRange, isWholePiece, RangedCursor, type BarRange, type RangeCursor } from './practice/range';
import { CALIBRATION_TAPS, clampLatency, estimateLatency, matchTaps } from './practice/calibration';
import { beatUnitOfXml, bpmRange, QUARTER_BEAT, type BeatUnit } from './practice/meter';
import { describeMissed, describeOffTime, describeWrongNote } from './practice/feedback';
import { CLEAN_ACCURACY, CLEAN_RUNS_TO_FINISH, PracticeLog, type Hands, type PieceStatus, type RunRecord } from './practice/log';
import { compareWithHistory, needsPractice, progressOf, runScore, starsFor, verdict } from './practice/scoring';
import { Session, type RunSummary } from './practice/session';
import { describeOutcome, PASS_ACCURACY, recordResult, startTest, type SightState } from './practice/sight-test';
import { TempoRun, type Level, type TempoSummary, type TempoUpdate } from './practice/tempo-mode';
import { handFilter, readTimeline, type TimedStep } from './practice/timeline';
import { accuracy } from './practice/wait-mode';
import { Synth } from './ui/audio';
import { isVoice, VOICES, type VoiceName } from './ui/voices';
import { bindTempoDial } from './ui/dial';
import { KeyboardView } from './ui/keyboard';
import { filterLibrary, isFiltering, NO_FILTER, type LibraryFilter, type SortBy } from './ui/library-filter';
import { ScoreView, type NoteAnchor } from './ui/score';
import { playheadAt, type Spot } from './ui/playhead';
import { bindThemes } from './ui/theme';
import { backupFileName, exportBackup, importBackup, parseBackup } from './storage/backup';
import { course as courseData } from './course/ladder';
import { createCourse } from './course/ui';
import type { StepTarget } from './course/state';
import { readSteps, analyse } from './piece/analysis';
import { createPiece } from './piece/ui';
import { resolveZoom, stepZoom, type ViewId } from './ui/view';

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
  /** Where each step's notes sit on the page (indexed like `steps`), so a hit is marked on its own note even when you are early. */
  anchors: (NoteAnchor | undefined)[];
}

let current: Current | undefined;
let cardScoreShown = false; // a note card has replaced the piece's score on screen
let currentXml = ''; // the MusicXML of `current`, for reading its key signature
let session: Session | undefined; // wait mode
let tempo: TempoState | undefined; // tempo mode, while a run is going
let hands: Hands = 'both';
let level: Level = ((l) => (l === 'intermediate' || l === 'advanced' ? l : 'beginner'))(safeGet('level'));
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
  /** Offered in Piece mode: only the imported scores marked `pieceMode` in library.json. */
  pieceMode?: boolean;
  hands: Hands;
  targetBpm: number;
  open: () => Promise<void>;
}
const stageSection = (stage: number) => ({ section: `Stage ${stage} · ${STAGE_NAMES[stage] ?? ''}`, sectionOrder: stage });
const TECHNIQUE_SECTIONS = {
  positions: { section: 'Technique · Five fingers', sectionOrder: 99 },
  scales: { section: 'Technique · Scales', sectionOrder: 100 },
  arpeggios: { section: 'Technique · Arpeggios', sectionOrder: 101 },
} as const;
const techniqueSection = (group: keyof typeof TECHNIQUE_SECTIONS) => ({ ...TECHNIQUE_SECTIONS[group], collapsed: true });

const catalog: Listed[] = [
  ...pieces.map((p): Listed => ({ id: p.id, title: p.title, composer: p.composer, stage: p.stage, skills: p.skills, technique: false, ...stageSection(p.stage), hands: p.hands, targetBpm: p.targetBpm, open: () => openPiece(p) })),
  ...[...positionPieces, ...techniquePieces].map((p): Listed => ({ id: p.id, title: p.title, composer: p.composer, stage: p.stage, skills: p.skills, technique: true, ...(p.group ? techniqueSection(p.group) : stageSection(p.stage)), hands: p.hands, targetBpm: p.targetBpm, open: () => openPiece(p) })),
  ...scoreEntries.map((e): Listed => ({ id: e.id, title: e.title, composer: e.composer, stage: e.stage, skills: e.skills, difficulty: e.difficulty, technique: false, ...(e.pieceMode ? { pieceMode: true } : {}), ...stageSection(e.stage), hands: e.hands, targetBpm: e.targetBpm, open: () => openScoreEntry(e) })),
];

const catalogById = new Map(catalog.map((i) => [i.id, i] as const));

let filter: LibraryFilter = { ...NO_FILTER };

const openSections = new Set<string>(); // technique sections the player has expanded

function renderLibrary(): void {
  renderProgress(); // every place that changes the log or the piece redraws the list, so the strip follows
  const host = $('library');
  host.replaceChildren();
  const statusOf = new Map(catalog.map((i) => [i.id, log.status(i.id, i.hands, i.targetBpm)] as const));
  const progressById = new Map(catalog.map((i) => [i.id, progressOf(log.forPiece(i.id))] as const));
  const shown = filterLibrary(catalog.map((i) => ({ ...i, status: statusOf.get(i.id)!, score: progressById.get(i.id)!.lastScore })), filter).map((i) => i.id);
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
    const prog = progressById.get(piece.id)!;
    if (prog.lastScore !== undefined) {
      const chip = document.createElement('span');
      chip.className = `score-chip ${toneOf(prog.lastScore)}${needsPractice(prog) ? ' needs' : ''}`;
      chip.textContent = String(prog.lastScore);
      chip.title = `Last ${prog.lastScore} · best ${prog.best} · ${prog.runs} run${prog.runs === 1 ? '' : 's'}${needsPractice(prog) ? ' · keep practising' : ''}`;
      btn.querySelector('.name')!.after(chip);
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
function showResult(text: string, isError = false, retry = false): void {
  const el = $('result');
  el.hidden = false;
  el.className = 'result' + (isError ? ' error' : '');
  el.textContent = text;
  if (retry) el.append(tryAgainRow());
}

/** The button every finished run offers: play the same piece or exercise again, as often as you like. */
function tryAgainRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'result-actions';
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'try-again';
  b.className = 'primary';
  b.textContent = 'Try again';
  b.addEventListener('click', (e) => { e.stopPropagation(); tryAgain(); }); // the card itself closes on a tap in the minimal view
  row.append(b);
  return row;
}

/** Another go at what is open: wait mode starts from the first note, tempo mode from a fresh count-in. Not offered in the test. */
function tryAgain(): void {
  if (!current || sight || listening || calibration) return;
  clearFeedback();
  $('result').hidden = true;
  if (mode === 'wait') { session?.restart(); renderStatus(); refreshKeys(); return; }
  if (tempo) stopTempo();
  startTempo();
}

const starText = (score: number) => '★'.repeat(starsFor(score)) + '☆'.repeat(3 - starsFor(score));
const toneOf = (score: number) => (score >= 90 ? 'good' : score >= 75 ? 'fine' : score >= 50 ? 'warn' : 'bad');

/** The result of a run: a big score with stars and how it compares with earlier runs, then the explanation. */
function showRunResult(text: string, run: RunRecord, earlier: readonly RunRecord[]): void {
  const score = runScore(run);
  const { previous, bestBefore } = compareWithHistory(earlier, run);
  const el = $('result');
  el.hidden = false;
  el.className = 'result';
  const card = document.createElement('div');
  card.className = `score-card ${toneOf(score)}`;
  const el$ = (cls: string, txt: string) => { const e = document.createElement('span'); e.className = cls; e.textContent = txt; return e; };
  const delta = previous === undefined ? 'First run of this kind'
    : score === previous ? 'Same as last time'
    : `${score > previous ? '▲' : '▼'} ${Math.abs(score - previous)} ${score > previous ? 'better' : 'lower'} than last time (${previous})`;
  const best = bestBefore === undefined ? '' : score > bestBefore ? ' · New best!' : ` · Best ${bestBefore}`;
  card.append(
    el$('score-num', String(score)), el$('score-of', '/100'),
    el$('score-stars', starText(score)), el$('score-word', verdict(score)),
    el$('score-delta', delta + best + (run.bars ? ` · bars ${run.bars[0]}–${run.bars[1]}` : '')),
  );
  const p = document.createElement('p');
  p.textContent = text;
  el.replaceChildren(card, tryAgainRow(), p); // the button before the long explanation: on a small screen it must be seen first
}

/** Last, best and a sparkline of the latest scores for the open piece, under its title. */
function renderProgress(): void {
  const el = $('progress');
  if (!current || sight) { el.hidden = true; return; } // test runs are not logged: nothing to show
  const p = progressOf(log.forPiece(current.id));
  el.replaceChildren();
  if (p.lastScore === undefined || p.best === undefined || !p.last) { el.hidden = true; return; } // nothing to say before the first run
  el.hidden = false;
  const bit = (cls: string, html: string) => { const e = document.createElement('span'); e.className = cls; e.innerHTML = html; return e; };
  el.append(
    bit(`progress-last ${toneOf(p.lastScore)}`, `Last <strong>${p.lastScore}</strong> <span class="stars">${starText(p.lastScore)}</span>`),
    bit('progress-best', `Best <strong>${p.best}</strong>`),
    bit('progress-runs', `${p.runs} run${p.runs === 1 ? '' : 's'}${p.last.mode === 'tempo' && p.last.bpm ? ` · last at ${p.last.bpm} bpm` : ''}`),
  );
  if (needsPractice(p)) el.append(bit('progress-flag', 'Keep practising'));
  if (p.recent.length > 1) {
    const W = 84, H = 24, n = p.recent.length;
    const pts = p.recent.map((v, i) => `${(i / (n - 1)) * W},${H - 2 - (v / 100) * (H - 4)}`).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'spark');
    svg.setAttribute('viewBox', `-3 0 ${W + 6} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Scores of the last ${n} runs: ${p.recent.join(', ')}`);
    svg.innerHTML = `<polyline points="${pts}" fill="none" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${W}" cy="${pts.split(' ').at(-1)!.split(',')[1]}" r="2.4"/>`;
    el.append(svg);
  }
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
  currentXml = xml;
  cardScoreShown = false;
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
  $('piece-meta').textContent = '';
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
  $('piece-meta').textContent = entry.notes ?? ''; // composer, stage and source are in the list; only a caveat is worth showing here
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
  for (const b of document.querySelectorAll<HTMLButtonElement>('#level button')) {
    b.setAttribute('aria-pressed', String(b.dataset.level === level));
    b.disabled = !!tempo; // not in the middle of a run
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#mode button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
  score.setActiveHands(hands);
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
    status.innerHTML = `Play <strong>${want}</strong>${stats.steps ? ` · ${stats.steps} done` : ''}${stats.wrong ? ` · <span class="bad">${stats.wrong} wrong</span>` : ''}`;
    return;
  }
  if (!tempo) {
    const beats = current ? Array.from({ length: current.unit.perBar }, (_, i) => i + 1).join(' ') : '';
    status.textContent = current ? `Press Start. Count-in ${beats}, then play.` : '';
  }
}

function finishWaitRun(summary: RunSummary): void {
  if (!current) return;
  const rec: RunRecord = { ...summary, mode: 'wait', pieceId: current.id, at: new Date().toISOString(), ...barsField() };
  const earlier = log.forPiece(current.id);
  log.add(rec);
  const pct = Math.round(accuracy(summary) * 100);
  const secs = Math.max(1, Math.round(summary.durationMs / 1000));
  showRunResult(`${pct}% first try, ${summary.wrong} wrong note${summary.wrong === 1 ? '' : 's'}, ${secs}s. ` +
    (loopOn() ? 'Looping: play it again.' : pct >= 90 ? 'Ready to try Tempo mode.' : 'Press Try again to go again.'), rec, earlier);
  renderLibrary();
  courseCtl.onRun({ pieceId: current.id, mode: 'wait', accuracy: accuracy(summary), sight: false });
  pieceCtl.onRun({ pieceId: current.id, mode: 'wait', accuracy: accuracy(summary), sight: false });
  if (loopOn()) { session?.restart(); renderStatus(); refreshKeys(); }
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
  score.clearMarks(); // the check marks and crosses of the last run

  const bpm = readBpm();
  if (!sight) safeSet('bpm:' + current.id, String(bpm));
  // The player's tempo counts the piece's own beat; the run and the score count quarter notes.
  const { quarters: q, perBar } = current.unit;
  const run = new TempoRun(steps, { bpm: bpm * q, countInBeats: perBar * q, beatQuarters: q, level });
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

  const { spots, anchors } = stepPlaces(cursor, steps);
  tempo = { run, cursor, steps, bpm, cancelClicks, raf: 0, lastRaw: 0, spots, anchors };
  cursor.reset();
  renderControls();
  tick();
}

/** Walk the score once to learn where each step sits on the page. */
function stepPlaces(cursor: RangeCursor, steps: TimedStep[]): { spots: Spot[]; anchors: (NoteAnchor | undefined)[] } {
  const spotsByRaw = new Map<number, Spot>();
  const anchorsByRaw = new Map<number, NoteAnchor>();
  cursor.reset();
  for (let raw = 0; !cursor.done; raw++) {
    const spot = score.spot(cursor.beat());
    const anchor = score.anchor();
    if (spot) spotsByRaw.set(raw, spot);
    if (anchor) anchorsByRaw.set(raw, anchor);
    cursor.next();
  }
  cursor.reset();
  return {
    spots: steps.flatMap((s) => spotsByRaw.get(s.rawIndex) ?? []),
    anchors: steps.map((s) => anchorsByRaw.get(s.rawIndex)),
  };
}

/** What the status line said last, so the page is only touched when its words change (every repaint costs an e-ink screen a flash). */
let lastStatus = '';

function tick(): void {
  if (!tempo || !current) return;
  const now = performance.now() - latencyMs;
  const u = tempo.run.update(now);
  // The minimal view marks the note you are about to play, and moves on the moment you play or miss it: you see your key counted.
  // The clock-driven cursor jumps only when a note is already due, which on a slow screen is too late to be of any use.
  const raw = view === 'minimal' ? tempo.run.upcomingRaw() ?? u.cursorRawIndex : u.cursorRawIndex;
  if (raw !== tempo.lastRaw) {
    tempo.lastRaw = raw;
    tempo.cursor.moveTo(raw);
  }
  if (u.newlyMissed.length) {
    for (const n of u.newlyMissed) keyboard.flash('should', n, 1500);
    setFeedback(describeMissed(u.newlyMissed));
    for (const i of u.newlyMissedSteps) score.markResult(tempo.anchors[i], 'missed');
  }
  // The moving line is smooth on a screen and a smear on e-ink: the minimal view only steps the cursor from note to note.
  if (view === 'full') score.setPlayhead(playheadAt(tempo.spots, Math.max(0, (now - tempo.run.beatZeroAt) / tempo.run.beatMs)));
  refreshKeys();

  const html = tempoStatus(u, now);
  if (html !== lastStatus) { $('status').innerHTML = html; lastStatus = html; }

  if (u.phase === 'done' && u.summary) {
    const summary = u.summary;
    stopTempo();
    finishTempoRun(summary);
    return;
  }
  tempo.raf = requestAnimationFrame(tick);
}

/**
 * The status line of a run, in the words of counting. Count-in: "1 2 3 4", up like the clicks, and the first note is on the click after
 * the last number. Playing: the next note and how many clicks away it is ("in 2"), NOW when it is due; then which note of how many you
 * are on and what has counted.
 */
function tempoStatus(u: TempoUpdate, now: number): string {
  if (!tempo || !current) return '';
  const perBar = current.unit.perBar;
  if (u.phase === 'countin') {
    const n = Math.max(1, Math.min(perBar, perBar - u.countInLeft + 1));
    return `<span class="cue">Count-in <span class="count">${n}</span> of ${perBar}</span><span class="tally">Then play.</span>`;
  }
  const l = tempo.run.live;
  const { step, of } = tempo.run.progress;
  const next = tempo.run.upcoming();
  const b = tempo.run.beatsUntilNext(now);
  const names = $<HTMLInputElement>('showNext').checked && next.length ? ` <strong>${[...next].sort((a, c) => a - c).map(noteName).join(' + ')}</strong>` : '';
  const cue = b === undefined ? ''
    : b <= 0.5 ? `Play${names} <span class="now">NOW</span>`
    : `Next${names} · in ${Math.round(b)}`;
  const tally = `Note ${step} of ${of} · ${l.matched} ✓ · ${l.missed ? `<span class="bad">${l.missed} missed</span>` : '0 missed'}${l.extra ? ` · <span class="bad">${l.extra} extra</span>` : ''}`;
  return `<span class="cue">${cue}</span><span class="tally">${tally}</span>`;
}

function stopTempo(): void {
  lastStatus = '';
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

/** Generated reading pieces already played once in the course (their retries are practice, not counted). */
const readingDone = new Set<string>();

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
  if (current.id.startsWith('sr-')) { // a generated reading piece in the course: shown, counted by the course, never logged
    const pct = Math.round(accuracy(s) * 100);
    const again = readingDone.has(current.id); // the same piece a second time is practice: it does not count towards the step
    readingDone.add(current.id);
    showResult(`${pct}% of the notes in time (${s.missed} missed, ${s.extra} extra), ${describeTiming(s)}.${again ? ' (Practice: this one does not count again.)' : ''}`, false, true);
    renderStatus();
    if (!again) courseCtl.onRun({ pieceId: current.id, mode: 'tempo', accuracy: accuracy(s), sight: true });
    return;
  }
  const rec: RunRecord = {
    pieceId: current.id, at: new Date().toISOString(), hands, mode: 'tempo', bpm: runBpm,
    steps: s.steps, firstTry: s.firstTry, wrong: s.wrong, durationMs: s.durationMs,
    meanAbsOffsetMs: s.meanAbsOffsetMs, biasMs: s.biasMs, score: s.score, level, ...barsField(),
  };
  const earlier = log.forPiece(current.id);
  log.add(rec);
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
  showRunResult(`${runBpm} bpm: ${pct}% of steps in time (${s.missed} missed, ${s.extra} extra), ${describeTiming(s)}.${next}`, rec, earlier);
  safeSet('bpm:' + current.id, $<HTMLInputElement>('bpm').value);
  renderLibrary();
  renderStatus();
  courseCtl.onRun({ pieceId: current.id, mode: 'tempo', accuracy: accuracy(s), sight: false });
  pieceCtl.onRun({ pieceId: current.id, mode: 'tempo', accuracy: accuracy(s), sight: false });
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

function setRange(from: number, to: number, remember = true): void {
  if (!current) return;
  const r = clampRange(from, to, score.measureCount);
  barRange = isWholePiece(r, score.measureCount) ? undefined : r;
  if (remember && !current.id.startsWith('sr-')) safeSet('range:' + current.id, barRange ? `${barRange.from}-${barRange.to}` : '');
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
    if (courseCtl.active) { void abortSight(false).then(() => courseCtl.onTestFinished(st.passedLevel)); return; }
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
  if (courseCtl.active) { void abortSight(false).then(() => courseCtl.onTestAborted()); return; }
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
  const keys = sounds.map((s) => s.midi);
  if (!synth.hasSamples(keys)) { setFeedback('Loading the piano…', 'good'); void synth.preload(keys).then(startListen); return; } // the recorded piano is fetched on first use
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
    $('pedal').hidden = false; // shown once a pedal is heard
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
  if (cardsOn) { // the note cards: the key answers the card; draw it on the card's staff so you can see how far off it was
    if (cardKeyHandler) {
      const right = score.notes().some((n) => n.midi === event.note);
      if (right) score.showRight(event.note); else score.showWrong(event.note);
      cardKeyHandler(event.note);
    }
    return;
  }
  if (calibration) { calibration.taps.push(performance.now()); return; }
  if (listening) return; // the cursor belongs to the playback until it ends

  if (mode === 'wait') {
    const at = score.anchor(); // before the press moves the cursor
    score.clearHeld();
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
    if (outcome?.result.kind === 'advance') {
      score.clearWrong(); // the cursor moved on: the mistake is behind you
      const held = [...new Set(score.heldTies.filter(handFilter(hands)).map((n) => noteName(n.midi)))];
      if (held.length && !outcome.finished) setFeedback(`✓ ${noteName(event.note)} · tied ${held.join(' + ')}: hold it`, 'good');
    }
    renderStatus();
    refreshKeys();
    if (outcome?.finished) finishWaitRun(outcome.finished);
  } else if (tempo) {
    const at = score.anchor();
    const r = tempo.run.press(event.note, performance.now() - latencyMs); // minus the measured setup delay
    if (r.kind === 'hit') {
      keyboard.flash('hit', event.note);
      score.showRight(event.note, tempo.anchors[r.stepIdx] ?? at); // on its own note: the cursor may not have reached it yet
      score.markResult(tempo.anchors[r.stepIdx], 'hit');
      const off = Math.round(r.offsetMs);
      setFeedback(`✓ ${noteName(event.note)} counted${Math.abs(off) <= 80 ? ', on the beat' : `, ${Math.abs(off)} ms ${off > 0 ? 'late' : 'early'}`}`, 'good');
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

// ───────────── sound ─────────────
let voice: VoiceName = ((v) => (isVoice(v) ? v : 'grand'))(safeGet('voice'));
synth.setVoice(voice);
if (voice === 'grand') setTimeout(() => void synth.preload(), 2000); // the recorded piano, after the page has settled
function renderVoice(): void {
  $('voice').textContent = `♪ ${VOICES.find((v) => v.id === voice)!.label}`;
}
$('voice').addEventListener('click', () => {
  voice = VOICES[(VOICES.findIndex((v) => v.id === voice) + 1) % VOICES.length]!.id;
  synth.setVoice(voice);
  if (voice === 'grand') void synth.preload(); // all of it, in the background, so the first chord is already the real piano
  safeSet('voice', voice);
  renderVoice();
  [60, 64, 67].forEach((n, i) => { // a short chord, so the change is heard at once
    setTimeout(() => synth.noteOn(n), i * 110);
    setTimeout(() => synth.noteOff(n), 900);
  });
});
renderVoice();

// ───────────── controls ─────────────
$('hands').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-hands]');
  if (!b || b.disabled || !current) return;
  hands = b.dataset.hands as Hands;
  safeSet('hands:' + current.id, hands);
  resetPractice();
});

$('level').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
  if (!b || b.disabled) return;
  level = b.dataset.level as Level;
  safeSet('level', level);
  renderControls();
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

// ───────────── views ─────────────
/** Full app, or the minimal view for small and e-ink screens: same app and same practice, fewer controls and a paged score. */
let view: ViewId = document.documentElement.dataset.view === 'minimal' ? 'minimal' : 'full';
let zoom = resolveZoom(safeGet('zoom'));

function applyView(next: ViewId, remember: boolean): void {
  view = next;
  const root = document.documentElement;
  root.dataset.view = next;
  root.classList.remove('lib-open');
  $('view-toggle').textContent = next === 'minimal' ? 'Full view' : 'Minimal view';
  if (remember) {
    safeSet('view', next);
    const url = new URL(location.href);
    if (url.searchParams.has('view')) { // the saved choice rules from now on
      url.searchParams.delete('view');
      history.replaceState(null, '', url);
    }
  }
  score.setMinimal(next === 'minimal', zoom);
}

$('view-toggle').addEventListener('click', () => applyView(view === 'minimal' ? 'full' : 'minimal', true));
$('min-pieces').addEventListener('click', () => document.documentElement.classList.add('lib-open'));
$('min-close').addEventListener('click', () => document.documentElement.classList.remove('lib-open'));
$('library').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.item')) document.documentElement.classList.remove('lib-open');
});
for (const [id, dir] of [['zoom-out', -1], ['zoom-in', 1]] as const) {
  $(id).addEventListener('click', () => {
    zoom = stepZoom(zoom, dir);
    safeSet('zoom', String(zoom));
    score.setZoom(zoom);
  });
}
// A tap on the result card puts it away (in the minimal view it covers part of the score).
$('result').addEventListener('click', () => { if (view === 'minimal') $('result').hidden = true; });

// ───────────── course mode ─────────────
let cardsOn = false;
let cardKeyHandler: ((midi: number) => void) | undefined;

const savedMode = (): Mode => ((safeGet('mode') as Mode | null) === 'tempo' ? 'tempo' : 'wait');

/** Cancel whatever is running, so a new step starts from rest. */
function stopEverything(): void {
  cancelLoop();
  cancelListen();
  stopTempo();
  if (sight) void abortSight(false);
  cardsOn = false;
  cardKeyHandler = undefined;
  clearFeedback();
  $('result').hidden = true;
}

/** Open a step's piece with the step's hands and mode, without touching the player's own free-mode settings. */
async function openForStep(t: StepTarget): Promise<void> {
  const item = t.pieceId ? catalogById.get(t.pieceId) : undefined;
  if (!item) throw new Error(`${t.pieceId ?? 'the piece'} is not in this copy of the app`);
  cardsOn = false;
  await item.open();
  if (!current) return;
  if (t.mode === 'wait' || t.mode === 'tempo') mode = t.mode;
  if (t.hands && (current.handsAvailable === 'both' || current.handsAvailable === t.hands)) hands = t.hands;
  if (t.mode === 'tempo' && t.forceTempo && t.tempoShare) {
    $<HTMLInputElement>('bpm').value = String(Math.round((current.targetBpm * t.tempoShare) / 2) * 2);
    readBpm();
  }
  resetPractice();
  renderControls();
}

/** One piece of the reading step: a rung of the reading ladder, so it holds only what the unit has taught by now. */
async function openSight(rung: number): Promise<void> {
  cardsOn = false;
  const spec = rungOf(rung);
  const piece = generateReading(spec.n, Math.floor(Math.random() * 1e9));
  await openPiece(piece);
  mode = 'tempo';
  hands = current?.handsAvailable === 'both' ? 'both' : current?.handsAvailable ?? 'both';
  $<HTMLInputElement>('bpm').value = String(spec.bpm);
  $('piece-title').textContent = `Reading · ${spec.name}`;
  $('piece-meta').textContent = `Rung ${spec.n} of ${MAX_RUNG}`;
  resetPractice();
  renderControls();
}

async function showCard(xml: string): Promise<void> {
  cardsOn = true;
  cardScoreShown = true;
  await score.load(xml, 2.4);
  $('status').textContent = '';
  $('piece-title').textContent = 'Note card';
  $('piece-meta').textContent = 'Play the note you see';
}

function downloadBackup(): void {
  if (!storage) { showResult('This browser does not let the app keep anything, so there is nothing to save.', true); return; }
  const blob = new Blob([JSON.stringify(exportBackup(storage), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = backupFileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function loadBackup(file: File): Promise<string> {
  if (!storage) return 'This browser does not let the app keep anything, so a backup cannot be loaded.';
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return parsed.error;
  const n = importBackup(storage, parsed.backup, 'replace');
  setTimeout(() => location.reload(), 900); // the practice log and the settings were read at start-up
  return `Loaded ${n} saved items from the backup (made ${parsed.backup.exportedAt.slice(0, 10)}). Reloading…`;
}

function setAppLayout(on: boolean): void {
  document.documentElement.dataset.app = on ? 'course' : 'free';
  document.documentElement.classList.remove('lib-open');
  stopEverything();
  if (!on) { // back to free practice: the mode and the piece the player had
    mode = savedMode();
    const before = catalog.find((p) => p.id === safeGet('piece')) ?? catalog[0];
    if (before) void before.open();
  }
}

const courseCtl = createCourse({
  course: courseData,
  now: () => new Date(),
  load: () => safeGet('course:v1'),
  save: (json) => safeSet('course:v1', json),
  info: (id) => { const i = catalogById.get(id); return i && { id: i.id, title: i.title, hands: i.hands, targetBpm: i.targetBpm }; },
  available: (id) => catalogById.has(id),
  finished: (id) => { const i = catalogById.get(id); return !!i && log.status(i.id, i.hands, i.targetBpm) === 'done'; },
  open: openForStep,
  openSight,
  startTest: startSightTest,
  showCard,
  setKeyHandler: (h) => { cardKeyHandler = h; },
  setLayout: setAppLayout,
  stopEverything,
  say: (text, tone) => showResult(text, tone === 'bad'),
  exportBackup: downloadBackup,
  importBackup: loadBackup,
});

// ───────────── piece mode ─────────────
const pieceCtl = createPiece({
  pieces: () => catalog.filter((p) => p.pieceMode).sort((a, b) => a.stage - b.stage || a.title.localeCompare(b.title)).map((p) => ({ id: p.id, title: p.title, composer: p.composer, stage: p.stage })),
  analyze: async (id) => {
    const item = catalogById.get(id);
    if (!item) return undefined;
    await item.open();
    if (current?.id !== id) return undefined;
    const fifths = Number(/<fifths>(-?\d+)<\/fifths>/.exec(currentXml)?.[1] ?? 0);
    return { title: item.title, analysis: analyse(readSteps(score)), flats: fifths < 0 };
  },
  open: async (t) => {
    const item = catalogById.get(t.pieceId);
    if (!item) throw new Error(`${t.pieceId} is not in this copy of the app`);
    cardsOn = false;
    if (cardScoreShown || current?.id !== t.pieceId) await item.open();
    if (!current) return;
    mode = t.mode;
    hands = current.handsAvailable === 'both' || current.handsAvailable === t.hands ? t.hands : current.handsAvailable;
    if (t.bars) setRange(t.bars[0], t.bars[1], false); else setRange(1, score.measureCount, false);
    resetPractice();
    renderControls();
  },
  setMode: (m) => { stopEverything(); mode = m; resetPractice(); renderControls(); },
  showCard,
  setKeyHandler: (h) => { cardKeyHandler = h; },
  setLayout: setAppLayout,
  stopEverything,
  say: (text, tone) => showResult(text, tone === 'bad'),
  load: safeGet,
  save: safeSet,
  now: () => new Date(),
});

type AppMode = 'free' | 'course' | 'piece';
function applyApp(next: AppMode, remember: boolean): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#app-mode button')) b.setAttribute('aria-pressed', String(b.dataset.app === next));
  if (remember) safeSet('app', next);
  if (next !== 'course') courseCtl.hide();
  if (next !== 'piece') pieceCtl.hide();
  if (next === 'course') courseCtl.show();
  if (next === 'piece') pieceCtl.show();
}
$('app-mode').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-app]');
  if (b) applyApp(b.dataset.app as AppMode, true);
});

// ───────────── MIDI status ─────────────
const MIDI_SHORT = { denied: 'MIDI: not allowed', unavailable: 'MIDI: not available', lost: 'MIDI: keyboard lost' } as const;
bus.onStatus((devices, error, problem) => {
  const el = $('midi-status');
  el.className = 'pill ' + (devices.length ? 'ok' : error ? 'bad' : '');
  el.textContent = devices.length ? `MIDI: ${devices.join(', ')}`
    : bus.asking ? 'MIDI: waiting for Allow…'
    : problem ? MIDI_SHORT[problem]
    : bus.virtualOnly ? 'MIDI: no piano (only Midi Through)'
    : 'MIDI: no piano';
  el.title = error ?? '';
  // Whatever you are doing, a lost or refused piano is shown in full, with the button to get it back.
  $('midi-banner').hidden = !problem;
  $('midi-banner-retry').textContent = problem === 'denied' ? 'Allow MIDI' : 'Reconnect';
  el.dataset.ask = devices.length ? '' : 'yes'; // the pill asks again when clicked, as long as there is no piano
  $('midi-banner-text').textContent = error ?? '';
});
$('midi-banner-retry').addEventListener('click', () => void bus.connectMidi());
$('midi-status').addEventListener('click', () => { if ($('midi-status').dataset.ask) void bus.connectMidi(); }); // also the way to ask in the minimal view, which has no Reconnect button

applyView(view, false);
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
applyApp(((a) => (a === 'free' || a === 'piece' ? a : 'course'))(safeGet('app')), false); // the course is the main way in; Free is remembered once chosen
void navigator.storage?.persist?.(); // ask the browser not to clear what the app remembers
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__piano = { course: courseCtl, piece: pieceCtl, bus, log, score }; // for the browser tests, never in the build
