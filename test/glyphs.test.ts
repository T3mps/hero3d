import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGlyphPainter, TEXT_MIN } from '../src/glyphs.js';
import { fakeCanvas, installDocument, type FakeCtx2D } from './fakeDom.js';

let dom: ReturnType<typeof installDocument>;
beforeEach(() => {
  dom = installDocument();
});
afterEach(() => dom.restore());

const setup = (cacheCap: number) => {
  const ctx = fakeCanvas().getContext('2d') as FakeCtx2D;
  ctx.fillStyle = '#ffffff';
  const painter = createGlyphPainter(ctx as unknown as CanvasRenderingContext2D, 1, { font: 'Mono', cacheCap });
  // one canvas is the painter's measuring context; every bake after that makes one more
  const bakes = () => dom.created.length - 1;
  return { ctx, painter, bakes };
};

describe('glyph painter', () => {
  it('bakes a label once and blits it after that', () => {
    const { painter, bakes, ctx } = setup(8);
    painter.drawText('A', 0, 0, 12);
    painter.drawText('A', 10, 10, 12);
    expect(bakes()).toBe(1);
    expect(ctx.calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(2);
  });

  it('skips text below TEXT_MIN and fills it can not parse', () => {
    const { painter, bakes, ctx } = setup(8);
    painter.drawText('A', 0, 0, TEXT_MIN / 2);
    ctx.fillStyle = {}; // a gradient
    painter.drawText('B', 0, 0, 12);
    expect(bakes()).toBe(0);
  });

  it('keys the bake on the font family, so one painter serves several faces', () => {
    const { painter, bakes } = setup(8);
    painter.drawText('A', 0, 0, 12);
    painter.drawText('A', 0, 0, 12, 'Icons');
    expect(bakes()).toBe(2);
  });

  it('evicts the least recently USED label past the cap, not the oldest inserted (I3)', () => {
    const { painter, bakes } = setup(3);
    painter.drawText('A', 0, 0, 12);
    painter.drawText('B', 0, 0, 12);
    painter.drawText('C', 0, 0, 12);
    expect(bakes()).toBe(3);
    painter.drawText('A', 0, 0, 12); // A is drawn every frame: it must stay
    painter.drawText('D', 0, 0, 12); // evicts B, the least recently used
    expect(bakes()).toBe(4);
    painter.drawText('A', 0, 0, 12);
    expect(bakes()).toBe(4);
    painter.drawText('B', 0, 0, 12);
    expect(bakes()).toBe(5);
  });

  it('clearCache drops every bake', () => {
    const { painter, bakes } = setup(8);
    painter.drawText('A', 0, 0, 12);
    painter.clearCache();
    painter.drawText('A', 0, 0, 12);
    expect(bakes()).toBe(2);
  });
});
