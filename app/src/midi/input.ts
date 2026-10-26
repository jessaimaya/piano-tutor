import { parseMidi, type MidiEvent } from './parse';

type Listener = (event: MidiEvent, source: InputSource) => void;
export type InputSource = 'midi' | 'keyboard' | 'screen';

/**
 * One bus for every way of playing a note: the piano (Web MIDI), the computer
 * keyboard, and clicks on the on-screen keyboard. The practice logic only sees MidiEvents.
 */
export class InputBus {
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(devices: string[], error?: string) => void>();
  devices: string[] = [];
  midiError: string | undefined;

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: (devices: string[], error?: string) => void): void {
    this.statusListeners.add(listener);
    listener(this.devices, this.midiError);
  }

  emit(event: MidiEvent, source: InputSource): void {
    for (const l of this.listeners) l(event, source);
  }

  noteOn(note: number, source: InputSource, velocity = 80): void {
    this.emit({ type: 'noteOn', note, velocity, channel: 1 }, source);
  }

  noteOff(note: number, source: InputSource): void {
    this.emit({ type: 'noteOff', note, channel: 1 }, source);
  }

  async connectMidi(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      this.setStatus(
        [],
        window.isSecureContext
          ? 'Web MIDI is not available in this browser. Use Chrome or Edge.'
          : 'Web MIDI needs a secure page: open the app from https:// or http://localhost, not a network address.',
      );
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      const bind = () => {
        const names: string[] = [];
        access.inputs.forEach((input) => {
          input.onmidimessage = (e) => {
            if (!e.data) return;
            const event = parseMidi(e.data);
            if (event) this.emit(event, 'midi');
          };
          names.push(input.name ?? 'MIDI input');
        });
        this.setStatus(names);
      };
      bind();
      access.onstatechange = bind;
    } catch (err) {
      this.setStatus([], `MIDI access denied: ${(err as Error).message}`);
    }
  }

  private setStatus(devices: string[], error?: string): void {
    this.devices = devices;
    this.midiError = error;
    for (const l of this.statusListeners) l(devices, error);
  }
}

/**
 * Computer-keyboard fallback, by physical key so it works on any layout.
 * Home row + row above = C4 upwards (right hand); bottom row Z–M = C3–B3 (left hand),
 * and holding Shift drops the bottom row one more octave (C2–B2).
 */
const UPPER: Record<string, number> = {
  KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68,
  KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72, KeyO: 73, KeyL: 74, KeyP: 75, Semicolon: 76,
};
const LOWER: Record<string, number> = {
  KeyZ: 48, KeyX: 50, KeyC: 52, KeyV: 53, KeyB: 55, KeyN: 57, KeyM: 59,
};

export function keyToNote(code: string, shift: boolean): number | undefined {
  const upper = UPPER[code];
  if (upper !== undefined) return upper;
  const lower = LOWER[code];
  return lower === undefined ? undefined : lower - (shift ? 12 : 0);
}

export function bindComputerKeyboard(bus: InputBus): void {
  const down = new Map<string, number>(); // physical key → the note it started
  const isTyping = (e: KeyboardEvent) =>
    e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    const note = keyToNote(e.code, e.shiftKey);
    if (note === undefined) return;
    down.set(e.code, note);
    bus.noteOn(note, 'keyboard');
  });
  window.addEventListener('keyup', (e) => {
    const note = down.get(e.code);
    if (note === undefined) return;
    down.delete(e.code);
    bus.noteOff(note, 'keyboard');
  });
}
