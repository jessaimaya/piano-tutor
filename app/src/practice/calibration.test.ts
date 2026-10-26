import { describe, expect, it } from 'vitest';
import { clampLatency, estimateLatency, matchTaps } from './calibration';

const clicks = Array.from({ length: 12 }, (_, i) => 1000 + i * 750);

describe('matchTaps', () => {
  it('pairs each click with its nearest tap and reports tap minus click', () => {
    expect(matchTaps([1000, 1750], [1040, 1790])).toEqual([40, 40]);
    expect(matchTaps([1000, 1750], [990, 1760])).toEqual([-10, 10]);
  });
  it('uses each tap once, so a double tap or a chord counts as one answer', () => {
    expect(matchTaps([1000, 1750], [1030, 1035])).toEqual([30]);
  });
  it('ignores taps far from any click and skips unanswered clicks', () => {
    expect(matchTaps([1000, 1750, 2500], [1400, 1760])).toEqual([10]);
  });
});

describe('estimateLatency', () => {
  it('takes the median offset: a steady 40 ms late is 40', () => {
    const r = estimateLatency(matchTaps(clicks, clicks.map((c, i) => c + 40 + (i % 2 ? 6 : -6))));
    expect(r).toMatchObject({ ok: true, ms: 40, taps: 12 });
  });
  it('one wild tap does not move it', () => {
    const taps = clicks.map((c) => c + 25);
    taps[5] = clicks[5]! + 280;
    expect(estimateLatency(matchTaps(clicks, taps))).toMatchObject({ ok: true, ms: 25 });
  });
  it('is negative when the player taps early', () => {
    expect(estimateLatency(matchTaps(clicks, clicks.map((c) => c - 30)))).toMatchObject({ ok: true, ms: -30 });
  });
  it('refuses too few taps, uneven taps and absurd values, with a reason', () => {
    const few = estimateLatency(matchTaps(clicks, clicks.slice(0, 5)));
    expect(few.ok).toBe(false);
    const uneven = estimateLatency(matchTaps(clicks, clicks.map((c, i) => c + (i % 2 ? 150 : -150))));
    expect(uneven).toMatchObject({ ok: false });
    expect((uneven as { reason: string }).reason).toMatch(/uneven/);
    const wrongBeat = estimateLatency(matchTaps(clicks, clicks.map((c) => c + 290), 400));
    expect((wrongBeat as { reason: string }).reason).toMatch(/mistake/);
  });
});

describe('clampLatency', () => {
  it('keeps stored values sane', () => {
    expect(clampLatency(40.4)).toBe(40);
    expect(clampLatency(9999)).toBe(250);
    expect(clampLatency(-9999)).toBe(-250);
    expect(clampLatency(NaN)).toBe(0);
  });
});
