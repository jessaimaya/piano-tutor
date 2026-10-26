import { describe, expect, it } from 'vitest';
import { midiOf } from './notation';
import { pieces, pieceXml, STAGE_NAMES } from './pieces';

function allPitches(text: string | undefined): number[] {
  return (text?.match(/[A-G][#b]?\d(?=[+:])/g) ?? []).map(midiOf);
}

describe('starter library', () => {
  it('has unique ids and a known stage for every piece', () => {
    const ids = pieces.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of pieces) expect(STAGE_NAMES[p.stage], p.id).toBeDefined();
  });

  it.each(pieces.map((p) => [p.id, p] as const))('%s builds valid MusicXML', (_id, piece) => {
    const xml = pieceXml(piece);
    expect(xml).toContain('<score-partwise');
    expect(xml).toContain(`<work-title>${piece.title.replace(/&/g, '&amp;')}</work-title>`);
  });

  it('derives the hands from the notation', () => {
    const byId = Object.fromEntries(pieces.map((p) => [p.id, p]));
    expect(byId['s0-turns']!.hands).toBe('both');
    expect(byId['s1-ode-rh']!.hands).toBe('rh');
    expect(byId['s2-scale-c-lh']!.hands).toBe('lh');
  });

  it('keeps RH above Middle C−5 and LH below Middle C+5 (no hand-crossing surprises)', () => {
    for (const p of pieces) {
      for (const n of allPitches(p.notation.rh)) expect(n, `${p.id} RH`).toBeGreaterThanOrEqual(59);
      for (const n of allPitches(p.notation.lh)) expect(n, `${p.id} LH`).toBeLessThanOrEqual(72);
    }
  });

  it('never starts a bar with both hands on the same key (a cheap guard, not a full timeline check)', () => {
    for (const p of pieces) {
      const { rh, lh } = p.notation;
      if (!rh || !lh) continue;
      const rb = rh.split('|').map((b) => b.trim()).filter(Boolean);
      const lb = lh.split('|').map((b) => b.trim()).filter(Boolean);
      rb.forEach((bar, i) => {
        const a = allPitches(bar.split(/\s+/)[0]);
        const b = allPitches(lb[i]!.split(/\s+/)[0]);
        for (const n of a) expect(b, `${p.id} bar ${i + 1}`).not.toContain(n);
      });
    }
  });

  it('gives every piece a sensible target tempo', () => {
    for (const p of pieces) {
      expect(p.targetBpm, p.id).toBeGreaterThanOrEqual(40);
      expect(p.targetBpm, p.id).toBeLessThanOrEqual(120);
    }
  });

  it('only ships traditional, public-domain or original material', () => {
    for (const p of pieces) expect(['own', 'traditional', 'public-domain']).toContain(p.license);
  });
});
