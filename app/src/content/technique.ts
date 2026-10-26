import type { Piece } from './pieces';

/**
 * Scales and arpeggios in every key, generated into the same notation the lessons use (see notation.ts).
 *
 * Scales: major and harmonic minor, two octaves up then down, hands an octave apart, standard fingering.
 * Arpeggios: major and minor triads, two octaves up then down. Fingering is only given where the usual
 * 1-2-3-1-2-3-5 pattern keeps the thumb off the black keys (the black-key arpeggios have exceptions that
 * differ between method books, so those show no numbers: use your book).
 * G♯ minor needs double sharps and is left out.
 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const WHITE_PCS = new Set(Object.values(NATURAL_PC));

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const MAJOR_TRIAD = [0, 4, 7];
const MINOR_TRIAD = [0, 3, 7];

/** Where the thumbs fall in a two-octave scale (indices 0–14), grouped in 3s and 4s, always on white keys. */
const RH_THUMBS = {
  c: [0, 3, 7, 10], // C G D A E B, A E B D G C minor
  f: [0, 4, 7, 11], // F major, F minor
  bb: [1, 4, 8, 11],
  eb: [1, 5, 8, 12],
  ab: [2, 5, 9, 12],
  db: [2, 6, 9, 13],
  fs: [3, 6, 10, 13],
} as const;
const LH_THUMBS = {
  c: [4, 7, 11, 14], // most white-key scales
  b: [3, 7, 10, 14],
  bb: [2, 6, 9, 13],
  fs: [3, 6, 10, 13],
  bbm: [1, 4, 8, 11],
  ebm: [1, 5, 8, 12],
} as const;

interface KeySpec {
  /** Tonic spelled with # or b, e.g. "F#", "Eb". */
  tonic: string;
  minor: boolean;
  /** Key signature: sharps positive, flats negative. */
  fifths: number;
  rh: readonly number[];
  lh: readonly number[];
}

const major = (tonic: string, fifths: number, rh: readonly number[], lh: readonly number[]): KeySpec => ({ tonic, minor: false, fifths, rh, lh });
const minor = (tonic: string, fifths: number, rh: readonly number[], lh: readonly number[]): KeySpec => ({ tonic, minor: true, fifths, rh, lh });

/** Relative major/minor pairs around the circle of fifths. */
export const KEYS: KeySpec[] = [
  major('C', 0, RH_THUMBS.c, LH_THUMBS.c), minor('A', 0, RH_THUMBS.c, LH_THUMBS.c),
  major('G', 1, RH_THUMBS.c, LH_THUMBS.c), minor('E', 1, RH_THUMBS.c, LH_THUMBS.c),
  major('D', 2, RH_THUMBS.c, LH_THUMBS.c), minor('B', 2, RH_THUMBS.c, LH_THUMBS.b),
  major('A', 3, RH_THUMBS.c, LH_THUMBS.c), minor('F#', 3, RH_THUMBS.ab, LH_THUMBS.fs),
  major('E', 4, RH_THUMBS.c, LH_THUMBS.c), minor('C#', 4, RH_THUMBS.ab, LH_THUMBS.bb),
  major('B', 5, RH_THUMBS.c, LH_THUMBS.b),
  major('F#', 6, RH_THUMBS.fs, LH_THUMBS.fs), minor('Eb', -6, RH_THUMBS.eb, LH_THUMBS.ebm),
  major('Db', -5, RH_THUMBS.db, LH_THUMBS.bb), minor('Bb', -5, RH_THUMBS.bb, LH_THUMBS.bbm),
  major('Ab', -4, RH_THUMBS.ab, LH_THUMBS.bb), minor('F', -4, RH_THUMBS.f, LH_THUMBS.c),
  major('Eb', -3, RH_THUMBS.eb, LH_THUMBS.bb), minor('C', -3, RH_THUMBS.c, LH_THUMBS.c),
  major('Bb', -2, RH_THUMBS.bb, LH_THUMBS.bb), minor('G', -2, RH_THUMBS.c, LH_THUMBS.c),
  major('F', -1, RH_THUMBS.f, LH_THUMBS.c), minor('D', -1, RH_THUMBS.c, LH_THUMBS.c),
];

interface Note { name: string; midi: number }

/** Spells `intervals` (semitones above the tonic) on consecutive letters, so F♯ major gets E♯ and not F. */
function spell(tonic: string, tonicMidi: number, intervals: number[], letterSteps: number[]): Note[] {
  const letter = tonic[0]!;
  const start = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  return intervals.map((semis, i) => {
    const step = letterSteps[i]!;
    const l = LETTERS[(start + step) % 7]!;
    const midi = tonicMidi + semis;
    let alter = (midi - NATURAL_PC[l]!) % 12;
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    if (Math.abs(alter) > 1) throw new Error(`Needs a double accidental: ${tonic} ${semis}`);
    const octave = Math.floor((midi - alter) / 12) - 1;
    return { name: `${l}${alter === 1 ? '#' : alter === -1 ? 'b' : ''}${octave}`, midi };
  });
}

/** Tonic of the right hand: between C♯3 and C4 so two octaves stay inside the on-screen keyboard (C2–C6). */
function tonicMidi(tonic: string): number {
  const pc = (NATURAL_PC[tonic[0]!]! + (tonic[1] === '#' ? 1 : tonic[1] === 'b' ? -1 : 0) + 12) % 12;
  let m = 60;
  while (m % 12 !== pc) m--;
  return m;
}

function scaleNotes(key: KeySpec, base: number): Note[] {
  const degrees = key.minor ? HARMONIC_MINOR : MAJOR;
  // 15 notes: two octaves, tonic to tonic.
  const intervals = [...degrees, ...degrees.map((d) => d + 12), 24];
  const steps = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  return spell(key.tonic, base, intervals, steps);
}

/** RH finger for scale index `i` (0–14): count up from the last thumb; before the first thumb, count from the one before it. */
export function rhFinger(thumbs: readonly number[], i: number): number {
  const before = thumbs.filter((t) => t <= i);
  if (before.length) return Math.min(5, i - before[before.length - 1]! + 1);
  const gap = thumbs[1]! - thumbs[0]!;
  return Math.min(5, i - (thumbs[0]! - (7 - gap)) + 1);
}

/** LH finger for scale index `i`: count down to the next thumb; after the last thumb, count up from it. */
export function lhFinger(thumbs: readonly number[], i: number): number {
  const next = thumbs.find((t) => t >= i);
  if (next !== undefined) return Math.min(5, next - i + 1);
  return Math.min(5, i - thumbs[thumbs.length - 1]! + 1);
}

const token = (n: Note, dur: string, finger?: number) => `${n.name}:${dur}${finger ? `/${finger}` : ''}`;

/** Up 15 notes, down 13, then the tonic held for a whole bar: 7 bars of quarters + 1 bar = 8 bars of 4/4. */
function scaleBars(notes: Note[], finger: (i: number) => number): string {
  const order = [...Array(15).keys(), ...[13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]];
  const quarters = order.map((i) => token(notes[i]!, 'q', finger(i)));
  const bars: string[] = [];
  for (let b = 0; b < 7; b++) bars.push(quarters.slice(b * 4, b * 4 + 4).join(' '));
  bars.push(token(notes[0]!, 'w', finger(0)));
  return bars.join(' | ') + ' |';
}

function arpeggioNotes(key: KeySpec, base: number): Note[] {
  const triad = key.minor ? MINOR_TRIAD : MAJOR_TRIAD;
  const intervals = [...triad, ...triad.map((d) => d + 12), 24];
  return spell(key.tonic, base, intervals, [0, 2, 4, 7, 9, 11, 14]);
}

const RH_ARP = [1, 2, 3, 1, 2, 3, 5];
const LH_ARP = [5, 3, 2, 1, 3, 2, 1];

/** Up 7 notes, down 5 (12 quarters = 3 bars), then the tonic held for a whole bar. */
function arpeggioBars(notes: Note[], fingers: number[] | undefined): string {
  const order = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
  const quarters = order.map((i) => token(notes[i]!, 'q', fingers?.[i]));
  const bars: string[] = [];
  for (let b = 0; b < 3; b++) bars.push(quarters.slice(b * 4, b * 4 + 4).join(' '));
  bars.push(token(notes[0]!, 'w', fingers?.[0]));
  return bars.join(' | ') + ' |';
}

const pretty = (tonic: string) => tonic.replace('#', '♯').replace(/b$/, '♭');
const slug = (tonic: string, minorKey: boolean) => `${tonic.replace('#', 's')}-${minorKey ? 'minor' : 'major'}`;

export function buildTechniquePieces(): Piece[] {
  const out: Piece[] = [];
  for (const key of KEYS) {
    const name = `${pretty(key.tonic)} ${key.minor ? 'minor' : 'major'}`;
    const rhBase = tonicMidi(key.tonic);
    const lhBase = rhBase - 12;
    const accidentals = Math.abs(key.fifths);
    const stage = accidentals <= 1 ? 2 : accidentals <= 3 ? 3 : 4;

    const rh = scaleNotes(key, rhBase);
    const lh = scaleNotes(key, lhBase);
    out.push({
      id: `t-scale-${slug(key.tonic, key.minor)}`,
      title: `${name} scale${key.minor ? ' (harmonic)' : ''}, 2 octaves`,
      composer: 'Technique',
      stage,
      group: 'scales',
      skills: ['scale', key.minor ? 'harmonic-minor' : 'major-scale', 'fingering'],
      license: 'own',
      targetBpm: 88,
      hands: 'both',
      notation: {
        title: `${name} scale`,
        composer: 'Technique',
        timeSig: [4, 4],
        fifths: key.fifths,
        rh: scaleBars(rh, (i) => rhFinger(key.rh, i)),
        lh: scaleBars(lh, (i) => lhFinger(key.lh, i)),
      },
    });

    const arpRh = arpeggioNotes(key, rhBase);
    const arpLh = arpeggioNotes(key, lhBase);
    const fingered = WHITE_PCS.has(rhBase % 12);
    out.push({
      id: `t-arp-${slug(key.tonic, key.minor)}`,
      title: `${name} arpeggio, 2 octaves`,
      composer: 'Technique',
      stage,
      group: 'arpeggios',
      skills: ['arpeggio', key.minor ? 'minor-triad' : 'major-triad', ...(fingered ? ['fingering'] : [])],
      license: 'own',
      targetBpm: 72,
      hands: 'both',
      notation: {
        title: `${name} arpeggio`,
        composer: 'Technique',
        timeSig: [4, 4],
        fifths: key.fifths,
        rh: arpeggioBars(arpRh, fingered ? RH_ARP : undefined),
        lh: arpeggioBars(arpLh, fingered ? LH_ARP : undefined),
      },
    });
  }
  return out;
}

export const techniquePieces: Piece[] = buildTechniquePieces();

/**
 * Five-finger positions: the warm-up of stages 0 and 1, before there are scales. Both hands play the same pattern an octave apart
 * (right hand from the tonic above Middle C, left hand from the tonic below it), fingers 1–5 in the right hand and 5–1 in the left.
 * Eight bars of 4/4: up and down in steps, skips of a third, half notes, a short turn, and the tonic held.
 * Positions C and G have no accidentals (G position is G A B C D); F needs B♭ and D needs F♯, so those take their key signature.
 */
const POSITIONS = [
  { tonic: 'C', fifths: 0, stage: 0 },
  { tonic: 'G', fifths: 0, stage: 1 }, // G A B C D: no black key, so the key signature stays C major
  { tonic: 'F', fifths: -1, stage: 1 },
  { tonic: 'D', fifths: 2, stage: 1 },
] as const;

type PositionBars = readonly (readonly [readonly number[], 'q' | 'h' | 'w'])[];

/**
 * Four versions of the exercise, easiest first, so the warm-up can grow with the days of a unit (course.json lists them in that order).
 * Degrees (1–5) per bar and the duration of each note. Every bar is 4 beats and each version ends on the tonic held.
 *  steps:  only neighbouring fingers, quarter notes
 *  holds:  half notes first, then quarter-note steps: a held note while the next finger gets ready
 *  thirds: skipping a finger (1-3-2-4): the hand learns to jump a third
 *  mixed:  all of it, with a short turn (the version this exercise started with, kept under its first id)
 */
const POSITION_PATTERNS: Record<'steps' | 'holds' | 'thirds' | 'mixed', PositionBars> = {
  steps: [
    [[1, 2, 3, 4], 'q'], [[5, 4, 3, 2], 'q'], [[1, 2, 3, 4], 'q'], [[5, 4, 3, 2], 'q'],
    [[1, 2, 3, 4], 'q'], [[5, 4, 3, 2], 'q'], [[1, 2, 3, 2], 'q'], [[1], 'w'],
  ],
  holds: [
    [[1, 2], 'h'], [[3, 4], 'h'], [[5, 4], 'h'], [[3, 2], 'h'],
    [[1, 2, 3, 4], 'q'], [[5, 4, 3, 2], 'q'], [[1, 3], 'h'], [[1], 'w'],
  ],
  thirds: [
    [[1, 3, 2, 4], 'q'], [[3, 5, 4, 2], 'q'], [[1, 3, 2, 4], 'q'], [[3, 5, 4, 2], 'q'],
    [[5, 3, 4, 2], 'q'], [[1, 3, 5, 3], 'q'], [[4, 2, 3, 1], 'q'], [[1], 'w'],
  ],
  mixed: [
    [[1, 2, 3, 4], 'q'], [[5, 4, 3, 2], 'q'], [[1, 3, 2, 4], 'q'], [[3, 5, 4, 2], 'q'],
    [[1, 3], 'h'], [[5, 3], 'h'], [[1, 2, 3, 2], 'q'], [[1], 'w'],
  ],
};

/** The first five notes of the major scale on `tonic`: G A B C D, F G A B♭ C, D E F♯ G A. */
const positionNotes = (tonic: string, base: number): Note[] => spell(tonic, base, [0, 2, 4, 5, 7], [0, 1, 2, 3, 4]);

export function buildPositionPieces(): Piece[] {
  return POSITIONS.flatMap(({ tonic, fifths, stage }) => {
    const rhBase = tonicMidi(tonic) < 60 ? tonicMidi(tonic) + 12 : 60; // the tonic from Middle C up, so G position is treble-clef G
    const rh = positionNotes(tonic, rhBase);
    const lh = positionNotes(tonic, rhBase - 12);
    const name = `${pretty(tonic)} position`;
    return (Object.keys(POSITION_PATTERNS) as (keyof typeof POSITION_PATTERNS)[]).map((kind): Piece => {
      const bars = (notes: Note[], finger: (degree: number) => number) =>
        POSITION_PATTERNS[kind].map(([degrees, dur]) => degrees.map((d) => token(notes[d - 1]!, dur, finger(d))).join(' ')).join(' | ') + ' |';
      const title = kind === 'mixed' ? `Five fingers: ${name}` : `Five fingers: ${name} · ${kind}`;
      return {
        id: kind === 'mixed' ? `t-five-${tonic.toLowerCase()}` : `t-five-${tonic.toLowerCase()}-${kind}`,
        title,
        composer: 'Technique',
        stage,
        group: 'positions',
        skills: ['five-finger', `five-finger-${tonic}`, 'fingering'],
        license: 'own',
        targetBpm: 72,
        hands: 'both',
        notation: { title, composer: 'Technique', timeSig: [4, 4], fifths, rh: bars(rh, (d) => d), lh: bars(lh, (d) => 6 - d) },
      };
    });
  });
}

/**
 * The same four exercises in the first position every beginner book starts with: both thumbs on Middle C, the right hand reaching up
 * (C D E F G) and the left hand reaching down (C B A G F). Fingers 1–5 are the same in both hands, so the hands are played one at a
 * time in stage 0; played together they move in contrary motion. From unit 1.1 the exercises above (the left hand an octave under
 * the right) take over.
 */
const MIDDLE_C_LEFT: Note[] = [
  { name: 'C4', midi: 60 }, { name: 'B3', midi: 59 }, { name: 'A3', midi: 57 }, { name: 'G3', midi: 55 }, { name: 'F3', midi: 53 },
];

export function buildMiddleCPieces(): Piece[] {
  const rh = positionNotes('C', 60);
  return (Object.keys(POSITION_PATTERNS) as (keyof typeof POSITION_PATTERNS)[]).map((kind): Piece => {
    const bars = (notes: Note[]) =>
      POSITION_PATTERNS[kind].map(([degrees, dur]) => degrees.map((d) => token(notes[d - 1]!, dur, d)).join(' ')).join(' | ') + ' |';
    const title = kind === 'mixed' ? 'Five fingers: Middle C position' : `Five fingers: Middle C position · ${kind}`;
    return {
      id: kind === 'mixed' ? 't-mid-c' : `t-mid-c-${kind}`,
      title,
      composer: 'Technique',
      stage: 0,
      group: 'positions',
      skills: ['five-finger', 'five-finger-C', 'middle-C-position', 'fingering'],
      license: 'own',
      targetBpm: 66,
      hands: 'both',
      notation: { title, composer: 'Technique', timeSig: [4, 4], fifths: 0, rh: bars(rh), lh: bars(MIDDLE_C_LEFT) },
    };
  });
}

export const positionPieces: Piece[] = [...buildMiddleCPieces(), ...buildPositionPieces()];
