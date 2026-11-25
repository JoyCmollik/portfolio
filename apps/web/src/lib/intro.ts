/**
 * First-visit intro state, shared by <Preloader/> and anything that waits for
 * it (e.g. the hero headline reveal via `useIntroDone()`).
 *
 * A tiny external store: no context provider needed, readable from any
 * component, tear-free through useSyncExternalStore.
 *
 * The intro counts as "done" immediately when:
 * - this tab already saw it (sessionStorage INTRO_KEY, also set by the
 *   screenshot tool), or
 * - the user prefers reduced motion (no preloader at all).
 */
import { useSyncExternalStore } from 'react';

/** sessionStorage flag set once the preloader has played in this tab. */
export const INTRO_KEY = 'jm:intro-seen';

/**
 * Failsafe: if the intro is still pending this long after something started
 * waiting for it (preloader crashed, never mounted, tab throttled), release the
 * waiters anyway so headlines can never stay hidden. The preloader itself is
 * <= 1.7 s, so this never fires in normal operation.
 */
const FAILSAFE_MS = 6000;

function readInitial(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.sessionStorage.getItem(INTRO_KEY)) return true;
  } catch {
    /* storage blocked (privacy mode): fall through */
  }
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  } catch {
    /* matchMedia unavailable */
  }
  return false;
}

let done = readInitial();
let failsafe: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** Persist the "seen" flag for this tab (storage may be unavailable). */
function persist(): void {
  try {
    window.sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* ignore: the intro may simply play again next load */
  }
}

/** Mark the intro finished: persists the flag and notifies every waiter. Idempotent. */
export function markIntroDone(): void {
  if (typeof window !== 'undefined') persist();
  if (done) return;
  done = true;
  if (failsafe) {
    clearTimeout(failsafe);
    failsafe = null;
  }
  listeners.forEach(listener => listener());
}

/** Non-hook read (e.g. inside event handlers). */
export function isIntroDone(): boolean {
  return done;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!done && !failsafe && typeof window !== 'undefined') {
    failsafe = setTimeout(() => {
      failsafe = null;
      markIntroDone();
    }, FAILSAFE_MS);
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * True once the preloader has finished (or immediately when there is no
 * preloader this visit). Flips to true at the moment the curtain starts to
 * lift, so entrance animations play while the page is being revealed.
 */
export function useIntroDone(): boolean {
  return useSyncExternalStore(subscribe, isIntroDone, () => true);
}
