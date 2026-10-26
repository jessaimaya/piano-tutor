import { describe, expect, it } from 'vitest';
import type { RunRecord } from './log';
import { compareWithHistory, needsPractice, noteCredit, progressOf, runScore, starsFor, tempoScore, verdict } from './scoring';

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  pieceId: 'p', at: '2026-01-01T00:00:00Z', hands: 'both', durationMs: 1000, steps: 10, firstTry: 10, wrong: 0, ...over,
});

describe('tempoScore', () => {
  it('is 100 for a run on the beat', () => expect(tempoScore([0, -20, 40, 10], 4, 0)).toBe(100));
  it('gives less credit the further from the beat, down to 60% at 250 ms', () => {
    expect(noteCredit(50)).toBe(1);
    expect(noteCredit(150)).toBeCloseTo(0.8);
    expect(noteCredit(250)).toBeCloseTo(0.6);
    expect(noteCredit(400)).toBeCloseTo(0.6);
  });
  it('scores a sloppy but complete run around 60', () => expect(tempoScore([300, -300, 300, -300], 4, 0)).toBe(60));
  it('gives nothing for a missed note', () => expect(tempoScore([0, 0, 0], 4, 0)).toBe(75));
  it('takes a quarter of a note off for each extra key', () => expect(tempoScore([0, 0, 0, 0], 4, 2)).toBe(88));
  it('never goes below 0', () => expect(tempoScore([], 4, 20)).toBe(0));
  it('is 0 with nothing to play', () => expect(tempoScore([], 0, 0)).toBe(0));
});

describe('stars and verdicts', () => {
  it('maps scores to 0–3 stars', () => {
    expect([100, 90, 89, 75, 74, 50, 49, 0].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
  });
  it('words match the stars', () => expect([95, 80, 60, 20].map(verdict)).toEqual(['Excellent', 'Good', 'Getting there', 'Needs work']));
});

describe('runScore', () => {
  it('uses the stored score', () => expect(runScore(run({ score: 82, firstTry: 3 }))).toBe(82));
  it('falls back to first-try accuracy for older runs', () => expect(runScore(run({ steps: 8, firstTry: 6 }))).toBe(75));
});

describe('progressOf', () => {
  it('is empty before any run', () => expect(progressOf([])).toEqual({ runs: 0, recent: [] }));
  it('reports best, last and the previous run of the same mode', () => {
    const p = progressOf([
      run({ mode: 'tempo', score: 60 }), run({ mode: 'wait', score: 99 }), run({ mode: 'tempo', score: 90 }), run({ mode: 'tempo', score: 72 }),
    ]);
    expect(p).toMatchObject({ runs: 4, best: 99, lastScore: 72, previousScore: 90, recent: [60, 99, 90, 72] });
  });
  it('ignores runs on a few bars', () => {
    const p = progressOf([run({ score: 80 }), run({ score: 10, bars: [1, 2] })]);
    expect(p).toMatchObject({ runs: 1, best: 80, lastScore: 80 });
  });
  it('keeps the most recent twelve scores', () => {
    const p = progressOf(Array.from({ length: 15 }, (_, i) => run({ score: i })));
    expect(p.recent).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
  it('flags a piece for practice when the last run is under 75', () => {
    expect(needsPractice(progressOf([run({ score: 74 })]))).toBe(true);
    expect(needsPractice(progressOf([run({ score: 90 }), run({ score: 75 })]))).toBe(false);
    expect(needsPractice(progressOf([]))).toBe(false);
  });
});

describe('compareWithHistory', () => {
  it('compares with the previous run of the same mode and the best before it', () => {
    const earlier = [run({ mode: 'tempo', score: 60 }), run({ mode: 'wait', score: 99 }), run({ mode: 'tempo', score: 80 })];
    expect(compareWithHistory(earlier, run({ mode: 'tempo', score: 85 }))).toEqual({ previous: 80, bestBefore: 80 });
  });
  it('keeps bar practice apart from whole-piece runs', () => {
    const earlier = [run({ mode: 'tempo', score: 50, bars: [1, 2] }), run({ mode: 'tempo', score: 90 })];
    expect(compareWithHistory(earlier, run({ mode: 'tempo', score: 70, bars: [1, 2] }))).toEqual({ previous: 50, bestBefore: 50 });
  });
  it('has nothing to compare with the first time', () => expect(compareWithHistory([], run())).toEqual({ previous: undefined, bestBefore: undefined }));
});
