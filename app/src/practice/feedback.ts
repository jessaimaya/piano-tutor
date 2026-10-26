import { noteName } from '../midi/parse';

/** Plain-language feedback for a wrong or late note. Pure, so the wording is tested. */

export function closest(played: number, wanted: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const w of wanted) if (best === undefined || Math.abs(w - played) < Math.abs(best - played)) best = w;
  return best;
}

const semitones = (n: number) => `${n} semitone${n === 1 ? '' : 's'}`;

/** A wrong pitch: how far from the nearest note you should have played. */
export function describeWrongNote(played: number, wanted: readonly number[]): string {
  const target = closest(played, wanted);
  if (target === undefined) return `${noteName(played)} is not in the score here.`;
  const diff = played - target;
  if (diff === 0) return `${noteName(played)} was right.`;
  const where = diff > 0 ? 'too high' : 'too low';
  return `You played ${noteName(played)}, wanted ${noteName(target)}: ${semitones(Math.abs(diff))} ${where}.`;
}

/** The right pitch at the wrong moment. */
export function describeOffTime(note: number, offsetMs: number): string {
  const ms = Math.round(Math.abs(offsetMs));
  return `${noteName(note)} was the right note, but ${ms} ms ${offsetMs > 0 ? 'late' : 'early'}.`;
}

export function describeMissed(notes: readonly number[]): string {
  const names = [...notes].sort((a, b) => a - b).map(noteName).join(' + ');
  return `Missed ${names}.`;
}
