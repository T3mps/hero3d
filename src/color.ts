// Colour plumbing shared by the painters and GL heroes.

/** An sRGB colour as 0-255 channels. */
export type RGB = readonly [number, number, number];

/** `rgba(r,g,b,a)` for a canvas fill or gradient stop. */
export const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a})`;

/** Resolve any CSS colour expression - custom properties, color-mix(), oklab,
 *  named colours - to sRGB channels, in the cascade of `el`: a probe element
 *  takes the colour inside `el`, and a 1x1 canvas converts whatever the
 *  browser computes to 8-bit sRGB. Alpha is ignored (the probe pixel is
 *  painted opaque over nothing, so translucent colours come back un-blended). */
export function resolveCssColor(el: Element, expression: string): RGB {
  const probe = document.createElement('span');
  probe.style.color = expression;
  probe.style.display = 'none';
  el.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}
