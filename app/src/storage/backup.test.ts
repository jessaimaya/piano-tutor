import { describe, expect, it } from 'vitest';
import { backupFileName, exportBackup, importBackup, MAX_BACKUP_CHARS, parseBackup, PREFIX } from './backup';

class FakeStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const filled = () => {
  const s = new FakeStorage();
  s.setItem(PREFIX + 'runs:v1', '[1,2]');
  s.setItem(PREFIX + 'theme', 'night');
  s.setItem('other-app:x', 'keep out');
  return s;
};

describe('backup', () => {
  it('exports only the app’s own keys', () => {
    const b = exportBackup(filled(), new Date('2026-10-26T10:00:00Z'));
    expect(Object.keys(b.data).sort()).toEqual([PREFIX + 'runs:v1', PREFIX + 'theme']);
    expect(b.exportedAt).toBe('2026-10-26T10:00:00.000Z');
    expect(backupFileName(new Date('2026-10-26T10:00:00Z'))).toBe('piano-tutor-backup-2026-10-26.json');
  });

  it('round-trips through JSON into an empty storage', () => {
    const parsed = parseBackup(JSON.stringify(exportBackup(filled())));
    expect(parsed.ok).toBe(true);
    const target = new FakeStorage();
    if (parsed.ok) expect(importBackup(target, parsed.backup, 'replace')).toBe(2);
    expect(target.getItem(PREFIX + 'runs:v1')).toBe('[1,2]');
    expect(target.getItem('other-app:x')).toBeNull();
  });

  it('replace empties the app’s keys first and leaves other apps alone; merge keeps what is there', () => {
    const backup = exportBackup(filled());
    const a = new FakeStorage();
    a.setItem(PREFIX + 'stale', 'old');
    a.setItem('other-app:y', 'mine');
    importBackup(a, backup, 'replace');
    expect(a.getItem(PREFIX + 'stale')).toBeNull();
    expect(a.getItem('other-app:y')).toBe('mine');

    const b = new FakeStorage();
    b.setItem(PREFIX + 'stale', 'old');
    b.setItem(PREFIX + 'theme', 'warm');
    importBackup(b, backup, 'merge');
    expect(b.getItem(PREFIX + 'stale')).toBe('old');
    expect(b.getItem(PREFIX + 'theme')).toBe('night'); // the backup wins on shared keys
  });

  it.each([
    ['not json', '{nope'],
    ['not a backup', JSON.stringify({ hello: 1 })],
    ['a newer version', JSON.stringify({ app: 'piano-tutor', version: 99, data: {} })],
    ['a foreign key', JSON.stringify({ app: 'piano-tutor', version: 1, data: { 'evil:key': 'x' } })],
    ['a non-string value', JSON.stringify({ app: 'piano-tutor', version: 1, data: { [PREFIX + 'a']: 5 } })],
    ['too big', 'x'.repeat(MAX_BACKUP_CHARS + 1)],
  ])('refuses %s without touching anything', (_name, text) => {
    expect(parseBackup(text).ok).toBe(false);
  });
});
