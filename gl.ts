// Small WebGL2 helpers shared by GL heroes: programs, textures, render targets,
// the fullscreen triangle and attribute/texture binding. No hero domain here.

export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos; out vec2 vUv; void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

export function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram()!;
  const v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(p)}`);
  gl.deleteShader(v);
  gl.deleteShader(f);
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
  const t = gl.createTexture()!;
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
  const tex = texture(gl, w, h, format, levels), fb = gl.createFramebuffer()!;
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
  const b = gl.createBuffer()!;
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
