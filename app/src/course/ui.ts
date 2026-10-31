import { rungOf } from '../content/reading';
import { cardKey, cardXml, deckFor, drawCard, judgeCard, type Card } from './cards';
import { rungFor, type Course, type Unit } from './ladder';
import { buildDay, supportedMinutes, testDue, type PieceInfo } from './plan';
import {
  advance, applyPlacement, applyTest, CARDS_PER_STEP, closeDay, countProgress, currentStep, currentStreak, dateKey, finishStep, markDone,
  MINUTES_OPTIONS, newState, noteCard, noteLastPlayed, noteReading, parseState, skipPlacement, startDay, touched, unmarkDone,
  type CourseState, type Step, type StepTarget,
} from './state';

/**
 * Course mode on screen: the home page (today's plan, streak, how long you have), and the bar with one dot per step while a session runs.
 * It owns no practice logic: it asks `host` (main.ts) to open pieces, and main.ts tells it when a run has finished.
 */
export interface Host {
  course: Course;
  now: () => Date;
  load: () => string | null;
  save: (json: string) => void;
  info: (id: string) => PieceInfo | undefined;
  /** In this copy of the app (score files are not in git, so some imported pieces can be missing). */
  available: (id: string) => boolean;
  /** Three clean tempo runs at target, by the practice log. */
  finished: (id: string) => boolean;
  /** Open a piece or exercise and set the mode, hands and tempo of the step. */
  open: (target: StepTarget) => Promise<void>;
  openSight: (level: number) => Promise<void>;
  /** Start the sight-reading test; main.ts calls `onTestFinished` or `onTestAborted` when it ends. */
  startTest: () => void;
  showCard: (xml: string) => Promise<void>;
  /** Route piano keys to the cards while set. */
  setKeyHandler: (handler: ((midi: number) => void) | undefined) => void;
  setLayout: (on: boolean) => void;
  /** Cancel a run, a playback or a calibration in progress. */
  stopEverything: () => void;
  say: (text: string, tone?: 'good' | 'bad') => void;
  exportBackup: () => void;
  importBackup: (file: File) => Promise<string>;
}

/** What main.ts reports when a run ends. */
export interface RunInfo {
  pieceId: string;
  mode: 'wait' | 'tempo';
  /** 0–1: the share of steps right first try (wait) or in time (tempo). */
  accuracy: number;
  /** A generated sight-reading piece (not logged). */
  sight: boolean;
}

type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const KIND_LABEL: Record<Step['kind'], string> = {
  warmup: 'Warm-up', cards: 'Cards', reading: 'Reading', test: 'Test', newbars: 'New bars', steady: 'Steady', review: 'Review', play: 'Play', replay: 'Replay',
};
const mm = (n: number) => `${n} min`;

export function createCourse(host: Host) {
  const first = host.course.units[0]?.id ?? '0.1';
  let state: CourseState = parseState(host.load(), first);
  let active = false;
  let view = 0;
  /** A run finished in the current step (so "Next piece" makes sense). */
  let ran = false;
  let placing = false;
  let notice = '';
  let cardsOn: { card: Card; t0: number } | undefined;
  let lastCard: Card | undefined; // the card before this one (`cardsOn` is cleared when it is answered), so the next is never the same note

  const save = () => host.save(JSON.stringify(state));
  const today = () => dateKey(host.now());
  const finished = (id: string) => state.overrides.includes(id) || host.finished(id);

  const unit = (): Unit => {
    const u = host.course.units.find((x) => x.id === state.unitId) ?? host.course.units[0]!;
    const ok = (id: string) => host.available(id);
    return { ...u, main: u.main.filter(ok), warmup: u.warmup.filter(ok), exit: { ...u.exit, finished: u.exit.finished.filter(ok) } };
  };
  /** The pieces of every unit up to this one: the pool for review and replay. */
  const coursePieces = (): string[] => {
    const upTo = host.course.units.findIndex((u) => u.id === state.unitId);
    return host.course.units.slice(0, upTo + 1).flatMap((u) => u.main).filter((id) => host.available(id));
  };
  const steps = (): Step[] => buildDay({
    minutes: state.minutes, date: host.now(), state, unit: unit(), piece: host.info, isFinished: finished,
    coursePieces: coursePieces(), testDue: testDue(state, today()),
  });

  /** Move on through units whose exit is met, keeping a day that was already closed closed. */
  function advanceUnits(): void {
    if (state.today && touched(state.today) && !state.today.closed) return;
    const keep = state.today?.closed ? state.today : undefined;
    const before = state.unitId;
    const a = advance(state, host.course, finished);
    state = keep ? { ...a.state, today: keep } : a.state;
    if (a.from.length) {
      const next = host.course.units.find((u) => u.id === state.unitId);
      notice = a.courseDone
        ? 'You have finished every unit the course has so far (up to Faber Book 1, Unit 13). More music is still to be converted: use Free mode to keep going.'
        : `Unit ${a.from[a.from.length - 1]} is complete. Next: unit ${next?.id}, ${next?.title}.`;
    }
    if (state.unitId !== before || a.from.length) save();
  }

  // ───────────── home ─────────────
  function renderHome(): void {
    document.documentElement.dataset.phase = 'home';
    delete document.documentElement.dataset.step;
    $('course-bar').hidden = true;
    const home = $('course-home');
    home.hidden = false;
    home.replaceChildren();
    advanceUnits();
    const date = today();
    const u = unit();
    const t = state.today;
    const closed = !!t && t.closed && t.date === date && t.states.some((s) => s === 'done');
    const streak = currentStreak(state, date);

    home.append(h('div', { class: 'course-head' },
      h('h2', {}, 'Course'),
      h('span', { class: 'streak', title: `Best streak: ${state.bestStreak}` }, streak ? `🔥 ${streak} ${streak === 1 ? 'day' : 'days'}` : 'No streak yet'),
    ));

    if (notice) { home.append(h('p', { class: 'course-notice' }, notice)); notice = ''; }

    if (!state.placement && !state.placementSkipped && state.sessions === 0 && !t) {
      home.append(
        h('p', {}, 'Where to start? A short sight-reading test finds your level: you read pieces you have never seen, from easy to harder, until reading gets difficult. Or start at the very beginning.'),
        h('div', { class: 'course-actions' },
          h('button', { type: 'button', class: 'primary', id: 'course-test' }, 'Take the test'),
          h('button', { type: 'button', id: 'course-begin' }, 'Start at the beginning'),
        ),
      );
      $('course-test').addEventListener('click', () => { placing = true; void startTest(); });
      $('course-begin').addEventListener('click', () => { state = skipPlacement(state); save(); renderHome(); });
      home.append(dataSection());
      return;
    }

    const doneCount = u.exit.finished.filter(finished).length;
    const progress = u.intro
      ? `Day ${Math.min(state.unitDays + 1, u.exit.days ?? 1)} of ${u.exit.days}: no reading yet, just the hands at the keyboard`
      : `${doneCount} of ${u.exit.finished.length} goal ${u.exit.finished.length === 1 ? 'piece' : 'pieces'} finished · reading: ${rungOf(rungFor(u, state.readingLevel)).name}`;
    home.append(h('p', { class: 'course-unit' },
      h('strong', {}, u.intro ? `Introduction · ${u.id}` : `Stage ${u.stage} · unit ${u.id}`), ` ${u.title}`,
      h('br'), h('span', { class: 'muted' }, progress),
    ));

    home.append(h('div', { class: 'course-minutes' }, h('span', { class: 'muted' }, 'Time today'),
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Minutes today' },
        ...(MINUTES_OPTIONS as readonly number[]).map((m) => h('button', { type: 'button', 'data-min': String(m), 'aria-pressed': String(m === supportedMinutes(state.minutes)) }, String(m))))));
    home.querySelectorAll<HTMLButtonElement>('[data-min]').forEach((b) => b.addEventListener('click', () => {
      state = { ...state, minutes: Number(b.dataset.min) };
      if (state.today && !touched(state.today)) state = { ...state, today: undefined };
      save();
      renderHome();
    }));

    const started = !!state.today && state.today.date === date && (touched(state.today) || state.today.closed);
    const plan = started ? state.today!.steps : steps();
    home.append(h('ol', { class: 'course-plan' }, ...plan.map((s, i) => {
      const st = started ? state.today!.states[i] : 'todo';
      return h('li', { 'data-state': st ?? 'todo' }, h('span', { class: 'plan-name' }, KIND_LABEL[s.kind]), ` ${s.title.includes(': ') ? s.title.split(': ').slice(1).join(': ') : ''}`, h('span', { class: 'muted' }, ` ${mm(s.minutes)}`));
    })));

    if (closed) {
      home.append(
        h('p', { class: 'course-done' }, `Done for today ✓ ${streak ? `${streak}-day streak. ` : ''}See you tomorrow.`),
        h('div', { class: 'course-actions' }, h('button', { type: 'button', id: 'course-more' }, 'Practise more today')),
      );
      $('course-more').addEventListener('click', () => { state = { ...state, today: undefined }; startSession(); });
    } else {
      const underway = !!state.today && state.today.date === date && !state.today.closed && touched(state.today);
      const n = underway ? state.today!.states.filter((s) => s === 'done').length : 0;
      home.append(h('div', { class: 'course-actions' },
        h('button', { type: 'button', class: 'primary', id: 'course-start' }, underway ? `Continue (${n} of ${plan.length} done)` : 'Start today’s session')));
      $('course-start').addEventListener('click', startSession);
    }
    home.append(moreSection(u), dataSection());
  }

  /** Less common actions, kept out of the way: mark a piece done, take the test, change nothing else. */
  function moreSection(u: Unit): HTMLElement {
    const open = u.main.find((id) => !finished(id));
    const box = h('details', { class: 'course-more' }, h('summary', {}, 'More'));
    const row = h('div', { class: 'course-actions' });
    if (open) {
      const info = host.info(open);
      const b = h('button', { type: 'button' }, `Mark “${info?.title ?? open}” as finished`);
      b.addEventListener('click', () => { state = markDone(state, open); save(); renderHome(); });
      row.append(b);
    }
    const marked = u.main.filter((id) => state.overrides.includes(id));
    for (const id of marked) {
      const b = h('button', { type: 'button' }, `Undo finished: ${host.info(id)?.title ?? id}`);
      b.addEventListener('click', () => { state = unmarkDone(state, id); save(); renderHome(); });
      row.append(b);
    }
    const again = h('button', { type: 'button', id: 'course-replan' }, 'Plan today again');
    again.addEventListener('click', () => {
      const t = state.today;
      if (t && touched(t) && !t.closed && again.dataset.sure !== 'yes') { again.dataset.sure = 'yes'; again.textContent = 'Plan again and drop what you did today? Click again'; return; }
      state = { ...state, today: undefined };
      save();
      renderHome();
    });
    row.append(again);
    const firstUnit = host.course.units[0];
    if (firstUnit?.intro && state.unitId !== firstUnit.id) {
      const back = h('button', { type: 'button', id: 'course-intro' }, 'Go back to the introduction week');
      back.addEventListener('click', () => {
        if (back.dataset.sure !== 'yes') { back.dataset.sure = 'yes'; back.textContent = 'Go back to day 1 of the introduction week? Click again (your pieces stay finished)'; return; }
        state = { ...state, unitId: firstUnit.id, unitDays: 0, readingPasses: 0, today: undefined };
        save();
        renderHome();
      });
      row.append(back);
    }
    const test = h('button', { type: 'button' }, 'Take the sight-reading test');
    test.addEventListener('click', () => { placing = !state.placement; void startTest(); });
    row.append(test);
    const over = h('button', { type: 'button', id: 'course-reset' }, 'Start the course over');
    over.addEventListener('click', () => {
      if (over.dataset.sure !== 'yes') { over.dataset.sure = 'yes'; over.textContent = 'Really start over? Click again (the practice log stays)'; return; }
      state = newState(first);
      save();
      renderHome();
    });
    row.append(over);
    box.append(row);
    return box;
  }

  function dataSection(): HTMLElement {
    const box = h('details', { class: 'course-more' }, h('summary', {}, 'Backup'));
    const note = h('p', { class: 'muted' }, 'Everything is kept in this browser. A backup file keeps your progress safe and moves it between devices.');
    const out = h('button', { type: 'button' }, 'Save a backup file');
    out.addEventListener('click', () => host.exportBackup());
    const label = h('label', { class: 'import' }, 'Load a backup file', h('input', { type: 'file', accept: '.json,application/json' }));
    label.querySelector('input')!.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await host.importBackup(file);
      state = parseState(host.load(), first);
      host.say(text, text.startsWith('Loaded') ? 'good' : 'bad');
      renderHome();
    });
    box.append(note, h('div', { class: 'course-actions' }, out), label);
    return box;
  }

  // ───────────── the session ─────────────
  function startSession(): void {
    const date = today();
    state = startDay(state, steps(), date);
    save();
    view = currentStep(state.today) ?? 0;
    void enterStep(view);
  }

  async function startTest(): Promise<void> {
    host.stopEverything();
    $('course-home').hidden = true;
    renderBarFor('test');
    host.startTest();
  }

  async function enterStep(i: number): Promise<void> {
    const t = state.today;
    const step = t?.steps[i];
    if (!t || !step) { renderHome(); return; }
    view = i;
    ran = false;
    host.stopEverything();
    host.setKeyHandler(undefined);
    cardsOn = undefined;
    $('course-home').hidden = true;
    renderBar();
    try {
      if (step.target.mode === 'cards') await nextCard();
      else if (step.target.mode === 'test') { placing = false; host.startTest(); }
      else if (step.target.mode === 'sight') await host.openSight(step.target.readingLevel ?? state.readingLevel);
      else if (step.kind === 'replay') await host.open({ ...step.target, pieceId: step.target.pieceIds?.[Math.min(t.progress[i] ?? 0, (step.target.pieceIds?.length ?? 1) - 1)] });
      else await host.open(step.target);
    } catch (err) {
      host.say(`Could not open this step: ${(err as Error).message}`, 'bad');
    }
  }

  function renderDots(): HTMLElement {
    const t = state.today!;
    return h('div', { class: 'dots', role: 'list' }, ...t.steps.map((s, i) => {
      const st = i === view ? 'current' : t.states[i]!;
      const done = t.states[i] === 'done';
      const b = h('button', { type: 'button', class: 'dot', role: 'listitem', 'data-state': st, 'data-done': String(done), 'aria-label': `Step ${i + 1}: ${KIND_LABEL[s.kind]}, ${t.states[i] === 'todo' ? 'to do' : t.states[i]}${i === view ? ', current' : ''}`, title: `${KIND_LABEL[s.kind]} · ${mm(s.minutes)}` });
      b.addEventListener('click', () => { if (t.states[i] !== 'done') void enterStep(i); });
      return b;
    }));
  }

  function renderBar(): void {
    const t = state.today;
    const bar = $('course-bar');
    if (!t) { renderHome(); return; }
    const step = t.steps[view]!;
    document.documentElement.dataset.phase = 'session';
    document.documentElement.dataset.step = step.kind;
    bar.hidden = false;
    const complete = t.states[view] === 'done';
    const goal = step.goal;
    const have = t.progress[view] ?? 0;
    const more = ran && !complete && (step.target.mode === 'sight' || step.kind === 'replay');
    const last = t.states.every((s, i) => i === view || s !== 'todo');

    const primary = h('button', { type: 'button', class: 'primary', id: 'course-primary' },
      more ? 'Next piece →' : complete ? (last ? 'Finish the day ✓' : 'Next →') : 'Skip step');
    if (!complete && !more) primary.classList.remove('primary');
    primary.addEventListener('click', () => {
      if (more) { void enterStep(view); return; }
      advanceFrom(complete ? 'done' : 'skipped');
    });

    bar.replaceChildren(
      h('div', { class: 'course-top' }, renderDots(), h('span', { class: 'streak' }, `${KIND_LABEL[step.kind]} · ${mm(step.minutes)}`),
        h('button', { type: 'button', id: 'course-menu', title: 'Back to the course page' }, 'Menu')),
      h('h2', { id: 'course-step-title' }, step.title),
      h('p', { id: 'course-step-text' }, step.text, goal > 0 ? h('span', { class: 'muted' }, ` ${Math.min(have, goal)} of ${goal}${complete ? ' ✓' : ''}`) : null),
      h('p', { id: 'course-msg', class: 'course-msg', 'aria-live': 'polite' }),
      h('div', { class: 'course-actions' }, primary),
    );
    $('course-menu').addEventListener('click', () => { host.stopEverything(); host.setKeyHandler(undefined); renderHome(); });
  }

  /** The bar before a day exists (the placement test): just a title and a way out. */
  function renderBarFor(kind: 'test'): void {
    document.documentElement.dataset.phase = 'session';
    document.documentElement.dataset.step = 'test';
    const bar = $('course-bar');
    bar.hidden = false;
    bar.replaceChildren(
      h('div', { class: 'course-top' }, h('span', { class: 'streak' }, kind === 'test' ? 'Sight-reading test' : ''), h('button', { type: 'button', id: 'course-menu' }, 'Menu')),
      h('p', { id: 'course-msg', class: 'course-msg', 'aria-live': 'polite' }),
    );
    $('course-menu').addEventListener('click', () => { host.stopEverything(); renderHome(); });
  }

  const msg = (text: string) => { const el = document.getElementById('course-msg'); if (el) el.textContent = text; };

  function advanceFrom(how: 'done' | 'skipped'): void {
    state = finishStep(state, view, how);
    host.stopEverything();
    host.setKeyHandler(undefined);
    const next = currentStep(state.today, view + 1);
    if (next === undefined) {
      state = closeDay(state);
      advanceUnits();
      save();
      renderHome();
      return;
    }
    save();
    void enterStep(next);
  }

  // ───────────── what main.ts reports ─────────────
  function matches(step: Step, r: RunInfo, progress: number): boolean {
    const id = step.target.pieceId;
    switch (step.kind) {
      case 'reading': return r.sight;
      case 'newbars': return r.mode === 'wait' && r.pieceId === id;
      case 'replay': return r.mode === 'tempo' && r.pieceId === step.target.pieceIds?.[progress];
      case 'play': return r.pieceId === id;
      case 'steady': case 'warmup': case 'review': return r.mode === 'tempo' && r.pieceId === id;
      default: return false;
    }
  }

  function onRun(r: RunInfo): void {
    const plan = state.today;
    if (!active || !plan || plan.closed) return;
    const idx = view;
    const step = plan.steps[idx];
    if (!step) return;
    if (!r.sight) state = noteLastPlayed(state, r.pieceId, today());
    const wasFinished = !r.sight && finished(r.pieceId);
    if (matches(step, r, plan.progress[idx] ?? 0)) {
      ran = true;
      if (r.sight) state = noteReading(state, r.accuracy);
      const c = countProgress(state, idx);
      state = c.state;
      if (c.reached) {
        state = finishStep(state, idx, 'done');
        msg('Step complete.');
      }
    }
    if (!r.sight && !wasFinished && finished(r.pieceId)) msg(`${host.info(r.pieceId)?.title ?? 'The piece'} is finished: three clean runs at its target tempo. 🎉`);
    save();
    renderBar();
  }

  function onTestFinished(level: number): void {
    const date = today();
    if (placing || !state.placement) {
      state = applyPlacement(state, level, date, host.course);
      notice = level === 0
        ? 'Starting at the beginning: that is a normal place to start.'
        : `You read level ${level}: starting at unit ${state.unitId}, ${host.course.units.find((u) => u.id === state.unitId)?.title}.`;
      placing = false;
      save();
      renderHome();
      return;
    }
    state = applyTest(state, level, date);
    const t = state.today;
    if (t) {
      const idx = t.steps.findIndex((s) => s.kind === 'test');
      if (idx >= 0) {
        state = finishStep(state, idx, 'done');
        view = idx;
        save();
        notice = 'Test done. Your reading follows the lessons: it starts each unit easy and climbs as you read well.';
        advanceFrom('done');
        return;
      }
    }
    notice = 'Test done. Your reading follows the lessons: it starts each unit easy and climbs as you read well.';
    save();
    renderHome();
  }

  function onTestAborted(): void {
    placing = false;
    renderHome();
  }

  // ───────────── note cards ─────────────
  async function nextCard(): Promise<void> {
    const t = state.today;
    if (!t) return;
    const done = t.states[view] === 'done';
    if (done) { host.setKeyHandler(undefined); return; }
    const card = drawCard(Math.random, deckFor(host.course, state.unitId, state.unitDays), lastCard, state.cardFast);
    lastCard = card;
    await host.showCard(cardXml(card));
    cardsOn = { card, t0: performance.now() };
    msg(`Card ${(t.progress[view] ?? 0) + 1} of ${CARDS_PER_STEP}: play the note.`);
    host.setKeyHandler(onCardKey);
  }

  function onCardKey(midi: number): void {
    if (!cardsOn || !active) return;
    const { card, t0 } = cardsOn;
    const ms = performance.now() - t0;
    cardsOn = undefined;
    host.setKeyHandler(undefined);
    const j = judgeCard(card, midi, ms);
    state = noteCard(state, j.right, ms, cardKey(card));
    const c = countProgress(state, view);
    state = c.state;
    if (c.reached) state = finishStep(state, view, 'done');
    save();
    renderBar();
    msg(j.right ? (j.fast ? `✓ ${(ms / 1000).toFixed(1)} s` : `✓ right, but ${(ms / 1000).toFixed(1)} s: aim for under 2`) : `✗ it was ${card.name}`);
    if (!c.reached) setTimeout(() => { if (active && state.today?.steps[view]?.target.mode === 'cards') void nextCard(); }, j.right ? 600 : 1200);
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
      host.setKeyHandler(undefined);
      host.setLayout(false);
      $('course').hidden = true;
      delete document.documentElement.dataset.phase; // free practice has no course page: its layout rules must not apply
      delete document.documentElement.dataset.step;
    },
    onRun, onTestFinished, onTestAborted,
    get active(): boolean { return active; },
    /** After a backup was loaded behind the course's back. */
    reload(): void { state = parseState(host.load(), first); if (active) renderHome(); },
    /** For tests and the console: the state as it stands. */
    snapshot: (): CourseState => state,
    reset(): void { state = newState(first); save(); if (active) renderHome(); },
  };
}

export type CourseController = ReturnType<typeof createCourse>;
