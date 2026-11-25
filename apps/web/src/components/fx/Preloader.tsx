/**
 * First-visit intro (once per tab session, INTRO_KEY):
 *   0.00 s  ink layer covers the site; wordmark letters rise; mono counter
 *           000 -> 100 with a hairline progress bar
 *   1.06 s  markIntroDone() -> headlines start revealing; the curtain wipes up
 *           with a curved trailing edge while its content drifts slower
 *   1.68 s  gone (unmounted), scroll unlocked
 * Click / tap / any key skips straight to the wipe. Scroll is locked while it
 * is visible. Renders nothing when the intro was already seen or the user
 * prefers reduced motion (intro.ts then reports "done" from the start).
 *
 * All per-frame work (counter digits, progress bar) writes to DOM nodes from
 * one rAF loop; React only renders on the three phase changes.
 *
 * The wordmark is data-driven, like the header's: site.shortName (or name),
 * lower-cased, words joined by "/" ("Joy Mollik" -> "joy/mollik"). It waits
 * for the real content (not the demo placeholder) before it rises; if content
 * is slow, only the counter shows. Long names scale down to fit the width.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePortfolio } from '../../context/PortfolioContext';
import { isIntroDone, markIntroDone, useIntroDone } from '../../lib/intro';
import { useFinePointer } from '../../lib/motion';
import { startScroll, stopScroll } from './SmoothScroll';
import './fx.css';

export interface PreloaderProps {
  /**
   * Extra (optional): wordmark text; the first "/" is tinted mint.
   * Default: derived from site.shortName / site.name (see header).
   */
  wordmark?: string;
}

/** "Joy Mollik" -> "joy/mollik" (same words as the header Wordmark). */
function wordmarkFromName(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).filter(Boolean).join('/');
}

type Phase = 'count' | 'exit' | 'done';

/** Counter run time (ms). */
const COUNT_MS = 980;
/** Pause on "100" before the wipe (ms). */
const HOLD_MS = 80;
/** Curtain wipe (ms); keep in sync with fx.css .fx-preloader[data-phase='exit']. */
const EXIT_MS = 620;
/** Scroll-lock owner id. */
const LOCK = 'preloader';

/** Fast start, gentle landing: reads as "loading" rather than a linear tick. */
const easeCount = (p: number) => 1 - Math.pow(1 - p, 3);

export function Preloader({ wordmark: wordmarkProp }: PreloaderProps) {
  const { site, loading } = usePortfolio();
  // Hold the wordmark while the real content loads, so a placeholder name never flashes.
  const wordmark = wordmarkProp ?? (loading ? '' : wordmarkFromName(site.shortName || site.name || ''));
  const introDone = useIntroDone();
  const fine = useFinePointer();
  const [phase, setPhase] = useState<Phase>(() => (isIntroDone() ? 'done' : 'count'));
  const counterRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  /** Starts the wipe; replaced by the running count effect. */
  const exitRef = useRef<() => void>(() => {});

  // Phase 1: count up, then exit (or exit early on skip).
  useEffect(() => {
    if (phase !== 'count') return;
    stopScroll(LOCK);

    const start = performance.now();
    let raf = 0;
    let hold = 0;
    let exited = false;

    const render = (progress: number) => {
      if (counterRef.current) counterRef.current.textContent = String(Math.round(progress * 100)).padStart(3, '0');
      if (lineRef.current) lineRef.current.style.transform = `scaleX(${progress})`;
    };
    const exit = () => {
      if (exited) return;
      exited = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(hold);
      render(1);
      markIntroDone();
      setPhase('exit');
    };
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      render(easeCount(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else hold = window.setTimeout(exit, HOLD_MS);
    };

    exitRef.current = exit;
    raf = requestAnimationFrame(tick);
    window.addEventListener('keydown', exit);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hold);
      window.removeEventListener('keydown', exit);
      exitRef.current = () => {};
    };
  }, [phase]);

  // Phase 2: let the CSS wipe finish, then unmount.
  useEffect(() => {
    if (phase !== 'exit') return;
    const id = window.setTimeout(() => setPhase('done'), EXIT_MS + 40);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Phase 3: release the scroll lock (also on unmount, whatever the phase).
  useEffect(() => {
    if (phase === 'done') startScroll(LOCK);
  }, [phase]);
  useEffect(() => () => startScroll(LOCK), []);

  // Something else finished the intro (intro.ts failsafe): leave gracefully.
  useEffect(() => {
    if (introDone && phase === 'count') exitRef.current();
  }, [introDone, phase]);

  if (phase === 'done') return null;

  const slash = wordmark.indexOf('/');
  const chars = Array.from(wordmark);

  return (
    <div className="fx-preloader" data-phase={phase} aria-hidden="true" onPointerDown={() => exitRef.current()}>
      <div className="fx-preloader__curtain">
        <div className="fx-preloader__inner">
          <div className="fx-preloader__row">
            <span className="fx-preloader__label">Portfolio</span>
            <span className="fx-preloader__label">©{new Date().getFullYear()}</span>
          </div>

          <p
            className="fx-preloader__wordmark"
            style={{ '--fx-chars': Math.max(chars.length, 1) } as CSSProperties}
          >
            {chars.map((char, i) => (
              <span
                key={i}
                className={i === slash ? 'fx-preloader__char fx-preloader__char--accent' : 'fx-preloader__char'}
                style={{ '--fx-i': i } as CSSProperties}
              >
                {char}
              </span>
            ))}
          </p>

          <div className="fx-preloader__row fx-preloader__row--bottom">
            <span className="fx-preloader__label">{fine ? 'Click or press any key to skip' : 'Tap to skip'}</span>
            <span className="fx-preloader__count">
              <span ref={counterRef}>000</span>
            </span>
          </div>
          <span className="fx-preloader__line">
            <span ref={lineRef} className="fx-preloader__line-fill" />
          </span>
        </div>
        <span className="fx-preloader__skirt" />
      </div>
    </div>
  );
}
