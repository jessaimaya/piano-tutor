/**
 * Latency calibration: the player taps along with a row of clicks and we measure how far their taps land from them.
 * Output delay of the speakers, input delay of the piano/USB and the player's own habit all show up as one number.
 * Tempo mode subtracts it from every key press, so a setup that is always 40 ms late is not scored as 40 ms late.
 * Pure: times in ms, supplied by the caller.
 */

export const CALIBRATION_TAPS = 12;
/** A tap further than this from any click is not an answer to it. */
export const MATCH_WINDOW_MS = 300;
/** Beyond this the number is more likely a mistake (tapping on the off-beat, wrong device) than a real delay. */
export const MAX_LATENCY_MS = 250;
const MIN_MATCHED = 8;
/** Half the middle-50% range of the offsets: how uneven the taps were. */
const MAX_SPREAD_MS = 60;

export const clampLatency = (ms: number): number =>
  Number.isFinite(ms) ? Math.max(-MAX_LATENCY_MS, Math.min(MAX_LATENCY_MS, Math.round(ms))) : 0;

/** For each click, the offset of the nearest tap not yet used for an earlier click (positive = late). Clicks nobody answered are skipped. */
export function matchTaps(clicks: readonly number[], taps: readonly number[], windowMs = MATCH_WINDOW_MS): number[] {
  const used = new Set<number>();
  const offsets: number[] = [];
  for (const c of clicks) {
    let best = -1;
    taps.forEach((t, i) => {
      if (used.has(i) || Math.abs(t - c) > windowMs) return;
      if (best < 0 || Math.abs(t - c) < Math.abs(taps[best]! - c)) best = i;
    });
    if (best >= 0) {
      used.add(best);
      offsets.push(taps[best]! - c);
    }
  }
  return offsets;
}

const quantile = (sorted: number[], q: number): number => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo]! + (sorted[Math.min(lo + 1, sorted.length - 1)]! - sorted[lo]!) * (pos - lo);
};

export type Calibration = { ok: true; ms: number; spreadMs: number; taps: number } | { ok: false; reason: string };

export function estimateLatency(offsets: readonly number[]): Calibration {
  if (offsets.length < MIN_MATCHED) {
    return { ok: false, reason: `I only heard ${offsets.length} taps near the clicks (need ${MIN_MATCHED}). Tap any key on every click and try again.` };
  }
  const sorted = [...offsets].sort((a, b) => a - b);
  const ms = Math.round(quantile(sorted, 0.5));
  const spreadMs = Math.round((quantile(sorted, 0.75) - quantile(sorted, 0.25)) / 2);
  if (spreadMs > MAX_SPREAD_MS) {
    return { ok: false, reason: `The taps were too uneven (±${spreadMs} ms) to measure. Try again, tapping steadily on each click.` };
  }
  if (Math.abs(ms) > MAX_LATENCY_MS) {
    return { ok: false, reason: `That would be ${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}, which is more likely a mistake than your setup. Try again.` };
  }
  return { ok: true, ms, spreadMs, taps: offsets.length };
}
