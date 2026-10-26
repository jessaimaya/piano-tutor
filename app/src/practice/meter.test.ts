import { describe, expect, it } from 'vitest';
import { beatUnit, beatUnitOfXml, bpmRange, QUARTER_BEAT, timeSigFromXml } from './meter';

describe('beat unit', () => {
  it('beats on the denominator in simple meters', () => {
    expect(beatUnit(4, 4)).toEqual({ quarters: 1, perBar: 4, name: 'quarter' });
    expect(beatUnit(3, 4)).toMatchObject({ quarters: 1, perBar: 3 });
    expect(beatUnit(6, 4)).toMatchObject({ quarters: 1, perBar: 6 });
    expect(beatUnit(3, 8)).toEqual({ quarters: 0.5, perBar: 3, name: 'eighth' });
    expect(beatUnit(2, 2)).toEqual({ quarters: 1, perBar: 4, name: 'quarter' });
    expect(beatUnit(3, 2)).toMatchObject({ quarters: 1, perBar: 6 });
  });
  it('groups compound meters in threes: dotted-quarter beats', () => {
    expect(beatUnit(6, 8)).toEqual({ quarters: 1.5, perBar: 2, name: 'dotted quarter' });
    expect(beatUnit(9, 8)).toMatchObject({ quarters: 1.5, perBar: 3 });
    expect(beatUnit(12, 8)).toMatchObject({ quarters: 1.5, perBar: 4 });
  });
  it('a bar is always the same length in quarters as the time signature says', () => {
    for (const [b, t] of [[4, 4], [3, 4], [6, 8], [9, 8], [12, 8], [3, 8], [2, 2], [6, 4]] as const) {
      const u = beatUnit(b, t);
      expect(u.perBar * u.quarters).toBeCloseTo((b * 4) / t);
    }
  });
  it('reads the first time signature from MusicXML, with attributes or whitespace', () => {
    expect(timeSigFromXml('<attributes><time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>')).toEqual([4, 4]);
    expect(timeSigFromXml('<time>\n <beats>12</beats>\n <beat-type>8</beat-type>\n</time>')).toEqual([12, 8]);
    expect(timeSigFromXml('<attributes><divisions>1</divisions></attributes>')).toBeUndefined();
    expect(beatUnitOfXml('<score-partwise/>')).toBe(QUARTER_BEAT);
    expect(beatUnitOfXml('<time><beats>6</beats><beat-type>8</beat-type></time>').quarters).toBe(1.5);
  });
  it('keeps the tempo range at 30–160 quarters per minute whatever the beat', () => {
    expect(bpmRange(QUARTER_BEAT)).toEqual({ min: 30, max: 160 });
    expect(bpmRange(beatUnit(6, 8))).toEqual({ min: 20, max: 106 });
    expect(bpmRange(beatUnit(3, 8))).toEqual({ min: 60, max: 320 });
  });
});
