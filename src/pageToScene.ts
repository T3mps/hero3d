// Moving between the page and the scene. A plane can be posed so it projects
// exactly onto a DOM element's on-screen rectangle - indistinguishable from the
// flat element - and then animated into the 3D scene and back: a screenshot in
// the page lifts off into the hero as you scroll. Pure, apart from elementRect.
import { type Camera, cameraBasis, focalLength } from './camera.js';
import type { Corners } from './planes.js';
import { cross, dot, lerp, norm, sub, type Vec3 } from './math.js';

/** A rectangle in the world: centred at `center`, `w` along `right` and `h`
 *  along `up` (both unit). Its top edge (fl -> fr) is the +up side. */
export interface PlanePose {
  center: Vec3;
  right: Vec3;
  up: Vec3;
  w: number;
  h: number;
}

/** A rectangle in canvas CSS px (x right, y down). */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });

export function cornersOfPose(p: PlanePose): Corners {
  const r = scale(p.right, p.w / 2);
  const u = scale(p.up, p.h / 2);
  return {
    fl: add(sub(p.center, r), u),
    fr: add(add(p.center, r), u),
    nl: sub(sub(p.center, r), u),
    nr: sub(add(p.center, r), u)
  };
}

export function poseFromCorners(c: Corners): PlanePose {
  const center = scale(add(add(c.fl, c.fr), add(c.nl, c.nr)), 0.25);
  const across = sub(c.fr, c.fl);
  const right = norm(across);
  const down = sub(c.fl, c.nl);
  // orthogonalise up against right
  const up = norm(sub(down, scale(right, dot(down, right))));
  return { center, right, up, w: Math.hypot(across.x, across.y, across.z), h: Math.hypot(down.x, down.y, down.z) };
}

/** The camera-facing plane that projects exactly onto `rect`. Its depth comes
 *  from `worldWidth` (the plane's width in world units) or `depth`. */
export function pagePose(
  cam: Camera,
  rect: ScreenRect,
  viewW: number,
  viewH: number,
  opts: { worldWidth?: number; depth?: number } = {}
): PlanePose {
  const { right, up, fwd } = cameraBasis(cam);
  const f = focalLength(cam, viewH);
  const z = opts.worldWidth !== undefined ? (opts.worldWidth * f) / rect.w : (opts.depth ?? 5);
  const cx = ((rect.x + rect.w / 2 - viewW / 2) * z) / f;
  const cy = (-(rect.y + rect.h / 2 - viewH / 2) * z) / f;
  const center = add(add(add(cam.pos, scale(right, cx)), scale(up, cy)), scale(fwd, z));
  return { center, right, up, w: (rect.w * z) / f, h: (rect.h * z) / f };
}

/** A roll-free camera (fov as given) that frames `pose` onto `rect`, looking
 *  straight at it: the plane fills the rect's width, centred on it. The pose's
 *  `right` must be horizontal (the camera keeps world up). */
export function cameraForRect(pose: PlanePose, rect: ScreenRect, viewW: number, viewH: number, fov: number): Camera {
  const f = focalLength({ pos: pose.center, target: pose.center, fov }, viewH);
  const d = (pose.w * f) / rect.w;
  const n = norm(cross(pose.up, pose.right)); // toward the viewer for a front-facing plane
  const sx = rect.x + rect.w / 2 - viewW / 2;
  const sy = rect.y + rect.h / 2 - viewH / 2;
  // shift the camera so the plane's centre lands on the rect's centre
  const pos = add(add(add(pose.center, scale(n, d)), scale(pose.right, (-sx * d) / f)), scale(pose.up, (sy * d) / f));
  return { pos, target: sub(pos, n), fov };
}

// --- orientation interpolation (quaternions over the pose basis) -----------
type Quat = [number, number, number, number]; // x, y, z, w

function basisToQuat(r: Vec3, u: Vec3, n: Vec3): Quat {
  // columns r, u, n
  const m00 = r.x, m01 = u.x, m02 = n.x, m10 = r.y, m11 = u.y, m12 = n.y, m20 = r.z, m21 = u.z, m22 = n.z;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

function quatToBasis([x, y, z, w]: Quat): { r: Vec3; u: Vec3 } {
  return {
    r: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + z * w), z: 2 * (x * z - y * w) },
    u: { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) }
  };
}

function slerp(a: Quat, b: Quat, k: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Quat = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const o = a.map((v, i) => v + (bb[i] - v) * k) as Quat;
    const l = Math.hypot(...o);
    return o.map((v) => v / l) as Quat;
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - k) * th) / s;
  const wb = Math.sin(k * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb) as Quat;
}

/** Interpolate two poses: position and size linearly, orientation by slerp,
 *  so the plane turns rigidly instead of shearing through the move. */
export function lerpPose(a: PlanePose, b: PlanePose, k: number): PlanePose {
  const qa = basisToQuat(a.right, a.up, cross(a.right, a.up));
  const qb = basisToQuat(b.right, b.up, cross(b.right, b.up));
  const { r, u } = quatToBasis(slerp(qa, qb, k));
  return {
    center: { x: lerp(a.center.x, b.center.x, k), y: lerp(a.center.y, b.center.y, k), z: lerp(a.center.z, b.center.z, k) },
    right: norm(r),
    up: norm(u),
    w: lerp(a.w, b.w, k),
    h: lerp(a.h, b.h, k)
  };
}

/** An element's rectangle in the canvas's CSS px. */
export function elementRect(el: Element, canvas: Element): ScreenRect {
  const e = el.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  return { x: e.left - c.left, y: e.top - c.top, w: e.width, h: e.height };
}
