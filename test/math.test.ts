import { describe, expect, it } from 'vitest';
import { clamp, clamp01, cross, dot, easeInOut, easeOut, lerp, lerp3, mulberry32, norm, smooth, sub, triangle } from '../src/math.js';

describe('easing', () => {
  it('every ease starts at 0 and ends at 1', () => {
    for (const f of [smooth, easeOut, easeInOut]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
    }
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
  });

  it('smooth and easeOut clamp their input', () => {
    expect(smooth(-1)).toBe(0);
    expect(smooth(2)).toBe(1);
    expect(easeOut(-3)).toBe(0);
    expect(easeOut(9)).toBe(1);
  });

  it('triangle is a 0 -> 1 -> 0 tent over every unit interval, negatives included', () => {
    expect(triangle(0)).toBe(0);
    expect(triangle(0.5)).toBe(1);
    expect(triangle(0.25)).toBeCloseTo(0.5, 12);
    expect(triangle(1.75)).toBeCloseTo(0.5, 12);
    expect(triangle(-0.25)).toBeCloseTo(0.5, 12);
  });
});

describe('scalars and vectors', () => {
  it('clamps', () => {
    expect(clamp01(-0.1)).toBe(0);
    expect(clamp01(1.1)).toBe(1);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
  });

  it('lerps', () => {
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect(lerp3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 8 }, 0.5)).toEqual({ x: 1, y: 2, z: 4 });
  });

  it('cross, dot, sub and norm', () => {
    const x = { x: 1, y: 0, z: 0 };
    const y = { x: 0, y: 1, z: 0 };
    expect(cross(x, y)).toEqual({ x: 0, y: 0, z: 1 });
    expect(dot(x, y)).toBe(0);
    expect(sub({ x: 3, y: 2, z: 1 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 2, y: 1, z: 0 });
    const n = norm({ x: 3, y: 4, z: 12 });
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 12);
    // a zero vector normalises to itself instead of NaN
    expect(norm({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seq = Array.from({ length: 1000 }, () => a());
    expect(seq).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });
});
