/**
 * Smooth scrolling (Lenis) + scroll helpers that work with or without it.
 *
 * - <SmoothScroll enabled> creates ONE Lenis instance for the window while
 *   enabled and the user does not prefer reduced motion; destroyed on unmount.
 * - The instance lives at module level, so scrollToTarget / stopScroll /
 *   startScroll can be called from anywhere (event handlers, effects) without
 *   hooks. `useLenis()` exposes it reactively when a component needs it.
 * - Nested scrollers: mark them with `data-lenis-prevent` (Lenis honors it);
 *   `allowNestedScroll` additionally lets any overflow:auto element scroll
 *   natively, so a forgotten attribute never traps the wheel.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { prefersReducedMotion, usePrefersReducedMotion } from '../../lib/motion';

/* --------------------------------------------------------------------------
   Module-level instance store
   -------------------------------------------------------------------------- */

let lenis: Lenis | null = null;
const listeners = new Set<() => void>();

function setLenis(next: Lenis | null): void {
  lenis = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The active Lenis instance, or null when smooth scrolling is off. */
export function useLenis(): Lenis | null {
  return useSyncExternalStore(subscribe, () => lenis, () => null);
}

/* --------------------------------------------------------------------------
   Scroll lock (modals, menus, preloader)
   -------------------------------------------------------------------------- */

/**
 * Active lock owners. A Set (not a counter) so unbalanced or repeated calls
 * can never leave the page stuck: stopScroll('menu') twice + startScroll('menu')
 * once unlocks. Different owners ('menu', 'palette', 'preloader') nest safely.
 */
const locks = new Set<string>();

function applyLock(): void {
  const root = document.documentElement;
  if (locks.size > 0) {
    lenis?.stop();
    // Keep the scrollbar gutter so the layout does not jump sideways.
    if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
  } else {
    root.style.removeProperty('overflow');
    root.style.removeProperty('scrollbar-gutter');
    lenis?.start();
  }
}

/** Lock page scrolling (Lenis stop + overflow hidden). `owner` lets locks nest. */
export function stopScroll(owner = 'default'): void {
  if (typeof document === 'undefined') return;
  locks.add(owner);
  applyLock();
}

/** Release the lock taken by `owner`; scrolling resumes when no owner remains. */
export function startScroll(owner = 'default'): void {
  if (typeof document === 'undefined') return;
  locks.delete(owner);
  applyLock();
}

/* --------------------------------------------------------------------------
   Programmatic scrolling
   -------------------------------------------------------------------------- */

export interface ScrollTargetOptions {
  /** Jump without animation (route changes). */
  immediate?: boolean;
  /** Pixel offset added to the target. Default -96 for elements / selectors (header height), 0 for numbers. */
  offset?: number;
}

/** querySelector that tolerates invalid selectors such as '#1-intro'. */
function resolveElement(selector: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    if (!selector.startsWith('#')) return null;
    try {
      return document.getElementById(decodeURIComponent(selector.slice(1)));
    } catch {
      return null;
    }
  }
}

/** Smooth anchor travel: expo-out over ~1.2 s (instant under reduced motion). */
const scrollEase = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Scroll the page to a y position, a CSS selector ('#contact') or an element.
 * Works with Lenis (smooth, eased) and without it (native window.scrollTo).
 * Unknown selectors are a no-op.
 *
 * Element targets are resolved to an absolute y here (rather than handing the
 * element to Lenis) so both paths land on exactly the same pixel: Lenis would
 * otherwise also subtract the root's scroll-padding-top on top of `offset`.
 */
export function scrollToTarget(target: number | string | HTMLElement, opts: ScrollTargetOptions = {}): void {
  if (typeof window === 'undefined') return;
  let top: number;
  if (typeof target === 'number') {
    top = target + (opts.offset ?? 0);
  } else {
    const element = typeof target === 'string' ? resolveElement(target) : target;
    if (!element) return;
    top = element.getBoundingClientRect().top + window.scrollY + (opts.offset ?? -96);
  }
  top = Math.max(0, Math.round(top));
  const immediate = Boolean(opts.immediate) || prefersReducedMotion();

  if (lenis) {
    lenis.scrollTo(top, {
      immediate,
      force: true, // also works while a menu has locked scrolling
      duration: immediate ? undefined : 1.2,
      easing: immediate ? undefined : scrollEase,
    });
    return;
  }
  window.scrollTo({ top, behavior: immediate ? 'instant' : 'smooth' });
}

/* --------------------------------------------------------------------------
   Provider
   -------------------------------------------------------------------------- */

export interface SmoothScrollProps {
  children: ReactNode;
  /** Turn smooth scrolling on/off (e.g. off on /admin). Always off with reduced motion. */
  enabled: boolean;
}

/** Window-level Lenis smooth scroll. Renders its children untouched. */
export function SmoothScroll({ children, enabled }: SmoothScrollProps) {
  const reduced = usePrefersReducedMotion();
  const active = enabled && !reduced;

  useEffect(() => {
    if (!active) return;
    const instance = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      autoRaf: true,
      allowNestedScroll: true,
      anchors: false, // App handles hash links via scrollToTarget
    });
    setLenis(instance);
    // A lock taken before Lenis existed (e.g. the preloader) must still hold.
    if (locks.size > 0) instance.stop();
    return () => {
      instance.destroy();
      if (lenis === instance) setLenis(null);
    };
  }, [active]);

  return <>{children}</>;
}
