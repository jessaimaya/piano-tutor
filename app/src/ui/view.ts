/** Two layouts of the same app: the full one, and a minimal one for small or e-ink screens (the score, the tempo, Start). */
export type ViewId = 'full' | 'minimal';

const isView = (v: unknown): v is ViewId => v === 'full' || v === 'minimal';

/** `?view=minimal` (a bookmark for the phone) beats the saved choice; anything unknown means the full view. */
export function resolveView(saved: string | null | undefined, query: string | null | undefined): ViewId {
  if (isView(query)) return query;
  return isView(saved) ? saved : 'full';
}

/** Staff sizes of the minimal view, as OSMD zoom (1 = the full view's size). */
export const ZOOMS = [0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1] as const;
export const DEFAULT_ZOOM = 1;

/** The saved zoom if it is one of the steps, otherwise the default. */
export const resolveZoom = (saved: string | null | undefined): number => ZOOMS.find((z) => z === Number(saved)) ?? DEFAULT_ZOOM;

/** One step bigger (+1) or smaller (-1), staying inside the list. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const i = Math.max(0, ZOOMS.findIndex((z) => z === zoom));
  return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))]!;
}
