import { describe, expect, it } from 'vitest';
import { NEAR, project, type Camera } from '../src/camera.js';
import { localPoint, persp, quadFromCorners, quadFromCornersClipped, quadPoint, quadSize, uvOf } from '../src/quads.js';

const cam: Camera = { pos: { x: 0.5, y: 3, z: -4 }, target: { x: 0, y: 0, z: 4 }, fov: 0.9 };
const W = 1280;
const H = 720;
// a ground rectangle receding from the camera: x in [-2, 2], z in [2, 10]
const corners = {
  fl: { x: -2, y: 0, z: 10 },
  fr: { x: 2, y: 0, z: 10 },
  nl: { x: -2, y: 0, z: 2 },
  nr: { x: 2, y: 0, z: 2 }
};

describe('perspective-correct quads', () => {
  it('quadPoint reproduces the true projection of interior plane points', () => {
    const q = quadFromCorners(cam, corners, W, H)!;
    for (const [u, v] of [[0.5, 0.5], [0.1, 0.9], [0.8, 0.2], [0.33, 0.66]]) {
      const world = { x: -2 + 4 * u, y: 0, z: 10 - 8 * v };
      const truth = project(cam, world, W, H)!;
      const got = quadPoint(q, u, v);
      expect(got.x).toBeCloseTo(truth.x, 6);
      expect(got.y).toBeCloseTo(truth.y, 6);
    }
  });

  it('persp weights by depth: the far half of a receding segment is shorter on screen', () => {
    const mid = persp(0, 0, 10, 0, 100, 2, 0.5);
    expect(mid.y).toBeLessThan(50);
    expect(persp(0, 0, 10, 0, 100, 2, 0).y).toBe(0);
    expect(persp(0, 0, 10, 0, 100, 2, 1).y).toBe(100);
  });

  it('uvOf and localPoint map cell-local px (centred, y down) onto the quad', () => {
    const q = quadFromCorners(cam, corners, W, H)!;
    const g = quadSize(q);
    expect(uvOf(g, 0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(uvOf(g, -g.cw / 2, -g.ch / 2)).toEqual({ u: 0, v: 0 });
    const c = localPoint(q, g, 0, 0);
    const m = quadPoint(q, 0.5, 0.5);
    expect(c.x).toBeCloseTo(m.x, 9);
    expect(c.y).toBeCloseTo(m.y, 9);
  });

  it('quadFromCorners is all-or-nothing: null if any corner is behind the near plane', () => {
    const behind = { ...corners, nl: { x: -2, y: 0, z: -5 }, nr: { x: 2, y: 0, z: -5 } };
    expect(quadFromCorners(cam, behind, W, H)).toBeNull();
  });
});

describe('quadFromCornersClipped (I2)', () => {
  // a straight-ahead camera, so camera depth is world z
  const ahead: Camera = { pos: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 1, z: 1 }, fov: 1 };
  const area = (pts: { x: number; y: number }[]) =>
    Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0)) / 2;

  it('returns the whole quad, with its outline, when nothing is clipped', () => {
    const c = quadFromCornersClipped(cam, corners, W, H)!;
    expect(c.quad).not.toBeNull();
    expect(c.poly).toEqual([c.quad!.fl, c.quad!.fr, c.quad!.nr, c.quad!.nl]);
  });

  it('clips a quad the near plane cuts: a real polygon on the clip line, and no interior mapping', () => {
    const cut = {
      fl: { x: -2, y: 0, z: 6 },
      fr: { x: 2, y: 0, z: 6 },
      nl: { x: -2, y: 0, z: -1 },
      nr: { x: 2, y: 0, z: -1 }
    };
    expect(quadFromCorners(ahead, cut, W, H)).toBeNull();
    const c = quadFromCornersClipped(ahead, cut, W, H)!;
    expect(c.quad).toBeNull();
    expect(c.poly.length).toBeGreaterThanOrEqual(3);
    expect(area(c.poly)).toBeGreaterThan(0);
    const onClip = c.poly.filter((p) => Math.abs(p.depth - NEAR) < 1e-9);
    expect(onClip).toHaveLength(2);
  });

  it('is null only when the quad is entirely behind the near plane', () => {
    const back = {
      fl: { x: -2, y: 0, z: -1 },
      fr: { x: 2, y: 0, z: -1 },
      nl: { x: -2, y: 0, z: -3 },
      nr: { x: 2, y: 0, z: -3 }
    };
    expect(quadFromCornersClipped(ahead, back, W, H)).toBeNull();
  });
});
