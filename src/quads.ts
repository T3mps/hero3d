// Perspective-correct quads. A ground-plane rectangle is drawn by projecting
// its 4 corners individually; all interior content (bands, rails, slots, text
// anchors) maps through 1/depth-weighted interpolation, which reproduces the
// exact projection of the corresponding plane point - plain bilinear blending
// sits low inside the trapezoid and slides as perspective changes.
import type { Vec3 } from './math.js';
import { type Camera, type Projected, project, projectPoly } from './camera.js';
import { drawImageWarped, type WarpOpts } from './imageWarp.js';

export interface Quad {
  fl: Projected; // far-left
  fr: Projected; // far-right
  nl: Projected; // near-left
  nr: Projected; // near-right
}

export interface QuadSize {
  cw: number;
  ch: number;
}

/** Project a quad's 4 world corners; null if any falls behind the near plane.
 *  All-or-nothing by contract: a quad the camera is flying through vanishes
 *  whole. Use quadFromCornersClipped when the fill should stay on screen. */
export const quadFromCorners = (
  cam: Camera,
  corners: { fl: Vec3; fr: Vec3; nl: Vec3; nr: Vec3 },
  viewW: number,
  viewH: number
): Quad | null => {
  const fl = project(cam, corners.fl, viewW, viewH);
  const fr = project(cam, corners.fr, viewW, viewH);
  const nl = project(cam, corners.nl, viewW, viewH);
  const nr = project(cam, corners.nr, viewW, viewH);
  if (!fl || !fr || !nl || !nr) return null;
  return { fl, fr, nl, nr };
};

export interface ClippedQuad {
  /** The visible outline, clipped at the near plane, in fl, fr, nr, nl winding.
   *  Fill it; it has 3 to 5 vertices. */
  poly: Projected[];
  /** The whole quad when no corner was clipped. Null when the near plane cut
   *  it: a clipped quad is no longer a quad, so the interior mapping
   *  (quadPoint, localPoint, plane text) is unavailable and the caller should
   *  skip anything mapped through it. */
  quad: Quad | null;
}

/** Project a quad's corners, clipped at the near plane instead of dropped:
 *  null only when the quad is entirely behind it. */
export const quadFromCornersClipped = (
  cam: Camera,
  corners: { fl: Vec3; fr: Vec3; nl: Vec3; nr: Vec3 },
  viewW: number,
  viewH: number
): ClippedQuad | null => {
  const quad = quadFromCorners(cam, corners, viewW, viewH);
  if (quad) return { poly: [quad.fl, quad.fr, quad.nr, quad.nl], quad };
  const poly = projectPoly(cam, [corners.fl, corners.fr, corners.nr, corners.nl], viewW, viewH);
  return poly.length >= 3 ? { poly, quad: null } : null;
};

// World-parameter t along a projected segment: screen coords are weighted
// by endpoint depths (x·z is linear in world space), depth itself linearly.
export const persp = (
  ax: number,
  ay: number,
  ad: number,
  bx: number,
  by: number,
  bd: number,
  t: number
): { x: number; y: number; d: number } => {
  const wa = (1 - t) * ad;
  const wb = t * bd;
  const w = wa + wb;
  return { x: (ax * wa + bx * wb) / w, y: (ay * wa + by * wb) / w, d: w };
};

/** Perspective-correct point on the quad: u 0->1 left->right, v 0->1 far->near. */
export const quadPoint = (q: Quad, u: number, v: number): { x: number; y: number } => {
  const top = persp(q.fl.x, q.fl.y, q.fl.depth, q.fr.x, q.fr.y, q.fr.depth, u);
  const bot = persp(q.nl.x, q.nl.y, q.nl.depth, q.nr.x, q.nr.y, q.nr.depth, u);
  return persp(top.x, top.y, top.d, bot.x, bot.y, bot.d, v);
};

/** Screen-px size of the quad (averaged far/near and left/right edge lengths). */
export const quadSize = (q: Quad): QuadSize => {
  const topW = Math.hypot(q.fr.x - q.fl.x, q.fr.y - q.fl.y);
  const botW = Math.hypot(q.nr.x - q.nl.x, q.nr.y - q.nl.y);
  const leftH = Math.hypot(q.nl.x - q.fl.x, q.nl.y - q.fl.y);
  const rightH = Math.hypot(q.nr.x - q.fr.x, q.nr.y - q.fr.y);
  return { cw: (topW + botW) / 2, ch: (leftH + rightH) / 2 };
};

// Cell-local px (centered, x right, y down; far at -ch/2, near at +ch/2) ->
// quad-space uv.
export const uvOf = (g: QuadSize, lx: number, ly: number) => ({
  u: (lx + g.cw / 2) / g.cw,
  v: (ly + g.ch / 2) / g.ch
});

export const localPoint = (q: Quad, g: QuadSize, lx: number, ly: number) => {
  const { u, v } = uvOf(g, lx, ly);
  return quadPoint(q, u, v);
};

export interface QuadPainter {
  fillQuad(q: Quad, u0: number, v0: number, u1: number, v1: number): void;
  strokeQuad(q: Quad, u0: number, v0: number, u1: number, v1: number): void;
  fillLocalRect(q: Quad, g: QuadSize, lx: number, ly: number, lw: number, lh: number): void;
  strokeLocalRect(q: Quad, g: QuadSize, lx: number, ly: number, lw: number, lh: number): void;
  addQuadPath(q: Quad, u0: number, v0: number, u1: number, v1: number): void;
  addLocalRectPath(q: Quad, g: QuadSize, lx: number, ly: number, lw: number, lh: number): void;
  drawCornerBrackets(quad: Quad, f: number, style: string, lw: number): void;
}

export function createQuadPainter(ctx: CanvasRenderingContext2D): QuadPainter {
  const fillQuad = (q: Quad, u0: number, v0: number, u1: number, v1: number) => {
    const a = quadPoint(q, u0, v0);
    const b = quadPoint(q, u1, v0);
    const c = quadPoint(q, u1, v1);
    const d = quadPoint(q, u0, v1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  };

  const strokeQuad = (q: Quad, u0: number, v0: number, u1: number, v1: number) => {
    const a = quadPoint(q, u0, v0);
    const b = quadPoint(q, u1, v0);
    const c = quadPoint(q, u1, v1);
    const d = quadPoint(q, u0, v1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.stroke();
  };

  const fillLocalRect = (q: Quad, g: QuadSize, lx: number, ly: number, lw: number, lh: number) => {
    const p0 = uvOf(g, lx, ly);
    const p1 = uvOf(g, lx + lw, ly + lh);
    fillQuad(q, p0.u, p0.v, p1.u, p1.v);
  };

  const strokeLocalRect = (q: Quad, g: QuadSize, lx: number, ly: number, lw: number, lh: number) => {
    const p0 = uvOf(g, lx, ly);
    const p1 = uvOf(g, lx + lw, ly + lh);
    strokeQuad(q, p0.u, p0.v, p1.u, p1.v);
  };

  // path-builders: append a quad / cell-local rect to the CURRENT path without
  // issuing a fill or stroke, so a whole batch shares one draw call.
  const addQuadPath = (q: Quad, u0: number, v0: number, u1: number, v1: number) => {
    const a = quadPoint(q, u0, v0);
    const b = quadPoint(q, u1, v0);
    const c = quadPoint(q, u1, v1);
    const d = quadPoint(q, u0, v1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
  };

  const addLocalRectPath = (q: Quad, g: QuadSize, lx: number, ly: number, lw: number, lh: number) => {
    const p0 = uvOf(g, lx, ly);
    const p1 = uvOf(g, lx + lw, ly + lh);
    addQuadPath(q, p0.u, p0.v, p1.u, p1.v);
  };

  // HUD corner brackets: short L's at each quad corner, drawn in quad space
  const drawCornerBrackets = (quad: Quad, f: number, style: string, lw: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = lw;
    const seg = (u0: number, v0: number, u1: number, v1: number) => {
      const p = quadPoint(quad, u0, v0);
      const q = quadPoint(quad, u1, v1);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    };
    const corners: [number, number, number, number][] = [
      [0, 0, 1, 1],
      [1, 0, -1, 1],
      [1, 1, -1, -1],
      [0, 1, 1, -1]
    ];
    for (const [u, v, du, dv] of corners) {
      seg(u, v, u + du * f, v);
      seg(u, v, u, v + dv * f);
    }
  };

  return { fillQuad, strokeQuad, fillLocalRect, strokeLocalRect, addQuadPath, addLocalRectPath, drawCornerBrackets };
}

/** Draw an image perspective-correctly onto the quad's uv rect [u0,u1]x[v0,v1]
 *  (default: the whole quad). */
export function drawImageOnQuad(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  q: Quad,
  opts: WarpOpts & { u0?: number; v0?: number; u1?: number; v1?: number } = {}
): void {
  const { u0 = 0, v0 = 0, u1 = 1, v1 = 1 } = opts;
  drawImageWarped(ctx, img, (u, v) => quadPoint(q, u0 + (u1 - u0) * u, v0 + (v1 - v0) * v), opts);
}
