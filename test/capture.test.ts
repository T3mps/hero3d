import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureFrame, exportFrames, posterFrame, recordVideo, seedFrom } from '../src/capture.js';

const fakeCanvas = () => {
  const log: string[] = [];
  const canvas = {
    toBlob: (cb: (b: Blob | null) => void, type: string) => {
      log.push(`blob ${type}`);
      cb(new Blob([log.length.toString()], { type }));
    },
    toDataURL: (type: string, q: number) => `data:${type};q=${q}`,
    captureStream: () => ({ getTracks: () => [{ stop: () => log.push('track stopped') }] })
  } as unknown as HTMLCanvasElement;
  return { canvas, log };
};

describe('seedFrom', () => {
  it('reads ?seed=N, else the fallback, else something random', () => {
    expect(seedFrom('?seed=7')).toBe(7);
    expect(seedFrom(new URLSearchParams('s=12'), 's')).toBe(12);
    expect(seedFrom('?seed=abc', 'seed', 3)).toBe(3);
    const r = seedFrom('');
    expect(Number.isInteger(r) && r >= 0 && r < 2 ** 32).toBe(true);
  });
});

describe('frames', () => {
  it('captureFrame draws at t then encodes in the same task', async () => {
    const { canvas, log } = fakeCanvas();
    const draw = vi.fn((t: number) => log.push(`draw ${t}`));
    const blob = await captureFrame(canvas, draw, 1500, { type: 'image/webp' });
    expect(log).toEqual(['draw 1500', 'blob image/webp']);
    expect(blob.type).toBe('image/webp');
  });

  it('posterFrame returns a data URL', () => {
    const { canvas } = fakeCanvas();
    expect(posterFrame(canvas, () => {}, 0)).toBe('data:image/webp;q=0.9');
  });

  it('exportFrames renders at exact times, in order, awaiting each frame, and can abort', async () => {
    const { canvas } = fakeCanvas();
    const times: number[] = [];
    const n = await exportFrames(canvas, (t) => times.push(t), { fps: 30, durationMs: 100, startMs: 1000, onFrame: async () => {} });
    expect(n).toBe(3);
    expect(times).toEqual([1000, 1000 + 1000 / 30, 1000 + 2000 / 30]);
    const ac = new AbortController();
    const got = await exportFrames(canvas, () => {}, { durationMs: 1000, signal: ac.signal, onFrame: (_b, i) => { if (i === 1) ac.abort(); } });
    expect(got).toBe(2);
  });
});

describe('recordVideo', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('records for the duration and resolves to the chunks as one blob', async () => {
    vi.useFakeTimers();
    class FakeRecorder {
      static isTypeSupported = (t: string) => t === 'video/webm';
      state = 'inactive';
      mimeType: string;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror = null;
      constructor(_s: unknown, o: { mimeType: string }) { this.mimeType = o.mimeType; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['abc']) }); this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    const { canvas, log } = fakeCanvas();
    const p = recordVideo(canvas, { durationMs: 2000 });
    vi.advanceTimersByTime(2000);
    const blob = await p;
    expect(blob.type).toBe('video/webm');
    expect(blob.size).toBe(3);
    expect(log).toContain('track stopped');
    vi.useRealTimers();
  });
});
