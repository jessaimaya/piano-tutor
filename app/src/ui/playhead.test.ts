import { describe, expect, it } from 'vitest';
import { playheadAt, withLeadIn, type Spot } from './playhead';

const s = (beat: number, x: number, y0 = 0): Spot => ({ beat, x, y0, y1: y0 + 10 });

describe('playheadAt', () => {
  const spots = [s(0, 10), s(1, 20), s(3, 40), s(4, 5, 100)];

  it('is nowhere without a score', () => expect(playheadAt([], 1)).toBeUndefined());
  it('waits on the first step before the music starts', () => expect(playheadAt(spots, -2)?.x).toBe(10));
  it('sits on a step at its beat', () => expect(playheadAt(spots, 1)?.x).toBe(20));
  it('slides between steps in proportion to time', () => {
    expect(playheadAt(spots, 0.5)?.x).toBe(15);
    expect(playheadAt(spots, 2)?.x).toBe(30);
  });
  it('waits at the end of a line, then jumps to the next', () => {
    expect(playheadAt(spots, 3.9)).toMatchObject({ x: 40, y0: 0 });
    expect(playheadAt(spots, 4)).toMatchObject({ x: 5, y0: 100 });
  });
  it('stays on the last step after the end', () => expect(playheadAt(spots, 9)?.x).toBe(5));
});

describe('withLeadIn', () => {
  const piece = [{ ...s(0, 30), left: 10 }, s(1, 40), s(2, 50), s(3, 60)]; // 10 units a beat
  const speedOf = (spots: Spot[], from: number, to: number) => (playheadAt(spots, to)!.x - playheadAt(spots, from)!.x) / (to - from);

  it('waits at the start of the staff when the count-in is longer than the walk', () => {
    const lead = withLeadIn(piece, 4); // the walk is 2 beats
    expect(playheadAt(lead, -4)?.x).toBe(10);
    expect(playheadAt(lead, -2.5)?.x).toBe(10);
    expect(playheadAt(lead, 0)?.x).toBe(30);
  });
  it('moves at the speed of the piece, so the first note can be predicted', () => {
    const lead = withLeadIn(piece, 4);
    expect(speedOf(lead, -2, 0)).toBeCloseTo(10, 6);
    expect(speedOf(lead, 0, 2)).toBeCloseTo(10, 6);
  });
  it('starts part way along when the walk is longer than the count-in', () => {
    const lead = withLeadIn([{ ...s(0, 100), left: 10 }, s(1, 110)], 4); // the walk would be 9 beats
    expect(playheadAt(lead, -4)?.x).toBeCloseTo(60, 6);
    expect(speedOf(lead, -4, 0)).toBeCloseTo(10, 6);
  });
  it('is nothing without a score', () => expect(withLeadIn([], 4)).toEqual([]));
});
