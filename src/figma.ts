// Fly through your real Figma screens: turn a frame from Figma's REST API
// (GET /v1/files/:key/nodes?ids=...) into a layout tree that paintScreen draws
// on a plane. Figma positions are absolute, so frames become `direction: 'none'`
// boxes with children at their own offsets; auto-layout is already resolved in
// the coordinates. Covered: frames, groups, components and instances,
// rectangles and ellipses (fill, stroke, corner radius), text (family, weight,
// size, line height, alignment, colour) and image fills (by imageRef, which
// Figma's /images endpoint resolves to a URL). Vectors with a solid fill
// become their bounding box; anything else is skipped.
import type { BoxNode, ScreenNode } from './layout.js';

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  imageRef?: string;
}

export interface FigmaNode {
  id?: string;
  name?: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  characters?: string;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    lineHeightPx?: number;
    textAlignHorizontal?: string;
    italic?: boolean;
  };
  children?: FigmaNode[];
}

export interface FigmaOpts {
  /** CSS font for a Figma family/weight. Default: `${weight} "${family}", sans-serif`. */
  font?(family: string, weight: number, italic: boolean): string;
  /** Keep Figma node ids as layout ids (for hitTest). Default true. */
  ids?: boolean;
}

const css = (c: FigmaColor, opacity = 1) =>
  `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${+(c.a * opacity).toFixed(4)})`;

const solid = (paints: FigmaPaint[] | undefined) => {
  const p = paints?.find((f) => f.type === 'SOLID' && f.visible !== false && f.color);
  return p ? css(p.color!, p.opacity ?? 1) : undefined;
};

const CONTAINERS = new Set(['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);

function convert(n: FigmaNode, ox: number, oy: number, o: FigmaOpts): ScreenNode | null {
  if (n.visible === false || !n.absoluteBoundingBox) return null;
  const bb = n.absoluteBoundingBox;
  const base = {
    ...(o.ids !== false && n.id ? { id: n.id } : {}),
    x: bb.x - ox,
    y: bb.y - oy,
    width: bb.width,
    height: bb.height,
    ...(n.opacity !== undefined && n.opacity < 1 ? { opacity: n.opacity } : {})
  };
  if (n.type === 'TEXT') {
    const s = n.style ?? {};
    const fontOf = o.font ?? ((family, weight, italic) => `${italic ? 'italic ' : ''}${weight} "${family}", sans-serif`);
    const align = s.textAlignHorizontal === 'CENTER' ? 'center' : s.textAlignHorizontal === 'RIGHT' ? 'right' : 'left';
    return {
      type: 'text',
      ...base,
      text: n.characters ?? '',
      size: s.fontSize ?? 14,
      font: fontOf(s.fontFamily ?? 'Inter', s.fontWeight ?? 400, !!s.italic),
      color: solid(n.fills),
      lineHeight: s.lineHeightPx,
      align
    };
  }
  const image = n.fills?.find((f) => f.type === 'IMAGE' && f.visible !== false && f.imageRef);
  if (image && !n.children?.length) {
    return { type: 'image', ...base, src: image.imageRef!, width: bb.width, height: bb.height };
  }
  const isContainer = CONTAINERS.has(n.type);
  if (!isContainer && !['RECTANGLE', 'ELLIPSE', 'VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'].includes(n.type)) return null;
  const fill = solid(n.fills);
  const stroke = solid(n.strokes);
  if (!isContainer && !fill && !stroke) return null;
  const box: BoxNode = {
    type: 'box',
    ...base,
    direction: 'none',
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke, strokeWidth: n.strokeWeight ?? 1 } : {}),
    ...(n.type === 'ELLIPSE' ? { radius: Math.min(bb.width, bb.height) / 2 } : n.cornerRadius ? { radius: n.cornerRadius } : {}),
    ...(n.type === 'FRAME' ? { clip: true } : {})
  };
  const kids = (n.children ?? []).map((c) => convert(c, bb.x, bb.y, o)).filter((c): c is ScreenNode => c !== null);
  if (kids.length) box.children = kids;
  return box;
}

/** Convert a Figma frame (and its subtree) to a layout tree rooted at (0, 0),
 *  sized to the frame. Lay it out with layoutScreen at the frame's size. */
export function fromFigma(frame: FigmaNode, opts: FigmaOpts = {}): BoxNode {
  const bb = frame.absoluteBoundingBox ?? { x: 0, y: 0, width: 0, height: 0 };
  const root = convert({ ...frame, visible: true }, bb.x, bb.y, opts);
  if (!root || root.type !== 'box') return { type: 'box', direction: 'none', width: bb.width, height: bb.height };
  return root;
}

/** All image refs a converted tree needs (fetch them via Figma's /images endpoint). */
export function figmaImageRefs(node: ScreenNode): string[] {
  if (node.type === 'image') return [node.src];
  if (node.type === 'box') return (node.children ?? []).flatMap(figmaImageRefs);
  return [];
}
