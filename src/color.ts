// Colour plumbing shared by the painters and GL heroes.

/** An sRGB colour as 0-255 channels. */
export type RGB = readonly [number, number, number];

/** `rgba(r,g,b,a)` for a canvas fill or gradient stop. */
export const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a})`;
