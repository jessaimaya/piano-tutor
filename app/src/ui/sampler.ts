/**
 * The recorded piano: one MP3 per key from C2 to B5 (public/samples/piano, made by tools/piano-samples.py), fetched when first needed and
 * kept decoded in memory. A key without its own sample is made from the nearest one, played faster or slower.
 */
export interface Root {
  midi: number;
  file: string;
  /** Seconds of silence before the hammer. */
  onset: number;
  /** Makes this key as loud as the others. */
  gain: number;
}

/** The sample to use for a key: the closest one, and the playback rate that turns it into this key. Undefined when none is close enough. */
export function nearestRoot<T extends { midi: number }>(roots: readonly T[], midi: number, maxShift = 5): { root: T; rate: number } | undefined {
  let best: T | undefined;
  for (const r of roots) if (!best || Math.abs(r.midi - midi) < Math.abs(best.midi - midi)) best = r;
  if (!best || Math.abs(best.midi - midi) > maxShift) return undefined;
  return { root: best, rate: 2 ** ((midi - best.midi) / 12) };
}

export interface Picked {
  buffer: AudioBuffer;
  rate: number;
  gain: number;
  onset: number;
}

export class Sampler {
  private roots: Root[] = [];
  private buffers = new Map<number, AudioBuffer>();
  private pending = new Map<number, Promise<void>>();
  private manifest: Promise<void> | undefined;
  /** The samples could not be fetched (not installed, offline): everything falls back to the built-in piano. */
  failed = false;

  constructor(private base = `${import.meta.env.BASE_URL}samples/piano/`) {}

  private async loadManifest(): Promise<void> {
    try {
      const res = await fetch(this.base + 'manifest.json');
      if (!res.ok) throw new Error(String(res.status));
      this.roots = ((await res.json()) as { roots: Root[] }).roots;
    } catch {
      this.failed = true;
    }
  }

  /** Fetch and decode the samples these keys need (all of them when none are named). */
  async load(ctx: BaseAudioContext, midis?: readonly number[]): Promise<void> {
    await (this.manifest ??= this.loadManifest());
    if (this.failed) return;
    const wanted = new Set<number>();
    for (const m of midis ?? this.roots.map((r) => r.midi)) {
      const near = nearestRoot(this.roots, m);
      if (near) wanted.add(near.root.midi);
    }
    await Promise.all([...wanted].map((m) => this.fetchOne(ctx, m)));
  }

  private fetchOne(ctx: BaseAudioContext, midi: number): Promise<void> {
    if (this.buffers.has(midi)) return Promise.resolve();
    let p = this.pending.get(midi);
    if (!p) {
      const root = this.roots.find((r) => r.midi === midi)!;
      p = fetch(this.base + root.file)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => { this.buffers.set(midi, buf); })
        .catch(() => { this.failed = true; })
        .finally(() => this.pending.delete(midi));
      this.pending.set(midi, p);
    }
    return p;
  }

  /** True when these keys can be played now: their samples are decoded, or there will never be any (then the built-in piano plays). */
  has(midis: readonly number[]): boolean {
    if (this.failed) return true;
    if (!this.roots.length) return false;
    return midis.every((m) => {
      const near = nearestRoot(this.roots, m);
      return !near || this.buffers.has(near.root.midi);
    });
  }

  /** The decoded sample for a key, or undefined if it is not loaded (yet). */
  pick(midi: number): Picked | undefined {
    const near = nearestRoot(this.roots, midi);
    const buffer = near && this.buffers.get(near.root.midi);
    return near && buffer ? { buffer, rate: near.rate, gain: near.root.gain, onset: near.root.onset } : undefined;
  }
}
