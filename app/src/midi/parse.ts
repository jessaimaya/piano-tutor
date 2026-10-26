/**
 * Pure MIDI message parsing. No browser APIs, so it can be unit-tested.
 *
 * Normalises the quirks of the Yamaha P-115 (see ../../../07-setup-p115.md):
 *  - note-off arrives as note-on with velocity 0
 *  - Active Sensing (0xFE) and Clock (0xF8) are sent constantly and are dropped
 */

export type MidiEvent =
  | { type: 'noteOn'; note: number; velocity: number; channel: number }
  | { type: 'noteOff'; note: number; channel: number }
  | { type: 'sustain'; value: number; down: boolean; channel: number }
  | { type: 'control'; controller: number; value: number; channel: number };

const SUSTAIN_CC = 64;

export function parseMidi(data: ArrayLike<number>): MidiEvent | null {
  const status = data[0];
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;
  if (status === undefined || status >= 0xf0) return null; // system / realtime messages
  const type = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  switch (type) {
    case 0x90:
      return d2 > 0
        ? { type: 'noteOn', note: d1, velocity: d2, channel }
        : { type: 'noteOff', note: d1, channel };
    case 0x80:
      return { type: 'noteOff', note: d1, channel };
    case 0xb0:
      return d1 === SUSTAIN_CC
        ? { type: 'sustain', value: d2, down: d2 >= 64, channel }
        : { type: 'control', controller: d1, value: d2, channel };
    default:
      return null; // pitch bend, program change, aftertouch: not needed
  }
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteName(note: number): string {
  return `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

export function isBlackKey(note: number): boolean {
  return [1, 3, 6, 8, 10].includes(note % 12);
}
