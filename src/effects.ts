// Shared visual effects for hero canvases: an accent glow sprite, a cached
// quarter-res vignette, and camera-depth fading.

/** Depth-keyed brightness falloff. Defaults are the Astra hero's exact constants. */
export const depthFade = (d: number, min = 0.4, falloff = 0.055, base = 1.5) =>
  Math.min(1, Math.max(min, base - d * falloff));

export interface Effects {
  glow: HTMLCanvasElement;
  blitGlow(dx: number, dy: number, dw: number, dh: number): void;
  buildVignette(w: number, h: number): void;
  drawVignette(w: number, h: number): void;
}

export function createEffects(ctx: CanvasRenderingContext2D, accent: string): Effects {
  // radial accent glow, baked once and blitted wherever a bloom is needed
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  {
    const g = glow.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${accent},0.85)`);
      grad.addColorStop(0.4, `rgba(${accent},0.28)`);
      grad.addColorStop(1, `rgba(${accent},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
  }
  const blitGlow = (dx: number, dy: number, dw: number, dh: number) => {
    ctx.drawImage(glow, dx, dy, dw, dh);
  };

  // vignette: baked at quarter resolution on resize, stretched over the frame
  let vig: HTMLCanvasElement | null = null;
  const buildVignette = (w: number, h: number) => {
    vig = document.createElement('canvas');
    vig.width = Math.max(1, Math.round(w / 4));
    vig.height = Math.max(1, Math.round(h / 4));
    const g = vig.getContext('2d');
    if (!g) return;
    const cx = vig.width / 2;
    const cy = vig.height / 2;
    const grad = g.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.75, cx, cy, Math.hypot(cx, cy) * 1.25);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grad;
    g.fillRect(0, 0, vig.width, vig.height);
  };
  const drawVignette = (w: number, h: number) => {
    if (vig) ctx.drawImage(vig, 0, 0, w, h);
  };

  return { glow, blitGlow, buildVignette, drawVignette };
}
