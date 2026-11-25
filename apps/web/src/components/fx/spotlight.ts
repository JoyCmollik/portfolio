/**
 * Cursor-following spotlight for cards.
 *
 *   const spot = useSpotlight<HTMLDivElement>();
 *   <div ref={spot.ref} onPointerMove={spot.onPointerMove} className="pcard fx-spotlight accent--violet">
 *
 * Writes the pointer position (px, relative to the element) into --mx / --my
 * with style.setProperty: no React state, no re-render. The `.fx-spotlight`
 * class (fx.css) paints a radial glow on the border (::before) and a faint one
 * on the surface (::after), tinted by --accent-rgb when set (signal otherwise).
 * Note: the class uses the element's ::before and ::after.
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import './fx.css';

export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    const el = ref.current ?? event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${(event.clientX - rect.left).toFixed(1)}px`);
    el.style.setProperty('--my', `${(event.clientY - rect.top).toFixed(1)}px`);
  }, []);

  return { ref, onPointerMove };
}
