// The one error model for GL setup. Every GL helper that can fail throws a
// Hero3DGLError (and deletes whatever it created first, so nothing leaks).
// The documented pattern for a hero: catch it at mount, leave the canvas
// not-ready and let the page's CSS fallback show.

export type Hero3DGLErrorKind =
  /** No context, or the context is lost (create* returned null). */
  | 'context'
  /** A shader failed to compile; `log` holds the info log. */
  | 'compile'
  /** A program failed to link; `log` holds the info log. */
  | 'link'
  /** A framebuffer is incomplete. */
  | 'framebuffer';

export class Hero3DGLError extends Error {
  readonly kind: Hero3DGLErrorKind;
  readonly log: string | null;

  constructor(kind: Hero3DGLErrorKind, message: string, log: string | null = null) {
    super(log ? `${message}: ${log}` : message);
    this.name = 'Hero3DGLError';
    this.kind = kind;
    this.log = log;
  }
}
