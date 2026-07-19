// Baked-label text for hero canvases.
//
// Labels are the hot path. Text lying IN a 3D plane carries a rotation +
// foreshorten transform on every draw - which defeats the browser's glyph
// cache, forcing ctx.fillText to re-rasterise each glyph from scratch every
// frame. Cheap when tiles are tiny/far, but at a close-up the large sheared
// labels cost tens of ms and drop the frame rate ~10x.
//
// So each label is baked ONCE to an offscreen canvas, then blitted through the
// same transform: a cached image draw the GPU handles fast at any shear. For
// crispness, the bake resolution is BUCKETED to the size the label occupies on
// the device (px x DPR x a supersample factor), so it's baked at or above its
// on-screen pixels and only ever downsampled - with high-quality smoothing -
// never upscaled in the common range. Small labels bake small (cheap); only
// the few large ones bake large. The cache is capped for memory. Colour is
// baked solid; the per-call alpha rides globalAlpha.
import { type Quad, type QuadSize, localPoint } from './quads';

export const TEXT_MIN = 0.5; // px: below this a glyph rasterizes to nothing - skip the call

export interface GlyphPainter {
  drawText(label: string, x: number, y: number, px: number): void;
  planeGlyphs(
    o: { x: number; y: number },
    exv: { x: number; y: number },
    eyv: { x: number; y: number },
    px: number,
    label: string
  ): void;
  planeText(q: Quad, g: QuadSize, lx: number, ly: number, px: number, label: string): void;
}

export function createGlyphPainter(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  opts?: { font?: string }
): GlyphPainter {
  const font = opts?.font ?? '"Space Mono", monospace';

  const bakeCtx = (() => {
    const c = document.createElement('canvas');
    return c.getContext('2d');
  })();
  const BAKE_BUCKETS = [16, 24, 32, 48, 64, 96, 128, 192, 256];
  const bakeBucket = (px: number) => {
    const target = px * Math.min(dpr, 2) * 1.5; // device px x supersample
    for (const b of BAKE_BUCKETS) if (b >= target) return b;
    return BAKE_BUCKETS[BAKE_BUCKETS.length - 1];
  };
  const glyphCache = new Map<string, { cv: HTMLCanvasElement; ax: number; ay: number } | null>();
  const GLYPH_CAP = 384;
  const fillRe = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/;
  const parseFill = (style: string | CanvasGradient | CanvasPattern) => {
    if (typeof style !== 'string') return null;
    const m = fillRe.exec(style);
    if (!m) return null;
    return { rgb: `${m[1]},${m[2]},${m[3]}`, a: m[4] === undefined ? 1 : parseFloat(m[4]) };
  };
  // baked label bitmap at `bake` px; `ax,ay` is the fillText origin's position
  // inside it, so blitting at (-ax,-ay) reproduces fillText(text, 0, 0)
  const glyphBitmap = (
    text: string,
    rgb: string,
    align: CanvasTextAlign,
    baseline: CanvasTextBaseline,
    bake: number
  ) => {
    const key = `${rgb}|${align}|${baseline}|${bake}|${text}`;
    const hit = glyphCache.get(key);
    if (hit !== undefined) return hit;
    if (!bakeCtx) return null;
    const fontSpec = `${bake}px ${font}`;
    bakeCtx.font = fontSpec;
    bakeCtx.textAlign = align;
    bakeCtx.textBaseline = baseline;
    const m = bakeCtx.measureText(text);
    const left = Math.ceil((m.actualBoundingBoxLeft ?? 0) + 2);
    const right = Math.ceil((m.actualBoundingBoxRight ?? m.width) + 2);
    const asc = Math.ceil((m.actualBoundingBoxAscent ?? bake * 0.8) + 2);
    const desc = Math.ceil((m.actualBoundingBoxDescent ?? bake * 0.3) + 2);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, left + right);
    cv.height = Math.max(1, asc + desc);
    const g = cv.getContext('2d');
    if (!g) {
      glyphCache.set(key, null);
      return null;
    }
    g.font = fontSpec;
    g.textAlign = align;
    g.textBaseline = baseline;
    g.fillStyle = `rgb(${rgb})`;
    g.fillText(text, left, asc);
    const entry = { cv, ax: left, ay: asc };
    glyphCache.set(key, entry);
    if (glyphCache.size > GLYPH_CAP) {
      const oldest = glyphCache.keys().next().value;
      if (oldest !== undefined) glyphCache.delete(oldest);
    }
    return entry;
  };

  const drawText = (label: string, x: number, y: number, px: number) => {
    if (px < TEXT_MIN) return;
    const col = parseFill(ctx.fillStyle);
    if (!col) return;
    const bake = bakeBucket(px);
    const bmp = glyphBitmap(label, col.rgb, ctx.textAlign, ctx.textBaseline, bake);
    if (!bmp) return;
    const s = px / bake;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha *= col.a;
    ctx.drawImage(bmp.cv, -bmp.ax, -bmp.ay);
    ctx.restore();
  };

  // Text lying IN a plane instead of facing the camera. Given the screen
  // anchor `o` and the screen images of the plane's local +x and +y steps
  // (exv, eyv), shear the glyphs onto the plane so they rotate and foreshorten
  // with it. px is the em height in screen px measured along the +x step.
  const planeGlyphs = (
    o: { x: number; y: number },
    exv: { x: number; y: number },
    eyv: { x: number; y: number },
    px: number,
    label: string
  ) => {
    if (px < TEXT_MIN) return;
    const col = parseFill(ctx.fillStyle);
    if (!col) return;
    const bake = bakeBucket(px);
    const bmp = glyphBitmap(label, col.rgb, ctx.textAlign, ctx.textBaseline, bake);
    if (!bmp) return;
    const exl = Math.hypot(exv.x, exv.y) || 1;
    const s = px / bake / exl;
    ctx.save();
    ctx.transform(exv.x * s, exv.y * s, eyv.x * s, eyv.y * s, o.x, o.y);
    ctx.globalAlpha *= col.a;
    ctx.drawImage(bmp.cv, -bmp.ax, -bmp.ay);
    ctx.restore();
  };

  // Plane text anchored in a quad's local space: baseline follows the plane's
  // local +x, foreshortened along local +y, so labels read as printed on the
  // surface rather than billboarded toward the camera.
  const planeText = (q: Quad, g: QuadSize, lx: number, ly: number, px: number, label: string) => {
    const o = localPoint(q, g, lx, ly);
    const ex = localPoint(q, g, lx + 1, ly);
    const ey = localPoint(q, g, lx, ly + 1);
    planeGlyphs(o, { x: ex.x - o.x, y: ex.y - o.y }, { x: ey.x - o.x, y: ey.y - o.y }, px, label);
  };

  return { drawText, planeGlyphs, planeText };
}
