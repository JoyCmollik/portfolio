/**
 * Internal helpers shared by the fx primitives (not part of the public barrel).
 */
import { useEffect, useState, type RefObject } from 'react';

/** Join truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** IntersectionObserver thresholds in 5% steps, so tall elements report progress. */
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

export interface OnceInViewOptions {
  /** Fraction of the element (0-1) that must be visible. */
  amount?: number;
  /** IntersectionObserver rootMargin, e.g. '0px 0px -10% 0px'. */
  margin?: string;
  /** When false the observer is not attached (state stays as is). */
  enabled?: boolean;
}

/**
 * Becomes true the first time the element is "in view enough" and then stays
 * true (spec: reveal once, never re-hide).
 *
 * Unlike a plain `threshold: amount`, an element counts as visible when EITHER
 * `amount` of it is visible OR it already covers `amount` of the viewport
 * height. A plain threshold can never fire for an element taller than
 * viewport / amount, which would leave long sections hidden forever.
 */
export function useOnceInView(
  ref: RefObject<Element | null>,
  { amount = 0.25, margin = '0px', enabled = true }: OnceInViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled || inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const rootHeight = entry.rootBounds?.height ?? window.innerHeight;
          const enough =
            amount <= 0 ||
            entry.intersectionRatio >= amount - 0.001 ||
            entry.intersectionRect.height >= rootHeight * amount;
          if (enough) {
            setInView(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: margin, threshold: THRESHOLDS },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, margin, enabled, inView]);

  return inView;
}
