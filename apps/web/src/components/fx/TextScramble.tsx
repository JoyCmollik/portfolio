/**
 * Decode / scramble effect for short mono labels ("HELLO, I'M JOY — ...").
 * Letters and digits cycle through random glyphs and lock in left to right;
 * spaces and punctuation stay put so the shape of the label reads instantly.
 *
 * trigger: 'view' (first time in view), 'mount' (immediately), 'hover'
 * (every pointer enter / focus). Optional `play` holds a view/mount run until
 * true (e.g. useIntroDone()); `delay` postpones it.
 *
 * Frames are written straight to a DOM node via rAF (no React render per
 * frame). An invisible copy of the real text sizes the box, so the layout
 * never jitters even in proportional fonts. Assistive tech reads the real
 * text from one visually hidden copy (the visual layers are aria-hidden; no
 * aria-label on the generic span, which ARIA 1.2 prohibits). Reduced motion:
 * plain text.
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../../lib/motion';
import { cx, useOnceInView } from './utils';
import './fx.css';

export interface TextScrambleProps {
  text: string;
  className?: string;
  trigger?: 'view' | 'mount' | 'hover';
  /** Extra (optional): hold the first run until true. */
  play?: boolean;
  /** Extra (optional): seconds to wait before the first run. */
  delay?: number;
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789#%&*+=<>/';
/** ms between glyph swaps (keeps the noise legible rather than a blur). */
const SWAP_MS = 55;

const isScramblable = (char: string) => /[\p{L}\p{N}]/u.test(char);
const randomGlyph = (char: string) => {
  const set = char === char.toLowerCase() && char !== char.toUpperCase() ? LOWER : UPPER;
  return set[Math.floor(Math.random() * set.length)];
};

/**
 * Run one scramble on `node`. Returns a cancel function.
 * Character i locks at ~ i * step + jitter; total ~0.6-1.2 s depending on length.
 */
function runScramble(node: HTMLElement, text: string, onDone: () => void): () => void {
  const chars = Array.from(text);
  const step = Math.min(34, 760 / Math.max(chars.length, 1));
  const lockAt = chars.map((_, i) => 140 + i * step + Math.random() * 160);
  const current = chars.map(char => (isScramblable(char) ? randomGlyph(char) : char));
  let start = 0;
  let lastSwap = 0;
  let raf = 0;

  const tick = (now: number) => {
    if (!start) start = now;
    const elapsed = now - start;
    const swap = now - lastSwap >= SWAP_MS;
    if (swap) lastSwap = now;
    let done = true;
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (!isScramblable(char) || elapsed >= lockAt[i]) {
        out += char;
        continue;
      }
      done = false;
      if (swap) current[i] = randomGlyph(char);
      out += current[i];
    }
    node.textContent = out;
    if (done) onDone();
    else raf = requestAnimationFrame(tick);
  };

  node.textContent = current.join('');
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function TextScramble({ text, className, trigger = 'view', play = true, delay = 0 }: TextScrambleProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLSpanElement>(null);
  const visualRef = useRef<HTMLSpanElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const runningRef = useRef(false);

  const inView = useOnceInView(rootRef, { amount: 0.4, enabled: trigger === 'view' && !reduced });

  // Text is managed imperatively; set it before paint whenever it changes.
  useLayoutEffect(() => {
    if (visualRef.current) visualRef.current.textContent = text;
  }, [text]);

  const scramble = useCallback(() => {
    const node = visualRef.current;
    if (!node || reduced || runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = runScramble(node, text, () => {
      runningRef.current = false;
      cancelRef.current = null;
    });
  }, [text, reduced]);

  // Automatic runs (mount / first time in view).
  const autoReady = play && (trigger === 'mount' || (trigger === 'view' && inView));
  useEffect(() => {
    if (!autoReady || reduced) return;
    const id = window.setTimeout(scramble, Math.max(0, delay) * 1000);
    return () => window.clearTimeout(id);
  }, [autoReady, reduced, delay, scramble]);

  // Stop any frame loop on unmount / text change and restore the real text.
  useEffect(
    () => () => {
      cancelRef.current?.();
      cancelRef.current = null;
      runningRef.current = false;
      if (visualRef.current) visualRef.current.textContent = text;
    },
    [text],
  );

  const hoverProps =
    trigger === 'hover' && !reduced ? { onPointerEnter: scramble, onFocus: scramble } : undefined;

  return (
    <span ref={rootRef} className={cx('fx-scramble', className)} {...hoverProps}>
      <span className="fx-sr">{text}</span>
      {/* Own grid wrapper: a consumer class on the root (e.g. .chip) may set display. */}
      <span className="fx-scramble__stack" aria-hidden="true">
        <span className="fx-scramble__sizer">{text}</span>
        <span ref={visualRef} className="fx-scramble__text" />
      </span>
    </span>
  );
}
