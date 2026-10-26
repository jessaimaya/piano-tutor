/**
 * Where a played key sits on a staff, in half staff-spaces counted down from the top line
 * (0 = top line, 1 = first space, 2 = second line … 8 = bottom line; negative is above the staff, 9+ below).
 * Accidentals are spelled as sharps, whatever the key signature, since this only shows "which height did I play".
 */
export type Clef = 'treble' | 'bass';

const LETTER_OF_PITCH_CLASS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C C# D D# E F F# G G# A A# B → C=0 … B=6
const SHARP_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

/** Diatonic number of a MIDI note: C0 = 0, so C4 = 28. */
function diatonic(midi: number): number {
  return (Math.floor(midi / 12) - 1) * 7 + LETTER_OF_PITCH_CLASS[((midi % 12) + 12) % 12]!;
}

const TOP_LINE: Record<Clef, number> = { treble: 38, bass: 26 }; // F5 and A3

export function staffStep(midi: number, clef: Clef): number {
  return TOP_LINE[clef] - diatonic(midi);
}

export const isSharp = (midi: number): boolean => SHARP_PITCH_CLASSES.has(((midi % 12) + 12) % 12);

/** The extra short lines a note needs when it sits beyond the staff, as steps from the top line. */
export function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  for (let s = -2; s >= step; s -= 2) out.push(s);
  for (let s = 10; s <= step; s += 2) out.push(s);
  return out;
}

/** The hand that normally plays it: Middle C and up on the treble staff, below it on the bass staff. */
export const clefFor = (midi: number): Clef => (midi >= 60 ? 'treble' : 'bass');
