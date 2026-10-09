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
// on-screen pixels and only ever downsampled (bilinear: the lifecycle keeps
// imageSmoothingQuality at 'low' on purpose, see lifecycle.ts) - never
// upscaled in the common range. Small labels bake small (cheap); only
// the few large ones bake large. The cache is capped for memory and evicts the least recently used label. Colour is
// baked solid; the per-call alpha rides globalAlpha.
//
// Every draw call accepts an optional `font` (a CSS font-family list) so one
// painter can serve several faces - a UI face, a brand face, an icon font -
// without one painter per face; the family is part of the cache key. The
// default is the painter-level `opts.font` (required: a CSS font-family list).
import { type Quad, type QuadSize, localPoint } from './quads.js';
import { fontShorthand } from './text.js';

export const TEXT_MIN = 0.5; // px: below this a glyph rasterizes to nothing - skip the call

type Pt = { x: number; y: number };

export interface GlyphPainter {
  drawText(label: string, x: number, y: number, px: number, font?: string): void;
  planeGlyphs(o: Pt, exv: Pt, eyv: Pt, px: number, label: string, font?: string): void;
  planeText(q: Quad, g: QuadSize, lx: number, ly: number, px: number, label: string, font?: string): void;
  /** An image lying IN a plane: top-left at screen anchor `o`, `w`x`h` in the
   *  plane's local units (the units `exv`/`eyv` are the screen images of). */
  planeImage(o: Pt, exv: Pt, eyv: Pt, img: CanvasImageSource, w: number, h: number): void;
  /** Drop every baked label. Call once webfonts finish loading so labels that
   *  baked with a fallback face get re-baked with the real one. */
  clearCache(): void;
}

export function createGlyphPainter(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  opts: { font: string; cacheCap?: number }
): GlyphPainter {
  const defaultFont = opts.font;
  const GLYPH_CAP = opts.cacheCap ?? 384;

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
  // ctx.fillStyle reads back in the canvas's canonical serialization: opaque
  // colours as '#rrggbb', translucent ones as 'rgba(r, g, b, a)'. Accept both
  // (a hex fill used to parse as nothing and skip the draw).
  const fillRe = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/;
  const hexRe = /^#([0-9a-f]{6})$/i;
  const parseFill = (style: string | CanvasGradient | CanvasPattern) => {
    if (typeof style !== 'string') return null;
    const h = hexRe.exec(style);
    if (h) {
      const n = parseInt(h[1], 16);
      return { rgb: `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`, a: 1 };
    }
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
    bake: number,
    font: string
  ) => {
    const key = `${rgb}|${align}|${baseline}|${bake}|${text}|${font}`;
    const hit = glyphCache.get(key);
    if (hit !== undefined) {
      // LRU: re-insert on every hit (a Map iterates in insertion order), so
      // eviction below takes the least recently USED label - a label drawn
      // every frame is never the one re-baked during a long camera move.
      glyphCache.delete(key);
      glyphCache.set(key, hit);
      return hit;
    }
    if (!bakeCtx) return null;
    const fontSpec = fontShorthand(bake, font); // a font may lead with its weight/style
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

  const drawText = (label: string, x: number, y: number, px: number, font: string = defaultFont) => {
    if (px < TEXT_MIN) return;
    const col = parseFill(ctx.fillStyle);
    if (!col) return;
    const bake = bakeBucket(px);
    const bmp = glyphBitmap(label, col.rgb, ctx.textAlign, ctx.textBaseline, bake, font);
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
  const planeGlyphs = (o: Pt, exv: Pt, eyv: Pt, px: number, label: string, font: string = defaultFont) => {
    if (px < TEXT_MIN) return;
    const col = parseFill(ctx.fillStyle);
    if (!col) return;
    const bake = bakeBucket(px);
    const bmp = glyphBitmap(label, col.rgb, ctx.textAlign, ctx.textBaseline, bake, font);
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
  const planeText = (q: Quad, g: QuadSize, lx: number, ly: number, px: number, label: string, font: string = defaultFont) => {
    const o = localPoint(q, g, lx, ly);
    const ex = localPoint(q, g, lx + 1, ly);
    const ey = localPoint(q, g, lx, ly + 1);
    planeGlyphs(o, { x: ex.x - o.x, y: ex.y - o.y }, { x: ey.x - o.x, y: ey.y - o.y }, px, label, font);
  };

  // Same shear as planeGlyphs, applied to an image: one local unit along +x
  // maps to exv, along +y to eyv, so `w`/`h` are in local units.
  const planeImage = (o: Pt, exv: Pt, eyv: Pt, img: CanvasImageSource, w: number, h: number) => {
    ctx.save();
    ctx.transform(exv.x, exv.y, eyv.x, eyv.y, o.x, o.y);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  };

  const clearCache = () => {
    glyphCache.clear();
  };

  return { drawText, planeGlyphs, planeText, planeImage, clearCache };
}
