import { ClefEnum, OpenSheetMusicDisplay, type GraphicalMeasure, type TechnicalInstruction, type VoiceEntry } from 'opensheetmusicdisplay';
import type { BarRange, MeasuredCursor } from '../practice/range';
import type { CursorNote } from '../practice/session';
import type { Spot } from './playhead';
import { DEFAULT_ZOOM } from './view';
import { clefFor, isSharp, ledgerSteps, staffStep, type Clef } from './staff-position';

/** OSMD lays out in units of one staff space; at zoom 1 that is 10 px. */
const UNIT_PX = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';
const WRONG_NOTE_MS = 3500;
const RIGHT_NOTE_MS = 1800;
/** Smallest staff the minimal view shrinks to when two systems would not fit the window otherwise (staff space = 10 px x zoom). */
const MIN_FIT_ZOOM = 0.4;
/** Systems the minimal view tries to show at once: the one you are reading and the one after it, so the next notes are never a surprise. */
const ROWS_IN_VIEW = 2;
/** Breathing room kept around the systems in the window, in px. */
const FIT_SLACK_PX = 3;
const RESIZE_DEBOUNCE_MS = 200;
/** Equal-width bars take the width of the busiest one: the staff may shrink this far, in these steps, to keep two of them on a line. */
const MIN_EVEN_ZOOM = 0.7;
const EVEN_ZOOM_STEP = 0.1;

/** Where a coloured note goes: the measure's staves and the cursor's x, in OSMD units. */
export interface NoteAnchor {
  staves: GraphicalMeasure[];
  x: number;
  /** The notes due at this spot and the staff each one is written on (0 = top). */
  due: { midi: number; staff: number }[];
}

/** Which finger numbers are drawn: the ones that set the hand down at the start, all of them, or none. */
export type FingerMode = 'start' | 'all' | 'off';

/** OSMD stores pitches with C4 = 48; MIDI has C4 = 60. */
const OSMD_TO_MIDI = 12;

/**
 * Draw the triplet bracket and its 3 under the staff, as printed scores often do. Above the staff they share the space with the finger
 * numbers, and a 3 between fingers gets read as "finger 3". A tuplet that says where it goes keeps its own place.
 */
export function tripletsBelow(xml: string): string {
  return xml.replace(/<tuplet\b([^>]*)>/g, (all, attrs: string) => (/type="start"/.test(attrs) && !/placement=/.test(attrs) ? `<tuplet${attrs.replace(/\s*\/$/, '')} placement="below"${/\/\s*$/.test(attrs) ? '/' : ''}>` : all));
}

const isFingering = (t: TechnicalInstruction): boolean => t.type === 0; // TechnicalInstructionType.Fingering

export class ScoreView implements MeasuredCursor {
  private osmd: OpenSheetMusicDisplay;
  private loaded = false;
  private pos = 0; // how many times the cursor has been advanced since the start
  private paged = false;
  /** The staff size a piece is drawn at unless `load` is given another (1 in the full view, the chosen size in the minimal one). */
  private baseZoom = 1;
  /** The note cards are drawn at a size of their own and are not fitted to the window. */
  private fixedZoom = false;
  private seen = { w: 0, h: 0 };
  /** Which hand is being asked for: the other staff's notes are drawn faded. */
  private activeHands: 'rh' | 'lh' | 'both' = 'both';
  /** Only these bars are drawn; the whole piece when undefined. */
  private drawnBars: BarRange | undefined;
  private fingers: FingerMode = 'start';
  /** Every voice entry that has finger numbers, with its full list: OSMD draws what is in the entry, so showing less means editing the entry. */
  private fingered: { entry: VoiceEntry; all: TechnicalInstruction[] }[] = [];
  /** Draw every bar the same width where there is room for it, so the moving line keeps an even speed. */
  private evenBars = false;
  /** What `evenZoom` found for this piece, by window width and wanted size. */
  private evenZooms = new Map<string, number>();
  /** The tied notes the cursor has gone over since `clearHeld`: they sound on, so they are not asked for again. */
  heldTies: CursorNote[] = [];
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Called after the score is drawn again (the window changed): where things sit on the page is different now. */
  onRelayout: (() => void) | undefined;

  constructor(private container: HTMLElement) {
    this.osmd = new OpenSheetMusicDisplay(container, {
      autoResize: false, // see `relayout`: the window size decides the staff size in the minimal view, so the layout is ours to redo

      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      autoBeam: true,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: '#2f6fde', alpha: 0.35, follow: true }],
    });
    this.seen = { w: container.clientWidth, h: container.clientHeight };
    new ResizeObserver(() => this.resized()).observe(container);
  }

  /** `zoom` overrides the staff size for this score only (the note cards are drawn big). */
  async load(xml: string, zoom?: number): Promise<void> {
    this.loaded = false;
    this.fixedZoom = zoom !== undefined;
    this.osmd.zoom = zoom ?? this.baseZoom;
    this.clearMarks();
    this.setPlayhead(undefined);
    this.drawnBars = undefined;
    this.evenZooms.clear();
    this.applyDrawnBars();
    await this.osmd.load(tripletsBelow(xml));
    this.readFingers();
    this.draw();
    this.osmd.cursor.show();
    this.loaded = true;
    this.reset();
  }

  /**
   * Minimal view (e-ink): the score is a fixed window, not a scrolling page. The cursor never scrolls the page smoothly; the page
   * is turned once, when the cursor reaches the last system that fits (see `page`). Zoom is the staff size, 1 = 10 px per staff space.
   */
  setMinimal(on: boolean, zoom: number): void {
    this.paged = on;
    const cursor = this.osmd.cursorsOptions[0];
    if (cursor) Object.assign(cursor, on ? { color: '#000000', alpha: 0.45, follow: false } : { color: '#2f6fde', alpha: 0.35, follow: true });
    this.osmd.FollowCursor = !on;
    this.osmd.setOptions({ drawTitle: !on, drawComposer: !on });
    this.baseZoom = on ? zoom : 1;
    this.osmd.zoom = this.baseZoom;
    this.container.scrollTop = 0;
    if (!this.loaded) return;
    this.relayout();
  }

  /**
   * Fade the notes of the hand that is not being asked for, so a score with two staves never looks like it wants both hands (a warm-up
   * for the right hand shows the left hand's staff too, in light grey). Redone after every drawing.
   */
  setActiveHands(hands: 'rh' | 'lh' | 'both'): void {
    this.activeHands = hands;
    this.fade();
  }

  private fade(): void {
    if (!this.loaded) return;
    const faded = this.activeHands === 'rh' ? 1 : this.activeHands === 'lh' ? 0 : -1;
    for (const staves of this.osmd.GraphicSheet.MeasureList) {
      staves.forEach((measure, staff) => {
        for (const entry of measure.staffEntries) {
          for (const voice of entry.graphicalVoiceEntries) {
            for (const note of voice.notes) {
              const el = (note as unknown as { getSVGGElement?: () => SVGGElement | undefined }).getSVGGElement?.();
              const tied = note.sourceNote.NoteTie && note.sourceNote.NoteTie.StartNote !== note.sourceNote; // held, not played: not asked for
              if (el) el.style.opacity = staff === faded && staves.length > 1 ? '0.25' : tied ? '0.4' : '';
            }
          }
        }
      });
    }
  }

  /**
   * Draw only these bars (1-based, inclusive), so the first one to play opens the first line and nothing you are not practising is on the
   * page; `undefined` draws the whole piece. The cursor stays inside them too: OSMD starts and ends its walk at the drawn bars.
   */
  setDrawnBars(range: BarRange | undefined): void {
    if (this.drawnBars?.from === range?.from && this.drawnBars?.to === range?.to) return;
    this.drawnBars = range;
    this.applyDrawnBars();
    if (!this.loaded) return;
    this.relayout();
    this.reset();
  }

  private applyDrawnBars(): void {
    const rules = this.osmd.EngravingRules;
    rules.MinMeasureToDrawIndex = this.drawnBars ? this.drawnBars.from - 1 : 0;
    rules.MaxMeasureToDrawIndex = this.drawnBars ? this.drawnBars.to - 1 : Number.MAX_VALUE;
  }

  /**
   * Finger numbers make it easy to play numbers instead of reading notes. By default only the first ones show: the fingers that set each
   * hand down, so the rest of the piece has to be read.
   */
  setFingers(mode: FingerMode): void {
    if (mode === this.fingers) return;
    this.fingers = mode;
    if (this.loaded) this.relayout();
  }

  private readFingers(): void {
    this.fingered = [];
    for (const measure of this.osmd.Sheet.SourceMeasures) {
      for (const container of measure.VerticalSourceStaffEntryContainers) {
        for (const staffEntry of container.StaffEntries) {
          for (const entry of staffEntry?.VoiceEntries ?? []) {
            if (entry.TechnicalInstructions.some(isFingering)) this.fingered.push({ entry, all: [...entry.TechnicalInstructions] });
          }
        }
      }
    }
  }

  /** Leave in each entry the finger numbers wanted. In `start` that is, for each staff, the first notes that have any in the bars drawn. */
  private applyFingers(): void {
    const shown = new Set<VoiceEntry>();
    const has = new Set(this.fingered.map((f) => f.entry)); // from the full lists: an earlier drawing may have left some entries bare
    if (this.fingers === 'start') {
      const staves = this.osmd.Sheet.Staves.length;
      const done = new Set<number>();
      const measures = this.osmd.Sheet.SourceMeasures;
      for (let m = this.drawnBars ? this.drawnBars.from - 1 : 0; m < measures.length && done.size < staves; m++) {
        for (const container of measures[m]!.VerticalSourceStaffEntryContainers) {
          container.StaffEntries.forEach((staffEntry, staff) => {
            if (!staffEntry || done.has(staff)) return;
            const withFingers = staffEntry.VoiceEntries.filter((e) => has.has(e));
            if (!withFingers.length) return;
            done.add(staff);
            withFingers.forEach((e) => shown.add(e));
          });
        }
      }
    }
    for (const { entry, all } of this.fingered) {
      const keep = all.filter((t) => !isFingering(t) || this.fingers === 'all' || shown.has(entry));
      entry.TechnicalInstructions.splice(0, entry.TechnicalInstructions.length, ...keep);
    }
  }

  /** Takes effect the next time a score is drawn. */
  setEvenBars(on: boolean): void {
    this.evenBars = on;
  }

  /** Draw the loaded piece at the staff size set in `osmd.zoom`. In the minimal view that is the biggest wanted; it shrinks until the window shows two systems. */
  private draw(): void {
    this.osmd.EngravingRules.FixedMeasureWidth = this.evenBars;
    this.applyFingers();
    const zoom = this.evenZoom(this.osmd.zoom);
    this.osmd.zoom = zoom;
    if (this.paged && !this.fixedZoom) this.fit(zoom);
    else this.osmd.render();
    this.fade();
  }

  /**
   * The staff size at which two equal-width bars fit on a line, or `wanted` when even the smallest allowed will not (a very narrow window
   * then reads one bar a line) or when the player asked for a bigger staff than usual. Each try is a full drawing, so the answer is kept for this window.
   */
  private evenZoom(wanted: number): number {
    const bars = this.drawnBars ? this.drawnBars.to - this.drawnBars.from + 1 : this.osmd.Sheet.SourceMeasures.length;
    if (!this.evenBars || this.fixedZoom || wanted > DEFAULT_ZOOM || bars < 2) return wanted;
    const key = `${this.inner().w}:${wanted}`;
    const known = this.evenZooms.get(key);
    if (known !== undefined) return known;
    let found = wanted;
    for (let zoom = wanted; zoom >= MIN_EVEN_ZOOM - 1e-6; zoom -= EVEN_ZOOM_STEP) {
      this.osmd.zoom = zoom;
      this.osmd.render();
      if ((this.osmd.GraphicSheet.MusicPages[0]?.MusicSystems[0]?.GraphicalMeasures.length ?? 0) >= 2) { found = zoom; break; }
    }
    this.evenZooms.set(key, found);
    return found;
  }

  /** Draw again for the window as it is now (turned sideways, a toolbar gone) and put the cursor and the page back. */
  private relayout(): void {
    this.container.scrollTop = 0;
    this.osmd.zoom = this.fixedZoom ? this.osmd.zoom : this.baseZoom;
    this.draw();
    this.osmd.cursor.update();
    this.page();
    this.onRelayout?.();
  }

  /** Draw again now if the window has changed since the last drawing, instead of after the debounce. */
  refit(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === this.seen.w && (!this.paged || h === this.seen.h)) return;
    clearTimeout(this.resizeTimer);
    this.seen = { w, h };
    if (this.loaded && w) this.relayout();
  }

  private resized(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    // The full view's height follows its content, so only the width counts there (otherwise a redraw would trigger the next one).
    const changed = w !== this.seen.w || (this.paged && h !== this.seen.h);
    this.seen = { w, h };
    if (!changed || !this.loaded || !w) return;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.relayout(), RESIZE_DEBOUNCE_MS);
  }

  /** Content box of the score window in px: what is left inside its padding. */
  private inner(): { w: number; h: number } {
    const cs = getComputedStyle(this.container);
    const pad = (a: string, b: string) => parseFloat(cs.getPropertyValue(a)) + parseFloat(cs.getPropertyValue(b));
    return {
      w: this.container.clientWidth - pad('padding-left', 'padding-right'),
      h: this.container.clientHeight - pad('padding-top', 'padding-bottom'),
    };
  }

  /** Top and bottom of each system in px, from the top of the drawing. Staff lines, clefs and the notes above and below are inside. */
  private systems(): { top: number; bottom: number }[] {
    const u = UNIT_PX * this.osmd.zoom;
    const page = this.osmd.GraphicSheet?.MusicPages[0];
    return (page?.MusicSystems ?? []).map((sys) => {
      const box = sys.PositionAndShape;
      return { top: (box.AbsolutePosition.y + box.BorderTop) * u, bottom: (box.AbsolutePosition.y + box.BorderBottom) * u };
    });
  }

  /**
   * Render at the biggest staff (from `start`) that still shows the first two systems in the window, with no bar running past the right
   * edge. Each pass scales by how much too big the drawing was; a smaller staff also fits more bars on a line, so the systems change
   * and the next pass measures again.
   */
  private fit(start: number): void {
    let zoom = start;
    for (let pass = 0; ; pass++) {
      this.osmd.zoom = zoom;
      this.osmd.render();
      const room = this.inner();
      const rows = this.systems().slice(0, ROWS_IN_VIEW);
      const need = rows.length ? rows[rows.length - 1]!.bottom - rows[0]!.top : 0;
      const wide = this.container.querySelector('svg')?.getBoundingClientRect().width ?? 0;
      const k = Math.min(need > room.h ? (room.h - FIT_SLACK_PX) / need : 1, wide > room.w ? room.w / wide : 1);
      if (k >= 1 || zoom <= MIN_FIT_ZOOM || pass >= 4) return;
      zoom = Math.max(MIN_FIT_ZOOM, zoom * k);
    }
  }

  /** Change the staff size in the minimal view and keep the cursor on the page. */
  setZoom(zoom: number): void {
    if (!this.paged) return;
    this.setMinimal(true, zoom);
  }

  /**
   * Turn the page so that a system is never cut: the window always starts at the top of a system. It turns when the system after
   * the one under the cursor would not be fully in view, and then the cursor's system goes to the top, so the next one shows below it.
   * One turn per page (e-ink redraws the whole screen), and it comes while you are still reading the last system of the page.
   */
  private page(): void {
    if (!this.paged || !this.loaded) return;
    const systems = this.systems();
    const here = this.osmd.GraphicSheet.MeasureList[this.osmd.cursor.iterator.CurrentMeasureIndex]?.[0]?.ParentStaffLine.ParentMusicSystem;
    const i = here ? this.osmd.GraphicSheet.MusicPages[0]!.MusicSystems.indexOf(here) : -1;
    const cur = systems[i];
    if (!cur) return;
    const ahead = systems[Math.min(i + 1, systems.length - 1)]!;
    const svgTop = (this.container.querySelector('svg')?.getBoundingClientRect().top ?? 0) - this.container.getBoundingClientRect().top + this.container.scrollTop;
    const view = this.container.scrollTop;
    const fits = cur.top + svgTop >= view - 1 && ahead.bottom + svgTop <= view + this.container.clientHeight + 1;
    if (fits) return;
    this.container.scrollTop = Math.max(0, cur.top + svgTop - FIT_SLACK_PX);
  }

  reset(): void {
    this.pos = 0;
    this.heldTies = [];
    this.clearMarks();
    if (!this.loaded) return;
    this.osmd.cursor.reset();
    this.page();
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
    this.page();
    if (this.done) return;
    this.heldTies.push(...this.tiedHere());
  }

  clearHeld(): void {
    this.heldTies = [];
  }

  /** The notes at the cursor that are the second half of a tie: still sounding, so nothing to press. */
  private tiedHere(): CursorNote[] {
    return this.osmd.cursor.NotesUnderCursor()
      .filter((n) => !n.isRest() && n.NoteTie && n.NoteTie.StartNote !== n)
      .map((n) => ({ midi: n.halfTone + OSMD_TO_MIDI, staff: n.ParentStaff.idInMusicSheet }));
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
    const due = this.osmd.cursor.NotesUnderCursor().filter((n) => !n.isRest())
      .map((n) => ({ midi: n.halfTone + OSMD_TO_MIDI, staff: n.ParentStaff.idInMusicSheet }));
    return { staves, x: gnote.PositionAndShape.AbsolutePosition.x, due };
  }

  /**
   * Where the moving line goes for the step under the cursor: on the noteheads as drawn, since that is what the eye holds it against. OSMD's cursor
   * bar can sit 6 px off them (after a rest in the other voice), so it only gives the x of a step with no notes, and the height of the system.
   * In the drawing's own units, like everything else here.
   */
  spot(beat: number): Spot | undefined {
    const at = this.anchor();
    const bar = this.osmd.cursor.cursorElement as HTMLElement | undefined;
    const svg = this.container.querySelector('svg');
    if (!at || !bar || !svg) return undefined;
    const b = bar.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (!b.width || !s.width || !vb.width) return undefined;
    const k = (s.width / vb.width) * UNIT_PX; // screen px per OSMD unit
    const x = this.noteheadCentre() ?? b.left + b.width / 2;
    return { beat, x: (x - s.left) / k, left: at.staves[0]!.PositionAndShape.AbsolutePosition.x, y0: (b.top - s.top) / k, y1: (b.bottom - s.top) / k };
  }

  /** Screen x of the noteheads under the cursor: the middle one, so a head pushed aside in a chord does not pull the line off the others. */
  private noteheadCentre(): number | undefined {
    const xs: number[] = [];
    for (const note of this.osmd.cursor.GNotesUnderCursor()) {
      if (note.sourceNote.isRest()) continue;
      const el = (note as unknown as { getSVGGElement?: () => SVGGElement | undefined }).getSVGGElement?.();
      for (const head of el?.querySelectorAll('.vf-notehead') ?? []) {
        const r = head.getBoundingClientRect();
        if (r.width) xs.push(r.left + r.width / 2);
      }
    }
    return xs.sort((a, b) => a - b)[xs.length >> 1];
  }

  /** The cursor bar is kept moving (the line reads its place) but not drawn while the line shows the time. */
  showCursor(on: boolean): void {
    this.container.classList.toggle('cursor-quiet', !on);
  }

  /** Draw (or move) the line that crosses the staves at the tempo; `undefined` takes it away. */
  setPlayhead(spot: Spot | undefined): void {
    const svg = this.container.querySelector('svg');
    let line = svg?.querySelector<SVGLineElement>('.playhead') ?? null;
    if (!svg || !spot) { line?.remove(); return; }
    const u = UNIT_PX; // the drawing's own units: the zoom is the size the svg is shown at, not part of its coordinates
    if (!line) {
      line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'playhead');
      svg.append(line);
    }
    const key = `${spot.x}|${spot.y0}|${spot.y1}`;
    if (line.dataset.at === key) return; // same place as the last frame: leave the drawing alone
    line.dataset.at = key;
    line.setAttribute('x1', String(spot.x * u));
    line.setAttribute('x2', String(spot.x * u));
    line.setAttribute('y1', String(spot.y0 * u));
    line.setAttribute('y2', String(spot.y1 * u));
    line.setAttribute('stroke-width', String(0.2 * u));
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
    // The staff the note it should have been is written on, whatever its pitch: the left hand's upper notes sit on the bass staff
    // (above its top line), so a key from Middle C up still belongs there. With nothing due, fall back to the pitch's usual hand.
    const mine = at.due.filter((d) => this.activeHands === 'both' || d.staff === (this.activeHands === 'rh' ? 0 : 1)); // only the hand being asked for
    const near = mine.reduce<{ midi: number; staff: number } | undefined>((best, d) => (!best || Math.abs(d.midi - midi) < Math.abs(best.midi - midi) ? d : best), undefined);
    const staff = at.staves[near?.staff ?? (at.staves.length > 1 && clefFor(midi) === 'bass' ? 1 : 0)] ?? at.staves[0]!;
    const clef: Clef = staff.InitiallyActiveClef?.ClefType === ClefEnum.F ? 'bass' : 'treble';
    const u = UNIT_PX; // the drawing's own units: the zoom is the size the svg is shown at, not part of its coordinates
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
    this.container.querySelectorAll('.mark-note, .mark-result').forEach((el) => el.remove());
  }

  /**
   * A check mark below the system under a note you played in time, a cross under one you missed. Unlike the coloured notes these stay until the run is
   * restarted, so at the end you see which notes counted. Drawn in the minimal view only (the full view has colour).
   */
  markResult(at: NoteAnchor | undefined, kind: 'hit' | 'missed'): void {
    const svg = this.container.querySelector('svg');
    if (!this.paged || !svg || !at) return;
    const u = UNIT_PX; // the drawing's own units: the zoom is the size the svg is shown at, not part of its coordinates
    const x = at.x * u;
    // Below the system: the fingering numbers sit above the treble staff and the notes' own numbers are inside, so the marks get a row of their own.
    const bottom = at.staves[at.staves.length - 1]!.ParentStaffLine.PositionAndShape.AbsolutePosition.y + 6.5;
    const y = (bottom + 0.3) * u; // just under the staff, so it reads as belonging to the note above and not to the next system
    const key = `${Math.round(x)}@${Math.round(y)}`;
    const old = svg.querySelector(`[data-result="${key}"]`);
    if (old?.classList.contains('hit-result')) return; // a played note stays played
    old?.remove();
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('class', `mark-result ${kind}-result`);
    t.dataset.result = key;
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', String(2.1 * u));
    t.textContent = kind === 'hit' ? '✓' : '✕';
    svg.append(t);
  }
}
