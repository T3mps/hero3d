import { describe, expect, it } from 'vitest';
import { createDealtRail, interpKeys, orbitCam, sampleRail, sampleSmoothRail, type CamKey, type RailKey } from '../src/cinematic.js';
import { mulberry32 } from '../src/math.js';

const key = (t: number, x: number): CamKey => ({ t, pos: { x, y: 1, z: 0 }, target: { x, y: 0, z: 1 } });

describe('interpKeys', () => {
  const path = [key(0, 0), key(1, 10), key(3, 20)];

  it('passes through every key', () => {
    expect(interpKeys(path, 0).pos.x).toBe(0);
    expect(interpKeys(path, 1).pos.x).toBe(10);
    expect(interpKeys(path, 3).pos.x).toBe(20);
  });

  it('clamps before the first key and after the last', () => {
    expect(interpKeys(path, -5).pos.x).toBe(0);
    expect(interpKeys(path, 99).pos.x).toBe(20);
  });

  it('eases in and out within a segment', () => {
    expect(interpKeys(path, 0.5).pos.x).toBeCloseTo(5, 12);
    expect(interpKeys(path, 0.1).pos.x).toBeLessThan(1);
  });
});

describe('orbitCam', () => {
  it('sits r from the pivot at height h, looking at the target on the ground', () => {
    const pose = orbitCam({ x: 1, z: 2 }, Math.PI / 2, 3, 4, 5, 6);
    expect(pose.pos.x).toBeCloseTo(5, 12);
    expect(pose.pos.y).toBe(3);
    expect(pose.pos.z).toBeCloseTo(2, 12);
    expect(pose.target).toEqual({ x: 5, y: 0, z: 6 });
  });
});

describe('sampleRail', () => {
  it('returns the first candidate that fits, deterministically per seed', () => {
    const gen = (pick: (r: readonly [number, number]) => number) => ({ a: pick([0, 1]) });
    const fits = (c: { a: number }) => c.a > 0.9;
    const one = sampleRail(mulberry32(7), gen, fits, { a: -1 });
    const two = sampleRail(mulberry32(7), gen, fits, { a: -1 });
    expect(one).toEqual(two);
    expect(one.a).toBeGreaterThan(0.9);
  });

  it('falls back after the attempts run out', () => {
    expect(sampleRail(mulberry32(1), () => 'candidate', () => false, 'fallback', 5)).toBe('fallback');
  });
});

describe('sampleSmoothRail', () => {
  const keys: RailKey[] = [
    { t: 0, v: [0, 0], hold: 0 },
    { t: 1, v: [1, 5], hold: 1 },
    { t: 2, v: [3, 2], hold: 0 },
    { t: 3, v: [4, 4], hold: 0 }
  ];

  it('passes exactly through every key', () => {
    for (const k of keys.slice(0, -1)) expect(sampleSmoothRail(keys, k.t)).toEqual(k.v);
  });

  it('comes to rest on a held key, on the held channels only', () => {
    const e = 1e-4;
    const vel = (c: number) => (sampleSmoothRail(keys, 1 + e, [1])[c] - sampleSmoothRail(keys, 1 - e, [1])[c]) / (2 * e);
    expect(Math.abs(vel(1))).toBeLessThan(1e-3);
    expect(Math.abs(vel(0))).toBeGreaterThan(0.5);
  });

  it('has continuous velocity through an unheld key', () => {
    const e = 1e-5;
    const before = (sampleSmoothRail(keys, 2)[0] - sampleSmoothRail(keys, 2 - e)[0]) / e;
    const after = (sampleSmoothRail(keys, 2 + e)[0] - sampleSmoothRail(keys, 2)[0]) / e;
    expect(after).toBeCloseTo(before, 2);
  });
});

describe('createDealtRail', () => {
  const make = () => {
    const rng = mulberry32(3);
    let dealt = 0;
    const deal = (prev: RailKey): RailKey => {
      dealt += 1;
      return { t: prev.t + 1 + rng(), v: [rng() * 10], hold: 0 };
    };
    const rail = createDealtRail([{ t: 0, v: [0], hold: 0 }, { t: 1, v: [1], hold: 0 }], deal);
    return { rail, dealt: () => dealt };
  };

  it('deals keys deterministically and only as time reaches them', () => {
    const a = make();
    const b = make();
    const samples: number[] = [];
    for (let t = 0; t < 10000; t += 0.5) samples.push(a.rail(t)[0]);
    let i = 0;
    for (let t = 0; t < 10000; t += 0.5) expect(b.rail(t)[0]).toBe(samples[i++]);
    expect(samples.every(Number.isFinite)).toBe(true);
    // keys are ~1.5 s apart, so ~6700 over 10000 s: dealt on demand, not ahead
    expect(a.dealt()).toBeGreaterThan(5000);
    expect(a.dealt()).toBeLessThan(10000);
  });

  it('leaves the caller’s first keys untouched and passes through every dealt key', () => {
    const first: RailKey[] = [{ t: 0, v: [0], hold: 0 }, { t: 1, v: [1], hold: 0 }];
    const rail = createDealtRail(first, (prev) => ({ t: prev.t + 1, v: [prev.v[0] * 2 + 1], hold: 0 }));
    const at: number[] = [];
    for (let t = 0; t <= 6; t += 1) at.push(rail(t)[0]);
    expect(at).toEqual([0, 1, 3, 7, 15, 31, 63]);
    expect(first).toEqual([{ t: 0, v: [0], hold: 0 }, { t: 1, v: [1], hold: 0 }]);
  });
});
