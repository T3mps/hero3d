import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rgba } from '../src/color.js';
import { createEffects, depthFade } from '../src/effects.js';
import { fakeCanvas, installDocument, type FakeCtx2D } from './fakeDom.js';

let dom: ReturnType<typeof installDocument>;
beforeEach(() => {
  dom = installDocument();
});
afterEach(() => dom.restore());

describe('effects take the hero tuning explicitly (I7)', () => {
  it('depthFade is base - d * falloff within [min, 1]', () => {
    // the values Starworks' Astra hero used as the old built-in defaults
    const astra = { min: 0.4, falloff: 0.055, base: 1.5 };
    expect(depthFade(0, astra)).toBe(1);
    expect(depthFade(10, astra)).toBeCloseTo(0.95, 12);
    expect(depthFade(100, astra)).toBe(0.4);
  });

  it('the glow sprite takes an RGB accent and bakes the same stops the "r,g,b" string did', () => {
    const ctx = fakeCanvas().getContext('2d') as FakeCtx2D;
    const fx = createEffects(ctx as unknown as CanvasRenderingContext2D, [108, 192, 236]);
    const g = (fx.glow as unknown as { getContext(k: string): FakeCtx2D }).getContext('2d');
    const stops = (g.fillStyle as { stops: [number, string][] }).stops;
    expect(stops).toEqual([
      [0, 'rgba(108,192,236,0.85)'],
      [0.4, 'rgba(108,192,236,0.28)'],
      [1, 'rgba(108,192,236,0)']
    ]);
  });

  it('rgba formats an RGB with alpha', () => {
    expect(rgba([1, 2, 3], 0.5)).toBe('rgba(1,2,3,0.5)');
  });
});
