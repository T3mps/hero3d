// An indexed plane grid carrying only UVs: the shape a vertex shader deforms
// into a ribbon, a flag, a terrain. segX x segY quads, (segX+1)(segY+1) vertices.
import { Hero3DGLError } from './errors.js';

export interface GridGeometry {
  /** u, v per vertex, row by row (v outer), both in [0, 1]. */
  uv: Float32Array;
  /** Two triangles per quad. 16-bit when the vertex count allows, else 32-bit. */
  index: Uint16Array | Uint32Array;
}

/** The grid's arrays, without touching GL. */
export function gridGeometry(segX: number, segY: number): GridGeometry {
  if (!(segX >= 1 && segY >= 1) || !Number.isInteger(segX) || !Number.isInteger(segY)) {
    throw new RangeError(`gridGeometry: segX and segY must be positive integers (got ${segX} x ${segY})`);
  }
  const cols = segX + 1;
  const verts = cols * (segY + 1);
  const uv = new Float32Array(verts * 2);
  let n = 0;
  for (let j = 0; j <= segY; j += 1) {
    for (let i = 0; i <= segX; i += 1) {
      uv[n++] = i / segX;
      uv[n++] = j / segY;
    }
  }
  const index = verts <= 65536 ? new Uint16Array(segX * segY * 6) : new Uint32Array(segX * segY * 6);
  n = 0;
  for (let j = 0; j < segY; j += 1) {
    for (let i = 0; i < segX; i += 1) {
      const a = j * cols + i;
      const b = a + cols;
      index[n++] = a;
      index[n++] = b;
      index[n++] = a + 1;
      index[n++] = b;
      index[n++] = b + 1;
      index[n++] = a + 1;
    }
  }
  return { uv, index };
}

export interface GridMesh {
  uvBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  /** Index count, for drawElements. */
  count: number;
  /** UNSIGNED_SHORT or UNSIGNED_INT, for drawElements. */
  indexType: number;
}

/** Upload a grid: draw it with
 *  `gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0)` after
 *  binding `uvBuffer` to a vec2 attribute and `indexBuffer` as ELEMENT_ARRAY_BUFFER. */
export function gridMesh(gl: WebGL2RenderingContext, segX: number, segY: number): GridMesh {
  const { uv, index } = gridGeometry(segX, segY);
  const uvBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!uvBuffer || !indexBuffer) {
    if (uvBuffer) gl.deleteBuffer(uvBuffer);
    if (indexBuffer) gl.deleteBuffer(indexBuffer);
    throw new Hero3DGLError('context', 'could not create a buffer (context lost?)');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
  return {
    uvBuffer,
    indexBuffer,
    count: index.length,
    indexType: index instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT
  };
}

export function deleteGridMesh(gl: WebGL2RenderingContext, m: GridMesh | null | undefined) {
  if (!m) return;
  gl.deleteBuffer(m.uvBuffer);
  gl.deleteBuffer(m.indexBuffer);
}
