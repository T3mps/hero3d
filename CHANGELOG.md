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
