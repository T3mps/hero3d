import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPanelPainter } from '../src/panel.js';
import { createQuadPainter, type Quad } from '../src/quads.js';
import { createTextMeasurer, ellipsize, fontShorthand, layoutSpans, watchColorScheme, wrapText, type TextSpan } from '../src/text.js';
import { fakeCanvas, type FakeCtx2D } from './fakeDom.js';

// monospace: every character is 1 unit wide
const mono = (s: string) => [...s].length;

describe('fontShorthand', () => {
  it('keeps a leading weight/style in front of the size', () => {
    expect(fontShorthand(16, '"Space Mono", monospace')).toBe('16px "Space Mono", monospace');
    expect(fontShorthand(16, '600 Inter, sans-serif')).toBe('600 16px Inter, sans-serif');
    expect(fontShorthand(12, 'italic bold Inter')).toBe('italic bold 12px Inter');
  });
});

describe('wrapText and ellipsize', () => {
  it('wraps greedily at spaces, honours newlines and breaks words too long for a line', () => {
    expect(wrapText('the quick brown fox', 10, mono)).toEqual(['the quick', 'brown fox']);
    expect(wrapText('a\nb c', 10, mono)).toEqual(['a', 'b c']);
    expect(wrapText('abcdefghijkl', 5, mono)).toEqual(['abcde', 'fghij', 'kl']);
  });

  it('ellipsizes to fit', () => {
    expect(ellipsize('short', 10, mono)).toBe('short');
    expect(ellipsize('a long sentence', 8, mono)).toBe('a long…');
    expect(ellipsize('abc', 0, mono)).toBe('');
  });
});

describe('layoutSpans', () => {
  const bold: TextSpan = { text: 'bold words', font: '700 X' };
  const plain: TextSpan = { text: ' then plain text here' };
  const measure = (t: string) => mono(t);

  it('lays styled runs along lines with their x offsets', () => {
    const lines = layoutSpans([bold, plain], 15, measure);
    expect(lines.map((l) => l.runs.map((r) => r.text).join(''))).toEqual(['bold words then', 'plain text here']);
    const [b, p] = lines[0].runs;
    expect(b).toMatchObject({ text: 'bold words', x: 0, span: bold });
    expect(p).toMatchObject({ text: ' then', x: 10, span: plain });
    expect(lines[0].width).toBe(15);
  });

  it('ends the last allowed line in an ellipsis', () => {
    const lines = layoutSpans([bold, plain], 15, measure, { maxLines: 1 });
    expect(lines).toHaveLength(1);
    const text = lines[0].runs.map((r) => r.text).join('');
    expect(text.endsWith('…')).toBe(true);
    expect(lines[0].width).toBeLessThanOrEqual(15);
  });
});

describe('measuring and the panel text block', () => {
  it('createTextMeasurer scales a 100px measurement and sets the shorthand font', () => {
    const fonts: string[] = [];
    const ctx = { set font(f: string) { fonts.push(f); }, get font() { return ''; }, measureText: (t: string) => ({ width: t.length * 60 }) };
    const m = createTextMeasurer(ctx as never);
    expect(m.measure('abc', 10, '600 Inter')).toBeCloseTo(18, 9);
    expect(fonts[0]).toBe('600 100px Inter');
  });

  it('Panel.textBlock wraps into lines and returns the height used', () => {
    const ctx = fakeCanvas().getContext('2d') as FakeCtx2D;
    const c2d = ctx as unknown as CanvasRenderingContext2D;
    const drawn: string[] = [];
    const glyphs = { planeGlyphs: (_o: unknown, _x: unknown, _y: unknown, _px: number, label: string) => drawn.push(label) } as never;
    const measurer = { measure: (t: string, px: number) => t.length * px * 0.5 };
    const panel = createPanelPainter({ ctx: c2d, glyphs, quads: createQuadPainter(c2d), uiFont: 'X', iconFont: 'I', measurer }).panelFor(
      { fl: { x: 0, y: 0, scale: 1, depth: 1 }, fr: { x: 400, y: 0, scale: 1, depth: 1 }, nl: { x: 0, y: 200, scale: 1, depth: 1 }, nr: { x: 400, y: 200, scale: 1, depth: 1 } } as Quad,
      { cw: 400, ch: 200 },
      400,
      200
    );
    const h = panel.textBlock(10, 10, 100, 10, 'one two three four five six');
    expect(drawn).toEqual(['one two three four', 'five six']); // 18 chars x 5 = 90 <= 100
    expect(h).toBeCloseTo(26, 9);
  });
});

describe('watchColorScheme', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reports scheme flips and unsubscribes', () => {
    const mq = new EventTarget();
    vi.stubGlobal('window', { matchMedia: () => mq });
    const seen: boolean[] = [];
    const off = watchColorScheme((d) => seen.push(d));
    mq.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    off();
    mq.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    expect(seen).toEqual([true]);
  });
});
