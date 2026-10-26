import type { TimedStep } from './timeline';

/**
 * Tempo mode: the score runs on a clock and every note has a time window.
 * Pure: the caller passes timestamps in (ms), so it can be tested exactly and driven by any clock.
 */

export interface TempoOptions {
  /** Quarter notes per minute. */
  bpm: number;
  /** Quarter-note beats of count-in before beat 0. */
  countInBeats: number;
  /** Length of the piece's beat in quarter notes (1.5 in 6/8): only the count-in number and the timing window use it. Default 1. */
  beatQuarters?: number;
  /** How forgiving the timing window is. Default 'intermediate'. */
  level?: Level;
}

/** Player level: how wide the window around each note is (a fraction of the beat, kept between min and max in ms). */
export type Level = 'beginner' | 'intermediate' | 'advanced';
export const LEVELS: Record<Level, { fraction: number; min: number; max: number }> = {
  beginner: { fraction: 0.55, min: 200, max: 450 },
  intermediate: { fraction: 0.4, min: 120, max: 300 },
  advanced: { fraction: 0.2, min: 60, max: 150 },
};

export type TempoPress =
  | { kind: 'hit'; note: number; offsetMs: number }
  | {
      kind: 'extra';
      note: number;
      /** What should have been played around now: the unplayed notes of the step nearest in time. May be empty. */
      wanted: number[];
      /** Set when `note` is one of the wanted notes, so the pitch was right and only the timing was off (positive = late). */
      offsetMs?: number;
    }
  | { kind: 'ignored' };

export interface TempoSummary {
  steps: number;
  /** Steps where every note was played inside its window. */
  firstTry: number;
  /** Extra notes + missed notes. */
  wrong: number;
  extra: number;
  missed: number;
  /** Expected notes that were played in their window. */
  matched: number;
  durationMs: number;
  bpm: number;
  /** Average |offset| of matched notes. */
  meanAbsOffsetMs: number;
  /** Average signed offset: positive = late, negative = early. */
  biasMs: number;
}

export interface TempoUpdate {
  phase: 'countin' | 'playing' | 'done';
  /** Whole count-in beats still to come (3, 2, 1), when phase is 'countin'. */
  countInLeft: number;
  /** Raw cursor index the score cursor should be on right now. */
  cursorRawIndex: number;
  /** Notes whose window closed unplayed since the last update. */
  newlyMissed: number[];
  summary: TempoSummary | null;
}

interface Expected { stepIdx: number; note: number; time: number; matched: boolean; missed: boolean }

export const MIN_WINDOW_MS = 120;
export const MAX_WINDOW_MS = 300;

export function windowFor(bpm: number, steps: TimedStep[], beatQuarters = 1, level: Level = 'intermediate'): number {
  const beatMs = 60000 / bpm;
  const { fraction, min, max } = LEVELS[level];
  let window = Math.min(max, Math.max(min, fraction * beatMs * beatQuarters));
  const played = steps.filter((s) => s.notes.length > 0);
  for (let i = 1; i < played.length; i++) {
    const gapMs = (played[i]!.beat - played[i - 1]!.beat) * beatMs;
    if (gapMs > 0) window = Math.min(window, 0.45 * gapMs); // windows of neighbouring steps must not overlap
  }
  return window;
}

export class TempoRun {
  readonly beatMs: number;
  readonly windowMs: number;
  private t0 = 0;
  private startedAt = 0;
  private expected: Expected[] = [];
  private offsets: number[] = [];
  private extra = 0;
  private cursorPos = 0;
  private done: TempoSummary | null = null;

  constructor(private steps: TimedStep[], private opts: TempoOptions) {
    this.beatMs = 60000 / opts.bpm;
    this.windowMs = windowFor(opts.bpm, steps, opts.beatQuarters, opts.level);
    steps.forEach((s, stepIdx) => {
      for (const note of s.notes) this.expected.push({ stepIdx, note, time: 0, matched: false, missed: false });
    });
  }

  /** The score cursor position of step `i` (differs from `i` when the steps start partway into the piece). */
  private rawAt(i: number): number {
    return this.steps[i]?.rawIndex ?? 0;
  }

  get playableSteps(): number {
    return this.steps.filter((s) => s.notes.length > 0).length;
  }

  /** Absolute time (ms) at which beat 0 of the piece sounds. */
  get beatZeroAt(): number {
    return this.t0;
  }

  /** Every note due in the run with its time and state, for the debug log. */
  get schedule(): { beat: number; note: number; time: number; state: 'open' | 'matched' | 'missed' }[] {
    return this.expected.map((e) => ({
      beat: this.steps[e.stepIdx]!.beat, note: e.note, time: e.time, state: e.matched ? 'matched' : e.missed ? 'missed' : 'open',
    }));
  }

  timeOfBeat(beat: number): number {
    return this.t0 + beat * this.beatMs;
  }

  start(nowMs: number): void {
    this.startedAt = nowMs;
    this.t0 = nowMs + this.opts.countInBeats * this.beatMs;
    for (const e of this.expected) e.time = this.timeOfBeat(this.steps[e.stepIdx]!.beat);
  }

  press(note: number, nowMs: number): TempoPress {
    if (this.done || nowMs < this.t0 - this.windowMs) return { kind: 'ignored' }; // count-in
    let best: Expected | undefined;
    for (const e of this.expected) {
      if (e.matched || e.missed || e.note !== note) continue;
      const d = Math.abs(nowMs - e.time);
      if (d <= this.windowMs && (!best || d < Math.abs(nowMs - best.time))) best = e;
    }
    if (!best) {
      this.extra++;
      return { kind: 'extra', note, ...this.diagnose(note, nowMs) };
    }
    best.matched = true;
    const offsetMs = nowMs - best.time;
    this.offsets.push(offsetMs);
    return { kind: 'hit', note, offsetMs };
  }

  update(nowMs: number): TempoUpdate {
    if (this.done) return { phase: 'done', countInLeft: 0, cursorRawIndex: this.rawAt(this.cursorPos), newlyMissed: [], summary: this.done };

    const newlyMissed: number[] = [];
    for (const e of this.expected) {
      if (!e.matched && !e.missed && nowMs > e.time + this.windowMs) {
        e.missed = true;
        newlyMissed.push(e.note);
      }
    }

    while (this.cursorPos + 1 < this.steps.length && this.timeOfBeat(this.steps[this.cursorPos + 1]!.beat) <= nowMs) {
      this.cursorPos++;
    }

    if (this.expected.every((e) => e.matched || e.missed)) {
      this.done = this.summarise(nowMs);
      return { phase: 'done', countInLeft: 0, cursorRawIndex: this.rawAt(this.cursorPos), newlyMissed, summary: this.done };
    }

    if (nowMs < this.t0 - this.windowMs) {
      const left = Math.max(1, Math.ceil((this.t0 - nowMs) / (this.beatMs * (this.opts.beatQuarters ?? 1))));
      return { phase: 'countin', countInLeft: left, cursorRawIndex: this.rawAt(0), newlyMissed, summary: null };
    }
    return { phase: 'playing', countInLeft: 0, cursorRawIndex: this.rawAt(this.cursorPos), newlyMissed, summary: null };
  }

  /**
   * Work out what a stray note was probably aiming for, consistently with the highlighted target (`upcoming()`):
   * 1. The pitch is one of the notes to play next, so it was right but early (it would have matched inside the window).
   * 2. The pitch is a note due close by that was already missed (within 3/4 of a beat): right note, late.
   * 3. Otherwise a wrong pitch. Compare with the notes to play next, or, if those are far off, the unplayed step nearest in time.
   */
  private diagnose(note: number, nowMs: number): { wanted: number[]; offsetMs?: number } {
    const unplayed = this.expected.filter((e) => !e.matched);
    const dist = (e: Expected) => Math.abs(nowMs - e.time);
    const stepNotes = (stepIdx: number) => unplayed.filter((e) => e.stepIdx === stepIdx).map((e) => e.note);
    const next = this.expected.find((e) => !e.matched && !e.missed);

    const nextSame = next && this.expected.find((e) => e.stepIdx === next.stepIdx && !e.matched && !e.missed && e.note === note);
    if (next && nextSame) return { wanted: this.upcoming(), offsetMs: nowMs - nextSame.time };

    // Right pitch, close to its time: a little late, or up to 1.5 beats early (rushing ahead of the beat).
    const lateSame = unplayed.filter((e) => e.note === note && dist(e) <= (e.time > nowMs ? 1.5 : 0.75) * this.beatMs).sort((a, b) => dist(a) - dist(b))[0];
    if (lateSame) return { wanted: stepNotes(lateSame.stepIdx), offsetMs: nowMs - lateSame.time };

    if (next && dist(next) <= 2 * this.beatMs) return { wanted: this.upcoming() };
    const nearest = [...unplayed].sort((a, b) => dist(a) - dist(b))[0];
    if (!nearest || dist(nearest) > 2 * this.beatMs) return { wanted: [] };
    return { wanted: stepNotes(nearest.stepIdx) };
  }

  /**
   * The notes to play next: the first step that still has notes neither played nor missed.
   * Unlike the clock this moves on the moment you play (or miss) the previous step, and it skips rests,
   * so the target key is always visible, as in wait mode.
   */
  upcoming(): number[] {
    if (this.done) return [];
    const first = this.expected.find((e) => !e.matched && !e.missed);
    if (!first) return [];
    return this.expected.filter((e) => e.stepIdx === first.stepIdx && !e.matched && !e.missed).map((e) => e.note);
  }

  /** Live counters for the status line. */
  get live() {
    const matched = this.expected.filter((e) => e.matched).length;
    const missed = this.expected.filter((e) => e.missed).length;
    return { matched, missed, extra: this.extra };
  }

  private summarise(nowMs: number): TempoSummary {
    const missed = this.expected.filter((e) => e.missed).length;
    const perStep = new Map<number, boolean>();
    for (const e of this.expected) perStep.set(e.stepIdx, (perStep.get(e.stepIdx) ?? true) && e.matched);
    const n = this.offsets.length;
    const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
    return {
      steps: perStep.size,
      firstTry: [...perStep.values()].filter(Boolean).length,
      wrong: this.extra + missed,
      extra: this.extra,
      missed,
      matched: this.offsets.length,
      durationMs: Math.round(nowMs - this.startedAt),
      bpm: this.opts.bpm,
      meanAbsOffsetMs: n ? Math.round(sum(this.offsets.map(Math.abs)) / n) : 0,
      biasMs: n ? Math.round(sum(this.offsets) / n) : 0,
    };
  }
}
