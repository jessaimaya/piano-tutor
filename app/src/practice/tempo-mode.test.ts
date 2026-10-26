import { describe, expect, it } from 'vitest';
import { TempoRun, windowFor, LEVELS, MAX_WINDOW_MS, MIN_WINDOW_MS } from './tempo-mode';
import type { TimedStep } from './timeline';

// 60 bpm → 1 beat = 1000 ms. Count-in of 2 beats starting at t=0 → beat 0 sounds at t=2000.
const step = (rawIndex: number, beat: number, ...notes: number[]): TimedStep => ({ rawIndex, beat, notes });
const run = (steps: TimedStep[], bpm = 60, countIn = 2) => {
  const r = new TempoRun(steps, { bpm, countInBeats: countIn });
  r.start(0);
  return r;
};

describe('windowFor', () => {
  const two = [step(0, 0, 60), step(1, 1, 62)];
  it('is 40% of a beat, clamped', () => {
    expect(windowFor(60, two)).toBe(MAX_WINDOW_MS); // 400 → 300
    expect(windowFor(200, [step(0, 0, 60), step(1, 4, 62)])).toBe(MIN_WINDOW_MS); // 120 floor
  });
  it('shrinks so neighbouring notes can never share a window', () => {
    const eighths = [step(0, 0, 60), step(1, 0.5, 62)];
    expect(windowFor(120, eighths)).toBeCloseTo(0.45 * 250);
  });
  it('ignores rest-only steps when measuring gaps', () => {
    expect(windowFor(60, [step(0, 0, 60), step(1, 0.5), step(2, 4, 62)])).toBe(MAX_WINDOW_MS);
  });
});

describe('TempoRun scoring', () => {
  it('scores notes inside their window and reports signed offsets (late = positive)', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62)]);
    expect(r.press(60, 2000)).toEqual({ kind: 'hit', note: 60, offsetMs: 0, stepIdx: 0 });
    expect(r.press(62, 3040)).toEqual({ kind: 'hit', note: 62, offsetMs: 40, stepIdx: 1 });
    const u = r.update(3100);
    expect(u.phase).toBe('done');
    expect(u.summary).toMatchObject({ steps: 2, firstTry: 2, wrong: 0, matched: 2, bpm: 60, meanAbsOffsetMs: 20, biasMs: 20 });
  });

  it('early notes give a negative bias', () => {
    const r = run([step(0, 0, 60)]);
    r.press(60, 1900);
    expect(r.update(2500).summary).toMatchObject({ biasMs: -100, meanAbsOffsetMs: 100 });
  });

  it('a note outside the window is an extra note and the expected note becomes missed', () => {
    const r = run([step(0, 0, 60)]);
    expect(r.press(60, 2500)).toMatchObject({ kind: 'extra', note: 60 }); // 500 ms late, window is 300
    const u = r.update(2400); // 400 ms after the beat: past the window
    expect(u.phase).toBe('done');
    expect(u.summary).toMatchObject({ steps: 1, firstTry: 0, extra: 1, missed: 1, wrong: 2 });
  });

  it('a wrong pitch is extra, and the right note can still be hit afterwards', () => {
    const r = run([step(0, 0, 60)]);
    expect(r.press(61, 2000).kind).toBe('extra');
    expect(r.press(60, 2050).kind).toBe('hit');
    expect(r.update(2100).summary).toMatchObject({ firstTry: 1, extra: 1, wrong: 1 });
  });

  it('a chord counts as hit only when every note was played in time', () => {
    const r = run([step(0, 0, 48, 60), step(1, 1, 62)]);
    r.press(60, 2000); // forgot the left hand
    r.press(62, 3000);
    const s = r.update(4000).summary!;
    expect(s).toMatchObject({ steps: 2, firstTry: 1, missed: 1 });
  });

  it('ignores presses during the count-in', () => {
    const r = run([step(0, 0, 60)]);
    expect(r.press(60, 500)).toEqual({ kind: 'ignored' });
    expect(r.live.extra).toBe(0);
  });

  it('matches repeated pitches to the nearest expected time', () => {
    const r = run([step(0, 0, 60), step(1, 1, 60)]);
    expect(r.press(60, 2020)).toMatchObject({ kind: 'hit', offsetMs: 20 }); // first C
    expect(r.press(60, 2990)).toMatchObject({ kind: 'hit', offsetMs: -10 }); // second C, not first again
    expect(r.update(5000).summary).toMatchObject({ firstTry: 2, wrong: 0 });
  });

  it('a double press of one note is penalised as extra', () => {
    const r = run([step(0, 0, 60)]);
    r.press(60, 2000);
    expect(r.press(60, 2010).kind).toBe('extra');
  });
});

describe('TempoRun diagnostics', () => {
  it('a wrong pitch reports what was wanted at that moment', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62)]);
    expect(r.press(61, 2000)).toEqual({ kind: 'extra', note: 61, wanted: [60] });
    r.press(60, 2010);
    expect(r.press(64, 3000)).toEqual({ kind: 'extra', note: 64, wanted: [62] });
  });

  it('wanted lists only the notes of that step still unplayed', () => {
    const r = run([step(0, 0, 48, 60)]);
    r.press(60, 2000);
    expect(r.press(50, 2020)).toEqual({ kind: 'extra', note: 50, wanted: [48] });
  });

  it('the right pitch outside its window says how early or late it was', () => {
    const r = run([step(0, 0, 60)]);
    expect(r.press(60, 2500)).toEqual({ kind: 'extra', note: 60, wanted: [60], offsetMs: 500 });
    const early = run([step(0, 0, 60), step(1, 1, 62)]);
    early.press(60, 2000);
    expect(early.press(62, 2600)).toEqual({ kind: 'extra', note: 62, wanted: [62], offsetMs: -400 });
  });

  it('a late note that lands nearer the next step is still diagnosed as late, not as a wrong pitch', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62), step(2, 2, 64)]); // beat = 1000 ms, steps at 2000, 3000, 4000
    r.press(60, 2000);
    r.update(3600); // the D4 window (3000 ± 300) has closed
    // D4 (62) due at 3000, played at 3600: 600 ms late, but only 400 ms before the E4 at 4000
    expect(r.press(62, 3600)).toEqual({ kind: 'extra', note: 62, wanted: [62], offsetMs: 600 });
  });

  it('a pitch due more than 3/4 of a beat away is treated as a wrong pitch instead', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62), step(2, 2, 64)]);
    r.press(60, 2000);
    r.update(3800);
    // D4 at 3800 is 800 ms late; what to play next is the E4 at 4000
    expect(r.press(62, 3800)).toEqual({ kind: 'extra', note: 62, wanted: [64] });
  });

  it('the wanted key is the highlighted next key, even when a note was just missed behind it', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62), step(2, 2, 64)]);
    r.update(3400); // C4 and D4 windows (2000 and 3000, ±300) have both closed unplayed
    expect(r.upcoming()).toEqual([64]);
    expect(r.press(67, 3400)).toEqual({ kind: 'extra', note: 67, wanted: [64] });
  });

  it('gives no diagnosis for a note far from anything expected', () => {
    const r = run([step(0, 0, 60), step(1, 16, 62)]); // 16 beats apart
    r.press(60, 2000);
    expect(r.press(61, 9000)).toEqual({ kind: 'extra', note: 61, wanted: [] });
  });

  it('gives no diagnosis once everything has been played', () => {
    const r = run([step(0, 0, 60)]);
    r.press(60, 2000);
    expect(r.press(61, 2100)).toEqual({ kind: 'extra', note: 61, wanted: [] });
  });

  it('update reports each missed note once, when its window closes', () => {
    const r = run([step(0, 0, 48, 60), step(1, 4, 62)]);
    r.press(60, 2000);
    expect(r.update(2100).newlyMissed).toEqual([]);
    expect(r.update(2400).newlyMissed).toEqual([48]);
    expect(r.update(2500).newlyMissed).toEqual([]);
    expect(r.update(7000).newlyMissed).toEqual([62]);
  });
});

describe('TempoRun upcoming (the next key to show)', () => {
  it('is the first step from the very start, even during the count-in', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62)]);
    expect(r.upcoming()).toEqual([60]);
  });

  it('moves on the moment the step is played, long before the next note is due', () => {
    const r = run([step(0, 0, 60), step(1, 4, 62)]); // the D is four beats away
    r.press(60, 2000);
    expect(r.upcoming()).toEqual([62]);
  });

  it('for a chord, lists only the notes still to play', () => {
    const r = run([step(0, 0, 48, 60), step(1, 1, 62)]);
    r.press(60, 2000);
    expect(r.upcoming()).toEqual([48]);
  });

  it('moves on when a step is missed', () => {
    const r = run([step(0, 0, 60), step(1, 4, 62)]);
    expect(r.upcoming()).toEqual([60]);
    r.update(2400); // window closed with nothing played
    expect(r.upcoming()).toEqual([62]);
  });

  it('skips rest-only steps', () => {
    const r = run([step(0, 0, 60), step(1, 1), step(2, 2, 62)]);
    r.press(60, 2000);
    expect(r.upcoming()).toEqual([62]);
  });

  it('is empty once the run is over', () => {
    const r = run([step(0, 0, 60)]);
    r.press(60, 2000);
    r.update(2100);
    expect(r.upcoming()).toEqual([]);
  });
});

describe('TempoRun clock', () => {
  it('counts in, then plays, then finishes', () => {
    const r = run([step(0, 0, 60), step(1, 4, 62)]);
    expect(r.update(0)).toMatchObject({ phase: 'countin', countInLeft: 2, cursorRawIndex: 0 });
    expect(r.update(1100)).toMatchObject({ phase: 'countin', countInLeft: 1 });
    expect(r.update(2000)).toMatchObject({ phase: 'playing', cursorRawIndex: 0 });
    expect(r.update(6000)).toMatchObject({ phase: 'playing', cursorRawIndex: 1 });
    r.press(60, 2000); r.press(62, 6000);
    expect(r.update(6001).phase).toBe('done');
  });

  it('the cursor follows the clock through steps that are rests for the chosen hand', () => {
    const r = run([step(0, 0, 60), step(1, 1), step(2, 2), step(3, 3, 62)]);
    expect(r.update(3100).cursorRawIndex).toBe(1);
    expect(r.update(4100).cursorRawIndex).toBe(2);
    expect(r.update(5100).cursorRawIndex).toBe(3);
  });

  it('runs at the given tempo', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62)], 120); // beat = 500 ms, count-in = 1000 ms
    expect(r.timeOfBeat(1)).toBe(1500);
    expect(r.press(62, 1520).kind).toBe('hit');
  });

  it('a run where nothing is played reports zero matched notes', () => {
    const r = run([step(0, 0, 60), step(1, 1, 62)]);
    expect(r.update(9000).summary).toMatchObject({ matched: 0, extra: 0, missed: 2, firstTry: 0 });
  });

  it('a piece with nothing to play finishes at once', () => {
    expect(run([step(0, 0)]).update(0).phase).toBe('done');
  });
});

describe('compound meters', () => {
  const steps = [0, 1.5, 3].map((beat, rawIndex) => ({ rawIndex, beat, notes: [60 + rawIndex] }));

  it('counts the count-in in the piece\'s own beats: two for a bar of 6/8', () => {
    const run = new TempoRun(steps, { bpm: 90, countInBeats: 3, beatQuarters: 1.5 }); // 60 dotted quarters per minute
    run.start(0);
    expect(run.update(10).countInLeft).toBe(2);
    expect(run.update(1100).countInLeft).toBe(1);
    const simple = new TempoRun(steps, { bpm: 60, countInBeats: 3 });
    simple.start(0);
    expect(simple.update(10).countInLeft).toBe(3);
  });

  it('puts notes where the quarter-note timeline says, whatever the beat unit', () => {
    const run = new TempoRun(steps, { bpm: 90, countInBeats: 3, beatQuarters: 1.5 });
    run.start(0);
    expect(run.timeOfBeat(1.5) - run.timeOfBeat(0)).toBeCloseTo(1000); // one dotted-quarter beat at 60/min
  });
});

describe('steps that start partway into the piece', () => {
  // A range from bar 3: the steps keep their position in the score (rawIndex 8…) but beats count from 0.
  const steps = [0, 1, 2].map((beat, i) => ({ rawIndex: 8 + i, beat, notes: [60 + i] }));

  it('reports the score position, not the index into the steps', () => {
    const run = new TempoRun(steps, { bpm: 60, countInBeats: 2 });
    run.start(0);
    expect(run.update(100).cursorRawIndex).toBe(8); // count-in: sit on the first step of the range
    expect(run.update(2000 + 1100).cursorRawIndex).toBe(9);
  });
});

describe('a player who keeps a steady offset from the clock', () => {
  // C4 D4 E4(half) then rests, at 44 bpm: the second note is judged on its own time, not on when the first was played
  const piece = [step(0, 0, 60), step(1, 1, 62), step(2, 2, 64)];
  const play = (offsetMs: number) => {
    const r = run(piece, 44, 4);
    const hits = [60, 62, 64].map((n, i) => r.press(n, r.timeOfBeat(i) + offsetMs).kind);
    return hits;
  };

  it('scores every note when on the beat', () => expect(play(0)).toEqual(['hit', 'hit', 'hit']));
  it('scores every note up to the window, early or late', () => {
    expect(play(250)).toEqual(['hit', 'hit', 'hit']);
    expect(play(-250)).toEqual(['hit', 'hit', 'hit']);
  });
  it('misses every note, not only the later ones, when past the window', () => {
    expect(play(MAX_WINDOW_MS + 60)).toEqual(['extra', 'extra', 'extra']);
  });
  it('a player who is slowly dragging loses the notes once the drift passes the window', () => {
    const r = run(piece, 44, 4);
    const drift = [0, 150, 340].map((d, i) => r.press([60, 62, 64][i]!, r.timeOfBeat(i) + d).kind);
    expect(drift).toEqual(['hit', 'hit', 'extra']);
  });
});

describe('levels', () => {
  const piece = [step(0, 0, 60), step(1, 1, 62), step(2, 2, 64)];
  const at = (level: 'beginner' | 'intermediate' | 'advanced', offsetMs: number) => {
    const r = new TempoRun(piece, { bpm: 60, countInBeats: 4, level });
    r.start(0);
    return r.press(62, r.timeOfBeat(1) + offsetMs).kind;
  };

  it('windows grow from advanced to beginner', () => {
    const w = (l: 'beginner' | 'intermediate' | 'advanced') => windowFor(60, piece, 1, l);
    expect(w('advanced')).toBeLessThan(w('intermediate'));
    expect(w('intermediate')).toBeLessThan(w('beginner'));
    expect(w('advanced')).toBe(LEVELS.advanced.max);
    expect(w('beginner')).toBe(LEVELS.beginner.max);
  });
  it('a note 323 ms early scores for a beginner only', () => {
    expect(at('beginner', -323)).toBe('hit');
    expect(at('intermediate', -323)).toBe('extra');
    expect(at('advanced', -323)).toBe('extra');
  });
  it('a note 200 ms late scores for beginner and intermediate, not advanced', () => {
    expect(at('beginner', 200)).toBe('hit');
    expect(at('intermediate', 200)).toBe('hit');
    expect(at('advanced', 200)).toBe('extra');
  });
  it('defaults to intermediate', () => expect(windowFor(60, piece)).toBe(windowFor(60, piece, 1, 'intermediate')));
});

describe('a player rushing ahead of the beat', () => {
  it('is told a later note was right but early, not that it was the wrong pitch', () => {
    const steps = [step(0, 0, 64), step(1, 3, 62), step(2, 4, 60)];
    const r = run(steps, 60, 2);
    // E4 is still open but long past; D4 comes 1.2 beats before its time
    expect(r.press(62, r.timeOfBeat(3) - 1200)).toMatchObject({ kind: 'extra', offsetMs: -1200 });
  });
  it('but a key that is another note\'s pitch while that note is due is a wrong pitch', () => {
    const steps = [step(0, 0, 69), step(1, 1, 67)];
    const r = run(steps, 60, 2);
    // G4 pressed on the beat where A4 is due, a beat before G4's own time
    const p = r.press(67, r.timeOfBeat(0) + 10);
    expect(p).toMatchObject({ kind: 'extra', wanted: [69] });
    expect(p).not.toHaveProperty('offsetMs');
  });
  it('a hit says which step it belonged to', () => {
    const steps = [step(0, 0, 60), step(1, 1, 62)];
    const r = run(steps, 60, 2);
    expect(r.press(62, r.timeOfBeat(1) - 60)).toMatchObject({ kind: 'hit', stepIdx: 1 });
  });
});
