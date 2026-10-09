// Plane <-> screen homographies. A plane seen through a pinhole camera maps to
// the screen by a projective transform (a 3x3 homography), so the four
// projected corners of a quad pin it down completely. Forward, it is exactly
// quads.ts's quadPoint; inverted, it turns a pointer position back into a
// position on the plane (hit-testing); embedded in a CSS matrix3d it pins real
// DOM onto the plane (domPlane.ts). Pure.
import type { Quad } from './quads.js';

type P = { x: number; y: number };

/** Row-major 3x3: x' = (m0 x + m1 y + m2) / (m6 x + m7 y + m8), y' likewise with m3..m5. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** The homography taking the unit square onto a quad: (0,0) -> p0, (1,0) -> p1,
 *  (1,1) -> p2, (0,1) -> p3 (Heckbert's square-to-quad). Null if degenerate. */
export function squareToQuad(p0: P, p1: P, p2: P, p3: P): Mat3 | null {
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1
  ];
}

export function multiply3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o as unknown as Mat3;
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k
  ];
}

/** Apply a homography; null where the point maps to infinity. */
export function applyHomography(m: Mat3, x: number, y: number): P | null {
  const w = m[6] * x + m[7] * y + m[8];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** uv (u 0->1 left->right, v 0->1 far->near) -> screen, for a projected quad.
 *  Identical to quadPoint, as a matrix. */
export const quadHomography = (q: Quad): Mat3 | null => squareToQuad(q.fl, q.fr, q.nr, q.nl);

/** A w x h box (x right, y down, origin top-left) -> the quad on screen. */
export function rectToQuad(w: number, h: number, q: Quad): Mat3 | null {
  const H = quadHomography(q);
  return H && multiply3(H, [1 / w, 0, 0, 0, 1 / h, 0, 0, 0, 1]);
}

export interface QuadHit {
  u: number;
  v: number;
  /** Whether (u, v) lies inside the quad (0..1 on both axes). */
  inside: boolean;
}

/** The inverse of quadPoint: where on the quad a screen point lies. Null when
 *  the quad is degenerate or the point is on its vanishing line. */
export function quadUv(q: Quad, x: number, y: number): QuadHit | null {
  const H = quadHomography(q);
  const inv = H && invert3(H);
  const uv = inv && applyHomography(inv, x, y);
  if (!uv) return null;
  return { u: uv.x, v: uv.y, inside: uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1 };
}
