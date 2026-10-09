import { describe, expect, it } from 'vitest';
import { gridGeometry, gridMesh, deleteGridMesh } from '../src/mesh.js';
import { fakeGL } from './fakeDom.js';

describe('gridGeometry', () => {
  it('lays out (segX+1)(segY+1) UVs over [0,1] and two triangles per quad', () => {
    const { uv, index } = gridGeometry(2, 1);
    expect(Array.from(uv)).toEqual([0, 0, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1, 1]);
    expect(Array.from(index)).toEqual([0, 3, 1, 3, 4, 1, 1, 4, 2, 4, 5, 2]);
  });

  it('uses 16-bit indices while they fit (the ribbon: 256 x 128 = 33,153 vertices) and 32-bit after', () => {
    const ribbon = gridGeometry(256, 128);
    expect(ribbon.index).toBeInstanceOf(Uint16Array);
    expect(ribbon.uv.length / 2).toBe(33153);
    expect(ribbon.index.length).toBe(256 * 128 * 6);
    expect(Array.from(ribbon.index).reduce((a, b) => Math.max(a, b), 0)).toBe(33152);
    expect(gridGeometry(255, 255).index).toBeInstanceOf(Uint16Array); // 65,536 exactly
    expect(gridGeometry(256, 256).index).toBeInstanceOf(Uint32Array);
  });

  it('rejects a degenerate grid', () => {
    expect(() => gridGeometry(0, 4)).toThrow(RangeError);
    expect(() => gridGeometry(2.5, 4)).toThrow(RangeError);
  });
});

describe('gridMesh', () => {
  it('uploads both buffers and reports the draw parameters', () => {
    const gl = fakeGL();
    const m = gridMesh(gl, 256, 128);
    expect(m.count).toBe(256 * 128 * 6);
    expect(m.indexType).toBe('UNSIGNED_SHORT');
    expect(gl.calls.filter((c) => c.name === 'bufferData').map((c) => c.args[0])).toEqual(['ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER']);
    expect(gridMesh(gl, 300, 300).indexType).toBe('UNSIGNED_INT');
    deleteGridMesh(gl, m);
    expect(gl.live.has(m.uvBuffer as unknown as string)).toBe(false);
  });
});
