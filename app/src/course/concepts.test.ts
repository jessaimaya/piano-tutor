import { describe, expect, it } from 'vitest';
import { pieces } from '../content/pieces';
import { positionPieces, techniquePieces } from '../content/technique';
import type { NotationPiece } from '../content/notation';
import { course } from './ladder';

/**
 * The order the course teaches things in (Faber Adult Book 1 and 02-syllabus.md). Each concept names the first unit that may use it;
 * a piece or exercise placed in an earlier unit that uses it is a mistake in the course, not in the player. Only pieces whose
 * notation is in the repo are checked (the imported books are checked against their pages by tools/omr/).
 */
const FIRST_UNIT: Record<string, string> = {
  'dotted half note and 3/4 time': '0.4',
  'rests inside a tune': '0.2',
  'both hands in the same bar': '1.1',
  'chords in one hand': '1.2',
  'a flat key (the F position)': '1.3',
  'a sharp key (the D position)': '1.4',
  'eighth notes': '1.4',
  'dotted quarter note': '2.1',
  'sharps or flats outside the key': '2.1',
};

const all = [...pieces, ...techniquePieces, ...positionPieces];
const toks = (text: string | undefined): string[] => (text ?? '').split(/[\s|]+/).filter(Boolean);
const dur = (t: string) => t.split(':')[1]?.split('/')[0] ?? '';

/** The concepts a piece uses. */
function conceptsOf(n: NotationPiece): Set<string> {
  const out = new Set<string>();
  const hands = [n.rh, n.lh];
  for (const h of hands) {
    for (const t of toks(h)) {
      const d = dur(t);
      if (d === 'h.') out.add('dotted half note and 3/4 time');
      if (d === 'e') out.add('eighth notes');
      if (d === 'q.') out.add('dotted quarter note');
      if (t.startsWith('R:') && !['R:w', 'R:h.'].includes(t)) out.add('rests inside a tune');
      if (!t.startsWith('R:') && t.includes('+')) out.add('chords in one hand');
      if (!t.startsWith('R:') && /^[A-G][#b]/.test(t) && n.fifths === 0) out.add('sharps or flats outside the key');
    }
  }
  if (n.timeSig[0] === 3) out.add('dotted half note and 3/4 time');
  if (n.fifths < 0) out.add('a flat key (the F position)');
  if (n.fifths > 0) out.add('a sharp key (the D position)');
  const rh = (n.rh ?? '').split('|').map((b) => b.trim()), lh = (n.lh ?? '').split('|').map((b) => b.trim());
  const playing = (bar: string | undefined) => !!bar && toks(bar).some((t) => !t.startsWith('R:'));
  if (rh.some((b, i) => playing(b) && playing(lh[i]))) out.add('both hands in the same bar');
  return out;
}

const unitIndex = (id: string) => course.units.findIndex((u) => u.id === id);

describe('the order of concepts', () => {
  for (const u of course.units) {
    const ids = [...new Set([...u.main, ...u.warmup])];
    it(`unit ${u.id} teaches nothing before its time`, () => {
      for (const id of ids) {
        const piece = all.find((p) => p.id === id);
        if (!piece) continue;
        const warm = u.warmup.includes(id) && !u.main.includes(id);
        const hands = warm ? (u.warmupHands ?? ['both']) : null;
        for (const c of conceptsOf(piece.notation)) {
          // The warm-up one hand at a time never puts both hands in a bar: the exercise is the same notes, one hand of it.
          if (c === 'both hands in the same bar' && hands && !hands.includes('both')) continue;
          expect(unitIndex(FIRST_UNIT[c]!), `${id} (in unit ${u.id}) uses ${c}, which is taught from unit ${FIRST_UNIT[c]}`).toBeLessThanOrEqual(unitIndex(u.id));
        }
      }
    });
  }
});
