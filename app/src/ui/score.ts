import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { MeasuredCursor } from '../practice/range';
import type { CursorNote } from '../practice/session';

/** OSMD stores pitches with C4 = 48; MIDI has C4 = 60. */
const OSMD_TO_MIDI = 12;

export class ScoreView implements MeasuredCursor {
  private osmd: OpenSheetMusicDisplay;
  private loaded = false;
  private pos = 0; // how many times the cursor has been advanced since the start

  constructor(container: HTMLElement) {
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
    await this.osmd.load(xml);
    this.osmd.render();
    this.osmd.cursor.show();
    this.loaded = true;
    this.reset();
  }

  reset(): void {
    this.pos = 0;
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
}
