import { describe, expect, it } from 'vitest';
import { pieces } from '../content/pieces';
import { midiOf } from '../content/notation';
import { cardKey, cardXml, deckFor, drawCard, judgeCard, KNOWN_AFTER, newCards } from './cards';
import { course } from './ladder';

const names = (deck: { clef: string; name: string }[], clef: string) => deck.filter((c) => c.clef === clef).map((c) => c.name);

describe('the deck follows the units', () => {
  it('starts with the five right-hand notes and no bass notes at all', () => {
    const deck = deckFor(course, '0.1');
    expect(names(deck, 'treble')).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    expect(names(deck, 'bass')).toEqual([]);
  });

  it('adds the left hand’s notes in the unit that teaches the left hand', () => {
    expect(names(deckFor(course, '0.2'), 'bass')).toEqual(['C3', 'D3', 'E3', 'F3', 'G3']);
    expect(newCards(course.units.find((u) => u.id === '0.2')!).map(cardKey)).toEqual(['bass:C3', 'bass:D3', 'bass:E3', 'bass:F3', 'bass:G3']);
  });

  it('grows as the units go and never loses a note', () => {
    let last = 0;
    for (const u of course.units.filter((x) => x.stage === 0)) {
      const size = deckFor(course, u.id).length;
      expect(size, u.id).toBeGreaterThanOrEqual(last);
      last = size;
    }
    expect(names(deckFor(course, '0.5'), 'bass')).toEqual(['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']);
  });

  it('holds every note the stage 0 exercises use, by the unit that uses it, in the clef it is written in', () => {
    for (const u of course.units.filter((x) => x.stage === 0)) {
      const deck = new Set(deckFor(course, u.id).map(cardKey));
      for (const id of u.main) {
        const piece = pieces.find((p) => p.id === id);
        if (!piece) continue; // an imported score: checked against its file by tools/omr, not here
        for (const [hand, clef] of [['rh', 'treble'], ['lh', 'bass']] as const) {
          const text = piece.notation[hand];
          if (!text) continue;
          const used = new Set(text.split(/[\s|]+/).filter((t) => t && !t.startsWith('R:')).map((t) => t.split(':')[0]!.replace(/\/\d$/, '')));
          for (const note of used) expect(deck.has(`${clef}:${note}`), `${u.id}: ${id} uses ${note} in the ${clef} clef, which is not in the deck yet`).toBe(true);
        }
      }
    }
  });
});

describe('drawing cards', () => {
  const deck = deckFor(course, '0.2');
  const seeded = () => { let seed = 7; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); };

  it('never repeats the previous card, and reaches every card', () => {
    const rand = seeded();
    let prev = drawCard(rand, deck);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const next = drawCard(rand, deck, prev);
      expect(cardKey(next)).not.toBe(cardKey(prev));
      seen.add(cardKey(next));
      prev = next;
    }
    expect(seen.size).toBe(deck.length);
  });

  it('survives the extremes of the random source', () => {
    expect(cardKey(drawCard(() => 0, deck))).toBe('treble:C4');
    expect(deck.map(cardKey)).toContain(cardKey(drawCard(() => 0.999999999, deck)));
  });

  it('shows a note that is still being learned three times as often as a known one', () => {
    const rand = seeded();
    const known = Object.fromEntries(deck.filter((c) => c.clef === 'treble').map((c) => [cardKey(c), KNOWN_AFTER]));
    let learning = 0, total = 6000;
    for (let i = 0; i < total; i++) if (drawCard(rand, deck, undefined, known).clef === 'bass') learning++;
    // 5 learning cards at weight 3 against 5 known at weight 1: three quarters of the draws
    expect(learning / total).toBeGreaterThan(0.72);
    expect(learning / total).toBeLessThan(0.78);
  });

  it('builds a one-bar score with the note in the right clef', () => {
    expect(cardXml(deck[0]!)).toContain('<step>C</step><octave>4</octave>');
    const bass = cardXml(deck.find((c) => c.name === 'F3')!);
    expect(bass).toContain('<step>F</step><octave>3</octave>');
    expect(bass).toContain('<staff>2</staff>');
  });

  it('judges the key and the time', () => {
    const card = deck[2]!; // E4
    expect(judgeCard(card, midiOf('E4'), 1200)).toEqual({ right: true, fast: true });
    expect(judgeCard(card, 64, 2000)).toEqual({ right: true, fast: true });
    expect(judgeCard(card, 64, 2001)).toEqual({ right: true, fast: false });
    expect(judgeCard(card, 65, 300)).toEqual({ right: false, fast: false });
  });
});
