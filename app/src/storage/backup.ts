/**
 * Everything the app remembers (practice runs, scores, tempo per piece, course progress, settings) lives in this browser's
 * localStorage under the `piano-tutor:` prefix. A backup is those keys in one JSON file, so progress survives cleared browser data
 * and can move between a laptop and a phone. Values are copied as the strings they are stored as, so nothing here needs to know
 * what any key means.
 */
export const PREFIX = 'piano-tutor:';
export const BACKUP_VERSION = 1;
/** A backup larger than this is refused: the runs of years of daily practice are well under it. */
export const MAX_BACKUP_CHARS = 8_000_000;

export interface Backup {
  app: 'piano-tutor';
  version: number;
  exportedAt: string;
  data: Record<string, string>;
}

type Readable = Pick<Storage, 'length' | 'key' | 'getItem'>;
type Writable = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export function exportBackup(storage: Readable, now: Date = new Date()): Backup {
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) {
      const value = storage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  return { app: 'piano-tutor', version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export type Parsed = { ok: true; backup: Backup } | { ok: false; error: string };

export function parseBackup(text: string): Parsed {
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: 'That file is too large to be a Piano Tutor backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a backup (it is not valid JSON).' };
  }
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.app !== 'piano-tutor' || typeof b.data !== 'object' || b.data === null) {
    return { ok: false, error: 'That file is not a Piano Tutor backup.' };
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    return { ok: false, error: 'That backup comes from a newer version of the app. Update the app first.' };
  }
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(b.data)) {
    if (!key.startsWith(PREFIX) || typeof value !== 'string') {
      return { ok: false, error: `The backup holds something this app did not write (${key.slice(0, 40)}), so it was not loaded.` };
    }
    data[key] = value;
  }
  return { ok: true, backup: { app: 'piano-tutor', version: b.version, exportedAt: String(b.exportedAt ?? ''), data } };
}

/**
 * `replace` empties the app's own keys first, so the result is exactly the backup; `merge` keeps what is there and lets the backup
 * win on the keys they share. Returns how many keys were written.
 */
export function importBackup(storage: Writable, backup: Backup, mode: 'replace' | 'merge'): number {
  if (mode === 'replace') {
    const own: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) own.push(key);
    }
    for (const key of own) storage.removeItem(key);
  }
  let n = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    storage.setItem(key, value);
    n++;
  }
  return n;
}

export const backupFileName = (now: Date = new Date()): string => `piano-tutor-backup-${now.toISOString().slice(0, 10)}.json`;
