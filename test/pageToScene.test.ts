import { describe, expect, it } from 'vitest';
import { project, type Camera } from '../src/camera.js';
import { dot } from '../src/math.js';
import { cameraForRect, cornersOfPose, elementRect, lerpPose, pagePose, poseFromCorners, type PlanePose } from '../src/pageToScene.js';

const W = 1280;
const H = 720;
const cam: Camera = { pos: { x: 1, y: 3, z: -6 }, target: { x: 0, y: 0.5, z: 2 }, fov: 0.8 };
const rect = { x: 700, y: 180, w: 420, h: 260 };

const projectsOnto = (c: Camera, pose: PlanePose, r: typeof rect) => {
  const k = cornersOfPose(pose);
  const want = { fl: [r.x, r.y], fr: [r.x + r.w, r.y], nl: [r.x, r.y + r.h], nr: [r.x + r.w, r.y + r.h] } as const;
  for (const key of ['fl', 'fr', 'nl', 'nr'] as const) {
    const p = project(c, k[key], W, H)!;
    expect(p.x).toBeCloseTo(want[key][0], 6);
    expect(p.y).toBeCloseTo(want[key][1], 6);
  }
};

describe('page <-> scene', () => {
  it('pagePose projects exactly onto the DOM rect, at a depth set by its world width', () => {
    const pose = pagePose(cam, rect, W, H, { worldWidth: 3 });
    expect(pose.w).toBeCloseTo(3, 9);
    expect(pose.h / pose.w).toBeCloseTo(rect.h / rect.w, 9);
    projectsOnto(cam, pose, rect);
  });

  it('cameraForRect frames a plane in the scene onto a rect', () => {
    const pose: PlanePose = { center: { x: 4, y: 2, z: 10 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, w: 4, h: 4 * (260 / 420) };
    const c = cameraForRect(pose, rect, W, H, 0.8);
    projectsOnto(c, pose, rect);
  });

  it('poseFromCorners inverts cornersOfPose', () => {
    const pose = pagePose(cam, rect, W, H, { depth: 7 });
    const back = poseFromCorners(cornersOfPose(pose));
    expect(back.w).toBeCloseTo(pose.w, 9);
    expect(back.h).toBeCloseTo(pose.h, 9);
    expect(dot(back.right, pose.right)).toBeCloseTo(1, 9);
    expect(dot(back.up, pose.up)).toBeCloseTo(1, 9);
  });

  it('lerpPose hits both ends and turns rigidly between them', () => {
    const a = pagePose(cam, rect, W, H, { worldWidth: 3 });
    const b: PlanePose = { center: { x: -2, y: 0.01, z: 6 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, w: 5, h: 3 };
    const at0 = lerpPose(a, b, 0);
    const at1 = lerpPose(a, b, 1);
    expect(dot(at0.right, a.right)).toBeCloseTo(1, 6);
    expect(dot(at1.up, b.up)).toBeCloseTo(1, 6);
    expect(at1.center.x).toBeCloseTo(-2, 9);
    for (const k of [0.25, 0.5, 0.75]) {
      const m = lerpPose(a, b, k);
      expect(Math.hypot(m.right.x, m.right.y, m.right.z)).toBeCloseTo(1, 9);
      expect(dot(m.right, m.up)).toBeCloseTo(0, 9); // still a rectangle, not a shear
    }
  });

  it('elementRect is relative to the canvas', () => {
    const box = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, top, width, height }) }) as Element;
    expect(elementRect(box(150, 300, 40, 20), box(100, 100, 800, 600))).toEqual({ x: 50, y: 200, w: 40, h: 20 });
  });
});
