import { OpenSheetMusicDisplay, type GraphicalMeasure } from 'opensheetmusicdisplay';
import type { MeasuredCursor } from '../practice/range';
import type { CursorNote } from '../practice/session';
import { clefFor, isSharp, ledgerSteps, staffStep } from './staff-position';

/** OSMD lays out in units of one staff space; at zoom 1 that is 10 px. */
const UNIT_PX = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';
const WRONG_NOTE_MS = 3500;
const RIGHT_NOTE_MS = 1800;

/** Where a coloured note goes: the measure's staves and the cursor's x, in OSMD units. */
export interface NoteAnchor {
  staves: GraphicalMeasure[];
  x: number;
}

/** OSMD stores pitches with C4 = 48; MIDI has C4 = 60. */
const OSMD_TO_MIDI = 12;

export class ScoreView implements MeasuredCursor {
  private osmd: OpenSheetMusicDisplay;
  private loaded = false;
  private pos = 0; // how many times the cursor has been advanced since the start

  constructor(private container: HTMLElement) {
    this.osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      autoBeam: true,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: '#2f6fde', alpha: 0.35, follow: true }],
    });
  }

  async load(xml: string): Promise<void> {
    this.loaded = false;
    this.clearMarks();
    await this.osmd.load(xml);
    this.osmd.render();
    this.osmd.cursor.show();
    this.loaded = true;
    this.reset();
  }

  reset(): void {
    this.pos = 0;
    this.clearMarks();
    if (!this.loaded) return;
    this.osmd.cursor.reset();
  }

  /** Onset of the current step, in quarter-note beats from the start (OSMD counts in whole notes). */
  beat(): number {
    return this.osmd.cursor.iterator.currentTimeStamp.RealValue * 4;
  }

  /** 0-based index of the bar under the cursor. */
  measure(): number {
    return this.osmd.cursor.iterator.CurrentMeasureIndex;
  }

  /** Bars in the loaded piece. */
  get measureCount(): number {
    return this.loaded ? this.osmd.Sheet.SourceMeasures.length : 0;
  }

  /** Move the cursor to a step by its position from the start (used by tempo mode to follow the clock). */
  moveTo(rawIndex: number): void {
    if (!this.loaded) return;
    if (rawIndex < this.pos) this.reset();
    while (this.pos < rawIndex && !this.done) this.next();
  }

  get done(): boolean {
    return !this.loaded || this.osmd.cursor.iterator.EndReached;
  }

  next(): void {
    this.pos++;
    this.osmd.cursor.next();
  }

  notes(): CursorNote[] {
    if (!this.loaded || this.done) return [];
    const out: CursorNote[] = [];
    for (const note of this.osmd.cursor.NotesUnderCursor()) {
      if (note.isRest()) continue;
      // The second half of a tie is held, not played again.
      if (note.NoteTie && note.NoteTie.StartNote !== note) continue;
      // Length in quarter notes (OSMD counts whole notes); the first note of a tie sounds for the whole tie.
      const tied = note.NoteTie?.Notes ?? [note];
      const beats = tied.reduce((sum, n) => sum + n.Length.RealValue, 0) * 4;
      out.push({ midi: note.halfTone + OSMD_TO_MIDI, staff: note.ParentStaff.idInMusicSheet, beats });
    }
    return out;
  }

  /** Where the cursor is on the page, taken before a key press can move it. */
  anchor(): NoteAnchor | undefined {
    if (!this.loaded || this.done) return undefined;
    const staves = this.osmd.GraphicSheet.MeasureList[this.osmd.cursor.iterator.CurrentMeasureIndex];
    const gnote = this.osmd.cursor.GNotesUnderCursor()[0];
    if (!staves?.length || !gnote) return undefined;
    return { staves, x: gnote.PositionAndShape.AbsolutePosition.x };
  }

  /** The key you pressed as a red note on the staff at the cursor, so you can see how far off you were. */
  showWrong(midi: number, at = this.anchor()): void {
    this.showNote(midi, 'wrong', at);
  }

  /** The key you pressed as a green note on the staff, when it was the right one. */
  showRight(midi: number, at = this.anchor()): void {
    this.showNote(midi, 'right', at);
  }

  /** Sits where the cursor was, stays put when the cursor moves on, and fades after a few seconds. */
  private showNote(midi: number, kind: 'wrong' | 'right', at: NoteAnchor | undefined): void {
    const svg = this.container.querySelector('svg');
    if (!svg || !at) return;
    const clef = at.staves.length > 1 ? clefFor(midi) : 'treble';
    const staff = at.staves[clef === 'treble' ? 0 : 1] ?? at.staves[0]!;
    const u = UNIT_PX * this.osmd.zoom;
    const top = staff.ParentStaffLine.PositionAndShape.AbsolutePosition.y;
    const step = staffStep(midi, clef);
    const cx = at.x * u;
    const cy = (top + step / 2) * u;

    const key = `${kind}${midi}@${Math.round(cx)}`;
    svg.querySelector(`[data-mark="${key}"]`)?.remove(); // pressing the same key again restarts it
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `mark-note ${kind}-note`);
    g.dataset.mark = key;
    const add = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      g.append(el);
      return el;
    };
    for (const ls of ledgerSteps(step)) {
      const y = (top + ls / 2) * u;
      add('line', { x1: cx - 1.25 * u, x2: cx + 1.25 * u, y1: y, y2: y, class: 'mark-ledger', 'stroke-width': 0.12 * u });
    }
    add('ellipse', { cx, cy, rx: 0.68 * u, ry: 0.5 * u, transform: `rotate(-20 ${cx} ${cy})`, class: 'mark-head' });
    if (isSharp(midi)) {
      const t = add('text', { x: cx - 1.9 * u, y: cy + 0.55 * u, class: 'mark-sharp', 'font-size': 1.9 * u });
      t.textContent = '♯';
    }
    svg.append(g);
    setTimeout(() => g.remove(), kind === 'wrong' ? WRONG_NOTE_MS : RIGHT_NOTE_MS);
  }

  /** Remove the red notes (the cursor moved on: the mistake is behind you). */
  clearWrong(): void {
    this.container.querySelectorAll('.wrong-note').forEach((el) => el.remove());
  }

  /** Remove every coloured note (a restart, a new piece). */
  clearMarks(): void {
    this.container.querySelectorAll('.mark-note').forEach((el) => el.remove());
  }
}
