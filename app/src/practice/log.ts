import { accuracy, type WaitStats } from './wait-mode';

export type Hands = 'both' | 'rh' | 'lh';

export interface RunRecord extends WaitStats {
  pieceId: string;
  at: string; // ISO timestamp
  hands: Hands;
  durationMs: number;
  /** Absent on runs recorded before tempo mode existed: those were wait-mode runs. */
  mode?: 'wait' | 'tempo';
  bpm?: number;
  meanAbsOffsetMs?: number;
  /** Positive = late, negative = early. */
  biasMs?: number;
  /** Set when only bars `from`..`to` were played: such runs show progress but never finish a piece. */
  bars?: [from: number, to: number];
}

export type PieceStatus = 'new' | 'practicing' | 'done';

const KEY = 'piano-tutor:runs:v1';
/** A run counts as clean at or above this share of steps played right (and, in tempo mode, in time). */
export const CLEAN_ACCURACY = 0.9;
/** Matches the "3 clean run-throughs in a row" rule in 05-practice-routine.md. */
export const CLEAN_RUNS_TO_FINISH = 3;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class PracticeLog {
  private runs: RunRecord[];

  constructor(private storage: StorageLike | undefined) {
    this.runs = this.load();
  }

  add(run: RunRecord): void {
    this.runs.push(run);
    this.save();
  }

  all(): readonly RunRecord[] {
    return this.runs;
  }

  forPiece(pieceId: string): RunRecord[] {
    return this.runs.filter((r) => r.pieceId === pieceId);
  }

  /**
   * 'done' = the last three tempo-mode runs at or above `targetBpm`, with the piece's own hands, were all clean.
   * That is the "3 clean run-throughs in a row at target tempo" rule from 05-practice-routine.md.
   * Wait-mode runs show progress ('practicing') but never finish a piece.
   */
  status(pieceId: string, requiredHands: Hands, targetBpm: number): PieceStatus {
    const runs = this.forPiece(pieceId);
    if (runs.length === 0) return 'new';
    const qualifying = runs.filter(
      (r) => r.mode === 'tempo' && r.hands === requiredHands && (r.bpm ?? 0) >= targetBpm && r.bars === undefined,
    );
    const recent = qualifying.slice(-CLEAN_RUNS_TO_FINISH);
    const done =
      recent.length === CLEAN_RUNS_TO_FINISH && recent.every((r) => accuracy(r) >= CLEAN_ACCURACY);
    return done ? 'done' : 'practicing';
  }

  /** The most recent tempo run for this piece and hands, if any. */
  lastTempoRun(pieceId: string, hands: Hands): RunRecord | undefined {
    return this.forPiece(pieceId).filter((r) => r.mode === 'tempo' && r.hands === hands).at(-1);
  }

  private load(): RunRecord[] {
    try {
      const raw = this.storage?.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.runs));
    } catch {
      // storage can be blocked (private window, quota): keep working in memory
    }
  }
}
