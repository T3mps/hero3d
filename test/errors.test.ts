import { describe, expect, it } from 'vitest';
import { Hero3DGLError } from '../src/errors.js';
import { createBakedField } from '../src/fieldGL.js';
import { compileProgram, program } from '../src/gl.js';
import { fakeCanvas, fakeGL } from './fakeDom.js';

const VS = 'void main(){}';
const FS = 'void main(){}';
const geom = { triangles: [], lines: [] };

describe('one GL error model (I6)', () => {
  it('compileProgram returns a linked program and flags its shaders for deletion', () => {
    const gl = fakeGL();
    const p = compileProgram(gl, VS, FS);
    expect(gl.live).toEqual(new Set([p]));
  });

  for (const fail of ['compile', 'link'] as const) {
    it(`a ${fail} failure throws a typed Hero3DGLError and leaks nothing`, () => {
      const gl = fakeGL({ fail });
      let err: unknown;
      try {
        program(gl, VS, FS);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Hero3DGLError);
      expect((err as Hero3DGLError).kind).toBe(fail);
      expect((err as Hero3DGLError).log).toMatch(/fake/);
      expect(gl.live.size).toBe(0);
    });
  }

  it('createBakedField is the null-returning wrapper: no context, or a failed setup, gives null and leaks nothing', () => {
    expect(createBakedField(fakeCanvas(10, 10, () => null) as unknown as HTMLCanvasElement, geom)).toBeNull();
    const gl = fakeGL({ fail: 'link' });
    const canvas = fakeCanvas(10, 10, () => gl) as unknown as HTMLCanvasElement;
    expect(createBakedField(canvas, geom)).toBeNull();
    expect(gl.live.size).toBe(0);
  });

  it('destroy releases everything a field made', () => {
    const gl = fakeGL();
    const field = createBakedField(fakeCanvas(10, 10, () => gl) as unknown as HTMLCanvasElement, geom)!;
    expect(gl.live.size).toBe(3); // program + two buffers
    field.destroy();
    expect(gl.live.size).toBe(0);
  });
});
