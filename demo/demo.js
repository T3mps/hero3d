// The hero3d demo: one hero and one scroll story, using the whole library.
//  - a floor of tiles (sortPlanes: clipped, culled, depth-faded, back to front)
//  - an app window as data (layoutScreen + paintScreen on a Panel), with
//    hover through the pointer (Panel.fromScreen + hitTest)
//  - a real <a> pinned onto the window (pinElement + Panel.quadFor), tabbable
//  - a "screenshot" drawn perspective-correctly (Panel.imagePerspective)
//  - a camera on an endless dealt rail; adaptive DPR; a tuner with ?tune
//  - a scroll story: a card leaves the page and settles into the scene
//    (pagePose -> lerpPose -> drawImageOnQuad, driven by createScrollTimeline)
import * as h from '../dist/index.js';

const params = new URLSearchParams(location.search);
const seed = h.seedFrom(params, 'seed', 7);
const rng = h.mulberry32(seed);
const reduced = h.prefersReducedMotion();

const PARAMS = {
  speed: 1,
  fov: 0.85,
  floor: { fade: { min: 0.08, falloff: 0.07, base: 1.25 }, lit: 0.18 },
  window: { x: 1.6, y: 1.75, z: 3.2, yaw: -0.42, tilt: 0.1 }
};

const FONT = 'system-ui, sans-serif';
const ACCENT = [139, 92, 246];

// ---- the app window, as data ----------------------------------------------
const W = 960;
const H = 600;
const navItem = (label, active) => ({
  type: 'box', id: `nav-${label}`, direction: 'row', padding: [8, 12, 8, 12], radius: 8, fill: active ? 'rgba(139,92,246,.22)' : undefined,
  children: [{ type: 'text', text: label, size: 17, color: active ? '#fff' : '#a3a3ad' }]
});
const stat = (id, label, value, delta) => ({
  type: 'box', id, grow: 1, padding: 16, gap: 6, radius: 12, fill: '#16161d', stroke: 'rgba(255,255,255,.08)',
  children: [
    { type: 'text', text: label, size: 14, color: '#8b8b96' },
    { type: 'text', text: [{ text: value, font: `700 ${FONT}`, color: '#fff' }, { text: `  ${delta}`, color: '#4ade80' }], size: 28 }
  ]
});
const bars = Array.from({ length: 14 }, (_, i) => 30 + 120 * Math.abs(Math.sin(i * 0.7 + seed)));
const SCREEN = {
  type: 'box', direction: 'row', fill: '#0e0e13', stroke: 'rgba(255,255,255,.12)', radius: 18, clip: true,
  children: [
    {
      type: 'box', width: 200, padding: 18, gap: 6, fill: '#121218',
      children: [
        { type: 'text', text: [{ text: 'Astra', font: `800 ${FONT}`, color: '#fff' }, { text: ' Console', color: '#8b8b96' }], size: 20 },
        { type: 'spacer', size: 14 },
        navItem('Overview', true), navItem('Entities'), navItem('Systems'), navItem('Profiler'), navItem('Settings')
      ]
    },
    {
      type: 'box', grow: 1, padding: 24, gap: 18,
      children: [
        { type: 'text', text: 'Frame budget, live', size: 30, font: `700 ${FONT}`, color: '#fff' },
        { type: 'box', direction: 'row', gap: 14, children: [stat('s1', 'Entities', '1.2M', '+12%'), stat('s2', 'Frame', '2.9 ms', '-0.4'), stat('s3', 'Systems', '48', '+3')] },
        {
          type: 'box', direction: 'row', gap: 14, grow: 1,
          children: [
            {
              type: 'box', id: 'chart', grow: 1, padding: 16, radius: 12, fill: '#16161d', direction: 'row', align: 'end', gap: 6,
              children: bars.map((b, i) => ({ type: 'box', id: `bar-${i}`, grow: 1, height: b, radius: 4, fill: i === 9 ? '#8b5cf6' : '#3b3b4a' }))
            },
            { type: 'image', id: 'shot', src: 'shot', width: 230, height: 160, perspective: true }
          ]
        },
        { type: 'box', direction: 'row', justify: 'end', children: [{ type: 'box', id: 'cta-slot', width: 220, height: 52 }] }
      ]
    }
  ]
};

// a "screenshot": a small screen painted flat onto an offscreen canvas, then
// used as an image on the tilted window and in the scroll story
function makeShot(sw, sh) {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d');
  const quad = { fl: { x: 0, y: 0, scale: 1, depth: 1 }, fr: { x: sw, y: 0, scale: 1, depth: 1 }, nl: { x: 0, y: sh, scale: 1, depth: 1 }, nr: { x: sw, y: sh, scale: 1, depth: 1 } };
  const glyphs = h.createGlyphPainter(ctx, 1, { font: FONT });
  const panel = h.createPanelPainter({ ctx, glyphs, quads: h.createQuadPainter(ctx), uiFont: FONT, iconFont: FONT }).panelFor(quad, { cw: sw, ch: sh }, sw, sh);
  const g = ctx.createLinearGradient(0, 0, sw, sh);
  g.addColorStop(0, '#1e1b4b');
  g.addColorStop(1, '#4c1d95');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sw, sh);
  const m = h.createTextMeasurer();
  const tree = h.layoutScreen(
    {
      type: 'box', padding: sw * 0.06, gap: sw * 0.03,
      children: [
        { type: 'text', text: 'Arcane', size: sw * 0.09, font: `800 ${FONT}`, color: '#fff' },
        ...[0.8, 0.55, 0.7].map((k) => ({ type: 'box', width: sw * k, height: sw * 0.04, radius: sw * 0.02, fill: 'rgba(255,255,255,.25)' })),
        { type: 'box', direction: 'row', gap: sw * 0.03, grow: 1, children: [0, 1, 2].map((i) => ({ type: 'box', grow: 1, radius: sw * 0.02, fill: `hsl(${260 + i * 30} 70% ${55 + i * 5}%)` })) }
      ]
    },
    sw,
    sh,
    { measure: m.measure, font: FONT }
  );
  h.paintScreen(ctx, panel, tree);
  return c;
}

// ---- the hero ---------------------------------------------------------------
function mountHero(canvas, layer) {
  const ctx = canvas.getContext('2d');
  const base = h.clampDpr(2, 1);
  const glyphs = h.createGlyphPainter(ctx, base, { font: FONT, cacheCap: 1024 });
  const quads = h.createQuadPainter(ctx);
  const painter = h.createPanelPainter({ ctx, glyphs, quads, uiFont: FONT, iconFont: FONT });
  const fx = h.createEffects(ctx, ACCENT);
  const measurer = h.createTextMeasurer();
  const env = { measure: measurer.measure, font: FONT };
  const images = { shot: makeShot(460, 320) };
  const placed = h.layoutScreen(SCREEN, W, H, env);
  const find = (id, n = placed) => (n.node.id === id ? n : n.children.map((c) => find(id, c)).find(Boolean));
  const slot = find('cta-slot');

  // the real link, pinned to the slot
  const cta = document.createElement('a');
  cta.href = '#story';
  cta.className = 'pinned-cta';
  cta.textContent = 'See it scroll';
  layer.append(cta);
  let hold = false; // a focused element holds the camera still
  const pin = h.pinElement(cta, { w: slot.w, h: slot.h }, { onFocusChange: (f) => (hold = f) });

  // the floor: a grid of tiles, some lit
  const tiles = [];
  for (let j = -2; j < 16; j += 1)
    for (let i = -9; i <= 9; i += 1) tiles.push({ i, j, lit: rng() < PARAMS.floor.lit, label: rng() < 0.08 ? `0x${Math.floor(rng() * 65535).toString(16)}` : null });
  const S = 1.1;
  const cornersOf = (t) => {
    const x0 = t.i * S - S * 0.45, x1 = t.i * S + S * 0.45, z0 = t.j * S - S * 0.45, z1 = t.j * S + S * 0.45;
    return { fl: { x: x0, y: 0, z: z1 }, fr: { x: x1, y: 0, z: z1 }, nl: { x: x0, y: 0, z: z0 }, nr: { x: x1, y: 0, z: z0 } };
  };

  // the camera: an endless rail of keys around the window
  const dealKey = (prev) => ({
    t: prev.t + 5 + rng() * 3,
    v: [-1.5 + rng() * 3, 2.2 + rng() * 1.4, -5.5 + rng() * 1.5, 1.2 + rng() * 0.8, 1.3 + rng() * 0.5],
    hold: rng() < 0.4 ? 1 : 0
  });
  const rail = h.createDealtRail([{ t: 0, v: [-0.6, 2.8, -5.2, 1.4, 1.5], hold: 1 }, { t: 6, v: [0.8, 2.4, -5.8, 1.6, 1.6], hold: 0 }], dealKey, [0, 1, 2]);

  let w = 1, hh = 1;
  let hover = null;
  let pointer = null;
  let t = 0, last = 0;

  const windowQuad = (cam) => {
    const p = PARAMS.window;
    const right = { x: Math.cos(p.yaw), y: 0, z: -Math.sin(p.yaw) };
    const up = { x: 0, y: Math.cos(p.tilt), z: Math.sin(p.tilt) };
    const pose = { center: { x: p.x, y: p.y, z: p.z }, right, up, w: 4.8, h: 3.0 };
    return h.quadFromCorners(cam, h.cornersOfPose(pose), w, hh);
  };

  const draw = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!reduced && !hold) t += dt * PARAMS.speed;
    const [px, py, pz, tx, ty] = rail(reduced ? 3 : t);
    const cam = { pos: { x: px, y: py, z: pz }, target: { x: tx, y: ty, z: 3 }, fov: PARAMS.fov };

    ctx.clearRect(0, 0, w, hh);
    const bg = ctx.createRadialGradient(w * 0.65, hh * 0.35, 0, w * 0.65, hh * 0.35, Math.max(w, hh));
    bg.addColorStop(0, '#15121f');
    bg.addColorStop(1, '#07070b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, hh);

    // floor
    for (const p of h.sortPlanes(cam, tiles, cornersOf, w, hh, { fade: PARAMS.floor.fade, margin: 40 })) {
      const a = p.alpha * (p.item.lit ? 0.5 : 0.12);
      ctx.fillStyle = p.item.lit ? `rgba(139,92,246,${a})` : `rgba(255,255,255,${a})`;
      ctx.beginPath();
      p.poly.forEach((v, k) => (k ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
      ctx.fill();
      if (p.quad && p.item.label && p.alpha > 0.3) {
        ctx.fillStyle = `rgba(220,220,235,${p.alpha * 0.8})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        glyphs.planeText(p.quad, h.quadSize(p.quad), 0, 0, Math.min(16, h.quadSize(p.quad).cw * 0.16), p.item.label);
      }
    }

    // the window
    const q = windowQuad(cam);
    if (q) {
      const panel = painter.panelFor(q, h.quadSize(q), W, H);
      const c = h.quadPoint(q, 0.5, 0.5);
      const glow = Math.max(w, hh) * 0.6;
      ctx.globalAlpha = 0.35;
      fx.blitGlow(c.x - glow / 2, c.y - glow / 2, glow, glow);
      ctx.globalAlpha = 1;
      h.paintScreen(ctx, panel, placed, { images, color: '#e5e5ea', font: FONT });
      // hover: the node under the pointer, found through the plane
      hover = null;
      if (pointer) {
        const at = panel.fromScreen(pointer.x, pointer.y);
        const hit = at && at.inside ? h.hitTest(placed, at.x, at.y) : null;
        if (hit && hit.node.id !== 'cta-slot') {
          hover = hit.node.id;
          panel.strokePoly(h.roundedRectPoints(hit.x, hit.y, hit.w, hit.h, hit.node.radius ?? 0), 'rgba(167,139,250,.9)', 2);
        }
      }
      pin.place(panel.quadFor(slot.x, slot.y, slot.w, slot.h));
    } else pin.place(null);
    canvas.style.cursor = hover ? 'pointer' : '';
    fx.drawVignette(w, hh);
  };

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  canvas.addEventListener('pointerleave', () => (pointer = null));

  const hero = h.createHeroCanvas(canvas, ctx, {
    draw,
    onResize(cw, ch) {
      w = cw;
      hh = ch;
      fx.buildVignette(w, hh);
    },
    adaptive: { levels: [...new Set([base, Math.min(base, 1.5), 1])] },
    onStats: params.has('tune') ? (s) => (document.title = `hero3d ${s.fps.toFixed(0)} fps @${s.dpr}x`) : undefined
  });
  if (params.has('tune')) h.createTuner(PARAMS, { title: 'hero3d demo', name: 'PARAMS', onChange: () => reduced && draw(performance.now()) });
  return () => {
    hero.destroy();
    pin.release();
    cta.remove();
  };
}

// ---- the scroll story: a card leaves the page ------------------------------
function mountStory(section, canvas, card) {
  const ctx = canvas.getContext('2d');
  const shot = makeShot(1040, 650);
  let w = 1, hh = 1, p = 0;
  const cam = { pos: { x: 0, y: 2.4, z: -7 }, target: { x: 0, y: 0.6, z: 2 }, fov: 0.8 };
  // lying on the floor, turned a little: its "up" runs away from the camera
  const scenePose = { center: { x: -1.2, y: 0.02, z: 4.5 }, right: { x: 0.94, y: 0, z: -0.34 }, up: { x: 0.34, y: 0, z: 0.94 }, w: 5.2, h: 3.25 };
  const draw = () => {
    ctx.clearRect(0, 0, w, hh);
    // a floor grid for context
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    for (let i = -12; i <= 12; i += 1) {
      for (const [a, b] of [[{ x: i, y: 0, z: -2 }, { x: i, y: 0, z: 20 }], [{ x: -12, y: 0, z: i + 8 }, { x: 12, y: 0, z: i + 8 }]]) {
        const s = h.projectSeg(cam, a, b, w, hh);
        if (!s) continue;
        ctx.beginPath();
        ctx.moveTo(s[0].x, s[0].y);
        ctx.lineTo(s[1].x, s[1].y);
        ctx.stroke();
      }
    }
    const page = h.pagePose(cam, h.elementRect(card, canvas), w, hh, { worldWidth: 3 });
    const pose = h.lerpPose(page, scenePose, h.easeInOut(p));
    const q = h.quadFromCorners(cam, h.cornersOfPose(pose), w, hh);
    if (q) h.drawImageOnQuad(ctx, shot, q);
  };
  const hero = h.createHeroCanvas(canvas, ctx, {
    reduced: true, // draw on demand (resize, scroll), never loop
    draw,
    onResize(cw, ch) {
      w = cw;
      hh = ch;
    }
  });
  const off = h.createScrollTimeline(section, (k) => {
    p = k;
    draw();
  }, { mode: 'pinned' });
  return () => {
    off();
    hero.destroy();
  };
}

mountHero(document.getElementById('hero'), document.getElementById('layer'));
mountStory(document.getElementById('story'), document.getElementById('story-canvas'), document.getElementById('card'));
window.__demoReady = true;
