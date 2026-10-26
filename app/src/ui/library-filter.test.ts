import { describe, expect, it } from 'vitest';
import { filterLibrary, isFiltering, NO_FILTER, type LibraryItem } from './library-filter';

const item = (o: Partial<LibraryItem> & { id: string }): LibraryItem => ({
  title: o.id, composer: 'Own', stage: 1, hands: 'both', status: 'new', skills: [], technique: false, ...o,
});
const items = [
  item({ id: 'gym', title: 'Gymnopédie No. 1', composer: 'Satie', stage: 4, difficulty: 78, skills: ['3/4', 'D-key-sig'] }),
  item({ id: 'fur', title: 'Für Elise', composer: 'Beethoven', stage: 4, difficulty: 66, status: 'practicing', hands: 'both' }),
  item({ id: 'mary', title: 'Mary', stage: 1, hands: 'rh', status: 'done' }),
  item({ id: 'scale', title: 'C major scale', composer: 'Technique', stage: 2, technique: true }),
];
const ids = (f: Partial<typeof NO_FILTER>) => filterLibrary(items, { ...NO_FILTER, ...f }).map((i) => i.id);

describe('library filter', () => {
  it('returns everything, in order, with no filter', () => {
    expect(ids({})).toEqual(['gym', 'fur', 'mary', 'scale']);
    expect(isFiltering(NO_FILTER)).toBe(false);
  });
  it('searches title, composer and skills, ignoring accents and case; every word must match', () => {
    expect(ids({ query: 'gymnopedie' })).toEqual(['gym']);
    expect(ids({ query: 'SATIE gym' })).toEqual(['gym']);
    expect(ids({ query: 'beethoven' })).toEqual(['fur']);
    expect(ids({ query: 'fur elise' })).toEqual(['fur']);
    expect(ids({ query: '3/4' })).toEqual(['gym']);
    expect(ids({ query: 'satie elise' })).toEqual([]);
  });
  it('filters by stage, status, hands and pieces only', () => {
    expect(ids({ stage: 4 })).toEqual(['gym', 'fur']);
    expect(ids({ status: 'done' })).toEqual(['mary']);
    expect(ids({ hands: 'rh' })).toEqual(['mary']);
    expect(ids({ piecesOnly: true })).toEqual(['gym', 'fur', 'mary']);
  });
  it('combines filters', () => {
    expect(ids({ stage: 4, status: 'practicing' })).toEqual(['fur']);
  });
  it('sorts by difficulty (unmeasured first) or title without mutating the input', () => {
    expect(ids({ sort: 'difficulty' })).toEqual(['mary', 'scale', 'fur', 'gym']);
    expect(ids({ sort: 'title' })).toEqual(['scale', 'fur', 'gym', 'mary'].sort((a, b) => items.find((i) => i.id === a)!.title.localeCompare(items.find((i) => i.id === b)!.title)));
    expect(items.map((i) => i.id)).toEqual(['gym', 'fur', 'mary', 'scale']);
  });
});

describe('sort by what needs practice', () => {
  const scored = (id: string, score?: number) => item({ id, score });
  it('puts the lowest scores first and unplayed pieces last, keeping course order among them', () => {
    const out = filterLibrary([scored('a'), scored('b', 90), scored('c', 40), scored('d'), scored('e', 70)], { ...NO_FILTER, sort: 'practice' });
    expect(out.map((i) => i.id)).toEqual(['c', 'e', 'b', 'a', 'd']);
  });
});
