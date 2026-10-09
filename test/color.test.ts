import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCssColor } from '../src/color.js';

afterEach(() => vi.unstubAllGlobals());

describe('resolveCssColor', () => {
  it('probes the colour inside the element and reads it back as sRGB through a 1x1 canvas', () => {
    const appended: { style: Record<string, string>; removed: boolean }[] = [];
    let painted = '';
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag === 'span') {
          const probe = { style: {} as Record<string, string>, removed: false, remove() { probe.removed = true; } };
          return probe;
        }
        return {
          getContext: () => ({
            set fillStyle(v: string) { painted = v; },
            fillRect() {},
            getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) })
          })
        };
      }
    });
    vi.stubGlobal('getComputedStyle', () => ({ color: 'oklab(0.5 0.1 -0.1)' }));
    const el = { append: (p: (typeof appended)[number]) => appended.push(p) };
    const rgb = resolveCssColor(el as unknown as Element, 'color-mix(in oklab, var(--a), var(--b))');
    expect(rgb).toEqual([12, 34, 56]);
    expect(appended[0].style.color).toBe('color-mix(in oklab, var(--a), var(--b))');
    expect(appended[0].removed).toBe(true);
    expect(painted).toBe('oklab(0.5 0.1 -0.1)');
  });
});
