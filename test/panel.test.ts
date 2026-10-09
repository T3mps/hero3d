import { describe, expect, it } from 'vitest';
import { toRgb } from '../src/panel.js';

describe('toRgb', () => {
  it('expands short and full hex to rgb()', () => {
    expect(toRgb('#fff')).toBe('rgb(255,255,255)');
    expect(toRgb('#1a2B3c')).toBe('rgb(26,43,60)');
    expect(toRgb('  #000  ')).toBe('rgb(0,0,0)');
  });

  it('passes anything else through untouched', () => {
    expect(toRgb('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
    expect(toRgb('#12345')).toBe('#12345');
    expect(toRgb('red')).toBe('red');
  });
});
