import { describe, expect, it } from 'vitest';
import { tripletsBelow } from './score';

describe('tripletsBelow', () => {
  it('puts a tuplet start under the staff', () => {
    expect(tripletsBelow('<notations><tuplet type="start" /></notations>')).toBe('<notations><tuplet type="start" placement="below"/></notations>');
    expect(tripletsBelow('<tuplet type="start" bracket="yes">')).toBe('<tuplet type="start" bracket="yes" placement="below">');
  });
  it('leaves stops and tuplets that already say where alone', () => {
    expect(tripletsBelow('<tuplet type="stop" />')).toBe('<tuplet type="stop" />');
    expect(tripletsBelow('<tuplet type="start" placement="above"/>')).toBe('<tuplet type="start" placement="above"/>');
  });
});
