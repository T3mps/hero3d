// Real DOM on canvas planes. A projected quad is a homography of the plane, and
// CSS transforms are projective, so a matrix3d can place an element's box
// exactly on the quad: the canvas draws hundreds of tiles, and the few things
// that must be clickable, focusable, selectable or read by a screen reader
// (a link, a button, an input, the headline) are real HTML riding the same
// plane, re-placed every frame.
//
// The layer: an element positioned exactly over the canvas (same box, e.g.
// `position:absolute; inset:0; overflow:hidden; pointer-events:none`); pinned
// elements are its children and get pointer events back.
import { rectToQuad } from './homography.js';
import type { Quad } from './quads.js';

/** The CSS matrix3d that takes a w x h element box (origin top-left, with
 *  `transform-origin: 0 0`) onto the quad's screen corners (CSS px, relative to
 *  the layer). Null for a degenerate quad. */
export function matrix3dFor(w: number, h: number, q: Quad): number[] | null {
  const m = rectToQuad(w, h, q);
  if (!m) return null;
  // keep w positive over the box so the browser never sees a flipped divide
  const s = m[8] < 0 ? -1 : 1;
  const [a, b, c, d, e, f, g, hh, i] = m.map((v) => v * s);
  // rows [a b 0 c; d e 0 f; 0 0 1 0; g hh 0 i], written column-major
  return [a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, i];
}

export const matrix3dCss = (m: number[]) => `matrix3d(${m.map((v) => +v.toPrecision(12)).join(',')})`;

/** Whether the quad faces the camera (its fl -> fr -> nr -> nl winding is
 *  clockwise on screen, y down). A plane seen from behind shows the element
 *  mirrored, so pinned elements hide by default. */
export const quadFacesCamera = (q: Quad) => {
  const pts = [q.fl, q.fr, q.nr, q.nl];
  let a = 0;
  for (let i = 0; i < 4; i += 1) {
    const p = pts[i], n = pts[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return a > 0;
};

export interface PlaceOpts {
  opacity?: number;
  /** Show the element when the plane is seen from behind. Default false. */
  backface?: boolean;
}

export interface PinnedElement {
  readonly el: HTMLElement;
  /** Whether focus is inside the element: a hero should hold its camera (or
   *  at least keep the plane on screen) while it is. */
  readonly focused: boolean;
  /** Put the element on the quad, or hide it (null: clipped or off screen).
   *  A hidden element is also inert, so Tab skips it and a screen reader does
   *  not read what nobody can see. */
  place(q: Quad | null, opts?: PlaceOpts): void;
  /** Restore the element's own styles and stop tracking focus. */
  release(): void;
}

/** Pin `el` (laid out at w x h CSS px) to a plane. `onFocusChange` fires when
 *  focus enters or leaves it. */
export function pinElement(
  el: HTMLElement,
  size: { w: number; h: number },
  opts: { onFocusChange?(focused: boolean): void } = {}
): PinnedElement {
  const saved = el.getAttribute('style');
  Object.assign(el.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: `${size.w}px`,
    height: `${size.h}px`,
    transformOrigin: '0 0',
    pointerEvents: 'auto',
    willChange: 'transform',
    visibility: 'hidden'
  });
  el.inert = true;
  let focused = false;
  const onIn = () => {
    if (focused) return;
    focused = true;
    opts.onFocusChange?.(true);
  };
  const onOut = (e: FocusEvent) => {
    if (e.relatedTarget && el.contains(e.relatedTarget as Node)) return;
    focused = false;
    opts.onFocusChange?.(false);
  };
  el.addEventListener('focusin', onIn);
  el.addEventListener('focusout', onOut as EventListener);

  return {
    el,
    get focused() {
      return focused;
    },
    place(q, o = {}) {
      const m = q && (o.backface || quadFacesCamera(q)) ? matrix3dFor(size.w, size.h, q) : null;
      if (!m) {
        // never yank focus out from under the user: a focused element stays where it was
        if (focused) return;
        el.style.visibility = 'hidden';
        el.inert = true;
        return;
      }
      el.style.transform = matrix3dCss(m);
      el.style.opacity = o.opacity === undefined ? '' : String(o.opacity);
      el.style.visibility = 'visible';
      el.inert = false;
    },
    release() {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut as EventListener);
      if (saved === null) el.removeAttribute('style');
      else el.setAttribute('style', saved);
      el.inert = false;
    }
  };
}
