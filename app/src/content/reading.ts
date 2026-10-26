import { midiOf } from './notation';
import type { Piece } from './pieces';
import { KEYS, melodyBars, noteName, pick, progression, rng, type Key, type LevelSpec } from './sight-reading';

/**
 * The reading ladder: the generated pieces of the course's Reading step. Each rung adds ONE thing to the one before it (a new hand, a
 * new note or two, a skip, a time signature, eighth notes…), in the order the course teaches it, so a day's reading never asks for
 * something the lessons have not shown yet (12-lesson-ladder.md; 13-progression-review.md has the reasoning and the sources).
 * Every unit names the rungs it covers (`reading.from` to `reading.to` in course.json); the player starts a unit on its first rung and
 * climbs by reading well, never past the unit's last rung. The seven-level test in sight-reading.ts is separate: it only places you.
 *
 * Note ranges are scale degrees from the tonic, the right hand's tonic in octave 4. With the key of C the right hand reads C4–G4.
 * The left hand's first position is Middle C and down (F3–C4); from the octave rungs of stage 1 it also reads the low C position
 * (C3–G3), an octave under the right hand.
 */
export type Texture =
  | 'rh' // right hand alone
  | 'lh' // left hand alone
  | 'turns' // the tune passes between the hands every two bars; they never play together
  | 'unison' // both hands play the same tune an octave apart
  | 'contrary' // the left hand mirrors the right: it goes down where the right goes up
  | 'held' // right-hand tune over one held left-hand note per bar
  | 'alternate' // right-hand tune over a left hand that alternates the root with the fifth below
  | 'chords'; // right-hand tune over left-hand triads (I, IV and V in the hand-position shapes)

export interface Rung {
  n: number;
  /** The course unit that first uses it (course.json holds the full range). */
  unit: string;
  /** What is new at this rung, for the step text. */
  name: string;
  texture: Texture;
  keys: string[];
  timeSigs: [number, number][];
  bars: number;
  bpm: number;
  /** Melody range in scale degrees from the tonic. */
  range: [number, number];
  patterns: LevelSpec['patterns'];
  /** Chance of each melody move: [repeat, step, third, fourth, fifth, sixth]. */
  moves: LevelSpec['moves'];
  /** Probability that a note after the first becomes a rest. */
  rests: number;
}

const C: string[] = ['C'];
const T44: [number, number][] = [[4, 4]];
const BOTH: [number, number][] = [[4, 4], [3, 4]];
const rung = (n: number, unit: string, name: string, texture: Texture, over: Partial<Rung> = {}): Rung => ({
  n, unit, name, texture, keys: C, timeSigs: T44, bars: 4, bpm: 52, range: [0, 4], patterns: ['plain'],
  moves: [0.2, 0.8, 0, 0, 0, 0], rests: 0, ...over,
});
const STEPS: Rung['moves'] = [0.2, 0.8, 0, 0, 0, 0];
const THIRDS: Rung['moves'] = [0.15, 0.6, 0.25, 0, 0, 0];

export const RUNGS: readonly Rung[] = [
  // Stage 0 · the hands take turns. One note at a time, as Milnes, Faber and Ferrante all do: the right hand from Middle C up,
  // the left hand from Middle C down (C, B, A, then G, then F).
  rung(1, '0.1', 'Right hand: C and D', 'rh', { range: [0, 1], moves: [0.35, 0.65, 0, 0, 0, 0], bpm: 48 }),
  rung(2, '0.1', 'Right hand: C D E', 'rh', { range: [0, 2], moves: [0.3, 0.7, 0, 0, 0, 0], bpm: 50 }),
  rung(3, '0.1', 'Right hand: C D E F', 'rh', { range: [0, 3], moves: [0.25, 0.75, 0, 0, 0, 0], bpm: 50 }),
  rung(4, '0.1', 'Right hand: all five notes C to G', 'rh', { moves: STEPS }),
  rung(5, '0.1', 'Right hand: skips of a third', 'rh', { moves: THIRDS }),
  rung(6, '0.2', 'Left hand: Middle C, B and A', 'lh', { range: [0, 2], moves: [0.3, 0.7, 0, 0, 0, 0], bpm: 48 }),
  rung(7, '0.2', 'Left hand: G joins in', 'lh', { range: [0, 3], moves: [0.25, 0.75, 0, 0, 0, 0], bpm: 50 }),
  rung(8, '0.2', 'Left hand: all five notes F to Middle C', 'lh', { moves: STEPS }),
  rung(9, '0.2', 'Left hand: skips of a third', 'lh', { moves: THIRDS }),
  rung(10, '0.3', 'Hands take turns, two bars each, steps', 'turns', { moves: STEPS }),
  rung(11, '0.3', 'Hands take turns, with skips of a third', 'turns', { moves: THIRDS }),
  rung(12, '0.3', 'Hands take turns, eight bars', 'turns', { moves: THIRDS, bars: 8 }),
  rung(13, '0.4', 'Hands take turns in 3/4', 'turns', { timeSigs: [[3, 4]], bars: 8, moves: THIRDS }),
  rung(14, '0.4', 'Dotted half notes, 3/4 and 4/4', 'turns', { timeSigs: BOTH, patterns: ['plain', 'more'], bars: 8, moves: THIRDS }),
  rung(15, '0.5', 'Rests inside the tune', 'turns', { timeSigs: BOTH, patterns: ['plain', 'more'], bars: 8, moves: THIRDS, rests: 0.12, bpm: 54 }),
  rung(16, '0.5', 'Longer tunes: twelve bars', 'turns', { timeSigs: BOTH, patterns: ['plain', 'more'], bars: 12, moves: THIRDS, rests: 0.12, bpm: 54 }),
  // Stage 1 · five-finger positions, first hands together (the left hand now also plays the low C position, an octave under the right)
  rung(17, '1.1', 'Both hands, an octave apart', 'unison', { moves: STEPS }),
  rung(18, '1.1', 'Both hands, eight bars, 3/4 and 4/4', 'unison', { timeSigs: BOTH, patterns: ['plain', 'more'], bars: 8, moves: THIRDS }),
  rung(19, '1.2', 'One hand holds a note, the other moves', 'held', { bars: 8, moves: THIRDS }),
  rung(20, '1.2', 'Held notes, a sixth wide', 'held', { timeSigs: BOTH, patterns: ['plain', 'more'], bars: 8, range: [0, 5], moves: [0.15, 0.5, 0.35, 0, 0, 0] }),
  rung(21, '1.3', 'Contrary motion', 'contrary', { moves: STEPS }),
  rung(22, '1.3', 'Positions G and F', 'held', { keys: ['G', 'F'], bars: 8, moves: THIRDS }),
  rung(23, '1.4', 'Eighth notes in pairs', 'held', { keys: ['C', 'G', 'F'], timeSigs: BOTH, patterns: ['plain', 'more', 'eighths'], bars: 8, moves: THIRDS }),
  rung(24, '1.4', 'Eighth notes and rests', 'held', { keys: ['C', 'G', 'F'], timeSigs: BOTH, patterns: ['plain', 'more', 'eighths'], bars: 8, moves: THIRDS, rests: 0.1 }),
  rung(25, '1.5', 'A moving left hand, keys C G F D', 'alternate', { keys: ['C', 'G', 'F', 'D'], timeSigs: BOTH, patterns: ['plain', 'more', 'eighths'], bars: 8, moves: THIRDS, rests: 0.08, bpm: 56 }),
  // Stage 2 · leaving the position
  rung(26, '2.1', 'Sharps and flats, a seventh wide', 'alternate', { keys: ['G', 'F', 'D'], timeSigs: BOTH, patterns: ['plain', 'more', 'eighths'], bars: 8, range: [0, 6], moves: [0.15, 0.5, 0.3, 0.05, 0, 0], rests: 0.08, bpm: 56 }),
  rung(27, '2.2', 'The octave: scale runs', 'alternate', { keys: ['C', 'G', 'F'], timeSigs: BOTH, patterns: ['plain', 'more', 'eighths'], bars: 8, range: [0, 7], moves: [0.1, 0.6, 0.25, 0.05, 0, 0], rests: 0.08, bpm: 58 }),
  rung(28, '2.3', 'Left-hand chords: I, IV and V', 'chords', { keys: ['C', 'G', 'F'], timeSigs: BOTH, patterns: ['plain', 'more', 'eighths'], bars: 8, range: [0, 7], moves: [0.1, 0.5, 0.3, 0.1, 0, 0], rests: 0.08, bpm: 56 }),
];
export const MAX_RUNG = RUNGS.length;

export const rungOf = (n: number): Rung => RUNGS[Math.min(MAX_RUNG, Math.max(1, Math.round(n))) - 1]!;

/** Move every note name in a bar by `octaves`; rests are left alone. */
const shift = (bar: string, octaves: number): string => bar.replace(/\b([A-G][#b]?)(\d)\b/g, (_m, l: string, o: string) => `${l}${Number(o) + octaves}`);

const LETTERS = 'CDEFGAB';
/** Degree of a right-hand note name (octave 4) from the key's tonic. */
function degreeOf(key: Key, name: string): number {
  const m = /^([A-G])[#b]?(\d)$/.exec(name)!;
  return (Number(m[2]) - 4) * 7 + LETTERS.indexOf(m[1]!) - LETTERS.indexOf(key.tonic);
}

/**
 * The left hand's first position is the one all three beginner books teach: the thumb on Middle C and the hand reaching down, so
 * finger 1 plays C4, finger 2 B3, 3 A3, 4 G3 and 5 F3. A tune written for the right hand's degrees 0–4 (fingers 1–5 from C) is
 * played here on the same fingers, which puts its tonic on Middle C: the left hand's tunes end where the thumb is.
 */
function toLeftPosition(bar: string, key: Key): string {
  return bar.split(' ').map((tok) => {
    if (tok.startsWith('R:')) return tok;
    const [name, dur] = tok.split(':') as [string, string];
    return `${noteName(key, 7 - degreeOf(key, name), 3)}:${dur}`;
  }).join(' ');
}

/** The left hand mirrors the right: degree d becomes (lo + hi - d), so the hands move in opposite directions on the same fingers. */
function mirror(bar: string, key: Key, [lo, hi]: [number, number]): string {
  return bar.split(' ').map((tok) => {
    if (tok.startsWith('R:')) return tok;
    const [name, dur] = tok.split(':') as [string, string];
    return `${noteName(key, lo + hi - degreeOf(key, name), 3)}:${dur}`;
  }).join(' ');
}

/** Left-hand chord shapes in the five-finger position (inversions keep the hand still): I C E G, IV C F A, V B D G in C. */
const SHAPES: Record<number, number[]> = { 0: [0, 2, 4], 3: [0, 3, 5], 4: [-1, 1, 4] };

/** One bar per chord root. The hand stays low: a note above A3 (a chord above E4) is played an octave down. */
function leftHand(texture: 'held' | 'alternate' | 'chords', r: () => number, key: Key, beatsPerBar: number, roots: number[]): string[] {
  const name = (d: number) => noteName(key, d, 3);
  const low = (d: number) => (midiOf(name(d)) > 57 ? d - 7 : d);
  return roots.map((root, b) => {
    const last = b === roots.length - 1;
    const whole = beatsPerBar === 4 ? 'w' : 'h.';
    if (last) return texture === 'chords' ? `${SHAPES[0]!.map((d) => name(d)).join('+')}:${whole}` : `${name(0)}:${whole}`;
    if (texture === 'chords') {
      const shape = SHAPES[root] ?? SHAPES[0]!;
      const drop = Math.max(...shape.map((d) => midiOf(name(d)))) > 64 ? -7 : 0;
      return `${shape.map((d) => name(d + drop)).join('+')}:${whole}`;
    }
    const d = low(root);
    if (texture === 'held') return beatsPerBar === 3 ? `${name(d)}:h.` : r() < 0.5 ? `${name(d)}:w` : `${name(d)}:h ${name(d)}:h`;
    // The fifth below the root, or the fifth above when that would sink under G2 (the bottom line of the bass staff).
    const under = midiOf(name(d - 3)) < 43 ? name(d + 4) : name(d - 3);
    return beatsPerBar === 3 ? `${name(d)}:q ${under}:q ${under}:q` : `${name(d)}:q ${under}:q ${name(d)}:q ${under}:q`;
  });
}

/** Make the piece for rung `n` (1…MAX_RUNG) from `seed`: the same seed always makes the same piece. */
export function generateReading(n: number, seed: number): Piece {
  const spec = rungOf(n);
  const r = rng(seed * 7919 + spec.n * 131);
  const key = KEYS[pick(r, spec.keys)]!;
  const timeSig = pick(r, spec.timeSigs);
  const beatsPerBar = (timeSig[0] * 4) / timeSig[1];
  const roots = progression(spec.bars);
  const tune = melodyBars(spec, r, key, beatsPerBar, spec.bars, roots);
  const rest = `R:${beatsPerBar === 4 ? 'w' : 'h.'}`;

  let rh: string[] | undefined;
  let lh: string[] | undefined;
  switch (spec.texture) {
    case 'rh': rh = tune; break;
    case 'lh': lh = tune.map((b) => toLeftPosition(b, key)); break;
    case 'turns': // two bars each, right hand first
      rh = tune.map((b, i) => (Math.floor(i / 2) % 2 === 0 ? b : rest));
      lh = tune.map((b, i) => (Math.floor(i / 2) % 2 === 1 ? toLeftPosition(b, key) : rest));
      break;
    case 'unison': rh = tune; lh = tune.map((b) => shift(b, -1)); break;
    case 'contrary': rh = tune; lh = tune.map((b) => mirror(b, key, spec.range)); break;
    default: rh = tune; lh = leftHand(spec.texture, r, key, beatsPerBar, roots);
  }

  const title = `Reading ${spec.n}`;
  const join = (bars: string[] | undefined) => (bars ? bars.join(' | ') + ' |' : undefined);
  const stage = Number(spec.unit.split('.')[0]);
  return {
    id: `rd-${spec.n}-${seed}`,
    title,
    composer: 'Generated',
    stage,
    skills: ['sight-reading', `${key.name}-major`, `${timeSig[0]}/${timeSig[1]}`],
    license: 'own',
    targetBpm: spec.bpm,
    hands: rh && lh ? 'both' : rh ? 'rh' : 'lh',
    notation: { title, composer: 'Generated', timeSig, fifths: key.fifths, rh: join(rh), lh: join(lh) },
  };
}
