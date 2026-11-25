/**
 * App shell: routing, page transitions and the global chrome.
 *
 * Two worlds share this router:
 * - Public site: smooth scroll (Lenis), preloader, ambient grain, scroll progress, custom cursor,
 *   header/footer and animated page transitions. Pages render inside <main id="main" className="site-main">.
 * - Admin Content Studio (/admin/*): lazy-loaded, rendered inside <main className="admin-main"> (the legacy
 *   admin CSS is scoped to it) with NONE of the public chrome.
 *
 * Code splitting: Home is in the entry chunk; every other public page is lazy (src/app/routes.ts) and
 * prefetched on idle / link intent, so a transition never waits on the network in practice.
 *
 * Scroll + focus choreography for public routes:
 *   location changes -> the leaving entry's scroll position is saved, the next chunk starts loading
 *   -> old page exits (350ms) -> window jumps to top (onExitComplete)
 *   -> new page mounts: Back/Forward (POP) restores its saved position; focus moves to <main> and the
 *      new title is announced politely -> page enters (700ms) -> if the URL has a #hash, smooth-scroll to it.
 *   Hash-only changes on the same page (e.g. clicking /#contact while on /) smooth-scroll right away.
 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { Routes, Route, Navigate, NavigationType, matchPath, useLocation, useNavigationType } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Header, Footer } from './components/SiteShell';
import { AmbientLayer, Cursor, Preloader, ScrollProgress, SmoothScroll, scrollToTarget, useLenis } from './components/fx';
import { usePortfolio } from './context/PortfolioContext';
import { markIntroDone, useIntroDone } from './lib/intro';
import { EASE_IN_OUT, EASE_OUT, usePrefersReducedMotion } from './lib/motion';
import { RouteErrorBoundary, SilentBoundary } from './app/ErrorBoundary';
import {
  AboutRoute,
  BlogDetailRoute,
  BlogRoute,
  ProjectDetailRoute,
  ProjectsRoute,
  preloadRoute,
  useRoutePrefetch,
} from './app/routes';
import { readScrollPosition, saveScrollPosition } from './app/scrollMemory';
import Home from './pages/Home';

/** The Content Studio is only needed by the owner: keep it out of the public bundle. */
const Admin = lazy(() => import('./pages/Admin'));
/** DEV-only showcase of every primitive. The ternary folds to `null` in production builds, so it never ships. */
const Lab = import.meta.env.DEV ? lazy(() => import('./pages/Lab')) : null;

/* ------------------------------------------------------------------------------------------------
   Page transition variants
   ------------------------------------------------------------------------------------------------ */
const pageVariants: Variants = {
  initial: { opacity: 0, y: 24, filter: 'blur(6px)' },
  enter: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: EASE_OUT },
    // A lingering `filter` (even blur(0px)) would turn <main> into the containing block of every
    // position: fixed descendant (reading bars, cursor previews...). Clear it once the blur is gone.
    transitionEnd: { filter: 'none' },
  },
  exit: { opacity: 0, y: -16, transition: { duration: 0.35, ease: EASE_IN_OUT } },
};

/** Reduced motion: a short opacity cross-fade only (no movement, no blur). */
const reducedPageVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.2, ease: 'linear' } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: 'linear' } },
};

/** Resolve a location hash ("#contact") to its element without passing user input to querySelector. */
function hashTarget(hash: string): HTMLElement | null {
  if (!hash || hash === '#') return null;
  let id = hash.slice(1);
  try { id = decodeURIComponent(id); } catch { /* keep the raw id */ }
  return document.getElementById(id);
}

/** Minimal loading state for lazy routes (admin, lab). */
function RouteFallback({ label }: { label: string }) {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-fallback__inner label">
        <span className="dot-live" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

/**
 * Suspense fallback for a lazy public page: holds a full viewport inside the transitioning <main>
 * (so the footer stays put) and only reveals its label if loading is genuinely slow.
 */
function PageFallback() {
  return (
    <div className="app-page-placeholder">
      <span className="app-page-placeholder__label label" role="status">
        <span className="dot-live" aria-hidden="true" />
        Loading page
      </span>
    </div>
  );
}

/**
 * Rendered next to the routes inside Suspense, so its layout effect runs once the page's real content
 * is in the DOM (also after a lazy chunk resolves) and before it is painted.
 */
function PageMounted({ onMount }: { onMount: () => void }) {
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;
  useLayoutEffect(() => {
    onMountRef.current();
  }, []);
  return null;
}

/** Add or remove `<meta name="robots" content="noindex">` (not-found states). */
function setNoIndex(noindex: boolean) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!noindex) {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'robots';
    document.head.appendChild(meta);
  }
  meta.content = 'noindex';
}

/* ------------------------------------------------------------------------------------------------
   Admin: no public chrome, legacy .admin-main wrapper
   ------------------------------------------------------------------------------------------------ */
function AdminApp() {
  const location = useLocation();
  // Entering the studio (or moving inside it) always starts at the top.
  useEffect(() => { scrollToTarget(0, { immediate: true }); }, [location.pathname]);
  return (
    <main className="admin-main">
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback label="Loading studio" />}>
          <Routes location={location}>
            <Route path="/admin/*" element={<Admin />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </main>
  );
}

/* ------------------------------------------------------------------------------------------------
   Public site
   ------------------------------------------------------------------------------------------------ */
function PublicApp() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const lenis = useLenis();
  const reduced = usePrefersReducedMotion();
  const introDone = useIntroDone();
  /** Pathname whose enter animation has finished (null while a transition is in flight). */
  const [enteredPath, setEnteredPath] = useState<string | null>(null);
  /** Text of the polite live region that announces each new page. */
  const [announcement, setAnnouncement] = useState('');
  /** Set when an old page has left: the next page mount is a navigation (not the first load). */
  const navigatedRef = useRef(false);
  /** History entry whose saved scroll position was restored (its #hash must not scroll again). */
  const restoredKeyRef = useRef<string | null>(null);
  /** The location currently on screen, to save its scroll position when the visitor leaves it. */
  const shownLocationRef = useRef(location);

  useRoutePrefetch();

  // Coming from the admin (or a fresh mount) without a hash: start at the top. Mount only on purpose.
  const initialHashRef = useRef(location.hash);
  useEffect(() => {
    if (!initialHashRef.current) scrollToTarget(0, { immediate: true });
  }, []);

  // Leaving a history entry: remember its scroll position (Back/Forward returns to it) and fetch the
  // next page's chunk while the old page exits. A layout effect, so nothing has scrolled yet.
  useLayoutEffect(() => {
    const previous = shownLocationRef.current;
    if (previous.key === location.key) return;
    saveScrollPosition(previous.key, window.scrollY);
    shownLocationRef.current = location;
    void preloadRoute(location.pathname);
    // Back/Forward within the same page (e.g. between / and /#contact): no transition, restore in place.
    if (previous.pathname === location.pathname && navigationType === NavigationType.Pop) {
      const saved = readScrollPosition(location.key);
      if (saved !== undefined) {
        restoredKeyRef.current = location.key;
        scrollToTarget(saved);
      }
    }
  }, [location, navigationType]);

  // Old page finished leaving: jump to the top before the new page appears.
  const handleExitComplete = useCallback(() => {
    setEnteredPath(null);
    navigatedRef.current = true;
    scrollToTarget(0, { immediate: true });
  }, []);

  // New page content is in the DOM (not yet painted): restore scroll on Back/Forward, move focus, announce.
  const handlePageMount = () => {
    if (!navigatedRef.current) return; // first load: leave focus at the top of the document
    navigatedRef.current = false;

    const saved = navigationType === NavigationType.Pop ? readScrollPosition(location.key) : undefined;
    if (saved !== undefined) {
      restoredKeyRef.current = location.key;
      lenis?.resize(); // Lenis measures the page on a 250ms debounce: make it see the new height now
      scrollToTarget(saved, { immediate: true });
    }

    // Focus the new page so the next Tab starts inside it (not in the footer link that was activated).
    // A #hash target takes the visitor elsewhere, so then only recover focus if it was lost.
    const main = document.getElementById('main');
    const active = document.activeElement;
    const focusLost = !active || active === document.body;
    if (main && (!location.hash || saved !== undefined || focusLost)) main.focus({ preventScroll: true });

    // Announce the new page. A trailing no-break space forces a re-announcement of an identical title.
    const title = document.title;
    setAnnouncement(previous => (previous === title ? `${title} ` : title));
  };

  // New page finished entering: allow hash scrolling.
  const handleEnterComplete = useCallback((definition: unknown, pathname: string) => {
    if (definition === 'enter') setEnteredPath(pathname);
  }, []);

  // Smooth-scroll to #hash once the page is in place (also on hash-only changes; location.key makes a
  // repeated click on the same /#contact link scroll again). Waits for the first-visit preloader.
  // Retries briefly in case the target renders a moment later (lazy chunk, data still arriving).
  useEffect(() => {
    if (!location.hash || !introDone || enteredPath !== location.pathname) return;
    if (restoredKeyRef.current === location.key) return; // Back/Forward already restored the position
    let attempts = 0;
    let timer = 0;
    const tryScroll = () => {
      const target = hashTarget(location.hash);
      if (target) scrollToTarget(target);
      else if (++attempts < 25) timer = window.setTimeout(tryScroll, 120);
    };
    timer = window.setTimeout(tryScroll, 60);
    return () => window.clearTimeout(timer);
  }, [location.key, location.hash, location.pathname, enteredPath, introDone]);

  // Skip link: move focus into <main> without adding "#main" to the router history.
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById('main');
    if (!main) return;
    event.preventDefault();
    main.focus({ preventScroll: true });
    scrollToTarget(main, { immediate: true, offset: 0 });
  };

  const variants = reduced ? reducedPageVariants : pageVariants;
  const pathname = location.pathname;

  return (
    <>
      <a className="skip-link" href="#main" onClick={skipToContent}>Skip to content</a>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      {/* Decorative chrome: a crash there must never take the page down with it. */}
      <SilentBoundary onError={markIntroDone}><Preloader /></SilentBoundary>
      <SilentBoundary><AmbientLayer /></SilentBoundary>
      <SilentBoundary><ScrollProgress /></SilentBoundary>
      <SilentBoundary><Cursor /></SilentBoundary>
      <SilentBoundary><Header /></SilentBoundary>
      <AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
        <motion.main
          key={pathname}
          id="main"
          className="site-main"
          tabIndex={-1}
          variants={variants}
          initial="initial"
          animate="enter"
          exit="exit"
          onAnimationComplete={definition => handleEnterComplete(definition, pathname)}
        >
          <RouteErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<AboutRoute.Page />} />
                <Route path="/projects" element={<ProjectsRoute.Page />} />
                <Route path="/projects/:slug" element={<ProjectDetailRoute.Page />} />
                <Route path="/blog" element={<BlogRoute.Page />} />
                <Route path="/blog/:slug" element={<BlogDetailRoute.Page />} />
                {Lab && <Route path="/lab" element={<Lab />} />}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <PageMounted onMount={handlePageMount} />
            </Suspense>
          </RouteErrorBoundary>
        </motion.main>
      </AnimatePresence>
      <SilentBoundary><Footer /></SilentBoundary>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
   Root
   ------------------------------------------------------------------------------------------------ */
export default function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const { site, projects, posts, loading } = usePortfolio();

  // Route transitions manage scroll themselves (including Back/Forward): stop the browser from
  // restoring stale positions mid-transition.
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  // Document title + meta description per route. Unknown project / post slugs read "Not found"
  // (once content has loaded) and are kept out of search indexes.
  useEffect(() => {
    const path = location.pathname;
    const projectSlug = matchPath('/projects/:slug', path)?.params.slug;
    const postSlug = matchPath('/blog/:slug', path)?.params.slug;
    const project = projectSlug ? projects.find(p => p.slug === projectSlug) : undefined;
    const post = postSlug ? posts.find(p => p.slug === postSlug) : undefined;
    const notFound = !loading && ((projectSlug !== undefined && !project) || (postSlug !== undefined && !post));
    const label = notFound
      ? 'Not found'
      : project?.title
        || post?.title
        || (path === '/about' ? 'About' : path === '/projects' ? 'Projects' : path === '/blog' ? 'Writing' : isAdmin ? 'Content Studio' : 'Software Engineer');
    const title = `${label} · ${site.shortName}`;
    document.title = title;
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="description"]')?.setAttribute('content', project?.summary || post?.excerpt || site.heroDescription);
    setNoIndex(notFound);
  }, [location.pathname, site.shortName, site.heroDescription, projects, posts, loading, isAdmin]);

  return (
    <SmoothScroll enabled={!isAdmin}>
      {isAdmin ? <AdminApp /> : <PublicApp />}
    </SmoothScroll>
  );
}
