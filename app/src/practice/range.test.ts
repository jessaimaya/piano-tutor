import { describe, expect, it } from 'vitest';
import { clampRange, isWholePiece, RangedCursor, type MeasuredCursor } from './range';
import { readTimeline } from './timeline';
import { Session, type CursorNote } from './session';

/** Four bars of 4/4, one quarter note per step: step i is in bar floor(i/4) at beat i. Note = 60 + i. */
function fake(): MeasuredCursor & { index: number } {
  const total = 16;
  return {
    index: 0,
    measureCount: 4,
    reset() { this.index = 0; },
    beat() { return this.index; },
    measure() { return Math.floor(this.index / 4); },
    notes(): CursorNote[] { return this.index < total ? [{ midi: 60 + this.index, staff: 0 }] : []; },
    next() { this.index++; },
    moveTo(i: number) { this.index = i; },
    get done() { return this.index >= total; },
  };
}

describe('RangedCursor', () => {
  it('starts at the first bar of the range and counts beats from there', () => {
    const c = new RangedCursor(fake(), { from: 2, to: 3 });
    expect(c.done).toBe(false);
    expect(c.beat()).toBe(0);
    expect(c.notes()[0]!.midi).toBe(64); // bar 2 begins at step 4
  });

  it('is done after the last bar of the range', () => {
    const c = new RangedCursor(fake(), { from: 2, to: 3 });
    for (let i = 0; i < 8; i++) { expect(c.done).toBe(false); c.next(); }
    expect(c.done).toBe(true);
    expect(c.notes()).toEqual([]);
  });

  it('reads only the bars in the range for the timeline, with beats from zero', () => {
    const steps = readTimeline(new RangedCursor(fake(), { from: 3, to: 3 }), 'both');
    expect(steps.map((s) => [s.rawIndex, s.beat, s.notes[0]])).toEqual([[0, 0, 68], [1, 1, 69], [2, 2, 70], [3, 3, 71]]);
  });

  it('leaves the cursor at the start of the range after reading it', () => {
    const base = fake();
    const c = new RangedCursor(base, { from: 3, to: 4 });
    readTimeline(c, 'both');
    expect(base.index).toBe(8);
  });

  it('moves by step counted from the range start', () => {
    const base = fake();
    const c = new RangedCursor(base, { from: 3, to: 4 });
    c.moveTo(2);
    expect(base.index).toBe(10);
  });

  it('works for a wait-mode session: plays the range, then finishes', () => {
    const s = new Session(new RangedCursor(fake(), { from: 4, to: 4 }), 'both');
    expect([...s.expected]).toEqual([72]);
    expect(s.press(72).finished).toBeNull();
    s.press(73); s.press(74);
    const last = s.press(75);
    expect(last.finished).toMatchObject({ steps: 4 });
    expect(s.finished).toBe(true);
  });

  it('a range that covers the whole piece behaves like the piece', () => {
    const c = new RangedCursor(fake(), { from: 1, to: 4 });
    expect(readTimeline(c, 'both')).toHaveLength(16);
  });
});

describe('range helpers', () => {
  it('clamps typed values into the piece, from ≤ to', () => {
    expect(clampRange(0, 99, 4)).toEqual({ from: 1, to: 4 });
    expect(clampRange(3, 2, 4)).toEqual({ from: 3, to: 3 });
    expect(clampRange(9, 9, 4)).toEqual({ from: 4, to: 4 });
    expect(clampRange(NaN, NaN, 4)).toEqual({ from: 1, to: 4 });
  });
  it('knows when a range is the whole piece', () => {
    expect(isWholePiece(undefined, 4)).toBe(true);
    expect(isWholePiece({ from: 1, to: 4 }, 4)).toBe(true);
    expect(isWholePiece({ from: 2, to: 4 }, 4)).toBe(false);
  });
});
