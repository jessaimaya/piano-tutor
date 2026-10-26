/**
 * A tiny synth so the app is playable without the piano (computer keyboard / mouse).
 * Not used for MIDI input: the P-115 makes its own sound.
 */
export class Synth {
  private ctx: AudioContext | undefined;
  private voices = new Map<number, { osc: OscillatorNode; gain: GainNode }>();

  /** True once the audio clock is running: a fresh context starts a moment late and its clock reads 0 until then. */
  get isReady(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.ctx.currentTime > 0;
  }

  private tried = false;

  /** Nothing more to wait for: the clock runs, or it didn't start in time (or there is no audio) and we go on without. */
  get settled(): boolean {
    return this.isReady || this.tried;
  }

  /** Start the audio clock and wait for it to move, so clicks scheduled right after land on time. Gives up after half a second. */
  async ready(): Promise<void> {
    try {
      this.ctx ??= new AudioContext();
      const deadline = performance.now() + 500;
      while (!this.isReady && performance.now() < deadline) {
        // resume() can stay pending when the browser blocks audio, so never wait on it alone
        await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 100))]);
        if (!this.isReady) await new Promise((r) => setTimeout(r, 15));
      }
    } catch {
      // no audio: the visual count-in still works
    }
    this.tried = true;
  }

  /** Audio clock facts for the debug log. */
  get info() {
    const c = this.ctx;
    return c ? { state: c.state, outputLatency: c.outputLatency ?? null, baseLatency: c.baseLatency ?? null } : { state: 'none' };
  }

  /** Seconds to add to a `performance.now()` time to get the audio-clock time at which it is *heard*. */
  private clockOffset(ctx: AudioContext): number {
    const ts = ctx.getOutputTimestamp?.();
    if (ts?.performanceTime && ts.contextTime !== undefined) return ts.contextTime - ts.performanceTime / 1000;
    return ctx.currentTime - performance.now() / 1000 - (ctx.outputLatency || 0);
  }

  noteOn(note: number): void {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      this.noteOff(note);
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      this.voices.set(note, { osc, gain });
    } catch {
      // no audio available: stay silent
    }
  }

  noteOff(note: number): void {
    const v = this.voices.get(note);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0.0001, t, 0.08);
    v.osc.stop(t + 0.4);
    this.voices.delete(note);
  }

  /**
   * Play a written-out piece: each note starts at an absolute `performance.now()` time and is let go after `durMs`.
   * Scheduled on the audio clock like the metronome clicks. Returns a function that silences everything (also what is sounding).
   */
  scheduleNotes(notes: { atMs: number; durMs: number; midi: number }[]): () => void {
    const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      const ctx = this.ctx;
      const master = ctx.createGain(); // chords add up: keep the sum clear of clipping
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const offsetSec = this.clockOffset(ctx);
      for (const n of notes) {
        const t = n.atMs / 1000 + offsetSec;
        const end = t + Math.max(0.08, n.durMs / 1000 * 0.97);
        if (end < ctx.currentTime) continue;
        const start = Math.max(t, ctx.currentTime);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.28, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.1, start + Math.min(0.5, (end - start) * 0.8));
        gain.gain.setValueAtTime(0.1, Math.max(start + 0.02, end - 0.02));
        gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.12); // a short release instead of a click
        osc.connect(gain).connect(master);
        osc.start(start);
        osc.stop(end + 0.15);
        voices.push({ osc, gain });
      }
    } catch {
      // no audio: the cursor and keys still follow along
    }
    return () => {
      const ctx = this.ctx;
      if (!ctx) return;
      for (const v of voices) {
        try {
          v.gain.gain.cancelScheduledValues(ctx.currentTime);
          v.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
          v.osc.stop(ctx.currentTime + 0.2);
        } catch { /* already stopped */ }
      }
    };
  }

  /**
   * Schedule metronome clicks at absolute `performance.now()` times, on the audio clock
   * (setTimeout is too jittery for a metronome). Returns a function that cancels what hasn't played yet.
   */
  scheduleClicks(clicks: { atMs: number; accent: boolean }[]): () => void {
    const nodes: OscillatorNode[] = [];
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      const ctx = this.ctx;
      const offsetSec = this.clockOffset(ctx);
      for (const c of clicks) {
        const t = c.atMs / 1000 + offsetSec;
        if (t < ctx.currentTime) continue;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = c.accent ? 1500 : 1000;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.06);
        nodes.push(osc);
      }
    } catch {
      // no audio: the visual count-in still works
    }
    return () => {
      for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } }
    };
  }
}
