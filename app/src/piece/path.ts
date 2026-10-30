import type { Hands } from '../practice/log';
import { difficultyOf, easierHand, midiName, sections, troubleBars, type Analysis, type Hand, type Section } from './analysis';

/**
 * Piece mode, step 2: the learning path for one piece, built from its analysis. The order follows how teachers break a piece down:
 *
 *   1. Know the notes     only the notes this piece uses, one hand at a time (note cards)
 *   2. First hand         the easier hand, section by section, easiest section first, then all of it
 *   3. Second hand        the same for the other hand
 *   4. Hands together     a bar or two of the easiest part, then its whole section, then the next easiest, and so on
 *   5. Trouble spots      the few bars that stand out as hard, on their own with a bar either side
 *   6. The whole piece    both hands, waiting for you
 *   7. Up to tempo        the metronome, the tempo rises by itself after each clean run
 */
export type PhaseId = 'notes' | 'first' | 'second' | 'together' | 'trouble' | 'whole' | 'tempo';

export const PHASES: Record<PhaseId, { name: string; blurb: string }> = {
  notes: { name: 'Know the notes', blurb: 'Find the notes this piece uses.' },
  first: { name: 'First hand', blurb: 'The easier hand, a section at a time.' },
  second: { name: 'Second hand', blurb: 'The other hand, a section at a time.' },
  together: { name: 'Hands together', blurb: 'Both hands, a bit at a time.' },
  trouble: { name: 'Trouble spots', blurb: 'The hardest bars, alone.' },
  whole: { name: 'The whole piece', blurb: 'Start to finish.' },
  tempo: { name: 'Up to tempo', blurb: 'With the metronome.' },
};

export type TaskKind = 'notes' | 'hand' | 'start' | 'together' | 'trouble' | 'whole' | 'tempo';

export interface Task {
  /** Stable for the same piece and bars, so saved progress survives re-planning. */
  id: string;
  phase: PhaseId;
  kind: TaskKind;
  title: string;
  text: string;
  hands: Hands;
  /** Bars to practise (1-based, inclusive); absent for the whole piece. */
  bars?: [number, number];
  /** How the step opens: `wait` is the notes only, with the music waiting for you. */
  mode: 'cards' | 'wait' | 'tempo';
  /** Counts only from runs with the metronome (the Tempo mode); the notes-only runs before it are free practice. */
  rhythm?: boolean;
  /** Good runs (or right, fast cards) that complete it. */
  goal: number;
  /** A run counts at this share of steps right (and in time, in tempo mode). */
  minAccuracy: number;
  /** For note cards: the hand whose notes they are. */
  cardHand?: Hand;
}

export const CARDS_GOAL = 10;
/** Said on every step that is finished with the rhythm: practise the notes as long as you like, then prove it with the beat. */
const THEN_RHYTHM = ' Notes first, then rhythm.';
const GOOD = 0.9;

export const handName = (h: Hands) => (h === 'rh' ? 'right hand' : h === 'lh' ? 'left hand' : 'both hands');
const barsText = (r: Section) => (r.from === r.to ? `bar ${r.from}` : `bars ${r.from}–${r.to}`);
const idOf = (kind: TaskKind, hands: Hands | Hand, r?: Section) => `${kind}:${hands}${r ? `:${r.from}-${r.to}` : ''}`;
const byDifficulty = (list: readonly Section[], score: (s: Section) => number): Section[] =>
  list.map((s, i) => ({ s, i })).sort((a, b) => score(a.s) - score(b.s) || a.i - b.i).map((x) => x.s);

/** The two-bar window with the least difficulty for both hands: where hands together begins. Prefers windows where both hands play. */
export function easiestWindow(a: Analysis, width = 2): Section {
  const n = a.bars;
  const w = Math.min(width, n);
  let best: { from: number; cost: number } | undefined;
  for (let from = 1; from + w - 1 <= n; from++) {
    const range = { from, to: from + w - 1 };
    const both = a.rh.slice(range.from - 1, range.to).every((b) => b.notes > 0) && a.lh.slice(range.from - 1, range.to).every((b) => b.notes > 0);
    const cost = difficultyOf(a, range, 'both') + (both || !(a.plays.rh && a.plays.lh) ? 0 : 100);
    if (!best || cost < best.cost) best = { from, cost };
  }
  return { from: best?.from ?? 1, to: (best?.from ?? 1) + w - 1 };
}

const within = (inner: Section, outer: Section) => inner.from >= outer.from && inner.to <= outer.to;

export function buildPath(a: Analysis, flats = false): Task[] {
  const parts = sections(a.bars);
  const played = (['rh', 'lh'] as const).filter((h) => a.plays[h]);
  if (!a.bars || !played.length) return [];
  const first = played.length === 2 ? easierHand(a) : played[0]!;
  const second = played.find((h) => h !== first);
  const order = second ? [first, second] : [first];
  const out: Task[] = [];

  for (const h of order) {
    const names = a.order[h].map((m) => midiName(m, flats));
    out.push({
      id: idOf('notes', h), phase: 'notes', kind: 'notes', hands: h, mode: 'cards', goal: CARDS_GOAL, minAccuracy: 1, cardHand: h,
      title: `Notes of the ${handName(h)}`,
      text: `${names.length} notes: ${names.join(' ')}.`,
    });
  }

  order.forEach((h, turn) => {
    const phase: PhaseId = turn === 0 ? 'first' : 'second';
    const easyFirst = byDifficulty(parts, (s) => difficultyOf(a, s, h));
    for (const s of easyFirst) {
      if (a[h].slice(s.from - 1, s.to).every((b) => b.notes === 0)) continue; // nothing to play in this section for this hand
      out.push({
        id: idOf('hand', h, s), phase, kind: 'hand', hands: h, bars: [s.from, s.to], mode: 'wait', rhythm: true, goal: 2, minAccuracy: GOOD,
        title: `${barsText(s)}, ${handName(h)}`,
        text: `Twice without a mistake.${THEN_RHYTHM}`,
      });
    }
    if (parts.length > 1 && second) { // a one-hand piece goes straight to the whole-piece task at the end
      out.push({
        id: idOf('whole', h), phase, kind: 'whole', hands: h, mode: 'wait', rhythm: true, goal: 1, minAccuracy: GOOD,
        title: `All of it, ${handName(h)}`,
        text: `Start to finish.${THEN_RHYTHM}`,
      });
    }
  });

  if (second) {
    const start = easiestWindow(a);
    const home = parts.find((s) => within(start, s)) ?? parts[0]!;
    out.push({
      id: idOf('start', 'both', start), phase: 'together', kind: 'start', hands: 'both', bars: [start.from, start.to], mode: 'wait', rhythm: true, goal: 2, minAccuracy: GOOD,
      title: `${barsText(start)}, hands together`,
      text: `The easiest place to start.${THEN_RHYTHM}`,
    });
    const rest = byDifficulty(parts, (s) => difficultyOf(a, s, 'both'));
    const queue = [home, ...rest.filter((s) => s !== home)];
    for (const s of queue) {
      if (s.from === start.from && s.to === start.to) continue;
      out.push({
        id: idOf('together', 'both', s), phase: 'together', kind: 'together', hands: 'both', bars: [s.from, s.to], mode: 'wait', rhythm: true, goal: 2, minAccuracy: GOOD,
        title: `${barsText(s)}, hands together`,
        text: (s === home ? 'The whole section.' : 'Next easiest.') + THEN_RHYTHM,
      });
    }
  }

  for (const r of mergeTrouble(troubleBars(a), a.bars)) {
    out.push({
      id: idOf('trouble', 'both', r), phase: 'trouble', kind: 'trouble', hands: second ? 'both' : first, bars: [r.from, r.to], mode: 'wait', rhythm: true, goal: 3, minAccuracy: GOOD,
      title: `Trouble spot: ${barsText(r)}`,
      text: `A hard place. Three good runs.${THEN_RHYTHM}`,
    });
  }

  const hands: Hands = second ? 'both' : first;
  out.push({
    id: idOf('whole', hands), phase: 'whole', kind: 'whole', hands, mode: 'wait', rhythm: true, goal: 2, minAccuracy: GOOD,
    title: 'The whole piece',
    text: `Start to finish, twice without a mistake.${THEN_RHYTHM}`,
  });
  out.push({
    id: idOf('tempo', hands), phase: 'tempo', kind: 'tempo', hands, mode: 'tempo', goal: 3, minAccuracy: GOOD,
    title: 'With the metronome',
    text: 'Three clean runs. The tempo rises after each.',
  });
  return dedupe(out);
}

/** Trouble bars become ranges with one bar of context either side; ranges that touch are joined. */
function mergeTrouble(bars: readonly number[], total: number): Section[] {
  const ranges = [...bars].sort((x, y) => x - y).map((b) => ({ from: Math.max(1, b - 1), to: Math.min(total, b + 1) }));
  const out: Section[] = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}

/** The same task twice (a one-section piece asks for its whole piece again) is kept once. */
function dedupe(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  return tasks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}
