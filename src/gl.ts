// Small WebGL2 helpers shared by GL heroes: programs, textures, render targets,
// the fullscreen triangle and attribute/texture binding. No hero domain here.
// Failures throw a Hero3DGLError (see errors.ts) after deleting what they made.
import { Hero3DGLError } from './errors.js';

/** compileProgram also serves WebGL 1 (the baked field). */
export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

/** A create* result, or a 'context' error: they return null only on a lost context. */
const must = <T>(made: T | null, what: string): T => {
  if (made === null) throw new Hero3DGLError('context', `could not create a ${what} (context lost?)`);
  return made;
};

export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos; out vec2 vUv; void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

export function compileProgram(gl: GLContext, vs: string, fs: string): WebGLProgram {
  const made: WebGLShader[] = [];
  const shader = (type: number, src: string) => {
    const sh = must(gl.createShader(type), 'shader');
    made.push(sh);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      for (const m of made) gl.deleteShader(m);
      throw new Hero3DGLError('compile', type === gl.VERTEX_SHADER ? 'vertex shader' : 'fragment shader', log);
    }
    return sh;
  };
  const v = shader(gl.VERTEX_SHADER, vs);
  const f = shader(gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) {
    gl.deleteShader(v);
    gl.deleteShader(f);
    throw new Hero3DGLError('context', 'could not create a program (context lost?)');
  }
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  const linked = gl.getProgramParameter(p, gl.LINK_STATUS);
  const log = linked ? null : gl.getProgramInfoLog(p);
  // a linked program keeps working after its shaders are flagged for deletion
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!linked) {
    gl.deleteProgram(p);
    throw new Hero3DGLError('link', 'program', log);
  }
  return p;
}

/** A program with cached uniform locations. */
export interface Program {
  p: WebGLProgram;
  u(name: string): WebGLUniformLocation | null;
}
export function program(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const p = compileProgram(gl, vs, fs), cache = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u(name) {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name)!;
    }
  };
}

/** Immutable-storage texture, linear filtering, clamped. */
export function texture(gl: WebGL2RenderingContext, w: number, h: number, format: number, levels = 1): WebGLTexture {
  const t = must(gl.createTexture(), 'texture');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, levels, format, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export interface Target {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}
export function target(gl: WebGL2RenderingContext, w: number, h: number, format: number, levels = 1): Target {
  const tex = texture(gl, w, h, format, levels), fb = gl.createFramebuffer();
  if (!fb) {
    gl.deleteTexture(tex);
    throw new Hero3DGLError('context', 'could not create a framebuffer (context lost?)');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}
export function deleteTarget(gl: WebGL2RenderingContext, t: Target | null | undefined) {
  if (!t) return;
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fb);
}

/** One triangle covering clip space (draw 3 vertices). */
export function fullscreenTriangle(gl: WebGL2RenderingContext): WebGLBuffer {
  const b = must(gl.createBuffer(), 'buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return b;
}

/** Point a float attribute of `prog` at `buf` (no-op when the attribute was optimised away). */
export function attrib(gl: WebGL2RenderingContext, prog: Program, buf: WebGLBuffer, name: string, size: number, stride = 0, offset = 0) {
  const loc = gl.getAttribLocation(prog.p, name);
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
}

export function bindTexture(gl: WebGL2RenderingContext, prog: Program, unit: number, tex: WebGLTexture, name: string) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(prog.u(name), unit);
}

/** Draw into a target (or the canvas when null) with the viewport set to it. */
export function into(gl: WebGL2RenderingContext, t: Target | null, w?: number, h?: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
  gl.viewport(0, 0, t ? t.w : w ?? gl.drawingBufferWidth, t ? t.h : h ?? gl.drawingBufferHeight);
}
