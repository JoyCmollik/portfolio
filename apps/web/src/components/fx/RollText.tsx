/**
 * Letter "roll" for button / link labels: two stacked copies of the text.
 * When an ancestor with class `fx-roll-host` is hovered or focus-visible, the
 * first copy's letters slide up and out while the second copy's slide in,
 * staggered per letter (pure CSS, fx.css).
 *
 *   <a className="btn btn--primary fx-roll-host" href="/projects">
 *     <RollText text="Explore my work" />
 *     <span className="btn__icon"><ArrowRight /></span>
 *   </a>
 *
 * The accessible name comes from a visually hidden copy; both visual copies
 * are aria-hidden (so the label is not read twice or letter by letter).
 */
import type { CSSProperties } from 'react';
import { cx } from './utils';
import './fx.css';

export interface RollTextProps {
  text: string;
  className?: string;
}

/** Letters, with spaces as no-break spaces (inline-block would collapse them). */
function letters(text: string) {
  return Array.from(text).map((char, i) => (
    <span key={i} className="fx-roll__char" style={{ '--fx-i': i } as CSSProperties}>
      {char === ' ' ? ' ' : char}
    </span>
  ));
}

export function RollText({ text, className }: RollTextProps) {
  return (
    <span className={cx('fx-roll', className)}>
      <span className="fx-sr">{text}</span>
      <span className="fx-roll__layer" aria-hidden="true">
        {letters(text)}
      </span>
      <span className="fx-roll__layer fx-roll__layer--next" aria-hidden="true">
        {letters(text)}
      </span>
    </span>
  );
}
