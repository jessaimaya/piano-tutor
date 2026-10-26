import { describe, expect, it } from 'vitest';
import { accuracy, WaitMode } from './wait-mode';

describe('WaitMode', () => {
  it('advances on a single correct note', () => {
    const w = new WaitMode();
    w.begin([60]);
    expect(w.press(60)).toEqual({ kind: 'advance', note: 60 });
    expect(w.stats).toEqual({ steps: 1, firstTry: 1, wrong: 0 });
  });

  it('waits for every note of a chord, in any order', () => {
    const w = new WaitMode();
    w.begin([48, 64, 67]);
    expect(w.press(67)).toEqual({ kind: 'correct', note: 67 });
    expect(w.press(48)).toEqual({ kind: 'correct', note: 48 });
    expect(w.press(64)).toEqual({ kind: 'advance', note: 64 });
  });

  it('counts a wrong note and does not advance', () => {
    const w = new WaitMode();
    w.begin([60]);
    expect(w.press(61)).toEqual({ kind: 'wrong', note: 61 });
    expect(w.stats.wrong).toBe(1);
    expect(w.press(60).kind).toBe('advance');
  });

  it('a step with a mistake is not a first-try step', () => {
    const w = new WaitMode();
    w.begin([60]);
    w.press(62);
    w.press(60);
    w.begin([62]);
    w.press(62);
    expect(w.stats).toEqual({ steps: 2, firstTry: 1, wrong: 1 });
    expect(accuracy(w.stats)).toBe(0.5);
  });

  it('ignores a repeated press of a note already hit in the chord', () => {
    const w = new WaitMode();
    w.begin([60, 64]);
    w.press(60);
    expect(w.press(60)).toEqual({ kind: 'ignored' });
    expect(w.stats.wrong).toBe(0);
  });

  it('ignores presses when no step is active (before begin / after advance)', () => {
    const w = new WaitMode();
    expect(w.press(60)).toEqual({ kind: 'ignored' });
    w.begin([60]);
    w.press(60);
    expect(w.press(62)).toEqual({ kind: 'ignored' });
    expect(w.stats.wrong).toBe(0);
  });

  it('rejects an empty step', () => {
    expect(() => new WaitMode().begin([])).toThrow();
  });

  it('reset clears stats', () => {
    const w = new WaitMode();
    w.begin([60]);
    w.press(60);
    w.reset();
    expect(w.stats).toEqual({ steps: 0, firstTry: 0, wrong: 0 });
    expect(accuracy(w.stats)).toBe(0);
  });
});
