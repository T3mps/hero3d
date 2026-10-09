// Screens described as data. A UI screen on a plane - an editor, a dashboard,
// a phone - is a small tree of boxes, text, icons and images instead of a page
// of imperative draw calls: layoutScreen places it (a single-pass flex-like
// model: rows, columns, gaps, padding, grow, align, justify, plus absolutely
// positioned children), paintScreen draws it on a Panel in plane px, and
// hitTest finds the node under a point for hover and click. figma.ts turns a
// Figma frame into the same tree.
import type { Panel, PanelPoint } from './panel.js';
import { layoutSpans, type TextSpan } from './text.js';

export type Insets = number | readonly [number, number, number, number]; // top right bottom left

interface Common {
  id?: string;
  /** Absolute offset inside a `direction: 'none'` parent. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Share of a flex parent's free main-axis space. */
  grow?: number;
  opacity?: number;
}

export interface BoxNode extends Common {
  type: 'box';
  /** 'none': children are placed at their own x/y. Default 'column'. */
  direction?: 'row' | 'column' | 'none';
  gap?: number;
  padding?: Insets;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  /** Clip children to the box. */
  clip?: boolean;
  children?: ScreenNode[];
}

export interface TextNode extends Common {
  type: 'text';
  text: string | readonly TextSpan[];
  size: number;
  color?: string;
  font?: string;
  lineHeight?: number;
  maxLines?: number;
  align?: 'left' | 'center' | 'right';
}

export interface IconNode extends Common {
  type: 'icon';
  codepoint: number;
  size: number;
  color?: string;
}

export interface ImageNode extends Common {
  type: 'image';
  /** A key into paintScreen's `images`. */
  src: string;
  width: number;
  height: number;
  /** Draw perspective-correct (for screenshots on steep planes). */
  perspective?: boolean;
}

export interface SpacerNode extends Common {
  type: 'spacer';
  /** Main-axis size; without one a spacer grows. */
  size?: number;
}

export type ScreenNode = BoxNode | TextNode | IconNode | ImageNode | SpacerNode;

export interface PlacedNode {
  node: ScreenNode;
  x: number;
  y: number;
  w: number;
  h: number;
  children: PlacedNode[];
}

export interface LayoutEnv {
  /** Width of `text` at `px` in `font` (plane px). createTextMeasurer().measure fits. */
  measure(text: string, px: number, font: string): number;
  /** The font for text nodes without one. */
  font: string;
}

const insets = (p: Insets | undefined): [number, number, number, number] =>
  p === undefined ? [0, 0, 0, 0] : typeof p === 'number' ? [p, p, p, p] : [p[0], p[1], p[2], p[3]];

const spansOf = (n: TextNode): readonly TextSpan[] => (typeof n.text === 'string' ? [{ text: n.text }] : n.text);

function textSize(n: TextNode, availW: number, env: LayoutEnv): { w: number; h: number } {
  const font = n.font ?? env.font;
  const m = (t: string, sp: TextSpan) => env.measure(t, n.size, sp.font ?? font);
  const lh = n.lineHeight ?? n.size * 1.3;
  let w = n.width;
  if (w === undefined) {
    // natural width: the widest hard line, capped by what is available
    const natural = layoutSpans(spansOf(n), Infinity, m).reduce((a, l) => Math.max(a, l.width), 0);
    w = Math.min(natural, availW);
  }
  const lines = layoutSpans(spansOf(n), Math.max(w, 1), m, { maxLines: n.maxLines }).length;
  return { w, h: n.height ?? lines * lh };
}

function intrinsic(n: ScreenNode, availW: number, availH: number, env: LayoutEnv): { w: number; h: number } {
  switch (n.type) {
    case 'text':
      return textSize(n, availW, env);
    case 'icon':
      return { w: n.width ?? n.size, h: n.height ?? n.size };
    case 'image':
      return { w: n.width, h: n.height };
    case 'spacer':
      return { w: n.width ?? n.size ?? 0, h: n.height ?? n.size ?? 0 };
    case 'box': {
      const [t, r, b, l] = insets(n.padding);
      const dir = n.direction ?? 'column';
      if (dir === 'none') return { w: n.width ?? availW, h: n.height ?? availH };
      const iw = (n.width ?? availW) - l - r;
      const ih = (n.height ?? availH) - t - b;
      const kids = (n.children ?? []).map((c) => intrinsic(c, iw, ih, env));
      const gaps = Math.max(0, kids.length - 1) * (n.gap ?? 0);
      const row = dir === 'row';
      const main = kids.reduce((a, k) => a + (row ? k.w : k.h), 0) + gaps;
      const cross = kids.reduce((a, k) => Math.max(a, row ? k.h : k.w), 0);
      return { w: n.width ?? (row ? main : cross) + l + r, h: n.height ?? (row ? cross : main) + t + b };
    }
  }
}

function place(n: ScreenNode, x: number, y: number, w: number, h: number, env: LayoutEnv): PlacedNode {
  const out: PlacedNode = { node: n, x, y, w, h, children: [] };
  if (n.type !== 'box' || !n.children?.length) return out;
  const [t, r, b, l] = insets(n.padding);
  const cx = x + l, cy = y + t, cw = Math.max(0, w - l - r), ch = Math.max(0, h - t - b);
  const dir = n.direction ?? 'column';
  if (dir === 'none') {
    for (const c of n.children) {
      const s = intrinsic(c, cw, ch, env);
      out.children.push(place(c, cx + (c.x ?? 0), cy + (c.y ?? 0), s.w, s.h, env));
    }
    return out;
  }
  const row = dir === 'row';
  const gap = n.gap ?? 0;
  const mainAvail = row ? cw : ch;
  const crossAvail = row ? ch : cw;
  const sizes = n.children.map((c) => intrinsic(c, cw, ch, env));
  const growOf = (c: ScreenNode) => c.grow ?? (c.type === 'spacer' && c.size === undefined ? 1 : 0);
  const totalGrow = n.children.reduce((a, c) => a + growOf(c), 0);
  const used = sizes.reduce((a, s) => a + (row ? s.w : s.h), 0) + gap * (n.children.length - 1);
  const free = mainAvail - used;
  let pos = 0;
  let between = gap;
  if (totalGrow === 0 && free > 0) {
    const j = n.justify ?? 'start';
    if (j === 'center') pos = free / 2;
    else if (j === 'end') pos = free;
    else if (j === 'space-between' && n.children.length > 1) between = gap + free / (n.children.length - 1);
  }
  n.children.forEach((c, i) => {
    let main = (row ? sizes[i].w : sizes[i].h) + (totalGrow > 0 && free > 0 ? (free * growOf(c)) / totalGrow : 0);
    const fixedCross = row ? c.height : c.width;
    const align = n.align ?? 'stretch';
    let cross = align === 'stretch' && fixedCross === undefined ? crossAvail : row ? sizes[i].h : sizes[i].w;
    // text that grew or stretched re-wraps at its final width
    if (c.type === 'text') {
      const wFinal = row ? main : cross;
      const re = textSize({ ...c, width: c.width ?? wFinal }, wFinal, env);
      if (row) cross = align === 'stretch' && fixedCross === undefined ? crossAvail : re.h;
      else main = c.height ?? re.h;
    }
    const off = align === 'center' ? (crossAvail - cross) / 2 : align === 'end' ? crossAvail - cross : 0;
    const px = row ? cx + pos : cx + off;
    const py = row ? cy + off : cy + pos;
    out.children.push(place(c, px, py, row ? main : cross, row ? cross : main, env));
    pos += main + between;
  });
  return out;
}

/** Lay a screen out in a w x h plane-px rectangle. */
export function layoutScreen(root: ScreenNode, w: number, h: number, env: LayoutEnv): PlacedNode {
  return place(root, root.x ?? 0, root.y ?? 0, root.width ?? w, root.height ?? h, env);
}

/** Points of a rounded rectangle (corner arcs of `seg` steps), clockwise. */
export function roundedRectPoints(x: number, y: number, w: number, h: number, radius: number, seg = 6): PanelPoint[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  const pts: PanelPoint[] = [];
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI]
  ];
  for (const [ccx, ccy, a0] of corners)
    for (let i = 0; i <= seg; i += 1) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push({ x: ccx + Math.cos(a) * r, y: ccy + Math.sin(a) * r });
    }
  return pts;
}

export interface PaintOpts {
  images?: Record<string, CanvasImageSource | undefined>;
  /** Text colour for nodes without one. Default '#e0e0e0'. */
  color?: string;
  font?: string;
}

/** Paint a laid-out screen onto a panel. `ctx` is the panel's 2D context
 *  (for opacity). */
export function paintScreen(ctx: CanvasRenderingContext2D, panel: Panel, placed: PlacedNode, opts: PaintOpts = {}): void {
  const { node: n, x, y, w, h } = placed;
  const alpha = n.opacity ?? 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  switch (n.type) {
    case 'box': {
      if (n.fill) {
        if (n.radius) panel.fillPoly(roundedRectPoints(x, y, w, h, n.radius), n.fill);
        else panel.fillRect(x, y, w, h, n.fill);
      }
      if (n.stroke) {
        if (n.radius) panel.strokePoly(roundedRectPoints(x, y, w, h, n.radius), n.stroke, n.strokeWidth ?? 1);
        else panel.strokeRect(x, y, w, h, n.stroke, n.strokeWidth ?? 1);
      }
      const kids = () => placed.children.forEach((c) => paintScreen(ctx, panel, c, opts));
      if (n.clip) panel.clipRect({ x, y, w, h }, kids);
      else kids();
      break;
    }
    case 'text':
      panel.textBlock(x, y, w, n.size, n.text, {
        font: n.font ?? opts.font,
        color: n.color ?? opts.color,
        lineHeight: n.lineHeight,
        maxLines: n.maxLines,
        align: n.align
      });
      break;
    case 'icon':
      panel.icon(x, y, n.size, n.codepoint, { color: n.color ?? opts.color, baseline: 'top', align: 'left' });
      break;
    case 'image': {
      const img = opts.images?.[n.src];
      if (img) (n.perspective ? panel.imagePerspective : panel.image)(img, x, y, w, h);
      break;
    }
    case 'spacer':
      break;
  }
  ctx.restore();
}

/** The topmost node with an `id` under a plane-px point (pair with
 *  Panel.fromScreen for the pointer), or null. */
export function hitTest(placed: PlacedNode, px: number, py: number): PlacedNode | null {
  const inside = px >= placed.x && px <= placed.x + placed.w && py >= placed.y && py <= placed.y + placed.h;
  // children paint later, so search them last-first
  for (let i = placed.children.length - 1; i >= 0; i -= 1) {
    const hit = hitTest(placed.children[i], px, py);
    if (hit) return hit;
  }
  return inside && placed.node.id !== undefined ? placed : null;
}
