import { describe, expect, it } from 'vitest';
import type { Camera } from '../src/camera.js';
import { applyHomography, invert3, multiply3, quadHomography, quadUv, rectToQuad, squareToQuad } from '../src/homography.js';
import { createPanelPainter } from '../src/panel.js';
import { createQuadPainter, quadFromCorners, quadPoint, quadSize } from '../src/quads.js';
import { fakeCanvas, type FakeCtx2D } from './fakeDom.js';

const cam: Camera = { pos: { x: 1.5, y: 4, z: -5 }, target: { x: 0, y: 0, z: 3 }, fov: 0.9 };
const q = quadFromCorners(
  cam,
  { fl: { x: -3, y: 0, z: 9 }, fr: { x: 2, y: 0, z: 10 }, nl: { x: -2, y: 0, z: 1 }, nr: { x: 3, y: 0, z: 2 } },
  1280,
  720
)!;

describe('homography', () => {
  it('maps the unit square onto the four corners', () => {
    const H = squareToQuad({ x: 10, y: 10 }, { x: 90, y: 20 }, { x: 70, y: 80 }, { x: 5, y: 60 })!;
    expect(applyHomography(H, 0, 0)).toEqual({ x: 10, y: 10 });
    const c = applyHomography(H, 1, 1)!;
    expect(c.x).toBeCloseTo(70, 9);
    expect(c.y).toBeCloseTo(80, 9);
  });

  it('is exactly quadPoint for a projected quad', () => {
    const H = quadHomography(q)!;
    for (const [u, v] of [[0.5, 0.5], [0.1, 0.8], [0.9, 0.05], [0.3, 0.3]]) {
      const a = applyHomography(H, u, v)!;
      const b = quadPoint(q, u, v);
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('inverts', () => {
    const H = quadHomography(q)!;
    const I = multiply3(H, invert3(H)!);
    const scale = I[8];
    I.forEach((v, i) => expect(v / scale).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][i], 9));
  });

  it('rectToQuad maps a w x h box', () => {
    const M = rectToQuad(200, 100, q)!;
    const p = applyHomography(M, 100, 50)!;
    const m = quadPoint(q, 0.5, 0.5);
    expect(p.x).toBeCloseTo(m.x, 6);
    expect(p.y).toBeCloseTo(m.y, 6);
  });

  it('degenerate quads give null', () => {
    const z = { x: 1, y: 1 };
    expect(squareToQuad(z, z, z, z)).toBeNull();
  });
});

describe('hit-testing (quadUv, Panel.fromScreen)', () => {
  it('quadUv is the inverse of quadPoint, and says whether the point is on the quad', () => {
    for (const [u, v] of [[0.25, 0.75], [0.6, 0.1]]) {
      const p = quadPoint(q, u, v);
      const hit = quadUv(q, p.x, p.y)!;
      expect(hit.u).toBeCloseTo(u, 6);
      expect(hit.v).toBeCloseTo(v, 6);
      expect(hit.inside).toBe(true);
    }
    const out = quadPoint(q, 1.4, 0.5);
    expect(quadUv(q, out.x, out.y)!.inside).toBe(false);
  });

  it('Panel.fromScreen turns a pointer back into plane px', () => {
    const ctx = fakeCanvas().getContext('2d') as FakeCtx2D;
    const c2d = ctx as unknown as CanvasRenderingContext2D;
    const painter = createPanelPainter({ ctx: c2d, glyphs: {} as never, quads: createQuadPainter(c2d), uiFont: 'x', iconFont: 'y' });
    const panel = painter.panelFor(q, quadSize(q), 1280, 720);
    for (const [x, y] of [[640, 360], [100, 700], [1200, 20]]) {
      const sp = panel.toScreen(x, y);
      const back = panel.fromScreen(sp.x, sp.y)!;
      expect(back.x).toBeCloseTo(x, 4);
      expect(back.y).toBeCloseTo(y, 4);
      expect(back.inside).toBe(true);
    }
    const off = panel.toScreen(-50, 360);
    expect(panel.fromScreen(off.x, off.y)!.inside).toBe(false);
  });
});
