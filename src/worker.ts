// Rendering off the main thread. Where the browser supports
// transferControlToOffscreen, a hero can draw in a dedicated worker, so main-
// thread work (hydration, scrolling handlers, layout) never costs it a frame.
// The main side keeps the parts that need the DOM - sizing, visibility,
// reduced motion - and forwards them; the worker side runs the same paced loop
// as createHeroCanvas.
//
//   // main
//   const hero = createWorkerHero(canvas, new Worker(new URL('./hero.worker.js', import.meta.url), { type: 'module' }));
//   if (!hero) mountOnMainThread(canvas); // no OffscreenCanvas: fall back
//
//   // hero.worker.js
//   serveWorkerHero(self, (canvas) => {
//     const ctx = canvas.getContext('2d')!;
//     return { onResize: (w, h, dpr) => ctx.setTransform(dpr, 0, 0, dpr, 0, 0), draw: (now) => { ... } };
//   });
import { clampDpr, MAX_FPS, prefersReducedMotion, shouldDraw, type HeroCanvasHandle } from './lifecycle.js';

export type WorkerHeroMessage =
  | { type: 'init'; canvas: OffscreenCanvas; w: number; h: number; dpr: number; reduced: boolean; maxFps: number; init?: unknown }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'visible'; visible: boolean }
  | { type: 'message'; data: unknown }
  | { type: 'destroy' };

interface WorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate?(): void;
}

export interface WorkerHeroHandle extends HeroCanvasHandle {
  /** Send the hero something (a theme change, a pointer position, a seed). */
  send(data: unknown): void;
}

/** Hand `canvas` to `worker`. Null when the browser cannot transfer canvases:
 *  fall back to drawing on the main thread. `destroy` also terminates the
 *  worker unless `terminate: false`. */
export function createWorkerHero(
  canvas: HTMLCanvasElement,
  worker: WorkerLike,
  opts: { dpr?: number; reduced?: boolean; maxFps?: number; init?: unknown; terminate?: boolean } = {}
): WorkerHeroHandle | null {
  if (typeof canvas.transferControlToOffscreen !== 'function') return null;
  const dpr = opts.dpr ?? clampDpr();
  const size = () => ({ w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 });
  const offscreen = canvas.transferControlToOffscreen();
  const post = (m: WorkerHeroMessage, t?: Transferable[]) => worker.postMessage(m, t);
  post(
    { type: 'init', canvas: offscreen, ...size(), dpr, reduced: opts.reduced ?? prefersReducedMotion(), maxFps: opts.maxFps ?? MAX_FPS, init: opts.init },
    [offscreen]
  );
  const ro = new ResizeObserver(() => post({ type: 'resize', ...size(), dpr }));
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => post({ type: 'visible', visible: !!e?.isIntersecting }), { threshold: 0 });
  io.observe(canvas);
  return {
    send: (data) => post({ type: 'message', data }),
    destroy() {
      ro.disconnect();
      io.disconnect();
      post({ type: 'destroy' });
      if (opts.terminate !== false) worker.terminate?.();
    }
  };
}

export interface WorkerHero {
  draw(now: number): void;
  onResize?(w: number, h: number, dpr: number): void;
  onMessage?(data: unknown): void;
  destroy?(): void;
}

interface ScopeLike {
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}

/** The worker side: build the hero on the transferred canvas and run it with
 *  the same contract as createHeroCanvas (paced to maxFps, no frames while
 *  hidden, one frame per resize under reduced motion). */
export function serveWorkerHero(scope: ScopeLike, setup: (canvas: OffscreenCanvas, init: unknown) => WorkerHero): void {
  const g = globalThis as unknown as {
    requestAnimationFrame?: (cb: (t: number) => void) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  // dedicated workers have rAF in Chrome and Firefox; a timer elsewhere
  const raf = g.requestAnimationFrame?.bind(globalThis) ?? ((cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 1000 / 60) as unknown as number);
  const caf = g.cancelAnimationFrame?.bind(globalThis) ?? ((id: number) => clearTimeout(id));
  let hero: WorkerHero | null = null;
  let canvas: OffscreenCanvas | null = null;
  let reduced = false;
  let interval = 1000 / MAX_FPS;
  let running = false;
  let rafId = 0;
  let lastDraw = -Infinity;
  let prevTick = 0;
  const loop = (ts: number) => {
    if (!hero) return;
    if (shouldDraw(ts, lastDraw, ts - prevTick, interval)) {
      lastDraw = ts;
      hero.draw(ts);
    }
    prevTick = ts;
    rafId = raf(loop);
  };
  const stop = () => {
    running = false;
    caf(rafId);
  };
  const resize = (w: number, h: number, dpr: number) => {
    if (!canvas || !hero) return;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    hero.onResize?.(w, h, dpr);
    if (!running) hero.draw(performance.now());
  };
  scope.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as WorkerHeroMessage;
    switch (m.type) {
      case 'init':
        canvas = m.canvas;
        reduced = m.reduced;
        interval = 1000 / m.maxFps;
        hero = setup(m.canvas, m.init);
        resize(m.w, m.h, m.dpr);
        break;
      case 'resize':
        resize(m.w, m.h, m.dpr);
        break;
      case 'visible':
        if (m.visible && !running && !reduced && hero) {
          running = true;
          prevTick = performance.now();
          rafId = raf(loop);
        } else if (!m.visible) stop();
        break;
      case 'message':
        hero?.onMessage?.(m.data);
        break;
      case 'destroy':
        stop();
        hero?.destroy?.();
        hero = null;
        break;
    }
  });
}
