import { describe, expect, it } from 'vitest';
import { NEAR, type Camera } from '../src/camera.js';
import { createBakedField } from '../src/fieldGL.js';
import { fakeCanvas, fakeGL } from './fakeDom.js';

const cam: Camera = { pos: { x: 0, y: 2, z: -5 }, target: { x: 0, y: 0, z: 0 }, fov: 1 };
const geom = { triangles: [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1], lines: [] };

const make = (opts?: Parameters<typeof fakeGL>[0]) => {
  const gl = fakeGL(opts);
  const canvas = fakeCanvas(800, 600, (kind) => (kind === 'webgl' ? gl : null));
  return { gl, canvas };
};

describe('baked field: near plane (I4)', () => {
  it('clips at NEAR on the GPU, like the CPU projectors', () => {
    const { gl, canvas } = make();
    const field = createBakedField(canvas as unknown as HTMLCanvasElement, geom)!;
    field.resize(800, 600, 1);
    field.render(cam);
    const vs = gl.calls.find((c) => c.name === 'shaderSource' && String(c.args[1]).includes('gl_Position'))!;
    expect(String(vs.args[1])).toContain('gl_Position = vec4(ndcX * cz, ndcY * cz, cz - 2.0 * uNear, cz)');
    const near = gl.calls.find((c) => c.name === 'uniform1f' && (c.args[0] as { uniform: string }).uniform === 'uNear');
    expect(near?.args[1]).toBe(NEAR);
  });

  it('the emitted clip z passes the GPU near test exactly when cz >= NEAR', () => {
    // GL clips a vertex unless -w <= z <= w; here w = cz and z = cz - 2 * near
    const visible = (cz: number) => -cz <= cz - 2 * NEAR && cz - 2 * NEAR <= cz;
    expect(visible(NEAR - 1e-6)).toBe(false);
    expect(visible(0.2)).toBe(false);
    expect(visible(NEAR)).toBe(true);
    expect(visible(1e6)).toBe(true);
  });
});
