import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineHeroElement, heroAction, mountHero, type HeroMount } from '../src/mount.js';

// minimal hooks: refs persist across "renders"; effects run immediately
const hookState: { refs: { current: unknown }[]; i: number } = { refs: [], i: 0 };
vi.mock('react', () => ({
  useRef: (v: unknown) => (hookState.refs[hookState.i++] ??= { current: v }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => fn(),
  createElement: (type: string, props: object) => ({ type, props })
}));

const canvas = {} as HTMLCanvasElement;
const recorder = () => {
  const log: string[] = [];
  const mount: HeroMount<{ n: number }> = (_c, p) => {
    log.push(`mount ${p.n}`);
    return { update: (q) => log.push(`update ${q.n}`), destroy: () => log.push('destroy') };
  };
  return { log, mount };
};

describe('mountHero', () => {
  it('accepts an instance, a destroy function, or nothing', () => {
    const d = vi.fn();
    mountHero(() => d, canvas, undefined).destroy();
    expect(d).toHaveBeenCalled();
    expect(() => mountHero(() => {}, canvas, undefined).destroy()).not.toThrow();
  });
});

describe('heroAction (Svelte)', () => {
  it('mounts, updates on new params, remounts on a new mount, destroys', () => {
    const a = recorder();
    const b = recorder();
    const action = heroAction(canvas, { mount: a.mount, params: { n: 1 } });
    action.update({ mount: a.mount, params: { n: 2 } });
    action.update({ mount: b.mount, params: { n: 3 } });
    action.destroy();
    expect(a.log).toEqual(['mount 1', 'update 2', 'destroy']);
    expect(b.log).toEqual(['mount 3', 'destroy']);
  });
});

describe('defineHeroElement', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('defines an element that mounts into a shadow canvas and follows its attributes', () => {
    const registry = new Map<string, CustomElementConstructor>();
    vi.stubGlobal('customElements', { get: (t: string) => registry.get(t), define: (t: string, c: CustomElementConstructor) => registry.set(t, c) });
    const attrs: Record<string, string> = { seed: '4' };
    vi.stubGlobal('HTMLElement', class {
      getAttribute(k: string) { return attrs[k] ?? null; }
      attachShadow() { return { append: () => {} }; }
    });
    vi.stubGlobal('document', { createElement: () => ({ setAttribute() {}, textContent: '' }) });
    const r = recorder();
    defineHeroElement('x-hero', r.mount, { attributes: ['seed'], params: (el) => ({ n: Number(el.getAttribute('seed')) }) });
    defineHeroElement('x-hero', r.mount); // second call is a no-op
    const Ctor = registry.get('x-hero') as unknown as { new (): { connectedCallback(): void; attributeChangedCallback(): void; disconnectedCallback(): void }; observedAttributes: string[] };
    expect(Ctor.observedAttributes).toEqual(['seed']);
    const el = new Ctor();
    el.connectedCallback();
    attrs.seed = '9';
    el.attributeChangedCallback();
    el.disconnectedCallback();
    expect(r.log).toEqual(['mount 4', 'update 9', 'destroy']);
  });
});

describe('useHero (React)', () => {
  it('mounts on ref attach, updates on new params only, destroys on detach', async () => {
    const { useHero, HeroCanvas } = await import('../src/react.js');
    const r = recorder();
    const render = (params: { n: number }) => {
      hookState.i = 0;
      return useHero(r.mount, params);
    };
    const p1 = { n: 1 };
    const ref = render(p1);
    ref(canvas);
    render(p1); // same params object: nothing
    render({ n: 2 });
    ref(null);
    expect(r.log).toEqual(['mount 1', 'update 2', 'destroy']);
    hookState.refs = [];
    hookState.i = 0;
    const el = HeroCanvas({ mount: r.mount, params: { n: 0 }, className: 'hero' }) as unknown as { type: string; props: Record<string, unknown> };
    expect(el.type).toBe('canvas');
    expect(el.props['aria-hidden']).toBe(true);
    expect(el.props.className).toBe('hero');
  });
});
