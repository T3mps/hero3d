import { describe, expect, it } from 'vitest';
import type { Camera } from '../src/camera.js';
import { drawImageWarped, growTriangle, sourceSize, warpDivisions } from '../src/imageWarp.js';
import { quadFromCorners, quadPoint } from '../src/quads.js';
import { fakeCanvas, type FakeCtx2D } from './fakeDom.js';

const steep = (() => {
  const cam: Camera = { pos: { x: 0, y: 1.2, z: -2 }, target: { x: 0, y: 0, z: 4 }, fov: 1.1 };
  const q = quadFromCorners(cam, { fl: { x: -2, y: 0, z: 12 }, fr: { x: 2, y: 0, z: 12 }, nl: { x: -2, y: 0, z: 0.2 }, nr: { x: 2, y: 0, z: 0.2 } }, 1280, 720)!;
  return (u: number, v: number) => quadPoint(q, u, v);
})();
const affine = (u: number, v: number) => ({ x: 100 + 400 * u + 50 * v, y: 80 + 20 * u + 300 * v });

const nums = (call: string) => call.slice(call.indexOf('(') + 1, -1).split(',').map(Number);

describe('warpDivisions', () => {
  it('needs one cell for an affine map and many for a raking plane, within the cap', () => {
    expect(warpDivisions(affine)).toBe(1);
    const n = warpDivisions(steep);
    expect(n).toBeGreaterThanOrEqual(4);
    expect(warpDivisions(steep, 0.5, 8)).toBeLessThanOrEqual(8);
  });

  it('chooses a grid whose cells are within tolerance', () => {
    const tol = 0.5;
    const n = warpDivisions(steep, tol, 1024);
    expect(n).toBeLessThan(1024);
    let worst = 0;
    for (let j = 0; j < n; j += 1)
      for (let i = 0; i < n; i += 1) {
        const a = steep(i / n, j / n), c = steep((i + 1) / n, (j + 1) / n), m = steep((i + 0.5) / n, (j + 0.5) / n);
        worst = Math.max(worst, Math.hypot(m.x - (a.x + c.x) / 2, m.y - (a.y + c.y) / 2));
      }
    expect(worst).toBeLessThanOrEqual(tol);
  });
});

describe('growTriangle', () => {
  const lineDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);

  it('offsets every edge outward by exactly the margin', () => {
    const tri = [{ x: 0, y: 0 }, { x: 30, y: 15 }, { x: 0, y: 30 }];
    const g = growTriangle(tri, 0.75);
    for (let i = 0; i < 3; i += 1) {
      const a = tri[i], b = tri[(i + 1) % 3];
      expect(lineDist(g[i], a, b)).toBeCloseTo(0.75, 9);
      expect(lineDist(g[(i + 1) % 3], a, b)).toBeCloseTo(0.75, 9);
    }
    expect(growTriangle(tri, 0)).toEqual(tri);
  });

  it('caps the corner of a needle-thin triangle at 4x the margin', () => {
    const tri = [{ x: 0, y: 0 }, { x: 100, y: 2 }, { x: 0, y: 4 }];
    const g = growTriangle(tri, 0.75);
    g.forEach((p, i) => expect(Math.hypot(p.x - tri[i].x, p.y - tri[i].y)).toBeLessThanOrEqual(3 + 1e-9));
  });
});

describe('drawImageWarped', () => {
  it('maps the image corners exactly onto the target', () => {
    const ctx = fakeCanvas().getContext('2d') as FakeCtx2D;
    const img = { width: 200, height: 100 } as unknown as CanvasImageSource;
    drawImageWarped(ctx as unknown as CanvasRenderingContext2D, img, affine, { seam: 0 });
    const transforms = ctx.calls.filter((c) => c.startsWith('transform')).map(nums);
    expect(transforms).toHaveLength(2); // one cell, two triangles
    const [a, b, c, d, e, f] = transforms[0];
    const apply = (x: number, y: number) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
    for (const [sx, sy, u, v] of [[0, 0, 0, 0], [200, 0, 1, 0], [200, 100, 1, 1]]) {
      const p = apply(sx, sy);
      const t = affine(u, v);
      expect(p.x).toBeCloseTo(t.x, 9);
      expect(p.y).toBeCloseTo(t.y, 9);
    }
    // each triangle is clipped and restored
    expect(ctx.calls.filter((c) => c === 'clip()')).toHaveLength(2);
    expect(ctx.calls.filter((c) => c.startsWith('save')).length).toBe(ctx.calls.filter((c) => c.startsWith('restore')).length);
  });

  it('subdivides a perspective map, and skips an empty image', () => {
    const ctx = fakeCanvas().getContext('2d') as FakeCtx2D;
    drawImageWarped(ctx as unknown as CanvasRenderingContext2D, { width: 640, height: 360 } as never, steep);
    const n = warpDivisions(steep);
    expect(ctx.calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(n * n * 2);
    const empty = fakeCanvas().getContext('2d') as FakeCtx2D;
    drawImageWarped(empty as unknown as CanvasRenderingContext2D, { width: 0, height: 0 } as never, steep);
    expect(empty.calls).toEqual([]);
  });

  it('sourceSize reads images, videos and canvases', () => {
    expect(sourceSize({ naturalWidth: 3, naturalHeight: 4, width: 1, height: 1 } as never)).toEqual({ w: 3, h: 4 });
    expect(sourceSize({ videoWidth: 5, videoHeight: 6 } as never)).toEqual({ w: 5, h: 6 });
    expect(sourceSize({ width: 7, height: 8 } as never)).toEqual({ w: 7, h: 8 });
  });
});
