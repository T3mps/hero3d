// A list of world planes ready to paint: projected with near-plane clipping,
// culled when off screen (and optionally when seen from behind), faded with
// depth, and sorted back to front so nearer planes paint over farther ones.
// The bookkeeping every multi-plane hero otherwise writes for itself.
import { type Camera, type Projected, cameraBasis } from './camera.js';
import { type DepthFade, depthFade } from './effects.js';
import { dot, sub, type Vec3 } from './math.js';
import { type Quad, quadFromCornersClipped } from './quads.js';

export interface Corners {
  fl: Vec3;
  fr: Vec3;
  nl: Vec3;
  nr: Vec3;
}

export interface SortedPlane<T> {
  item: T;
  /** The whole quad, or null when the near plane clipped it (fill `poly`, skip text). */
  quad: Quad | null;
  /** The visible outline, fl -> fr -> nr -> nl winding. */
  poly: Projected[];
  /** Mean camera-space depth of the corners: the sort key. */
  depth: number;
  /** depthFade at that depth, or 1 without a fade. */
  alpha: number;
  /** Whether the plane faces the camera. */
  facing: boolean;
}

export interface SortOpts {
  fade?: DepthFade;
  /** Drop planes seen from behind. Default false. */
  cullBackfaces?: boolean;
  /** Keep planes whose outline is within this many px of the view. Default 0;
   *  Infinity keeps everything in front of the camera. */
  margin?: number;
}

const signedArea = (pts: { x: number; y: number }[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i], n = pts[(i + 1) % pts.length];
    a += p.x * n.y - n.x * p.y;
  }
  return a / 2;
};

export function sortPlanes<T>(
  cam: Camera,
  items: readonly T[],
  cornersOf: (item: T) => Corners,
  viewW: number,
  viewH: number,
  opts: SortOpts = {}
): SortedPlane<T>[] {
  const { fwd } = cameraBasis(cam);
  const margin = opts.margin ?? 0;
  const out: SortedPlane<T>[] = [];
  for (const item of items) {
    const c = cornersOf(item);
    const clipped = quadFromCornersClipped(cam, c, viewW, viewH);
    if (!clipped) continue;
    const { poly } = clipped;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    if (x1 < -margin || y1 < -margin || x0 > viewW + margin || y0 > viewH + margin) continue;
    const facing = signedArea(poly) > 0;
    if (opts.cullBackfaces && !facing) continue;
    const depth = (dot(sub(c.fl, cam.pos), fwd) + dot(sub(c.fr, cam.pos), fwd) + dot(sub(c.nl, cam.pos), fwd) + dot(sub(c.nr, cam.pos), fwd)) / 4;
    out.push({ item, quad: clipped.quad, poly, depth, alpha: opts.fade ? depthFade(depth, opts.fade) : 1, facing });
  }
  return out.sort((a, b) => b.depth - a.depth);
}
