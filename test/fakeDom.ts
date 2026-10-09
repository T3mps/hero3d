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
