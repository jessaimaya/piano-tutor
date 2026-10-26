import { describe, expect, it } from 'vitest';
import { buildMusicXml, midiOf } from './notation';
import { KEYS, lhFinger, rhFinger, techniquePieces } from './technique';

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);

interface Tok { name: string; midi: number; finger?: number }
function tokens(text: string | undefined): Tok[] {
  return (text?.match(/[A-G][#b]?\d:[whqes]\.?(?:\/\d)?/g) ?? []).map((t) => {
    const [pitch, rest] = t.split(':') as [string, string];
    const finger = /\/(\d)/.exec(rest)?.[1];
    return { name: pitch, midi: midiOf(pitch), finger: finger ? Number(finger) : undefined };
  });
}
const pcs = (toks: Tok[]) => [...new Set(toks.map((t) => ((t.midi % 12) + 12) % 12))].sort((a, b) => a - b);
const byId = Object.fromEntries(techniquePieces.map((p) => [p.id, p]));

describe('technique exercises', () => {
  it('has a scale and an arpeggio for each of the 23 keys, with unique ids', () => {
    expect(KEYS).toHaveLength(23);
    expect(techniquePieces).toHaveLength(46);
    expect(new Set(techniquePieces.map((p) => p.id)).size).toBe(46);
  });

  it.each(techniquePieces.map((p) => [p.id, p] as const))('%s builds valid MusicXML', (_id, piece) => {
    expect(buildMusicXml(piece.notation)).toContain('<score-partwise');
  });

  it('keeps every note inside the on-screen keyboard (C2–C6)', () => {
    for (const p of techniquePieces) {
      for (const t of [...tokens(p.notation.rh), ...tokens(p.notation.lh)]) {
        expect(t.midi, `${p.id} ${t.name}`).toBeGreaterThanOrEqual(36);
        expect(t.midi, `${p.id} ${t.name}`).toBeLessThanOrEqual(84);
      }
    }
  });

  it('plays each scale up two octaves and back down: 15 up, 13 down, then the tonic held', () => {
    for (const p of techniquePieces.filter((x) => x.group === 'scales')) {
      for (const hand of [p.notation.rh, p.notation.lh]) {
        const t = tokens(hand);
        expect(t).toHaveLength(29);
        expect(t[14]!.midi - t[0]!.midi).toBe(24);
        expect(t[28]!.midi).toBe(t[0]!.midi);
        expect(t.slice(0, 15).map((x) => x.midi)).toEqual(t.slice(0, 15).map((x) => x.midi).sort((a, b) => a - b));
      }
    }
  });

  it('puts the hands an octave apart', () => {
    for (const p of techniquePieces) {
      expect(tokens(p.notation.rh)[0]!.midi - tokens(p.notation.lh)[0]!.midi, p.id).toBe(12);
    }
  });

  it('uses the right notes: C major is the white keys, A harmonic minor has G♯', () => {
    expect(pcs(tokens(byId['t-scale-C-major']!.notation.rh))).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(pcs(tokens(byId['t-scale-A-minor']!.notation.rh))).toEqual([0, 2, 4, 5, 8, 9, 11]);
  });

  it('spells scales properly: E♯ in F♯ major, C♭ in E♭ minor, no double accidentals', () => {
    const names = (id: string) => tokens(byId[id]!.notation.rh).map((t) => t.name.replace(/\d/, ''));
    expect(names('t-scale-Fs-major')).toContain('E#');
    expect(names('t-scale-Fs-major')).not.toContain('F');
    expect(names('t-scale-Eb-minor')).toContain('Cb');
    expect(names('t-scale-Eb-minor')).toContain('D');
    for (const p of techniquePieces) {
      for (const t of tokens(p.notation.rh)) expect(t.name, p.id).toMatch(/^[A-G][#b]?\d$/);
    }
  });

  it('never puts a thumb (finger 1) on a black key, in either hand', () => {
    for (const p of techniquePieces) {
      for (const t of [...tokens(p.notation.rh), ...tokens(p.notation.lh)]) {
        if (t.finger === 1) expect(WHITE.has(((t.midi % 12) + 12) % 12), `${p.id} ${t.name}`).toBe(true);
      }
    }
  });

  it('gives the textbook fingering for C major (RH 1 2 3 1 2 3 4 1 2 3 1 2 3 4 5, LH 5 4 3 2 1 3 2 1 4 3 2 1 3 2 1)', () => {
    const p = byId['t-scale-C-major']!;
    expect(tokens(p.notation.rh).slice(0, 15).map((t) => t.finger)).toEqual([1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]);
    expect(tokens(p.notation.lh).slice(0, 15).map((t) => t.finger)).toEqual([5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]);
  });

  it('gives the textbook fingering for F major RH and F♯ major RH', () => {
    expect(tokens(byId['t-scale-F-major']!.notation.rh).slice(0, 15).map((t) => t.finger)).toEqual([1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 4]);
    expect(tokens(byId['t-scale-Fs-major']!.notation.rh).slice(0, 15).map((t) => t.finger)).toEqual([2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2]);
  });

  it('gives each hand the same finger for the same note on the way down', () => {
    for (const p of techniquePieces.filter((x) => x.group === 'scales')) {
      for (const hand of [p.notation.rh, p.notation.lh]) {
        const t = tokens(hand);
        for (let i = 1; i <= 13; i++) expect(t[14 + i]!.finger, `${p.id} step ${i}`).toBe(t[14 - i]!.finger);
      }
    }
  });

  it('only uses fingers 1–5 and covers every scale index', () => {
    for (const k of KEYS) {
      for (let i = 0; i < 15; i++) {
        for (const f of [rhFinger(k.rh, i), lhFinger(k.lh, i)]) {
          expect(f).toBeGreaterThanOrEqual(1);
          expect(f).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('builds triad arpeggios: root, third, fifth over two octaves, major vs minor third', () => {
    const c = tokens(byId['t-arp-C-major']!.notation.rh);
    expect(c.slice(0, 7).map((t) => t.midi)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    const am = tokens(byId['t-arp-A-minor']!.notation.rh);
    expect(am.slice(0, 3).map((t) => t.midi)).toEqual([57, 60, 64]);
  });

  it('numbers arpeggios only where the thumb lands on a white key', () => {
    expect(tokens(byId['t-arp-C-major']!.notation.rh)[0]!.finger).toBe(1);
    expect(tokens(byId['t-arp-Bb-major']!.notation.rh)[0]!.finger).toBeUndefined();
    expect(tokens(byId['t-arp-Fs-major']!.notation.lh)[0]!.finger).toBeUndefined();
  });
});
