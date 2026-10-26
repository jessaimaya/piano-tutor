import { describe, expect, it } from 'vitest';
import { buildMusicXml, midiOf } from './notation';
import { generateSightReading, LEVELS, MAX_LEVEL, noteName, rng } from './sight-reading';

const bars = (s: string | undefined) => (s ?? '').split('|').map((b) => b.trim()).filter(Boolean);
const pitches = (s: string | undefined) => (s?.match(/[A-G][#b]?\d(?=[+:])/g) ?? []).map(midiOf);
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

describe('sight-reading generator', () => {
  it('has seven levels, numbered in order', () => {
    expect(MAX_LEVEL).toBe(7);
    expect(LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('spells scale degrees with the key signature: B♭ major has B♭ and E♭, D major has F♯ and C♯', () => {
    const bb = { name: 'B♭', fifths: -2, tonic: 'B' as const, acc: { B: 'b' as const, E: 'b' as const } };
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((d) => noteName(bb, d, 4))).toEqual(['Bb4', 'C5', 'D5', 'Eb5', 'F5', 'G5', 'A5', 'Bb5']);
    const d = { name: 'D', fifths: 2, tonic: 'D' as const, acc: { F: '#' as const, C: '#' as const } };
    expect([0, 2, 6].map((x) => noteName(d, x, 4))).toEqual(['D4', 'F#4', 'C#5']);
    expect(noteName(d, -1, 4)).toBe('C#4');
  });

  it.each(LEVELS.map((l) => [l.level] as const))('level %i: every seed builds valid MusicXML with the right bar count and hands', (level) => {
    const spec = LEVELS[level - 1]!;
    for (const seed of SEEDS) {
      const p = generateSightReading(level, seed);
      expect(() => buildMusicXml(p.notation), `seed ${seed}`).not.toThrow(); // throws on any bar that does not add up
      expect(p.hands).toBe(spec.hands);
      for (const hand of [p.notation.rh, p.notation.lh]) if (hand) expect(bars(hand)).toHaveLength(spec.bars);
      expect(!!p.notation.rh).toBe(spec.hands !== 'lh');
      expect(!!p.notation.lh).toBe(spec.hands !== 'rh');
    }
  });

  it('keeps every note on the on-screen keyboard (C2–C6), RH above the LH, and never writes fingering', () => {
    for (const spec of LEVELS) {
      for (const seed of SEEDS) {
        const p = generateSightReading(spec.level, seed);
        const all = [...pitches(p.notation.rh), ...pitches(p.notation.lh)];
        for (const m of all) { expect(m).toBeGreaterThanOrEqual(36); expect(m).toBeLessThanOrEqual(84); }
        if (p.notation.rh && p.notation.lh) expect(Math.min(...pitches(p.notation.rh))).toBeGreaterThan(Math.max(...pitches(p.notation.lh)));
        expect(`${p.notation.rh} ${p.notation.lh}`).not.toMatch(/\/\d/);
      }
    }
  });

  it('level 1 stays in the five-finger position C–G; level 2 is the left hand in the octave below', () => {
    for (const seed of SEEDS) {
      const l1 = generateSightReading(1, seed);
      for (const m of pitches(l1.notation.rh)) { expect(m).toBeGreaterThanOrEqual(60); expect(m).toBeLessThanOrEqual(67); }
      const l2 = generateSightReading(2, seed);
      for (const m of pitches(l2.notation.lh)) { expect(m).toBeGreaterThanOrEqual(48); expect(m).toBeLessThanOrEqual(55); }
    }
  });

  it('starts on a note (never a rest) and ends on the tonic held for the last bar', () => {
    for (const spec of LEVELS) {
      for (const seed of SEEDS) {
        const p = generateSightReading(spec.level, seed);
        const hand = (p.notation.rh ?? p.notation.lh)!;
        expect(hand.trim().startsWith('R')).toBe(false);
        const last = bars(hand).at(-1)!;
        expect(last.split(/\s+/)).toHaveLength(1);
        expect(last).toMatch(/:(w|h\.)$/);
      }
    }
  });

  it('is repeatable per seed and varied across seeds', () => {
    expect(generateSightReading(5, 42).notation).toEqual(generateSightReading(5, 42).notation);
    const distinct = new Set(SEEDS.map((s) => generateSightReading(5, s).notation.rh));
    expect(distinct.size).toBeGreaterThan(120);
    const r = rng(1);
    expect(r()).not.toBe(r());
  });

  it('uses rests from level 6 on, and never before', () => {
    const hasRest = (level: number) => SEEDS.some((s) => /R:/.test(generateSightReading(level, s).notation.rh ?? ''));
    for (const level of [1, 3, 4, 5]) expect(hasRest(level)).toBe(false);
    expect(hasRest(6)).toBe(true);
  });

  it('uses all five keys by level 6', () => {
    const fifths = new Set(SEEDS.map((s) => generateSightReading(6, s).notation.fifths));
    expect([...fifths].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });
});
