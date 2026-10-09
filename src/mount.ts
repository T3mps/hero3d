// One mounting contract for every framework wrapper. A hero is a function from
// a canvas (and optional params) to something that can be updated and
// destroyed; the Svelte action, the custom element and the React hook are a
// few lines each over it. The core never depends on a framework.

export interface HeroInstance<P> {
  update?(params: P): void;
  destroy(): void;
}

/** Mount a hero on a canvas. Return an instance, a destroy function, or nothing. */
export type HeroMount<P = void> = (canvas: HTMLCanvasElement, params: P) => HeroInstance<P> | (() => void) | void;

export function mountHero<P>(mount: HeroMount<P>, canvas: HTMLCanvasElement, params: P): HeroInstance<P> {
  const r = mount(canvas, params);
  if (typeof r === 'function') return { destroy: r };
  return r ?? { destroy: () => {} };
}

/** A Svelte action (Svelte 4 and 5): `<canvas use:heroAction={{ mount, params }} />`.
 *  Needs nothing from Svelte. */
export function heroAction<P>(node: HTMLCanvasElement, arg: { mount: HeroMount<P>; params: P }) {
  let mount = arg.mount;
  let inst = mountHero(mount, node, arg.params);
  return {
    update(next: { mount: HeroMount<P>; params: P }) {
      if (next.mount !== mount) {
        inst.destroy();
        mount = next.mount;
        inst = mountHero(mount, node, next.params);
      } else inst.update?.(next.params);
    },
    destroy() {
      inst.destroy();
    }
  };
}

export interface HeroElementOpts<P> {
  /** Attributes whose changes update the hero. */
  attributes?: readonly string[];
  /** Params from the element (its attributes, dataset...). */
  params?(el: HTMLElement): P;
}

/** Register `<tag>` as a custom element that renders the hero into a canvas
 *  filling it (size it with CSS like any block). Safe to call twice. */
export function defineHeroElement<P>(tag: string, mount: HeroMount<P>, opts: HeroElementOpts<P> = {}): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  const paramsOf = (el: HTMLElement) => (opts.params ? opts.params(el) : (undefined as P));
  class HeroElement extends HTMLElement {
    static get observedAttributes() {
      return [...(opts.attributes ?? [])];
    }
    #inst: HeroInstance<P> | null = null;
    #canvas: HTMLCanvasElement | null = null;
    connectedCallback() {
      if (!this.#canvas) {
        const root = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = ':host{display:block;position:relative}canvas{display:block;width:100%;height:100%}';
        this.#canvas = document.createElement('canvas');
        this.#canvas.setAttribute('aria-hidden', 'true');
        root.append(style, this.#canvas);
      }
      this.#inst = mountHero(mount, this.#canvas, paramsOf(this));
    }
    disconnectedCallback() {
      this.#inst?.destroy();
      this.#inst = null;
    }
    attributeChangedCallback() {
      this.#inst?.update?.(paramsOf(this));
    }
  }
  customElements.define(tag, HeroElement);
}
