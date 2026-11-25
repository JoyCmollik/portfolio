/**
 * Magnetic hover: the wrapped element leans toward the pointer and springs
 * back on leave. Wrap CTAs / icon buttons:
 *   <Magnetic><a className="btn btn--primary">...</a></Magnetic>
 *
 * Renders an inline-block motion span. No-op (plain span, no listeners) on
 * coarse pointers and with reduced motion.
 */
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useFinePointer, usePrefersReducedMotion } from '../../lib/motion';
import { cx } from './utils';
import './fx.css';

export interface MagneticProps {
  children: ReactNode;
  /** Fraction of the pointer's distance from center the element travels (0-1). */
  strength?: number;
  className?: string;
}

const SPRING = { stiffness: 260, damping: 18, mass: 0.55 };

export function Magnetic({ children, strength = 0.35, className }: MagneticProps) {
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const active = fine && !reduced;

  const ref = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);

  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el || event.pointerType === 'touch') return;
    const rect = el.getBoundingClientRect();
    // The rect already includes our own translation: subtract it so the
    // element's resting center is used (avoids a feedback wobble).
    const centerX = rect.left + rect.width / 2 - springX.get();
    const centerY = rect.top + rect.height / 2 - springY.get();
    x.set((event.clientX - centerX) * strength);
    y.set((event.clientY - centerY) * strength);
  };

  const onPointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  if (!active) {
    return <span className={cx('fx-magnetic', className)}>{children}</span>;
  }

  return (
    <motion.span
      ref={ref}
      className={cx('fx-magnetic', className)}
      style={{ x: springX, y: springY }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </motion.span>
  );
}
