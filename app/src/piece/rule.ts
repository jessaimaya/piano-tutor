import { CARD_LIMIT_MS } from '../course/state';
import type { Task } from './path';
import { isComplete, type PieceState } from './state';

/** Whether what the player does on this step is being counted, or is free practice. */
export type Counting = 'counts' | 'practice' | 'done';

/**
 * A step counts while it is open and the player has not asked for practice. Steps with a rhythm count only with the metronome on
 * (the notes-only runs before it are practice), and a finished step is practice from then on.
 */
export function countingOf(state: PieceState, t: Task, opts: { practice: boolean; rhythm: boolean }): Counting {
  if (isComplete(state, t)) return 'done';
  if (t.mode === 'cards') return opts.practice ? 'practice' : 'counts';
  return t.rhythm && !opts.rhythm ? 'practice' : 'counts';
}

export const BADGE: Record<Counting, string> = { counts: 'COUNTS', practice: 'PRACTICE', done: 'DONE' };

/** What the line under a right card says, so it is clear whether it earned a point and why not. */
export function cardMessage(a: { name: string; ms: number; fast: boolean; missed: boolean; counting: boolean }): string {
  const secs = `${(a.ms / 1000).toFixed(1)} s`;
  if (!a.counting) return `✓ ${a.name} · ${secs}`;
  if (a.missed) return `✓ ${a.name} · not counted (missed first)`;
  return a.fast ? `✓ ${secs} · counted` : `✓ ${secs} · too slow, not counted`;
}

export const cardRule = (goal: number): string => `Right in under ${CARD_LIMIT_MS / 1000} s counts. ${goal} to finish.`;
