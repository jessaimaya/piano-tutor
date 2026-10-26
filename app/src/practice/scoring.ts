import type { RunRecord } from './log';
import { accuracy } from './wait-mode';

/**
 * One 0–100 score per run, so runs can be compared at a glance.
 *
 * Wait mode: the share of steps played right on the first try.
 * Tempo mode: every note is worth 1 point. A note in its window earns full credit when it is within
 * ON_TIME_MS of the beat and slides down to SLOPPY_CREDIT at SLOPPY_MS or more. A missed note earns nothing,
 * and each extra key costs EXTRA_PENALTY of a note. Timing is judged in absolute milliseconds, so the level
 * (window width) decides what counts as a hit but not how precise a hit is worth.
 */
export const ON_TIME_MS = 50;
export const SLOPPY_MS = 250;
export const SLOPPY_CREDIT = 0.6;
export const EXTRA_PENALTY = 0.25;

export function noteCredit(absOffsetMs: number): number {
  if (absOffsetMs <= ON_TIME_MS) return 1;
  const t = Math.min(1, (absOffsetMs - ON_TIME_MS) / (SLOPPY_MS - ON_TIME_MS));
  return 1 - t * (1 - SLOPPY_CREDIT);
}

export function tempoScore(offsetsMs: readonly number[], notes: number, extra: number): number {
  if (notes === 0) return 0;
  const points = offsetsMs.reduce((sum, o) => sum + noteCredit(Math.abs(o)), 0) - EXTRA_PENALTY * extra;
  return Math.round((100 * Math.max(0, points)) / notes);
}

/** The score of a logged run; runs recorded before scores existed get the share of steps played right. */
export function runScore(run: RunRecord): number {
  return run.score ?? Math.round(accuracy(run) * 100);
}

export type Stars = 0 | 1 | 2 | 3;
export const NEEDS_PRACTICE_BELOW = 75;

export function starsFor(score: number): Stars {
  return score >= 90 ? 3 : score >= 75 ? 2 : score >= 50 ? 1 : 0;
}

export function verdict(score: number): string {
  return score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 50 ? 'Getting there' : 'Needs work';
}

export interface Progress {
  /** Full run-throughs only: a few bars never count towards a piece's score. */
  runs: number;
  best?: number;
  last?: RunRecord;
  lastScore?: number;
  /** The run before `last` in the same mode, to show whether you are improving. */
  previousScore?: number;
  /** Scores of the most recent full runs, oldest first. */
  recent: number[];
}

const RECENT = 12;

export function progressOf(runs: readonly RunRecord[]): Progress {
  const full = runs.filter((r) => r.bars === undefined);
  const scores = full.map(runScore);
  const last = full.at(-1);
  if (!last) return { runs: 0, recent: [] };
  const sameMode = (r: RunRecord) => (r.mode ?? 'wait') === (last.mode ?? 'wait');
  const before = full.slice(0, -1).filter(sameMode).at(-1);
  return {
    runs: full.length,
    best: Math.max(...scores),
    last,
    lastScore: runScore(last),
    previousScore: before ? runScore(before) : undefined,
    recent: scores.slice(-RECENT),
  };
}

/** Played at least once, and the latest full run was below the bar. */
export function needsPractice(p: Progress): boolean {
  return p.lastScore !== undefined && p.lastScore < NEEDS_PRACTICE_BELOW;
}

/** How a run that was just played compares with the earlier ones of the same kind (same mode, whole piece or bars). */
export function compareWithHistory(earlier: readonly RunRecord[], run: RunRecord): { previous?: number; bestBefore?: number } {
  const kind = (r: RunRecord) => `${r.mode ?? 'wait'}|${r.bars === undefined}`;
  const same = earlier.filter((r) => kind(r) === kind(run)).map(runScore);
  return { previous: same.at(-1), bestBefore: same.length ? Math.max(...same) : undefined };
}
