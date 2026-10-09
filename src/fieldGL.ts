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

export interface BakedField {
  resize(cssW: number, cssH: number, dpr: number): void;
  render(cam: Camera, centerOff?: { x: number; y: number }): void;
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

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function createBakedField(
  canvas: HTMLCanvasElement,
  geom: { triangles: number[]; lines: number[] }
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

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

  const STRIDE = 7 * 4; // bytes
  const triBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.triangles), gl.STATIC_DRAW);
  const triCount = geom.triangles.length / 7;
  const lineBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.lines), gl.STATIC_DRAW);
  const lineCount = geom.lines.length / 7;

  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aColor = gl.getAttribLocation(prog, 'aColor');
  const uCamPos = gl.getUniformLocation(prog, 'uCamPos');
  const uRight = gl.getUniformLocation(prog, 'uRight');
  const uUp = gl.getUniformLocation(prog, 'uUp');
  const uFwd = gl.getUniformLocation(prog, 'uFwd');
  const uF = gl.getUniformLocation(prog, 'uF');
  const uHalfView = gl.getUniformLocation(prog, 'uHalfView');
  const uCenterOff = gl.getUniformLocation(prog, 'uCenterOff');
  const uNear = gl.getUniformLocation(prog, 'uNear');

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied over

  let cssW = 1;
  let cssH = 1;

  const bindAttribs = () => {
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, STRIDE, 3 * 4);
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
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const { right, up, fwd } = cameraBasis(cam);
      const f = focalLength(cam, cssH);
      gl.useProgram(prog);
      gl.uniform3f(uCamPos, cam.pos.x, cam.pos.y, cam.pos.z);
      gl.uniform3f(uRight, right.x, right.y, right.z);
      gl.uniform3f(uUp, up.x, up.y, up.z);
      gl.uniform3f(uFwd, fwd.x, fwd.y, fwd.z);
      gl.uniform1f(uF, f);
      gl.uniform2f(uHalfView, cssW / 2, cssH / 2);
      gl.uniform2f(uCenterOff, centerOff.x, centerOff.y);
      gl.uniform1f(uNear, NEAR);
      gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
      bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, triCount);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      bindAttribs();
      gl.drawArrays(gl.LINES, 0, lineCount);
    },
    destroy() {
      gl.deleteBuffer(triBuf);
      gl.deleteBuffer(lineBuf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    }
  };
}
