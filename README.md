# @starworks/hero3d

**Real interfaces, flying in 3D: sharp, clickable, accessible, and tiny.**

Hero3D is a dependency-free engine for one job: **readable text and UI on planes seen through a moving perspective camera**. Tiles, panels, whole app screens and product screenshots, drawn with Canvas 2D (WebGL where it pays), with real HTML pinned exactly onto the planes wherever something must be clicked, focused or read by a screen reader.

A typical 2D hero (pattern (a) below) bundles to about **3 KB gzipped**. Everything in the package together is about 21 KB gzipped, and every module is tree-shakable.

It runs the hero canvases on [starworks](https://github.com/StarworksDev/StarworksWebsite) (the Astra lattice, the Arcane editor, the star field, the Manifold2D world, the Mosaic glass). Run `npm run demo` in this repo for a live tour.

**What it does that others don't**
- **Crisp text lying in a tilted plane, on plain Canvas 2D.** Each label is baked once at the size it appears and blitted through the plane's shear, instead of being re-rasterised at an angle every frame.
- **Real HTML on canvas planes.** A projected quad is a homography, and so is a CSS `matrix3d`: `pinElement` places a real link, button or input exactly on a plane, every frame. It stays clickable, focusable, selectable and readable by screen readers.
- **Whole screens as data.** A tree of boxes, text, icons and images is laid out, painted on a plane and hit-tested through the pointer. `fromFigma` imports a Figma frame into the same tree.
- **Perspective-correct images.** A screenshot on a steep plane meets the plane's edges (adaptive subdivision, seamless), where Canvas 2D's affine `drawImage` would make a parallelogram.
- **From the page into the scene.** A plane can be posed to cover a DOM element exactly, then moved into the 3D scene with a rigid slerp as you scroll.
- **Canvas and GPU agree to the pixel.** The baked GL field's vertex shader repeats the CPU camera exactly, near plane included.
- **Measured performance built in:** a steady 60 fps cap at any refresh rate, bilinear label blits, DPR caps, adaptive DPR, an OffscreenCanvas worker path.

**Not for:** general 3D scenes, models, lighting, physics or a scene graph. Use [three.js](https://threejs.org) for those.

## Install

```sh
npm i @starworks/hero3d
```

ESM only, with TypeScript types. Import from the package root, or a single module by path. React bindings are a separate entry point (`react` is an optional peer dependency):

```ts
import { createHeroCanvas, pinElement } from '@starworks/hero3d';
import { project } from '@starworks/hero3d/camera';
import { useHero, HeroCanvas } from '@starworks/hero3d/react';
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
| **Planes and text** | |
| `math` | `Vec3`, clamps, lerps, easing, vector ops, `mulberry32` (a seeded PRNG) |
| `camera` | look-at `Camera`, `project`, near-plane-clipped `projectPoly` / `projectSeg`, one `NEAR` |
| `quads` | perspective-correct quads: `quadFromCorners`, `quadFromCornersClipped`, `quadPoint`, `createQuadPainter`, `drawImageOnQuad` |
| `homography` | plane <-> screen homographies; `quadUv` turns a screen point back into a position on a plane |
| `planes` | `sortPlanes`: project, clip, cull, depth-fade and sort a list of planes back to front |
| `glyphs` | text and images lying *in* a plane, baked once and blitted (`createGlyphPainter`, LRU-capped) |
| `text` | `wrapText`, `ellipsize`, mixed-style `layoutSpans`, `createTextMeasurer`, weights in font strings, `watchColorScheme` |
| `panel` | a 2D-UI painter in "plane pixels" on a projected quad: rects, polygons, text blocks, icons, images, clips, `fromScreen`, `quadFor` |
| `imageWarp` | `drawImageWarped`: perspective-correct, seamless images through any projective map |
| `fonts` | `ensureFonts`: wait for webfonts before a hero bakes text, with a timeout |
| `effects` | glow sprite, quarter-res vignette, `depthFade` |
| **Interfaces** | |
| `domPlane` | `pinElement` / `matrix3dFor`: real HTML placed exactly on a plane, inert when hidden, focus-aware |
| `layout` | screens as data: `layoutScreen` (flex-like), `paintScreen`, `hitTest` |
| `figma` | `fromFigma`: a Figma REST frame -> a layout tree |
| **Motion** | |
| `cinematic` | `orbitCam`, `interpKeys`, `handHeldDrift`, `sampleRail`, `sampleSmoothRail`, `createDealtRail` |
| `pageToScene` | `PlanePose`, `pagePose` (a plane covering a DOM rect), `cameraForRect`, `lerpPose`, `elementRect` |
| `scroll` | `scrollProgress`, `createScrollTimeline`, `damp` |
| `tuner` | `createTuner`: a dev overlay with a slider on every number in a params object, "copy as code" |
| **Running it** | |
| `lifecycle` | `createHeroCanvas`: sizing, DPR (fixed or adaptive), observers, 60 fps pacing, reduced motion, context loss, injectable clock |
| `quality` | `createQualityGovernor`, `createFrameWindow`: adaptive quality and frame telemetry |
| `worker` | `createWorkerHero` / `serveWorkerHero`: render in a worker via OffscreenCanvas |
| `capture` | `seedFrom`, `captureFrame`, `posterFrame`, `exportFrames` (frame-exact), `recordVideo` |
| `mount` | `HeroMount`, `heroAction` (Svelte), `defineHeroElement` (custom element); `/react`: `useHero`, `<HeroCanvas>` |
| **WebGL** | |
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

## Real interfaces on planes

**Pin real HTML.** Put a layer over the canvas (`position:absolute; inset:0; overflow:hidden; pointer-events:none`), add the element, and place it every frame:

```ts
const pin = pinElement(link, { w: 220, h: 52 }, { onFocusChange: (f) => (holdCamera = f) });
// in draw():
pin.place(panel.quadFor(slot.x, slot.y, slot.w, slot.h)); // or any Quad; null hides it
```

A hidden or back-facing element is also made `inert`, so Tab skips it and a screen reader doesn't read what nobody can see. A focused element is never hidden from under the user; use `onFocusChange` to hold the camera while it has focus.

**Describe the screen, then paint and hit-test it:**

```ts
const placed = layoutScreen({
  type: 'box', direction: 'row', fill: '#0e0e13', radius: 18, clip: true,
  children: [
    { type: 'box', width: 200, padding: 18, gap: 6, children: [{ type: 'text', text: 'Overview', size: 17 }] },
    { type: 'box', grow: 1, padding: 24, gap: 18, children: [
      { type: 'text', text: [{ text: 'Frame budget, ', font: '700 Inter' }, { text: 'live', color: '#a78bfa' }], size: 30 },
      { type: 'image', id: 'shot', src: 'shot', width: 230, height: 160, perspective: true }
    ] }
  ]
}, 960, 600, { measure: createTextMeasurer().measure, font: 'Inter' });

paintScreen(ctx, panel, placed, { images: { shot } });
const at = panel.fromScreen(pointer.x, pointer.y);               // the plane px under the pointer
const hovered = at?.inside ? hitTest(placed, at.x, at.y) : null; // the topmost node with an id
```

**From Figma:** fetch a frame with Figma's REST API (`GET /v1/files/:key/nodes?ids=...`), then `layoutScreen(fromFigma(frame), w, h, env)`. `figmaImageRefs` lists the image fills to resolve through the `/images` endpoint.

**Images:** `panel.image` is the cheap shear, right for icons and small images. `panel.imagePerspective` and `drawImageOnQuad` subdivide until the error is under half a pixel, so a screenshot on a steep plane stays true to its edges.

## From the page into the scene

```ts
const off = createScrollTimeline(section, (p) => {
  const page = pagePose(cam, elementRect(card, canvas), w, h, { worldWidth: 3 }); // covers the DOM card exactly
  const pose = lerpPose(page, scenePose, easeInOut(p));                          // turns rigidly into the scene
  const q = quadFromCorners(cam, cornersOfPose(pose), w, h);
  if (q) drawImageOnQuad(ctx, screenshot, q);
}, { mode: 'pinned' });
```

`cameraForRect` is the converse: a camera that frames a plane in the scene onto a DOM rect. Scroll progress also drives `interpKeys` and the smooth rails directly, with `damp` for a little inertia.

## Frameworks

```svelte
<canvas use:heroAction={{ mount: mountTiles, params: { seed } }} aria-hidden="true"></canvas>
```

```tsx
import { HeroCanvas } from '@starworks/hero3d/react';
<HeroCanvas mount={mountTiles} params={{ seed }} className="hero" />
```

```ts
defineHeroElement('tile-hero', mountTiles, { attributes: ['seed'], params: (el) => ({ seed: Number(el.getAttribute('seed')) }) });
// <tile-hero seed="7" style="height: 100vh"></tile-hero>
```

A `HeroMount` is just `(canvas, params) => ({ update?, destroy }) | destroy | void`.

## Production tools

- **Adaptive DPR and telemetry:** `createHeroCanvas(canvas, ctx, { adaptive: { levels: [2, 1.5, 1] }, onStats })`.
- **A worker:** `createWorkerHero(canvas, worker)` on the main thread (null without OffscreenCanvas: fall back to the main thread); `serveWorkerHero(self, setup)` in the worker runs the same paced loop.
- **Deterministic frames:** `?seed=N` through `seedFrom`; `captureFrame` / `posterFrame` for pixel tests, posters and social images; `exportFrames` renders at exact times for a perfectly smooth video; `recordVideo` for a quick real-time clip.
- **Tuning:** `createTuner(PARAMS)` behind a dev flag. Drag sliders, then "Copy as code".

## Accessibility

Canvas pixels are invisible to assistive technology, so:

- Mark hero canvases `aria-hidden="true"` (`<HeroCanvas>` and `defineHeroElement` do).
- Keep the real headline, copy and calls to action in the HTML beside the canvas, not only painted in it.
- Anything interactive on a plane should be a **pinned real element**, not a painted one. It gets focus, keyboard activation and an accessible name for free, and `pinElement` makes it inert while it can't be seen.
- Honour reduced motion. The lifecycle does: one still frame, no loop. Pick a meaningful time for that frame.
- Painted text is decoration. If it carries information, say it in the HTML too.

## Looking ahead: HTML in Canvas

Browsers are experimenting with drawing real, styled DOM straight into a canvas (the HTML-in-Canvas proposal). If it ships, it fits Hero3D exactly: `paintScreen` and `pinElement` already treat a plane as "a screen of real interface". The layout tree and the pinning contract are designed so a future backend can render a DOM subtree onto a plane directly, without changing hero code.

## The lifecycle contract

`createHeroCanvas(canvas, ctx | null, opts)` promises:

- **Reduced motion** (`prefers-reduced-motion: reduce`, or `opts.reduced`): `draw` runs once per resize and no loop ever starts.
- **Off screen:** no frames. An IntersectionObserver starts and stops the loop.
- **Frame cap:** 60 fps by default (`MAX_FPS`), `opts.maxFps` overrides it. The pacer keeps a steady cadence at any refresh rate: 240 Hz draws every 4th tick, 144 Hz every 2nd (72 fps), 60 Hz every tick.
- **DPR:** `clampDpr()` (at most 2) by default; `opts.dpr` overrides it, and `clampDpr(max, min)` takes a floor. With `opts.adaptive: { levels: [2, 1.5, 1] }` the DPR steps down while frames run long and back up after sustained headroom, and `opts.onStats` reports fps and frame-time percentiles about once a second.
- **Time:** `draw(now)` gets the RAF timestamp unless `opts.clock` supplies one (to pin a test frame).
- **WebGL unavailable:** `createGL2` returns null and `createBakedField` returns null; GL setup that fails throws a `Hero3DGLError` after deleting what it made. Either way the hero leaves the page's CSS fallback showing.
- **Context lost:** the loop stops and `opts.onContextLost` runs. With `opts.onContextRestored` the browser is asked for the context back; when it returns, the hook rebuilds the hero's GL state, then the canvas is resized and drawn and the loop resumes if it is on screen. A baked field handles its own canvas the same way.
- **2D canvases** are reset on every resize to the DPR transform with bilinear (`'low'`) image smoothing: transformed `drawImage` calls through the `'high'` / `'medium'` mipmapped path made heroes GPU-bound, and the glyph painter bakes at or above on-screen size, so bilinear loses nothing.

## Development

```sh
npm install
npm test               # vitest: every module, with fakes for canvas, GL and the browser
npm run check          # tsc, strict
npm run build          # dist/: ESM + .d.ts + source maps
npm run test:browser   # Playwright in real Chromium: DOM pinning, image warping, GL targets, context loss, the worker, capture
npm run demo           # the demo at http://127.0.0.1:4317/demo/index.html
```

## Licence

MIT © Starworks
