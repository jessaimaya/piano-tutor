import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('uses a saved theme when it is known', () => {
    expect(resolveTheme('cold', false)).toBe('cold');
    expect(resolveTheme('night', false)).toBe('night');
  });
  it('ignores an unknown or missing saved value and follows the system', () => {
    expect(resolveTheme('neon', false)).toBe('warm');
    expect(resolveTheme(null, true)).toBe('night');
    expect(resolveTheme(undefined, false)).toBe('warm');
  });
});
