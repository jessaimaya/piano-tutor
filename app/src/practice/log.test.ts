import { describe, expect, it } from 'vitest';
import { PracticeLog, type RunRecord } from './log';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

const TARGET = 60;
const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  pieceId: 'p1', at: '2026-10-14T10:00:00Z', hands: 'both', mode: 'tempo', bpm: TARGET,
  steps: 20, firstTry: 20, wrong: 0, durationMs: 30000, ...over,
});

describe('PracticeLog', () => {
  it('persists runs across instances', () => {
    const storage = memoryStorage();
    new PracticeLog(storage).add(run());
    expect(new PracticeLog(storage).all()).toHaveLength(1);
  });

  it('survives corrupt storage', () => {
    const storage = memoryStorage();
    storage.setItem('piano-tutor:runs:v1', '{not json');
    expect(new PracticeLog(storage).all()).toEqual([]);
  });

  it('works with no storage at all', () => {
    const log = new PracticeLog(undefined);
    log.add(run());
    expect(log.all()).toHaveLength(1);
  });

  it('status: new → practicing → done after 3 clean tempo runs in a row at target', () => {
    const log = new PracticeLog(memoryStorage());
    expect(log.status('p1', 'both', TARGET)).toBe('new');
    log.add(run({ firstTry: 10 }));
    expect(log.status('p1', 'both', TARGET)).toBe('practicing');
    log.add(run()); log.add(run());
    expect(log.status('p1', 'both', TARGET)).toBe('practicing'); // the messy run is still within the last three
    log.add(run());
    expect(log.status('p1', 'both', TARGET)).toBe('done');
  });

  it('a messy run after clean ones takes the piece out of done', () => {
    const log = new PracticeLog(memoryStorage());
    for (let i = 0; i < 3; i++) log.add(run());
    log.add(run({ firstTry: 12, wrong: 8 }));
    expect(log.status('p1', 'both', TARGET)).toBe('practicing');
  });

  it('runs slower than the target tempo do not count', () => {
    const log = new PracticeLog(memoryStorage());
    for (let i = 0; i < 3; i++) log.add(run({ bpm: TARGET - 4 }));
    expect(log.status('p1', 'both', TARGET)).toBe('practicing');
    log.add(run()); log.add(run()); log.add(run({ bpm: TARGET + 8 }));
    expect(log.status('p1', 'both', TARGET)).toBe('done');
  });

  it('wait-mode runs (old records have no mode) never finish a piece', () => {
    const log = new PracticeLog(memoryStorage());
    for (let i = 0; i < 5; i++) log.add(run({ mode: 'wait', bpm: undefined }));
    for (let i = 0; i < 5; i++) log.add(run({ mode: undefined, bpm: undefined }));
    expect(log.status('p1', 'both', TARGET)).toBe('practicing');
  });

  it('a wait-mode run between clean tempo runs does not break the streak', () => {
    const log = new PracticeLog(memoryStorage());
    log.add(run()); log.add(run({ mode: 'wait', bpm: undefined, firstTry: 3 })); log.add(run()); log.add(run());
    expect(log.status('p1', 'both', TARGET)).toBe('done');
  });

  it('only counts runs with the required hands', () => {
    const log = new PracticeLog(memoryStorage());
    for (let i = 0; i < 3; i++) log.add(run({ hands: 'rh' }));
    expect(log.status('p1', 'both', TARGET)).toBe('practicing');
    expect(log.status('p1', 'rh', TARGET)).toBe('done');
  });

  it('keeps pieces separate', () => {
    const log = new PracticeLog(memoryStorage());
    log.add(run({ pieceId: 'a' }));
    expect(log.status('b', 'both', TARGET)).toBe('new');
  });

  it('lastTempoRun returns the latest tempo run for those hands', () => {
    const log = new PracticeLog(memoryStorage());
    log.add(run({ bpm: 52 })); log.add(run({ mode: 'wait' })); log.add(run({ hands: 'rh', bpm: 70 })); log.add(run({ bpm: 56 }));
    expect(log.lastTempoRun('p1', 'both')?.bpm).toBe(56);
    expect(log.lastTempoRun('p1', 'lh')).toBeUndefined();
  });
});

describe('partial-bar runs', () => {
  it('count as practising but never finish a piece, however clean and fast', () => {
    const log = new PracticeLog(undefined);
    const run = { pieceId: 'p', at: '2026-01-01T00:00:00Z', hands: 'both' as const, mode: 'tempo' as const, bpm: 100, steps: 10, firstTry: 10, wrong: 0, durationMs: 1000 };
    for (let i = 0; i < 3; i++) log.add({ ...run, bars: [2, 4] });
    expect(log.status('p', 'both', 60)).toBe('practicing');
    for (let i = 0; i < 3; i++) log.add(run);
    expect(log.status('p', 'both', 60)).toBe('done');
  });
});
