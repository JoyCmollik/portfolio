/**
 * Page scroll progress: a fixed 2px signal-gradient bar at the very top of the
 * viewport. scaleX follows window scroll progress through a spring (motion
 * values only, no React renders). Decorative, so aria-hidden.
 */
import { motion, useScroll, useSpring } from 'framer-motion';
import { usePrefersReducedMotion } from '../../lib/motion';
import { cx } from './utils';
import './fx.css';

export interface ScrollProgressProps {
  className?: string;
}

export function ScrollProgress({ className }: ScrollProgressProps) {
  const reduced = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 160, damping: 30, restDelta: 0.0005 });
  return (
    <motion.div
      className={cx('fx-progress', className)}
      aria-hidden="true"
      style={{ scaleX: reduced ? scrollYProgress : smooth }}
    />
  );
}
