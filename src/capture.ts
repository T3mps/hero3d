// Deterministic frames, posters and recordings. A hero whose frame is a pure
// function of time (and a seed) can be rendered at any t on demand: for pixel
// tests, a poster image (the no-JS / reduced-motion fallback, a social card),
// or an offline frame sequence that encodes to a perfectly smooth video.

/** A seed from the URL (?seed=N), so a visit can be pinned and shared; else
 *  `fallback`, else a random 32-bit seed. */
export function seedFrom(search: string | URLSearchParams, name = 'seed', fallback?: number): number {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const raw = params.get(name);
  const n = raw === null ? NaN : Number(raw);
  if (Number.isFinite(n)) return n >>> 0;
  return fallback ?? Math.floor(Math.random() * 2 ** 32);
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob produced nothing'))), type, quality)
  );

export interface FrameOpts {
  type?: string; // default 'image/png'
  quality?: number;
}

/** Draw the frame at `tMs` and encode it. The read happens in the same task as
 *  the draw, so it works for WebGL canvases without preserveDrawingBuffer. */
export function captureFrame(canvas: HTMLCanvasElement, draw: (now: number) => void, tMs: number, opts: FrameOpts = {}): Promise<Blob> {
  draw(tMs);
  return toBlob(canvas, opts.type ?? 'image/png', opts.quality);
}

/** The frame at `tMs` as a data URL: a poster for an <img>, a CSS background
 *  or a reduced-motion fallback. */
export function posterFrame(canvas: HTMLCanvasElement, draw: (now: number) => void, tMs: number, opts: FrameOpts = {}): string {
  draw(tMs);
  return canvas.toDataURL(opts.type ?? 'image/webp', opts.quality ?? 0.9);
}

export interface ExportOpts extends FrameOpts {
  fps?: number; // default 60
  durationMs: number;
  startMs?: number;
  /** Receives each frame in order; awaited, so it can write to disk or a muxer. */
  onFrame(frame: Blob, index: number, tMs: number): void | Promise<void>;
  /** Abort between frames. */
  signal?: AbortSignal;
}

/** Render frames at exact times (start + i / fps) and hand each over: an
 *  offline export that never drops a frame, whatever the machine. Resolves to
 *  the frame count. */
export async function exportFrames(canvas: HTMLCanvasElement, draw: (now: number) => void, opts: ExportOpts): Promise<number> {
  const fps = opts.fps ?? 60;
  const count = Math.round((opts.durationMs * fps) / 1000);
  const start = opts.startMs ?? 0;
  for (let i = 0; i < count; i += 1) {
    if (opts.signal?.aborted) return i;
    const t = start + (i * 1000) / fps;
    await opts.onFrame(await captureFrame(canvas, draw, t, opts), i, t);
  }
  return count;
}

/** Record the canvas as it animates, in real time, with MediaRecorder (webm
 *  where supported). For a quick clip; use exportFrames for a perfect one. */
export function recordVideo(canvas: HTMLCanvasElement, opts: { durationMs: number; fps?: number; mimeType?: string; bitsPerSecond?: number }): Promise<Blob> {
  const stream = canvas.captureStream(opts.fps ?? 60);
  const mimeType =
    opts.mimeType ?? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: opts.bitsPerSecond ?? 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  return new Promise((resolve, reject) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' }));
    };
    rec.onerror = (e) => reject((e as unknown as { error?: Error }).error ?? new Error('MediaRecorder failed'));
    rec.start(250);
    setTimeout(() => rec.state !== 'inactive' && rec.stop(), opts.durationMs);
  });
}
