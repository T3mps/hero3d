// Minimal DOM stand-ins for the modules that create canvases, so their logic
// runs under vitest's node environment. Only what hero3d touches is faked.
import { vi } from 'vitest';

export interface FakeCtx2D {
  canvas: FakeCanvas;
  fillStyle: string | object;
  strokeStyle: string | object;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  lineWidth: number;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  calls: string[];
  [method: string]: unknown;
}

export interface FakeCanvas extends EventTarget {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  getContext(kind: string): unknown;
}

const METHODS = [
  'save', 'restore', 'translate', 'scale', 'transform', 'setTransform', 'drawImage', 'fillText', 'fillRect',
  'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'clip', 'addColorStop'
];

export function fakeCtx2D(canvas: FakeCanvas): FakeCtx2D {
  const ctx: FakeCtx2D = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    lineWidth: 1,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    calls: []
  };
  for (const m of METHODS) ctx[m] = (...args: unknown[]) => { ctx.calls.push(`${m}(${args.filter((a) => typeof a !== 'object').join(',')})`); };
  ctx.measureText = (text: string) => ({
    width: text.length * 6,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: text.length * 6,
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2
  });
  const gradient = () => ({ stops: [] as [number, string][], addColorStop(k: number, c: string) { this.stops.push([k, c]); } });
  ctx.createRadialGradient = gradient;
  ctx.createLinearGradient = gradient;
  return ctx;
}

export function fakeCanvas(w = 300, h = 150, ctxFor?: (kind: string, c: FakeCanvas) => unknown): FakeCanvas {
  const target = new EventTarget() as FakeCanvas;
  target.width = w;
  target.height = h;
  target.clientWidth = w;
  target.clientHeight = h;
  let ctx2d: FakeCtx2D | null = null;
  target.getContext = (kind: string) => {
    if (ctxFor) return ctxFor(kind, target);
    if (kind !== '2d') return null;
    return (ctx2d ??= fakeCtx2D(target));
  };
  return target;
}

/** Install a fake `document` whose createElement('canvas') returns fake canvases.
 *  Returns the list of canvases created, so a test can count bakes. */
export function installDocument(): { created: FakeCanvas[]; restore(): void } {
  const created: FakeCanvas[] = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`fake document: no <${tag}>`);
      const c = fakeCanvas();
      created.push(c);
      return c;
    }
  });
  return { created, restore: () => vi.unstubAllGlobals() };
}

export interface GLCall {
  name: string;
  args: unknown[];
}

/** A recording WebGL / WebGL 2 context: every method call is logged, enum
 *  constants read back as their own names, create* returns a tagged handle,
 *  and `fail` lets a test make one step fail. */
export function fakeGL(opts: { fail?: 'compile' | 'link'; maxSamples?: number } = {}) {
  const calls: GLCall[] = [];
  let handle = 0;
  const live = new Set<string>();
  const results: Record<string, (...args: unknown[]) => unknown> = {
    getShaderParameter: () => opts.fail !== 'compile',
    getProgramParameter: () => opts.fail !== 'link',
    getShaderInfoLog: () => 'fake compile error',
    getProgramInfoLog: () => 'fake link error',
    getAttribLocation: () => 0,
    getUniformLocation: (_p, name) => ({ uniform: name }),
    getParameter: (p) => (p === 'MAX_SAMPLES' ? (opts.maxSamples ?? 4) : 0),
    isContextLost: () => false,
    getExtension: () => null
  };
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'calls') return calls;
      if (prop === 'live') return live;
      if (prop === 'drawingBufferWidth') return 300;
      if (prop === 'drawingBufferHeight') return 150;
      if (/^[A-Z0-9_]+$/.test(prop)) return prop;
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        if (prop.startsWith('create')) {
          const h = `${prop.slice(6)}#${++handle}`;
          live.add(h);
          return h;
        }
        if (prop.startsWith('delete')) live.delete(args[0] as string);
        return results[prop]?.(...args);
      };
    }
  });
  return gl as unknown as WebGL2RenderingContext & { calls: GLCall[]; live: Set<string> };
}

/** The browser pieces the lifecycle uses: matchMedia, devicePixelRatio, the two
 *  observers and a manually-driven requestAnimationFrame. */
export function installHeroEnv(env: { reduced?: boolean; dpr?: number } = {}) {
  let rafQueue: { id: number; cb: FrameRequestCallback }[] = [];
  let nextId = 0;
  let io: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
  let ro: (() => void) | null = null;
  vi.stubGlobal('window', {
    devicePixelRatio: env.dpr ?? 1,
    matchMedia: (q: string) => ({ matches: q.includes('reduce') ? !!env.reduced : false })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push({ id: ++nextId, cb });
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue = rafQueue.filter((f) => f.id !== id);
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: () => void) { ro = cb; }
    observe() {}
    disconnect() { ro = null; }
  });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) { io = cb; }
    observe() {}
    disconnect() { io = null; }
  });
  return {
    /** Run one RAF tick at `ts`. */
    tick(ts: number) {
      const due = rafQueue;
      rafQueue = [];
      for (const f of due) f.cb(ts);
    },
    pending: () => rafQueue.length,
    intersect: (isIntersecting: boolean) => io?.([{ isIntersecting }]),
    resize: () => ro?.(),
    restore: () => vi.unstubAllGlobals()
  };
}
