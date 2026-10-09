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

/** A key on a smooth multi-channel rail. `v` holds one value per channel. `hold`
 *  (0..1) scales this key's tangent on the channels named by the rail: 0 flows
 *  straight through the key, 1 comes to rest on it. */
export interface RailKey {
  t: number;
  v: number[];
  hold: number;
}

/**
 * Catmull-Rom (cardinal Hermite) through time-stamped keys, per channel. Needs
 * keys k[i-1..i+2] around t (callers keep one key either side); passes exactly
 * through every key, with continuous velocity unless a key holds.
 * `holdChannels` lists the channels a key's `hold` applies to.
 */
export function sampleSmoothRail(keys: RailKey[], t: number, holdChannels: readonly number[] = []): number[] {
  let n = 0;
  while (n < keys.length - 2 && keys[n + 1].t <= t) n += 1;
  const k0 = keys[Math.max(0, n - 1)], k1 = keys[n], k2 = keys[n + 1], k3 = keys[Math.min(keys.length - 1, n + 2)];
  const h = k2.t - k1.t, s = clamp01((t - k1.t) / h), s2 = s * s, s3 = s2 * s;
  const out: number[] = [];
  for (let c = 0; c < k1.v.length; c += 1) {
    const held = holdChannels.includes(c);
    const m1 = ((k2.v[c] - k0.v[c]) / Math.max(1e-6, k2.t - k0.t)) * h * (held ? 1 - k1.hold : 1);
    const m2 = ((k3.v[c] - k1.v[c]) / Math.max(1e-6, k3.t - k1.t)) * h * (held ? 1 - k2.hold : 1);
    out.push((2 * s3 - 3 * s2 + 1) * k1.v[c] + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * k2.v[c] + (s3 - s2) * m2);
  }
  return out;
}

/**
 * An endless rail: keys are dealt one at a time by `deal(previous)` as time
 * reaches them, and keys far behind are dropped, so it runs forever in constant
 * memory. `first` must hold at least two keys sorted by t. Deterministic when
 * `deal` draws from a seeded stream.
 */
export function createDealtRail(first: RailKey[], deal: (prev: RailKey) => RailKey, holdChannels: readonly number[] = []) {
  const keys = first.slice();
  return (t: number): number[] => {
    while (keys.length < 4 || keys[keys.length - 2].t <= t) keys.push(deal(keys[keys.length - 1]));
    while (keys.length > 5 && keys[2].t <= t) keys.shift();
    return sampleSmoothRail(keys, t, holdChannels);
  };
}
