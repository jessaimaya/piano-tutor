import type { Piece } from './pieces';

/**
 * Generated sight-reading pieces, seven levels from "five notes under the right hand" to "hands together in five keys".
 * Every piece is made fresh from a seed, so it is always unseen. Written into the same compact notation as the lessons
 * (see notation.ts), which refuses any bar that does not add up, so a wrong rhythm cannot slip through.
 *
 * Levels follow the course: 1–2 ≈ stages 0–1, 3 ≈ stage 2, 4–5 ≈ stage 3, 6–7 ≈ stage 4 (Grade 1–2 reading).
 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

interface Key {
  name: string;
  fifths: number;
  /** Letter of the tonic. */
  tonic: (typeof LETTERS)[number];
  /** Accidentals the key signature puts on letters. */
  acc: Partial<Record<(typeof LETTERS)[number], '#' | 'b'>>;
}
const KEYS: Record<string, Key> = {
  C: { name: 'C', fifths: 0, tonic: 'C', acc: {} },
  G: { name: 'G', fifths: 1, tonic: 'G', acc: { F: '#' } },
  F: { name: 'F', fifths: -1, tonic: 'F', acc: { B: 'b' } },
  D: { name: 'D', fifths: 2, tonic: 'D', acc: { F: '#', C: '#' } },
  Bb: { name: 'B♭', fifths: -2, tonic: 'B', acc: { B: 'b', E: 'b' } },
};

/** Note name for scale degree `degree` (0 = tonic, 7 = the tonic an octave up) with the tonic in `octave`. */
export function noteName(key: Key, degree: number, octave: number): string {
  const idx = LETTERS.indexOf(key.tonic) + degree;
  const letter = LETTERS[((idx % 7) + 7) % 7]!;
  return `${letter}${key.acc[letter] ?? ''}${octave + Math.floor(idx / 7)}`;
}

/** Length of each duration token in quarter notes. */
const BEATS: Record<string, number> = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, e: 0.5 };
const beatsOf = (tokens: readonly string[]) => tokens.reduce((s, t) => s + BEATS[t]!, 0);

const P44 = {
  plain: [['h', 'h'], ['h', 'q', 'q'], ['q', 'q', 'h'], ['q', 'q', 'q', 'q']],
  more: [['h.', 'q'], ['q', 'h', 'q'], ['w']],
  eighths: [['e', 'e', 'q', 'q', 'q'], ['q', 'q', 'e', 'e', 'q'], ['e', 'e', 'e', 'e', 'q', 'q'], ['q', 'e', 'e', 'q', 'q']],
  dotted: [['q.', 'e', 'q', 'q'], ['q.', 'e', 'h'], ['h', 'q.', 'e']],
  run: [['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e'], ['e', 'e', 'e', 'e', 'q', 'q'], ['q', 'q', 'e', 'e', 'e', 'e']],
};
const P34 = {
  plain: [['h', 'q'], ['q', 'h'], ['q', 'q', 'q']],
  more: [['h.']],
  eighths: [['e', 'e', 'q', 'q'], ['q', 'e', 'e', 'q'], ['q', 'q', 'e', 'e']],
  dotted: [['q.', 'e', 'q'], ['h', 'q'], ['q', 'q.', 'e']],
  run: [['e', 'e', 'e', 'e', 'e', 'e'], ['e', 'e', 'e', 'e', 'q']],
};

type Hand = 'rh' | 'lh' | 'both';

export interface LevelSpec {
  level: number;
  /** One line for the player. */
  name: string;
  /** Roughly which course stage this level reads like. */
  stage: number;
  hands: Hand;
  keys: string[];
  timeSigs: [number, number][];
  bars: number;
  /** Quarter notes per minute for the test (a comfortable pace: the point is reading, not speed). */
  bpm: number;
  /** Melody range in scale degrees from the tonic (RH tonic is in octave 4, LH in octave 3). */
  range: [number, number];
  /** Pattern sets the melody may draw on. */
  patterns: ('plain' | 'more' | 'eighths' | 'dotted' | 'run')[];
  /** Chance of each melody move: [repeat, step, third, fourth, fifth, sixth]. */
  moves: [number, number, number, number, number, number];
  /** Probability that a note after the first becomes a rest. */
  rests: number;
  /** Left hand style when both hands play. */
  lh?: 'held' | 'alternate' | 'broken';
}

export const LEVELS: LevelSpec[] = [
  { level: 1, name: 'Right hand, five notes from Middle C', stage: 0, hands: 'rh', keys: ['C'], timeSigs: [[4, 4]], bars: 4, bpm: 56, range: [0, 4], patterns: ['plain'], moves: [0.2, 0.8, 0, 0, 0, 0], rests: 0 },
  { level: 2, name: 'Left hand, five notes from C below Middle C', stage: 1, hands: 'lh', keys: ['C'], timeSigs: [[4, 4]], bars: 4, bpm: 56, range: [0, 4], patterns: ['plain'], moves: [0.2, 0.7, 0.1, 0, 0, 0], rests: 0 },
  { level: 3, name: 'Right hand, wider range, keys of C, G and F', stage: 2, hands: 'rh', keys: ['C', 'G', 'F'], timeSigs: [[4, 4], [3, 4]], bars: 8, bpm: 60, range: [0, 6], patterns: ['plain', 'more'], moves: [0.15, 0.55, 0.3, 0, 0, 0], rests: 0 },
  { level: 4, name: 'Hands together: melody over held bass notes', stage: 3, hands: 'both', keys: ['C', 'G', 'F'], timeSigs: [[4, 4], [3, 4]], bars: 8, bpm: 56, range: [0, 6], patterns: ['plain', 'more'], moves: [0.15, 0.55, 0.3, 0, 0, 0], rests: 0, lh: 'held' },
  { level: 5, name: 'Hands together: moving bass and eighth notes', stage: 3, hands: 'both', keys: ['C', 'G', 'F'], timeSigs: [[4, 4], [3, 4]], bars: 8, bpm: 60, range: [0, 7], patterns: ['plain', 'eighths'], moves: [0.1, 0.55, 0.25, 0.1, 0, 0], rests: 0, lh: 'alternate' },
  { level: 6, name: 'Five keys, dotted rhythms, rests and broken-chord bass', stage: 4, hands: 'both', keys: ['C', 'G', 'F', 'D', 'Bb'], timeSigs: [[4, 4], [3, 4]], bars: 8, bpm: 60, range: [0, 7], patterns: ['plain', 'eighths', 'dotted'], moves: [0.1, 0.5, 0.25, 0.1, 0.05, 0], rests: 0.1, lh: 'broken' },
  { level: 7, name: 'Faster eighths, wider leaps, all five keys', stage: 4, hands: 'both', keys: ['C', 'G', 'F', 'D', 'Bb'], timeSigs: [[4, 4], [3, 4]], bars: 8, bpm: 66, range: [-2, 7], patterns: ['plain', 'eighths', 'dotted', 'run'], moves: [0.05, 0.45, 0.25, 0.12, 0.08, 0.05], rests: 0.1, lh: 'broken' },
];
export const MAX_LEVEL = LEVELS.length;

/** Small seeded random numbers (mulberry32): the same seed always makes the same piece. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

function weighted(r: Rand, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]!;
    if (x < 0) return i;
  }
  return 0;
}

/** Chord roots (scale degrees) per bar: I I IV V in the first half, then back home, ending on I. */
function progression(bars: number): number[] {
  const base = [0, 0, 3, 4, 0, 3, 4, 0];
  return Array.from({ length: bars }, (_, i) => (i === bars - 1 ? 0 : base[i % base.length]!));
}

function melodyBars(spec: LevelSpec, r: Rand, key: Key, beatsPerBar: number, bars: number, roots: number[]): string[] {
  const [lo, hi] = spec.range;
  const set = (beatsPerBar === 4 ? P44 : P34);
  const pool = spec.patterns.flatMap((p) => set[p]);
  const plain = spec.patterns.includes('plain') ? set.plain : pool;
  let degree = pick(r, [0, 2, 4].filter((d) => d >= lo && d <= hi));
  const out: string[] = [];
  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1;
    const tokens = last ? [beatsPerBar === 4 ? 'w' : 'h.'] : pick(r, (b === 0 ? plain : pool).filter((t) => beatsOf(t) === beatsPerBar));
    const chord = [roots[b]!, roots[b]! + 2, roots[b]! + 4];
    const bar = tokens.map((dur, i) => {
      if (last) degree = 0;
      else if (i === 0 && b > 0) {
        // The first note of a bar sits on a chord tone, the nearest one to where the tune is.
        const near = [...chord, ...chord.map((d) => d - 7), ...chord.map((d) => d + 7)].filter((d) => d >= lo && d <= hi);
        degree = near.reduce((best, d) => (Math.abs(d - degree) < Math.abs(best - degree) ? d : best), near[0] ?? degree);
      } else if (!(b === 0 && i === 0)) {
        const size = weighted(r, spec.moves);
        let dir = r() < 0.5 ? -1 : 1;
        if (degree + dir * size > hi || degree + dir * size < lo) dir = -dir;
        const next = degree + dir * size;
        degree = next > hi || next < lo ? degree : next;
      }
      const isRest = !last && !(b === 0 && i === 0) && i > 0 && r() < spec.rests && BEATS[dur]! >= 0.5;
      return isRest ? `R:${dur}` : `${noteName(key, degree, 4)}:${dur}`;
    });
    out.push(bar.join(' '));
  }
  return out;
}

function bassBars(spec: LevelSpec, r: Rand, key: Key, beatsPerBar: number, roots: number[]): string[] {
  return roots.map((root, b) => {
    // IV and V roots drop an octave so the bass never climbs into the right hand's range.
    const base = root >= 3 ? root - 7 : root;
    const n = (d: number) => noteName(key, base + d, 3);
    const last = b === roots.length - 1;
    if (last) return `${n(0)}:${beatsPerBar === 4 ? 'w' : 'h.'}`;
    switch (spec.lh) {
      case 'held':
        return beatsPerBar === 3 ? `${n(0)}:h.` : r() < 0.5 ? `${n(0)}:w` : `${n(0)}:h ${n(0)}:h`;
      case 'alternate':
        return beatsPerBar === 3 ? `${n(0)}:q ${n(4)}:q ${n(4)}:q` : `${n(0)}:q ${n(4)}:q ${n(0)}:q ${n(4)}:q`;
      default:
        return beatsPerBar === 3 ? `${n(0)}:q ${n(2)}:q ${n(4)}:q` : `${n(0)}:q ${n(2)}:q ${n(4)}:q ${n(2)}:q`;
    }
  });
}

/** Make the piece for `level` (1–7) from `seed`. */
export function generateSightReading(level: number, seed: number): Piece {
  const spec = LEVELS[level - 1];
  if (!spec) throw new Error(`No sight-reading level ${level}`);
  const r = rng(seed * 7919 + level);
  const key = KEYS[pick(r, spec.keys)]!;
  const timeSig = pick(r, spec.timeSigs);
  const beatsPerBar = (timeSig[0] * 4) / timeSig[1];
  const roots = progression(spec.bars);

  const rh = spec.hands !== 'lh' ? melodyBars(spec, r, key, beatsPerBar, spec.bars, roots) : undefined;
  // The left-hand-only level plays the tune itself, one octave down.
  const lhTune = spec.hands === 'lh' ? melodyBars(spec, r, key, beatsPerBar, spec.bars, roots).map((b) => b.replace(/([A-G][#b]?)4/g, '$13')) : undefined;
  const lh = spec.hands === 'both' ? bassBars(spec, r, key, beatsPerBar, roots) : lhTune;

  const title = `Sight-reading, level ${level}`;
  const join = (bars: string[] | undefined) => (bars ? bars.join(' | ') + ' |' : undefined);
  return {
    id: `sr-${level}-${seed}`,
    title,
    composer: 'Generated',
    stage: spec.stage,
    skills: ['sight-reading', `${key.name}-major`, `${timeSig[0]}/${timeSig[1]}`],
    license: 'own',
    targetBpm: spec.bpm,
    hands: spec.hands,
    notation: { title, composer: 'Generated', timeSig, fifths: key.fifths, rh: join(rh), lh: join(lh) },
  };
}
