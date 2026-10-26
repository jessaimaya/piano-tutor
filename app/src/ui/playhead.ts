/** Where a step sits on the page, in OSMD units, and when (in quarter-note beats) it is due. */
export interface Spot {
  beat: number;
  x: number;
  /** Top and bottom of the system the step is on. */
  y0: number;
  y1: number;
}

/**
 * Where the moving line is at `beat`: it slides from one step to the next in step with the music.
 * Across a line break there is nothing to slide over, so it waits on the last step of the line and jumps on the beat.
 */
export function playheadAt(spots: readonly Spot[], beat: number): Spot | undefined {
  if (!spots.length) return undefined;
  let i = 0;
  while (i + 1 < spots.length && spots[i + 1]!.beat <= beat) i++;
  const a = spots[i]!;
  const b = spots[i + 1];
  if (!b || b.y0 !== a.y0 || beat <= a.beat || b.beat <= a.beat) return a;
  return { ...a, x: a.x + ((beat - a.beat) / (b.beat - a.beat)) * (b.x - a.x) };
}
