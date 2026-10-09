# Changelog

All notable changes to `@starworks/hero3d`. The project follows [semver](https://semver.org); the public API is everything exported from the package root.

## 1.0.0 - 2026-10-09

The first standalone release: the engine behind the Starworks heroes, extracted with its history from the Starworks site (`src/lib/hero3d`).

### Fixed
- **One near plane.** `project()` rejected points at depth 0.40 while `projectPoly` / `projectSeg` clipped at 0.45; everything now uses the exported `NEAR` (0.45). (I1)
- **The glyph cache is LRU.** A cache hit now refreshes the label, so past the cap a label drawn every frame is no longer evicted and re-baked ahead of one-off labels. (I3)
- **The GL field clips at `NEAR`**, like the CPU path, instead of at depth 0. (I4)
- **WebGL context loss.** `createHeroCanvas` stops on `webglcontextlost` and, given `onContextRestored`, rebuilds and resumes on restore; `createBakedField` recovers its own canvas (`restore()`, `onRestored`). (I5)
- **One error model for GL setup.** Failures throw a typed `Hero3DGLError` (`kind`: `context`, `compile`, `link`, `framebuffer`) after deleting the objects made so far; `createBakedField` stays the null-returning wrapper. (I6)

### Changed (breaking against the in-repo copy)
- `createGlyphPainter(ctx, dpr, { font })`: `font` is required (it defaulted to Space Mono).
- `depthFade(d, { min, falloff, base })`: the tuning is an argument (the defaults were Astra's).
- `createEffects(ctx, accent)`: `accent` is an `RGB` tuple (it was a bare `"r,g,b"` string). The glow it bakes is unchanged.
- `compileProgram` accepts a WebGL 1 or 2 context.
- The baked field sets its blend state on every render.

### Added
- `quadFromCornersClipped`: the near-clipped outline of a quad for fills, with `quad: null` when the interior mapping no longer applies. (I2)
- `createGL2(canvas, attrs)` with `GL2_DEFAULTS` (`failIfMajorPerformanceCaveat` on).
- `msaaTarget` / `deleteMsaaTarget` / `intoMsaa` and `resolve` (blitFramebuffer).
- `gridGeometry` / `gridMesh` / `deleteGridMesh`.
- `mat4` (namespace): `identity`, `multiply`, `translation`, `scaling`, `rotationX/Y/Z`, `perspective`, `orthographic`, `transform`.
- `RGB`, `rgba`, `resolveCssColor`.
- `clampDpr(max, min)`: an optional DPR floor.
- `createHeroCanvas({ clock })`: an injectable time source; `onContextLost` / `onContextRestored`.
- A vitest suite for every pure module, with fakes for canvas, WebGL and the browser.
- Packaging: compiled ESM + `.d.ts` with an exports map, `sideEffects: false`, MIT.

### Added: real interfaces on planes
- `homography`: `squareToQuad`, `quadHomography`, `rectToQuad`, `invert3`, `applyHomography`, and `quadUv` (the inverse of `quadPoint`: hit-testing).
- `Panel.fromScreen` (the plane px under a pointer), `Panel.quadFor` (the screen quad of a plane-px rect), `Panel.strokePoly`, `Panel.textBlock`, `Panel.imagePerspective`.
- `domPlane`: `pinElement` / `matrix3dFor` / `quadFacesCamera`. Real HTML placed exactly on a plane with a CSS `matrix3d`, inert while hidden or back-facing, never hidden while focused.
- `imageWarp`: `drawImageWarped` (and `drawImageOnQuad`): perspective-correct, seamless images by adaptive subdivision; translucent images composite once.
- `layout`: screens as data: `layoutScreen` (flex-like rows and columns, grow, align, justify, absolute children), `paintScreen`, `hitTest`, `roundedRectPoints`.
- `figma`: `fromFigma` and `figmaImageRefs`.
- `text`: `wrapText`, `ellipsize`, `layoutSpans` (mixed styles), `createTextMeasurer`, `fontShorthand` (weights and styles in font strings, also used by the glyph painter), `watchColorScheme`.
- `planes`: `sortPlanes`, which projects, clips, culls, depth-fades and sorts a list of planes back to front.

### Added: motion, frameworks, production
- `pageToScene`: `PlanePose`, `cornersOfPose`, `poseFromCorners`, `pagePose`, `cameraForRect`, `lerpPose` (slerped), `elementRect`.
- `scroll`: `scrollProgress` (through / pinned), `createScrollTimeline`, `damp`.
- `tuner`: `createTuner`, plus `tunableLeaves`, `guessRange`, `paramsToCode`.
- `quality`: `createQualityGovernor` and `createFrameWindow`; `createHeroCanvas({ adaptive, onStats })`.
- `worker`: `createWorkerHero` / `serveWorkerHero` (OffscreenCanvas).
- `capture`: `seedFrom`, `captureFrame`, `posterFrame`, `exportFrames`, `recordVideo`.
- `mount`: `HeroMount`, `mountHero`, `heroAction` (Svelte), `defineHeroElement`; `@starworks/hero3d/react`: `useHero`, `<HeroCanvas>` (react is an optional peer).
- A Playwright suite in real Chromium (`npm run test:browser`) and a demo (`npm run demo`).
