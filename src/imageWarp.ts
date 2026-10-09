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
  /** Clip triangles are grown by this many screen px so neighbours overlap and
   *  no hairline seams show. Default 0.5; use 0 for translucent images (the
   *  overlap would double-blend). */
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

const grow = (pts: P[], by: number): P[] => {
  if (by <= 0) return pts;
  const cx = (pts[0].x + pts[1].x + pts[2].x) / 3;
  const cy = (pts[0].y + pts[1].y + pts[2].y) / 3;
  return pts.map((p) => {
    const d = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: cx + (p.x - cx) * (1 + by / d), y: cy + (p.y - cy) * (1 + by / d) };
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
  const clip = grow(d, seam);
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
  const seam = opts.seam ?? 0.5;
  const pts: P[][] = [];
  for (let j = 0; j <= n; j += 1) {
    const row: P[] = [];
    for (let i = 0; i <= n; i += 1) row.push(map(i / n, j / n));
    pts.push(row);
  }
  const cw = src.w / n, ch = src.h / n;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x0 = src.x + i * cw, y0 = src.y + j * ch, x1 = x0 + cw, y1 = y0 + ch;
      // one source px of padding so bilinear filtering at the cell edge has its neighbours
      const crop = {
        x: Math.max(src.x, Math.floor(x0) - 1),
        y: Math.max(src.y, Math.floor(y0) - 1),
        w: 0,
        h: 0
      };
      crop.w = Math.min(src.x + src.w, Math.ceil(x1) + 1) - crop.x;
      crop.h = Math.min(src.y + src.h, Math.ceil(y1) + 1) - crop.y;
      const s00 = { x: x0, y: y0 }, s10 = { x: x1, y: y0 }, s11 = { x: x1, y: y1 }, s01 = { x: x0, y: y1 };
      const d00 = pts[j][i], d10 = pts[j][i + 1], d11 = pts[j + 1][i + 1], d01 = pts[j + 1][i];
      drawTriangle(ctx, img, [s00, s10, s11], [d00, d10, d11], crop, seam);
      drawTriangle(ctx, img, [s00, s11, s01], [d00, d11, d01], crop, seam);
    }
  }
}
