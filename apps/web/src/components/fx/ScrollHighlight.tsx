/**
 * Scroll-linked reading highlight: every word's opacity goes .3 -> 1 as the
 * block travels through the viewport (from its top at 85% of the viewport to
 * its bottom at 45%), so each word lights up as it passes a reading line that
 * moves from 85% to 45% of the viewport height: the whole block is lit while
 * its last line is still mid-screen. Scroll-driven through motion values: no
 * React renders while scrolling.
 *
 *   <ScrollHighlight text={site.aboutText} className="home-statement" />
 *
 * Assistive tech gets the plain text (span.fx-sr); the word spans are
 * aria-hidden. Reduced motion renders the text fully opaque.
 */
import { createElement, useRef } from 'react';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { usePrefersReducedMotion } from '../../lib/motion';
import { cx } from './utils';
import './fx.css';

export interface ScrollHighlightProps {
  text: string;
  className?: string;
  as?: 'p' | 'div' | 'h2' | 'h3' | 'blockquote' | 'span';
}

/**
 * Opacity of words that have not been reached yet: dim enough to read as
 * "not yet", bright enough that the text is never unreadable (keep in sync
 * with .fx-highlight__word in fx.css, the pre-hydration value).
 */
const DIM = 0.3;

export function ScrollHighlight({ text, className, as = 'p' }: ScrollHighlightProps) {
  const reduced = usePrefersReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);

  if (reduced) {
    return createElement(as, { className: cx('fx-highlight', className) }, text);
  }
  return <ScrollHighlightAnimated text={text} words={words} className={className} as={as} />;
}

function ScrollHighlightAnimated({
  text,
  words,
  className,
  as,
}: {
  text: string;
  words: string[];
  className?: string;
  as: NonNullable<ScrollHighlightProps['as']>;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const count = Math.max(words.length, 1);

  return createElement(
    as,
    { ref, className: cx('fx-highlight', className) },
    <span className="fx-sr">{text}</span>,
    <span aria-hidden="true">
      {words.map((word, i) => (
        <HighlightWord key={i} progress={scrollYProgress} start={i / count} end={(i + 1) / count}>
          {word}
        </HighlightWord>
      ))}
    </span>,
  );
}

/** One word: its own useTransform (hooks must not run inside a loop). */
function HighlightWord({
  progress,
  start,
  end,
  children,
}: {
  progress: MotionValue<number>;
  start: number;
  end: number;
  children: string;
}) {
  const opacity = useTransform(progress, [start, end], [DIM, 1]);
  return (
    <>
      <motion.span className="fx-highlight__word" style={{ opacity }}>
        {children}
      </motion.span>{' '}
    </>
  );
}
