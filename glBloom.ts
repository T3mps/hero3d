// Energy-conserving halation for HDR GL heroes: a dual-Kawase pyramid (13-tap
// down, 8-tap up, each level added back on the way up) with a Karis average on
// the first downsample so single hot pixels cannot flicker. The finishing pass
// MIXES the result in (light is moved, not added), so bloom never brightens the
// frame overall. `tail` is the coarsest level, a wide veiling-glare term.
import { FULLSCREEN_VS, program, target, deleteTarget, attrib, bindTexture, into, type Target } from './gl';

const DOWN_FS = `#version 300 es
precision highp float; uniform sampler2D uT; uniform vec2 uTexel; uniform float uKaris; in vec2 vUv; out vec4 o;
vec3 k(vec3 c){ return uKaris > .5 ? c / (1. + dot(c, vec3(.2126, .7152, .0722))) : c; }
vec3 kInv(vec3 c){ return uKaris > .5 ? c / max(1e-4, 1. - dot(c, vec3(.2126, .7152, .0722))) : c; }
void main(){ vec2 h = uTexel * .5;
  vec3 s = k(texture(uT, vUv).rgb) * 4. + k(texture(uT, vUv - h).rgb) + k(texture(uT, vUv + h).rgb) + k(texture(uT, vUv + vec2(h.x, -h.y)).rgb) + k(texture(uT, vUv - vec2(h.x, -h.y)).rgb);
  o = vec4(kInv(s / 8.), 1.); }`;
const UP_FS = `#version 300 es
precision highp float; uniform sampler2D uT, uAdd; uniform vec2 uTexel; in vec2 vUv; out vec4 o;
void main(){ vec2 h = uTexel * .5;
  vec3 s = texture(uT, vUv + vec2(-h.x * 2., 0.)).rgb + texture(uT, vUv + vec2(-h.x, h.y)).rgb * 2. + texture(uT, vUv + vec2(0., h.y * 2.)).rgb + texture(uT, vUv + vec2(h.x, h.y)).rgb * 2.
         + texture(uT, vUv + vec2(h.x * 2., 0.)).rgb + texture(uT, vUv + vec2(h.x, -h.y)).rgb * 2. + texture(uT, vUv + vec2(0., -h.y * 2.)).rgb + texture(uT, vUv + vec2(-h.x, -h.y)).rgb * 2.;
  o = vec4(s / 12. + texture(uAdd, vUv).rgb, 1.); }`;

export interface Bloom {
  resize(w: number, h: number): void;
  /** Run the pyramid over `src` (full resolution HDR). */
  run(src: Target, tri: WebGLBuffer): void;
  /** The glow (half resolution) and the veiling tail (coarsest level). */
  readonly glow: WebGLTexture;
  readonly tail: WebGLTexture;
  destroy(): void;
}

export function createBloom(gl: WebGL2RenderingContext, format: number, levels = 6): Bloom {
  const down = program(gl, FULLSCREEN_VS, DOWN_FS), up = program(gl, FULLSCREEN_VS, UP_FS);
  let dn: Target[] = [], upT: Target[] = [];
  const free = () => { for (const t of [...dn, ...upT]) deleteTarget(gl, t); dn = []; upT = []; };
  return {
    resize(w, h) {
      free();
      for (let i = 0; i < levels; i += 1) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); dn.push(target(gl, w, h, format)); }
      upT = dn.slice(0, -1).map((t) => target(gl, t.w, t.h, format));
    },
    run(src, tri) {
      let from = src;
      gl.useProgram(down.p);
      attrib(gl, down, tri, 'aPos', 2);
      for (const lv of dn) {
        into(gl, lv);
        bindTexture(gl, down, 0, from.tex, 'uT');
        gl.uniform1f(down.u('uKaris'), from === src ? 1 : 0);
        gl.uniform2f(down.u('uTexel'), 1 / from.w, 1 / from.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        from = lv;
      }
      gl.useProgram(up.p);
      attrib(gl, up, tri, 'aPos', 2);
      for (let i = upT.length - 1; i >= 0; i -= 1) {
        const prev = i === upT.length - 1 ? dn[i + 1] : upT[i + 1];
        into(gl, upT[i]);
        bindTexture(gl, up, 0, prev.tex, 'uT');
        bindTexture(gl, up, 1, dn[i].tex, 'uAdd');
        gl.uniform2f(up.u('uTexel'), 1 / prev.w, 1 / prev.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    },
    get glow() { return upT[0].tex; },
    get tail() { return dn[dn.length - 1].tex; },
    destroy() { free(); gl.deleteProgram(down.p); gl.deleteProgram(up.p); }
  };
}
