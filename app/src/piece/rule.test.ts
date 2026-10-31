import { describe, expect, it } from 'vitest';
import { buildPath, type Task } from './path';
import { BADGE, cardMessage, cardRule, countingOf } from './rule';
import { newPieceState, noteRun } from './state';

const task = (over: Partial<Task>): Task => ({
  id: 'x', phase: 'first', kind: 'hand', title: '', text: '', hands: 'rh', mode: 'wait', goal: 2, minAccuracy: 0.9, ...over,
});
const fresh = () => newPieceState('p', new Date(0));

describe('what counts', () => {
  it('cards count unless asked for practice', () => {
    const t = task({ mode: 'cards', goal: 10, minAccuracy: 1 });
    expect(countingOf(fresh(), t, { practice: false, rhythm: false })).toBe('counts');
    expect(countingOf(fresh(), t, { practice: true, rhythm: false })).toBe('practice');
  });
  it('a rhythm step is practice until the metronome is on', () => {
    const t = task({ rhythm: true });
    expect(countingOf(fresh(), t, { practice: false, rhythm: false })).toBe('practice');
    expect(countingOf(fresh(), t, { practice: false, rhythm: true })).toBe('counts');
  });
  it('a step without rhythm always counts, and a finished one is done', () => {
    const t = task({ goal: 1 });
    expect(countingOf(fresh(), t, { practice: false, rhythm: false })).toBe('counts');
    expect(countingOf(noteRun(fresh(), t, 1), t, { practice: false, rhythm: true })).toBe('done');
    expect(BADGE.done).toBe('DONE');
  });
  it('plans keep the rule consistent with the real path', () => {
    const cards = buildPath({ bars: 4, plays: { rh: true, lh: false }, order: { rh: [60, 62], lh: [] }, rh: [], lh: [] } as never).find((t) => t.mode === 'cards');
    expect(cards && countingOf(fresh(), cards, { practice: false, rhythm: false })).toBe('counts');
  });
});

describe('card messages', () => {
  const base = { name: 'C4', ms: 1300, fast: true, missed: false, counting: true };
  it('says counted, too slow, or missed first', () => {
    expect(cardMessage(base)).toBe('✓ 1.3 s · counted');
    expect(cardMessage({ ...base, ms: 2600, fast: false })).toBe('✓ 2.6 s · too slow, not counted');
    expect(cardMessage({ ...base, missed: true, fast: false })).toBe('✓ C4 · not counted (missed first)');
  });
  it('only shows the time in practice', () => {
    expect(cardMessage({ ...base, counting: false })).toBe('✓ C4 · 1.3 s');
  });
  it('states the rule', () => {
    expect(cardRule(10)).toBe('Right in under 2 s counts. 10 to finish.');
  });
});
