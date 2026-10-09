// Real-browser checks for what the vitest fakes cannot prove: CSS matrix3d
// placement, warped image pixels, WebGL 2 targets, context loss, the worker
// path, frame capture, and the layout/text stack on a real canvas.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/test/browser/index.html');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
});

// shared scene: a tilted screen standing in front of the camera
const SCENE = `
  const cam = { pos: { x: 1.2, y: 2.2, z: -6 }, target: { x: 0, y: 1, z: 2 }, fov: 0.9 };
  const corners = { fl: { x: -2, y: 2.6, z: 1.5 }, fr: { x: 2, y: 2.4, z: 3.5 }, nl: { x: -2, y: 0, z: 1.5 }, nr: { x: 2, y: 0, z: 3.5 } };
  const q = h.quadFromCorners(cam, corners, 800, 600);
`;

test('a pinned element sits exactly on the quad and takes the pointer there', async ({ page }) => {
  const r = await page.evaluate(`(() => {
    ${SCENE}
    const btn = document.createElement('button');
    btn.textContent = 'Click me';
    document.getElementById('layer').append(btn);
    const pin = h.pinElement(btn, { w: 320, h: 200 });
    pin.place(q);
    const box = btn.getBoundingClientRect();
    const xs = [q.fl.x, q.fr.x, q.nl.x, q.nr.x], ys = [q.fl.y, q.fr.y, q.nl.y, q.nr.y];
    const c = h.quadPoint(q, 0.5, 0.5);
    const hit = document.elementFromPoint(c.x, c.y);
    pin.place(null);
    return {
      box: [box.left, box.top, box.right, box.bottom],
      want: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      hitIsButton: hit === btn,
      hiddenInert: btn.inert && getComputedStyle(btn).visibility === 'hidden'
    };
  })()`) as { box: number[]; want: number[]; hitIsButton: boolean; hiddenInert: boolean };
  r.box.forEach((v, i) => expect(Math.abs(v - r.want[i])).toBeLessThan(1));
  expect(r.hitIsButton).toBe(true);
  expect(r.hiddenInert).toBe(true);
});

test('a warped image lands perspective-correctly; the affine shear does not', async ({ page }) => {
  const r = await page.evaluate(`(() => {
    ${SCENE}
    // an 8x8 checker, 32 px cells
    const img = document.createElement('canvas');
    img.width = img.height = 256;
    const g = img.getContext('2d');
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = (i + j) % 2 ? '#ffffff' : '#ff0000'; g.fillRect(i * 32, j * 32, 32, 32); }
    const canvas = document.getElementById('c2d');
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const score = () => {
      let ok = 0, n = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const p = h.quadPoint(q, (i + 0.5) / 8, (j + 0.5) / 8);
        const [r, gg] = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
        const white = gg > 128;
        ok += white === ((i + j) % 2 === 1) ? 1 : 0;
        n++;
      }
      return ok / n;
    };
    ctx.clearRect(0, 0, 800, 600);
    h.drawImageOnQuad(ctx, img, q);
    const warped = score();
    // the cheap path: one affine shear anchored at the top-left
    ctx.clearRect(0, 0, 800, 600);
    const o = q.fl, ex = { x: (q.fr.x - q.fl.x) / 256, y: (q.fr.y - q.fl.y) / 256 }, ey = { x: (q.nl.x - q.fl.x) / 256, y: (q.nl.y - q.fl.y) / 256 };
    const glyphs = h.createGlyphPainter(ctx, 1, { font: 'sans-serif' });
    glyphs.planeImage(o, ex, ey, img, 256, 256);
    const affine = score();
    return { warped, affine, divisions: h.warpDivisions((u, v) => h.quadPoint(q, u, v)) };
  })()`) as { warped: number; affine: number; divisions: number };
  expect(r.divisions).toBeGreaterThan(1);
  expect(r.warped).toBe(1);
  expect(r.affine).toBeLessThan(1);
});

test('WebGL 2: an MSAA scene with depth resolves into a texture and reaches the canvas', async ({ page }) => {
  const r = await page.evaluate(`(() => {
    const canvas = document.getElementById('cgl');
    canvas.width = 64; canvas.height = 64;
    const gl = h.createGL2(canvas, { failIfMajorPerformanceCaveat: false, preserveDrawingBuffer: true });
    if (!gl) return { skipped: true };
    const red = h.program(gl, h.FULLSCREEN_VS, '#version 300 es\\nprecision highp float; out vec4 o; void main(){ o = vec4(1., 0., 0., 1.); }');
    const blit = h.program(gl, h.FULLSCREEN_VS, '#version 300 es\\nprecision highp float; uniform sampler2D uT; in vec2 vUv; out vec4 o; void main(){ o = texture(uT, vUv); }');
    const tri = h.fullscreenTriangle(gl);
    const msaa = h.msaaTarget(gl, 64, 64, { samples: 4, depth: true });
    const tex = h.target(gl, 64, 64, gl.RGBA8);
    h.intoMsaa(gl, msaa);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(red.p); h.attrib(gl, red, tri, 'aPos', 2); gl.drawArrays(gl.TRIANGLES, 0, 3);
    h.resolve(gl, msaa, tex);
    h.into(gl, null);
    gl.useProgram(blit.p); h.attrib(gl, blit, tri, 'aPos', 2); h.bindTexture(gl, blit, 0, tex.tex, 'uT'); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const mesh = h.gridMesh(gl, 256, 128);
    return { px: Array.from(px), samples: msaa.samples, count: mesh.count, err: gl.getError() };
  })()`) as { skipped?: boolean; px: number[]; samples: number; count: number; err: number };
  test.skip(!!r.skipped, 'no WebGL 2 here');
  expect(r.px).toEqual([255, 0, 0, 255]);
  expect(r.samples).toBeGreaterThan(0);
  expect(r.count).toBe(256 * 128 * 6);
  expect(r.err).toBe(0);
});

test('a lost WebGL context stops the hero; on restore it rebuilds and draws again', async ({ page }) => {
  const r = await page.evaluate(`(async () => {
    const canvas = document.getElementById('cgl');
    const gl = h.createGL2(canvas, { failIfMajorPerformanceCaveat: false });
    if (!gl) return { skipped: true };
    const ext = gl.getExtension('WEBGL_lose_context');
    let builds = 0, draws = 0, lost = 0;
    let prog;
    const build = () => { builds++; prog = h.program(gl, h.FULLSCREEN_VS, '#version 300 es\\nprecision highp float; out vec4 o; void main(){ o = vec4(0., 1., 0., 1.); }'); };
    build();
    const hero = h.createHeroCanvas(canvas, null, {
      reduced: true,
      draw() { if (!gl.isContextLost()) { draws++; gl.useProgram(prog.p); } },
      onContextLost() { lost++; },
      onContextRestored: build
    });
    const drawsBefore = draws;
    const restored = new Promise((res) => canvas.addEventListener('webglcontextrestored', () => setTimeout(res, 0), { once: true }));
    ext.loseContext();
    await new Promise((res) => setTimeout(res, 50));
    ext.restoreContext();
    await restored;
    hero.destroy();
    return { builds, lost, drewAfterRestore: draws > drawsBefore, err: gl.getError() };
  })()`) as { skipped?: boolean; builds: number; lost: number; drewAfterRestore: boolean; err: number };
  test.skip(!!r.skipped, 'no WebGL 2 here');
  expect(r.lost).toBe(1);
  expect(r.builds).toBe(2);
  expect(r.drewAfterRestore).toBe(true);
  expect(r.err).toBe(0);
});

test('a worker hero draws on the transferred canvas', async ({ page }) => {
  const r = await page.evaluate(`(async () => {
    const canvas = document.getElementById('cworker');
    const worker = new Worker('/test/browser/worker.js', { type: 'module' });
    const first = new Promise((res) => (worker.onmessage = (e) => res(e.data)));
    const hero = h.createWorkerHero(canvas, worker, { dpr: 1, reduced: true });
    if (!hero) return { skipped: true };
    const msg = await first;
    return msg;
  })()`) as { skipped?: boolean; draws: number; width: number; height: number };
  test.skip(!!r.skipped, 'no OffscreenCanvas here');
  expect(r.draws).toBeGreaterThanOrEqual(1);
  expect([r.width, r.height]).toEqual([800, 600]);
  const shot = await page.locator('#cworker').screenshot();
  expect(shot.length).toBeGreaterThan(0);
  // sample the middle pixel of the screenshot through the browser's decoder
  const rgb = await page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(img.width >> 1, img.height >> 1, 1, 1).data.slice(0, 3));
  }, shot.toString('base64'));
  expect(rgb).toEqual([0, 255, 0]);
});

test('captureFrame encodes the frame drawn at t from a WebGL canvas', async ({ page }) => {
  const r = await page.evaluate(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const gl = h.createGL2(canvas, { failIfMajorPerformanceCaveat: false });
    if (!gl) return { skipped: true };
    const blob = await h.captureFrame(canvas, (t) => { gl.clearColor(0, 0, t / 1000, 1); gl.clear(gl.COLOR_BUFFER_BIT); }, 1000);
    const img = await createImageBitmap(blob);
    const c = new OffscreenCanvas(16, 16), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return { type: blob.type, px: Array.from(g.getImageData(8, 8, 1, 1).data) };
  })()`) as { skipped?: boolean; type: string; px: number[] };
  test.skip(!!r.skipped, 'no WebGL 2 here');
  expect(r.type).toBe('image/png');
  expect(r.px).toEqual([0, 0, 255, 255]);
});

test('a data-described screen paints on a plane, wraps text, and hit-tests through the pointer', async ({ page }) => {
  const r = await page.evaluate(`(() => {
    ${SCENE}
    const canvas = document.getElementById('c2d');
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    const glyphs = h.createGlyphPainter(ctx, 1, { font: 'sans-serif' });
    const panel = h.createPanelPainter({ ctx, glyphs, quads: h.createQuadPainter(ctx), uiFont: 'sans-serif', iconFont: 'sans-serif' }).panelFor(q, h.quadSize(q), 640, 400);
    const measurer = h.createTextMeasurer();
    const screen = h.layoutScreen({
      type: 'box', fill: '#202028', padding: 24, gap: 12, radius: 16,
      children: [
        { type: 'text', text: [{ text: 'Real ', font: '700 sans-serif' }, { text: 'interfaces, flying in 3D, sharp and clickable.', color: '#9cf' }], size: 28, color: '#fff' },
        { type: 'box', id: 'cta', direction: 'row', fill: '#7c3aed', radius: 8, padding: 12, align: 'center', width: 220, children: [{ type: 'text', text: 'Get started', size: 20, color: '#fff' }] }
      ]
    }, 640, 400, { measure: measurer.measure, font: 'sans-serif' });
    h.paintScreen(ctx, panel, screen);
    const cta = screen.children[1];
    const centre = panel.toScreen(cta.x + cta.w / 2, cta.y + cta.h / 2);
    const back = panel.fromScreen(centre.x, centre.y);
    const hit = h.hitTest(screen, back.x, back.y);
    const title = screen.children[0];
    const [r_, g_, b_] = ctx.getImageData(Math.round(centre.x), Math.round(centre.y) - 2, 1, 1).data;
    return { hit: hit && hit.node.id, titleLines: Math.round(title.h / (28 * 1.3)), ctaColour: [r_, g_, b_] };
  })()`) as { hit: string; titleLines: number; ctaColour: number[] };
  expect(r.hit).toBe('cta');
  expect(r.titleLines).toBeGreaterThanOrEqual(2);
  // the button's violet (or its white label) is under its centre
  expect(r.ctaColour[2]).toBeGreaterThan(150);
});
