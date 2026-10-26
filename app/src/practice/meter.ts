/**
 * What one "beat" means for a time signature, so tempo mode can count 6/8 in dotted quarters, 3/8 in eighths and 2/2 in halves.
 *
 * The score's timeline and the tempo run both count in quarter notes. The tempo the player sets, the targets in the library
 * and the metronome clicks count in *this* unit instead: `quarters` quarter notes long, `perBar` of them in a bar.
 * Compound meters (6/8, 9/8, 12/8) group the eighths in threes, so the beat is a dotted quarter. Everything else beats on the
 * note value in the denominator, but never slower than a quarter (2/4, 3/4, 4/4, 6/4, 2/2, 3/2: quarter; 3/8: eighth).
 */

export interface BeatUnit {
  /** Length of one beat in quarter notes (1.5 for a dotted quarter). */
  quarters: number;
  /** Beats in a bar. */
  perBar: number;
  /** For labels: "quarter", "dotted quarter"… */
  name: string;
}

const NAMES: Record<number, string> = { 0.25: 'sixteenth', 0.5: 'eighth', 1: 'quarter', 1.5: 'dotted quarter', 2: 'half', 3: 'dotted half', 4: 'whole' };

export function beatUnit(beats: number, beatType: number): BeatUnit {
  const compound = beats > 3 && beats % 3 === 0 && beatType >= 8;
  const quarters = beatType < 4 ? 1 : (compound ? 12 : 4) / beatType;
  return { quarters, perBar: compound ? beats / 3 : (beats * 4) / beatType / quarters, name: NAMES[quarters] ?? `${quarters}-quarter` };
}

export const QUARTER_BEAT: BeatUnit = beatUnit(4, 4);

/** First time signature in a MusicXML string; undefined for free time (no `<time>` or `<senza-misura>`). */
export function timeSigFromXml(xml: string): [number, number] | undefined {
  const m = /<time\b[^>]*>\s*<beats>\s*(\d+)\s*<\/beats>\s*<beat-type>\s*(\d+)\s*<\/beat-type>/.exec(xml);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

export const beatUnitOfXml = (xml: string): BeatUnit => {
  const ts = timeSigFromXml(xml);
  return ts ? beatUnit(ts[0], ts[1]) : QUARTER_BEAT;
};

/** Slowest and fastest tempo the player can set, in this beat unit: the same 30–160 quarters per minute for every meter. */
export const MIN_QUARTERS_PER_MIN = 30;
export const MAX_QUARTERS_PER_MIN = 160;
export const bpmRange = (u: BeatUnit): { min: number; max: number } => ({
  min: Math.ceil(MIN_QUARTERS_PER_MIN / u.quarters),
  max: Math.floor(MAX_QUARTERS_PER_MIN / u.quarters),
});
