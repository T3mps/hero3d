import { describe, expect, it } from 'vitest';
import type { Camera } from '../src/camera.js';
import { sortPlanes, type Corners } from '../src/planes.js';

const cam: Camera = { pos: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 1, z: 1 }, fov: 1 };
// an upright 1x1 card centred at (x, 1, z), facing the camera (or away)
const card = (x: number, z: number, back = false): Corners => {
  const l = back ? x + 0.5 : x - 0.5, r = back ? x - 0.5 : x + 0.5;
  return { fl: { x: l, y: 1.5, z }, fr: { x: r, y: 1.5, z }, nl: { x: l, y: 0.5, z }, nr: { x: r, y: 0.5, z } };
};

describe('sortPlanes', () => {
  const items = [
    { id: 'mid', c: card(0, 5) },
    { id: 'near', c: card(0.2, 2) },
    { id: 'far', c: card(-0.2, 9) },
    { id: 'behind', c: card(0, -3) },
    { id: 'offscreen', c: card(40, 5) },
    { id: 'reversed', c: card(0, 6, true) }
  ];

  it('drops planes behind the camera and off screen, and sorts back to front', () => {
    const out = sortPlanes(cam, items, (i) => i.c, 800, 600);
    expect(out.map((p) => p.item.id)).toEqual(['far', 'reversed', 'mid', 'near']);
    expect(out[0].depth).toBeCloseTo(9, 9);
    expect(out.every((p) => p.alpha === 1)).toBe(true);
  });

  it('culls backfaces on request and fades with depth', () => {
    const out = sortPlanes(cam, items, (i) => i.c, 800, 600, { cullBackfaces: true, fade: { min: 0.2, falloff: 0.1, base: 1.2 } });
    expect(out.map((p) => p.item.id)).toEqual(['far', 'mid', 'near']);
    expect(out[0].alpha).toBeCloseTo(0.3, 9);
    expect(out[2].alpha).toBe(1);
  });

  it('keeps a plane the near plane cuts, as an outline without a quad', () => {
    const straddle: Corners = { fl: { x: -1, y: 0, z: 5 }, fr: { x: 1, y: 0, z: 5 }, nl: { x: -1, y: 0, z: -1 }, nr: { x: 1, y: 0, z: -1 } };
    const [p] = sortPlanes(cam, [straddle], (c) => c, 800, 600);
    expect(p.quad).toBeNull();
    expect(p.poly.length).toBeGreaterThanOrEqual(3);
  });

  it('a margin keeps planes just off screen', () => {
    expect(sortPlanes(cam, [card(3, 2)], (c) => c, 800, 600)).toHaveLength(0);
    expect(sortPlanes(cam, [card(3, 2)], (c) => c, 800, 600, { margin: Infinity })).toHaveLength(1);
  });
});
