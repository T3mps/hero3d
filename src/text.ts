// Text layout for planes: wrapping, ellipsis, runs of mixed style, and a
// measurer. Layout is pure over a `widthOf` function, so it is testable and
// works in any units; on a panel the units are plane px.

/** CSS font shorthand for a size and a font: leading style/weight/variant
 *  tokens stay in front of the size ("600 Inter, sans-serif" at 16 ->
 *  "600 16px Inter, sans-serif"), so a font string may carry its weight. */
export function fontShorthand(px: number, font: string): string {
  const tokens = font.trim().split(/\s+/);
  const lead: string[] = [];
  while (tokens.length > 1 && /^(normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00)$/i.test(tokens[0])) {
    lead.push(tokens.shift()!);
  }
  return [...lead, `${px}px`, tokens.join(' ')].join(' ');
}

export type WidthOf = (text: string) => number;

/** Greedy word wrap. Explicit newlines break; a word longer than the line is
 *  broken between characters. */
export function wrapText(text: string, maxWidth: number, widthOf: WidthOf): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (widthOf(cand) <= maxWidth) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      line = '';
      if (widthOf(word) <= maxWidth) {
        line = word;
        continue;
      }
      // break the long word
      let chunk = '';
      for (const ch of word) {
        if (chunk && widthOf(chunk + ch) > maxWidth) {
          out.push(chunk);
          chunk = '';
        }
        chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

/** Shorten `text` with an ellipsis until it fits `maxWidth`. */
export function ellipsize(text: string, maxWidth: number, widthOf: WidthOf, ellipsis = '…'): string {
  if (widthOf(text) <= maxWidth) return text;
  const chars = [...text];
  let lo = 0, hi = chars.length;
  // the longest prefix that fits with the ellipsis
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (widthOf(chars.slice(0, mid).join('').trimEnd() + ellipsis) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? (widthOf(ellipsis) <= maxWidth ? ellipsis : '') : chars.slice(0, lo).join('').trimEnd() + ellipsis;
}

/** A run of text in one style. `font` may carry a weight/style prefix. */
export interface TextSpan {
  text: string;
  color?: string;
  font?: string;
  alpha?: number;
}

export interface LaidRun {
  text: string;
  /** Offset from the line start. */
  x: number;
  width: number;
  span: TextSpan;
}

export interface LaidLine {
  runs: LaidRun[];
  width: number;
}

/** Lay mixed-style spans out in lines of at most `maxWidth`, breaking at
 *  spaces. Past `maxLines` the last line ends in an ellipsis. */
export function layoutSpans(
  spans: readonly TextSpan[],
  maxWidth: number,
  measure: (text: string, span: TextSpan) => number,
  opts: { maxLines?: number; ellipsis?: string } = {}
): LaidLine[] {
  // tokens: words and the spaces between them, each with its span; '\n' forces a break
  type Tok = { text: string; span: TextSpan; space: boolean; br: boolean };
  const toks: Tok[] = [];
  for (const span of spans) {
    for (const part of span.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/\s/.test(part)) {
        const breaks = part.split('\n').length - 1;
        if (breaks) for (let i = 0; i < breaks; i += 1) toks.push({ text: '', span, space: false, br: true });
        else toks.push({ text: ' ', span, space: true, br: false });
      } else toks.push({ text: part, span, space: false, br: false });
    }
  }
  const lines: LaidLine[] = [];
  let cur: LaidRun[] = [];
  let x = 0;
  const flush = () => {
    // no trailing spaces: drop all-space runs, then trim the last run
    while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop();
    const last = cur[cur.length - 1];
    if (last && /\s$/.test(last.text)) {
      last.text = last.text.trimEnd();
      last.width = measure(last.text, last.span);
    }
    x = last ? last.x + last.width : 0;
    lines.push({ runs: cur, width: x });
    cur = [];
    x = 0;
  };
  for (const t of toks) {
    if (t.br) {
      flush();
      continue;
    }
    if (t.space && cur.length === 0) continue;
    const w = measure(t.text, t.span);
    if (!t.space && x + w > maxWidth && cur.length) flush();
    // merge with the previous run when the style is the same
    const prev = cur[cur.length - 1];
    if (prev && prev.span === t.span) {
      prev.text += t.text;
      prev.width = measure(prev.text, t.span);
      x = prev.x + prev.width;
    } else {
      cur.push({ text: t.text, x, width: w, span: t.span });
      x += w;
    }
  }
  flush();

  const max = opts.maxLines;
  if (max !== undefined && lines.length > max) {
    lines.length = max;
    const last = lines[max - 1];
    const ell = opts.ellipsis ?? '…';
    // trim runs from the end until "<runs>…" fits
    const span = last.runs[last.runs.length - 1]?.span ?? spans[0];
    const ellW = measure(ell, span);
    while (last.runs.length) {
      const r = last.runs[last.runs.length - 1];
      const room = maxWidth - r.x - ellW;
      if (room >= r.width) break;
      const cut = ellipsize(r.text, room + ellW, (s) => measure(s, r.span), ell);
      if (cut && cut !== ell) {
        r.text = cut.slice(0, -ell.length);
        r.width = measure(r.text, r.span);
        break;
      }
      last.runs.pop();
    }
    const tail = last.runs[last.runs.length - 1];
    const at = tail ? tail.x + tail.width : 0;
    last.runs.push({ text: ell, x: at, width: ellW, span: tail?.span ?? span });
    last.width = at + ellW;
  }
  return lines;
}

export interface TextMeasurer {
  /** Width of `text` set at `px` in `font`, in the same units as px. */
  measure(text: string, px: number, font: string): number;
}

/** Measures with a 2D context at a 100 px reference and scales linearly,
 *  caching per font and string. Needs a DOM (or pass any 2D-like context). */
export function createTextMeasurer(ctx?: Pick<CanvasRenderingContext2D, 'font' | 'measureText'> | null): TextMeasurer {
  const c = ctx ?? document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return {
    measure(text, px, font) {
      if (!c) return text.length * px * 0.55;
      const key = `${font}|${text}`;
      let w = cache.get(key);
      if (w === undefined) {
        c.font = fontShorthand(100, font);
        w = c.measureText(text).width / 100;
        if (cache.size > 4096) cache.clear();
        cache.set(key, w);
      }
      return w * px;
    }
  };
}

/** Call `onChange(dark)` when prefers-color-scheme flips. A hero whose colours
 *  follow the scheme clears its glyph cache there (baked labels hold their
 *  colour) and redraws. Returns the unsubscribe. */
export function watchColorScheme(onChange: (dark: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const fn = (e: MediaQueryListEvent) => onChange(e.matches);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}
