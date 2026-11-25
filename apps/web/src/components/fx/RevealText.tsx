/**
 * Masked per-word slide-up for headlines.
 *
 * Put it INSIDE the semantic heading:
 *   <h1 className="display-hero">
 *     <RevealText text={line1} play={introDone} />
 *     <br />
 *     <RevealText text={line2} className="serif-accent" delay={0.2} play={introDone} />
 *   </h1>
 *
 * Structure: span.fx-reveal-text > span.fx-sr (the real text: the only copy
 * assistive tech reads, so the heading's accessible name is exactly `text`)
 * + span[aria-hidden] > (span.fx-word > span.fx-word__inner)* with the
 * original whitespace kept as text nodes, so lines wrap naturally and
 * `text-wrap: balance` still works. (No aria-label: naming a generic span is
 * prohibited in ARIA 1.2 and some screen readers would read the text twice.)
 *
 * Failsafe: a headline must never stay hidden. If it is on screen ~2.5 s
 * after it was allowed to play but the in-view trigger has not fired (an
 * observer that never reports, a clipped or transformed ancestor), it is shown
 * anyway.
 *
 * The motion itself is a CSS transition (fx.css) driven by `data-shown`, with
 * per-word delays from CSS variables: one style change starts every word, no
 * per-frame JS. Each word is masked by `clip-path` on a padded box (not
 * overflow: hidden, which would move the inline-block baseline and misalign
 * mixed fonts on a line). Gradient classes (.serif-accent, .text-gradient)
 * are painted per word as slices of one continuous gradient.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../../lib/motion';
import { cx, useOnceInView } from './utils';
import './fx.css';

export interface RevealTextProps {
  text: string;
  className?: string;
  /** Delay (s) before the first word. */
  delay?: number;
  /** Delay (s) between words. */
  stagger?: number;
  /** 'view': when scrolled into view; 'mount': immediately. */
  trigger?: 'view' | 'mount';
  /** false holds the words hidden until it becomes true (e.g. useIntroDone()). */
  play?: boolean;
}

const WHITESPACE = /^\s+$/;
/** ms after mount / play before an on-screen headline is forced visible. */
const FAILSAFE_MS = 2500;

/**
 * Comfortably on screen: overlaps the middle band of the viewport (10%-90% of
 * its height). Stricter than "any pixel", so the failsafe never beats a
 * working in-view trigger to it.
 */
function isOnScreen(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.bottom > vh * 0.1 && rect.top < vh * 0.9 && rect.right > 0 && rect.left < vw;
}

export function RevealText({
  text,
  className,
  delay = 0,
  stagger = 0.06,
  trigger = 'view',
  play = true,
}: RevealTextProps) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  // "Armed" one frame after mount, so the hidden state is painted first and
  // the transition always runs (even for trigger="mount").
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const inView = useOnceInView(ref, {
    amount: 0.5,
    margin: '0px 0px -8% 0px',
    enabled: trigger === 'view' && !reduced,
  });
  const ready = armed && play && (trigger === 'mount' || inView);

  // Failsafe (see header): only while allowed to play and still hidden.
  const [forced, setForced] = useState(false);
  const pending = !reduced && play && !ready && !forced;
  useEffect(() => {
    const el = ref.current;
    if (!pending || !el) return;
    let raf = 0;
    // 'mount' only ever waits for one frame; a 'view' headline on screen should have fired.
    const check = () => {
      raf = 0;
      if (trigger === 'mount' || isOnScreen(el)) setForced(true);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    const id = window.setTimeout(() => {
      check();
      // Still off screen: keep checking as the page scrolls, until the
      // observer (or this) reveals it and the effect is cleaned up.
      window.addEventListener('scroll', onScroll, { passive: true });
    }, FAILSAFE_MS);
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pending, trigger]);

  const shown = reduced || ready || forced;

  // Split keeping whitespace runs: ['I', ' ', 'build', ' ', ...].
  const tokens = text.split(/(\s+)/).filter(token => token.length > 0);
  const wordCount = tokens.filter(token => !WHITESPACE.test(token)).length;
  let wordIndex = 0;

  const style = {
    '--fx-n': wordCount,
    '--fx-delay': `${delay}s`,
    '--fx-stagger': `${stagger}s`,
  } as CSSProperties;

  return (
    <span
      ref={ref}
      className={cx('fx-reveal-text', className)}
      data-shown={shown ? 'true' : 'false'}
      style={style}
    >
      <span className="fx-sr">{text}</span>
      <span aria-hidden="true">
        {tokens.map((token, i) => {
          if (WHITESPACE.test(token)) return ' ';
          const index = wordIndex++;
          return (
            <span key={i} className="fx-word" style={{ '--fx-i': index } as CSSProperties}>
              <span className="fx-word__inner">{token}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
