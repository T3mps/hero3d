// Perspective camera + projection for hero canvases. Pure, no DOM access.
import { type Vec3, sub, cross, dot, norm } from './math';

export interface Camera {
  pos: Vec3;
  target: Vec3;
  fov: number;
}

export interface Projected {
  x: number;
  y: number;
  scale: number; // screen px per world unit at this depth
  depth: number; // camera-space z
}

export interface CameraBasis {
  right: Vec3;
  up: Vec3;
  fwd: Vec3;
}

/** Look-at basis. Shared by the CPU projector and the GL vertex shader so they can never drift. */
export const cameraBasis = (cam: Camera): CameraBasis => {
  const fwd = norm(sub(cam.target, cam.pos));
  const right = norm(cross({ x: 0, y: 1, z: 0 }, fwd));
  const up = cross(fwd, right);
  return { right, up, fwd };
};

export const focalLength = (cam: Camera, viewH: number) => (0.5 * viewH) / Math.tan(cam.fov / 2);

/** Perspective-project a world point. Returns null behind the near plane. */
export function project(cam: Camera, p: Vec3, viewW: number, viewH: number): Projected | null {
  const { right, up, fwd } = cameraBasis(cam);
  const d = sub(p, cam.pos);
  const cz = dot(d, fwd);
  if (cz < 0.4) return null;
  const f = focalLength(cam, viewH);
  return {
    x: viewW / 2 + (dot(d, right) * f) / cz,
    y: viewH / 2 - (dot(d, up) * f) / cz,
    scale: f / cz,
    depth: cz
  };
}

// Clip-projecting variants for shapes that may straddle the near plane
// during low camera flyovers (all-or-nothing gating makes them visibly
// blink out mid-frame). Both clip in camera space at z = NEAR and project
// the clipped geometry.
export const NEAR = 0.45;

const toCamSpace = (cam: Camera, pts: Vec3[]): Vec3[] => {
  const { right, up, fwd } = cameraBasis(cam);
  return pts.map((p) => {
    const d = sub(p, cam.pos);
    return { x: dot(d, right), y: dot(d, up), z: dot(d, fwd) };
  });
};

const toScreen = (p: Vec3, f: number, viewW: number, viewH: number): Projected => ({
  x: viewW / 2 + (p.x * f) / p.z,
  y: viewH / 2 - (p.y * f) / p.z,
  scale: f / p.z,
  depth: p.z
});

/** Project a convex world polygon, clipped at the near plane. Empty if fully behind. */
export function projectPoly(cam: Camera, pts: Vec3[], viewW: number, viewH: number): Projected[] {
  const cs = toCamSpace(cam, pts);
  const clipped: Vec3[] = [];
  for (let i = 0; i < cs.length; i += 1) {
    const a = cs[i];
    const b = cs[(i + 1) % cs.length];
    if (a.z >= NEAR) clipped.push(a);
    if (a.z >= NEAR !== b.z >= NEAR) {
      const k = (NEAR - a.z) / (b.z - a.z);
      clipped.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: NEAR });
    }
  }
  const f = focalLength(cam, viewH);
  return clipped.map((p) => toScreen(p, f, viewW, viewH));
}

/** Project a world segment, clipped at the near plane. Null if fully behind. */
export function projectSeg(
  cam: Camera,
  a: Vec3,
  b: Vec3,
  viewW: number,
  viewH: number
): [Projected, Projected] | null {
  const [ca, cb] = toCamSpace(cam, [a, b]);
  if (ca.z < NEAR && cb.z < NEAR) return null;
  let pa = ca;
  let pb = cb;
  if (ca.z < NEAR || cb.z < NEAR) {
    const k = (NEAR - ca.z) / (cb.z - ca.z);
    const cut = { x: ca.x + (cb.x - ca.x) * k, y: ca.y + (cb.y - ca.y) * k, z: NEAR };
    if (ca.z < NEAR) pa = cut;
    else pb = cut;
  }
  const f = focalLength(cam, viewH);
  return [toScreen(pa, f, viewW, viewH), toScreen(pb, f, viewW, viewH)];
}
