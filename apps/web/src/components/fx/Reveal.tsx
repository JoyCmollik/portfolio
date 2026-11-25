/**
 * Scroll reveals (spec 3.4: fade + 24px rise + 6px blur clear, once).
 *
 *   <Reveal as="p" className="lead" delay={0.1}>...</Reveal>
 *
 *   <Stagger as="ul" className="grid" step={0.07}>
 *     {items.map(item => <StaggerItem as="li" key={item.id}>...</StaggerItem>)}
 *   </Stagger>
 *
 * Visibility uses useOnceInView (fires for elements taller than the viewport
 * too). `trigger="mount"` reveals right away instead (above-the-fold intros),
 * and `play={false}` holds the hidden state until it turns true (e.g.
 * `play={useIntroDone()}`), so hand-made "fade up with delay" variants are
 * never needed:
 *
 *   <Reveal trigger="mount" play={introDone} delay={0.3}>...</Reveal>
 *
 * Settled state is `filter: none` (a lingering blur(0px) would turn the
 * wrapper into a backdrop root and break `.glass` children).
 * Reduced motion: a <= 200 ms opacity fade, no movement, no blur.
 */
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  EASE_OUT,
  REDUCED_FADE,
  REVEAL_DURATION,
  REVEAL_SETTLED,
  fadeIn,
  fadeUp,
  usePrefersReducedMotion,
} from '../../lib/motion';
import { useOnceInView } from './utils';

/** Tags a Reveal / Stagger / StaggerItem can render as. */
export type RevealTag = 'div' | 'section' | 'li' | 'ul' | 'ol' | 'span' | 'p' | 'article' | 'header' | 'footer' | 'aside';

/*
 * One motion component per tag. All of them accept the handful of props we
 * pass (className, variants, initial, animate, children), so the union is
 * narrowed to the div signature for JSX.
 */
const MOTION_TAGS: Record<RevealTag, typeof motion.div> = {
  div: motion.div,
  section: motion.section,
  li: motion.li as unknown as typeof motion.div,
  ul: motion.ul as unknown as typeof motion.div,
  ol: motion.ol as unknown as typeof motion.div,
  span: motion.span as unknown as typeof motion.div,
  p: motion.p as unknown as typeof motion.div,
  article: motion.article,
  header: motion.header,
  footer: motion.footer,
  aside: motion.aside,
};

/* --------------------------------------------------------------------------
   Reveal
   -------------------------------------------------------------------------- */

export interface RevealProps {
  children?: ReactNode;
  as?: RevealTag;
  className?: string;
  /** Delay (s) after the trigger (entering the viewport, or mount). */
  delay?: number;
  /** Rise distance in px. */
  y?: number;
  /** Fraction visible before revealing (0-1). */
  amount?: number;
  /** 'view' (default): once scrolled into view; 'mount': right away. */
  trigger?: RevealTrigger;
  /** false holds the hidden state until it becomes true (e.g. useIntroDone()). */
  play?: boolean;
}

/** When a Reveal / Stagger starts. */
export type RevealTrigger = 'view' | 'mount';

/** Shared gate: true once the element should be shown, then latched (reveal once). */
function useRevealGate(ref: RefObject<HTMLElement | null>, trigger: RevealTrigger, play: boolean, amount: number) {
  const inView = useOnceInView(ref, { amount, enabled: trigger === 'view' });
  const ready = play && (trigger === 'mount' || inView);
  // Remember a past "ready" (state derived from previous renders, set during render).
  const [latched, setLatched] = useState(false);
  if (ready && !latched) setLatched(true);
  return ready || latched;
}

export function Reveal({
  children,
  as = 'div',
  className,
  delay = 0,
  y = 24,
  amount = 0.25,
  trigger = 'view',
  play = true,
}: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRevealGate(ref, trigger, play, amount);
  const Tag = MOTION_TAGS[as];

  const variants: Variants = reduced
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: REDUCED_FADE, delay: Math.min(delay, 0.1) } },
      }
    : {
        hidden: { opacity: 0, y, filter: 'blur(6px)' },
        show: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: { duration: REVEAL_DURATION, ease: EASE_OUT, delay },
          transitionEnd: REVEAL_SETTLED,
        },
      };

  return (
    <Tag ref={ref} className={className} variants={variants} initial="hidden" animate={shown ? 'show' : 'hidden'}>
      {children}
    </Tag>
  );
}

/* --------------------------------------------------------------------------
   Stagger + StaggerItem
   -------------------------------------------------------------------------- */

export interface StaggerProps {
  children?: ReactNode;
  as?: RevealTag;
  className?: string;
  /** Delay (s) between consecutive StaggerItems. */
  step?: number;
  /** Delay (s) before the first item. */
  delay?: number;
  /** Fraction of the container visible before starting (0-1). */
  amount?: number;
  /** 'view' (default): once scrolled into view; 'mount': right away. */
  trigger?: RevealTrigger;
  /** false holds every item hidden until it becomes true. */
  play?: boolean;
}

export function Stagger({
  children,
  as = 'div',
  className,
  step = 0.07,
  delay = 0,
  amount = 0.15,
  trigger = 'view',
  play = true,
}: StaggerProps) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRevealGate(ref, trigger, play, amount);
  const Tag = MOTION_TAGS[as];

  const variants: Variants = {
    hidden: {},
    show: { transition: reduced ? { staggerChildren: 0 } : { staggerChildren: step, delayChildren: delay } },
  };

  return (
    <Tag ref={ref} className={className} variants={variants} initial="hidden" animate={shown ? 'show' : 'hidden'}>
      {children}
    </Tag>
  );
}

export interface StaggerItemProps {
  children?: ReactNode;
  as?: RevealTag;
  className?: string;
}

/** A child of <Stagger>: inherits its 'hidden' / 'show' state. */
export function StaggerItem({ children, as = 'div', className }: StaggerItemProps) {
  const reduced = usePrefersReducedMotion();
  const Tag = MOTION_TAGS[as];
  return (
    <Tag className={className} variants={reduced ? fadeIn : fadeUp}>
      {children}
    </Tag>
  );
}
