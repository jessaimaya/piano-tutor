import { describe, expect, it } from 'vitest';
import type { Course } from './ladder';
import {
  advance, applyPlacement, skipPlacement, applyTest, cardsPass, closeDay, countProgress, currentStep, currentStreak, dateKey, daysBetween, finishStep, markDone,
  newState, noteCard, noteReading, parseState, startDay, unitComplete, unmarkDone, CARDS_WINDOW, type CourseState, type Step,
} from './state';

const step = (kind: Step['kind'], core = false, goal = 1, extra: Partial<Step> = {}): Step =>
  ({ kind, minutes: 3, title: kind, text: '', goal, core, target: { mode: 'tempo' }, ...extra });
const day = (): Step[] => [step('warmup'), step('reading', true, 2), step('newbars', true, 1, { target: { mode: 'wait', pieceId: 'p1', hands: 'rh' } }), step('play')];

const COURSE: Course = {
  version: 1, placement: [{ passed: 0, unit: 'u1' }, { passed: 2, unit: 'u2' }],
  units: [
    { id: 'u1', stage: 0, title: '', reading: { from: 1, to: 3 }, warmup: [], main: ['a', 'b'], exit: { finished: ['b'] } },
    { id: 'u2', stage: 0, title: '', reading: { from: 1, to: 3 }, warmup: [], main: ['c'], exit: { finished: ['c'], readingLevel: 2 } },
    { id: 'u3', stage: 1, title: '', reading: { from: 2, to: 4 }, warmup: [], main: ['d'], exit: { finished: ['d'], cards: true } },
  ],
};

describe('dates', () => {
  it('uses the local calendar day and counts days between', () => {
    expect(dateKey(new Date(2026, 9, 26, 23, 59))).toBe('2026-10-26');
    expect(daysBetween('2026-10-26', '2026-10-27')).toBe(1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // across a month end
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('saved state', () => {
  it('reads what it wrote, and starts fresh from anything unreadable', () => {
    const s = { ...newState('u2'), streak: 3, cards: [true, false] };
    expect(parseState(JSON.stringify(s))).toEqual(s);
    for (const bad of [null, '', '{nope', '[]', JSON.stringify({ version: 2, unitId: 'x' }), JSON.stringify({ version: 1 })]) {
      expect(parseState(bad, 'u1')).toEqual(newState('u1'));
    }
  });

  it('keeps only valid lengths and minutes', () => {
    const s = parseState(JSON.stringify({ ...newState(), minutes: 17, cards: Array(50).fill(true) }));
    expect(s.minutes).toBe(25);
    expect(s.cards).toHaveLength(CARDS_WINDOW);
  });
});

describe('a day', () => {
  it('keeps a plan already made for today, replaces yesterday’s', () => {
    const a = startDay(newState(), day(), '2026-10-26');
    const progressed = countProgress(a, 1).state;
    expect(startDay(progressed, day(), '2026-10-26')).toBe(progressed);
    expect(startDay(progressed, day(), '2026-10-27').today?.progress).toEqual([0, 0, 0, 0]);
  });

  it('starts over when the length changes before anything was done', () => {
    const a = startDay(newState(), day(), '2026-10-26');
    expect(startDay({ ...a, minutes: 10 }, day().slice(0, 3), '2026-10-26').today?.steps).toHaveLength(3);
  });

  it('keeps a day that is under way when the length changes: the new length applies tomorrow', () => {
    const a = countProgress(startDay(newState(), day(), '2026-10-26'), 1).state;
    const b = startDay({ ...a, minutes: 10 }, day().slice(0, 3), '2026-10-26');
    expect(b.today?.steps).toHaveLength(4);
    expect(startDay({ ...a, minutes: 10 }, day().slice(0, 3), '2026-10-27').today?.steps).toHaveLength(3);
  });

  it('shows the first open step and wraps past skipped ones', () => {
    let s = startDay(newState(), day(), '2026-10-26');
    expect(currentStep(s.today)).toBe(0);
    s = finishStep(s, 0, 'done');
    s = finishStep(s, 1, 'skipped');
    expect(currentStep(s.today)).toBe(2);
    expect(currentStep(s.today, 3)).toBe(3);
    s = finishStep(finishStep(s, 2, 'done'), 3, 'done');
    expect(currentStep(s.today)).toBeUndefined();
  });

  it('does not change a step that is already done', () => {
    let s = startDay(newState(), day(), '2026-10-26');
    s = finishStep(finishStep(s, 0, 'done'), 0, 'skipped');
    expect(s.today?.states[0]).toBe('done');
  });

  it('reports when a step reaches its goal exactly once', () => {
    let s = startDay(newState(), day(), '2026-10-26');
    let r = countProgress(s, 1);
    expect(r.reached).toBe(false);
    r = countProgress(r.state, 1);
    expect(r.reached).toBe(true);
    expect(countProgress(r.state, 1).reached).toBe(false);
  });
});

describe('closing a day', () => {
  const play = (s: CourseState, date: string, core = true): CourseState => {
    let t = startDay({ ...s, today: undefined }, day(), date);
    t = finishStep(t, 1, core ? 'done' : 'skipped');
    t = finishStep(t, 2, 'done');
    return closeDay(t);
  };

  it('counts a day whose core steps are done, and grows the streak on consecutive days', () => {
    let s = play(newState(), '2026-10-26');
    expect([s.streak, s.sessions, s.lastCompleteDate]).toEqual([1, 1, '2026-10-26']);
    s = play(s, '2026-10-27');
    expect(s.streak).toBe(2);
    s = play(s, '2026-10-29'); // a missed day: the streak starts again, nothing else is lost
    expect([s.streak, s.bestStreak, s.sessions]).toEqual([1, 2, 3]);
  });

  it('does not count a day with a core step skipped', () => {
    const s = play(newState(), '2026-10-26', false);
    expect([s.streak, s.sessions]).toEqual([0, 0]);
    expect(s.days.at(-1)).toMatchObject({ done: 1, total: 4 });
  });

  it('counts the second close of the same day once', () => {
    let s = play(newState(), '2026-10-26');
    s = closeDay(s);
    expect([s.streak, s.sessions]).toEqual([1, 1]);
  });

  it('moves the piece’s day counter only for a new-bars step that was done', () => {
    expect(play(newState(), '2026-10-26').pieceDays).toEqual({ p1: 1 });
  });

  it('shows the streak as 0 once a day has been missed', () => {
    const s = play(newState(), '2026-10-26');
    expect(currentStreak(s, '2026-10-26')).toBe(1);
    expect(currentStreak(s, '2026-10-27')).toBe(1);
    expect(currentStreak(s, '2026-10-28')).toBe(0);
    expect(currentStreak(newState(), '2026-10-28')).toBe(0);
  });

  it('moves the reading rung inside the unit: two good days up, a poor day down, never past its range', () => {
    const readDay = (s: CourseState, date: string, acc: number): CourseState => {
      let t = startDay({ ...s, today: undefined }, day(), date);
      t = noteReading(t, acc);
      t = finishStep(finishStep(t, 1, 'done'), 2, 'done');
      return closeDay(t, COURSE);
    };
    let s = { ...newState('u1'), readingLevel: 1 }; // u1 covers rungs 1 to 3
    s = readDay(s, '2026-10-26', 0.9);
    expect([s.readingLevel, s.readingPasses]).toEqual([1, 1]);
    s = readDay(s, '2026-10-27', 0.85);
    expect([s.readingLevel, s.readingPasses]).toEqual([2, 0]);
    s = readDay(s, '2026-10-28', 0.65); // in between: no change, the run of good days ends
    expect([s.readingLevel, s.readingPasses]).toEqual([2, 0]);
    s = readDay(s, '2026-10-29', 0.3);
    expect(s.readingLevel).toBe(1);
    expect(readDay(s, '2026-10-30', 0.1).readingLevel).toBe(1); // never below the unit's first rung
    let top = { ...newState('u1'), readingLevel: 3 };
    top = readDay(readDay(top, '2026-11-01', 0.95), '2026-11-02', 0.95);
    expect(top.readingLevel).toBe(3); // never past the unit's last rung, however well it goes
  });
});

describe('days in a unit', () => {
  const counted = (s: CourseState, date: string): CourseState => {
    const t = startDay({ ...s, today: undefined }, day(), date);
    return closeDay(finishStep(finishStep(t, 1, 'done'), 2, 'done'), COURSE);
  };

  it('counts a day once, however often it is closed, and only when it counted', () => {
    let s = counted(newState('u1'), '2026-10-26');
    expect([s.sessions, s.unitDays]).toEqual([1, 1]);
    s = closeDay({ ...s, today: s.today && { ...s.today, closed: false } }, COURSE);
    expect(s.unitDays).toBe(1); // the same date again
    s = counted(s, '2026-10-27');
    expect(s.unitDays).toBe(2);
    const skipped = closeDay(startDay(newState('u1'), day(), '2026-10-26'), COURSE); // nothing done: the core steps are not done
    expect(skipped.unitDays).toBe(0);
  });

  it('starts again at zero in a new unit, and after the placement test', () => {
    const s = { ...newState('u1'), unitDays: 6, readingLevel: 1 };
    expect(advance(s, COURSE, (id) => id === 'b').state.unitDays).toBe(0);
    expect(applyPlacement(s, 2, '2026-10-26', COURSE).unitDays).toBe(0);
    expect(parseState(JSON.stringify(s)).unitDays).toBe(6);
    expect(parseState(JSON.stringify({ ...s, unitDays: undefined })).unitDays).toBe(0); // an older save
  });
});

describe('note cards', () => {
  it('keeps count per card: fast answers add one, a miss takes one away, never below nothing', () => {
    let s = noteCard(newState(), true, 900, 'treble:C4');
    s = noteCard(s, true, 900, 'treble:C4');
    s = noteCard(s, true, 2500, 'treble:C4'); // right but slow: no change
    expect(s.cardFast['treble:C4']).toBe(2);
    s = noteCard(s, false, 900, 'treble:C4');
    expect(s.cardFast['treble:C4']).toBe(1);
    expect(noteCard(noteCard(newState(), false, 900, 'bass:F3'), false, 900, 'bass:F3').cardFast['bass:F3']).toBe(0);
    expect(noteCard(newState(), true, 900).cardFast).toEqual({}); // no key: only the window of twenty moves
  });

  it('counts a card as fast only when it is right and within two seconds', () => {
    let s = noteCard(newState(), true, 1500);
    s = noteCard(s, true, 2500);
    s = noteCard(s, false, 500);
    expect(s.cards).toEqual([true, false, false]);
  });

  it('passes with 18 fast of the last 20, and only after 20 cards', () => {
    let s = newState();
    for (let i = 0; i < 19; i++) s = noteCard(s, true, 1000);
    expect(cardsPass(s)).toBe(false);
    s = noteCard(s, true, 1000);
    expect(cardsPass(s)).toBe(true);
    s = noteCard(noteCard(noteCard(s, false, 0), false, 0), false, 0);
    expect(cardsPass(s)).toBe(false);
  });
});

describe('units', () => {
  const fin = (...ids: string[]) => (id: string) => ids.includes(id);

  it('is complete when every exit piece is finished, the reading level is high enough and the cards pass', () => {
    const u2 = COURSE.units[1]!;
    expect(unitComplete(u2, newState('u2'), fin('c'))).toBe(false); // reading level 1 < 2
    expect(unitComplete(u2, { ...newState('u2'), readingLevel: 2 }, fin('c'))).toBe(true);
    expect(unitComplete(u2, { ...newState('u2'), readingLevel: 2 }, fin())).toBe(false);
    const u3 = COURSE.units[2]!;
    expect(unitComplete(u3, newState('u3'), fin('d'))).toBe(false); // the cards have not passed
  });

  it('advances through every unit whose exit is already met, and stops at the first that is not', () => {
    const a = advance({ ...newState('u1'), readingLevel: 2 }, COURSE, fin('b', 'c'));
    expect(a.from).toEqual(['u1', 'u2']);
    expect(a.state.unitId).toBe('u3');
    expect(a.courseDone).toBe(false);
    expect(advance(newState('u1'), COURSE, fin()).state.unitId).toBe('u1');
  });

  it('says so when the last unit is finished', () => {
    let s = newState('u3');
    for (let i = 0; i < 20; i++) s = noteCard(s, true, 500);
    const a = advance(s, COURSE, fin('d'));
    expect(a.courseDone).toBe(true);
    expect(a.state.unitId).toBe('u3');
  });

  it('forgets today’s plan when the unit changes, because it belonged to the old unit', () => {
    const s = startDay(newState('u1'), day(), '2026-10-26');
    expect(advance(s, COURSE, fin('b')).state.today).toBeUndefined();
  });

  it('lets a piece be marked done by hand and unmarked', () => {
    let s = markDone(newState(), 'a');
    s = markDone(s, 'a');
    expect(s.overrides).toEqual(['a']);
    expect(unmarkDone(s, 'a').overrides).toEqual([]);
  });
});

describe('placement', () => {
  it('starts at the unit the test result points to, on that unit’s first reading rung, and forgets the old day', () => {
    const s = applyPlacement(startDay(newState(), day(), '2026-10-26'), 2, '2026-10-26', COURSE);
    expect([s.unitId, s.readingLevel, s.lastTestDate, s.today]).toEqual(['u2', 1, '2026-10-26', undefined]);
    expect(s.placement).toEqual({ level: 2, date: '2026-10-26' });
    expect(applyPlacement({ ...newState('u2'), readingLevel: 9 }, 0, '2026-10-26', COURSE).readingLevel).toBe(1);
  });

  it('can be skipped, and the choice is remembered', () => {
    expect(parseState(JSON.stringify(skipPlacement(newState()))).placementSkipped).toBe(true);
  });

  it('a later test changes only the date: the reading rung follows the lessons, not the test', () => {
    const s = applyTest({ ...newState('u2'), readingLevel: 2 }, 7, '2026-11-23');
    expect([s.unitId, s.readingLevel, s.lastTestDate]).toEqual(['u2', 2, '2026-11-23']);
  });

  it('starts a new unit on its first reading rung, or further on if the player is already there', () => {
    const done = (id: string) => ['a', 'b', 'c'].includes(id);
    expect(advance({ ...newState('u2'), readingLevel: 1 }, COURSE, (id) => id === 'c').state.readingLevel).toBe(1);
    expect(advance({ ...newState('u2'), readingLevel: 2 }, COURSE, done).state.unitId).toBe('u3');
    const entered = advance({ ...newState('u2'), readingLevel: 2, cards: Array(20).fill(true) }, COURSE, done).state;
    expect([entered.unitId, entered.readingLevel]).toEqual(['u3', 2]);
    expect(advance({ ...newState('u2'), readingLevel: 2, readingPasses: 1, cards: Array(20).fill(true) }, COURSE, done).state.readingPasses).toBe(0);
  });
});
