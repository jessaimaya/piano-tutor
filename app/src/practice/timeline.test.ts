import { describe, expect, it } from 'vitest';
import type { CursorNote, ScoreCursor } from './session';
import { readTimeline } from './timeline';

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
const rh = (midi: number): CursorNote => ({ midi, staff: 0 });
const lh = (midi: number): CursorNote => ({ midi, staff: 1 });

describe('readTimeline', () => {
  const score = [
    { beat: 0, notes: [rh(60), lh(48)] },
    { beat: 1, notes: [lh(50)] },
    { beat: 2, notes: [rh(62)] },
  ];

  it('returns every step with beat and the notes for both hands', () => {
    expect(readTimeline(fake(score), 'both')).toEqual([
      { rawIndex: 0, beat: 0, notes: [60, 48] },
      { rawIndex: 1, beat: 1, notes: [50] },
      { rawIndex: 2, beat: 2, notes: [62] },
    ]);
  });

  it('keeps steps that are rests for the chosen hand, with empty notes, so the cursor can still follow the music', () => {
    expect(readTimeline(fake(score), 'rh')).toEqual([
      { rawIndex: 0, beat: 0, notes: [60] },
      { rawIndex: 1, beat: 1, notes: [] },
      { rawIndex: 2, beat: 2, notes: [62] },
    ]);
  });

  it('leaves the cursor at the start', () => {
    const c = fake(score);
    readTimeline(c, 'lh');
    expect(c.index).toBe(0);
  });

  it('dedupes a pitch shared by two voices', () => {
    expect(readTimeline(fake([{ beat: 0, notes: [rh(60), rh(60)] }]), 'both')[0]!.notes).toEqual([60]);
  });
});
