// Shared math for Starworks hero canvases. Pure functions, no DOM access.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** smoothstep */
export const smooth = (k: number) => {
  const c = clamp01(k);
  return c * c * (3 - 2 * c);
};

export const easeOut = (k: number) => 1 - (1 - clamp01(k)) ** 3;

export const easeInOut = (k: number): number =>
  k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;

/** 0 -> 1 -> 0 tent over each unit interval */
export const triangle = (value: number) => 1 - Math.abs(((value % 1) + 1) % 1 * 2 - 1);

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  z: lerp(a.z, b.z, k)
});

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
