import { describe, expect, it } from 'vitest';
import { clefFor, isSharp, ledgerSteps, staffStep } from './staff-position';

describe('staffStep', () => {
  it('puts the treble lines where they belong', () => {
    expect(staffStep(77, 'treble')).toBe(0); // F5, top line
    expect(staffStep(71, 'treble')).toBe(4); // B4, middle line
    expect(staffStep(64, 'treble')).toBe(8); // E4, bottom line
  });
  it('puts the bass lines where they belong', () => {
    expect(staffStep(57, 'bass')).toBe(0); // A3, top line
    expect(staffStep(50, 'bass')).toBe(4); // D3, middle line
    expect(staffStep(43, 'bass')).toBe(8); // G2, bottom line
  });
  it('puts Middle C on a ledger line under the treble staff and above the bass staff', () => {
    expect(staffStep(60, 'treble')).toBe(10);
    expect(staffStep(60, 'bass')).toBe(-2);
  });
  it('gives a sharp the same height as its natural', () => {
    expect(staffStep(61, 'treble')).toBe(staffStep(60, 'treble'));
    expect(staffStep(70, 'treble')).toBe(staffStep(69, 'treble'));
    expect(isSharp(61)).toBe(true);
    expect(isSharp(62)).toBe(false);
  });
  it('moves one step per white key', () => {
    expect(staffStep(62, 'treble')).toBe(staffStep(60, 'treble') - 1);
    expect(staffStep(72, 'treble')).toBe(staffStep(60, 'treble') - 7);
  });
});

describe('ledgerSteps', () => {
  it('needs none inside the staff or in the first space beyond it', () => {
    expect(ledgerSteps(0)).toEqual([]);
    expect(ledgerSteps(8)).toEqual([]);
    expect(ledgerSteps(-1)).toEqual([]);
    expect(ledgerSteps(9)).toEqual([]);
  });
  it('draws one line for the note on it or the space past it', () => {
    expect(ledgerSteps(10)).toEqual([10]); // Middle C under the treble staff
    expect(ledgerSteps(11)).toEqual([10]);
    expect(ledgerSteps(-2)).toEqual([-2]);
    expect(ledgerSteps(-3)).toEqual([-2]);
  });
  it('stacks lines further out', () => {
    expect(ledgerSteps(14)).toEqual([10, 12, 14]);
    expect(ledgerSteps(-4)).toEqual([-2, -4]);
  });
});

describe('clefFor', () => {
  it('splits at Middle C', () => {
    expect(clefFor(60)).toBe('treble');
    expect(clefFor(59)).toBe('bass');
  });
});
