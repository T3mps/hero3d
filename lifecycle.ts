// Canvas lifecycle scaffold shared by hero actions: DPR-scaled sizing,
// resize + intersection observers, reduced-motion handling, and the RAF loop.
// Under reduced motion the hero draws exactly once per resize and never
// animates; the hero decides its own frame-time mapping from the flag.

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clampDpr = (max = 2) => Math.min(window.devicePixelRatio || 1, max);

/** Frame cap for every hero. A hero repainting two full-viewport canvases at
 *  a display's native 144/240 Hz is GPU work the whole browser pays for (the
 *  GPU process is shared across tabs) and buys nothing at these motion
 *  speeds. 60 is plenty; the pacer below keeps the cadence steady. */
export const MAX_FPS = 60;

/** Whether to draw on this RAF tick. `ts` is the tick's timestamp, `lastDraw`
 *  the timestamp of the last drawn tick, `tickDt` the interval since the
 *  previous tick (the display's refresh period) and `interval` = 1000/MAX_FPS.
 *  Drawing when the elapsed time is within half a tick of the interval gives
 *  a steady cadence at any refresh rate (240 Hz -> every 4th tick, 144 -> every
 *  2nd, 60 -> every tick) instead of the alternating 2-3 tick jitter a plain
 *  `elapsed >= interval` produces. Pure, so the pacing is unit-tested. */
export const shouldDraw = (ts: number, lastDraw: number, tickDt: number, interval: number): boolean =>
  ts - lastDraw >= interval - Math.max(0, tickDt) / 2;

export interface HeroCanvasOpts {
  draw(now: number): void;
  /** Rebuild size-dependent resources (vignettes, sibling GL canvases, ...). */
  onResize?(w: number, h: number, dpr: number): void;
  dpr?: number; // pass the hero's own clamped value; defaults to clampDpr()
  reduced?: boolean; // pass the hero's own flag; defaults to prefersReducedMotion()
  maxFps?: number; // defaults to MAX_FPS
}

export interface HeroCanvasHandle {
  destroy(): void;
}

export function createHeroCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  opts: HeroCanvasOpts
): HeroCanvasHandle {
  const reduced = opts.reduced ?? prefersReducedMotion();
  const dpr = opts.dpr ?? clampDpr();

  const interval = 1000 / (opts.maxFps ?? MAX_FPS);

  let rafId = 0;
  let running = false;
  let lastDraw = -Infinity;
  let prevTick = 0;
  const loop = (ts: number) => {
    if (shouldDraw(ts, lastDraw, ts - prevTick, interval)) {
      lastDraw = ts;
      opts.draw(ts);
    }
    prevTick = ts;
    rafId = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduced) return;
    running = true;
    prevTick = performance.now();
    rafId = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
  };

  const resize = () => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Bilinear ('low') resampling for the baked-label blits - deliberately.
    // 'high' and 'medium' send every transformed drawImage through Skia's
    // mipmapped path, which is what made the heroes GPU-bound (measured on an
    // RTX 3070 at 1920x1080: Arcane ~85 fps with stalls -> 240 flat, Astra
    // ~33 -> ~175); the labels bake at or above on-screen size, so bilinear
    // downscaling loses nothing visible and the parity pins hold unchanged.
    // (Setting canvas size above resets context state, so this comes after.)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    opts.onResize?.(canvas.clientWidth || 1, canvas.clientHeight || 1, dpr);
    if (!running) opts.draw(performance.now());
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) start();
      else stop();
    },
    { threshold: 0 }
  );
  io.observe(canvas);

  return {
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
    }
  };
}
