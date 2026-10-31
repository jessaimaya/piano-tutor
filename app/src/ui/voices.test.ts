import { describe, expect, it } from 'vitest';
import { isVoice, pianoDecay, pianoPartials, VOICES } from './voices';

describe('voices', () => {
  it('knows its instruments, and only those', () => {
    expect(VOICES.map((v) => v.id)).toEqual(['grand', 'piano', 'soft', 'bells']);
    expect(isVoice('piano')).toBe(true);
    expect(isVoice('organ')).toBe(false);
    expect(isVoice(null)).toBe(false);
  });

  it('lets low piano notes ring longer than high ones, within limits', () => {
    expect(pianoDecay(36)).toBeGreaterThan(pianoDecay(60));
    expect(pianoDecay(60)).toBeGreaterThan(pianoDecay(84));
    expect(pianoDecay(0)).toBeLessThanOrEqual(5);
    expect(pianoDecay(127)).toBeGreaterThanOrEqual(0.5);
  });

  it('makes the overtones of a piano note die away sooner the higher they are', () => {
    const parts = pianoPartials(60, 0.8);
    for (let i = 1; i < parts.length; i++) expect(parts[i]!.tau).toBeLessThan(parts[i - 1]!.tau);
    expect(parts[0]!.amp).toBe(1);
    expect(parts.slice(1).every((p) => p.amp < 1)).toBe(true);
  });

  it('plays a harder note brighter', () => {
    const soft = pianoPartials(60, 0.2).find((p) => p.k === 3)!.amp;
    const hard = pianoPartials(60, 1).find((p) => p.k === 3)!.amp;
    expect(hard).toBeGreaterThan(soft);
  });
});
