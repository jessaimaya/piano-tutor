import { describe, expect, it } from 'vitest';
import type { Hands } from '../practice/log';
import type { Unit } from './ladder';
import { buildDay, handsForDay, reviewPool, supportedMinutes, testDue, SLOTS, type PieceInfo, type PlanInput } from './plan';
import { newState, type CourseState } from './state';

const INFO: Record<string, PieceInfo> = {
  a: { id: 'a', title: 'Alpha', hands: 'both', targetBpm: 60 },
  b: { id: 'b', title: 'Beta', hands: 'rh', targetBpm: 60 },
  c: { id: 'c', title: 'Gamma', hands: 'both', targetBpm: 60 },
  old1: { id: 'old1', title: 'Old one', hands: 'both', targetBpm: 60 },
  old2: { id: 'old2', title: 'Old two', hands: 'lh', targetBpm: 60 },
  'w-c': { id: 'w-c', title: 'Five fingers: C position', hands: 'both', targetBpm: 72 },
  'w-g': { id: 'w-g', title: 'Five fingers: G position', hands: 'both', targetBpm: 72 },
};
const unit = (stage = 1): Unit => ({
  id: 'u', stage, title: 'U', reading: { from: 2, to: 3 }, warmup: ['w-c', 'w-g'], main: ['a', 'b', 'c'], exit: { finished: ['c'] },
});
const MONDAY = new Date(2026, 9, 26);
const SATURDAY = new Date(2026, 9, 31);

const input = (over: Partial<PlanInput> = {}, state: CourseState = newState('u')): PlanInput => ({
  minutes: 25, date: MONDAY, state, unit: unit(), piece: (id) => INFO[id], isFinished: () => false,
  coursePieces: ['old1', 'old2', 'a', 'b', 'c'], testDue: false, ...over,
});
const kinds = (steps: { kind: string }[]) => steps.map((s) => s.kind);

describe('lengths', () => {
  it('has a plan for every supported length whose minutes add up', () => {
    for (const [m, slots] of Object.entries(SLOTS)) {
      const total = slots.reduce((a, [, x]) => a + x, 0);
      expect(total, `${m} min`).toBe(Number(m));
    }
  });

  it('rounds an odd length down to a supported one', () => {
    expect([5, 10, 17, 25, 29, 31, 60].map(supportedMinutes)).toEqual([10, 10, 15, 25, 25, 30, 45]);
  });

  it('gives 6 dots at 25 minutes: warm-up, reading, new bars, steady, review, play', () => {
    const steps = buildDay(input());
    expect(kinds(steps)).toEqual(['warmup', 'reading', 'newbars', 'steady', 'review', 'play']);
    expect(steps.map((s) => s.minutes)).toEqual([3, 5, 6, 6, 3, 2]);
  });

  it('keeps reading and the main work at every length, and drops the warm-up first', () => {
    for (const m of [10, 15, 20, 25, 30, 45]) {
      const k = kinds(buildDay(input({ minutes: m })));
      expect(k, `${m}`).toContain('reading');
      expect(k, `${m}`).toContain('newbars');
    }
    expect(kinds(buildDay(input({ minutes: 10 })))).toEqual(['reading', 'newbars', 'play']);
    expect(kinds(buildDay(input({ minutes: 15 })))).toEqual(['reading', 'newbars', 'steady', 'play']);
  });

  it('adds a second piece at 45 minutes', () => {
    const steps = buildDay(input({ minutes: 45 }));
    expect(kinds(steps)).toEqual(['warmup', 'reading', 'newbars', 'steady', 'newbars', 'steady', 'review', 'play']);
    expect(steps[2]!.target.pieceId).toBe('a');
    expect(steps[4]!.target.pieceId).toBe('b');
    expect(steps[5]!.target.pieceId).toBe('b');
  });

  it('marks reading and new bars as the steps that count for the streak', () => {
    expect(buildDay(input()).filter((s) => s.core).map((s) => s.kind)).toEqual(['reading', 'newbars']);
  });
});

describe('hands by day of the piece', () => {
  it('goes right hand, left hand, both slowly, then both', () => {
    expect(handsForDay(1, 'both')).toEqual({ hands: 'rh', both: false, first: true });
    expect(handsForDay(2, 'both')).toEqual({ hands: 'lh', both: false, first: false });
    expect(handsForDay(3, 'both')).toEqual({ hands: 'both', both: true, first: true });
    expect(handsForDay(4, 'both')).toEqual({ hands: 'both', both: true, first: false });
  });

  it('keeps a one-handed piece on its hand', () => {
    for (const h of ['rh', 'lh'] as Hands[]) {
      expect(handsForDay(1, h).hands).toBe(h);
      expect(handsForDay(5, h)).toMatchObject({ hands: h, both: false });
    }
  });

  it('plans today’s piece from its day counter', () => {
    const at = (days: number) => buildDay(input({}, { ...newState('u'), pieceDays: { a: days } }));
    expect(at(0)[2]!.target).toMatchObject({ pieceId: 'a', hands: 'rh', mode: 'wait' });
    expect(at(0)[2]!.text).toMatch(/Listen/);
    expect(at(1)[2]!.target.hands).toBe('lh');
    expect(at(1)[2]!.text).not.toMatch(/Listen/);
    const third = at(2);
    expect(third[2]!.target.hands).toBe('both');
    expect(third[3]!.target).toMatchObject({ mode: 'tempo', hands: 'both', tempoShare: 0.5, forceTempo: true });
    expect(at(3)[3]!.target).toMatchObject({ tempoShare: 0.7, forceTempo: false });
  });
});

describe('which piece', () => {
  it('takes the first piece of the unit that is not finished', () => {
    const steps = buildDay(input({ isFinished: (id) => id === 'a' }));
    expect(steps[2]!.target.pieceId).toBe('b');
  });

  it('keeps working on the last piece when all are finished but the unit is not', () => {
    expect(buildDay(input({ isFinished: () => true }))[2]!.target.pieceId).toBe('c');
  });
});

describe('review and play', () => {
  it('reviews the finished piece that has waited longest, and plays the next one', () => {
    const state = { ...newState('u'), lastPlayed: { old1: '2026-10-25', old2: '2026-10-20' } };
    const steps = buildDay(input({ isFinished: (id) => id.startsWith('old') }, state));
    expect(steps.find((s) => s.kind === 'review')!.target.pieceId).toBe('old2');
    expect(steps.find((s) => s.kind === 'play')!.target.pieceId).toBe('old1');
  });

  it('puts a piece never played before one that was', () => {
    const state = { ...newState('u'), lastPlayed: { old1: '2026-10-25' } };
    expect(reviewPool(input({ isFinished: (id) => id.startsWith('old') }, state), [])).toEqual(['old2', 'old1']);
  });

  it('never reviews today’s own piece', () => {
    const steps = buildDay(input({ isFinished: (id) => id === 'a' || id === 'old1' }));
    expect(steps[2]!.target.pieceId).toBe('b');
    expect(steps.find((s) => s.kind === 'review')!.target.pieceId).toBe('old1');
  });

  it('has something to review on the very first days, when nothing is finished', () => {
    const steps = buildDay(input());
    const review = steps.find((s) => s.kind === 'review')!;
    const play = steps.find((s) => s.kind === 'play')!;
    expect(review.target.pieceId).toBe('w-c'); // nothing is finished, so the warm-up exercise is what you know best
    expect(play.target.pieceId).toBe('a'); // today's piece, not one you have never seen
  });

  it('never asks for both hands on the first day of a piece, not in review nor in play', () => {
    const steps = buildDay(input({ unit: { ...unit(0), warmupHands: ['rh', 'lh'] } }));
    for (const kind of ['review', 'play']) {
      expect(steps.find((s) => s.kind === kind)!.target.hands, kind).toBe('rh');
    }
  });

  it('at 20 minutes the play step takes the oldest finished piece, since there is no review step', () => {
    const steps = buildDay(input({ minutes: 20, isFinished: (id) => id === 'old1' }));
    expect(steps.find((s) => s.kind === 'play')!.target.pieceId).toBe('old1');
  });
});

describe('warm-up and note cards', () => {
  const at = (unitDays: number, over: Partial<Unit> = {}, stage = 1) =>
    buildDay(input({ unit: { ...unit(stage), ...over } }, { ...newState('u'), unitDays }))[0]!;

  it('climbs the unit’s list: two warm-up days on each exercise, then the next, and it stays on the last', () => {
    expect([0, 1, 2, 3, 4, 9].map((d) => at(d).target.pieceId)).toEqual(['w-c', 'w-c', 'w-g', 'w-g', 'w-g', 'w-g']);
    expect(at(0).title).toBe('Warm-up: C position');
  });

  it('goes round the list instead when the unit asks for it', () => {
    expect([0, 1, 2, 3].map((d) => at(d, { warmupRotate: true }).target.pieceId)).toEqual(['w-c', 'w-g', 'w-c', 'w-g']);
  });

  it('uses note cards on every second day of a stage 0 unit only, starting with the five fingers', () => {
    expect(at(0, {}, 0).kind).toBe('warmup');
    expect(at(1, {}, 0).kind).toBe('cards');
    expect(at(1, {}, 0).goal).toBe(10);
    expect(at(2, {}, 0).kind).toBe('warmup');
    expect(at(3, {}, 0).kind).toBe('cards');
    expect(at(1, {}, 1).kind).toBe('warmup');
  });

  it('counts only the warm-up days in stage 0, so the exercise changes every four days there', () => {
    const warm = (d: number) => at(d, {}, 0);
    expect([0, 2, 4, 6, 8].map((d) => warm(d).target.pieceId)).toEqual(['w-c', 'w-c', 'w-g', 'w-g', 'w-g']);
  });

  it('keeps a scale for one hand on that hand', () => {
    const only = buildDay(input({ unit: unit(2), piece: (id) => (id === 'w-c' ? { ...INFO['w-c']!, hands: 'rh' } : INFO[id]) }, newState('u')))[0]!;
    expect(only.target.hands).toBe('rh');
  });
});

describe('warm-up hands', () => {
  const warm = (unitDays: number, stage: number, warmupHands?: Hands[]) =>
    buildDay(input({ unit: { ...unit(stage), warmupHands } }, { ...newState('u'), unitDays })).find((s) => s.kind === 'warmup')!;

  it('uses the unit’s hands in turn, and both hands when it names none', () => {
    expect(warm(0, 1, ['rh', 'lh', 'both']).target.hands).toBe('rh');
    expect(warm(1, 1, ['rh', 'lh', 'both']).target.hands).toBe('lh');
    expect(warm(2, 1, ['rh', 'lh', 'both']).target.hands).toBe('both');
    expect(warm(0, 1).target.hands).toBe('both');
  });

  it('turns once per warm-up day in stage 0, where the cards take every other day', () => {
    expect(warm(0, 0, ['rh', 'lh']).target.hands).toBe('rh');
    expect(warm(2, 0, ['rh', 'lh']).target.hands).toBe('lh');
    expect(warm(4, 0, ['rh', 'lh']).target.hands).toBe('rh');
  });

  it('says which hand in the step text', () => {
    expect(warm(0, 0, ['rh']).text).toContain('right hand');
    expect(warm(0, 0, ['lh']).text).toContain('left hand');
  });
});

describe('reading', () => {
  it('uses the player’s rung, kept inside the unit’s own range', () => {
    const at = (level: number) => buildDay(input({}, { ...newState('u'), readingLevel: level }))[1]!; // the unit covers rungs 2 to 3
    expect(at(1).target.readingLevel).toBe(2); // a new unit starts on its first rung
    expect(at(3).target.readingLevel).toBe(3);
    expect(at(9).target.readingLevel).toBe(3); // reading never runs ahead of the lessons
  });

  it('names what the rung adds in the step title', () => {
    expect(buildDay(input({}, { ...newState('u'), readingLevel: 2 }))[1]!.title).toBe('Reading: Right hand: C D E');
  });

  it('becomes the sight-reading test every four weeks', () => {
    const steps = buildDay(input({ testDue: true }));
    expect(steps[1]!.kind).toBe('test');
    expect(steps[1]!.core).toBe(true);
    expect(testDue({ ...newState(), lastTestDate: '2026-09-28' }, '2026-10-26')).toBe(true);
    expect(testDue({ ...newState(), lastTestDate: '2026-09-29' }, '2026-10-26')).toBe(false);
    expect(testDue(newState(), '2026-10-26')).toBe(false); // never tested: asked at the start, not here
  });
});

describe('Saturday', () => {
  it('replaces the new bars and steady steps with one replay of the finished pieces', () => {
    const steps = buildDay(input({ date: SATURDAY, isFinished: (id) => id.startsWith('old') }));
    expect(kinds(steps)).toEqual(['warmup', 'reading', 'replay', 'review', 'play']);
    const replay = steps.find((s) => s.kind === 'replay')!;
    expect(replay.minutes).toBe(12);
    expect(replay.core).toBe(true);
    expect(replay.target.pieceIds).toEqual(['old1', 'old2']);
    expect(replay.goal).toBe(2);
  });

  it('is an ordinary day when nothing is finished yet', () => {
    expect(kinds(buildDay(input({ date: SATURDAY })))).toContain('newbars');
  });

  it('replays at most six pieces', () => {
    const many = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const steps = buildDay(input({ date: SATURDAY, coursePieces: many, isFinished: (id) => many.includes(id) }));
    expect(steps.find((s) => s.kind === 'replay')!.target.pieceIds).toHaveLength(6);
  });
});
