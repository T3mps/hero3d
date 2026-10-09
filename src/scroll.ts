// Scroll-driven heroes: progress through a section as 0..1, delivered once per
// frame, ready to drive a camera rail (interpKeys with keys at t in [0, 1],
// sampleSmoothRail, lerpPose for a page-to-scene move). Pure maths plus one
// small listener.
import { clamp01 } from './math.js';

export type ScrollMode =
  /** 0 when the element's top meets the viewport bottom, 1 when its bottom
   *  leaves the viewport top. */
  | 'through'
  /** For a tall section with a sticky stage: 0 when its top reaches the
   *  viewport top, 1 when its bottom reaches the viewport bottom. */
  | 'pinned';

/** Progress from an element's viewport rect (getBoundingClientRect). */
export function scrollProgress(rect: { top: number; height: number }, viewportH: number, mode: ScrollMode = 'through'): number {
  if (mode === 'pinned') return clamp01(-rect.top / Math.max(1, rect.height - viewportH));
  return clamp01((viewportH - rect.top) / Math.max(1, viewportH + rect.height));
}

/** Frame-rate-independent exponential approach of `current` to `target`:
 *  `lambda` is the rate per second (higher is snappier), `dt` in seconds. For
 *  a camera that follows the scroll with a little inertia. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  target + (current - target) * Math.exp(-lambda * dt);

/** Call `onProgress(p)` with the element's scroll progress whenever it changes,
 *  at most once a frame, and once up front. Returns the unsubscribe. */
export function createScrollTimeline(el: Element, onProgress: (p: number) => void, opts: { mode?: ScrollMode } = {}): () => void {
  let raf = 0;
  let last = NaN;
  const measure = () => {
    raf = 0;
    const p = scrollProgress(el.getBoundingClientRect(), window.innerHeight, opts.mode);
    if (p !== last) {
      last = p;
      onProgress(p);
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(measure);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  measure();
  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
  };
}
