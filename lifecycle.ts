// Canvas lifecycle scaffold shared by hero actions: DPR-scaled sizing,
// resize + intersection observers, reduced-motion handling, and the RAF loop.
// Under reduced motion the hero draws exactly once per resize and never
// animates; the hero decides its own frame-time mapping from the flag.

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clampDpr = (max = 2) => Math.min(window.devicePixelRatio || 1, max);

export interface HeroCanvasOpts {
  draw(now: number): void;
  /** Rebuild size-dependent resources (vignettes, sibling GL canvases, ...). */
  onResize?(w: number, h: number, dpr: number): void;
  dpr?: number; // pass the hero's own clamped value; defaults to clampDpr()
  reduced?: boolean; // pass the hero's own flag; defaults to prefersReducedMotion()
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

  let rafId = 0;
  let running = false;
  const loop = (ts: number) => {
    opts.draw(ts);
    rafId = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduced) return;
    running = true;
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
    // high-quality resampling for baked-label blits (setting canvas size
    // above resets context state, so this must come after)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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
