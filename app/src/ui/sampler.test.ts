import { describe, expect, it } from 'vitest';
import { nearestRoot } from './sampler';

const roots = [36, 37, 38, 60, 61, 79, 81].map((midi) => ({ midi }));

describe('nearestRoot', () => {
  it('uses the key\'s own sample at its own speed', () => {
    expect(nearestRoot(roots, 60)).toEqual({ root: { midi: 60 }, rate: 1 });
  });

  it('shifts the nearest sample for a key that has none', () => {
    const up = nearestRoot(roots, 62)!; // 61 is nearest, one semitone up
    expect(up.root.midi).toBe(61);
    expect(up.rate).toBeCloseTo(2 ** (1 / 12), 6);
    const down = nearestRoot(roots, 80)!; // 79 and 81 are equally close
    expect([79, 81]).toContain(down.root.midi);
    expect(down.rate).toBeCloseTo(down.root.midi === 79 ? 2 ** (1 / 12) : 2 ** (-1 / 12), 6);
  });

  it('gives up when the nearest sample is too far to sound right', () => {
    expect(nearestRoot(roots, 100)).toBeUndefined();
    expect(nearestRoot(roots, 24)).toBeUndefined();
    expect(nearestRoot(roots, 84)?.root.midi).toBe(81); // within the limit
    expect(nearestRoot([], 60)).toBeUndefined();
  });
});
