import type { Hands, PieceStatus } from '../practice/log';

/** Search, filter and sort for the library list. Pure, so the rules are tested without a browser. */

export interface LibraryItem {
  id: string;
  title: string;
  composer: string;
  stage: number;
  hands: Hands;
  status: PieceStatus;
  skills: readonly string[];
  /** Measured by tools/score-difficulty.py; only imported scores have one. */
  difficulty?: number;
  /** Generated scales and arpeggios. */
  technique: boolean;
  /** Score of the latest full run, if the piece has been played. */
  score?: number;
}

export type SortBy = 'course' | 'difficulty' | 'title' | 'practice';

export interface LibraryFilter {
  query: string;
  stage: number | 'all';
  status: PieceStatus | 'all';
  hands: Hands | 'all';
  /** Hide scales and arpeggios. */
  piecesOnly: boolean;
  sort: SortBy;
}

export const NO_FILTER: LibraryFilter = { query: '', stage: 'all', status: 'all', hands: 'all', piecesOnly: false, sort: 'course' };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every word typed must appear in the title, composer or skills (accents and case ignored): "satie gym" finds Gymnopédie. */
function matchesQuery(item: LibraryItem, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${item.title} ${item.composer} ${item.skills.join(' ')} stage ${item.stage}`);
  return words.every((w) => hay.includes(w));
}

export function isFiltering(f: LibraryFilter): boolean {
  return f.query.trim() !== '' || f.stage !== 'all' || f.status !== 'all' || f.hands !== 'all' || f.piecesOnly || f.sort !== 'course';
}

export function filterLibrary(items: readonly LibraryItem[], f: LibraryFilter): LibraryItem[] {
  const out = items.filter(
    (i) =>
      matchesQuery(i, f.query) &&
      (f.stage === 'all' || i.stage === f.stage) &&
      (f.status === 'all' || i.status === f.status) &&
      (f.hands === 'all' || i.hands === f.hands) &&
      !(f.piecesOnly && i.technique),
  );
  if (f.sort === 'title') return out.sort((a, b) => a.title.localeCompare(b.title));
  // Easiest first; pieces with no measurement (our own, which are easy by construction) come before measured ones.
  if (f.sort === 'difficulty') return out.sort((a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0) || a.stage - b.stage || a.title.localeCompare(b.title));
  // Lowest latest score first, so what needs work is on top; pieces never played go last, in course order.
  if (f.sort === 'practice') return out.sort((a, b) => (a.score === undefined ? 1 : 0) - (b.score === undefined ? 1 : 0) || (a.score ?? 0) - (b.score ?? 0));
  return out;
}
