/**
 * Route-level code splitting for the public site.
 *
 * Home ships in the entry chunk (it is the landing page). Every other public page is its own chunk,
 * so the Markdown pipeline (BlogDetail), d3-force (About) and each page's CSS only load when needed.
 *
 * A page transition must never show a loading state, so chunks are fetched ahead of time:
 * - on idle after the first load (`useRoutePrefetch`), unless the visitor asked to save data;
 * - on intent: hovering, touching or focusing any same-origin link;
 * - at the latest when the location changes (App calls `preloadRoute` while the old page exits).
 *
 * `lazyRoute` differs from a bare `React.lazy` in one way that matters here: once a chunk has loaded,
 * the page renders synchronously. React.lazy always suspends on its first render (its promise
 * settles a microtask later), which would flash the fallback inside the enter animation.
 */
import { createElement, lazy, useEffect, useState, type ComponentType } from 'react';
import { matchPath } from 'react-router-dom';

type PageModule = { default: ComponentType };

export interface LazyRoute {
  /** Render this as the route element. */
  Page: ComponentType;
  /** Start (or reuse) the chunk download. Never rejects: failures surface when the page renders. */
  preload: () => Promise<void>;
}

/** A lazily loaded page that renders without suspending once its chunk is in memory. */
export function lazyRoute(load: () => Promise<PageModule>): LazyRoute {
  let loaded: ComponentType | null = null;
  let pending: Promise<PageModule> | null = null;

  const fetchModule = (): Promise<PageModule> => {
    if (!pending) {
      pending = load().then(
        module => {
          loaded = module.default;
          return module;
        },
        (error: unknown) => {
          pending = null; // let a later attempt retry (flaky network, new deploy)
          throw error;
        },
      );
    }
    return pending;
  };

  const LazyPage = lazy(fetchModule);

  function Page() {
    // Decide once per mount: switching from the lazy wrapper to the real component later would remount the page.
    const [Ready] = useState(() => loaded);
    return createElement(Ready ?? LazyPage);
  }

  return {
    Page,
    preload: () => fetchModule().then(
      () => undefined,
      () => undefined,
    ),
  };
}

/* ------------------------------------------------------------------------------------------------
   Public pages (Home stays eager in App.tsx)
   ------------------------------------------------------------------------------------------------ */
export const AboutRoute = lazyRoute(() => import('../pages/About'));
export const ProjectsRoute = lazyRoute(() => import('../pages/Projects'));
export const ProjectDetailRoute = lazyRoute(() => import('../pages/ProjectDetail'));
export const BlogRoute = lazyRoute(() => import('../pages/Blog'));
export const BlogDetailRoute = lazyRoute(() => import('../pages/BlogDetail'));

const routeTable: Array<[pattern: string, route: LazyRoute]> = [
  ['/about', AboutRoute],
  ['/projects', ProjectsRoute],
  ['/projects/:slug', ProjectDetailRoute],
  ['/blog', BlogRoute],
  ['/blog/:slug', BlogDetailRoute],
];

/** Preload the chunk that renders `pathname` (no-op for Home, admin and unknown paths). */
export function preloadRoute(pathname: string): Promise<void> {
  const entry = routeTable.find(([pattern]) => matchPath(pattern, pathname));
  return entry ? entry[1].preload() : Promise.resolve();
}

/** Preload every public page chunk. */
export function preloadAllRoutes(): Promise<void> {
  return Promise.all(routeTable.map(([, route]) => route.preload())).then(() => undefined);
}

/* ------------------------------------------------------------------------------------------------
   Prefetching
   ------------------------------------------------------------------------------------------------ */
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function prefersSavingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

/** Same-origin link under an event target, if any. */
function linkUnder(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
  return anchor;
}

function linkPathname(anchor: HTMLAnchorElement): string | null {
  try {
    const url = new URL(anchor.href, window.location.href);
    return url.origin === window.location.origin ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * Warm the page chunks: everything once the browser is idle after load, plus the target of any
 * link the visitor points at, touches or focuses (one delegated listener, so no component needs to opt in).
 */
export function useRoutePrefetch(): void {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const warmAll = () => {
      idleHandle = null;
      timeoutHandle = null;
      void preloadAllRoutes();
    };
    const scheduleIdle = () => {
      if (prefersSavingData()) return;
      if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(warmAll, { timeout: 5000 });
      else timeoutHandle = window.setTimeout(warmAll, 2500);
    };

    if (document.readyState === 'complete') scheduleIdle();
    else window.addEventListener('load', scheduleIdle, { once: true });

    // pointerover fires on every element boundary: only look at a link once per approach.
    let lastAnchor: HTMLAnchorElement | null = null;
    const onIntent = (event: Event) => {
      const anchor = linkUnder(event.target);
      if (!anchor || anchor === lastAnchor) return;
      lastAnchor = anchor;
      const pathname = linkPathname(anchor);
      if (pathname) void preloadRoute(pathname);
    };
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('touchstart', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);

    return () => {
      window.removeEventListener('load', scheduleIdle);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('touchstart', onIntent);
      document.removeEventListener('focusin', onIntent);
    };
  }, []);
}
