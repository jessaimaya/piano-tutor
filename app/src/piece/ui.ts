import { cardKey, cardXml, drawCard, judgeCard, type Card } from '../course/cards';
import type { Hands } from '../practice/log';
import { midiName, type Analysis } from './analysis';
import { buildPath, type Task } from './path';
import {
  currentTask, have, isComplete, isSettled, isSkipped, noteCard, noteRun, parsePieceState, redoTask, skipTask, type PieceState,
} from './state';

/**
 * Piece mode on screen: the pieces grouped by artist; picking one goes straight to practising its learning path, at the step you
 * were on. The path itself is never shown, only a row of dots for how far along it you are.
 * It shares the course's page area and look (#course-home, #course-bar). It owns no practice logic: `host` (main.ts) opens the
 * piece with the task's hands, bars and mode, and tells this controller when a run ends.
 */
export interface PieceChoice { id: string; title: string; composer: string; stage: number }

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
  /** Switch the open step between the notes only and the metronome, keeping its hands and bars. */
  setMode: (mode: 'wait' | 'tempo') => void;
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

export function createPiece(host: Host) {
  let active = false;
  let loaded: (Loaded & { id: string; tasks: Task[]; state: PieceState }) | undefined;
  let running: Task | undefined;
  let cardsOn: { card: Card; t0: number; missed?: boolean } | undefined;
  let rhythm = false; // the running step is being played with the metronome (steps that finish with the rhythm open on the notes only)
  let lastCard: Card | undefined; // the card before this one (`cardsOn` is cleared when it is answered), so the next is never the same note
  let busy = false;

  const save = () => { if (loaded) host.save(stateKey(loaded.id), JSON.stringify(loaded.state)); };

  // ───────────── home: the pieces, grouped by artist ─────────────
  function renderHome(): void {
    document.documentElement.dataset.phase = 'home';
    delete document.documentElement.dataset.step;
    running = undefined;
    host.stopEverything();
    host.setKeyHandler(undefined);
    $('course-bar').hidden = true;
    const home = $('course-home');
    home.hidden = false;
    home.replaceChildren();
    const byArtist = new Map<string, PieceChoice[]>();
    for (const c of host.pieces()) byArtist.set(c.composer, [...(byArtist.get(c.composer) ?? []), c]);
    for (const [artist, list] of [...byArtist].sort(([x], [y]) => x.localeCompare(y))) {
      home.append(
        h('h3', { class: 'piece-artist' }, artist),
        h('div', { class: 'course-actions' }, ...list.map((c) => {
          const b = h('button', { type: 'button', class: 'piece-pick', 'data-piece': c.id }, c.title);
          b.addEventListener('click', () => void openPiece(c.id));
          return b;
        })),
      );
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
      renderPractice();
    } finally {
      busy = false;
    }
  }

  // ───────────── straight to practising ─────────────
  /** There is no plan screen: opening a piece, or finishing a step, goes to the next step that is not done. */
  function renderPractice(): void {
    if (!loaded) { renderHome(); return; }
    const now = currentTask(loaded.state, loaded.tasks);
    if (now) { void enterTask(now); return; }
    renderDone();
  }

  /** The whole path is done: say so, and offer to go again. */
  function renderDone(): void {
    if (!loaded) return;
    running = undefined;
    host.stopEverything();
    host.setKeyHandler(undefined);
    document.documentElement.dataset.phase = 'home';
    $('course-bar').hidden = true;
    const home = $('course-home');
    home.hidden = false;
    home.replaceChildren();
    const again = h('button', { type: 'button', class: 'primary', id: 'piece-continue' }, 'Practise again');
    again.addEventListener('click', () => {
      for (const t of loaded!.tasks) loaded!.state = redoTask(loaded!.state, t);
      save();
      renderPractice();
    });
    const others = h('button', { type: 'button', id: 'piece-back' }, 'Pieces');
    others.addEventListener('click', () => renderHome());
    home.append(h('h2', {}, loaded.title), h('p', { class: 'course-done' }, 'Done ✓'), h('div', { class: 'course-actions' }, again, others));
  }

  // ───────────── a task ─────────────
  async function enterTask(t: Task): Promise<void> {
    if (!loaded) return;
    running = t;
    cardsOn = undefined;
    lastCard = undefined;
    rhythm = false;
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
    if (!loaded || !running) { renderPractice(); return; }
    const { tasks, state } = loaded;
    const t = running;
    const complete = isComplete(state, t);
    const i = tasks.indexOf(t);
    document.documentElement.dataset.phase = 'session';
    document.documentElement.dataset.step = t.mode === 'cards' ? 'cards' : 'newbars';
    const bar = $('course-bar');
    bar.hidden = false;
    const go = (to: Task | undefined) => {
      host.stopEverything();
      host.setKeyHandler(undefined);
      if (to) void enterTask(to); else renderPractice();
    };
    // Skip goes on to the next step that is still open; once a step is done, Next simply goes to the one after it, so you can walk through them all.
    const next = complete ? tasks[i + 1] : tasks.find((x, j) => j > i && !isSettled(state, x));
    const primary = h('button', { type: 'button', class: complete ? 'primary' : '', id: 'course-primary' }, complete ? (next ? 'Next →' : 'Finish ✓') : 'Skip');
    primary.addEventListener('click', () => {
      if (!complete) { loaded!.state = skipTask(loaded!.state, t, host.now()); save(); }
      go(next);
    });
    const back = i > 0 ? h('button', { type: 'button', id: 'piece-back-step' }, '← Back') : null;
    back?.addEventListener('click', () => go(tasks[i - 1]));
    const dots = h('span', { class: 'piece-dots', 'aria-label': `Step ${i + 1} of ${tasks.length}` },
      ...tasks.map((x) => {
        const dot = h('i', { role: 'button', tabindex: '0', 'data-state': x === t ? 'now' : isComplete(state, x) ? 'done' : isSkipped(state, x) ? 'skipped' : 'todo', title: x.title });
        dot.addEventListener('click', () => { if (x !== t) go(x); });
        dot.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && x !== t) { e.preventDefault(); go(x); } });
        return dot;
      }));
    const rhythmBtn = t.rhythm ? h('button', { type: 'button', id: 'piece-rhythm', 'aria-pressed': String(rhythm) }, rhythm ? 'Notes only' : 'Play with rhythm') : null;
    rhythmBtn?.addEventListener('click', () => {
      rhythm = !rhythm;
      host.setMode(rhythm ? 'tempo' : 'wait');
      renderBar();
      msg(rhythm ? 'With rhythm: this counts.' : 'Notes only: does not count.');
    });
    bar.replaceChildren(
      h('div', { class: 'course-top' }, dots, h('button', { type: 'button', id: 'course-menu', title: 'Back to the pieces' }, 'Pieces')),
      h('h2', { id: 'course-step-title' }, t.title),
      h('p', { id: 'course-step-text' }, t.text, h('span', { class: 'muted' }, ` ${have(state, t)} of ${t.goal}${complete ? ' ✓' : ''}`)),
      h('p', { id: 'course-msg', class: 'course-msg', 'aria-live': 'polite' }),
      h('div', { class: 'course-actions' }, ...(back ? [back] : []), ...(rhythmBtn ? [rhythmBtn] : []), primary),
    );
    document.getElementById('course-menu')?.addEventListener('click', () => { host.stopEverything(); host.setKeyHandler(undefined); running = undefined; renderHome(); });
  }

  // ───────────── what main.ts reports ─────────────
  function onRun(r: PieceRun): void {
    if (!active || !loaded || !running || r.sight || running.mode === 'cards') return;
    if (r.pieceId !== loaded.id) return;
    if (running.rhythm && r.mode !== 'tempo') { // the notes only: free practice, it does not count
      if (r.accuracy >= running.minAccuracy) msg('Notes good. Now with rhythm.');
      return;
    }
    if (!running.rhythm && r.mode !== running.mode) return;
    const before = have(loaded.state, running);
    loaded.state = noteRun(loaded.state, running, r.accuracy, host.now());
    const counted = have(loaded.state, running) > before;
    save();
    renderBar();
    const done = isComplete(loaded.state, running);
    msg(done ? 'Step complete. 🎉' : counted ? 'Good run. Again.' : `${Math.round(r.accuracy * 100)}%. Need ${Math.round(running.minAccuracy * 100)}%.`);
  }

  // ───────────── note cards, limited to this piece ─────────────
  function deck(t: Task): Card[] {
    if (!loaded || !t.cardHand) return [];
    return loaded.analysis.order[t.cardHand].map((midi) => ({ clef: t.cardHand === 'rh' ? 'treble' : 'bass', name: midiName(midi, loaded!.flats), midi }));
  }

  async function nextCard(): Promise<void> {
    if (!loaded || !running) { host.setKeyHandler(undefined); return; } // cards go on after the step is done: free practice
    const cards = deck(running);
    if (!cards.length) return;
    const card = drawCard(Math.random, cards, lastCard, loaded.state.cardFast);
    lastCard = card;
    await host.showCard(cardXml(card));
    cardsOn = { card, t0: performance.now() };
    msg('Play the note you see.');
    host.setKeyHandler(onCardKey);
  }

  function onCardKey(midi: number): void {
    if (!active || !cardsOn || !loaded || !running) return;
    const { card, t0 } = cardsOn;
    const ms = performance.now() - t0;
    const j = judgeCard(card, midi, ms);
    const task = running;
    if (!j.right) { // stay on this card until it is played right; the miss counts once
      if (!cardsOn.missed) {
        cardsOn.missed = true;
        loaded.state = noteCard(loaded.state, task, cardKey(card), false, false, host.now());
        save();
        renderBar();
      }
      msg(`✗ ${midiName(midi, loaded.flats)}. Find ${card.name}.`);
      return;
    }
    const missed = cardsOn.missed;
    cardsOn = undefined;
    host.setKeyHandler(undefined);
    if (!missed) { // a card corrected after a miss earns nothing: the miss is already on record
      loaded.state = noteCard(loaded.state, task, cardKey(card), true, j.fast, host.now());
      save();
      renderBar();
    }
    if (isComplete(loaded.state, task)) { // the goal is met: stop dealing cards, the bar now offers Next
      cardsOn = undefined;
      msg('Step complete. 🎉 Tap Next.');
      return;
    }
    msg(missed ? `✓ ${card.name}` : j.fast ? `✓ ${(ms / 1000).toFixed(1)} s` : `✓ ${(ms / 1000).toFixed(1)} s (aim for under 2)`);
    setTimeout(() => { if (active && running === task) void nextCard(); }, 600);
  }

  return {
    show(): void {
      active = true;
      host.setLayout(true);
      $('course').hidden = false;
      renderHome();
    },
    hide(): void {
      active = false;
      running = undefined;
      host.setKeyHandler(undefined);
      host.setLayout(false);
      $('course').hidden = true;
      delete document.documentElement.dataset.phase; // free practice has no course page: its layout rules must not apply
      delete document.documentElement.dataset.step;
    },
    onRun,
    get active(): boolean { return active; },
    /** For tests and the console. */
    snapshot: () => loaded && { id: loaded.id, state: loaded.state, tasks: loaded.tasks },
  };
}

export type PieceController = ReturnType<typeof createPiece>;
