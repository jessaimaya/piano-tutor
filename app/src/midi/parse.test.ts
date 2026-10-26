import { describe, expect, it } from 'vitest';
import { isBlackKey, noteName, parseMidi } from './parse';

describe('parseMidi', () => {
  it('parses note on', () => {
    expect(parseMidi([0x90, 60, 80])).toEqual({ type: 'noteOn', note: 60, velocity: 80, channel: 1 });
  });

  it('treats note-on with velocity 0 as note off (P-115 behaviour)', () => {
    expect(parseMidi([0x90, 60, 0])).toEqual({ type: 'noteOff', note: 60, channel: 1 });
  });

  it('parses a real note off', () => {
    expect(parseMidi([0x83, 64, 40])).toEqual({ type: 'noteOff', note: 64, channel: 4 });
  });

  it('parses sustain with a threshold at 64', () => {
    expect(parseMidi([0xb0, 64, 127])).toMatchObject({ type: 'sustain', value: 127, down: true });
    expect(parseMidi([0xb0, 64, 63])).toMatchObject({ type: 'sustain', value: 63, down: false });
  });

  it('keeps other controllers as generic control events', () => {
    expect(parseMidi([0xb0, 67, 100])).toEqual({ type: 'control', controller: 67, value: 100, channel: 1 });
  });

  it('drops Active Sensing, Clock and other system messages', () => {
    expect(parseMidi([0xfe])).toBeNull();
    expect(parseMidi([0xf8])).toBeNull();
  });

  it('ignores messages it does not use', () => {
    expect(parseMidi([0xe0, 0, 64])).toBeNull(); // pitch bend
    expect(parseMidi([])).toBeNull();
  });
});

describe('note helpers', () => {
  it('names notes with Middle C = C4 = 60', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C♯4');
    expect(noteName(21)).toBe('A0');
  });

  it('knows black keys', () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
  });
});
