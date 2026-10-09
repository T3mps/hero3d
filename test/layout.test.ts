import { describe, expect, it } from 'vitest';
import { figmaImageRefs, fromFigma, type FigmaNode } from '../src/figma.js';
import { hitTest, layoutScreen, paintScreen, roundedRectPoints, type PlacedNode, type ScreenNode } from '../src/layout.js';
import type { Panel } from '../src/panel.js';

// every character is half the font size wide
const env = { measure: (t: string, px: number) => t.length * px * 0.5, font: 'UI' };
const box = (p: PlacedNode) => [p.x, p.y, p.w, p.h];

describe('layoutScreen', () => {
  it('stacks a column with padding and gap, stretching children across', () => {
    const root: ScreenNode = {
      type: 'box', padding: 10, gap: 5,
      children: [
        { type: 'box', height: 20 },
        { type: 'box', height: 30 }
      ]
    };
    const p = layoutScreen(root, 200, 100, env);
    expect(box(p)).toEqual([0, 0, 200, 100]);
    expect(p.children.map(box)).toEqual([[10, 10, 180, 20], [10, 35, 180, 30]]);
  });

  it('shares free space in a row by grow, and spacers grow by default', () => {
    const root: ScreenNode = {
      type: 'box', direction: 'row', align: 'start',
      children: [
        { type: 'box', width: 40, height: 10 },
        { type: 'spacer' },
        { type: 'box', width: 20, height: 10, grow: 1 }
      ]
    };
    const p = layoutScreen(root, 200, 50, env);
    expect(p.children.map(box)).toEqual([[0, 0, 40, 10], [40, 0, 70, 0], [110, 0, 90, 10]]);
  });

  it('justifies and aligns', () => {
    const kids: ScreenNode[] = [{ type: 'box', width: 20, height: 10 }, { type: 'box', width: 20, height: 20 }];
    const between = layoutScreen({ type: 'box', direction: 'row', justify: 'space-between', align: 'center', children: kids }, 100, 40, env);
    expect(between.children.map(box)).toEqual([[0, 15, 20, 10], [80, 10, 20, 20]]);
    const centred = layoutScreen({ type: 'box', direction: 'row', justify: 'center', align: 'end', children: kids }, 100, 40, env);
    expect(centred.children.map(box)).toEqual([[30, 30, 20, 10], [50, 20, 20, 20]]);
  });

  it('wraps text at its final width and sizes its height by lines', () => {
    const root: ScreenNode = { type: 'box', children: [{ type: 'text', text: 'aaaa bbbb cccc', size: 10, lineHeight: 12 }] };
    const p = layoutScreen(root, 50, 200, env); // 5 px a char: "aaaa bbbb" = 45 fits, three words do not
    expect(box(p.children[0])).toEqual([0, 0, 50, 24]);
  });

  it('places children of a "none" box at their own offsets', () => {
    const p = layoutScreen({ type: 'box', direction: 'none', padding: 4, children: [{ type: 'icon', codepoint: 65, size: 16, x: 10, y: 20 }] }, 100, 100, env);
    expect(box(p.children[0])).toEqual([14, 24, 16, 16]);
  });
});

describe('hitTest', () => {
  it('finds the topmost node with an id', () => {
    const p = layoutScreen(
      { type: 'box', id: 'screen', direction: 'none', children: [{ type: 'box', id: 'button', x: 10, y: 10, width: 50, height: 20 }, { type: 'box', x: 0, y: 0, width: 100, height: 100 }] },
      100,
      100,
      env
    );
    expect(hitTest(p, 20, 15)?.node.id).toBe('button');
    expect(hitTest(p, 90, 90)?.node.id).toBe('screen');
    expect(hitTest(p, 200, 200)).toBeNull();
  });
});

describe('paintScreen', () => {
  it('draws boxes (rounded as polygons), text, icons and images through the panel, and clips', () => {
    const calls: string[] = [];
    const rec = (name: string) => (...a: unknown[]) => { calls.push(`${name}:${a.filter((v) => typeof v !== 'object' && typeof v !== 'function').join(',')}`); return 0; };
    const panel = {
      fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), fillPoly: rec('fillPoly'), strokePoly: rec('strokePoly'),
      textBlock: rec('textBlock'), icon: rec('icon'), image: rec('image'), imagePerspective: rec('imagePerspective'),
      clipRect: (_r: unknown, fn: () => void) => { calls.push('clip'); fn(); }
    } as unknown as Panel;
    const ctx = { save() {}, restore() {}, globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    const tree = layoutScreen(
      {
        type: 'box', direction: 'column', fill: '#111', radius: 8, clip: true,
        children: [
          { type: 'text', text: 'Hi', size: 10 },
          { type: 'icon', codepoint: 0xe000, size: 12 },
          { type: 'image', src: 'shot', width: 40, height: 20, perspective: true },
          { type: 'image', src: 'missing', width: 4, height: 4 }
        ]
      },
      100,
      100,
      env
    );
    paintScreen(ctx, panel, tree, { images: { shot: {} as CanvasImageSource } });
    expect(calls.map((c) => c.split(':')[0])).toEqual(['fillPoly', 'clip', 'textBlock', 'icon', 'imagePerspective']);
  });

  it('roundedRectPoints stays inside the rect and degrades to 4 points', () => {
    const pts = roundedRectPoints(0, 0, 40, 20, 50);
    expect(pts.every((p) => p.x >= -1e-9 && p.x <= 40 + 1e-9 && p.y >= -1e-9 && p.y <= 20 + 1e-9)).toBe(true);
    expect(roundedRectPoints(0, 0, 10, 10, 0)).toHaveLength(4);
  });
});

describe('fromFigma', () => {
  const frame: FigmaNode = {
    id: '1:1', type: 'FRAME', absoluteBoundingBox: { x: 100, y: 200, width: 360, height: 640 },
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
    children: [
      { id: '1:2', type: 'RECTANGLE', cornerRadius: 12, absoluteBoundingBox: { x: 120, y: 220, width: 320, height: 48 }, fills: [{ type: 'SOLID', color: { r: 1, g: 0.5, b: 0, a: 1 }, opacity: 0.5 }] },
      { id: '1:3', type: 'TEXT', characters: 'Sign in', absoluteBoundingBox: { x: 140, y: 232, width: 100, height: 24 }, style: { fontFamily: 'Inter', fontWeight: 600, fontSize: 16, lineHeightPx: 24, textAlignHorizontal: 'CENTER' }, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] },
      { id: '1:4', type: 'RECTANGLE', absoluteBoundingBox: { x: 100, y: 300, width: 360, height: 200 }, fills: [{ type: 'IMAGE', imageRef: 'abc123' }] },
      { id: '1:5', type: 'RECTANGLE', visible: false, absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } },
      { id: '1:6', type: 'SLICE', absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } }
    ]
  };

  it('maps frames, shapes, text and image fills to a layout tree in frame coordinates', () => {
    const root = fromFigma(frame);
    expect(root).toMatchObject({ type: 'box', direction: 'none', x: 0, y: 0, width: 360, height: 640, fill: 'rgba(0,0,0,1)', clip: true });
    const [rect, text, image] = root.children!;
    expect(rect).toMatchObject({ type: 'box', id: '1:2', x: 20, y: 20, width: 320, height: 48, radius: 12, fill: 'rgba(255,128,0,0.5)' });
    expect(text).toMatchObject({ type: 'text', text: 'Sign in', size: 16, font: '600 "Inter", sans-serif', lineHeight: 24, align: 'center', color: 'rgba(255,255,255,1)', x: 40, y: 32 });
    expect(image).toMatchObject({ type: 'image', src: 'abc123', x: 0, y: 100 });
    expect(root.children).toHaveLength(3);
    expect(figmaImageRefs(root)).toEqual(['abc123']);
  });

  it('lays out at the frame size', () => {
    const placed = layoutScreen(fromFigma(frame), 360, 640, env);
    expect(placed.children.map(box)[0]).toEqual([20, 20, 320, 48]);
  });
});
