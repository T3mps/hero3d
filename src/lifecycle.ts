// Canvas lifecycle scaffold shared by hero actions: DPR-scaled sizing,
// resize + intersection observers, reduced-motion handling, and the RAF loop.
// Under reduced motion the hero draws exactly once per resize and never
// animates; the hero decides its own frame-time mapping from the flag.
//
// The contract, in full:
// - reduced motion: draw once per resize, never start a loop;
// - off screen: no frames (an IntersectionObserver starts and stops the loop);
// - frame cap: MAX_FPS (60) by default, `maxFps` overrides it;
// - DPR: clampDpr() (at most 2) by default, `dpr` overrides it;
// - time: draw(now) gets the RAF timestamp (performance.now() for the draws
//   outside the loop) unless a `clock` is given, e.g. to pin a test frame;
// - WebGL context lost (on this canvas): the loop stops; when it is restored
//   the hero's onContextRestored() rebuilds its GL state, then the canvas is
//   resized and drawn and the loop resumes if the canvas is on screen.

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The device pixel ratio held within [min, max]. The default floor of 0 keeps
 *  a zoomed-out page's sub-1 ratio; pass min = 1 to never render below CSS px. */
export const clampDpr = (max = 2, min = 0) => Math.max(min, Math.min(window.devicePixelRatio || 1, max));

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
  /** The time passed to draw(), in ms. Defaults to the RAF timestamp. Pacing
   *  always runs on the real RAF clock; this only changes what the hero sees. */
  clock?(): number;
  /** This canvas's WebGL context was lost: the loop has stopped. Release any
   *  CPU-side references to GL objects here (they are dead). */
  onContextLost?(): void;
  /** The context is back: recreate programs, buffers and textures. Passing
   *  this opts the canvas into restoration (the loss event is preventDefault-ed);
   *  without it a lost context stays lost and the canvas keeps its last frame
   *  or goes blank, as the browser decides. */
  onContextRestored?(): void;
}

export interface HeroCanvasHandle {
  destroy(): void;
}

/** `ctx` is the 2D context to set up on every resize, or null for a WebGL hero
 *  (the hero owns its GL state; the scaffold still sizes the canvas, observes it,
 *  paces the loop and honours reduced motion). */
export function createHeroCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null,
  opts: HeroCanvasOpts
): HeroCanvasHandle {
  const reduced = opts.reduced ?? prefersReducedMotion();
  const dpr = opts.dpr ?? clampDpr();

  const interval = 1000 / (opts.maxFps ?? MAX_FPS);

  let rafId = 0;
  let running = false;
  let visible = false;
  let lost = false;
  let lastDraw = -Infinity;
  let prevTick = 0;
  const loop = (ts: number) => {
    if (shouldDraw(ts, lastDraw, ts - prevTick, interval)) {
      lastDraw = ts;
      opts.draw(opts.clock ? opts.clock() : ts);
    }
    prevTick = ts;
    rafId = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduced || lost) return;
    running = true;
    prevTick = performance.now();
    rafId = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
  };

  const resize = () => {
    if (lost) return;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (ctx) {
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
    }
    opts.onResize?.(canvas.clientWidth || 1, canvas.clientHeight || 1, dpr);
    if (!running) opts.draw(opts.clock ? opts.clock() : performance.now());
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) start();
      else stop();
    },
    { threshold: 0 }
  );
  io.observe(canvas);

  const onLost = (e: Event) => {
    if (opts.onContextRestored) e.preventDefault(); // ask the browser to restore it
    lost = true;
    stop();
    opts.onContextLost?.();
  };
  const onRestored = () => {
    lost = false;
    opts.onContextRestored?.();
    resize();
    if (visible) start();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    }
  };
}
