import { describe, expect, it } from 'vitest';
import { endBeat, readPlayback, schedule, soundingAt, soundsOf, stepIndexAt } from './playback';
import type { CursorNote, ScoreCursor } from './session';

function fake(steps: { beat: number; notes: CursorNote[] }[]): ScoreCursor & { index: number } {
  return {
    index: 0,
    reset() { this.index = 0; },
    beat() { return steps[this.index]?.beat ?? -1; },
    notes() { return steps[this.index]?.notes ?? []; },
    next() { this.index++; },
    get done() { return this.index >= steps.length; },
  };
}
const rh = (midi: number, beats?: number): CursorNote => ({ midi, staff: 0, beats });
const lh = (midi: number, beats?: number): CursorNote => ({ midi, staff: 1, beats });
const score = [
  { beat: 0, notes: [rh(60, 1), lh(48, 4)] },
  { beat: 1, notes: [rh(62, 1)] },
  { beat: 2, notes: [rh(64, 2), lh(48, 2)] },
];

describe('readPlayback', () => {
  it('returns each step with note lengths, for the hands chosen', () => {
    expect(readPlayback(fake(score), 'rh').map((s) => s.notes)).toEqual([
      [{ midi: 60, beats: 1 }], [{ midi: 62, beats: 1 }], [{ midi: 64, beats: 2 }],
    ]);
    expect(readPlayback(fake(score), 'lh').map((s) => s.notes.length)).toEqual([1, 0, 1]);
  });
  it('keeps one note per pitch (the longest) when both hands play the same key', () => {
    const steps = readPlayback(fake([{ beat: 0, notes: [rh(60, 1), lh(60, 3)] }]), 'both');
    expect(steps[0]!.notes).toEqual([{ midi: 60, beats: 3 }]);
  });
  it('gives zero-length (grace) notes an audible length, and unknown lengths one beat', () => {
    const steps = readPlayback(fake([{ beat: 0, notes: [rh(60, 0), rh(62)] }]), 'both');
    expect(steps[0]!.notes[0]!.beats).toBeGreaterThan(0);
    expect(steps[0]!.notes[1]!.beats).toBe(1);
  });
  it('leaves the cursor at the start', () => {
    const c = fake(score);
    readPlayback(c, 'both');
    expect(c.index).toBe(0);
  });
});

describe('timing helpers', () => {
  const steps = readPlayback(fake(score), 'both');
  const sounds = soundsOf(steps);

  it('ends when the longest note ends: the whole-bar left-hand note is shorter than the final half note here', () => {
    expect(endBeat(steps)).toBe(4);
    expect(endBeat([])).toBe(0);
  });
  it('shows the cursor on the last step that has started', () => {
    expect(stepIndexAt(steps, -2)).toBe(0);
    expect(stepIndexAt(steps, 0.99)).toBe(0);
    expect(stepIndexAt(steps, 1)).toBe(1);
    expect(stepIndexAt(steps, 3)).toBe(2);
  });
  it('lists the keys sounding at a moment, including held notes from earlier steps', () => {
    expect(soundingAt(sounds, 0).sort()).toEqual([48, 60]);
    expect(soundingAt(sounds, 1.5).sort()).toEqual([48, 62]);
    expect(soundingAt(sounds, 2.5).sort()).toEqual([48, 64]);
    expect(soundingAt(sounds, 4)).toEqual([]);
  });
  it('turns beats into wall-clock times from the start time and tempo', () => {
    expect(schedule(sounds.filter((s) => s.midi === 62), 1000, 500)).toEqual([{ midi: 62, atMs: 1500, durMs: 500 }]);
  });
});
