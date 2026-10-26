import type { ScoreCursor } from './session';

/**
 * Practise part of a piece: bars `from`..`to` (1-based, inclusive). `RangedCursor` wraps the score's cursor so it starts at bar
 * `from`, reports "done" after bar `to`, and counts beats from the start of the range. Wait mode, tempo mode and listening
 * then work on a range without knowing about it.
 */

export interface BarRange {
  from: number;
  to: number;
}

/** What the score view offers beyond a plain cursor. */
export interface MeasuredCursor extends ScoreCursor {
  /** 0-based index of the bar under the cursor. */
  measure(): number;
  /** Move to a step by its position from the start of the piece. */
  moveTo(rawIndex: number): void;
  /** Bars in the piece. */
  readonly measureCount: number;
}

export interface RangeCursor extends ScoreCursor {
  moveTo(rawIndex: number): void;
}

/** The whole piece is not a range: nothing is wrapped, and nothing is logged as "part of a piece". */
export const isWholePiece = (r: BarRange | undefined, total: number): boolean => !r || (r.from <= 1 && r.to >= total);

/** Keep a typed range inside the piece, `from` ≤ `to`. */
export function clampRange(from: number, to: number, total: number): BarRange {
  const f = Math.min(Math.max(1, Math.round(from) || 1), total);
  const t = Math.min(Math.max(f, Math.round(to) || total), total);
  return { from: f, to: t };
}

export class RangedCursor implements RangeCursor {
  private skipped = 0;
  private baseBeat = 0;

  constructor(private base: MeasuredCursor, readonly range: BarRange) {
    this.reset();
  }

  reset(): void {
    this.base.reset();
    this.skipped = 0;
    while (!this.base.done && this.base.measure() < this.range.from - 1) {
      this.base.next();
      this.skipped++;
    }
    this.baseBeat = this.base.done ? 0 : this.base.beat();
  }

  get done(): boolean {
    return this.base.done || this.base.measure() > this.range.to - 1;
  }

  beat(): number {
    return this.base.beat() - this.baseBeat;
  }

  notes() {
    return this.done ? [] : this.base.notes();
  }

  next(): void {
    this.base.next();
  }

  /** Step `rawIndex` counted from the start of the range. */
  moveTo(rawIndex: number): void {
    this.base.moveTo(this.skipped + rawIndex);
  }
}
