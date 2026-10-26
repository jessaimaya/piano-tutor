import { isBlackKey, noteName } from '../midi/parse';

const FIRST = 36; // C2
const LAST = 84; // C6
const WHITE_W = 24;
const WHITE_H = 120;
const BLACK_W = 15;
const BLACK_H = 74;

/** 'should' marks the key you ought to have played (shown after a wrong, early/late or missed note). */
export type KeyState = 'pressed' | 'expected' | 'hit' | 'wrong' | 'should';

/** On-screen keyboard. Shows what you press, what the score wants next, and flashes mistakes. */
export class KeyboardView {
  private keys = new Map<number, SVGRectElement>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>(); // per key and state

  constructor(
    private host: HTMLElement,
    private onPress: (note: number) => void,
    private onRelease: (note: number) => void,
  ) {
    this.render();
  }

  private render(): void {
    const NS = 'http://www.w3.org/2000/svg';
    const whites: number[] = [];
    for (let n = FIRST; n <= LAST; n++) if (!isBlackKey(n)) whites.push(n);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${whites.length * WHITE_W} ${WHITE_H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'On-screen piano keyboard');

    // Soft top-to-bottom shading so the keys read as raised; the colours come from the theme (style.css).
    const defs = document.createElementNS(NS, 'defs');
    const gradient = (id: string, stops: [number, string][]) => {
      const g = document.createElementNS(NS, 'linearGradient');
      g.id = id;
      g.setAttribute('x1', '0'); g.setAttribute('y1', '0'); g.setAttribute('x2', '0'); g.setAttribute('y2', '1');
      for (const [offset, cls] of stops) {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', String(offset));
        s.classList.add(cls);
        g.append(s);
      }
      return g;
    };
    defs.append(
      gradient('pt-key-white', [[0, 'kw-top'], [0.9, 'kw-mid'], [1, 'kw-lip']]),
      gradient('pt-key-black', [[0, 'kb-top'], [0.85, 'kb-mid'], [1, 'kb-lip']]),
    );
    svg.append(defs);

    const xOfWhite = new Map(whites.map((n, i) => [n, i * WHITE_W]));
    const make = (n: number, x: number, w: number, h: number, black: boolean) => {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', black ? '2.5' : '3');
      rect.classList.add('key', black ? 'black' : 'white');
      rect.dataset.note = String(n);
      const title = document.createElementNS(NS, 'title');
      title.textContent = noteName(n);
      rect.append(title);
      this.keys.set(n, rect);
      return rect;
    };

    for (const n of whites) svg.append(make(n, xOfWhite.get(n)!, WHITE_W, WHITE_H, false));
    for (let n = FIRST; n <= LAST; n++) {
      if (!isBlackKey(n)) continue;
      const left = xOfWhite.get(n - 1)!;
      svg.append(make(n, left + WHITE_W - BLACK_W / 2, BLACK_W, BLACK_H, true));
    }

    // Middle C marker
    const mc = xOfWhite.get(60)!;
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', String(mc + WHITE_W / 2));
    dot.setAttribute('cy', String(WHITE_H - 10));
    dot.setAttribute('r', '3');
    dot.classList.add('middle-c');
    svg.append(dot);

    const noteOf = (e: Event) => {
      const t = (e.target as Element).closest?.('[data-note]');
      return t ? Number((t as HTMLElement).dataset.note) : undefined;
    };
    let held: number | undefined;
    svg.addEventListener('pointerdown', (e) => {
      const n = noteOf(e);
      if (n === undefined) return;
      e.preventDefault();
      held = n;
      this.onPress(n);
    });
    const release = () => {
      if (held === undefined) return;
      this.onRelease(held);
      held = undefined;
    };
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointerleave', release);
    svg.addEventListener('pointercancel', release);

    this.host.replaceChildren(svg);
  }

  /** Replace the highlighted state for one kind of key. */
  setState(state: KeyState, notes: Iterable<number>): void {
    const set = new Set(notes);
    for (const [n, el] of this.keys) el.classList.toggle(state, set.has(n));
  }

  flash(state: 'wrong' | 'hit' | 'should', note: number, ms = 350): void {
    const el = this.keys.get(note);
    if (!el) return;
    const id = `${note}:${state}`;
    clearTimeout(this.timers.get(id)); // a repeat flash restarts the clock for that state only
    el.classList.add(state);
    this.timers.set(id, setTimeout(() => el.classList.remove(state), ms));
  }

  /** Remove every flash straight away (new run, new piece). */
  clearFlashes(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const el of this.keys.values()) el.classList.remove('wrong', 'hit', 'should');
  }
}
