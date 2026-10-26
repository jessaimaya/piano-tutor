import type { Hands } from '../practice/log';
import type { Course, Unit } from './ladder';
import { MAX_RUNG } from '../content/reading';
import { nextUnit, placementUnit, rungFor, unitById, course } from './ladder';

/**
 * Where the player is in the course, and what today looks like. Pure functions: every one takes a state and returns a new one,
 * so the whole thing is testable without a browser. main.ts keeps the state in localStorage under `piano-tutor:course:v1`.
 */
export type StepKind = 'warmup' | 'cards' | 'reading' | 'test' | 'newbars' | 'steady' | 'review' | 'play' | 'replay';
export type StepState = 'todo' | 'done' | 'skipped';

export interface StepTarget {
  mode: 'wait' | 'tempo' | 'sight' | 'cards' | 'test';
  /** The piece or exercise to open. */
  pieceId?: string;
  /** Several pieces in turn (the Saturday replay). */
  pieceIds?: string[];
  hands?: Hands;
  /** Starting tempo as a share of the piece's target, used when the piece has no tempo of its own yet. */
  tempoShare?: number;
  /** Use `tempoShare` even if the piece has a tempo saved (the first run with both hands starts slower than the hands alone did). */
  forceTempo?: boolean;
  readingLevel?: number;
}

export interface Step {
  kind: StepKind;
  minutes: number;
  title: string;
  text: string;
  target: StepTarget;
  /** How many finished runs (or cards, or pieces) make the step complete. 0 = it ends when the player says so. */
  goal: number;
  /** The steps a day needs to count for the streak: reading and the main work. */
  core: boolean;
}

export interface TodayPlan {
  date: string;
  minutes: number;
  steps: Step[];
  states: StepState[];
  /** Runs (or cards) counted so far, per step. */
  progress: number[];
  /** Accuracy of each sight-reading piece read today, for adjusting the reading level when the day closes. */
  readingAcc: number[];
  closed: boolean;
}

export interface DayRecord { date: string; minutes: number; done: number; total: number }

export interface CourseState {
  version: 1;
  unitId: string;
  /** Days that counted (their core steps were done). */
  sessions: number;
  /** Days that counted since the player entered the current unit: what the warm-up and the note cards grow with. */
  unitDays: number;
  /** Days each piece has been "today's piece": decides which hand the new-bars step uses. */
  pieceDays: Record<string, number>;
  /** Pieces the player marked done by hand. */
  overrides: string[];
  readingLevel: number;
  /** Days in a row at or above the pass mark; two raise the level. */
  readingPasses: number;
  minutes: number;
  streak: number;
  bestStreak: number;
  lastCompleteDate?: string;
  lastTestDate?: string;
  placement?: { level: number; date: string };
  /** The player chose to start at the beginning instead of taking the placement test. */
  placementSkipped?: boolean;
  /** The last 20 note cards: right, and within the time limit. */
  cards: boolean[];
  /** Per card (`clef:name`): fast, right answers so far, less one for each miss. A card with enough is known and comes up less. */
  cardFast: Record<string, number>;
  days: DayRecord[];
  lastPlayed: Record<string, string>;
  today?: TodayPlan;
}

export const CARD_LIMIT_MS = 2000;
export const CARDS_PER_STEP = 10;
export const CARDS_WINDOW = 20;
export const CARDS_FAST_NEEDED = 18;
export const READING_PASS = 0.8;
export const READING_FAIL = 0.5;
/** The reading level is a rung of the reading ladder (content/reading.ts). */
export const MAX_READING_LEVEL = MAX_RUNG;
export const DAYS_KEPT = 90;
export const MINUTES_OPTIONS = [10, 15, 20, 25, 30, 45] as const;
export const DEFAULT_MINUTES = 25;

export const newState = (unitId = '0.1', minutes = DEFAULT_MINUTES): CourseState => ({
  version: 1, unitId, sessions: 0, unitDays: 0, pieceDays: {}, overrides: [], readingLevel: 1, readingPasses: 0, minutes,
  streak: 0, bestStreak: 0, cards: [], cardFast: {}, days: [], lastPlayed: {},
});

/** Read a saved state; anything unreadable or from a different shape gives a fresh one (the practice log is separate and untouched). */
export function parseState(raw: string | null | undefined, fallbackUnit = '0.1'): CourseState {
  if (!raw) return newState(fallbackUnit);
  try {
    const p = JSON.parse(raw) as Partial<CourseState> | null;
    if (!p || typeof p !== 'object' || p.version !== 1 || typeof p.unitId !== 'string') return newState(fallbackUnit);
    const base = newState(p.unitId);
    return {
      ...base, ...p,
      pieceDays: { ...p.pieceDays }, overrides: Array.isArray(p.overrides) ? p.overrides : [], cards: Array.isArray(p.cards) ? p.cards.slice(-CARDS_WINDOW) : [], cardFast: { ...p.cardFast },
      days: Array.isArray(p.days) ? p.days.slice(-DAYS_KEPT) : [], lastPlayed: { ...p.lastPlayed },
      minutes: (MINUTES_OPTIONS as readonly number[]).includes(p.minutes as number) ? (p.minutes as number) : DEFAULT_MINUTES,
    };
  } catch {
    return newState(fallbackUnit);
  }
}

/** Local calendar date, `YYYY-MM-DD`: a day is the player's day, not UTC's. */
export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** The streak as it stands on `today`: it survives until the end of the day after the last complete one. */
export function currentStreak(state: CourseState, today: string): number {
  if (!state.lastCompleteDate) return 0;
  return daysBetween(state.lastCompleteDate, today) <= 1 ? state.streak : 0;
}

export const isCore = (steps: Step[], i: number): boolean => steps[i]?.core === true;

/** Has anything been done in this plan yet? */
export const touched = (t: TodayPlan): boolean => t.states.some((s) => s !== 'todo') || t.progress.some((p) => p > 0);

/**
 * Begin today's session with these steps. A plan already made for today is kept, so closing the app does not lose your place; it is only
 * replaced when the length was changed before anything was done (a new length otherwise applies from tomorrow).
 */
export function startDay(state: CourseState, steps: Step[], date: string): CourseState {
  const t = state.today;
  // Only a plan you have started is kept. One you have not touched is made again, so it always follows the course as it is now
  // (a plan saved before the course changed would otherwise stay all day).
  if (t && t.date === date && !t.closed && touched(t)) return state;
  return { ...state, today: { date, minutes: state.minutes, steps, states: steps.map(() => 'todo'), progress: steps.map(() => 0), readingAcc: [], closed: false } };
}

/** The step to show: the first one not yet done or skipped at or after `from`, wrapping round; undefined when none is left. */
export function currentStep(today: TodayPlan | undefined, from = 0): number | undefined {
  if (!today) return undefined;
  const n = today.steps.length;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (today.states[i] === 'todo') return i;
  }
  return undefined;
}

const withToday = (state: CourseState, change: (t: TodayPlan) => TodayPlan): CourseState =>
  state.today ? { ...state, today: change(state.today) } : state;

/** Count one run (or card, or piece) towards a step. Returns the state and whether the step has now reached its goal. */
export function countProgress(state: CourseState, index: number, by = 1): { state: CourseState; reached: boolean } {
  const t = state.today;
  const step = t?.steps[index];
  if (!t || !step) return { state, reached: false };
  const progress = t.progress.map((p, i) => (i === index ? p + by : p));
  return {
    state: { ...state, today: { ...t, progress } },
    reached: step.goal > 0 && progress[index]! >= step.goal && t.progress[index]! < step.goal,
  };
}

export function finishStep(state: CourseState, index: number, how: 'done' | 'skipped'): CourseState {
  return withToday(state, (t) => (t.states[index] === 'todo' ? { ...t, states: t.states.map((s, i) => (i === index ? how : s)) } : t));
}

export function noteReading(state: CourseState, accuracy: number): CourseState {
  return withToday(state, (t) => ({ ...t, readingAcc: [...t.readingAcc, accuracy] }));
}

export const noteLastPlayed = (state: CourseState, pieceId: string, date: string): CourseState =>
  ({ ...state, lastPlayed: { ...state.lastPlayed, [pieceId]: date } });

/** A note card: right, and fast enough. Keeps the last 20. */
export function noteCard(state: CourseState, right: boolean, ms: number, key?: string): CourseState {
  const fast = right && ms <= CARD_LIMIT_MS;
  const cardFast = key ? { ...state.cardFast, [key]: Math.max(0, Math.min(9, (state.cardFast[key] ?? 0) + (fast ? 1 : right ? 0 : -1))) } : state.cardFast;
  return { ...state, cards: [...state.cards, fast].slice(-CARDS_WINDOW), cardFast };
}

export const cardsPass = (state: CourseState): boolean =>
  state.cards.length >= CARDS_WINDOW && state.cards.filter(Boolean).length >= CARDS_FAST_NEEDED;

export const coreDone = (t: TodayPlan): boolean => t.steps.every((s, i) => !s.core || t.states[i] === 'done');

/**
 * End the day. If its core steps were done it counts: the streak grows, the pieces' day counters move and the reading level is
 * adjusted by how today's reading went. A day that did not count is just dropped (no penalty beyond the streak not growing).
 */
export function closeDay(state: CourseState, c: Course = course): CourseState {
  const t = state.today;
  if (!t || t.closed) return state;
  const done = t.states.filter((s) => s === 'done').length;
  const record: DayRecord = { date: t.date, minutes: t.minutes, done, total: t.steps.length };
  const days = [...state.days.filter((d) => d.date !== t.date), record].slice(-DAYS_KEPT);
  if (!coreDone(t)) return { ...state, days, today: { ...t, closed: true } };

  const pieceDays = { ...state.pieceDays };
  t.steps.forEach((s, i) => {
    if (s.kind === 'newbars' && s.target.pieceId && t.states[i] === 'done') pieceDays[s.target.pieceId] = (pieceDays[s.target.pieceId] ?? 0) + 1;
  });

  // The rung moves inside the unit's own range: two good days up, a poor day down, never past the unit's last rung.
  const unit = unitById(state.unitId, c);
  const floor = unit?.reading?.from ?? 1;
  const ceil = unit?.reading?.to ?? MAX_READING_LEVEL;
  let readingLevel = unit ? rungFor(unit, state.readingLevel) : state.readingLevel;
  let { readingPasses } = state;
  if (t.readingAcc.length) {
    const mean = t.readingAcc.reduce((a, b) => a + b, 0) / t.readingAcc.length;
    if (mean >= READING_PASS) {
      readingPasses += 1;
      if (readingPasses >= 2 && readingLevel < ceil) { readingLevel += 1; readingPasses = 0; }
    } else if (mean < READING_FAIL && readingLevel > floor) {
      readingLevel -= 1;
      readingPasses = 0;
    } else {
      readingPasses = 0;
    }
  }

  const streak = state.lastCompleteDate === t.date ? state.streak
    : state.lastCompleteDate && daysBetween(state.lastCompleteDate, t.date) === 1 ? state.streak + 1 : 1;
  return {
    ...state, days, pieceDays, readingLevel, readingPasses, streak, bestStreak: Math.max(state.bestStreak, streak),
    lastCompleteDate: t.date, sessions: state.sessions + (state.lastCompleteDate === t.date ? 0 : 1),
    unitDays: state.unitDays + (state.lastCompleteDate === t.date ? 0 : 1), today: { ...t, closed: true },
  };
}

export const markDone = (state: CourseState, pieceId: string): CourseState =>
  state.overrides.includes(pieceId) ? state : { ...state, overrides: [...state.overrides, pieceId] };

export const unmarkDone = (state: CourseState, pieceId: string): CourseState =>
  ({ ...state, overrides: state.overrides.filter((id) => id !== pieceId) });

/** Has the player met the unit's exit? `finished(id)` says whether a piece counts as finished (log status or marked by hand). */
export function unitComplete(unit: Unit, state: CourseState, finished: (id: string) => boolean): boolean {
  return unit.exit.finished.every(finished)
    && (unit.exit.days === undefined || state.unitDays >= unit.exit.days)
    && (unit.exit.readingLevel === undefined || state.readingLevel >= unit.exit.readingLevel)
    && (!unit.exit.cards || cardsPass(state));
}

export interface Advance { state: CourseState; from: string[]; courseDone: boolean }

/** Move on through every unit whose exit is met (a player who finished several pieces early can skip several units). */
export function advance(state: CourseState, c: Course, finished: (id: string) => boolean): Advance {
  const from: string[] = [];
  let unitId = state.unitId;
  for (;;) {
    const unit = c.units.find((u) => u.id === unitId);
    if (!unit || !unitComplete(unit, { ...state, unitId }, finished)) break;
    from.push(unit.id);
    const next = nextUnit(unit.id, c);
    if (!next) return { state: { ...state, unitId }, from, courseDone: true };
    unitId = next.id;
  }
  if (unitId === state.unitId) return { state, from, courseDone: false };
  // A new unit starts reading on its first rung (or where the player already is, if that is further).
  const entered = c.units.find((u) => u.id === unitId);
  const readingLevel = entered?.reading ? Math.max(entered.reading.from, state.readingLevel) : state.readingLevel;
  return { state: { ...state, unitId, readingLevel, readingPasses: 0, unitDays: 0, today: undefined }, from, courseDone: false };
}

/** The sight-reading test (also the placement test) is over: start at the unit its result points to. */
export function applyPlacement(state: CourseState, level: number, date: string, c: Course): CourseState {
  const unitId = placementUnit(level, c);
  const unit = c.units.find((u) => u.id === unitId);
  return {
    ...state, unitId, unitDays: 0, readingLevel: unit?.reading?.from ?? 1, readingPasses: 0, lastTestDate: date,
    placement: { level, date }, today: undefined,
  };
}

export const skipPlacement = (state: CourseState): CourseState => ({ ...state, placementSkipped: true });

/**
 * A later test does not move the unit or the reading rung: the rung follows the lessons (a test passed at a high level must not
 * make the daily reading outrun what the unit has taught). It only records the date, which starts the next four weeks.
 */
export const applyTest = (state: CourseState, _level: number, date: string): CourseState => ({ ...state, lastTestDate: date });
