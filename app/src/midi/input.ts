import { parseMidi, type MidiEvent } from './parse';

type Listener = (event: MidiEvent, source: InputSource) => void;
export type InputSource = 'midi' | 'keyboard' | 'screen';
/** Why the piano cannot be heard: the browser said no, it cannot do MIDI here, or the piano was there and went away. */
export type MidiProblem = 'denied' | 'unavailable' | 'lost';
type StatusListener = (devices: string[], error?: string, problem?: MidiProblem) => void;

/** The system's loopback port (Linux/ALSA): always listed, never a piano, so it must not look like a connection. */
const VIRTUAL_PORT = /midi through/i;

export function splitPorts(names: string[]): { pianos: string[]; virtualOnly: boolean } {
  const pianos = names.filter((n) => !VIRTUAL_PORT.test(n));
  return { pianos, virtualOnly: !pianos.length && names.length > 0 };
}

/**
 * One bus for every way of playing a note: the piano (Web MIDI), the computer
 * keyboard, and clicks on the on-screen keyboard. The practice logic only sees MidiEvents.
 */
export class InputBus {
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  devices: string[] = [];
  midiError: string | undefined;
  problem: MidiProblem | undefined;
  /** Only the system's "Midi Through" port is there: no piano is plugged in or the system cannot see it. */
  virtualOnly = false;
  /** The browser's question (Allow / Block) is open and has not been answered yet. */
  asking = false;
  private hadPiano = false;
  private permission: PermissionStatus | undefined;
  private recovering = false;

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): void {
    this.statusListeners.add(listener);
    listener(this.devices, this.midiError, this.problem);
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
          ? 'No Web MIDI here. Use Chrome or Edge.'
          : 'Web MIDI needs https:// or localhost.',
        'unavailable',
      );
      return;
    }
    await this.watchPermission(); // so a refusal below can say whether Chrome can still ask
    this.recoverWhenBack();
    let access: MIDIAccess;
    this.setAsking(true);
    try {
      access = await navigator.requestMIDIAccess();
    } catch (err) {
      this.setStatus(
        [],
        this.permission?.state === 'denied'
          ? `MIDI is blocked for this site. Site settings, MIDI, Allow.`
          : `MIDI not allowed. Tap Allow MIDI.`,
        'denied',
      );
      return;
    } finally {
      this.setAsking(false);
    }
    const bind = () => {
      try {
        const names: string[] = [];
        access.inputs.forEach((input) => {
          if (input.state === 'disconnected') return; // a port that was there and went away can stay in the list
          input.onmidimessage = (e) => {
            if (!e.data) return;
            const event = parseMidi(e.data);
            if (event) this.emit(event, 'midi');
          };
          names.push(input.name ?? 'MIDI input');
        });
        const { pianos, virtualOnly } = splitPorts(names);
        this.virtualOnly = virtualOnly;
        if (pianos.length) this.hadPiano = true;
        if (pianos.length || !this.hadPiano) this.setStatus(pianos);
        else this.setStatus([], 'MIDI keyboard lost. Plug it in, then Reconnect.', 'lost');
      } catch (err) { // allowed, but the ports could not be read: say that, not "not allowed"
        this.setStatus([], `MIDI error: ${(err as Error).message}. Reconnect.`, 'unavailable');
      }
    };
    bind();
    access.onstatechange = bind; // a piano plugged in or pulled out while the app is open
  }

  /** The browser's MIDI permission can be changed from its site settings at any time: reconnect the moment it is granted. */
  private async watchPermission(): Promise<void> {
    if (this.permission || !navigator.permissions?.query) return;
    try {
      const status = await navigator.permissions.query({ name: 'midi' as PermissionName });
      this.permission = status;
      status.onchange = () => { if (status.state === 'granted') void this.connectMidi(); };
    } catch { /* this browser does not report it: the Reconnect button still works */ }
  }

  /** Coming back to the tab (from the settings page, or after plugging the piano in) tries again, quietly, when MIDI is already allowed. */
  private recoverWhenBack(): void {
    if (this.recovering) return;
    this.recovering = true;
    const retry = () => {
      if (!document.hidden && !this.devices.length && this.permission?.state === 'granted') void this.connectMidi();
    };
    document.addEventListener('visibilitychange', retry);
    window.addEventListener('focus', retry);
  }

  private setAsking(on: boolean): void {
    if (this.asking === on) return;
    this.asking = on;
    for (const l of this.statusListeners) l(this.devices, this.midiError, this.problem);
  }

  private setStatus(devices: string[], error?: string, problem?: MidiProblem): void {
    this.devices = devices;
    this.midiError = error;
    this.problem = problem;
    for (const l of this.statusListeners) l(devices, error, problem);
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
