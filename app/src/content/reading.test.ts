import { describe, expect, it } from 'vitest';
import { buildMusicXml, midiOf } from './notation';
import { generateReading, MAX_RUNG, RUNGS, rungOf } from './reading';
import { KEYS } from './sight-reading';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 977 + 5);
const bars = (text: string | undefined): string[] => (text ? text.split('|').map((b) => b.trim()).filter(Boolean) : []);
const tokens = (bar: string): string[] => bar.split(/\s+/);
/** Every pitch (chord notes included) of a hand's bars as MIDI numbers. */
const pitches = (text: string | undefined): number[] =>
  bars(text).flatMap(tokens).filter((t) => !t.startsWith('R:')).flatMap((t) => t.split(':')[0]!.split('+').map((n) => midiOf(n.replace(/\/\d$/, ''))));
const durations = (text: string | undefined): string[] => bars(text).flatMap(tokens).map((t) => t.split(':')[1]!.split('/')[0]!);

/** MIDI of the key's tonic in `octave`, and of the note `degree` steps up the major scale from it. */
const degreeMidi = (keyName: string, octave: number, degree: number): number => {
  const key = KEYS[keyName]!;
  const tonic = midiOf(`${key.tonic}${key.acc[key.tonic] ?? ''}${octave}`);
  const steps = [0, 2, 4, 5, 7, 9, 11];
  return tonic + steps[((degree % 7) + 7) % 7]! + 12 * Math.floor(degree / 7);
};

describe('the reading ladder', () => {
  it('has 25 rungs in the order of the units, each one different from the one before', () => {
    expect(MAX_RUNG).toBe(25);
    RUNGS.forEach((r, i) => expect(r.n).toBe(i + 1));
    const order = RUNGS.map((r) => r.unit.split('.').map(Number));
    order.forEach((u, i) => { if (i) expect(u[0]! * 10 + u[1]!, `rung ${i + 1} comes after rung ${i}`).toBeGreaterThanOrEqual(order[i - 1]![0]! * 10 + order[i - 1]![1]!); });
    RUNGS.forEach((r, i) => { if (i) expect(JSON.stringify({ ...r, n: 0, unit: '', name: '' }), `rung ${i + 1}`).not.toBe(JSON.stringify({ ...RUNGS[i - 1]!, n: 0, unit: '', name: '' })); });
  });

  it('clamps an out-of-range rung instead of failing', () => {
    expect(rungOf(0).n).toBe(1);
    expect(rungOf(99).n).toBe(MAX_RUNG);
  });

  it('makes the same piece from the same seed, and another from another', () => {
    expect(generateReading(7, 11).notation).toEqual(generateReading(7, 11).notation);
    expect(generateReading(7, 11).notation).not.toEqual(generateReading(7, 12).notation);
  });

  for (const spec of RUNGS) {
    describe(`rung ${spec.n}: ${spec.name}`, () => {
      const made = SEEDS.map((s) => generateReading(spec.n, s));

      it('always makes a valid score (every bar adds up)', () => {
        for (const p of made) expect(() => buildMusicXml(p.notation)).not.toThrow();
      });

      it('stays inside the notes this rung allows', () => {
        for (const p of made) {
          const key = p.skills.find((s) => s.endsWith('-major'))!.replace('-major', '').replace('♭', 'b');
          const lo = degreeMidi(key, 4, spec.range[0]);
          const hi = degreeMidi(key, 4, spec.range[1]);
          if (spec.texture !== 'lh' && spec.texture !== 'turns' && spec.texture !== 'unison' && spec.texture !== 'contrary') {
            for (const m of pitches(p.notation.rh)) expect(m, `${p.id} right hand`).toBeGreaterThanOrEqual(lo);
          }
          if (spec.texture === 'rh' || spec.texture === 'held' || spec.texture === 'alternate' || spec.texture === 'chords') {
            for (const m of pitches(p.notation.rh)) expect(m, `${p.id} right hand`).toBeLessThanOrEqual(hi);
          }
          const hand = ['lh', 'turns', 'unison', 'contrary'].includes(spec.texture);
          if (hand) {
            const llo = degreeMidi(key, 3, spec.range[0]);
            const lhi = degreeMidi(key, 3, spec.range[1]);
            for (const m of pitches(p.notation.lh)) { expect(m, p.id).toBeGreaterThanOrEqual(llo); expect(m, p.id).toBeLessThanOrEqual(lhi); }
          } else if (p.notation.lh) {
            for (const m of pitches(p.notation.lh)) { expect(m, `${p.id} left hand low`).toBeGreaterThanOrEqual(43); expect(m, `${p.id} left hand high`).toBeLessThanOrEqual(64); }
          }
        }
      });

      it('uses only the rhythms and meters taught by now', () => {
        for (const p of made) {
          const all = [...durations(p.notation.rh), ...durations(p.notation.lh)];
          if (!spec.patterns.includes('eighths')) expect(all, `${p.id} has no eighth notes yet`).not.toContain('e');
          expect(all, `${p.id}`).not.toContain('q.');
          // the last bar of a 3/4 tune is a dotted half note, which is what 3/4 is taught with
          if (!spec.patterns.includes('more') && !spec.timeSigs.some((t) => t[0] === 3)) expect(all, `${p.id} has no dotted half notes yet`).not.toContain('h.');
          expect(spec.timeSigs.map((t) => t.join('/'))).toContain(p.notation.timeSig.join('/'));
          if (spec.rests === 0) {
            const partial = [p.notation.rh, p.notation.lh].flatMap((t) => bars(t).flatMap(tokens)).filter((t) => t.startsWith('R:') && !['R:w', 'R:h.'].includes(t));
            expect(partial, `${p.id} has no rests inside a tune yet`).toEqual([]);
          }
        }
      });

      it('has the texture it says', () => {
        for (const p of made) {
          const rh = bars(p.notation.rh), lh = bars(p.notation.lh);
          expect(p.hands).toBe(spec.texture === 'rh' ? 'rh' : spec.texture === 'lh' ? 'lh' : 'both');
          if (spec.texture === 'turns') {
            rh.forEach((b, i) => { expect([b, lh[i]!].filter((x) => x.startsWith('R:')).length, `${p.id} bar ${i + 1}: one hand rests`).toBe(1); });
            expect(lh.at(-1)!.startsWith('R:'), 'the last bar is played, by the hand that has the last phrase').toBe(false);
          }
          if (spec.texture === 'unison') {
            expect(pitches(p.notation.lh)).toEqual(pitches(p.notation.rh).map((m) => m - 12));
          }
          if (spec.texture === 'contrary') {
            const a = pitches(p.notation.rh), b = pitches(p.notation.lh);
            for (let i = 1; i < a.length; i++) expect(Math.sign(a[i]! - a[i - 1]!) + 0, `${p.id}`).toBe(-Math.sign(b[i]! - b[i - 1]!) + 0);
          }
          if (spec.texture === 'chords') {
            const chordBars = lh.filter((b) => b.includes('+'));
            expect(chordBars.length, `${p.id} has chords in the left hand`).toBe(lh.length);
          }
        }
      });
    });
  }
});
