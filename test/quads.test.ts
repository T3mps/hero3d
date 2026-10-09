import { describe, expect, it } from 'vitest';
import { project, type Camera } from '../src/camera.js';
import { localPoint, persp, quadFromCorners, quadPoint, quadSize, uvOf } from '../src/quads.js';

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
