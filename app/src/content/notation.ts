/**
 * Compact notation → MusicXML, so lessons can be written by hand and validated.
 *
 *   "C4:q D4:q E4:h | G4:w |"
 *
 * Token:   <pitch>[+<pitch>…]:<duration>[/<finger>]     or   R:<duration>
 * Pitch:   letter, optional # or b, octave (C4 = Middle C)      e.g. F#3, Bb4
 * Duration: w h q e s (whole, half, quarter, eighth, sixteenth), "." after it = dotted
 * "|" ends a bar. Every bar must add up to the time signature, or building throws.
 */

export interface NotationPiece {
  title: string;
  composer?: string;
  timeSig: [beats: number, beatType: number];
  /** Key signature as number of sharps (positive) or flats (negative). */
  fifths: number;
  rh?: string;
  lh?: string;
}

const DIVISIONS = 4; // per quarter note
const BASE: Record<string, { len: number; type: string }> = {
  w: { len: 16, type: 'whole' },
  h: { len: 8, type: 'half' },
  q: { len: 4, type: 'quarter' },
  e: { len: 2, type: 'eighth' },
  s: { len: 1, type: '16th' },
};

interface Pitch { step: string; alter: number; octave: number }
interface Item { pitches: Pitch[]; len: number; type: string; dotted: boolean; finger?: number }

export function parsePitch(text: string): Pitch {
  const m = /^([A-G])(#|b)?(\d)$/.exec(text);
  if (!m) throw new Error(`Bad pitch "${text}"`);
  return { step: m[1]!, alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, octave: Number(m[3]) };
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiOf(pitch: string): number {
  const p = parsePitch(pitch);
  return (p.octave + 1) * 12 + SEMITONE[p.step]! + p.alter;
}

function parseToken(token: string): Item {
  const m = /^(R|[A-G][#b]?\d(?:\+[A-G][#b]?\d)*):([whqes])(\.)?(?:\/([1-5]))?$/.exec(token);
  if (!m) throw new Error(`Bad token "${token}"`);
  const base = BASE[m[2]!]!;
  const dotted = m[3] === '.';
  if (dotted && m[2] === 's') throw new Error(`Dotted sixteenth not supported: "${token}"`);
  return {
    pitches: m[1] === 'R' ? [] : m[1]!.split('+').map(parsePitch),
    len: dotted ? base.len * 1.5 : base.len,
    type: base.type,
    dotted,
    finger: m[4] ? Number(m[4]) : undefined,
  };
}

function parseBars(text: string | undefined, barLen: number, label: string): Item[][] | null {
  if (!text) return null;
  const bars = text.split('|').map((b) => b.trim()).filter(Boolean);
  return bars.map((bar, i) => {
    const items = bar.split(/\s+/).map(parseToken);
    const total = items.reduce((s, it) => s + it.len, 0);
    if (total !== barLen) {
      throw new Error(`${label} bar ${i + 1} has ${total / DIVISIONS} beats, expected ${barLen / DIVISIONS}: "${bar}"`);
    }
    return items;
  });
}

function noteXml(item: Item, staff: 1 | 2): string {
  const common = `<duration>${item.len}</duration><voice>${staff}</voice><type>${item.type}</type>${item.dotted ? '<dot/>' : ''}<staff>${staff}</staff>`;
  if (item.pitches.length === 0) return `<note><rest/>${common}</note>`;
  return item.pitches
    .map((p, i) => {
      const fingering = item.finger && i === 0
        ? `<notations><technical><fingering>${item.finger}</fingering></technical></notations>`
        : '';
      const alter = p.alter ? `<alter>${p.alter}</alter>` : '';
      return `<note>${i > 0 ? '<chord/>' : ''}<pitch><step>${p.step}</step>${alter}<octave>${p.octave}</octave></pitch>${common}${fingering}</note>`;
    })
    .join('');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildMusicXml(piece: NotationPiece): string {
  const [beats, beatType] = piece.timeSig;
  const barLen = (beats * 4 * DIVISIONS) / beatType;
  const rh = parseBars(piece.rh, barLen, 'RH');
  const lh = parseBars(piece.lh, barLen, 'LH');
  if (!rh && !lh) throw new Error(`"${piece.title}" has no notes`);
  const count = (rh ?? lh)!.length;
  if (rh && lh && rh.length !== lh.length) {
    throw new Error(`"${piece.title}": RH has ${rh.length} bars but LH has ${lh.length}`);
  }

  const wholeRest = (staff: 1 | 2) =>
    `<note><rest measure="yes"/><duration>${barLen}</duration><voice>${staff}</voice><staff>${staff}</staff></note>`;

  const measures: string[] = [];
  for (let i = 0; i < count; i++) {
    const attrs = i === 0
      ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${piece.fifths}</fifths></key>` +
        `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><staves>2</staves>` +
        `<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`
      : '';
    const right = rh ? rh[i]!.map((it) => noteXml(it, 1)).join('') : wholeRest(1);
    const left = lh ? lh[i]!.map((it) => noteXml(it, 2)).join('') : wholeRest(2);
    const end = i === count - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : '';
    measures.push(`<measure number="${i + 1}">${attrs}${right}<backup><duration>${barLen}</duration></backup>${left}${end}</measure>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
<work><work-title>${esc(piece.title)}</work-title></work>
<identification>${piece.composer ? `<creator type="composer">${esc(piece.composer)}</creator>` : ''}</identification>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
${measures.join('\n')}
</part>
</score-partwise>`;
}
