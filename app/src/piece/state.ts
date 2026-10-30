import type { Task } from './path';

/**
 * Where the player is on one piece's learning path. Pure functions over a plain object; main.ts keeps one per piece in
 * localStorage under `piano-tutor:piece:v1:<id>`, so the backup file carries it too.
 */
export interface PieceState {
  version: 1;
  pieceId: string;
  /** Good runs (or right, fast cards) counted per task id. */
  progress: Record<string, number>;
  skipped: string[];
  /** Per card (`clef:name`): fast, right answers so far, less one for each miss. */
  cardFast: Record<string, number>;
  startedAt: string;
  updatedAt: string;
}

export const newPieceState = (pieceId: string, now: Date = new Date()): PieceState => ({
  version: 1, pieceId, progress: {}, skipped: [], cardFast: {}, startedAt: now.toISOString(), updatedAt: now.toISOString(),
});

export function parsePieceState(raw: string | null | undefined, pieceId: string, now: Date = new Date()): PieceState {
  if (!raw) return newPieceState(pieceId, now);
  try {
    const p = JSON.parse(raw) as Partial<PieceState> | null;
    if (!p || typeof p !== 'object' || p.version !== 1 || p.pieceId !== pieceId) return newPieceState(pieceId, now);
    return { ...newPieceState(pieceId, now), ...p, progress: { ...p.progress }, cardFast: { ...p.cardFast }, skipped: Array.isArray(p.skipped) ? p.skipped : [] };
  } catch {
    return newPieceState(pieceId, now);
  }
}

export const have = (s: PieceState, t: Task): number => Math.min(t.goal, s.progress[t.id] ?? 0);
export const isComplete = (s: PieceState, t: Task): boolean => have(s, t) >= t.goal;
export const isSkipped = (s: PieceState, t: Task): boolean => s.skipped.includes(t.id);
export const isSettled = (s: PieceState, t: Task): boolean => isComplete(s, t) || isSkipped(s, t);

/** The first task not yet done or skipped, or undefined when the path is finished. */
export const currentTask = (s: PieceState, tasks: readonly Task[]): Task | undefined => tasks.find((t) => !isSettled(s, t));

/** Share of the path settled, 0–1. */
export function completion(s: PieceState, tasks: readonly Task[]): number {
  return tasks.length ? tasks.filter((t) => isSettled(s, t)).length / tasks.length : 0;
}

const stamp = (s: PieceState, now: Date): PieceState => ({ ...s, updatedAt: now.toISOString() });

/** A run of the task's piece and bars ended with this accuracy (0–1). Counts only when it is good enough. */
export function noteRun(s: PieceState, t: Task, accuracy: number, now: Date = new Date()): PieceState {
  if (accuracy < t.minAccuracy || isComplete(s, t)) return s;
  return stamp({ ...s, progress: { ...s.progress, [t.id]: have(s, t) + 1 } }, now);
}

/** A note card was answered. Counts when right and fast. */
export function noteCard(s: PieceState, t: Task, key: string, right: boolean, fast: boolean, now: Date = new Date()): PieceState {
  const cardFast = { ...s.cardFast, [key]: Math.max(0, Math.min(9, (s.cardFast[key] ?? 0) + (fast ? 1 : right ? 0 : -1))) };
  const next = { ...s, cardFast };
  return stamp(fast && !isComplete(s, t) ? { ...next, progress: { ...next.progress, [t.id]: have(s, t) + 1 } } : next, now);
}

export const skipTask = (s: PieceState, t: Task, now: Date = new Date()): PieceState =>
  isSkipped(s, t) ? s : stamp({ ...s, skipped: [...s.skipped, t.id] }, now);

/** Take a task back to the start (done or skipped). */
export function redoTask(s: PieceState, t: Task, now: Date = new Date()): PieceState {
  const { [t.id]: _gone, ...progress } = s.progress;
  return stamp({ ...s, progress, skipped: s.skipped.filter((id) => id !== t.id) }, now);
}
