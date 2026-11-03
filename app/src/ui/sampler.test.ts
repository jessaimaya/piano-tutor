import { describe, expect, it } from 'vitest';
import { attackOf, nearestRoot } from './sampler';

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

describe('attackOf', () => {
  const RATE = 1000;
  const recording = (silence: number, peak = 1) => Float32Array.from({ length: 200 }, (_, i) => (i < silence ? 0.001 : peak));

  it('skips the silence before the hammer, keeping a moment of the rise', () => {
    expect(attackOf(recording(54), RATE)).toBeCloseTo(0.052, 6);
  });
  it('judges by the loudness of this recording, so a soft one is not cut short', () => {
    expect(attackOf(recording(54, 0.05), RATE)).toBeCloseTo(0.052, 6);
  });
  it('never starts before the recording does', () => expect(attackOf(recording(0), RATE)).toBe(0));
  it('leaves a silent recording alone', () => expect(attackOf(new Float32Array(10), RATE)).toBe(0));
});
