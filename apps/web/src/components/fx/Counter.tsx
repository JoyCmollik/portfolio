/**
 * Animated stat value: counts the numeric part of strings such as "3+",
 * "120k", "99.9%", "$1,200" up from zero once in view, keeping prefix, suffix,
 * decimal places and thousands separators. Non-numeric values ("∞") fade in.
 *
 * Layout never shifts: an invisible copy of the final value sizes the box and
 * the animated digits are tabular. Text updates go straight to the DOM node
 * (no React render per frame). Reduced motion shows the final value.
 */
import { useLayoutEffect, useRef } from 'react';
import { animate, motion } from 'framer-motion';
import { EASE_OUT, usePrefersReducedMotion } from '../../lib/motion';
import { cx, useOnceInView } from './utils';
import './fx.css';

export interface CounterProps {
  /** Display value, e.g. "3+", "120k", "99.9%". */
  value: string;
  className?: string;
  /** Count duration in seconds. */
  duration?: number;
}

interface ParsedValue {
  prefix: string;
  number: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}

/** Split "≈$1,200.5k+" into prefix / number / suffix; null when there is no number. */
function parseValue(value: string): ParsedValue | null {
  const match = value.match(/^(\D*?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(.*)$/s);
  if (!match) return null;
  const [, prefix, integer, fraction = '', suffix] = match;
  const number = Number(integer.replace(/,/g, '') + fraction);
  if (!Number.isFinite(number)) return null;
  return {
    prefix,
    number,
    decimals: fraction ? fraction.length - 1 : 0,
    grouped: integer.includes(','),
    suffix,
  };
}

function format(parsed: ParsedValue, n: number): string {
  const body = n.toLocaleString('en-US', {
    minimumFractionDigits: parsed.decimals,
    maximumFractionDigits: parsed.decimals,
    useGrouping: parsed.grouped,
  });
  return `${parsed.prefix}${body}${parsed.suffix}`;
}

export function Counter({ value, className, duration = 1.6 }: CounterProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const inView = useOnceInView(rootRef, { amount: 0.6, enabled: !reduced });
  const parsed = parseValue(value);

  // Layout effect: the first paint already shows "0" (or the final value).
  useLayoutEffect(() => {
    const node = valueRef.current;
    const target = parseValue(value);
    if (!node || !target) return;
    if (reduced) {
      node.textContent = value;
      return;
    }
    if (!inView) {
      node.textContent = format(target, 0);
      return;
    }
    const controls = animate(0, target.number, {
      duration,
      ease: EASE_OUT,
      onUpdate: latest => {
        node.textContent = format(target, latest);
      },
      onComplete: () => {
        node.textContent = value; // land on the exact source string
      },
    });
    return () => controls.stop();
  }, [inView, reduced, value, duration]);

  // Non-numeric: nothing to count, just a soft fade.
  if (!parsed) {
    return (
      <motion.span
        ref={rootRef}
        className={cx('fx-counter', className)}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: reduced || inView ? 1 : 0 }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      >
        {value}
      </motion.span>
    );
  }

  return (
    <span ref={rootRef} className={cx('fx-counter', className)}>
      <span className="fx-sr">{value}</span>
      {/* Own grid wrapper: a consumer class on the root may set display. */}
      <span className="fx-counter__stack" aria-hidden="true">
        <span className="fx-counter__sizer">{value}</span>
        {/* Filled imperatively by the layout effect above. */}
        <span ref={valueRef} className="fx-counter__value" />
      </span>
    </span>
  );
}
