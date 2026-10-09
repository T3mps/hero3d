import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScrollTimeline, damp, scrollProgress } from '../src/scroll.js';
import { guessRange, paramsToCode, tunableLeaves } from '../src/tuner.js';
import { installHeroEnv } from './fakeDom.js';

describe('scrollProgress', () => {
  it('through: 0 entering at the bottom, 1 leaving at the top', () => {
    expect(scrollProgress({ top: 800, height: 400 }, 800)).toBe(0);
    expect(scrollProgress({ top: -400, height: 400 }, 800)).toBe(1);
    expect(scrollProgress({ top: 200, height: 400 }, 800)).toBeCloseTo(0.5, 9);
    expect(scrollProgress({ top: 5000, height: 400 }, 800)).toBe(0);
  });

  it('pinned: 0 when the section top reaches the viewport top, 1 when its bottom reaches the bottom', () => {
    expect(scrollProgress({ top: 0, height: 3000 }, 1000, 'pinned')).toBe(0);
    expect(scrollProgress({ top: -1000, height: 3000 }, 1000, 'pinned')).toBeCloseTo(0.5, 9);
    expect(scrollProgress({ top: -2000, height: 3000 }, 1000, 'pinned')).toBe(1);
  });

  it('damp approaches the target independent of the frame rate', () => {
    const run = (dt: number) => {
      let v = 0;
      for (let t = 0; t < 1 - 1e-9; t += dt) v = damp(v, 10, 4, dt);
      return v;
    };
    expect(run(1 / 60)).toBeCloseTo(run(1 / 240), 6);
    expect(run(1 / 60)).toBeCloseTo(10 * (1 - Math.exp(-4)), 6);
  });
});

describe('createScrollTimeline', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reports once up front, then at most once a frame on scroll, and only on change', () => {
    const env = installHeroEnv();
    const win = new EventTarget() as EventTarget & { innerHeight: number };
    win.innerHeight = 800;
    vi.stubGlobal('window', win);
    let top = 800;
    const el = { getBoundingClientRect: () => ({ top, height: 400 }) } as Element;
    const seen: number[] = [];
    const off = createScrollTimeline(el, (p) => seen.push(p));
    expect(seen).toEqual([0]);
    top = 200;
    win.dispatchEvent(new Event('scroll'));
    win.dispatchEvent(new Event('scroll'));
    env.tick(16);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeCloseTo(0.5, 9);
    win.dispatchEvent(new Event('scroll'));
    env.tick(32);
    expect(seen).toHaveLength(2); // unchanged
    off();
    top = -400;
    win.dispatchEvent(new Event('scroll'));
    env.tick(48);
    expect(seen).toHaveLength(2);
    env.restore();
  });
});

describe('tuner helpers', () => {
  it('finds every number, nested and in arrays, and writes through', () => {
    const params = { speed: 2, cam: { fov: 0.9, keys: [{ x: 1 }, { x: 2 }] }, name: 'x', on: true };
    const leaves = tunableLeaves(params);
    expect(leaves.map((l) => l.path)).toEqual(['speed', 'cam.fov', 'cam.keys[0].x', 'cam.keys[1].x']);
    leaves[3].set(7);
    expect(params.cam.keys[1].x).toBe(7);
  });

  it('guesses useful slider ranges', () => {
    expect(guessRange(0.4)).toEqual([0, 1, 0.001]);
    const [lo, hi, step] = guessRange(50);
    expect(lo).toBeLessThan(50);
    expect(hi).toBeGreaterThan(50);
    expect(step).toBeGreaterThan(0);
  });

  it('prints pasteable code', () => {
    expect(paramsToCode({ a: 1.234567, b: { c: [2] } }, 'P')).toBe('const P = {\n  a: 1.2346,\n  b: {\n    c: [\n      2\n    ]\n  }\n};');
  });
});
