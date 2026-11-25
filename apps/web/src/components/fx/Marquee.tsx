/**
 * Seamless infinite horizontal marquee (pure CSS animation, GPU transform).
 *
 *   <Marquee speed={40} reverse>{items}</Marquee>
 *
 * The track holds two identical halves and translates by -50%, so the loop is
 * seamless. Each half repeats the children as often as needed to cover the
 * container (measured with ResizeObserver), so short content never leaves a
 * gap. Every copy but the first is aria-hidden + inert (no duplicate reading,
 * no duplicate tab stops). Edge fade via mask-image on the viewport.
 * Reduced motion: a single static, wrapping row (and no control).
 *
 * Pausing (WCAG 2.2.2): hover / focus inside pauses the row, and a small
 * "Pause motion" toggle (aria-pressed) pauses it for keyboard and touch users
 * too. The toggle drives the site-wide visitor pause in lib/motion.ts, so it
 * also stills the other loops (clock colon, ambient light, shader, project
 * art), and it is remembered. Several marquees side by side (e.g. two rows in
 * one parent) share ONE toggle: only the first marquee in its parent renders
 * it, at the bottom-right edge, straddling the edge line.
 * When the marquee sits inside an aria-hidden / inert wrapper (decorative rows
 * whose content is exposed elsewhere), the toggle is portaled to that
 * wrapper's parent so it stays operable and announced; that parent should be
 * positioned (it anchors the toggle).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { setMotionPaused, useMotionPaused, usePrefersReducedMotion } from '../../lib/motion';
import { cx } from './utils';
import './fx.css';

export interface MarqueeProps {
  children: ReactNode;
  /** Seconds per loop. */
  speed?: number;
  /** Scroll left-to-right instead. */
  reverse?: boolean;
  className?: string;
  pauseOnHover?: boolean;
  /** Extra (optional): render the "Pause motion" toggle (first marquee in its parent only). */
  pauseControl?: boolean;
}

/**
 * Upper bound for the copies per half: a safety net, so a layout that ever
 * let the root grow with its track could not feed back into endless copies.
 */
const MAX_COPIES = 8;

/** Where the shared toggle goes: inside this marquee, or portaled out of a hidden wrapper. */
type ToggleSlot = { kind: 'inline' } | { kind: 'portal'; container: Element };

/** Decide whether this marquee renders the toggle, and where. */
function findToggleSlot(root: HTMLElement): ToggleSlot | null {
  const parent = root.parentElement;
  // One toggle per group of sibling marquees: the first one renders it.
  if (parent && parent.querySelector(':scope > .fx-marquee') !== root) return null;
  const hidden = parent?.closest('[aria-hidden="true"], [inert]');
  if (!hidden) return { kind: 'inline' };
  return hidden.parentElement ? { kind: 'portal', container: hidden.parentElement } : null;
}

export function Marquee({
  children,
  speed = 40,
  reverse = false,
  className,
  pauseOnHover = true,
  pauseControl = true,
}: MarqueeProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  // How many copies of the children one half of the track holds.
  const [copies, setCopies] = useState(1);
  const [slot, setSlot] = useState<ToggleSlot | null>(null);

  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    const group = groupRef.current;
    if (!root || !group || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const groupWidth = group.getBoundingClientRect().width;
      if (groupWidth <= 0) return;
      const needed = Math.min(MAX_COPIES, Math.max(1, Math.ceil(root.clientWidth / groupWidth)));
      setCopies(prev => (prev === needed ? prev : needed));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(group);
    measure();
    return () => ro.disconnect();
  }, [reduced]);

  // Before paint, so the toggle never pops in a frame late.
  useLayoutEffect(() => {
    const root = rootRef.current;
    setSlot(!reduced && pauseControl && root ? findToggleSlot(root) : null);
  }, [reduced, pauseControl]);

  if (reduced) {
    return (
      <div className={cx('fx-marquee', 'fx-marquee--static', className)}>
        <div className="fx-marquee__group">{children}</div>
      </div>
    );
  }

  const groups = Array.from({ length: copies * 2 }, (_, i) => (
    <div
      key={i}
      ref={i === 0 ? groupRef : undefined}
      className="fx-marquee__group"
      aria-hidden={i === 0 ? undefined : true}
      inert={i === 0 ? undefined : true}
    >
      {children}
    </div>
  ));

  return (
    <div
      ref={rootRef}
      className={cx('fx-marquee', reverse && 'fx-marquee--reverse', pauseOnHover && 'fx-marquee--pausable', className)}
      style={{ '--fx-marquee-duration': `${Math.max(1, speed * copies)}s` } as CSSProperties}
    >
      <div className="fx-marquee__viewport">
        <div className="fx-marquee__track">{groups}</div>
      </div>
      {slot?.kind === 'inline' && <MotionPauseToggle />}
      {slot?.kind === 'portal' && createPortal(<MotionPauseToggle />, slot.container)}
    </div>
  );
}

/**
 * Toggle button for the site-wide visitor pause. Constant name ("Pause
 * motion"); aria-pressed carries the state, the pressed look shows it.
 */
function MotionPauseToggle() {
  const paused = useMotionPaused();
  return (
    <button
      type="button"
      className="fx-motion-toggle"
      aria-pressed={paused}
      data-cursor="link"
      onClick={() => setMotionPaused(!paused)}
    >
      <span className="fx-motion-toggle__icon" aria-hidden="true" />
      <span className="fx-motion-toggle__text">Pause motion</span>
    </button>
  );
}
