import { describe, expect, it } from 'vitest';
import { NEAR, cameraBasis, focalLength, project, projectPoly, projectSeg, type Camera } from '../src/camera.js';
import { dot } from '../src/math.js';

// Looking straight down +z from the origin, 90 degree vertical fov, 800x600 view.
const cam: Camera = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 1 }, fov: Math.PI / 2 };
const W = 800;
const H = 600;

describe('camera basis and projection', () => {
  it('builds an orthonormal look-at basis', () => {
    const tilted: Camera = { pos: { x: 1, y: 5, z: -3 }, target: { x: 4, y: 0, z: 8 }, fov: 1 };
    const { right, up, fwd } = cameraBasis(tilted);
    expect(dot(right, up)).toBeCloseTo(0, 12);
    expect(dot(right, fwd)).toBeCloseTo(0, 12);
    expect(dot(up, fwd)).toBeCloseTo(0, 12);
    expect(up.y).toBeGreaterThan(0);
  });

  it('puts the target on the projection centre', () => {
    const p = project(cam, { x: 0, y: 0, z: 5 }, W, H);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(W / 2, 9);
    expect(p!.y).toBeCloseTo(H / 2, 9);
    expect(p!.depth).toBeCloseTo(5, 12);
  });

  it('maps the fov edge to the view edge and reports px per world unit', () => {
    const f = focalLength(cam, H);
    expect(f).toBeCloseTo(300, 9);
    const p = project(cam, { x: 0, y: 2, z: 2 }, W, H)!;
    expect(p.y).toBeCloseTo(0, 9); // up is screen-up: y = 0 is the top edge
    expect(p.scale).toBeCloseTo(150, 9);
    const r = project(cam, { x: 1, y: 0, z: 2 }, W, H)!;
    expect(r.x).toBeGreaterThan(W / 2); // +x world is screen-right
  });

  it('rejects points behind the camera', () => {
    expect(project(cam, { x: 0, y: 0, z: -1 }, W, H)).toBeNull();
  });

  it('uses one near plane: project() and the clipped projectors agree on what is visible', () => {
    // between 0.40 and NEAR the two paths used to disagree
    for (const z of [0.3, 0.41, 0.44, NEAR - 1e-9]) {
      expect(project(cam, { x: 0, y: 0, z }, W, H)).toBeNull();
      expect(projectSeg(cam, { x: 0, y: 0, z }, { x: 0.1, y: 0, z }, W, H)).toBeNull();
    }
    for (const z of [NEAR, 0.5, 3]) {
      expect(project(cam, { x: 0, y: 0, z }, W, H)).not.toBeNull();
      expect(projectSeg(cam, { x: 0, y: 0, z }, { x: 0.1, y: 0, z }, W, H)).not.toBeNull();
    }
  });
});

describe('near-plane clipping', () => {
  it('projectPoly keeps a polygon in front whole and clips one that straddles', () => {
    const front = [
      { x: -1, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 0, z: 4 },
      { x: -1, y: 0, z: 4 }
    ];
    expect(projectPoly(cam, front, W, H)).toHaveLength(4);
    const straddle = front.map((p) => ({ ...p, z: p.z - 3 })); // z from -1 to 1
    const clipped = projectPoly(cam, straddle, W, H);
    expect(clipped).toHaveLength(4);
    expect(clipped.filter((p) => Math.abs(p.depth - NEAR) < 1e-12)).toHaveLength(2);
    expect(projectPoly(cam, front.map((p) => ({ ...p, z: -p.z })), W, H)).toEqual([]);
  });

  it('projectSeg clips the end behind the near plane and drops a segment fully behind', () => {
    const seg = projectSeg(cam, { x: 0, y: 1, z: -2 }, { x: 0, y: 1, z: 3 }, W, H)!;
    expect(seg[0].depth).toBeCloseTo(NEAR, 12);
    expect(seg[1].depth).toBeCloseTo(3, 12);
    expect(projectSeg(cam, { x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 0.1 }, W, H)).toBeNull();
  });
});
