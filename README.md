# @starworks/hero3d

A small, dependency-free engine for one job: **flat, text-bearing things (tiles, panels, UI screens) seen through a moving perspective camera**, drawn with Canvas 2D, with WebGL for large static backgrounds and for small WebGL 2 heroes that want the same lifecycle.

It runs the hero canvases on [starworks](https://github.com/StarworksDev/StarworksWebsite) (the Astra lattice, the Arcane editor, the star field, the Manifold2D world, the Mosaic glass) and is built for landing-page heroes: a canvas behind some copy that has to look sharp, cost little and get out of the way.

**For:**
- perspective-correct flat planes with crisp text on them;
- camera choreography (keyframes, orbits, smooth and endless dealt rails);
- Canvas 2D heroes over a baked WebGL background field;
- small WebGL 2 heroes that want the shared lifecycle, render targets and post passes.

**Not for:** general 3D scenes, models, physics or a scene graph. Use [three.js](https://threejs.org) for those.

## Install

```sh
npm i @starworks/hero3d
```

ESM only, with TypeScript types. Import from the package root, or a single module by path:

```ts
import { createHeroCanvas, createGL2 } from '@starworks/hero3d';
import { project } from '@starworks/hero3d/camera';
```

Developing the library alongside a site:

```sh
cd hero3d && npm link            # once
cd ../my-site && npm link @starworks/hero3d
cd ../hero3d && npx tsc -p tsconfig.build.json --watch
```

## Modules

| Module | What it does |
|---|---|
| `math` | `Vec3`, clamps, lerps, easing, vector ops, `mulberry32` (a seeded PRNG) |
| `camera` | look-at `Camera`, `project`, near-plane-clipped `projectPoly` / `projectSeg`, one `NEAR` |
| `quads` | perspective-correct quads: `quadFromCorners`, `quadFromCornersClipped`, `quadPoint`, `createQuadPainter` |
| `glyphs` | text and images lying *in* a plane, baked once and blitted (`createGlyphPainter`, LRU-capped) |
| `panel` | a 2D-UI painter (rects, text, icons, images, clips) in "plane pixels" on a projected quad |
| `fonts` | `ensureFonts`: wait for webfonts before a hero bakes text, with a timeout |
| `effects` | glow sprite, quarter-res vignette, `depthFade` |
| `cinematic` | `orbitCam`, `interpKeys`, `handHeldDrift`, `sampleRail`, `sampleSmoothRail`, `createDealtRail` |
| `lifecycle` | `createHeroCanvas`: sizing, DPR, observers, 60 fps pacing, reduced motion, context loss |
| `fieldGL` | `createBakedField`: static world geometry on WebGL 1, projected exactly like `camera.project` |
| `gl` | WebGL 2: `createGL2`, `program`, `texture`, `target`, `msaaTarget` / `resolve`, `fullscreenTriangle`, `attrib`, `bindTexture`, `into` |
| `mesh` | `gridGeometry` / `gridMesh`: an indexed UV-only plane grid for vertex-shader-deformed sheets |
| `mat4` | column-major 4x4 matrices (exported as the `mat4` namespace) |
| `color` | `RGB`, `rgba`, `resolveCssColor` (any CSS colour, in an element's cascade, to sRGB) |
| `glBloom` | `createBloom`: an energy-conserving dual-Kawase bloom pyramid |
| `streamedBake` | `createChunkStream`: chunks baked asynchronously along an endless axis, built a step per frame |
| `errors` | `Hero3DGLError`: the one error GL setup throws |

Everything exported from the package root is the public API, under semver. Every module is free of import-time side effects.

## Three ways to build a hero

### (a) A Canvas 2D hero

```ts
import {
  createHeroCanvas, createQuadPainter, createGlyphPainter, quadFromCorners, quadSize,
  clampDpr, type Camera
} from '@starworks/hero3d';

export function mountTiles(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const dpr = clampDpr();
  const quads = createQuadPainter(ctx);
  const glyphs = createGlyphPainter(ctx, dpr, { font: '"Inter", sans-serif' });
  let w = 1, h = 1;

  const hero = createHeroCanvas(canvas, ctx, {
    dpr,
    onResize: (cw, ch) => { w = cw; h = ch; },
    draw(now) {
      const t = now / 1000;
      const cam: Camera = { pos: { x: Math.sin(t * 0.2) * 3, y: 4, z: -6 }, target: { x: 0, y: 0, z: 2 }, fov: 0.9 };
      ctx.clearRect(0, 0, w, h);
      const q = quadFromCorners(cam, {
        fl: { x: -2, y: 0, z: 4 }, fr: { x: 2, y: 0, z: 4 },
        nl: { x: -2, y: 0, z: 0 }, nr: { x: 2, y: 0, z: 0 }
      }, w, h);
      if (!q) return;
      ctx.fillStyle = 'rgba(108,192,236,0.15)';
      quads.fillQuad(q, 0, 0, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      glyphs.planeText(q, quadSize(q), 0, 0, 18, 'printed on the plane');
    }
  });
  return () => hero.destroy();
}
```

Under reduced motion `draw` runs once per resize, so derive the frame from `now` (or a fixed time when `prefersReducedMotion()`), never from a running counter.

### (b) A 2D hero over a baked GL field

Thousands of dim background tiles are fill-heavy in Canvas 2D at 2x DPR. Bake them once into triangles and lines on a sibling canvas behind the 2D one; each frame only the camera uniforms change. The field's vertex shader reproduces `project()` exactly, so the two canvases line up to the pixel.

```ts
import { createBakedField, createHeroCanvas, clampDpr } from '@starworks/hero3d';

// x, y, z, r, g, b, a per vertex (fog folded into alpha)
const field = createBakedField(glCanvas, { triangles, lines }, { onRestored: () => redraw() });
// null: no WebGL - leave glCanvas empty, the 2D hero still runs

const hero = createHeroCanvas(canvas, ctx, {
  dpr,
  onResize: (w, h, d) => field?.resize(w, h, d),
  draw(now) {
    const cam = cameraAt(now);
    field?.render(cam);       // the background, on the GPU
    drawForeground(cam, now); // labels, highlights, on the 2D canvas
  }
});
```

### (c) A WebGL 2 hero

Pass `null` for the 2D context and the scaffold still sizes the canvas, observes it, paces the loop and honours reduced motion; the hero owns its GL state. This is the shape of a shader-driven sheet with an MSAA scene pass and a fullscreen post pass:

```ts
import {
  createGL2, createHeroCanvas, clampDpr, program, gridMesh, msaaTarget, resolve, target, deleteTarget,
  fullscreenTriangle, attrib, bindTexture, into, intoMsaa, mat4, FULLSCREEN_VS, Hero3DGLError,
  type Program, type GridMesh, type MsaaTarget, type Target
} from '@starworks/hero3d';

export function mountSheet(canvas: HTMLCanvasElement) {
  const gl = createGL2(canvas);
  if (!gl) return; // no WebGL 2 or a software renderer: the CSS fallback stays

  let scene: Program, post: Program, mesh: GridMesh, tri: WebGLBuffer, msaa: MsaaTarget;
  let resolved: Target | null = null;
  const build = () => {
    scene = program(gl, SHEET_VS, SHEET_FS);
    post = program(gl, FULLSCREEN_VS, POST_FS);
    mesh = gridMesh(gl, 256, 128);
    tri = fullscreenTriangle(gl);
    msaa = msaaTarget(gl, 1, 1, { samples: 4, depth: true });
    resolved = null;
  };
  try {
    build();
  } catch (e) {
    if (e instanceof Hero3DGLError) return; // shader or framebuffer trouble: keep the fallback
    throw e;
  }

  createHeroCanvas(canvas, null, {
    dpr: clampDpr(2, 1),
    onContextRestored: build, // the lost context took every object with it
    onResize() {
      msaa.resize(canvas.width, canvas.height);
      deleteTarget(gl, resolved);
      resolved = target(gl, canvas.width, canvas.height, gl.RGBA8);
    },
    draw(now) {
      intoMsaa(gl, msaa);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(scene.p);
      gl.uniformMatrix4fv(scene.u('uView'), false,
        mat4.multiply(mat4.orthographic(4, 2, 4), mat4.rotationY(now / 4000)));
      attrib(gl, scene, mesh.uvBuffer, 'aUv', 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
      gl.disable(gl.DEPTH_TEST);

      resolve(gl, msaa, resolved);

      into(gl, null);
      gl.useProgram(post.p);
      attrib(gl, post, tri, 'aPos', 2);
      bindTexture(gl, post, 0, resolved!.tex, 'uScene');
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  });
}
```

## The lifecycle contract

`createHeroCanvas(canvas, ctx | null, opts)` promises:

- **Reduced motion** (`prefers-reduced-motion: reduce`, or `opts.reduced`): `draw` runs once per resize and no loop ever starts.
- **Off screen:** no frames. An IntersectionObserver starts and stops the loop.
- **Frame cap:** 60 fps by default (`MAX_FPS`), `opts.maxFps` overrides it. The pacer keeps a steady cadence at any refresh rate: 240 Hz draws every 4th tick, 144 Hz every 2nd (72 fps), 60 Hz every tick.
- **DPR:** `clampDpr()` (at most 2) by default; `opts.dpr` overrides it, and `clampDpr(max, min)` takes a floor.
- **Time:** `draw(now)` gets the RAF timestamp unless `opts.clock` supplies one (to pin a test frame).
- **WebGL unavailable:** `createGL2` returns null and `createBakedField` returns null; GL setup that fails throws a `Hero3DGLError` after deleting what it made. Either way the hero leaves the page's CSS fallback showing.
- **Context lost:** the loop stops and `opts.onContextLost` runs. With `opts.onContextRestored` the browser is asked for the context back; when it returns, the hook rebuilds the hero's GL state, then the canvas is resized and drawn and the loop resumes if it is on screen. A baked field handles its own canvas the same way.
- **2D canvases** are reset on every resize to the DPR transform with bilinear (`'low'`) image smoothing: transformed `drawImage` calls through the `'high'` / `'medium'` mipmapped path made heroes GPU-bound, and the glyph painter bakes at or above on-screen size, so bilinear loses nothing.

## Development

```sh
npm install
npm test        # vitest: the pure modules, plus fakes for canvas, GL and the browser
npm run check   # tsc, strict
npm run build   # dist/: ESM + .d.ts + source maps
```

## Licence

MIT © Starworks
