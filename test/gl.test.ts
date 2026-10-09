import { describe, expect, it } from 'vitest';
import { Hero3DGLError } from '../src/errors.js';
import { GL2_DEFAULTS, createGL2, deleteMsaaTarget, msaaTarget, resolve, target } from '../src/gl.js';
import { fakeCanvas, fakeGL } from './fakeDom.js';

describe('createGL2', () => {
  it('asks for webgl2 with the hero defaults, overridable', () => {
    let asked: [string, unknown] | null = null;
    const gl = fakeGL();
    const canvas = fakeCanvas(10, 10, (kind) => kind);
    canvas.getContext = ((kind: string, attrs: unknown) => {
      asked = [kind, attrs];
      return gl;
    }) as never;
    expect(createGL2(canvas as unknown as HTMLCanvasElement, { antialias: true })).toBe(gl);
    expect(asked).toEqual(['webgl2', { ...GL2_DEFAULTS, antialias: true }]);
    expect(GL2_DEFAULTS.failIfMajorPerformanceCaveat).toBe(true);
  });

  it('is null when there is no context, and when getContext throws', () => {
    expect(createGL2(fakeCanvas(10, 10, () => null) as unknown as HTMLCanvasElement)).toBeNull();
    const throwing = fakeCanvas(10, 10, () => {
      throw new Error('nope');
    });
    expect(createGL2(throwing as unknown as HTMLCanvasElement)).toBeNull();
  });
});

describe('msaaTarget and resolve', () => {
  it('clamps samples to MAX_SAMPLES and allocates colour and depth storage', () => {
    const gl = fakeGL({ maxSamples: 2 });
    const t = msaaTarget(gl, 640, 360, { samples: 8, depth: true });
    expect(t.samples).toBe(2);
    const storage = gl.calls.filter((c) => c.name === 'renderbufferStorageMultisample').map((c) => c.args.slice(1));
    expect(storage).toEqual([
      [2, 'RGBA8', 640, 360],
      [2, 'DEPTH_COMPONENT24', 640, 360]
    ]);
    const attached = gl.calls.filter((c) => c.name === 'framebufferRenderbuffer').map((c) => c.args[1]);
    expect(attached).toEqual(['COLOR_ATTACHMENT0', 'DEPTH_ATTACHMENT']);
  });

  it('resize reallocates storage on the same handles', () => {
    const gl = fakeGL();
    const t = msaaTarget(gl, 10, 10);
    const handles = [t.fb, t.color];
    gl.calls.length = 0;
    t.resize(20, 30);
    expect([t.w, t.h]).toEqual([20, 30]);
    expect(gl.calls.find((c) => c.name === 'renderbufferStorageMultisample')!.args.slice(3)).toEqual([20, 30]);
    expect([t.fb, t.color]).toEqual(handles);
    expect(gl.calls.some((c) => c.name.startsWith('create'))).toBe(false);
  });

  it('resolves into a texture target with a same-size blit', () => {
    const gl = fakeGL();
    const src = msaaTarget(gl, 64, 32);
    const dst = target(gl, 64, 32, gl.RGBA8);
    gl.calls.length = 0;
    resolve(gl, src, dst);
    const blit = gl.calls.find((c) => c.name === 'blitFramebuffer')!;
    expect(blit.args).toEqual([0, 0, 64, 32, 0, 0, 64, 32, 'COLOR_BUFFER_BIT', 'NEAREST']);
    expect(gl.calls[0].args).toEqual(['READ_FRAMEBUFFER', src.fb]);
    expect(gl.calls[1].args).toEqual(['DRAW_FRAMEBUFFER', dst.fb]);
  });

  it('an incomplete framebuffer throws a framebuffer error and leaks nothing; delete frees a target', () => {
    const bad = fakeGL({ fail: 'framebuffer' });
    expect(() => msaaTarget(bad, 10, 10, { depth: true })).toThrow(Hero3DGLError);
    expect(bad.live.size).toBe(0);
    const gl = fakeGL();
    const t = msaaTarget(gl, 10, 10, { depth: true });
    expect(gl.live.size).toBe(3);
    deleteMsaaTarget(gl, t);
    expect(gl.live.size).toBe(0);
  });
});
