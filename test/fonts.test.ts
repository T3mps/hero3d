import { describe, expect, it, vi } from 'vitest';
import { ensureFonts, type FontSetLike } from '../src/fonts.js';

describe('ensureFonts', () => {
  it('resolves loaded once every spec settles, failed loads included', async () => {
    const load = vi.fn((s: string) => (s.includes('bad') ? Promise.reject(new Error('x')) : Promise.resolve([])));
    await expect(ensureFonts(['12px A', '12px bad'], { fonts: { load } })).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('resolves timeout when a load never settles', async () => {
    const fonts: FontSetLike = { load: () => new Promise(() => {}) };
    await expect(ensureFonts(['12px A'], { fonts, timeoutMs: 10 })).resolves.toBe('timeout');
  });

  it('resolves unavailable without a font set (e.g. outside a browser)', async () => {
    await expect(ensureFonts(['12px A'], { fonts: null })).resolves.toBe('unavailable');
    await expect(ensureFonts(['12px A'])).resolves.toBe('unavailable');
  });
});
