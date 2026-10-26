import { buildMusicXml, midiOf } from '../content/notation';
import type { Course, Unit } from './ladder';
import { CARD_LIMIT_MS } from './state';

/**
 * Note cards (stage 0): a note on the staff, and you play it. The syllabus asks for naming any note of the Middle C range within two
 * seconds; pressing the key is naming it, and the app can time that.
 * Which notes are in the deck follows the course: each stage 0 unit lists the notes it introduces (course.json `cards`), the same
 * notes its pieces use, and the deck grows as the units do.
 */
export interface Card {
  clef: 'treble' | 'bass';
  /** Scientific name, C4 = Middle C. */
  name: string;
  midi: number;
}

const make = (clef: Card['clef'], names: string[]): Card[] => names.map((name) => ({ clef, name, midi: midiOf(name) }));
export const cardKey = (c: Card): string => `${c.clef}:${c.name}`;

/** The notes a unit introduces, as cards. */
export const newCards = (unit: Unit): Card[] => [...make('treble', unit.cards?.treble ?? []), ...make('bass', unit.cards?.bass ?? [])];

/** The deck at a unit: every note introduced up to and including it, in the order they came. */
export function deckFor(c: Course, unitId: string): Card[] {
  const upto = c.units.findIndex((u) => u.id === unitId);
  const seen = new Set<string>();
  return c.units.slice(0, upto < 0 ? c.units.length : upto + 1).flatMap(newCards).filter((card) => !seen.has(cardKey(card)) && seen.add(cardKey(card)));
}

/** Fast and right answers needed in total before a card counts as known. */
export const KNOWN_AFTER = 3;
/** A card still being learned comes up this many times as often as a known one: new notes get the practice, old ones stay in the mix. */
const LEARNING_WEIGHT = 3;

/**
 * A card that is not the one just shown. `known` counts the fast, right answers per card (state.cardFast): the ones below
 * KNOWN_AFTER are drawn more often, so a note introduced today is seen often today, and fades into the mix as it is learned.
 */
export function drawCard(rand: () => number, deck: readonly Card[], previous?: Card, known: Record<string, number> = {}): Card {
  const choices = deck.filter((c) => !previous || cardKey(c) !== cardKey(previous));
  const weight = (c: Card) => ((known[cardKey(c)] ?? 0) < KNOWN_AFTER ? LEARNING_WEIGHT : 1);
  const total = choices.reduce((sum, c) => sum + weight(c), 0);
  let x = rand() * total;
  for (const c of choices) {
    x -= weight(c);
    if (x < 0) return c;
  }
  return choices[choices.length - 1]!;
}

/** The card as a one-bar score on the grand staff: the note is a whole note on the staff its clef names. */
export function cardXml(card: Card): string {
  const bars = `${card.name}:w |`;
  return buildMusicXml({ title: '', timeSig: [4, 4], fifths: 0, ...(card.clef === 'treble' ? { rh: bars } : { lh: bars }) });
}

export interface Judgement { right: boolean; fast: boolean }

export function judgeCard(card: Card, midi: number, ms: number): Judgement {
  const right = midi === card.midi;
  return { right, fast: right && ms <= CARD_LIMIT_MS };
}
