import type { CursorNote } from '../practice/session';

/**
 * Piece mode, step 1: find out which parts of a score are easy and which are hard, for each hand.
 * Works on the notes the score cursor reports (midi, staff, bar), so it needs no extra parsing of the file.
 * The numbers are only for ranking bars against each other inside one piece; they are not a grade.
 */
export type Hand = 'rh' | 'lh';
export const HANDS: readonly Hand[] = ['rh', 'lh'];

/** One cursor position: the bar it is in (0-based) and the notes sounding there. */
export interface StepNotes {
  measure: number;
  beat: number;
  notes: CursorNote[];
}

/** What the score view offers: a cursor that knows its bar. */
export interface MeasuredSource {
  reset(): void;
  next(): void;
  readonly done: boolean;
  beat(): number;
  measure(): number;
  notes(): CursorNote[];
}

/** Walk the whole score once. Leaves the cursor at the start. */
export function readSteps(cursor: MeasuredSource): StepNotes[] {
  const steps: StepNotes[] = [];
  cursor.reset();
  while (!cursor.done) {
    steps.push({ measure: cursor.measure(), beat: cursor.beat(), notes: cursor.notes() });
    cursor.next();
  }
  cursor.reset();
  return steps;
}

export interface HandBar {
  notes: number;
  /** Steps where this hand plays two notes or more at once. */
  chords: number;
  /** Distinct pitches, low to high. */
  pitches: number[];
  /** Semitones from the lowest to the highest note of the bar. */
  span: number;
  /** Jumps bigger than a fifth, counting the jump into the bar from the one before. */
  leaps: number;
  /** Notes on black keys. */
  black: number;
  difficulty: number;
}

export interface Analysis {
  bars: number;
  rh: HandBar[];
  lh: HandBar[];
  /** Pitches each hand plays, in the order they first appear. */
  order: Record<Hand, number[]>;
  plays: Record<Hand, boolean>;
}

/** How much each thing adds to a bar's difficulty. Rough, but it ranks bars sensibly: a run of fast notes, a jump or a chord costs more than a slow tune in position. */
export const WEIGHT = {
  /** Per note: more notes in a bar is more to read and play. */
  note: 0.5,
  /** Per extra note in a chord. */
  chordNote: 1,
  /** Per jump of more than a fifth. */
  leap: 1.5,
  /** Per semitone a bar spreads beyond a five-finger position (a fifth is 7 semitones): the hand has to move. */
  spread: 0.3,
  /** Per note on a black key. */
  black: 0.5,
} as const;
const FIVE_FINGERS = 7;
const BIG_LEAP = 7;

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (midi: number): boolean => BLACK.has(((midi % 12) + 12) % 12);

const staffOf = (hand: Hand) => (hand === 'rh' ? 0 : 1);

function emptyBar(): HandBar {
  return { notes: 0, chords: 0, pitches: [], span: 0, leaps: 0, black: 0, difficulty: 0 };
}

export function analyse(steps: readonly StepNotes[]): Analysis {
  const bars = steps.reduce((m, s) => Math.max(m, s.measure + 1), 0);
  const out: Analysis = { bars, rh: [], lh: [], order: { rh: [], lh: [] }, plays: { rh: false, lh: false } };
  for (const hand of HANDS) {
    const list: HandBar[] = Array.from({ length: bars }, emptyBar);
    const seen = new Set<number>();
    const sets: Set<number>[] = Array.from({ length: bars }, () => new Set());
    let previousTop: number | undefined;
    for (const step of steps) {
      const mine = step.notes.filter((n) => n.staff === staffOf(hand)).map((n) => n.midi);
      if (!mine.length) continue;
      const bar = list[step.measure]!;
      bar.notes += mine.length;
      if (mine.length > 1) bar.chords++;
      bar.black += mine.filter(isBlack).length;
      const top = Math.max(...mine);
      if (previousTop !== undefined && Math.abs(top - previousTop) > BIG_LEAP) bar.leaps++;
      previousTop = top;
      for (const m of mine) {
        sets[step.measure]!.add(m);
        if (!seen.has(m)) { seen.add(m); out.order[hand].push(m); }
      }
    }
    list.forEach((bar, i) => {
      bar.pitches = [...sets[i]!].sort((a, b) => a - b);
      bar.span = bar.pitches.length ? bar.pitches[bar.pitches.length - 1]! - bar.pitches[0]! : 0;
      const extraChordNotes = Math.max(0, bar.notes - countSteps(steps, i, hand));
      bar.difficulty = round(
        bar.notes * WEIGHT.note + extraChordNotes * WEIGHT.chordNote + bar.leaps * WEIGHT.leap +
        Math.max(0, bar.span - FIVE_FINGERS) * WEIGHT.spread + bar.black * WEIGHT.black,
      );
    });
    out[hand] = list;
    out.plays[hand] = seen.size > 0;
  }
  return out;
}

const round = (x: number) => Math.round(x * 10) / 10;

/** Steps of a bar in which a hand plays anything (a chord counts once). */
function countSteps(steps: readonly StepNotes[], measure: number, hand: Hand): number {
  return steps.filter((s) => s.measure === measure && s.notes.some((n) => n.staff === staffOf(hand))).length;
}

export interface Section {
  from: number;
  to: number;
}

/** Bars per section for a piece of this length: short pieces in small pieces, long ones in larger phrases so the path stays a sensible length. */
export const sectionSize = (bars: number): number => (bars <= 12 ? 2 : bars <= 32 ? 4 : 8);

/** Cut bars 1..total into sections of `size`; a last section of one bar joins the one before it. */
export function sections(total: number, size = sectionSize(total)): Section[] {
  const out: Section[] = [];
  for (let from = 1; from <= total; from += size) out.push({ from, to: Math.min(total, from + size - 1) });
  const last = out[out.length - 1];
  if (out.length > 1 && last && last.from === last.to) {
    out.pop();
    out[out.length - 1]!.to = last.to;
  }
  return out;
}

/** The mean difficulty of bars `from..to` for a hand, or for both added together. */
export function difficultyOf(a: Analysis, range: Section, hand: Hand | 'both'): number {
  const of = (h: Hand) => a[h].slice(range.from - 1, range.to).reduce((s, b) => s + b.difficulty, 0);
  const total = hand === 'both' ? of('rh') + of('lh') : of(hand);
  return round(total / (range.to - range.from + 1));
}

/** The hand to learn first: the one with less difficulty over the whole piece (the right hand when level). */
export function easierHand(a: Analysis): Hand {
  const sum = (h: Hand) => a[h].reduce((s, b) => s + b.difficulty, 0);
  return sum('rh') <= sum('lh') ? 'rh' : 'lh';
}

/** Bars that stand well above the rest of the piece, hardest first: more than one standard deviation over the mean, at most `max`. */
export function troubleBars(a: Analysis, max = 3): number[] {
  const all = Array.from({ length: a.bars }, (_, i) => (a.rh[i]?.difficulty ?? 0) + (a.lh[i]?.difficulty ?? 0));
  if (all.length < 4) return [];
  const mean = all.reduce((s, x) => s + x, 0) / all.length;
  const sd = Math.sqrt(all.reduce((s, x) => s + (x - mean) ** 2, 0) / all.length);
  if (sd < 1) return [];
  return all.map((d, i) => ({ d, bar: i + 1 })).filter((x) => x.d > mean + sd).sort((x, y) => y.d - x.d).slice(0, max).map((x) => x.bar);
}

const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Scientific name (C4 = Middle C); black keys are written with flats in flat keys. */
export function midiName(midi: number, flats = false): string {
  return `${(flats ? NAMES_FLAT : NAMES_SHARP)[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
