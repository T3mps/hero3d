// Adaptive quality and frame telemetry. A hero that is smooth on a desktop GPU
// can struggle on a laptop on battery; the governor watches the interval
// between drawn frames and steps a quality level (usually the DPR) down when
// frames run long, and back up after sustained headroom. Hysteresis and a
// cooldown keep it from flapping. Pure: feed it intervals, read the level.

/** Rolling frame statistics over the last `size` intervals. */
export interface FrameStats {
  fps: number;
  p50: number;
  p95: number;
  worst: number;
  frames: number;
}

export function createFrameWindow(size = 120) {
  const buf: number[] = [];
  return {
    push(ms: number) {
      buf.push(ms);
      if (buf.length > size) buf.shift();
    },
    clear() {
      buf.length = 0;
    },
    get length() {
      return buf.length;
    },
    stats(): FrameStats {
      if (!buf.length) return { fps: 0, p50: 0, p95: 0, worst: 0, frames: 0 };
      const s = [...buf].sort((a, b) => a - b);
      const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
      const mean = buf.reduce((a, b) => a + b, 0) / buf.length;
      return { fps: 1000 / mean, p50: at(0.5), p95: at(0.95), worst: s[s.length - 1], frames: buf.length };
    }
  };
}

export interface GovernorOpts {
  /** Quality values from best to cheapest, e.g. DPRs [2, 1.5, 1]. */
  levels: readonly number[];
  /** The frame interval the hero should hit. Default 1000 / 60. */
  budgetMs?: number;
  /** Intervals per decision. Default 45. */
  window?: number;
  /** Step down when the window's p90 exceeds budget x this. Default 1.4. */
  slow?: number;
  /** Step up when the p90 stays under budget x this... Default 1.1. */
  fast?: number;
  /** ...for this long. Default 5000 ms. */
  upAfterMs?: number;
}

export interface QualityGovernor {
  /** Index into levels (0 = best). */
  readonly level: number;
  readonly value: number;
  /** Feed one drawn-frame interval at time `now` (ms). True when the level changed. */
  sample(intervalMs: number, now: number): boolean;
  /** Forget the window (after a pause, a resize, a tab switch). */
  reset(): void;
}

export function createQualityGovernor(opts: GovernorOpts): QualityGovernor {
  const budget = opts.budgetMs ?? 1000 / 60;
  const size = opts.window ?? 45;
  const win = createFrameWindow(size);
  let level = 0;
  let fastSince = NaN;
  const p90 = () => {
    const s = win.stats();
    return s.p50 + (s.p95 - s.p50) * 0.8; // between p50 and p95, robust to one hitch
  };
  return {
    get level() {
      return level;
    },
    get value() {
      return opts.levels[level];
    },
    sample(ms, now) {
      win.push(ms);
      if (win.length < size) return false;
      const p = p90();
      if (p > budget * (opts.slow ?? 1.4) && level < opts.levels.length - 1) {
        level += 1;
        win.clear();
        fastSince = NaN;
        return true;
      }
      if (p < budget * (opts.fast ?? 1.1)) {
        if (Number.isNaN(fastSince)) fastSince = now;
        if (level > 0 && now - fastSince >= (opts.upAfterMs ?? 5000)) {
          level -= 1;
          win.clear();
          fastSince = NaN;
          return true;
        }
      } else fastSince = NaN;
      return false;
    },
    reset() {
      win.clear();
      fastSince = NaN;
    }
  };
}
