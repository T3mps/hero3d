// Font gate for hero canvases. Canvas text bakes with whatever face the
// browser has at draw time; a hero that draws once (reduced motion) or caches
// baked labels must wait for its webfonts first. `ensureFonts` wraps
// document.fonts.load for each spec and resolves when all are usable - or when
// the timeout passes, so a missing font file can never hang a hero.

export interface FontSetLike {
  load(spec: string): Promise<unknown>;
}

export type FontGateResult = 'loaded' | 'timeout' | 'unavailable';

export function ensureFonts(
  specs: string[],
  opts: { fonts?: FontSetLike | null; timeoutMs?: number } = {}
): Promise<FontGateResult> {
  const fonts =
    opts.fonts === undefined
      ? typeof document !== 'undefined' && 'fonts' in document
        ? (document.fonts as unknown as FontSetLike)
        : null
      : opts.fonts;
  const timeoutMs = opts.timeoutMs ?? 3000;
  if (!fonts) return Promise.resolve('unavailable');
  const all = Promise.all(specs.map((s) => fonts.load(s).catch(() => undefined))).then(
    () => 'loaded' as const
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  return Promise.race([all, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
