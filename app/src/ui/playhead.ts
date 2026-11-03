/** Where a step sits on the page, in OSMD units, and when (in quarter-note beats) it is due. */
export interface Spot {
  beat: number;
  x: number;
  /** Top and bottom of the system the step is on. */
  y0: number;
  y1: number;
  /** Where the staff begins (the left edge of the bar this step is in). */
  left?: number;
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

/**
 * The line before the first note: it comes in from the start of the staff during the count-in at the speed it will then have in the piece,
 * so the way it moves tells you when the first note is due. With more count-in than the walk needs, it waits at the start of the staff
 * and sets off in time to arrive on the first beat.
 */
export function withLeadIn(spots: Spot[], beats: number): Spot[] {
  const f = spots[0];
  if (!f) return spots;
  const left = f.left !== undefined && f.left < f.x - 2 ? f.left : f.x - 6;
  // the speed it will have right after the first note: over the first two beats of the piece
  const ahead = playheadAt(spots, f.beat + 2);
  const speed = ahead && ahead.y0 === f.y0 && ahead.beat > f.beat ? (ahead.x - f.x) / (Math.min(f.beat + 2, spots[spots.length - 1]!.beat) - f.beat) : 0;
  if (!(speed > 0)) return [{ ...f, beat: -beats, x: left }, ...spots];
  const travel = (f.x - left) / speed; // beats the walk from the start of the staff takes
  if (travel >= beats) return [{ ...f, beat: -beats, x: f.x - speed * beats }, ...spots];
  return [{ ...f, beat: -beats, x: left }, { ...f, beat: -travel, x: left }, ...spots];
}
