/**
 * Wait mode: the score waits until every note of the current step has been played.
 *
 * Pure state machine; the caller decides what a "step" is (the notes under the
 * score cursor, filtered by hand) and moves the cursor when told to advance.
 */

export type WaitResult =
  | { kind: 'ignored' }
  | { kind: 'correct'; note: number }
  | { kind: 'wrong'; note: number }
  | { kind: 'advance'; note: number };

export interface WaitStats {
  steps: number;
  /** Steps completed without a single wrong note. */
  firstTry: number;
  wrong: number;
}

export class WaitMode {
  private expected = new Set<number>();
  private hit = new Set<number>();
  private mistakeInStep = false;
  private active = false;
  stats: WaitStats = { steps: 0, firstTry: 0, wrong: 0 };

  get expectedNotes(): ReadonlySet<number> {
    return this.expected;
  }

  get hitNotes(): ReadonlySet<number> {
    return this.hit;
  }

  reset(): void {
    this.active = false;
    this.expected = new Set();
    this.hit = new Set();
    this.mistakeInStep = false;
    this.stats = { steps: 0, firstTry: 0, wrong: 0 };
  }

  begin(expected: Iterable<number>): void {
    this.expected = new Set(expected);
    if (this.expected.size === 0) throw new Error('A step needs at least one note');
    this.hit = new Set();
    this.mistakeInStep = false;
    this.active = true;
  }

  /** Call for every note-on. Note-offs don't matter in wait mode. */
  press(note: number): WaitResult {
    if (!this.active) return { kind: 'ignored' };

    if (!this.expected.has(note)) {
      this.stats.wrong++;
      this.mistakeInStep = true;
      return { kind: 'wrong', note };
    }
    if (this.hit.has(note)) return { kind: 'ignored' };

    this.hit.add(note);
    if (this.hit.size < this.expected.size) return { kind: 'correct', note };

    this.stats.steps++;
    if (!this.mistakeInStep) this.stats.firstTry++;
    this.active = false;
    return { kind: 'advance', note };
  }
}

export function accuracy(stats: WaitStats): number {
  return stats.steps === 0 ? 0 : stats.firstTry / stats.steps;
}
