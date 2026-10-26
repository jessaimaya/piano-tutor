import type { Hands } from '../practice/log';
import { MAX_RUNG } from '../content/reading';

/**
 * The course: an ordered list of units, each naming its warm-up exercises, its pieces and what ends it.
 * The data is app/course/course.json (see 12-lesson-ladder.md); this file only reads and checks it.
 */
export interface UnitExit {
  /** Every one of these pieces must be finished (three clean tempo runs at target, or marked done by hand). */
  finished: string[];
  /** The player's reading rung (content/reading.ts) must be at least this: reading has caught up with the lesson. */
  readingLevel?: number;
  /** The note cards must be answered quickly and right (stage 0 only). */
  cards?: boolean;
  /** The unit is over after this many days that counted (the introduction week: nothing to finish, only things to practise). */
  days?: number;
}

export interface Unit {
  id: string;
  stage: number;
  title: string;
  /**
   * The rungs of the reading ladder (content/reading.ts) this unit covers: it starts on `from` and the player climbs towards `to` by
   * reading well, never past it, so the generated reading never gets ahead of what the unit has taught.
   */
  reading?: { from: number; to: number };
  /**
   * An introduction unit: no reading step and no note cards (reading the staff comes in the units after), so the day is the hand
   * exercises. It ends after `exit.days` days.
   */
  intro?: boolean;
  /** The hands of the new-bars and steady steps, instead of the day-by-day rotation of right, left, then both. */
  hands?: Hands;
  /** A word about posture or hand shape, shown with the warm-up. */
  tip?: string;
  /** Exercise ids (technique.ts `t-five-*`, scales…) used as warm-ups, easiest first: each is used for a few warm-up days, then the next. */
  warmup: string[];
  /** The warm-up exercises are taken in turn instead of climbing the list (stage 1 and 2 units that revisit every key). */
  warmupRotate?: boolean;
  /**
   * Hands of the warm-up, one per warm-up day in turn; missing means both. Stage 0 never asks for both: the five-finger exercise
   * plays the hands together, an octave apart, which comes after learning each hand alone.
   */
  warmupHands?: Hands[];
  /**
   * Note cards (stage 0): the notes this unit introduces, by clef, as scientific names (C4 = Middle C). The deck is every note
   * introduced so far, and the new ones come up more often until they are known. They are the notes the unit's pieces use.
   */
  cards?: { treble?: string[]; bass?: string[] };
  /** Pieces in the order they are learned. */
  main: string[];
  exit: UnitExit;
}

export interface Placement {
  /** The highest level passed in the sight-reading test (0 = none). */
  passed: number;
  unit: string;
}

export interface Course {
  version: number;
  units: Unit[];
  placement: Placement[];
}

/** The rung the reading step uses: where the player is, kept inside the unit's own range. */
export const rungFor = (unit: Unit, level: number): number => (unit.reading ? Math.min(unit.reading.to, Math.max(unit.reading.from, level)) : level);

const manifests = import.meta.glob<Course>('../../course/course.json', { eager: true, import: 'default' });

export const course: Course = Object.values(manifests)[0] ?? { version: 1, units: [], placement: [] };

export const unitById = (id: string, c: Course = course): Unit | undefined => c.units.find((u) => u.id === id);
export const unitIndex = (id: string, c: Course = course): number => c.units.findIndex((u) => u.id === id);
export const nextUnit = (id: string, c: Course = course): Unit | undefined => c.units[unitIndex(id, c) + 1];

/** Where a player who passed `level` of the sight-reading test starts: the last placement row at or below it. */
export function placementUnit(level: number, c: Course = course): string {
  const row = [...c.placement].filter((p) => p.passed <= level).sort((a, b) => b.passed - a.passed)[0];
  return row?.unit ?? c.units[0]?.id ?? '0.1';
}

/** Everything wrong with the course data, as sentences: empty when it is fine. `pieces` maps id → hands for every known piece. */
export function validateCourse(c: Course, pieces: ReadonlyMap<string, Hands>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const u of c.units) {
    if (seen.has(u.id)) problems.push(`unit ${u.id} appears twice`);
    seen.add(u.id);
    if (u.main.length === 0) problems.push(`unit ${u.id} has no pieces`);
    if (!u.reading && !u.intro) problems.push(`unit ${u.id}: needs its reading rungs (only an introduction unit can go without)`);
    if (u.reading) {
      const { from, to } = u.reading;
      if (!(from >= 1 && to >= from && to <= MAX_RUNG)) problems.push(`unit ${u.id}: reading rungs must be 1–${MAX_RUNG}, from at most to`);
      if (u.exit.readingLevel !== undefined && (u.exit.readingLevel < from || u.exit.readingLevel > to)) problems.push(`unit ${u.id}: the exit reading rung must lie inside the unit's rungs`);
    }
    if (u.exit.days === undefined && u.exit.finished.length === 0) problems.push(`unit ${u.id}: has no way to end (no exit pieces and no days)`);
    for (const id of [...u.main, ...u.warmup, ...u.exit.finished]) {
      if (!pieces.has(id)) problems.push(`unit ${u.id}: unknown piece ${id}`);
    }
    if (u.stage === 0 && !u.intro && (!u.warmupHands?.length || u.warmupHands.includes('both'))) {
      problems.push(`unit ${u.id}: a stage 0 warm-up must be one hand at a time (warmupHands without "both")`);
    }
    for (const id of u.exit.finished) {
      if (!u.main.includes(id)) problems.push(`unit ${u.id}: exit piece ${id} is not one of its pieces`);
    }
  }
  c.units.forEach((u, i) => {
    const prev = c.units[i - 1];
    if (prev?.reading && u.reading && (u.reading.from < prev.reading.from || u.reading.to < prev.reading.to)) problems.push(`unit ${u.id}: reading rungs must not go back from unit ${prev.id}`);
  });
  const stages = c.units.map((u) => u.stage);
  if (stages.some((s, i) => i > 0 && s < stages[i - 1]!)) problems.push('units are not in stage order');
  for (const p of c.placement) {
    if (!seen.has(p.unit)) problems.push(`placement ${p.passed} points at unknown unit ${p.unit}`);
  }
  return problems;
}
