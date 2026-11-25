/**
 * Global cursor follower: a hairline ring that trails the native cursor
 * (which always stays visible) and reacts to what is underneath it.
 *
 * Reads the nearest ancestor `[data-cursor]` of the hovered element:
 *   data-cursor="link"   ring grows with a faint mint fill
 *   data-cursor="hide"   ring hides (e.g. over text inputs, iframes)
 *   data-cursor="View"   any other value shows that text in a mint pill (+ ↗)
 * Without an attribute, links / buttons grow the ring and text fields hide it.
 *
 * Position is driven by framer motion values + springs (no React state per
 * frame); React state only changes when the hovered target changes.
 * Mounted only for fine pointers, never with reduced motion, never on /admin.
 */
import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useFinePointer, usePrefersReducedMotion } from '../../lib/motion';
import './fx.css';

type Variant = 'default' | 'link' | 'label' | 'hide';

interface CursorTarget {
  variant: Variant;
  label: string;
}

const DEFAULT_TARGET: CursorTarget = { variant: 'default', label: '' };

/** Interactive elements that grow the ring even without data-cursor. */
const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"], summary, label[for], select, [data-cursor-link]';
/** Text entry: the ring would sit on top of the caret, so hide it. */
const TEXT_ENTRY =
  'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable=""], [contenteditable="true"], iframe';

function resolveTarget(node: EventTarget | null): CursorTarget {
  if (!(node instanceof Element)) return DEFAULT_TARGET;
  const tagged = node.closest<HTMLElement>('[data-cursor]');
  const value = tagged?.dataset.cursor?.trim();
  if (value) {
    if (value === 'link') return { variant: 'link', label: '' };
    if (value === 'hide') return { variant: 'hide', label: '' };
    return { variant: 'label', label: value };
  }
  if (node.closest(TEXT_ENTRY)) return { variant: 'hide', label: '' };
  if (node.closest(INTERACTIVE)) return { variant: 'link', label: '' };
  return DEFAULT_TARGET;
}

/** Public entry: decides whether the follower should exist at all. */
export function Cursor() {
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const { pathname } = useLocation();
  if (!fine || reduced || pathname.startsWith('/admin')) return null;
  return <CursorFollower pathname={pathname} />;
}

function CursorFollower({ pathname }: { pathname: string }) {
  const [target, setTarget] = useState<CursorTarget>(DEFAULT_TARGET);
  // Last pill text, kept while the pill animates out so it never collapses empty.
  const [label, setLabel] = useState('');
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  // Raw pointer position -> springs. Slight lag reads as weight, not latency.
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 520, damping: 38, mass: 0.45 });
  const springY = useSpring(y, { stiffness: 520, damping: 38, mass: 0.45 });

  // The page under a still pointer changes on navigation: reset the state.
  useEffect(() => {
    setTarget(DEFAULT_TARGET);
  }, [pathname]);

  useEffect(() => {
    let shown = false;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      x.set(event.clientX);
      y.set(event.clientY);
      if (!shown) {
        // First move: jump straight to the pointer instead of flying in from a corner.
        springX.jump(event.clientX);
        springY.jump(event.clientY);
        shown = true;
        setVisible(true);
      }
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const next = resolveTarget(event.target);
      setTarget(prev => (prev.variant === next.variant && prev.label === next.label ? prev : next));
      if (next.label) setLabel(next.label);
    };
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    const hide = () => {
      shown = false;
      setVisible(false);
      setPressed(false);
    };
    const onDocLeave = (event: MouseEvent) => {
      if (!event.relatedTarget) hide();
    };
    const onVisibility = () => {
      if (document.hidden) hide();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('blur', hide);
    document.documentElement.addEventListener('mouseleave', onDocLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', hide);
      document.documentElement.removeEventListener('mouseleave', onDocLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [x, y, springX, springY]);

  return (
    <motion.div
      className="fx-cursor"
      aria-hidden="true"
      data-variant={target.variant}
      data-visible={visible && target.variant !== 'hide' ? 'true' : 'false'}
      data-pressed={pressed ? 'true' : 'false'}
      style={{ x: springX, y: springY }}
    >
      <span className="fx-cursor__ring" />
      <span className="fx-cursor__label">
        {label}
        <span className="fx-cursor__glyph">↗</span>
      </span>
    </motion.div>
  );
}
