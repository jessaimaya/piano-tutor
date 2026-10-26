import { unpackMxl } from './mxl';
import type { Hands } from '../practice/log';

/**
 * Imported scores: `.mxl`/`.musicxml` files in app/scores/, described by app/scores/library.json.
 * Unlike pieces.ts these are files we did not write, so the manifest records where each came from and its licence.
 * Adding one = drop the file in scores/ and add an entry to library.json (no code change).
 */

export interface ScoreEntry {
  id: string;
  /** File name inside app/scores/. */
  file: string;
  title: string;
  composer: string;
  stage: number;
  skills: string[];
  /** Beats per minute at which three clean runs finish the piece. The beat is what the time signature implies (a dotted quarter in 6/8,
   * an eighth in 3/8, a quarter otherwise: see practice/meter.ts). A first estimate: adjust after playing it. */
  targetBpm: number;
  hands: Hands;
  /** 'public-domain' only when the file itself says so; otherwise the work is old but this arrangement is unverified. */
  license: 'public-domain' | 'unverified-arrangement' | 'own' | 'purchased';
  /** Where it came from: a repo, a store, "Islands p. 48"… */
  source: string;
  /** Measured by tools/score-difficulty.py (about 20 = very easy, 200 = virtuoso); the stage is derived from it. */
  difficulty?: number;
  /** Caveats shown next to the title, e.g. compound meter or a file that looks odd. */
  notes?: string;
}

const manifests = import.meta.glob<ScoreEntry[]>('../../scores/library.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../scores/*.{mxl,musicxml,xml}', { eager: true, query: '?url', import: 'default' });

const urlOf = (file: string): string | undefined =>
  Object.entries(urls).find(([path]) => path.endsWith('/' + file))?.[1];

/** Entries whose file is actually present (a manifest line without its file is skipped, not an error). */
export const scoreEntries: ScoreEntry[] = Object.values(manifests)
  .flat()
  .filter((e) => urlOf(e.file) !== undefined);

export async function scoreEntryXml(entry: ScoreEntry): Promise<string> {
  const url = urlOf(entry.file);
  if (!url) throw new Error(`Missing score file ${entry.file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${entry.file} (${res.status})`);
  if (!entry.file.toLowerCase().endsWith('.mxl')) return res.text();
  return unpackMxl(await res.arrayBuffer());
}
