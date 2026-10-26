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

/** Notes of the unit's own list that are in the deck on its n-th day: two to begin with, one more each day (a unit's notes arrive one at a time). */
export const revealed = (unitDays: number): number => 2 + Math.max(0, unitDays);

/**
 * The deck at a unit: every note introduced before it, and the unit's own notes in the order its list gives them, as many as the days
 * spent in the unit allow (`unitDays`, left out for the whole list). The order is the order the books teach them: C D E F G in the
 * right hand; Middle C, B, A, G, F in the left.
 */
export function deckFor(c: Course, unitId: string, unitDays = Infinity): Card[] {
  const upto = c.units.findIndex((u) => u.id === unitId);
  const units = c.units.slice(0, upto < 0 ? c.units.length : upto + 1);
  const seen = new Set<string>();
  const out: Card[] = [];
  units.forEach((u, i) => {
    const mine = newCards(u);
    const own = i === units.length - 1 && upto >= 0 ? [...mine.filter((x) => x.clef === 'treble').slice(0, revealed(unitDays)), ...mine.filter((x) => x.clef === 'bass').slice(0, revealed(unitDays))] : mine;
    for (const card of own) if (!seen.has(cardKey(card))) { seen.add(cardKey(card)); out.push(card); }
  });
  return out;
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
