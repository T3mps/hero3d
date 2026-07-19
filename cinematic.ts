// Reusable camera-choreography primitives: orbital rails, eased keyframe
// paths, hand-held drift, and framing-constrained rail sampling. Domain
// tuning (pivots, key positions, ranges, framing predicates) stays with each
// hero; only the mechanisms live here.
import { type Vec3, clamp01, easeInOut, lerp3 } from './math';
import type { Camera } from './camera';

export interface CamPose {
  pos: Vec3;
  target: Vec3;
}

export interface CamKey extends CamPose {
  t: number;
}

/** Camera pose on an orbit around a ground-plane pivot. */
export const orbitCam = (
  pivot: { x: number; z: number },
  az: number,
  h: number,
  r: number,
  tx: number,
  tz: number
): CamPose => ({
  pos: { x: pivot.x + Math.sin(az) * r, y: h, z: pivot.z - Math.cos(az) * r },
  target: { x: tx, y: 0, z: tz }
});

/**
 * Ease-in-out keyframe walk. `path` must hold >= 2 keys sorted by t; t before
 * the first key eases from key 0, t after the last clamps to it (matching the
 * segment-picking loop, which never advances past the final segment).
 */
export function interpKeys(path: CamKey[], t: number): CamPose {
  let i = 0;
  while (i < path.length - 2 && t >= path[i + 1].t) i += 1;
  const a = path[i];
  const b = path[i + 1];
  const k = easeInOut(clamp01((t - a.t) / (b.t - a.t)));
  return { pos: lerp3(a.pos, b.pos, k), target: lerp3(a.target, b.target, k) };
}

export interface DriftAmps {
  posX: readonly [number, number]; // [base, x closeness]
  posY: readonly [number, number];
  targetX: readonly [number, number];
}

/** Loop-periodic hand-held drift, stronger as `close` -> 1. Mutates cam. */
export function handHeldDrift(
  cam: Camera,
  t: number,
  omega: number,
  close: number,
  amps: DriftAmps
): void {
  cam.pos.x += (amps.posX[0] + amps.posX[1] * close) * Math.sin(t * omega + 1.3);
  cam.pos.y += (amps.posY[0] + amps.posY[1] * close) * Math.sin(t * 2 * omega);
  cam.target.x += (amps.targetX[0] + amps.targetX[1] * close) * Math.sin(t * 3 * omega + 0.7);
}

/**
 * Rejection-sample rail parameters from a seeded stream until a candidate
 * satisfies the framing predicate; falls back after `attempts` misses.
 * `gen` must draw from `pick` in a FIXED order (e.g. object-literal order)
 * so a given seed always yields the same candidate stream.
 */
export function sampleRail<P>(
  rng: () => number,
  gen: (pick: (range: readonly [number, number]) => number) => P,
  fits: (cand: P) => boolean,
  fallback: P,
  attempts = 40
): P {
  const pick = (range: readonly [number, number]) => range[0] + rng() * (range[1] - range[0]);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const cand = gen(pick);
    if (fits(cand)) return cand;
  }
  return fallback;
}
