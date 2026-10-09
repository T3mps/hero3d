// Plane painter: 2D-UI primitives drawn onto a projected hero3d quad, in
// "plane pixels" (a logical resolution the caller picks, e.g. 1280x720, y
// down). Rects and polygons are perspective-correct through quads.ts;
// text, icons and images ride the glyph painter's plane shear. Domain-
// agnostic: an editor screen, a HUD, a poster - anything flat on a plane.
import { type Quad, type QuadSize, type QuadPainter, localPoint } from './quads.js';
import type { GlyphPainter } from './glyphs.js';
import { quadUv } from './homography.js';

export interface PanelRect { x: number; y: number; w: number; h: number }
export interface PanelPoint { x: number; y: number }
export interface TextOpts {
  font?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  color?: string; // '#rrggbb' or 'rgb()/rgba()'
  alpha?: number;
}

export interface Panel {
  /** quad-local px per plane px */
  readonly scale: number;
  toScreen(x: number, y: number): PanelPoint;
  /** The inverse: which plane px a screen point (e.g. the pointer) is over, and
   *  whether it lies on the panel. Null if the plane is edge-on. */
  fromScreen(x: number, y: number): (PanelPoint & { inside: boolean }) | null;
  fillRect(x: number, y: number, w: number, h: number, style: string): void;
  /** Fill a plane rect with a radial gradient centred on a plane point; the
   *  gradient is built in screen space from the projected centre and radius. */
  fillRectRadial(r: PanelRect, center: PanelPoint, radius: number, stops: [number, string][]): void;
  strokeRect(x: number, y: number, w: number, h: number, style: string, lineWidth?: number): void;
  fillPoly(points: PanelPoint[], style: string): void;
  line(x0: number, y0: number, x1: number, y1: number, style: string, lineWidth?: number): void;
  clipRect(r: PanelRect, fn: () => void): void;
  text(x: number, y: number, px: number, label: string, opts?: TextOpts): void;
  icon(x: number, y: number, px: number, codepoint: number, opts?: TextOpts): void;
  image(img: CanvasImageSource, x: number, y: number, w: number, h: number, alpha?: number): void;
}

export interface PanelPainterDeps {
  ctx: CanvasRenderingContext2D;
  glyphs: GlyphPainter;
  quads: QuadPainter;
  uiFont: string;
  iconFont: string;
}

export interface PanelPainter {
  panelFor(q: Quad, sz: QuadSize, logicalW: number, logicalH: number): Panel;
}

// Normalises shorthand and full hex to one canonical form for callers and
// tests; the glyph painter itself parses both hex and rgb()/rgba(), so this is
// about a single predictable fillStyle, not about what it can read.
export const toRgb = (color: string): string => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
};

export function createPanelPainter(deps: PanelPainterDeps): PanelPainter {
  const { ctx, glyphs, quads } = deps;
  return {
    panelFor(q, sz, logicalW, logicalH) {
      const s = sz.cw / logicalW;
      const toLocal = (x: number, y: number) => ({ lx: (x - logicalW / 2) * s, ly: (y - logicalH / 2) * s });
      const toScreen = (x: number, y: number): PanelPoint => {
        const { lx, ly } = toLocal(x, y);
        return localPoint(q, sz, lx, ly);
      };
      // screen anchor + screen images of one plane-px step along +x / +y
      const basis = (x: number, y: number) => {
        const o = toScreen(x, y);
        const ex = toScreen(x + 1, y);
        const ey = toScreen(x, y + 1);
        return { o, exv: { x: ex.x - o.x, y: ex.y - o.y }, eyv: { x: ey.x - o.x, y: ey.y - o.y } };
      };
      const screenLineWidth = (x: number, y: number, lw: number) => {
        const { exv } = basis(x, y);
        return Math.max(0.5, lw * Math.hypot(exv.x, exv.y));
      };

      const fillRect: Panel['fillRect'] = (x, y, w, h, style) => {
        const { lx, ly } = toLocal(x, y);
        ctx.fillStyle = style;
        quads.fillLocalRect(q, sz, lx, ly, w * s, h * s);
      };
      const fillRectRadial: Panel['fillRectRadial'] = (r, center, radius, stops) => {
        const c = toScreen(center.x, center.y);
        const { exv } = basis(center.x, center.y);
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(1, radius * Math.hypot(exv.x, exv.y)));
        for (const [k, color] of stops) g.addColorStop(k, color);
        const { lx, ly } = toLocal(r.x, r.y);
        ctx.fillStyle = g;
        quads.fillLocalRect(q, sz, lx, ly, r.w * s, r.h * s);
      };
      const strokeRect: Panel['strokeRect'] = (x, y, w, h, style, lineWidth = 1) => {
        const { lx, ly } = toLocal(x, y);
        ctx.strokeStyle = style;
        ctx.lineWidth = screenLineWidth(x, y, lineWidth);
        quads.strokeLocalRect(q, sz, lx, ly, w * s, h * s);
      };
      const fillPoly: Panel['fillPoly'] = (points, style) => {
        if (points.length < 3) return;
        ctx.fillStyle = style;
        ctx.beginPath();
        points.forEach((p, i) => {
          const sp = toScreen(p.x, p.y);
          if (i === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        });
        ctx.closePath();
        ctx.fill();
      };
      const line: Panel['line'] = (x0, y0, x1, y1, style, lineWidth = 1) => {
        const a = toScreen(x0, y0);
        const b = toScreen(x1, y1);
        ctx.strokeStyle = style;
        ctx.lineWidth = screenLineWidth(x0, y0, lineWidth);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };
      const clipRect: Panel['clipRect'] = (r, fn) => {
        const { lx, ly } = toLocal(r.x, r.y);
        ctx.save();
        ctx.beginPath();
        quads.addLocalRectPath(q, sz, lx, ly, r.w * s, r.h * s);
        ctx.clip();
        try {
          fn();
        } finally {
          ctx.restore();
        }
      };
      const text: Panel['text'] = (x, y, px, label, opts = {}) => {
        const { o, exv, eyv } = basis(x, y);
        const exl = Math.hypot(exv.x, exv.y);
        if (px * exl < 0.5) return;
        ctx.save();
        ctx.fillStyle = toRgb(opts.color ?? '#e0e0e0');
        if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
        ctx.textAlign = opts.align ?? 'left';
        ctx.textBaseline = opts.baseline ?? 'alphabetic';
        glyphs.planeGlyphs(o, exv, eyv, px * exl, label, opts.font ?? deps.uiFont);
        ctx.restore();
      };
      const icon: Panel['icon'] = (x, y, px, codepoint, opts = {}) =>
        text(x, y, px, String.fromCodePoint(codepoint), { ...opts, font: deps.iconFont });
      const image: Panel['image'] = (img, x, y, w, h, alpha = 1) => {
        const { o, exv, eyv } = basis(x, y);
        ctx.save();
        ctx.globalAlpha *= alpha;
        glyphs.planeImage(o, exv, eyv, img, w, h);
        ctx.restore();
      };
      const fromScreen: Panel['fromScreen'] = (x, y) => {
        const hit = quadUv(q, x, y);
        if (!hit) return null;
        const px = { x: (hit.u * sz.cw - sz.cw / 2) / s + logicalW / 2, y: (hit.v * sz.ch - sz.ch / 2) / s + logicalH / 2 };
        return { ...px, inside: px.x >= 0 && px.x <= logicalW && px.y >= 0 && px.y <= logicalH };
      };
      return { scale: s, toScreen, fromScreen, fillRect, fillRectRadial, strokeRect, fillPoly, line, clipRect, text, icon, image };
    }
  };
}
