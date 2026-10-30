import { Sampler } from './sampler';
import { makeBus, play, type Bus, type Playing, type VoiceName } from './voices';

/**
 * The sound of the app: Listen, the metronome clicks and the computer keyboard, so it is playable without the piano.
 * Not used for MIDI input: the piano makes its own sound. The instrument is chosen with `setVoice` (see voices.ts).
 */
export class Synth {
  private ctx: AudioContext | undefined;
  private bus: Bus | undefined;
  private voice: VoiceName = 'piano';
  private sampler = new Sampler();
  private held = new Map<number, Playing>();

  setVoice(voice: VoiceName): void {
    this.voice = voice;
  }

  /** Fetch the recorded piano for these keys (all of it when none are named). Nothing happens for the built-in instruments. */
  async preload(midis?: readonly number[]): Promise<void> {
    try {
      this.ctx ??= new AudioContext();
      await this.sampler.load(this.ctx, midis);
    } catch {
      // no audio: nothing to load for
    }
  }

  /** The recorded piano is not waiting for anything: it is not the chosen sound, or these keys are loaded (or can never be). */
  hasSamples(midis: readonly number[]): boolean {
    return this.voice !== 'grand' || this.sampler.has(midis);
  }

  private busFor(ctx: AudioContext): Bus {
    if (!this.bus) {
      this.bus = makeBus(ctx);
      this.bus.samples = this.sampler;
    }
    return this.bus;
  }

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
      if (this.voice === 'grand' && !this.sampler.has([note])) void this.preload([note]); // this once the built-in piano answers
      this.held.set(note, play(this.ctx, this.busFor(this.ctx), this.voice, note, this.ctx.currentTime, 0.8));
    } catch {
      // no audio available: stay silent
    }
  }

  noteOff(note: number): void {
    const v = this.held.get(note);
    if (!v || !this.ctx) return;
    v.release(this.ctx.currentTime);
    this.held.delete(note);
  }

  /**
   * Play a written-out piece: each note starts at an absolute `performance.now()` time and is let go after `durMs`.
   * Scheduled on the audio clock like the metronome clicks. Returns a function that silences everything (also what is sounding).
   */
  scheduleNotes(notes: { atMs: number; durMs: number; midi: number }[]): () => void {
    const playing: Playing[] = [];
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      const ctx = this.ctx;
      const bus = this.busFor(ctx);
      const offsetSec = this.clockOffset(ctx);
      for (const n of notes) {
        const t = n.atMs / 1000 + offsetSec;
        const end = t + Math.max(0.08, n.durMs / 1000 * 0.97);
        if (end < ctx.currentTime) continue;
        const note = play(ctx, bus, this.voice, n.midi, Math.max(t, ctx.currentTime), 0.7);
        note.release(end);
        playing.push(note);
      }
    } catch {
      // no audio: the cursor and keys still follow along
    }
    return () => {
      for (const p of playing) p.stop();
      this.bus?.dispose(); // the reverb tail as well: stopping must be silent. The next note builds a fresh one.
      this.bus = undefined;
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
