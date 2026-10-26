import { describe, expect, it } from 'vitest';
import { playheadAt, type Spot } from './playhead';

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
