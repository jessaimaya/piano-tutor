import { describe, expect, it } from 'vitest';
import { keyToNote } from './input';

describe('keyToNote', () => {
  it('maps the home row to the octave from Middle C', () => {
    expect(keyToNote('KeyA', false)).toBe(60);
    expect(keyToNote('KeyJ', false)).toBe(71);
    expect(keyToNote('KeyW', false)).toBe(61);
  });

  it('maps the bottom row to C3–B3', () => {
    expect(keyToNote('KeyZ', false)).toBe(48);
    expect(keyToNote('KeyM', false)).toBe(59);
  });

  it('Shift drops only the bottom row an octave', () => {
    expect(keyToNote('KeyZ', true)).toBe(36);
    expect(keyToNote('KeyB', true)).toBe(43); // G2
    expect(keyToNote('KeyA', true)).toBe(60);
  });

  it('ignores other keys', () => {
    expect(keyToNote('KeyQ', false)).toBeUndefined();
    expect(keyToNote('Space', false)).toBeUndefined();
  });

  it('can reach every note used by the starter library on a plain keyboard', () => {
    // the lowest left-hand note in the library is F2 (41); every white key from there to B3 must be reachable
    const reachable = new Set<number>();
    for (const shift of [false, true])
      for (const code of ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM']) reachable.add(keyToNote(code, shift)!);
    for (const midi of [41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59]) expect(reachable.has(midi), String(midi)).toBe(true);
  });
});
