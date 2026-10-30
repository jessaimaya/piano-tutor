import { cardKey, cardXml, drawCard, judgeCard, type Card } from '../course/cards';
import type { Hands } from '../practice/log';
import { difficultyOf, HANDS, midiName, sections, type Analysis } from './analysis';
import { buildPath, handName, PHASES, type PhaseId, type Task } from './path';
import {
  completion, currentTask, have, isComplete, isSkipped, newPieceState, noteCard, noteRun, parsePieceState, redoTask, skipTask, type PieceState,
} from './state';

/**
 * Piece mode on screen: pick a piece, see which parts are easy and hard, then work down its learning path one task at a time.
 * It shares the course's page area and look (#course-home, #course-bar). It owns no practice logic: `host` (main.ts) opens the
 * piece with the task's hands, bars and mode, and tells this controller when a run ends.
 */
export interface PieceChoice { id: string; title: string; stage: number }

export interface Loaded {
  title: string;
  analysis: Analysis;
  /** The key signature uses flats, so black-key notes are named with them. */
  flats: boolean;
}

export interface Host {
  pieces: () => PieceChoice[];
  /** Open the piece and read its notes. */
  analyze: (id: string) => Promise<Loaded | undefined>;
  open: (t: { pieceId: string; hands: Hands; bars?: [number, number]; mode: 'wait' | 'tempo' }) => Promise<void>;
  showCard: (xml: string) => Promise<void>;
  setKeyHandler: (handler: ((midi: number) => void) | undefined) => void;
  setLayout: (on: boolean) => void;
  stopEverything: () => void;
  say: (text: string, tone?: 'good' | 'bad') => void;
  load: (key: string) => string | null;
  save: (key: string, json: string) => void;
  now: () => Date;
}

export interface PieceRun { pieceId: string; mode: 'wait' | 'tempo'; accuracy: number; sight: boolean }

type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stateKey = (id: string) => `piece:v1:${id}`;
const LAST = 'piece:last';
const BLOCKS = '▁▂▃▄▅▆▇█';

/** One block character per section, tall for hard, scaled against the hardest section of either hand. */
function difficultyStrip(a: Analysis, hand: 'rh' | 'lh', max: number): string {
  return sections(a.bars).map((s) => BLOCKS[Math.min(BLOCKS.length - 1, Math.round((difficultyOf(a, s, hand) / (max || 1)) * (BLOCKS.length - 1)))]!).join('');
}

export function createPiece(host: Host) {
  let active = false;
  let loaded: (Loaded & { id: string; tasks: Task[]; state: PieceState }) | undefined;
  let running: Task | undefined;
  let cardsOn: { card: Card; t0: number } | undefined;
  let busy = false;

  const save = () => { if (loaded) host.save(stateKey(loaded.id), JSON.stringify(loaded.state)); };

  // ───────────── home: choose a piece ─────────────
  function renderHome(): void {
    document.documentElement.dataset.phase = 'home';
    delete document.documentElement.dataset.step;
    $('course-bar').hidden = true;
    const home = $('course-home');
    home.hidden = false;
    home.replaceChildren();
    const choices = host.pieces();
    const lastId = host.load(LAST) ?? '';
    const select = h('select', { id: 'piece-pick', 'aria-label': 'Piece to learn' },
      ...choices.map((c) => h('option', { value: c.id }, `${c.title} · stage ${c.stage}`)));
    select.value = choices.some((c) => c.id === lastId) ? lastId : choices[0]?.id ?? '';
    const go = h('button', { type: 'button', class: 'primary', id: 'piece-go' }, 'Plan this piece');
    go.addEventListener('click', () => void openPiece(select.value));

    home.append(
      h('div', { class: 'course-head' }, h('h2', {}, 'Learn one piece')),
      h('p', {}, 'Pick a piece. The app finds its easy and hard parts, then takes you through it in small steps: the notes first, one hand at a time, a few bars with both hands, and finally the whole piece up to tempo.'),
      h('div', { class: 'course-actions' }, select, go),
    );
    const started = choices.filter((c) => host.load(stateKey(c.id))).map((c) => ({ c, s: parsePieceState(host.load(stateKey(c.id)), c.id) }))
      .filter(({ s }) => Object.keys(s.progress).length || s.skipped.length).sort((x, y) => y.s.updatedAt.localeCompare(x.s.updatedAt));
    if (started.length) {
      home.append(h('p', { class: 'muted' }, 'Pieces you have started'),
        h('div', { class: 'course-actions' }, ...started.map(({ c }) => {
          const b = h('button', { type: 'button' }, c.title);
          b.addEventListener('click', () => void openPiece(c.id));
          return b;
        })));
    }
  }

  async function openPiece(id: string): Promise<void> {
    if (busy || !id) return;
    busy = true;
    host.say('Reading the piece…');
    try {
      const info = await host.analyze(id);
      if (!info || !info.analysis.bars) { host.say('Could not read the notes of that piece.', 'bad'); return; }
      const tasks = buildPath(info.analysis, info.flats);
      loaded = { ...info, id, tasks, state: parsePieceState(host.load(stateKey(id)), id, host.now()) };
      host.save(LAST, id);
      renderMap();
    } finally {
      busy = false;
    }
  }

  // ───────────── the piece map ─────────────
  function renderMap(): void {
    if (!loaded) { renderHome(); return; }
    host.stopEverything();
    host.setKeyHandler(undefined);
    document.documentElement.dataset.phase = 'home';
    $('course-bar').hidden = true;
    const home = $('course-home');
    home.hidden = false;
    home.replaceChildren();
    const { analysis: a, tasks, state, title } = loaded;
    const now = currentTask(state, tasks);
    const parts = sections(a.bars);
    const max = Math.max(1, ...HANDS.flatMap((hd) => parts.map((s) => difficultyOf(a, s, hd))));

    home.append(h('div', { class: 'course-head' }, h('h2', {}, title),
      h('span', { class: 'streak' }, `${Math.round(completion(state, tasks) * 100)}% of the path`)));

    const rows = HANDS.filter((hd) => a.plays[hd]).map((hd) =>
      h('div', { class: 'piece-strip' }, h('span', { class: 'muted' }, hd === 'rh' ? 'Right hand ' : 'Left hand '), h('span', { class: 'strip-blocks', 'aria-hidden': 'true' }, difficultyStrip(a, hd, max))));
    const hardest = parts.map((s) => ({ s, d: difficultyOf(a, s, 'both') })).sort((x, y) => y.d - x.d)[0];
    const easiest = parts.map((s) => ({ s, d: difficultyOf(a, s, 'both') })).sort((x, y) => x.d - y.d)[0];
    const bars = (s: { from: number; to: number }) => (s.from === s.to ? `bar ${s.from}` : `bars ${s.from}–${s.to}`);
    home.append(
      h('p', { class: 'muted' }, `${a.bars} bars in ${parts.length} sections. Each block below is one section, in score order; taller means harder.`),
      ...rows,
      ...(parts.length > 1 && easiest && hardest ? [h('p', {}, `Easiest: ${bars(easiest.s)}. Hardest: ${bars(hardest.s)}. `,
        a.plays.rh && a.plays.lh ? `Start with the ${handName(tasks.find((t) => t.phase === 'first' && t.kind === 'hand')?.hands ?? 'rh')}.` : '')] : []),
    );

    const list = h('ol', { class: 'course-plan' });
    let phase: PhaseId | undefined;
    for (const t of tasks) {
      if (t.phase !== phase) {
        phase = t.phase;
        list.append(h('li', { class: 'piece-phase' }, h('strong', {}, PHASES[phase].name), h('span', { class: 'muted' }, ` ${PHASES[phase].blurb}`)));
      }
      const st = isComplete(state, t) ? 'done' : isSkipped(state, t) ? 'skipped' : 'todo';
      const li = h('li', { 'data-state': st, ...(t === now ? { 'aria-current': 'step' } : {}) }, t.title, h('span', { class: 'muted' }, ` ${have(state, t)}/${t.goal}`));
      li.value = tasks.indexOf(t) + 1;
      list.append(li);
    }
    const go = h('button', { type: 'button', class: 'primary', id: 'piece-continue' },
      !now ? 'Practise again from the start' : Object.keys(state.progress).length ? 'Continue' : 'Start');
    go.addEventListener('click', () => {
      if (now) { void enterTask(now); return; }
      for (const t of tasks) loaded!.state = redoTask(loaded!.state, t);
      save();
      renderMap();
    });
    const back = h('button', { type: 'button', id: 'piece-back' }, 'Other pieces');
    back.addEventListener('click', () => renderHome());
    home.append(h('div', { class: 'course-actions' }, go, back), list);
    if (!now) home.append(h('p', { class: 'course-done' }, 'The whole path is done ✓'));

    const reset = h('button', { type: 'button' }, 'Start this piece over');
    reset.addEventListener('click', () => {
      if (reset.dataset.sure !== 'yes') { reset.dataset.sure = 'yes'; reset.textContent = 'Really start over? Click again (the practice log stays)'; return; }
      loaded!.state = newPieceState(loaded!.id, host.now());
      save();
      renderMap();
    });
    home.append(h('details', { class: 'course-more' }, h('summary', {}, 'More'), h('div', { class: 'course-actions' }, reset)));
  }

  // ───────────── a task ─────────────
  async function enterTask(t: Task): Promise<void> {
    if (!loaded) return;
    running = t;
    cardsOn = undefined;
    host.stopEverything();
    host.setKeyHandler(undefined);
    $('course-home').hidden = true;
    renderBar();
    try {
      if (t.mode === 'cards') await nextCard();
      else await host.open({ pieceId: loaded.id, hands: t.hands, ...(t.bars ? { bars: t.bars } : {}), mode: t.mode });
    } catch (err) {
      host.say(`Could not open this step: ${(err as Error).message}`, 'bad');
    }
  }

  const msg = (text: string) => { const el = document.getElementById('course-msg'); if (el) el.textContent = text; };

  function renderBar(): void {
    if (!loaded || !running) { renderMap(); return; }
    const { tasks, state } = loaded;
    const t = running;
    const complete = isComplete(state, t);
    const i = tasks.indexOf(t);
    document.documentElement.dataset.phase = 'session';
    document.documentElement.dataset.step = t.mode === 'cards' ? 'cards' : 'newbars';
    const bar = $('course-bar');
    bar.hidden = false;
    const next = tasks.find((x, j) => j > i && !isComplete(state, x) && !isSkipped(state, x));
    const primary = h('button', { type: 'button', class: complete ? 'primary' : '', id: 'course-primary' }, complete ? (next ? 'Next →' : 'Finish ✓') : 'Skip');
    primary.addEventListener('click', () => {
      if (!complete) { loaded!.state = skipTask(loaded!.state, t, host.now()); save(); }
      host.stopEverything();
      host.setKeyHandler(undefined);
      if (next) void enterTask(next); else { running = undefined; renderMap(); }
    });
    bar.replaceChildren(
      h('div', { class: 'course-top' }, h('span', { class: 'streak' }, `${PHASES[t.phase].name} · ${i + 1} of ${tasks.length}`),
        h('button', { type: 'button', id: 'course-menu', title: 'Back to the piece map' }, 'Map')),
      h('h2', { id: 'course-step-title' }, t.title),
      h('p', { id: 'course-step-text' }, t.text, h('span', { class: 'muted' }, ` ${have(state, t)} of ${t.goal}${complete ? ' ✓' : ''}`)),
      h('p', { id: 'course-msg', class: 'course-msg', 'aria-live': 'polite' }),
      h('div', { class: 'course-actions' }, primary),
    );
    $('course-menu').addEventListener('click', () => { host.stopEverything(); host.setKeyHandler(undefined); running = undefined; renderMap(); });
  }

  // ───────────── what main.ts reports ─────────────
  function onRun(r: PieceRun): void {
    if (!active || !loaded || !running || r.sight || running.mode === 'cards') return;
    if (r.pieceId !== loaded.id || r.mode !== running.mode) return;
    const before = have(loaded.state, running);
    loaded.state = noteRun(loaded.state, running, r.accuracy, host.now());
    const counted = have(loaded.state, running) > before;
    save();
    renderBar();
    const done = isComplete(loaded.state, running);
    msg(done ? 'Step complete. 🎉' : counted ? 'Good run. Again.' : `Not quite: ${Math.round(r.accuracy * 100)}%. A good run is ${Math.round(running.minAccuracy * 100)}% or better.`);
  }

  // ───────────── note cards, limited to this piece ─────────────
  function deck(t: Task): Card[] {
    if (!loaded || !t.cardHand) return [];
    return loaded.analysis.order[t.cardHand].map((midi) => ({ clef: t.cardHand === 'rh' ? 'treble' : 'bass', name: midiName(midi, loaded!.flats), midi }));
  }

  async function nextCard(): Promise<void> {
    if (!loaded || !running || isComplete(loaded.state, running)) { host.setKeyHandler(undefined); return; }
    const cards = deck(running);
    if (!cards.length) return;
    const card = drawCard(Math.random, cards, cardsOn?.card, loaded.state.cardFast);
    await host.showCard(cardXml(card));
    cardsOn = { card, t0: performance.now() };
    msg('Play the note you see.');
    host.setKeyHandler(onCardKey);
  }

  function onCardKey(midi: number): void {
    if (!active || !cardsOn || !loaded || !running) return;
    const { card, t0 } = cardsOn;
    const ms = performance.now() - t0;
    cardsOn = undefined;
    host.setKeyHandler(undefined);
    const j = judgeCard(card, midi, ms);
    loaded.state = noteCard(loaded.state, running, cardKey(card), j.right, j.fast, host.now());
    save();
    const task = running;
    renderBar();
    msg(j.right ? (j.fast ? `✓ ${(ms / 1000).toFixed(1)} s` : `✓ right, but ${(ms / 1000).toFixed(1)} s: aim for under 2`) : `✗ it was ${card.name}`);
    if (!isComplete(loaded.state, task)) setTimeout(() => { if (active && running === task) void nextCard(); }, j.right ? 600 : 1200);
  }

  return {
    show(): void {
      active = true;
      host.setLayout(true);
      $('course').hidden = false;
      if (loaded) renderMap(); else renderHome();
    },
    hide(): void {
      active = false;
      running = undefined;
      host.setKeyHandler(undefined);
      host.setLayout(false);
      $('course').hidden = true;
    },
    onRun,
    get active(): boolean { return active; },
    /** For tests and the console. */
    snapshot: () => loaded && { id: loaded.id, state: loaded.state, tasks: loaded.tasks },
  };
}

export type PieceController = ReturnType<typeof createPiece>;
