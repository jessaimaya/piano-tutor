import { describe, expect, it } from 'vitest';
import { DEFAULT_ZOOM, resolveView, resolveZoom, stepZoom, ZOOMS } from './view';

describe('resolveView', () => {
  it('lets the address beat the saved choice', () => {
    expect(resolveView('full', 'minimal')).toBe('minimal');
    expect(resolveView('minimal', 'full')).toBe('full');
  });
  it('uses the saved choice, and the full view when nothing valid is saved', () => {
    expect(resolveView('minimal', null)).toBe('minimal');
    expect(resolveView('tiny', 'huge')).toBe('full');
    expect(resolveView(undefined, undefined)).toBe('full');
  });
});

describe('zoom', () => {
  it('accepts only the known steps', () => {
    expect(resolveZoom('1.45')).toBe(1.45);
    expect(resolveZoom('3')).toBe(DEFAULT_ZOOM);
    expect(resolveZoom(null)).toBe(DEFAULT_ZOOM);
  });
  it('steps up and down and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.2);
    expect(stepZoom(1, -1)).toBe(0.85);
    expect(stepZoom(ZOOMS[0], -1)).toBe(ZOOMS[0]);
    expect(stepZoom(ZOOMS.at(-1)!, 1)).toBe(ZOOMS.at(-1));
  });
});
