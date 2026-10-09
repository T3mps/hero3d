// Perspective-correct images on planes. Canvas 2D can only draw an image
// through an affine transform, which maps a rectangle to a parallelogram: fine
// for a label, visibly wrong for a screenshot on a steeply tilted plane (the
// image no longer meets the plane's edges). So the image is cut into a grid of
// triangles, each drawn with the affine map that is exact at its corners, and
// the grid is refined until the worst error inside a cell is under a
// tolerance in screen px: a frontal plane is one cell, a raking one a few dozen.

type P = { x: number; y: number };

export interface WarpOpts {
  /** Max screen-px error inside a cell before it is split. Default 0.5. */
  tolerance?: number;
  /** Cap on cells per side. Default 32. */
  maxDivisions?: number;
  /** Every clip triangle's edges are pushed out by this many screen px so
   *  neighbours overlap and no hairline seams show (Skia's clip antialiasing
   *  ramps over more than a pixel). Default 1.5. With globalAlpha < 1 the image
   *  is drawn opaque into a scratch layer and composited once, so the overlap
   *  never double-blends. */
  seam?: number;
}

/** The pixel size of anything drawImage accepts. */
export function sourceSize(img: CanvasImageSource): { w: number; h: number } {
  const o = img as Partial<HTMLImageElement & HTMLVideoElement & { displayWidth: number; displayHeight: number }>;
  const w = o.naturalWidth || o.videoWidth || o.displayWidth || (o.width as number) || 0;
  const h = o.naturalHeight || o.videoHeight || o.displayHeight || (o.height as number) || 0;
  return { w: typeof w === 'number' ? w : 0, h: typeof h === 'number' ? h : 0 };
}

/** How many cells per side bring the affine error under `tol` for this map. */
export function warpDivisions(map: (u: number, v: number) => P, tol = 0.5, max = 32): number {
  let n = 1;
  while (n < max) {
    let worst = 0;
    for (let j = 0; j < n && worst <= tol; j += 1) {
      for (let i = 0; i < n && worst <= tol; i += 1) {
        const u0 = i / n, v0 = j / n, u1 = (i + 1) / n, v1 = (j + 1) / n;
        const a = map(u0, v0), c = map(u1, v1);
        const mid = map((u0 + u1) / 2, (v0 + v1) / 2);
        // the cell centre sits on the shared diagonal: affine puts it halfway
        worst = Math.max(worst, Math.hypot(mid.x - (a.x + c.x) / 2, mid.y - (a.y + c.y) / 2));
        // and an edge midpoint
        const b = map(u1, v0), e = map((u0 + u1) / 2, v0);
        worst = Math.max(worst, Math.hypot(e.x - (a.x + b.x) / 2, e.y - (a.y + b.y) / 2));
      }
    }
    if (worst <= tol) break;
    n *= 2;
  }
  return Math.min(n, max);
}

/** Push every edge of a triangle outward by `by` px (a true offset, so long
 *  edges of skinny triangles move as much as short ones), with the corner
 *  movement capped at 4x `by` so acute corners do not spike. */
export const growTriangle = (pts: readonly P[], by: number): P[] => {
  if (by <= 0) return pts.slice();
  const cx = (pts[0].x + pts[1].x + pts[2].x) / 3;
  const cy = (pts[0].y + pts[1].y + pts[2].y) / 3;
  const normals = pts.map((a, i) => {
    const b = pts[(i + 1) % 3];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = (b.y - a.y) / len, ny = -(b.x - a.x) / len;
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny };
  });
  return pts.map((p, i) => {
    // vertex i joins edge i-1 and edge i: the miter of their two offsets
    const n0 = normals[(i + 2) % 3], n1 = normals[i];
    const k = by / Math.max(0.25, 1 + n0.x * n1.x + n0.y * n1.y);
    let mx = (n0.x + n1.x) * k, my = (n0.y + n1.y) * k;
    const m = Math.hypot(mx, my);
    if (m > by * 4) { mx *= (by * 4) / m; my *= (by * 4) / m; }
    return { x: p.x + mx, y: p.y + my };
  });
};

/** Draw the source triangle `s` (image px) onto the screen triangle `d`. */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s: [P, P, P],
  d: [P, P, P],
  crop: { x: number; y: number; w: number; h: number },
  seam: number
) {
  const e1x = s[1].x - s[0].x, e1y = s[1].y - s[0].y, e2x = s[2].x - s[0].x, e2y = s[2].y - s[0].y;
  const det = e1x * e2y - e2x * e1y;
  if (Math.abs(det) < 1e-12) return;
  const f1x = d[1].x - d[0].x, f1y = d[1].y - d[0].y, f2x = d[2].x - d[0].x, f2y = d[2].y - d[0].y;
  // L = F * E^-1
  const a = (f1x * e2y - f2x * e1y) / det;
  const b = (f1y * e2y - f2y * e1y) / det;
  const c = (f2x * e1x - f1x * e2x) / det;
  const dd = (f2y * e1x - f1y * e2x) / det;
  const e = d[0].x - a * s[0].x - c * s[0].y;
  const f = d[0].y - b * s[0].x - dd * s[0].y;
  const clip = growTriangle(d, seam);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(clip[0].x, clip[0].y);
  ctx.lineTo(clip[1].x, clip[1].y);
  ctx.lineTo(clip[2].x, clip[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, crop.x, crop.y, crop.w, crop.h);
  ctx.restore();
}

/** Draw `img` (or its `src` rect) so that image point (u, v) in [0,1]^2 lands on
 *  `map(u, v)`. `map` is any projective map: a quad's quadPoint, a panel rect. */
export function drawImageWarped(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  map: (u: number, v: number) => P,
  opts: WarpOpts & { src?: { x: number; y: number; w: number; h: number } } = {}
): void {
  const size = sourceSize(img);
  const src = opts.src ?? { x: 0, y: 0, w: size.w, h: size.h };
  if (!(src.w > 0 && src.h > 0)) return;
  const n = warpDivisions(map, opts.tolerance ?? 0.5, opts.maxDivisions ?? 32);
  const seam = opts.seam ?? 1.5;
  const pts: P[][] = [];
  for (let j = 0; j <= n; j += 1) {
    const row: P[] = [];
    for (let i = 0; i <= n; i += 1) row.push(map(i / n, j / n));
    pts.push(row);
  }
  // Translucent: the seam overlap would double-blend, so draw opaque into a
  // scratch layer covering the image's device-px bounds, then composite that
  // once at the context's alpha (and through its clip).
  if (ctx.globalAlpha < 1 && seam > 0 && n > 1 && typeof ctx.getTransform === 'function') {
    const m = ctx.getTransform();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const row of pts)
      for (const p of row) {
        const dx = m.a * p.x + m.c * p.y + m.e, dy = m.b * p.x + m.d * p.y + m.f;
        x0 = Math.min(x0, dx); y0 = Math.min(y0, dy); x1 = Math.max(x1, dx); y1 = Math.max(y1, dy);
      }
    const cv = ctx.canvas as { width: number; height: number } | undefined;
    x0 = Math.max(0, Math.floor(x0 - seam - 1));
    y0 = Math.max(0, Math.floor(y0 - seam - 1));
    x1 = Math.min(cv?.width ?? x1 + seam + 1, Math.ceil(x1 + seam + 1));
    y1 = Math.min(cv?.height ?? y1 + seam + 1, Math.ceil(y1 + seam + 1));
    const layer = scratch(ctx, x1 - x0, y1 - y0);
    if (layer && x1 > x0 && y1 > y0) {
      layer.setTransform(1, 0, 0, 1, 0, 0);
      layer.clearRect(0, 0, x1 - x0, y1 - y0);
      layer.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
      layer.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
      layer.imageSmoothingQuality = ctx.imageSmoothingQuality;
      drawCells(layer as unknown as CanvasRenderingContext2D, img, src, pts, n, seam);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer.canvas as CanvasImageSource, 0, 0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      return;
    }
  }
  drawCells(ctx, img, src, pts, n, seam);
}

type Scratch = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const scratches = new WeakMap<object, Scratch>();
/** A reusable scratch 2D context (one per target context), at least w x h. */
function scratch(owner: object, w: number, h: number): Scratch | null {
  let s = scratches.get(owner);
  if (!s) {
    const c: OffscreenCanvas | HTMLCanvasElement | null =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : typeof document !== 'undefined' ? document.createElement('canvas') : null;
    s = (c?.getContext('2d') as Scratch | null) ?? undefined;
    if (!s) return null;
    scratches.set(owner, s);
  }
  if (s.canvas.width < w || s.canvas.height < h) {
    s.canvas.width = Math.max(s.canvas.width, w);
    s.canvas.height = Math.max(s.canvas.height, h);
  }
  return s;
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  src: { x: number; y: number; w: number; h: number },
  pts: P[][],
  n: number,
  seam: number
) {
  const cw = src.w / n, ch = src.h / n;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x0 = src.x + i * cw, y0 = src.y + j * ch, x1 = x0 + cw, y1 = y0 + ch;
      const s00 = { x: x0, y: y0 }, s10 = { x: x1, y: y0 }, s11 = { x: x1, y: y1 }, s01 = { x: x0, y: y1 };
      const d00 = pts[j][i], d10 = pts[j][i + 1], d11 = pts[j + 1][i + 1], d01 = pts[j + 1][i];
      // The drawn image piece has antialiased edges of its own, so it must
      // reach past the (grown) clip by a couple of screen px: pad the crop by
      // that much in source px, from this cell's source-per-screen ratio.
      const ratio = Math.max(cw / (Math.hypot(d10.x - d00.x, d10.y - d00.y) || 1), ch / (Math.hypot(d01.x - d00.x, d01.y - d00.y) || 1));
      const pad = Math.ceil((seam + 2) * ratio) + 1;
      const crop = {
        x: Math.max(src.x, Math.floor(x0) - pad),
        y: Math.max(src.y, Math.floor(y0) - pad),
        w: 0,
        h: 0
      };
      crop.w = Math.min(src.x + src.w, Math.ceil(x1) + pad) - crop.x;
      crop.h = Math.min(src.y + src.h, Math.ceil(y1) + pad) - crop.y;
      drawTriangle(ctx, img, [s00, s10, s11], [d00, d10, d11], crop, seam);
      drawTriangle(ctx, img, [s00, s11, s01], [d00, d11, d01], crop, seam);
    }
  }
}
