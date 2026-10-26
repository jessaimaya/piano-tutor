import type { Hands } from '../practice/log';
import { rungOf } from '../content/reading';
import { rungFor, type Unit } from './ladder';
import { CARDS_PER_STEP, MINUTES_OPTIONS, type CourseState, type Step, type StepKind, type StepTarget } from './state';

/**
 * Builds one day of the course: which steps, how long each, which piece and which hand. Pure: the app gives it the course state, the
 * unit, and ways to look up a piece, and gets a list of steps back (12-lesson-ladder.md is the design this follows).
 */
export interface PieceInfo { id: string; title: string; hands: Hands; targetBpm: number }

export interface PlanInput {
  minutes: number;
  /** The player's calendar date; its weekday decides Saturday. */
  date: Date;
  state: CourseState;
  unit: Unit;
  piece: (id: string) => PieceInfo | undefined;
  /** Finished by three clean runs, or marked done by hand. */
  isFinished: (id: string) => boolean;
  /** Every piece of the units up to and including this one: the pool the review and replay steps draw from. */
  coursePieces: string[];
  /** True when the last test is four weeks old: the reading step becomes the sight-reading test. */
  testDue: boolean;
}

type Slot = readonly [StepKind, number];

/** The dots of a day by length. Skipping the warm-up is fine, skipping reading is not (05-practice-routine.md), so reading stays longest. */
export const SLOTS: Record<number, readonly Slot[]> = {
  10: [['reading', 3], ['newbars', 5], ['play', 2]],
  15: [['reading', 4], ['newbars', 5], ['steady', 4], ['play', 2]],
  20: [['warmup', 2], ['reading', 4], ['newbars', 5], ['steady', 5], ['play', 4]],
  25: [['warmup', 3], ['reading', 5], ['newbars', 6], ['steady', 6], ['review', 3], ['play', 2]],
  30: [['warmup', 4], ['reading', 6], ['newbars', 8], ['steady', 7], ['review', 3], ['play', 2]],
  45: [['warmup', 4], ['reading', 6], ['newbars', 8], ['steady', 7], ['newbars', 8], ['steady', 7], ['review', 3], ['play', 2]],
};

/** An introduction day has no reading step: its minutes go to the new exercise instead. */
export function introSlots(slots: readonly Slot[]): readonly Slot[] {
  const reading = slots.filter(([k]) => k === 'reading').reduce((a, [, m]) => a + m, 0);
  const kept = slots.filter(([k]) => k !== 'reading');
  const at = kept.findIndex(([k]) => k === 'newbars');
  return kept.map(([k, m], i): Slot => [k, i === at ? m + reading : m]);
}

/** The nearest supported length at or below `minutes` (at least 10). */
export function supportedMinutes(minutes: number): number {
  const opts = MINUTES_OPTIONS as readonly number[];
  return [...opts].reverse().find((m) => m <= minutes) ?? opts[0]!;
}

/** Which hand and mode a piece uses on its n-th day as today's piece: right hand, left hand, both slowly, then both. */
export function handsForDay(day: number, pieceHands: Hands): { hands: Hands; both: boolean; first: boolean } {
  if (pieceHands !== 'both') return { hands: pieceHands, both: false, first: day === 1 };
  if (day === 1) return { hands: 'rh', both: false, first: true };
  if (day === 2) return { hands: 'lh', both: false, first: false };
  return { hands: 'both', both: true, first: day === 3 };
}

/** The warm-up's hands on its n-th day: the unit's list in turn, both hands when it gives none. */
export function warmupHands(unit: Unit, turn: number): Hands {
  const list = unit.warmupHands?.length ? unit.warmupHands : (['both'] as Hands[]);
  return list[turn % list.length]!;
}

/** Warm-up days spent on each exercise of a unit before the next, harder one. */
export const WARMUP_DAYS_PER_STEP = 2;

/** The exercise of the n-th warm-up day of a unit: the list climbs (easiest first), or goes round when the unit says so. */
export function warmupExercise(unit: Unit, turn: number): string | undefined {
  const list = unit.warmup;
  if (!list.length) return undefined;
  return unit.warmupRotate ? list[turn % list.length] : list[Math.min(list.length - 1, Math.floor(turn / WARMUP_DAYS_PER_STEP))];
}

const handName = (h: Hands) => (h === 'rh' ? 'right hand' : h === 'lh' ? 'left hand' : 'both hands');

/** The pieces to review, longest unplayed first (never played comes before played). */
export function reviewPool(input: PlanInput, exclude: readonly string[]): string[] {
  const done = input.coursePieces.filter((id) => input.isFinished(id) && !exclude.includes(id));
  return done.sort((a, b) => (input.state.lastPlayed[a] ?? '').localeCompare(input.state.lastPlayed[b] ?? ''));
}

function pieceOf(input: PlanInput, id: string): PieceInfo {
  return input.piece(id) ?? { id, title: id, hands: 'both', targetBpm: 60 };
}

export function buildDay(input: PlanInput): Step[] {
  const { unit, state } = input;
  const minutes = supportedMinutes(input.minutes);
  const slots = unit.intro ? introSlots(SLOTS[minutes]!) : SLOTS[minutes]!;
  const day = state.unitDays; // days that counted in this unit: the warm-up and the note cards grow with it

  const open = unit.main.filter((id) => !input.isFinished(id));
  const todayId = open[0] ?? unit.main[unit.main.length - 1]!;
  const secondId = open.find((id) => id !== todayId);
  const exclude = [todayId, ...(secondId ? [secondId] : [])];
  const pool = reviewPool(input, exclude);
  const hasReview = slots.some(([k]) => k === 'review');

  const readingLevel = rungFor(unit, state.readingLevel); // the player's rung, kept inside what this unit has taught
  const saturday = input.date.getDay() === 6;

  /** An introduction unit fixes the hands (right, then left, then both); other units go right, left, both slowly, then both. */
  const handsOf = (id: string, d: number, pieceHands: Hands) =>
    unit.hands && pieceHands === 'both' ? { hands: unit.hands, both: unit.hands === 'both', first: d === 1 } : handsForDay(d, pieceHands);

  const newBarsFor = (id: string, minutesLeft: number): Step[] => {
    const info = pieceOf(input, id);
    const d = (state.pieceDays[id] ?? 0) + 1;
    const h = handsOf(id, d, info.hands);
    const listen = h.first && d === 1 ? 'Press Listen first and follow the score once. ' : '';
    const tempoText = h.both && h.first ? ' Start at half tempo.' : '';
    return [
      {
        kind: 'newbars', minutes: minutesLeft, core: true, goal: 1,
        title: `New bars: ${info.title}`,
        text: `${listen}Play it with the ${handName(h.hands)}, wait mode: the score waits for you.${tempoText} Take the hard bars slowly, one hand at a time.`,
        target: { mode: 'wait', pieceId: id, hands: h.hands },
      },
    ];
  };
  const steadyFor = (id: string, mins: number): Step => {
    const info = pieceOf(input, id);
    const d = (state.pieceDays[id] ?? 0) + 1;
    const h = handsOf(id, d, info.hands);
    const target: StepTarget = { mode: 'tempo', pieceId: id, hands: h.hands, tempoShare: h.both && h.first ? 0.5 : 0.7, forceTempo: h.both && h.first };
    return {
      kind: 'steady', minutes: mins, core: false, goal: 2,
      title: `Make it steady: ${info.title}`,
      text: 'Tempo mode: a count-in, then the score keeps time. After a clean run the tempo goes up four beats per minute. Stop raising it when runs stop being clean.',
      target,
    };
  };

  const steps: Step[] = [];
  let newbarsIndex = 0;
  const mainMinutes = slots.filter(([k]) => k === 'newbars' || k === 'steady').reduce((a, [, m]) => a + m, 0);
  let replayed = false;

  for (const [kind, mins] of slots) {
    if ((kind === 'newbars' || kind === 'steady') && saturday && input.coursePieces.some((id) => input.isFinished(id))) {
      if (!replayed) {
        const ids = reviewPool(input, []).slice(0, 6);
        steps.push({
          kind: 'replay', minutes: mainMinutes, core: true, goal: ids.length,
          title: 'Saturday: replay your pieces',
          text: `Play each finished piece once, start to finish, in tempo mode. ${ids.length} ${ids.length === 1 ? 'piece' : 'pieces'} today.`,
          target: { mode: 'tempo', pieceId: ids[0], pieceIds: ids },
        });
        replayed = true;
      }
      continue;
    }
    switch (kind) {
      case 'warmup': {
        const stage0 = unit.stage === 0 && !unit.intro; // an introduction has no note cards: reading the staff comes after it
        if (stage0 && day % 2 === 1) { // the first day is the five fingers; the cards come on the second
          steps.push({
            kind: 'cards', minutes: mins, core: false, goal: CARDS_PER_STEP,
            title: 'Note cards',
            text: 'A note appears on the staff. Play it on the piano: under two seconds counts as fast. Ten cards.',
            target: { mode: 'cards' },
          });
        } else {
          const turn = stage0 ? Math.floor(day / 2) : day; // stage 0 has the cards on every other day, so its warm-up days are the even ones
          const id = warmupExercise(unit, turn) ?? todayId;
          const info = pieceOf(input, id);
          const hands = info.hands === 'both' ? warmupHands(unit, turn) : info.hands; // a scale for one hand stays one hand
          steps.push({
            kind: 'warmup', minutes: mins, core: false, goal: 1,
            title: `Warm-up: ${info.title.replace(/^Five fingers: /, '')}`,
            text: `Slow and even, ${handName(hands)}, fingers curved, wrists loose. One clean run is enough.${unit.tip ? ` ${unit.tip}` : ''}`,
            target: { mode: 'tempo', pieceId: id, hands, tempoShare: 0.7 },
          });
        }
        break;
      }
      case 'reading':
        steps.push(input.testDue
          ? { kind: 'test', minutes: mins, core: true, goal: 1, title: 'Sight-reading test', text: 'Four weeks since the last one. Read pieces you have never seen, from easy to harder, until reading gets difficult. It sets your reading level.', target: { mode: 'test' } }
          : { kind: 'reading', minutes: mins, core: true, goal: 2, title: `Reading: ${rungOf(readingLevel).name}`, text: 'Two new pieces. Play each once without stopping, count out loud, and let mistakes go.', target: { mode: 'sight', readingLevel } });
        break;
      case 'newbars': {
        const id = newbarsIndex === 0 ? todayId : secondId;
        newbarsIndex += 1;
        if (id) steps.push(...newBarsFor(id, mins));
        break;
      }
      case 'steady': {
        const id = newbarsIndex <= 1 ? todayId : secondId;
        if (id) steps.push(steadyFor(id, mins));
        break;
      }
      case 'review': {
        // Nothing finished yet: the warm-up exercise, in the warm-up's hands, is the thing you know best.
        const id = pool[0] ?? fallbackReview(input, todayId);
        const info = pieceOf(input, id);
        const hands = pool[0] || id !== unit.warmup[0] ? info.hands : warmupHands(unit, day);
        steps.push({ kind: 'review', minutes: mins, core: false, goal: 1, title: `Review: ${info.title}`, text: 'Something you already know, start to finish, tempo mode. Keep the pulse even.', target: { mode: 'tempo', pieceId: id, hands } });
        break;
      }
      case 'play': {
        // Without a review step the play step takes the oldest finished piece; otherwise the next one, or the unit's last piece.
        const finishedId = hasReview ? pool[1] : pool[0];
        const id = finishedId ?? todayId;
        const info = pieceOf(input, id);
        // A piece you have not finished is played with the hand it is on today, never the whole piece at once.
        const hands = finishedId ? info.hands : handsOf(todayId, (state.pieceDays[todayId] ?? 0) + 1, info.hands).hands;
        steps.push({ kind: 'play', minutes: mins, core: false, goal: 1, title: `Play: ${info.title}`, text: 'For the music. Play it the way you like it: no scoring pressure, take your time.', target: { mode: 'tempo', pieceId: id, hands } });
        break;
      }
      default:
        break;
    }
  }
  return steps;
}

/** With nothing finished yet: the piece most recently played that is not today's, else another piece of the unit, else today's. */
function fallbackReview(input: PlanInput, todayId: string): string {
  const played = input.coursePieces.filter((id) => id !== todayId && input.state.lastPlayed[id]);
  played.sort((a, b) => (input.state.lastPlayed[b] ?? '').localeCompare(input.state.lastPlayed[a] ?? ''));
  return played[0] ?? input.unit.warmup[0] ?? todayId;
}

/** Four weeks since the last sight-reading test (or placement). A player who has never taken one is asked at the start, not here. */
export function testDue(state: CourseState, today: string): boolean {
  if (!state.lastTestDate) return false;
  const a = state.lastTestDate, b = today;
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000) >= 28;
}
