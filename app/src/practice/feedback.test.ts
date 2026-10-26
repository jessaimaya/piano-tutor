import { describe, expect, it } from 'vitest';
import { closest, describeMissed, describeOffTime, describeWrongNote } from './feedback';

describe('feedback wording', () => {
  it('says how far and in which direction a wrong note was', () => {
    expect(describeWrongNote(62, [60])).toBe('You played D4, wanted C4: 2 semitones too high.');
    expect(describeWrongNote(59, [60])).toBe('You played B3, wanted C4: 1 semitone too low.');
  });

  it('compares with the closest of several wanted notes (chords)', () => {
    expect(closest(50, [48, 64])).toBe(48);
    expect(describeWrongNote(65, [48, 64])).toContain('wanted E4: 1 semitone too high');
  });

  it('handles nothing wanted', () => {
    expect(describeWrongNote(60, [])).toContain('not in the score');
  });

  it('describes a right note at the wrong time, early and late', () => {
    expect(describeOffTime(60, 340)).toBe('C4 was the right note, but 340 ms late.');
    expect(describeOffTime(60, -212.4)).toBe('C4 was the right note, but 212 ms early.');
  });

  it('lists missed notes lowest first', () => {
    expect(describeMissed([60, 48])).toBe('Missed C3 + C4.');
  });
});
