import type { Hands } from './log';
import type { CursorNote, ScoreCursor } from './session';

/** One cursor position of the score, with the notes the chosen hand(s) must play there (may be empty). */
export interface TimedStep {
  /** Position of this step when stepping the cursor from the start. */
  rawIndex: number;
  /** Onset in quarter-note beats from the start of the piece. */
  beat: number;
  notes: number[];
}

export function handFilter(hands: Hands): (n: CursorNote) => boolean {
  if (hands === 'both') return () => true;
  return hands === 'rh' ? (n) => n.staff === 0 : (n) => n.staff === 1;
}

/** Walk the whole score once and return every step with its onset and the notes for `hands`. Leaves the cursor at the start. */
export function readTimeline(cursor: ScoreCursor, hands: Hands): TimedStep[] {
  const wanted = handFilter(hands);
  const steps: TimedStep[] = [];
  cursor.reset();
  for (let rawIndex = 0; !cursor.done; rawIndex++) {
    const notes = [...new Set(cursor.notes().filter(wanted).map((n) => n.midi))];
    steps.push({ rawIndex, beat: cursor.beat(), notes });
    cursor.next();
  }
  cursor.reset();
  return steps;
}
