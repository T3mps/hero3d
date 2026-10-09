import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeroCanvas } from '../src/lifecycle.js';
import { createFrameWindow, createQualityGovernor } from '../src/quality.js';
import { createWorkerHero, serveWorkerHero, type WorkerHeroMessage } from '../src/worker.js';
import { fakeCanvas, installHeroEnv } from './fakeDom.js';

describe('frame window', () => {
  it('reports fps and percentiles', () => {
    const w = createFrameWindow(10);
    for (let i = 0; i < 9; i += 1) w.push(16);
    w.push(50);
    const s = w.stats();
    expect(s.frames).toBe(10);
    expect(s.p50).toBe(16);
    expect(s.worst).toBe(50);
    expect(s.fps).toBeCloseTo(1000 / 19.4, 6);
  });
});

describe('quality governor', () => {
  const feed = (g: ReturnType<typeof createQualityGovernor>, ms: number, n: number, t0: number) => {
    let changed = 0;
    for (let i = 0; i < n; i += 1) if (g.sample(ms, t0 + i * ms)) changed += 1;
    return changed;
  };

  it('steps down while frames run long, never past the cheapest level', () => {
    const g = createQualityGovernor({ levels: [2, 1.5, 1], window: 30 });
    expect(g.value).toBe(2);
    expect(feed(g, 33, 30, 0)).toBe(1);
    expect(g.value).toBe(1.5);
    feed(g, 33, 30, 2000);
    expect(g.value).toBe(1);
    expect(feed(g, 33, 300, 4000)).toBe(0);
  });

  it('ignores a single hitch, and steps back up only after sustained headroom', () => {
    const g = createQualityGovernor({ levels: [2, 1], window: 30, upAfterMs: 3000 });
    for (let i = 0; i < 29; i += 1) g.sample(16.7, i * 16.7);
    expect(g.sample(200, 600)).toBe(false); // one bad frame
    feed(g, 40, 30, 1000);
    expect(g.value).toBe(1);
    expect(feed(g, 16.7, 60, 5000)).toBe(0); // 1 s of headroom: not yet
    expect(feed(g, 16.7, 200, 6000)).toBe(1);
    expect(g.value).toBe(2);
  });
});

describe('adaptive lifecycle', () => {
  let env: ReturnType<typeof installHeroEnv>;
  beforeEach(() => {
    env = installHeroEnv();
  });
  afterEach(() => env.restore());

  it('drops the canvas DPR when frames run long, and reports stats', () => {
    const canvas = fakeCanvas(100, 50);
    const onResize = vi.fn();
    const onStats = vi.fn();
    createHeroCanvas(canvas as unknown as HTMLCanvasElement, null, { draw: () => {}, onResize, onStats, adaptive: { levels: [2, 1], window: 20 } });
    expect(canvas.width).toBe(200);
    env.intersect(true);
    for (let i = 1; i <= 40; i += 1) env.tick(i * 40); // 25 fps
    expect(canvas.width).toBe(100);
    expect(onResize).toHaveBeenLastCalledWith(100, 50, 1);
    expect(onStats).toHaveBeenCalled();
    expect(onStats.mock.calls[0][0].p50).toBeCloseTo(40, 6);
  });
});

describe('worker heroes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the main side transfers the canvas and forwards size and visibility', () => {
    const env = installHeroEnv({ reduced: false });
    const posted: { msg: WorkerHeroMessage; transfer?: unknown[] }[] = [];
    const worker = { postMessage: (msg: WorkerHeroMessage, transfer?: unknown[]) => posted.push({ msg, transfer }), terminate: vi.fn() };
    const offscreen = { offscreen: true };
    const canvas = Object.assign(fakeCanvas(300, 150), { transferControlToOffscreen: () => offscreen });
    const hero = createWorkerHero(canvas as unknown as HTMLCanvasElement, worker as never, { dpr: 2, init: { seed: 7 } })!;
    expect(posted[0].msg).toMatchObject({ type: 'init', w: 300, h: 150, dpr: 2, reduced: false, init: { seed: 7 } });
    expect(posted[0].transfer).toEqual([offscreen]);
    env.resize();
    env.intersect(true);
    hero.send('hi');
    hero.destroy();
    expect(posted.slice(1).map((p) => p.msg.type)).toEqual(['resize', 'visible', 'message', 'destroy']);
    expect(worker.terminate).toHaveBeenCalled();
    env.restore();
  });

  it('is null without OffscreenCanvas support', () => {
    expect(createWorkerHero(fakeCanvas() as unknown as HTMLCanvasElement, { postMessage() {} })).toBeNull();
  });

  it('the worker side sizes, draws, paces and stops like createHeroCanvas', () => {
    const env = installHeroEnv();
    const scope = new EventTarget();
    const send = (data: WorkerHeroMessage) => scope.dispatchEvent(Object.assign(new Event('message'), { data }));
    const draw = vi.fn();
    const onMessage = vi.fn();
    const off = { width: 0, height: 0 } as OffscreenCanvas;
    serveWorkerHero(scope as never, () => ({ draw, onMessage }));
    send({ type: 'init', canvas: off, w: 200, h: 100, dpr: 1.5, reduced: false, maxFps: 60 });
    expect([off.width, off.height]).toEqual([300, 150]);
    expect(draw).toHaveBeenCalledTimes(1);
    send({ type: 'visible', visible: true });
    env.tick(100);
    env.tick(200);
    expect(draw).toHaveBeenCalledTimes(3);
    send({ type: 'message', data: 42 });
    expect(onMessage).toHaveBeenCalledWith(42);
    send({ type: 'visible', visible: false });
    expect(env.pending()).toBe(0);
    env.restore();
  });
});
