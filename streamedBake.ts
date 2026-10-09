// Streams baked content along an endless integer axis (chunks i = ..., -1, 0, 1, ...).
// Data for a chunk is produced asynchronously (a worker) and cached; the GPU side
// is built in small steps so no frame pays for a whole bake. The hero says which
// range is in view; the stream keeps that range (plus a margin) baked, prefetches
// one chunk either side, and frees what has fallen out of reach. Pure bookkeeping:
// every GPU and worker call goes through the callbacks.

export interface ChunkStreamOpts<D, G> {
  /** Start producing chunk i's data; call `deliver(i, data)` when it arrives. */
  produce(i: number): void;
  /** Allocate chunk i's GPU side and do its first unit of work. */
  begin(i: number, data: D): G;
  /** One more unit of GPU work; true when the chunk is complete. */
  step(gpu: G): boolean;
  free(gpu: G): void;
}

interface Entry<D, G> {
  data: D | null;
  gpu: G | null;
  done: boolean;
}

export interface ChunkStream<D, G> {
  deliver(i: number, data: D): void;
  /** Declare the chunks in view: [lo, hi]. */
  want(lo: number, hi: number): void;
  /** Spend up to `steps` units of GPU work, chunks in view first. */
  pump(steps: number): void;
  /** Chunk i's GPU side, once complete. */
  ready(i: number): G | null;
  /** Whether every chunk in [lo, hi] is complete. */
  allReady(lo: number, hi: number): boolean;
  /** Free every GPU side but keep the produced data (for a resize). */
  resetGpu(): void;
  destroy(): void;
}

export function createChunkStream<D, G>(opts: ChunkStreamOpts<D, G>, { prefetch = 1, keep = 2, cacheSpan = 6 } = {}): ChunkStream<D, G> {
  const live = new Map<number, Entry<D, G>>(), cache = new Map<number, D>(), pending = new Set<number>();
  let lo = 0, hi = -1;
  const drop = (i: number) => { const e = live.get(i); if (e?.gpu) opts.free(e.gpu); live.delete(i); };
  return {
    deliver(i, data) {
      pending.delete(i);
      cache.set(i, data);
      const e = live.get(i);
      if (e && e.data === null) e.data = data;
    },
    want(a, b) {
      lo = a; hi = b;
      for (let i = lo - prefetch; i <= hi + prefetch; i += 1) {
        if (live.has(i)) continue;
        const data = cache.get(i) ?? null;
        live.set(i, { data, gpu: null, done: false });
        if (data === null && !pending.has(i)) { pending.add(i); opts.produce(i); }
      }
      for (const i of [...live.keys()]) if (i < lo - keep || i > hi + keep) drop(i);
      for (const i of [...cache.keys()]) if (i < lo - cacheSpan || i > hi + cacheSpan) cache.delete(i);
    },
    pump(steps) {
      const order = [...live.entries()].sort(([a], [b]) => {
        const va = a >= lo && a <= hi ? 0 : 1, vb = b >= lo && b <= hi ? 0 : 1;
        return va - vb || a - b;
      });
      for (const [i, e] of order) {
        if (steps <= 0) return;
        if (e.done || e.data === null) continue;
        if (!e.gpu) { e.gpu = opts.begin(i, e.data); steps -= 1; }   // then keep going on the same chunk: finish what is in view first
        while (!e.done && steps > 0) { e.done = opts.step(e.gpu); steps -= 1; }
      }
    },
    ready(i) {
      const e = live.get(i);
      return e?.done ? e.gpu : null;
    },
    allReady(a, b) {
      for (let i = a; i <= b; i += 1) if (!live.get(i)?.done) return false;
      return true;
    },
    resetGpu() {
      for (const e of live.values()) { if (e.gpu) opts.free(e.gpu); e.gpu = null; e.done = false; }
    },
    destroy() {
      for (const i of [...live.keys()]) drop(i);
      cache.clear();
      pending.clear();
    }
  };
}
