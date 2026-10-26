import { describe, expect, it } from 'vitest';
import { Session, type CursorNote, type ScoreCursor } from './session';

/** A fake score: each step is the list of notes under the cursor. */
function fakeCursor(steps: CursorNote[][]): ScoreCursor & { index: number } {
  return {
    index: 0,
    reset() { this.index = 0; },
    notes() { return steps[this.index] ?? []; },
    beat() { return this.index; },
    next() { this.index++; },
    get done() { return this.index >= steps.length; },
  };
}

const rh = (midi: number): CursorNote => ({ midi, staff: 0 });
const lh = (midi: number): CursorNote => ({ midi, staff: 1 });

describe('Session', () => {
  it('plays through a one-hand melody and reports a summary', () => {
    let t = 1000;
    const s = new Session(fakeCursor([[rh(60)], [rh(62)]]), 'both', () => (t += 500));
    expect([...s.expected]).toEqual([60]);
    expect(s.press(60).finished).toBeNull();
    expect([...s.expected]).toEqual([62]);
    const out = s.press(62);
    expect(out.finished).toMatchObject({ steps: 2, firstTry: 2, wrong: 0, hands: 'both' });
    expect(out.finished!.durationMs).toBeGreaterThan(0);
    expect(s.finished).toBe(true);
  });

  it('requires both hands together on a shared step', () => {
    const s = new Session(fakeCursor([[rh(60), lh(48)]]), 'both');
    expect([...s.expected].sort()).toEqual([48, 60]);
    expect(s.press(60).result.kind).toBe('correct');
    expect(s.press(48).finished).not.toBeNull();
  });

  it('right hand only: ignores left-hand notes and skips left-hand-only steps', () => {
    const s = new Session(fakeCursor([[lh(48)], [rh(60), lh(48)], [lh(50)], [rh(62)]]), 'rh');
    expect([...s.expected]).toEqual([60]); // first step skipped, LH note dropped from the chord
    s.press(60);
    expect([...s.expected]).toEqual([62]); // LH-only step skipped
    expect(s.press(62).finished).toMatchObject({ steps: 2, hands: 'rh' });
  });

  it('left hand only picks the bottom staff', () => {
    const s = new Session(fakeCursor([[rh(60), lh(48)]]), 'lh');
    expect([...s.expected]).toEqual([48]);
  });

  it('counts wrong notes and lowers first-try', () => {
    const s = new Session(fakeCursor([[rh(60)], [rh(62)]]), 'both');
    s.press(61);
    s.press(60);
    const out = s.press(62);
    expect(out.finished).toMatchObject({ steps: 2, firstTry: 1, wrong: 1 });
  });

  it('a score with nothing for the chosen hand finishes immediately', () => {
    const s = new Session(fakeCursor([[lh(48)]]), 'rh');
    expect(s.finished).toBe(true);
    expect(s.press(60)).toEqual({ result: { kind: 'ignored' }, finished: null });
  });

  it('restart goes back to the start and clears stats', () => {
    const s = new Session(fakeCursor([[rh(60)], [rh(62)]]), 'both');
    s.press(61);
    s.press(60);
    s.restart();
    expect(s.stats).toEqual({ steps: 0, firstTry: 0, wrong: 0 });
    expect([...s.expected]).toEqual([60]);
  });

  it('does not start the clock until the first key press', () => {
    let t = 0;
    const s = new Session(fakeCursor([[rh(60)]]), 'both', () => t);
    t = 60_000; // sat looking at the score for a minute
    const out = s.press(60);
    t = 60_000;
    expect(out.finished!.durationMs).toBe(0);
  });
});
