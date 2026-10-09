// Generic baked-field GPU renderer for hero canvases.
//
// Large static background geometry (fields of dim tiles, gridlines) is
// fill-heavy where 2D canvas janks at 2x DPR - the GPU eats it. The caller
// bakes its world-space geometry ONCE into triangle/line vertex arrays (with
// per-vertex color, fog folded into alpha); every frame only the camera
// uniforms change and the GPU redraws the static buffers.
//
// The vertex shader reproduces camera.ts's project() exactly (look-at basis +
// perspective, screen = centre + camSpace * f / cz), so GL geometry lines up
// pixel-for-pixel with 2D-canvas drawing of the same world.
import { type Camera, NEAR, cameraBasis, focalLength } from './camera.js';
import { Hero3DGLError } from './errors.js';
import { compileProgram } from './gl.js';

export interface BakedField {
  resize(cssW: number, cssH: number, dpr: number): void;
  render(cam: Camera, centerOff?: { x: number; y: number }): void;
  /** Rebuild the GL side on the canvas's (restored) context. The field does
   *  this itself on `webglcontextrestored`; false if the rebuild failed. */
  restore(): boolean;
  destroy(): void;
}

const VERT = `
attribute vec3 aPos;
attribute vec4 aColor;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uF;
uniform vec2 uHalfView; // css px / 2
uniform vec2 uCenterOff; // css px shift of the projection centre (x right, y down)
uniform float uNear; // camera.ts NEAR
varying vec4 vColor;
void main() {
  vec3 d = aPos - uCamPos;
  float cz = dot(d, uFwd);
  float cx = dot(d, uRight);
  float cy = dot(d, uUp);
  // screen-space offset in px, then to NDC; multiply by cz and set w=cz so the
  // perspective divide reproduces project()'s cx*f/cz exactly. z = cz - 2*near
  // puts the GPU's near test (-w <= z) at cz >= near, the CPU path's NEAR; the
  // far test (z <= w) always holds and depth testing is off, so z does nothing else.
  float ndcX = (cx * uF / cz + uCenterOff.x) / uHalfView.x;
  float ndcY = (cy * uF / cz - uCenterOff.y) / uHalfView.y;
  gl_Position = vec4(ndcX * cz, ndcY * cz, cz - 2.0 * uNear, cz);
  vColor = aColor;
}`;

const FRAG = `
precision mediump float;
varying vec4 vColor;
// premultiplied output so it composites correctly over the page (blend ONE /
// ONE_MINUS_SRC_ALPHA on a transparent-cleared, premultiplied-alpha canvas)
void main() { gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a); }`;

/** The GL side of a field: everything a lost context takes with it. */
interface FieldGL {
  prog: WebGLProgram;
  triBuf: WebGLBuffer;
  lineBuf: WebGLBuffer;
  aPos: number;
  aColor: number;
  u: (name: string) => WebGLUniformLocation | null;
}

/** Build the program and the static buffers. Throws a Hero3DGLError after
 *  deleting whatever it made. */
function build(gl: WebGLRenderingContext, triangles: Float32Array, lines: Float32Array): FieldGL {
  const prog = compileProgram(gl, VERT, FRAG);
  const triBuf = gl.createBuffer();
  const lineBuf = gl.createBuffer();
  if (!triBuf || !lineBuf) {
    if (triBuf) gl.deleteBuffer(triBuf);
    if (lineBuf) gl.deleteBuffer(lineBuf);
    gl.deleteProgram(prog);
    throw new Hero3DGLError('context', 'could not create a buffer (context lost?)');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  return {
    prog,
    triBuf,
    lineBuf,
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aColor: gl.getAttribLocation(prog, 'aColor'),
    u: (name) => {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(prog, name));
      return uniforms.get(name) ?? null;
    }
  };
}

/** Bake a field onto `canvas` (it takes the canvas's WebGL 1 context).
 *  Returns null when WebGL is unavailable or setup fails - the documented
 *  pattern: leave the canvas empty and let the page's CSS fallback show.
 *
 *  Context loss is handled here: while lost, render() is a no-op; on restore
 *  the field rebuilds itself and calls `onRestored` (a hero that only draws on
 *  demand, e.g. under reduced motion, redraws there). */
export function createBakedField(
  canvas: HTMLCanvasElement,
  geom: { triangles: number[]; lines: number[] },
  opts: { onRestored?(): void } = {}
): BakedField | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    // MSAA resolve on the full dpr-scaled buffer is a per-pixel cost that shows
    // up only at 2x DPR; baked fields render at device resolution already, so
    // the extra samples buy little. Off keeps 2x DPR smooth.
    antialias: false,
    depth: false
  }) as WebGLRenderingContext | null;
  if (!gl) return null;

  const STRIDE = 7 * 4; // bytes
  const triangles = new Float32Array(geom.triangles);
  const lines = new Float32Array(geom.lines);
  const triCount = geom.triangles.length / 7;
  const lineCount = geom.lines.length / 7;

  let res: FieldGL;
  try {
    res = build(gl, triangles, lines);
  } catch (e) {
    if (e instanceof Hero3DGLError) return null;
    throw e;
  }

  let cssW = 1;
  let cssH = 1;
  let lost = false;

  const restore = (): boolean => {
    try {
      res = build(gl, triangles, lines);
    } catch (e) {
      if (e instanceof Hero3DGLError) return false;
      throw e;
    }
    lost = false;
    gl.viewport(0, 0, canvas.width, canvas.height);
    return true;
  };
  const onLost = (e: Event) => {
    e.preventDefault(); // ask the browser to restore the context
    lost = true;
  };
  const onRestored = () => {
    if (restore()) opts.onRestored?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const bindAttribs = () => {
    gl.enableVertexAttribArray(res.aPos);
    gl.vertexAttribPointer(res.aPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(res.aColor);
    gl.vertexAttribPointer(res.aColor, 4, gl.FLOAT, false, STRIDE, 3 * 4);
  };

  return {
    resize(w: number, h: number, dpr: number) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    render(cam: Camera, centerOff: { x: number; y: number } = { x: 0, y: 0 }) {
      if (lost) return;
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied over
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const { right, up, fwd } = cameraBasis(cam);
      const f = focalLength(cam, cssH);
      gl.useProgram(res.prog);
      gl.uniform3f(res.u('uCamPos'), cam.pos.x, cam.pos.y, cam.pos.z);
      gl.uniform3f(res.u('uRight'), right.x, right.y, right.z);
      gl.uniform3f(res.u('uUp'), up.x, up.y, up.z);
      gl.uniform3f(res.u('uFwd'), fwd.x, fwd.y, fwd.z);
      gl.uniform1f(res.u('uF'), f);
      gl.uniform2f(res.u('uHalfView'), cssW / 2, cssH / 2);
      gl.uniform2f(res.u('uCenterOff'), centerOff.x, centerOff.y);
      gl.uniform1f(res.u('uNear'), NEAR);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.triBuf);
      bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, triCount);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.lineBuf);
      bindAttribs();
      gl.drawArrays(gl.LINES, 0, lineCount);
    },
    restore,
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (lost) return; // a lost context's objects are already gone
      gl.deleteBuffer(res.triBuf);
      gl.deleteBuffer(res.lineBuf);
      gl.deleteProgram(res.prog);
    }
  };
}
