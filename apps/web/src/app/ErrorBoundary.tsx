/**
 * Error boundaries for the app shell.
 *
 * - <ErrorBoundary fallback={...}>: generic boundary. `fallback` is a node or a render function.
 * - <RouteErrorBoundary>: wraps a page. Renders <ErrorScreen/> (one h1, reload + home actions).
 *   Mounted inside the keyed <main>, so it resets on every route change.
 * - <SilentBoundary>: for decorative or optional chrome (cursor, grain, preloader...). A crash renders
 *   nothing instead of taking the whole site down with it.
 *
 * React still reports every caught error to the console, so nothing is swallowed during development.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import './app.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** What to render after a crash. */
  fallback: ReactNode | ((error: unknown) => ReactNode);
  /** Called once per caught error (e.g. to release something the crashed subtree was holding). */
  onError?: (error: unknown, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === 'function' ? fallback(this.state.error) : fallback;
  }
}

/** Decorative / optional UI: on error render nothing. */
export function SilentBoundary({ children, onError }: { children: ReactNode; onError?: () => void }) {
  return <ErrorBoundary fallback={null} onError={onError}>{children}</ErrorBoundary>;
}

/** A failed dynamic import usually means a new deploy replaced the chunk files: a reload fixes it. */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(message);
}

/**
 * Full-height error state in the site's visual language. Uses plain anchors (full page loads) on
 * purpose: after a crash, a fresh document is the most reliable way back.
 */
export function ErrorScreen({ error, fullscreen = false }: { error?: unknown; fullscreen?: boolean }) {
  const chunkError = isChunkLoadError(error);
  const path = typeof window === 'undefined' ? '/' : window.location.pathname;
  const atHome = path === '/';
  return (
    <section
      className={fullscreen ? 'app-error app-error--fullscreen' : 'app-error'}
      role="alert"
      aria-labelledby="app-error-title"
    >
      <span className="grid-bg" aria-hidden="true" />
      <span className="app-error__glow" aria-hidden="true" />
      <div className="container app-error__inner">
        <p className="app-error__terminal">
          <span className="app-error__prompt" aria-hidden="true">$</span>
          <span className="app-error__path">GET {path}</span>
          <span className="app-error__status">{chunkError ? 'stale' : 'error'}</span>
        </p>
        <p className="kicker">
          <span className="kicker__index">ERR</span>
          <span className="kicker__line" />
          <span>{chunkError ? 'Update available' : 'Unexpected error'}</span>
        </p>
        <h1 id="app-error-title" className="display-1 app-error__title">
          {chunkError ? 'This page needs a ' : 'Something went '}
          <span className="serif-accent">{chunkError ? 'refresh.' : 'wrong.'}</span>
        </h1>
        <p className="lead app-error__lead">
          {chunkError
            ? 'The site was updated since this tab opened. Reloading picks up the latest version.'
            : 'This page failed to load properly. Reloading usually fixes it; the rest of the site is still here.'}
        </p>
        <div className="app-error__actions">
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
          {!atHome && (
            <a className="btn btn--ghost" href="/">
              Back to home
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/** Boundary around a page's content. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallback={error => <ErrorScreen error={error} />}>{children}</ErrorBoundary>;
}
