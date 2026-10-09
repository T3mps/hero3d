import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../src/camera.js';
import { matrix3dCss, matrix3dFor, pinElement, quadFacesCamera } from '../src/domPlane.js';
import { quadFromCorners, type Quad } from '../src/quads.js';

const cam: Camera = { pos: { x: 1, y: 3, z: -6 }, target: { x: 0, y: 1, z: 2 }, fov: 0.9 };
// an upright screen facing the camera (x right, y up; far edge = top)
const q = quadFromCorners(
  cam,
  { fl: { x: -2, y: 2.5, z: 2 }, fr: { x: 2, y: 2.4, z: 2.6 }, nl: { x: -2, y: 0, z: 2 }, nr: { x: 2, y: 0, z: 2.6 } },
  1280,
  720
)!;

// apply a column-major 4x4 to (x, y, 0, 1) and divide
const apply = (m: number[], x: number, y: number) => {
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return { x: X / W, y: Y / W, w: W };
};

describe('matrix3dFor', () => {
  it('puts the element box corners on the quad corners', () => {
    const m = matrix3dFor(320, 200, q)!;
    for (const [x, y, k] of [[0, 0, 'fl'], [320, 0, 'fr'], [320, 200, 'nr'], [0, 200, 'nl']] as const) {
      const p = apply(m, x, y);
      expect(p.x).toBeCloseTo(q[k].x, 6);
      expect(p.y).toBeCloseTo(q[k].y, 6);
      expect(p.w).toBeGreaterThan(0);
    }
  });

  it('formats as CSS', () => {
    expect(matrix3dCss([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1])).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,5,6,0,1)');
  });
});

describe('quadFacesCamera', () => {
  it('is true from the front and false from behind', () => {
    expect(quadFacesCamera(q)).toBe(true);
    const mirrored: Quad = { fl: q.fr, fr: q.fl, nl: q.nr, nr: q.nl };
    expect(quadFacesCamera(mirrored)).toBe(false);
  });
});

const fakeEl = () => {
  const target = new EventTarget() as unknown as HTMLElement & { attrs: Record<string, string> };
  const attrs: Record<string, string> = {};
  Object.assign(target, {
    style: {} as CSSStyleDeclaration,
    inert: false,
    attrs,
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    removeAttribute: (k: string) => { delete attrs[k]; },
    contains: () => false
  });
  return target;
};

describe('pinElement', () => {
  it('places the element on a facing quad and hides it (inert) when clipped or from behind', () => {
    const el = fakeEl();
    const pin = pinElement(el, { w: 320, h: 200 });
    expect(el.inert).toBe(true);
    pin.place(q, { opacity: 0.5 });
    expect(el.style.transform).toMatch(/^matrix3d\(/);
    expect(el.style.visibility).toBe('visible');
    expect(el.style.opacity).toBe('0.5');
    expect(el.inert).toBe(false);
    pin.place(null);
    expect(el.style.visibility).toBe('hidden');
    expect(el.inert).toBe(true);
    pin.place({ fl: q.fr, fr: q.fl, nl: q.nr, nr: q.nl });
    expect(el.style.visibility).toBe('hidden');
  });

  it('never hides a focused element, and reports focus changes', () => {
    const el = fakeEl();
    const onFocusChange = vi.fn();
    const pin = pinElement(el, { w: 10, h: 10 }, { onFocusChange });
    pin.place(q);
    el.dispatchEvent(new Event('focusin'));
    expect(pin.focused).toBe(true);
    expect(onFocusChange).toHaveBeenLastCalledWith(true);
    pin.place(null);
    expect(el.style.visibility).toBe('visible');
    el.dispatchEvent(Object.assign(new Event('focusout'), { relatedTarget: null }));
    expect(pin.focused).toBe(false);
    pin.place(null);
    expect(el.style.visibility).toBe('hidden');
  });

  it('release restores the element', () => {
    const el = fakeEl();
    el.setAttribute('style', 'color: red');
    const pin = pinElement(el, { w: 10, h: 10 });
    pin.release();
    expect(el.attrs.style).toBe('color: red');
    expect(el.inert).toBe(false);
  });
});
