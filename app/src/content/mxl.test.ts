import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { unpackMxl } from './mxl';

const SCORE = '<score-partwise version="3.1"><part-list/></score-partwise>';

describe('unpackMxl', () => {
  it('reads the root file named in META-INF/container.xml', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="score/main.xml"/></rootfiles></container>');
    zip.file('score/main.xml', SCORE);
    zip.file('other.xml', '<nope/>');
    expect(await unpackMxl(await zip.generateAsync({ type: 'uint8array' }))).toBe(SCORE);
  });

  it('falls back to the first score file when there is no container', async () => {
    const zip = new JSZip();
    zip.file('piece.musicxml', SCORE);
    expect(await unpackMxl(await zip.generateAsync({ type: 'uint8array' }))).toBe(SCORE);
  });

  it('fails clearly when the archive holds no score', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'hi');
    await expect(unpackMxl(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/No MusicXML/);
  });
});
