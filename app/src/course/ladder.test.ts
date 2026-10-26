import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pieces } from '../content/pieces';
import { positionPieces, techniquePieces } from '../content/technique';
import type { Hands } from '../practice/log';
import { RUNGS } from '../content/reading';
import { nextUnit, placementUnit, unitById, validateCourse, type Course } from './ladder';

const file = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const course = JSON.parse(file('../../course/course.json')) as Course;
// The imported score files are not in git, so the ids come from the manifest.
const manifest = JSON.parse(file('../../scores/library.json')) as { id: string; hands: Hands }[];
const known = new Map<string, Hands>([
  ...[...pieces, ...positionPieces, ...techniquePieces].map((p): [string, Hands] => [p.id, p.hands]),
  ...manifest.map((e): [string, Hands] => [e.id, e.hands]),
]);

describe('course.json', () => {
  it('is valid: real pieces, exits inside their unit, stages in order', () => {
    expect(validateCourse(course, known)).toEqual([]);
  });

  it('covers stages 0 to 2 with thirteen units', () => {
    expect(course.units.map((u) => u.id)).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5', '1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '2.3']);
  });

  it('never repeats a piece across units', () => {
    const all = course.units.flatMap((u) => u.main);
    expect(new Set(all).size).toBe(all.length);
  });

  it('reports what is wrong instead of throwing', () => {
    const broken: Course = { version: 1, placement: [{ passed: 0, unit: '9.9' }], units: [
      { id: 'a', stage: 1, title: '', reading: { from: 9, to: 99 }, warmup: ['nope'], main: ['x'], exit: { finished: ['y'] } },
      { id: 'b', stage: 0, title: '', reading: { from: 1, to: 1 }, warmup: [], main: [], exit: { finished: [] } },
    ] };
    const problems = validateCourse(broken, new Map([['x', 'both']]));
    expect(problems.join('\n')).toMatch(/reading rungs/);
    expect(problems.join('\n')).toMatch(/unknown piece nope/);
    expect(problems.join('\n')).toMatch(/exit piece y/);
    expect(problems.join('\n')).toMatch(/no pieces/);
    expect(problems.join('\n')).toMatch(/stage order/);
    expect(problems.join('\n')).toMatch(/placement 0/);
    expect(problems.join('\n')).toMatch(/unit b: a stage 0 warm-up must be one hand/);
  });

  it('keeps hands together out of every stage 0 warm-up', () => {
    for (const u of course.units.filter((x) => x.stage === 0)) {
      expect(u.warmupHands?.length, u.id).toBeGreaterThan(0);
      expect(u.warmupHands, u.id).not.toContain('both');
    }
  });
});

describe('reading follows the lessons', () => {
  const order = (id: string) => course.units.findIndex((u) => u.id === id);

  it('never gives a unit a rung that belongs to a later unit', () => {
    for (const u of course.units) {
      for (let n = u.reading.from; n <= u.reading.to; n++) {
        const rung = RUNGS[n - 1]!;
        expect(order(rung.unit), `unit ${u.id} uses rung ${n} (${rung.name}), which unit ${rung.unit} teaches`).toBeLessThanOrEqual(order(u.id));
      }
    }
  });

  it('gives every unit at least two rungs to climb, so the reading grows over its days', () => {
    for (const u of course.units) expect(u.reading.to - u.reading.from, u.id).toBeGreaterThanOrEqual(1);
  });

  it('starts every rung of the ladder in some unit', () => {
    const covered = new Set(course.units.flatMap((u) => Array.from({ length: u.reading.to - u.reading.from + 1 }, (_, i) => u.reading.from + i)));
    RUNGS.forEach((r) => expect(covered.has(r.n), `rung ${r.n} is not used by any unit`).toBe(true));
  });
});

describe('lookups', () => {
  it('finds units and their successors', () => {
    expect(unitById('1.2', course)?.title).toMatch(/One hand holds/);
    expect(nextUnit('0.5', course)?.id).toBe('1.1');
    expect(nextUnit('1.5', course)?.id).toBe('2.1');
    expect(nextUnit('2.3', course)).toBeUndefined();
  });

  it('places a player by the highest sight-reading level passed', () => {
    expect(placementUnit(0, course)).toBe('0.1');
    expect(placementUnit(2, course)).toBe('0.3');
    expect(placementUnit(3, course)).toBe('1.1');
    expect(placementUnit(5, course)).toBe('2.1');
    expect(placementUnit(7, course)).toBe('2.3'); // the last unit that exists
  });
});
