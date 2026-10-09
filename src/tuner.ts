// A development overlay for tuning a hero live: every number in a params
// object (nested objects and arrays included, so camera keys and colours too)
// gets a slider and a field; edits mutate the object in place, so a hero that
// reads its params each frame updates immediately; "Copy" puts the tuned
// values on the clipboard as code to paste back. Mount it only in development
// (e.g. behind import.meta.env.DEV); nothing here runs unless called.

export interface Leaf {
  path: string;
  get(): number;
  set(v: number): void;
}

/** Every finite number reachable in `obj`, with its path ("keys[2].pos.x"). */
export function tunableLeaves(obj: object, prefix = ''): Leaf[] {
  const out: Leaf[] = [];
  const rec = obj as Record<string | number, unknown>;
  for (const key of Object.keys(rec)) {
    const v = rec[key];
    const path = Array.isArray(obj) ? `${prefix}[${key}]` : prefix ? `${prefix}.${key}` : key;
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push({ path, get: () => rec[key] as number, set: (n) => { rec[key] = n; } });
    } else if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) {
      out.push(...tunableLeaves(v as object, path));
    }
  }
  return out;
}

/** A slider range around a starting value: [min, max, step]. */
export function guessRange(v: number): [number, number, number] {
  if (v >= 0 && v <= 1) return [0, 1, 0.001];
  const span = Math.max(1, Math.abs(v) * 2);
  const step = 10 ** Math.floor(Math.log10(span / 200));
  return [v - span, v + span, step];
}

/** The params as pasteable code, numbers rounded to `digits` decimals. */
export function paramsToCode(obj: object, name = 'PARAMS', digits = 4): string {
  const json = JSON.stringify(obj, (_k, v) => (typeof v === 'number' ? +v.toFixed(digits) : v), 2);
  return `const ${name} = ${json.replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')};`;
}

export interface TunerOpts {
  title?: string;
  /** Per-path [min, max, step] overrides. */
  ranges?: Record<string, readonly [number, number, number]>;
  /** Called after each edit (e.g. to redraw a reduced-motion frame). */
  onChange?(path: string, value: number): void;
  /** The name in the copied code. */
  name?: string;
  container?: HTMLElement;
}

export interface Tuner {
  /** Re-read every value into the controls (after the params changed elsewhere). */
  refresh(): void;
  toCode(): string;
  destroy(): void;
}

export function createTuner(params: object, opts: TunerOpts = {}): Tuner {
  const doc = document;
  const root = doc.createElement('details');
  root.open = true;
  root.setAttribute('data-hero3d-tuner', '');
  Object.assign(root.style, {
    position: 'fixed', right: '12px', top: '12px', zIndex: '2147483647', maxHeight: '80vh', overflow: 'auto',
    width: '300px', background: 'rgba(16,16,20,.92)', color: '#e8e8ea', font: '12px/1.4 ui-monospace, monospace',
    border: '1px solid rgba(255,255,255,.15)', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 8px 30px rgba(0,0,0,.4)'
  });
  const summary = doc.createElement('summary');
  summary.textContent = opts.title ?? 'hero3d tuner';
  summary.style.cursor = 'pointer';
  root.append(summary);

  const leaves = tunableLeaves(params);
  const rows: { leaf: Leaf; range: HTMLInputElement; num: HTMLInputElement }[] = [];
  for (const leaf of leaves) {
    const [min, max, step] = opts.ranges?.[leaf.path] ?? guessRange(leaf.get());
    const row = doc.createElement('label');
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: '1fr 70px', gap: '2px 6px', margin: '6px 0' });
    const name = doc.createElement('span');
    name.textContent = leaf.path;
    name.style.gridColumn = '1 / -1';
    name.style.opacity = '.75';
    const range = doc.createElement('input');
    range.type = 'range';
    Object.assign(range, { min: String(min), max: String(max), step: String(step), value: String(leaf.get()) });
    const num = doc.createElement('input');
    num.type = 'number';
    Object.assign(num, { step: String(step), value: String(leaf.get()) });
    num.style.width = '70px';
    const commit = (v: number) => {
      if (!Number.isFinite(v)) return;
      leaf.set(v);
      range.value = String(v);
      num.value = String(v);
      opts.onChange?.(leaf.path, v);
    };
    range.addEventListener('input', () => commit(range.valueAsNumber));
    num.addEventListener('change', () => commit(num.valueAsNumber));
    row.append(name, range, num);
    root.append(row);
    rows.push({ leaf, range, num });
  }

  const toCode = () => paramsToCode(params, opts.name);
  const copy = doc.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy as code';
  copy.addEventListener('click', () => {
    const code = toCode();
    void navigator.clipboard?.writeText(code).then(
      () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy as code'; }, 1200); },
      () => console.log(code)
    );
  });
  root.append(copy);
  (opts.container ?? doc.body).append(root);

  return {
    refresh() {
      for (const { leaf, range, num } of rows) {
        range.value = String(leaf.get());
        num.value = String(leaf.get());
      }
    },
    toCode,
    destroy() {
      root.remove();
    }
  };
}
