import type { Hands, RunRecord } from './log';
import { handFilter } from './timeline';
import { WaitMode, type WaitResult } from './wait-mode';

/** What the session needs from a score. Implemented by the OSMD wrapper; faked in tests. */
export interface CursorNote {
  midi: number;
  /** 0 = top staff (right hand), 1 = bottom staff (left hand). */
  staff: number;
  /** How long it sounds, in quarter notes (a tied note includes the notes tied to it). Only needed for listening. */
  beats?: number;
}

export interface ScoreCursor {
  reset(): void;
  /** Onset of the current step in quarter-note beats from the start of the piece. */
  beat(): number;
  notes(): CursorNote[];
  next(): void;
  readonly done: boolean;
}

export type RunSummary = Pick<RunRecord, 'steps' | 'firstTry' | 'wrong' | 'durationMs' | 'hands'>;

export interface PressOutcome {
  result: WaitResult;
  /** Set when this press completed the piece. */
  finished: RunSummary | null;
}

export class Session {
  private wait = new WaitMode();
  private startedAt: number | undefined;
  private wanted: (n: CursorNote) => boolean;

  constructor(
    private cursor: ScoreCursor,
    readonly hands: Hands,
    private now: () => number = () => Date.now(),
  ) {
    this.wanted = handFilter(hands);
    this.restart();
  }

  get expected(): ReadonlySet<number> {
    return this.wait.expectedNotes;
  }

  get hit(): ReadonlySet<number> {
    return this.wait.hitNotes;
  }

  get finished(): boolean {
    return this.cursor.done;
  }

  get stats() {
    return this.wait.stats;
  }

  restart(): void {
    this.wait.reset();
    this.startedAt = undefined;
    this.cursor.reset();
    this.seek();
  }

  press(note: number): PressOutcome {
    if (this.cursor.done) return { result: { kind: 'ignored' }, finished: null };
    this.startedAt ??= this.now();
    const result = this.wait.press(note);
    if (result.kind !== 'advance') return { result, finished: null };

    this.cursor.next();
    this.seek();
    if (!this.cursor.done) return { result, finished: null };
    return {
      result,
      finished: { ...this.wait.stats, hands: this.hands, durationMs: this.now() - (this.startedAt ?? this.now()) },
    };
  }

  /** Move to the next step that has notes for the chosen hand(s); rests-only steps are skipped. */
  private seek(): void {
    while (!this.cursor.done) {
      const expected = new Set(
        this.cursor.notes().filter((n) => this.wanted(n)).map((n) => n.midi),
      );
      if (expected.size > 0) {
        this.wait.begin(expected);
        return;
      }
      this.cursor.next();
    }
  }
}
