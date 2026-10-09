import { describe, expect, it } from 'vitest';
import { createChunkStream } from '../src/streamedBake.js';

// A fake GPU: a chunk takes `cost` units (begin is the first) and every call is logged.
const harness = (cost = 2) => {
  const begun: number[] = [];
  const produced: number[] = [];
  const freed: number[] = [];
  const stream = createChunkStream<string, { i: number; left: number }>({
    produce: (i) => produced.push(i),
    begin: (i) => {
      begun.push(i);
      return { i, left: cost - 1 };
    },
    step: (g) => {
      g.left -= 1;
      return g.left <= 0;
    },
    free: (g) => freed.push(g.i)
  });
  const deliver = (...ids: number[]) => ids.forEach((i) => stream.deliver(i, `d${i}`));
  return { stream, begun, produced, freed, deliver };
};

describe('createChunkStream', () => {
  it('asks for the chunks in view plus one prefetch either side, once each', () => {
    const h = harness();
    h.stream.want(0, 2);
    h.stream.want(0, 2);
    expect([...h.produced].sort((a, b) => a - b)).toEqual([-1, 0, 1, 2, 3]);
  });

  it('builds the chunks in view first, within the step budget, and reports readiness', () => {
    const h = harness(2);
    h.stream.want(0, 1);
    h.deliver(-1, 0, 1, 2);
    h.stream.pump(2);
    expect(h.begun).toEqual([0]);
    expect(h.stream.ready(0)).not.toBeNull();
    expect(h.stream.allReady(0, 1)).toBe(false);
    h.stream.pump(2);
    expect(h.stream.allReady(0, 1)).toBe(true);
    expect(h.stream.ready(-1)).toBeNull();
    h.stream.pump(10);
    expect(h.stream.ready(-1)).not.toBeNull();
    expect(h.stream.ready(2)).not.toBeNull();
  });

  it('waits for data before building', () => {
    const h = harness(1);
    h.stream.want(0, 0);
    h.stream.pump(10);
    expect(h.begun).toEqual([]);
    h.deliver(0);
    h.stream.pump(10);
    expect(h.stream.ready(0)).not.toBeNull();
  });

  it('frees what falls out of reach, and reuses cached data when it comes back', () => {
    const h = harness(1);
    h.stream.want(0, 0);
    h.deliver(-1, 0, 1);
    h.stream.pump(10);
    h.stream.want(4, 4);
    expect([...h.freed].sort((a, b) => a - b)).toEqual([-1, 0, 1]);
    h.produced.length = 0;
    h.stream.want(0, 0);
    expect(h.produced).toEqual([]);
    h.stream.pump(10);
    expect(h.stream.ready(0)).not.toBeNull();
  });

  it('resetGpu frees every GPU side but keeps the data, so the next pump rebuilds without producing', () => {
    const h = harness(1);
    h.stream.want(0, 0);
    h.deliver(-1, 0, 1);
    h.stream.pump(10);
    const producedBefore = h.produced.length;
    h.stream.resetGpu();
    expect(h.freed.length).toBe(3);
    expect(h.stream.ready(0)).toBeNull();
    h.stream.pump(10);
    expect(h.stream.ready(0)).not.toBeNull();
    expect(h.produced.length).toBe(producedBefore);
  });
});
