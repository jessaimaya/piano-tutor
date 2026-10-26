import type { Hands } from './log';
import type { ScoreCursor } from './session';
import { handFilter } from './timeline';

/**
 * Listening to a piece: what sounds when, for the hand(s) chosen. Pure (beats in, beats out), so the timing rules are tested
 * without audio. Beats are quarter notes from the start of the piece, like the timeline.
 */

export interface PlayStep {
  /** Position of this step when stepping the cursor from the start (same numbering as `readTimeline`). */
  rawIndex: number;
  beat: number;
  notes: { midi: number; beats: number }[];
}

export interface Sound {
  midi: number;
  startBeat: number;
  beats: number;
}

/** Grace notes and odd files can report zero length: still give them an audible blip. */
export const MIN_SOUND_BEATS = 0.12;

/** Walk the whole score once: every step, with each note's length for `hands`. Leaves the cursor at the start. */
export function readPlayback(cursor: ScoreCursor, hands: Hands): PlayStep[] {
  const wanted = handFilter(hands);
  const steps: PlayStep[] = [];
  cursor.reset();
  for (let rawIndex = 0; !cursor.done; rawIndex++) {
    const byPitch = new Map<number, number>();
    for (const n of cursor.notes().filter(wanted)) {
      byPitch.set(n.midi, Math.max(byPitch.get(n.midi) ?? 0, Math.max(n.beats ?? 1, MIN_SOUND_BEATS)));
    }
    steps.push({ rawIndex, beat: cursor.beat(), notes: [...byPitch].map(([midi, beats]) => ({ midi, beats })) });
    cursor.next();
  }
  cursor.reset();
  return steps;
}

export const soundsOf = (steps: readonly PlayStep[]): Sound[] =>
  steps.flatMap((s) => s.notes.map((n) => ({ midi: n.midi, startBeat: s.beat, beats: n.beats })));

/** Beat at which the last note ends (or the last step starts, if nothing sounds). */
export function endBeat(steps: readonly PlayStep[]): number {
  const last = steps.length ? steps[steps.length - 1]!.beat : 0;
  return Math.max(last, ...soundsOf(steps).map((s) => s.startBeat + s.beats));
}

/** The cursor position to show at `beat`: the last step that has started (0 before the first). */
export function stepIndexAt(steps: readonly PlayStep[], beat: number): number {
  let idx = 0;
  for (const s of steps) {
    if (s.beat > beat + 1e-6) break;
    idx = s.rawIndex;
  }
  return idx;
}

/** Pitches sounding at `beat`, for lighting the keys. */
export const soundingAt = (sounds: readonly Sound[], beat: number): number[] =>
  [...new Set(sounds.filter((s) => s.startBeat <= beat + 1e-6 && beat < s.startBeat + s.beats).map((s) => s.midi))];

/** Wall-clock schedule for the synth: `t0` is when beat 0 sounds, `quarterMs` the length of a quarter note. */
export function schedule(sounds: readonly Sound[], t0: number, quarterMs: number): { atMs: number; durMs: number; midi: number }[] {
  return sounds.map((s) => ({ midi: s.midi, atMs: t0 + s.startBeat * quarterMs, durMs: s.beats * quarterMs }));
}
