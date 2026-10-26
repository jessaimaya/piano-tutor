import JSZip from 'jszip';

/** Reads a score file: plain MusicXML as text, or a compressed `.mxl` (a zip) by unpacking its root score. */
export async function readScoreFile(file: Blob & { name?: string }): Promise<string> {
  const isZip = file.name?.toLowerCase().endsWith('.mxl');
  if (!isZip) return file.text();
  return unpackMxl(await file.arrayBuffer());
}

export async function unpackMxl(data: ArrayBuffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const container = zip.file('META-INF/container.xml');
  let path: string | undefined;
  if (container) {
    path = /<rootfile\b[^>]*\bfull-path="([^"]+)"/.exec(await container.async('string'))?.[1];
  }
  // No container (or a broken one): fall back to the first score-looking file outside META-INF.
  const entry =
    (path && zip.file(path)) ||
    zip.file(/^(?!META-INF\/).*\.(musicxml|xml)$/i)[0];
  if (!entry) throw new Error('No MusicXML score found inside the .mxl file');
  return entry.async('string');
}
