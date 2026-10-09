// React bindings: `import { useHero, HeroCanvas } from '@starworks/hero3d/react'`.
// A separate entry point (react is an optional peer dependency); the package
// root never imports React.
import { createElement, useCallback, useEffect, useRef, type CanvasHTMLAttributes, type RefCallback } from 'react';
import { mountHero, type HeroInstance, type HeroMount } from './mount.js';

/** Mount `mount` on the canvas the returned ref is attached to; a new
 *  `params` object updates it, a new `mount` remounts it. */
export function useHero<P>(mount: HeroMount<P>, params: P): RefCallback<HTMLCanvasElement> {
  const inst = useRef<HeroInstance<P> | null>(null);
  const latest = useRef(params);
  const applied = useRef(params);
  latest.current = params;
  const ref = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      inst.current?.destroy();
      inst.current = null;
      if (canvas) {
        applied.current = latest.current;
        inst.current = mountHero(mount, canvas, latest.current);
      }
    },
    [mount]
  );
  useEffect(() => {
    if (inst.current && applied.current !== params) {
      applied.current = params;
      inst.current.update?.(params);
    }
  }, [params]);
  return ref;
}

export type HeroCanvasProps<P> = { mount: HeroMount<P>; params: P } & Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'ref'>;

/** `<HeroCanvas mount={mountTiles} params={{ seed }} className="hero" />`, aria-hidden by default. */
export function HeroCanvas<P>({ mount, params, ...rest }: HeroCanvasProps<P>) {
  return createElement('canvas', { 'aria-hidden': true, ...rest, ref: useHero(mount, params) });
}
