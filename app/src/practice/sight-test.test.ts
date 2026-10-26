import { describe, expect, it } from 'vitest';
import { describeOutcome, PASS_ACCURACY, recordResult, startTest } from './sight-test';

const MAX = 7;
const run = (accs: number[]) => accs.reduce((s, a) => recordResult(s, a, MAX), startTest());

describe('sight-reading test', () => {
  it('starts at level 1 with nothing passed', () => {
    expect(startTest()).toMatchObject({ level: 1, passedLevel: 0, done: false });
  });
  it('moves up a level on every pass (80% counts)', () => {
    const s = run([0.9, PASS_ACCURACY, 1]);
    expect(s).toMatchObject({ level: 4, passedLevel: 3, done: false });
  });
  it('gives one more piece at the same level after a miss, and carries on if that one passes', () => {
    const s = run([1, 0.5]);
    expect(s).toMatchObject({ level: 2, misses: 1, passedLevel: 1, done: false });
    expect(run([1, 0.5, 0.85])).toMatchObject({ level: 3, misses: 0, passedLevel: 2, done: false });
  });
  it('ends after two misses at one level; the result is the last level passed', () => {
    expect(run([1, 1, 0.4, 0.7])).toMatchObject({ done: true, passedLevel: 2 });
    expect(run([0.2, 0.3])).toMatchObject({ done: true, passedLevel: 0 });
  });
  it('misses at different levels do not add up', () => {
    const s = run([1, 0.5, 0.9, 1, 0.5, 0.9]);
    expect(s).toMatchObject({ level: 5, passedLevel: 4, done: false });
  });
  it('ends with the top level passed, and ignores results after the end', () => {
    const s = run([1, 1, 1, 1, 1, 1, 1]);
    expect(s).toMatchObject({ done: true, passedLevel: 7 });
    expect(recordResult(s, 0, MAX)).toBe(s);
  });
  it('keeps every result for the summary', () => {
    expect(run([1, 0.5, 0.9]).results.map((r) => [r.level, r.passed])).toEqual([[1, true], [2, false], [2, true]]);
  });
  it('describes each outcome in plain words', () => {
    const name = (l: number) => `L${l}`;
    expect(describeOutcome(0, MAX, name)).toMatch(/did not pass level 1/);
    expect(describeOutcome(3, MAX, name)).toMatch(/level is 3 of 7: L3.*Level 4 \(L4\)/);
    expect(describeOutcome(7, MAX, name)).toMatch(/every level/);
  });
});
