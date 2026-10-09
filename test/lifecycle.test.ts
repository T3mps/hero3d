import { describe, expect, it } from 'vitest';
import { MAX_FPS, shouldDraw } from '../src/lifecycle.js';

// Feed the pacer a synthetic RAF tick stream at a given refresh rate and count
// the draws it lets through (moved from Starworks' hero-perf.spec.ts).
const drawsPerSecond = (hz: number, maxFps = MAX_FPS) => {
  const dt = 1000 / hz;
  let last = -Infinity;
  let prev = 0;
  let draws = 0;
  for (let i = 1; i <= hz * 4; i += 1) {
    const ts = i * dt;
    if (shouldDraw(ts, last, ts - prev, 1000 / maxFps)) {
      draws += 1;
      last = ts;
    }
    prev = ts;
  }
  return draws / 4;
};

describe('shouldDraw', () => {
  it('paces 240 Hz to 60 fps, 144 Hz to 72, 120 Hz to 60, and lets 60 and 30 Hz through', () => {
    expect(MAX_FPS).toBe(60);
    expect(drawsPerSecond(240)).toBe(60);
    expect(drawsPerSecond(144)).toBe(72);
    expect(drawsPerSecond(120)).toBe(60);
    expect(drawsPerSecond(60)).toBe(60);
    expect(drawsPerSecond(30)).toBe(30);
  });

  it('honours another cap', () => {
    expect(drawsPerSecond(240, 30)).toBe(30);
    expect(drawsPerSecond(120, 120)).toBe(120);
  });

  it('always draws the very first tick', () => {
    expect(shouldDraw(0, -Infinity, 0, 1000 / MAX_FPS)).toBe(true);
  });
});
