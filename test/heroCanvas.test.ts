import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBakedField } from '../src/fieldGL.js';
import { createHeroCanvas } from '../src/lifecycle.js';
import { fakeCanvas, fakeGL, installHeroEnv } from './fakeDom.js';

let env: ReturnType<typeof installHeroEnv>;
beforeEach(() => {
  env = installHeroEnv();
});
afterEach(() => env.restore());

const lose = (c: EventTarget) => {
  const e = new Event('webglcontextlost', { cancelable: true });
  c.dispatchEvent(e);
  return e;
};
const regain = (c: EventTarget) => c.dispatchEvent(new Event('webglcontextrestored'));

describe('createHeroCanvas: the behavioural contract', () => {
  it('sizes the canvas to its CSS box times DPR and draws once up front', () => {
    const canvas = fakeCanvas(400, 200);
    const draw = vi.fn();
    const onResize = vi.fn();
    createHeroCanvas(canvas as unknown as HTMLCanvasElement, null, { draw, onResize, dpr: 2 });
    expect([canvas.width, canvas.height]).toEqual([800, 400]);
    expect(onResize).toHaveBeenCalledWith(400, 200, 2);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('runs a loop only while on screen', () => {
    const draw = vi.fn();
    createHeroCanvas(fakeCanvas() as unknown as HTMLCanvasElement, null, { draw });
    expect(env.pending()).toBe(0);
    env.intersect(true);
    env.tick(100);
    env.tick(200);
    expect(draw).toHaveBeenCalledTimes(3);
    env.intersect(false);
    expect(env.pending()).toBe(0);
  });

  it('under reduced motion draws once per resize and never starts a loop', () => {
    const draw = vi.fn();
    createHeroCanvas(fakeCanvas() as unknown as HTMLCanvasElement, null, { draw, reduced: true });
    env.intersect(true);
    expect(env.pending()).toBe(0);
    env.resize();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('destroy stops the loop and the observers', () => {
    const draw = vi.fn();
    const hero = createHeroCanvas(fakeCanvas() as unknown as HTMLCanvasElement, null, { draw });
    env.intersect(true);
    hero.destroy();
    expect(env.pending()).toBe(0);
    env.resize();
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

describe('context loss and restore (I5)', () => {
  it('stops on loss, rebuilds and resumes on restore', () => {
    const canvas = fakeCanvas();
    const draw = vi.fn();
    const onContextLost = vi.fn();
    const onContextRestored = vi.fn();
    createHeroCanvas(canvas as unknown as HTMLCanvasElement, null, { draw, onContextLost, onContextRestored });
    env.intersect(true);
    const e = lose(canvas);
    expect(e.defaultPrevented).toBe(true); // asks the browser for the context back
    expect(onContextLost).toHaveBeenCalledOnce();
    expect(env.pending()).toBe(0);
    env.resize(); // no drawing into a dead context
    env.intersect(true); // and no restarting
    expect(env.pending()).toBe(0);
    const drawsBefore = draw.mock.calls.length;
    regain(canvas);
    expect(onContextRestored).toHaveBeenCalledOnce();
    expect(draw.mock.calls.length).toBe(drawsBefore + 1); // drawn straight away
    expect(env.pending()).toBe(1); // and running again
  });

  it('does not ask for restoration without a restore hook', () => {
    const canvas = fakeCanvas();
    createHeroCanvas(canvas as unknown as HTMLCanvasElement, null, { draw: () => {} });
    expect(lose(canvas).defaultPrevented).toBe(false);
  });

  it('a baked field skips renders while lost and rebuilds itself on restore', () => {
    const gl = fakeGL();
    const canvas = fakeCanvas(10, 10, () => gl);
    const onRestored = vi.fn();
    const field = createBakedField(canvas as unknown as HTMLCanvasElement, { triangles: [], lines: [] }, { onRestored })!;
    const cam = { pos: { x: 0, y: 1, z: -1 }, target: { x: 0, y: 0, z: 0 }, fov: 1 };
    expect(lose(canvas).defaultPrevented).toBe(true);
    gl.calls.length = 0;
    field.render(cam);
    expect(gl.calls).toEqual([]);
    gl.live.clear(); // the lost context took every object with it
    regain(canvas);
    expect(onRestored).toHaveBeenCalledOnce();
    expect(gl.live.size).toBe(3);
    field.render(cam);
    expect(gl.calls.some((c) => c.name === 'drawArrays')).toBe(true);
  });
});
