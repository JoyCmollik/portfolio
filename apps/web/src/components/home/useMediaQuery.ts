/**
 * Home-local media-query hook (tear-free via useSyncExternalStore).
 * Used to decide layout-driven motion (e.g. the sticky project stack) in JS,
 * mirroring the matching CSS media query exactly.
 *
 * One MediaQueryList and one stable subscribe function per query string, so
 * renders never allocate a MediaQueryList and React never re-subscribes.
 */
import { useSyncExternalStore } from 'react';

type Subscribe = (onChange: () => void) => () => void;
interface QueryEntry {
  mql: MediaQueryList;
  subscribe: Subscribe;
}

const entries = new Map<string, QueryEntry>();
const noopSubscribe: Subscribe = () => () => {};

function entryFor(query: string): QueryEntry | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  let entry = entries.get(query);
  if (!entry) {
    const mql = window.matchMedia(query);
    entry = {
      mql,
      subscribe: onChange => {
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      },
    };
    entries.set(query, entry);
  }
  return entry;
}

export function useMediaQuery(query: string, serverFallback = false): boolean {
  const entry = entryFor(query);
  return useSyncExternalStore(
    entry ? entry.subscribe : noopSubscribe,
    () => (entry ? entry.mql.matches : serverFallback),
    () => serverFallback,
  );
}

/** Sticky stacking projects: wide + tall enough viewports only (keep in sync with home.css). */
export const STACK_QUERY = '(min-width: 1024px) and (min-height: 640px)';
