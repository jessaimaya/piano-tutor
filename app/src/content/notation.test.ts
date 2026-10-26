import { describe, expect, it } from 'vitest';
import { buildMusicXml, midiOf, parsePitch } from './notation';

const base = { title: 'T', timeSig: [4, 4] as [number, number], fifths: 0 };

describe('midiOf', () => {
  it('maps pitches to MIDI numbers (C4 = 60)', () => {
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('A0')).toBe(21);
    expect(midiOf('F#3')).toBe(54);
    expect(midiOf('Bb4')).toBe(70);
    expect(midiOf('C8')).toBe(108);
  });
  it('rejects bad pitches', () => {
    expect(() => parsePitch('H4')).toThrow();
    expect(() => parsePitch('C')).toThrow();
  });
});

describe('buildMusicXml', () => {
  it('builds a two-hand piece with a chord and a rest', () => {
    const xml = buildMusicXml({ ...base, rh: 'C4:q D4:q E4:h |', lh: 'C3+G3:h R:h |' });
    expect(xml.match(/<measure /g)).toHaveLength(1);
    expect(xml).toContain('<step>C</step><octave>4</octave>');
    expect(xml).toContain('<chord/>');
    expect(xml).toContain('<rest/>');
    expect(xml).toContain('<backup><duration>16</duration></backup>');
  });

  it('writes sharps/flats as alter and dotted notes with <dot/>', () => {
    const xml = buildMusicXml({ ...base, rh: 'F#4:q. G4:e A4:h |' });
    expect(xml).toContain('<step>F</step><alter>1</alter>');
    expect(xml).toContain('<duration>6</duration><voice>1</voice><type>quarter</type><dot/>');
  });

  it('puts fingering on the first note of a token', () => {
    expect(buildMusicXml({ ...base, rh: 'C4:w/1 |' })).toContain('<fingering>1</fingering>');
  });

  it('fills the missing hand with a whole-measure rest', () => {
    const xml = buildMusicXml({ ...base, rh: 'C4:w | D4:w |' });
    expect(xml.match(/<rest measure="yes"\/>/g)).toHaveLength(2);
  });

  it('supports other time signatures', () => {
    expect(() => buildMusicXml({ ...base, timeSig: [3, 4], rh: 'C4:h. |' })).not.toThrow();
    expect(() => buildMusicXml({ ...base, timeSig: [6, 8], rh: 'C4:q. D4:q. |' })).not.toThrow();
  });

  it('throws when a bar does not add up, naming the bar', () => {
    expect(() => buildMusicXml({ ...base, rh: 'C4:q D4:q |' })).toThrow(/RH bar 1 has 2 beats, expected 4/);
    expect(() => buildMusicXml({ ...base, rh: 'C4:w | C4:q |' })).toThrow(/bar 2/);
  });

  it('throws when the hands have different bar counts', () => {
    expect(() => buildMusicXml({ ...base, rh: 'C4:w | C4:w |', lh: 'C3:w |' })).toThrow(/2 bars but LH has 1/);
  });

  it('throws on bad tokens and on empty pieces', () => {
    expect(() => buildMusicXml({ ...base, rh: 'C4:x |' })).toThrow(/Bad token/);
    expect(() => buildMusicXml({ ...base })).toThrow(/no notes/);
  });

  it('escapes XML in titles', () => {
    expect(buildMusicXml({ ...base, title: 'A & B <1>', rh: 'C4:w |' })).toContain('A &amp; B &lt;1&gt;');
  });
});
