import type { Picked } from './sampler';

/**
 * The instruments behind Listen and the computer keyboard, made from oscillators (no sample files, so it works offline).
 * A piano note is a few overtones that each die away at their own speed (the high ones first), a short hammer thump and two strings
 * slightly out of tune; everything goes through a gentle room reverb and a limiter so chords stay clear.
 * `grand` is the recorded piano (see sampler.ts); a key whose sample is not loaded yet is played by the built-in piano instead.
 */
export type VoiceName = 'grand' | 'piano' | 'soft' | 'bells';

export const VOICES: { id: VoiceName; label: string }[] = [
  { id: 'grand', label: 'Grand' },
  { id: 'piano', label: 'Piano' },
  { id: 'soft', label: 'Soft' },
  { id: 'bells', label: 'Bells' },
];

export const isVoice = (v: unknown): v is VoiceName => VOICES.some((x) => x.id === v);

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** How long a piano note's fundamental rings, as a decay time constant in seconds: low strings ring on, high ones die quickly. */
export const pianoDecay = (midi: number): number => Math.min(5, Math.max(0.5, 3.2 * 2 ** (-(midi - 48) / 20)));

/** The overtones of a piano note: the multiple of the pitch, its loudness and its decay time constant, for a note of this loudness (0–1). */
export function pianoPartials(midi: number, velocity: number): { k: number; amp: number; tau: number }[] {
  const base = pianoDecay(midi);
  const bright = 0.4 + 0.6 * velocity; // played harder, the overtones are louder
  return [1, 2, 3, 4, 5, 6, 8].map((k) => ({ k, amp: k === 1 ? 1 : (0.7 / k ** 0.85) * bright, tau: base / (1 + 0.9 * (k - 1)) }));
}

/** What a sounding note lets you do: let it go at an audio-clock time (quickly when it has to stop now). */
export interface Playing {
  release(at: number, fast?: boolean): void;
  /** Silence it now, whether it is sounding or still waiting for its turn (which `release` cannot do: it acts no earlier than the start). */
  stop(): void;
}

export interface Bus {
  input: AudioNode;
  noise: AudioBuffer;
  /** Where the recorded piano's samples come from; set by the owner of the bus. */
  samples?: { pick(midi: number): Picked | undefined };
  /** Fade everything out and cut the reverb tail too (a convolver rings on by itself after its input goes quiet). */
  dispose(): void;
}

/** Room reverb from a decaying burst of noise. */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

/** The place every voice plays into: dry and a little reverb, then a limiter before the speakers. */
export function makeBus(ctx: BaseAudioContext): Bus {
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 1.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  input.connect(dry).connect(comp);
  input.connect(verb).connect(wet).connect(comp);
  const master = ctx.createGain(); // headroom: a loud chord must not clip at the speakers
  master.gain.value = 0.7;
  comp.connect(master).connect(ctx.destination);
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return {
    input,
    noise,
    dispose(): void {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      setTimeout(() => { try { master.disconnect(); } catch { /* already gone */ } }, 120);
    },
  };
}

/** One note of a voice, starting at audio-clock time `at`. It dies away by itself; `release` lets it go sooner. */
export function play(ctx: BaseAudioContext, bus: Bus, voice: VoiceName, midi: number, at: number, velocity = 0.8): Playing {
  const out = ctx.createGain(); // the one place a release acts on
  out.connect(bus.input);
  const sources: AudioScheduledSourceNode[] = [];
  let natural = 1;

  const osc = (type: OscillatorType, hz: number): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    sources.push(o);
    return o;
  };
  /** A sine that comes in fast and dies away exponentially. */
  const ring = (hz: number, peak: number, tau: number, to: AudioNode = out): void => {
    if (hz > 14000) return;
    const o = osc('sine', hz);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.004);
    g.gain.setTargetAtTime(0, at + 0.004, tau);
    o.connect(g).connect(to);
    o.start(at);
    natural = Math.max(natural, tau * 6);
  };

  const f = freq(midi);
  let kind = voice;
  const sample = voice === 'grand' ? bus.samples?.pick(midi) : undefined;
  if (voice === 'grand' && !sample) kind = 'piano'; // not loaded (yet): the built-in piano stands in
  if (sample) {
    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.value = sample.rate;
    const g = ctx.createGain();
    g.gain.value = sample.gain * (velocity / 0.8); // 0.8 is the usual touch
    src.connect(g).connect(out);
    src.start(at, sample.onset);
    sources.push(src);
    natural = sample.buffer.duration / sample.rate;
  } else if (kind === 'piano') {
    const B = 0.0002; // strings are slightly stiff: the overtones sit a little sharp
    for (const p of pianoPartials(midi, velocity)) {
      const hz = f * p.k * Math.sqrt(1 + B * p.k * p.k);
      ring(hz, 0.22 * p.amp * velocity, p.tau);
      if (p.k <= 2) ring(hz * 1.0007, 0.12 * p.amp * velocity, p.tau * 1.05); // the second string, a hair out of tune: a slow shimmer
    }
    const thump = ctx.createBufferSource(); // the hammer
    thump.buffer = bus.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = Math.min(6000, f * 2.5);
    band.Q.value = 0.8;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, at);
    tg.gain.linearRampToValueAtTime(0.09 * velocity, at + 0.002);
    tg.gain.setTargetAtTime(0, at + 0.002, 0.012);
    thump.connect(band).connect(tg).connect(out);
    thump.start(at);
    sources.push(thump);
  } else if (kind === 'soft') {
    // an electric piano: a sine bent by a second sine whose push fades, so the note starts bright and mellows
    const tau = Math.max(0.5, pianoDecay(midi) * 0.55);
    const carrier = osc('sine', f);
    const mod = osc('sine', f);
    const push = ctx.createGain();
    push.gain.setValueAtTime(f * 2.4 * velocity, at);
    push.gain.setTargetAtTime(f * 0.15, at, 0.3);
    mod.connect(push).connect(carrier.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.4 * velocity, at + 0.004); // a little louder than the others: it is a thinner sound
    g.gain.setTargetAtTime(0, at + 0.004, tau);
    carrier.connect(g).connect(out);
    carrier.start(at);
    mod.start(at);
    natural = Math.max(natural, tau * 6);
    ring(f * 4, 0.05 * velocity, 0.18); // the tine
  } else {
    // bells: overtones that are not whole multiples, which is what makes a bell a bell
    const base = Math.min(2.2, Math.max(0.4, 1.4 * 2 ** (-(midi - 72) / 36)));
    [[1, 0.3, 1], [2.76, 0.13, 0.45], [5.4, 0.06, 0.22], [8.9, 0.03, 0.12]].forEach(([k, a, t]) => ring(f * k!, a! * velocity, base * t!));
  }

  const stopAt = at + Math.min(14, natural + 0.1);
  for (const s of sources) s.stop(stopAt);

  return {
    stop(): void {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.0001, t, 0.01);
      for (const s of sources) {
        try { s.stop(t + 0.06); } catch { /* already stopped */ }
      }
    },
    release(when: number, fast = false): void {
      const t = Math.max(when, at);
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.0001, t, fast ? 0.015 : 0.09);
      for (const s of sources) {
        try { s.stop(t + (fast ? 0.12 : 0.7)); } catch { /* already stopped */ }
      }
    },
  };
}
