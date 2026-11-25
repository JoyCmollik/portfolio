/**
 * 3D tilt toward the pointer with spring physics and an optional glare
 * highlight that follows the pointer. Resets smoothly on leave.
 *
 *   <Tilt className="home-portrait" max={6}>...</Tilt>
 *
 * The outer element (className) is the perspective wrapper and the hit area;
 * the inner layer rotates. Radius is inherited down to the glare, so a rounded
 * wrapper gets a rounded glare. No-op on coarse pointers / reduced motion.
 *
 * The rotating layer is flat by default: the wrapper's perspective already
 * gives the tilt its depth, and `transform-style: preserve-3d` would make
 * Chromium drop backdrop-filter on every `.glass` descendant. Pass `depth`
 * only when children use translateZ() parallax and have no glass.
 */
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import { useFinePointer, usePrefersReducedMotion } from '../../lib/motion';
import { cx } from './utils';
import './fx.css';

export interface TiltProps {
  children: ReactNode;
  /** Maximum rotation in degrees on each axis. */
  max?: number;
  className?: string;
  /** Soft light highlight following the pointer. */
  glare?: boolean;
  /** Extra (optional): preserve-3d, for translateZ() children (disables backdrop-filter inside). */
  depth?: boolean;
}

const TILT_SPRING = { stiffness: 170, damping: 20, mass: 0.6 };
const GLARE_SPRING = { stiffness: 120, damping: 24 };

export function Tilt({ children, max = 8, className, glare = true, depth = false }: TiltProps) {
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const active = fine && !reduced;

  const ref = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, TILT_SPRING);
  const springY = useSpring(rotateY, TILT_SPRING);

  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glareOpacity = useSpring(0, GLARE_SPRING);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04) 28%, transparent 62%)`;

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || event.pointerType === 'touch') return;
    const rect = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    // Pointer right -> rotate around Y toward it; pointer low -> tip bottom away.
    rotateY.set((px - 0.5) * 2 * max);
    rotateX.set((0.5 - py) * 2 * max);
    glareX.set(px * 100);
    glareY.set(py * 100);
    glareOpacity.set(1);
  };

  // The glare inherits the wrapper's radius. When only the child is rounded
  // (common: <Tilt><div className="card"/></Tilt>), borrow the child's radius
  // so the glare never shows square corners. Measured once per hover.
  const onPointerEnter = () => {
    const wrapper = ref.current;
    const glareEl = glareRef.current;
    if (!wrapper || !glareEl) return;
    if (parseFloat(getComputedStyle(wrapper).borderTopLeftRadius) > 0) return;
    const child = glareEl.parentElement?.firstElementChild;
    if (child && child !== glareEl) glareEl.style.borderRadius = getComputedStyle(child).borderRadius;
  };

  const onPointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    glareOpacity.set(0);
  };

  if (!active) {
    return (
      <div className={cx('fx-tilt', depth && 'fx-tilt--depth', className)}>
        <div className="fx-tilt__inner">{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cx('fx-tilt', depth && 'fx-tilt--depth', className)}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <motion.div className="fx-tilt__inner" style={{ rotateX: springX, rotateY: springY }}>
        {children}
        {glare && (
          <motion.div
            ref={glareRef}
            className="fx-tilt__glare"
            aria-hidden="true"
            style={{ background: glareBackground, opacity: glareOpacity }}
          />
        )}
      </motion.div>
    </div>
  );
}
