import { describe, expect, it } from 'vitest';
import { analyse, easierHand, midiName, readSteps, sections, troubleBars, type MeasuredSource, type StepNotes } from './analysis';
import { buildPath } from './path';
import { completion, currentTask, noteCard, noteRun, parsePieceState, newPieceState, skipTask } from './state';
import type { CursorNote } from '../practice/session';

/** A piece as bars of [rh notes, lh notes] per beat: each entry is one step. */
function piece(bars: { rh?: number[][]; lh?: number[][] }[]): StepNotes[] {
  const steps: StepNotes[] = [];
  bars.forEach((bar, measure) => {
    const n = Math.max(bar.rh?.length ?? 0, bar.lh?.length ?? 0);
    for (let i = 0; i < n; i++) {
      const notes: CursorNote[] = [
        ...(bar.rh?.[i] ?? []).map((midi) => ({ midi, staff: 0 })),
        ...(bar.lh?.[i] ?? []).map((midi) => ({ midi, staff: 1 })),
      ];
      steps.push({ measure, beat: measure * 4 + i, notes });
    }
  });
  return steps;
}
const easyRh = [[60], [62], [64], [62]];
const easyLh = [[48], [48], [43], [43]];
const hardLh = [[36, 43, 52], [48, 55], [30], [45, 60]]; // jumps, chords, a black key

describe('analysis', () => {
  it('walks a cursor to the end and leaves it at the start', () => {
    const steps = piece([{ rh: easyRh }]);
    let i = 0;
    const cursor: MeasuredSource = {
      reset: () => { i = 0; }, next: () => { i++; }, get done() { return i >= steps.length; },
      beat: () => steps[i]!.beat, measure: () => steps[i]!.measure, notes: () => steps[i]!.notes,
    };
    expect(readSteps(cursor)).toHaveLength(4);
    expect(i).toBe(0);
  });

  it('ranks a bar of jumps, chords and black keys above a slow tune in position', () => {
    const a = analyse(piece([{ rh: easyRh, lh: easyLh }, { rh: easyRh, lh: hardLh }]));
    expect(a.lh[1]!.difficulty).toBeGreaterThan(a.lh[0]!.difficulty);
    expect(a.lh[1]!.chords).toBe(3);
    expect(a.lh[1]!.black).toBeGreaterThan(0);
    expect(a.rh[0]!.difficulty).toBe(a.rh[1]!.difficulty);
  });

  it('picks the hand with the lower total as the one to learn first', () => {
    const a = analyse(piece([{ rh: easyRh, lh: hardLh }, { rh: easyRh, lh: hardLh }]));
    expect(easierHand(a)).toBe('rh');
    const b = analyse(piece([{ rh: hardLh, lh: easyLh }]));
    expect(easierHand(b)).toBe('lh');
  });

  it('lists the pitches of each hand in order of first appearance', () => {
    const a = analyse(piece([{ rh: [[64], [60], [64], [62]] }]));
    expect(a.order.rh).toEqual([64, 60, 62]);
    expect(a.plays).toEqual({ rh: true, lh: false });
  });

  it('cuts sections and folds a lone last bar into the section before', () => {
    expect(sections(8)).toEqual([{ from: 1, to: 2 }, { from: 3, to: 4 }, { from: 5, to: 6 }, { from: 7, to: 8 }]);
    expect(sections(9, 4)).toEqual([{ from: 1, to: 4 }, { from: 5, to: 9 }]);
    expect(sections(1)).toEqual([{ from: 1, to: 1 }]);
  });

  it('finds the bars that stand out', () => {
    const bars = Array.from({ length: 8 }, (_, i) => ({ rh: easyRh, lh: i === 5 ? hardLh : easyLh }));
    expect(troubleBars(analyse(piece(bars)))).toEqual([6]);
    expect(troubleBars(analyse(piece(bars.slice(0, 8).map(() => ({ rh: easyRh, lh: easyLh })))))).toEqual([]);
  });

  it('names notes with sharps or flats', () => {
    expect(midiName(60)).toBe('C4');
    expect(midiName(70)).toBe('A#4');
    expect(midiName(70, true)).toBe('Bb4');
  });
});

describe('path', () => {
  const bars = Array.from({ length: 8 }, (_, i) => ({ rh: easyRh, lh: i === 5 ? hardLh : easyLh }));
  const tasks = buildPath(analyse(piece(bars)));
  const phases = tasks.map((t) => t.phase);

  it('goes notes, first hand, second hand, together, trouble, whole, tempo', () => {
    const order = ['notes', 'first', 'second', 'together', 'trouble', 'whole', 'tempo'];
    const seen = [...new Set(phases)];
    expect(seen).toEqual(order);
    expect(phases.indexOf('whole')).toBeGreaterThan(phases.lastIndexOf('together'));
  });

  it('starts with the easier hand and ends with the metronome', () => {
    expect(tasks[0]!.cardHand).toBe('rh');
    expect(tasks.find((t) => t.phase === 'first' && t.kind === 'hand')!.hands).toBe('rh');
    expect(tasks.find((t) => t.phase === 'second')!.hands).toBe('lh');
    expect(tasks[tasks.length - 1]!.mode).toBe('tempo');
  });

  it('opens every playing step on the notes only and finishes it with the rhythm', () => {
    const playing = tasks.filter((t) => t.mode === 'wait');
    expect(playing.length).toBeGreaterThan(0);
    expect(playing.every((t) => t.rhythm === true)).toBe(true);
    expect(tasks.filter((t) => t.mode !== 'wait').some((t) => t.rhythm)).toBe(false); // cards and the metronome step are as they were
    expect(playing.every((t) => t.text.includes('rhythm'))).toBe(true);
  });

  it('does the easiest section first within a hand', () => {
    const lh = tasks.filter((t) => t.phase === 'second' && t.kind === 'hand');
    expect(lh[lh.length - 1]!.bars).toEqual([5, 6]); // the section with the hard bar comes last
  });

  it('puts hands together on a couple of bars before whole sections', () => {
    const together = tasks.filter((t) => t.phase === 'together');
    expect(together[0]!.kind).toBe('start');
    const [from, to] = together[0]!.bars!;
    expect(to - from).toBe(1);
    expect([from, to]).not.toContain(6); // not on the hard bar
  });

  it('has unique ids', () => {
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
  });

  it('plans a one-hand piece without second hand or hands together', () => {
    const t = buildPath(analyse(piece(bars.map(() => ({ rh: easyRh })))));
    expect(new Set(t.map((x) => x.phase))).toEqual(new Set(['notes', 'first', 'whole', 'tempo']));
    expect(t.every((x) => x.hands === 'rh')).toBe(true);
  });

  it('gives an empty path for an empty piece', () => {
    expect(buildPath(analyse([]))).toEqual([]);
  });
});

describe('state', () => {
  const tasks = buildPath(analyse(piece(Array.from({ length: 4 }, () => ({ rh: easyRh, lh: easyLh })))));
  const hand = tasks.find((t) => t.kind === 'hand')!;

  it('counts only good runs, and stops at the goal', () => {
    let s = newPieceState('p');
    s = noteRun(s, hand, 0.5);
    expect(s.progress[hand.id]).toBeUndefined();
    s = noteRun(noteRun(noteRun(s, hand, 0.95), hand, 1), hand, 1);
    expect(s.progress[hand.id]).toBe(hand.goal);
  });

  it('moves on to the next task when one is done or skipped', () => {
    let s = newPieceState('p');
    const first = currentTask(s, tasks)!;
    s = skipTask(s, first);
    expect(currentTask(s, tasks)).toBe(tasks[1]);
    expect(completion(s, tasks)).toBeCloseTo(1 / tasks.length);
  });

  it('counts fast right cards only', () => {
    const card = tasks[0]!;
    let s = noteCard(newPieceState('p'), card, 'treble:C4', true, false);
    expect(s.progress[card.id]).toBeUndefined();
    s = noteCard(s, card, 'treble:C4', true, true);
    expect(s.progress[card.id]).toBe(1);
    expect(s.cardFast['treble:C4']).toBe(1);
  });

  it('survives bad saved data', () => {
    expect(parsePieceState('{oops', 'p').progress).toEqual({});
    expect(parsePieceState(JSON.stringify({ ...newPieceState('other') }), 'p').pieceId).toBe('p');
    const s = noteRun(newPieceState('p'), hand, 1);
    expect(parsePieceState(JSON.stringify(s), 'p').progress).toEqual(s.progress);
  });
});
