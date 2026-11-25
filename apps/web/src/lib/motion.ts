/**
 * Motion language (spec 3.4): shared easings, variants and media-query hooks.
 *
 * Everything that moves on the public site should take its timing from here so
 * the whole portfolio speaks one motion dialect:
 * - EASE_OUT (expo out) for reveals and anything entering;
 * - EASE_IN_OUT for curtains / things that travel across the screen;
 * - content reveal 0.8 s, headline words 1 s with 60 ms stagger.
 */
import { useSyncExternalStore } from 'react';
import type { Variants } from 'framer-motion';

/** Cubic-bezier tuple accepted by framer-motion `ease`. */
export type Bezier = [number, number, number, number];

/** Expo-out: the default for reveals (mirrors CSS var --ease-out). */
export const EASE_OUT: Bezier = [0.16, 1, 0.3, 1];

/** Symmetric in-out: curtains, wipes (mirrors CSS var --ease-in-out). */
export const EASE_IN_OUT: Bezier = [0.65, 0, 0.35, 1];

/** Duration (s) of a standard content reveal. */
export const REVEAL_DURATION = 0.8;

/** Duration (s) of the reduced-motion fallback fade (spec: <= 200 ms). */
export const REDUCED_FADE = 0.2;

/**
 * What a reveal leaves behind once it has finished. A lingering
 * `filter: blur(0px)` would keep the element a backdrop root (so `.glass`
 * children blur nothing), a stacking context and a containing block for fixed
 * descendants; `filter: none` releases all of that.
 */
export const REVEAL_SETTLED = { filter: 'none' } as const;

/**
 * Fade + 24px rise + 6px blur clear. Use with `initial="hidden"` and
 * `animate="show"` / `whileInView="show"`. Settles on `filter: none`.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: REVEAL_DURATION, ease: EASE_OUT },
    transitionEnd: REVEAL_SETTLED,
  },
};

/**
 * Reduced-motion counterpart of `fadeUp`: a short opacity fade only.
 * Same variant names, so it can be swapped in 1:1.
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: REDUCED_FADE, ease: 'linear' } },
};

/**
 * Parent variants that stagger children using the 'hidden' / 'show' names.
 * @param step           delay between consecutive children (s), default 70 ms
 * @param delayChildren  delay before the first child (s)
 */
export const staggerContainer = (step = 0.07, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren } },
});

/* --------------------------------------------------------------------------
   Media-query hooks (useSyncExternalStore: tear-free, no extra renders)
   -------------------------------------------------------------------------- */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** One shared MediaQueryList per query string. */
const mqlCache = new Map<string, MediaQueryList>();
/** One stable subscribe function per query, so consumers never re-subscribe on re-render. */
const subscribeCache = new Map<string, (onChange: () => void) => () => void>();

function getMql(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  let mql = mqlCache.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mqlCache.set(query, mql);
  }
  return mql;
}

/** Non-hook read of a media query (safe outside React and on the server). */
export function matchesMedia(query: string): boolean {
  return getMql(query)?.matches ?? false;
}

/** Non-hook read of the reduced-motion preference. */
export function prefersReducedMotion(): boolean {
  return matchesMedia(REDUCED_QUERY);
}

function getSubscribe(query: string): (onChange: () => void) => () => void {
  let subscribe = subscribeCache.get(query);
  if (!subscribe) {
    subscribe = onChange => {
      const mql = getMql(query);
      if (!mql) return () => {};
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    };
    subscribeCache.set(query, subscribe);
  }
  return subscribe;
}

/**
 * Reactive `matchMedia(query).matches`. One MediaQueryList and one listener
 * per query string are shared by every consumer.
 * @param serverFallback value used when matchMedia is unavailable (SSR / tests)
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    getSubscribe(query),
    () => getMql(query)?.matches ?? serverFallback,
    () => serverFallback,
  );
}

/** True when the user asked the OS for reduced motion. Reactive. */
export function usePrefersReducedMotion(): boolean {
  // On the server assume reduced motion: render final states, never hidden ones.
  return useMediaQuery(REDUCED_QUERY, true);
}

/** True for a mouse / trackpad: `(hover: hover) and (pointer: fine)`. Reactive. */
export function useFinePointer(): boolean {
  return useMediaQuery(FINE_POINTER_QUERY, false);
}

/* --------------------------------------------------------------------------
   Visitor motion pause (WCAG 2.2.2 Pause, Stop, Hide)
   --------------------------------------------------------------------------
   Anything that loops on its own for more than 5 s (marquee, clock colon,
   ambient drift, shader flow, project art) must be pausable even WITHOUT the
   OS reduced-motion setting. One global switch, remembered per browser:
   - CSS: `:root[data-motion='paused'] .your-loop { animation-play-state: paused; }`
   - JS loops: `useMotionPaused()` (reactive) or `isMotionPaused()`.
   The visible control lives in <Marquee/> (components/fx/Marquee.tsx).
   -------------------------------------------------------------------------- */

/** localStorage key of the visitor's "pause motion" choice. */
export const MOTION_PAUSE_KEY = 'jm:motion-paused';

const pauseListeners = new Set<() => void>();

function readMotionPaused(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MOTION_PAUSE_KEY) === '1';
  } catch {
    return false; // storage blocked: motion simply starts unpaused
  }
}

/** Mirrors the state on <html data-motion="paused"> for CSS. */
function reflectMotionPaused(paused: boolean): void {
  if (typeof document === 'undefined') return;
  if (paused) document.documentElement.dataset.motion = 'paused';
  else delete document.documentElement.dataset.motion;
}

let motionPaused = readMotionPaused();
reflectMotionPaused(motionPaused);

/** Non-hook read of the visitor's pause choice. */
export function isMotionPaused(): boolean {
  return motionPaused;
}

/** Pause / resume every self-running loop on the site (persisted). */
export function setMotionPaused(paused: boolean): void {
  if (paused === motionPaused) return;
  motionPaused = paused;
  try {
    if (paused) window.localStorage.setItem(MOTION_PAUSE_KEY, '1');
    else window.localStorage.removeItem(MOTION_PAUSE_KEY);
  } catch {
    /* not persisted: still applies to this page view */
  }
  reflectMotionPaused(paused);
  pauseListeners.forEach(listener => listener());
}

function subscribeMotionPaused(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

/** True while the visitor has paused motion (see setMotionPaused). Reactive. */
export function useMotionPaused(): boolean {
  return useSyncExternalStore(subscribeMotionPaused, isMotionPaused, () => false);
}
