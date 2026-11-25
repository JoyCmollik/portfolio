/**
 * Writing: "04 / THOUGHTS & NOTES" as editorial rows (date, title, two tags, reading time, arrow).
 *
 * Hover (fine pointer, motion allowed): a preview card follows the cursor on a spring and leans with its
 * horizontal velocity. It holds every row's cover in a vertical track and slides to the hovered one, so
 * moving between rows "flips" the preview. It sits BEHIND the rows (absolute inside .home-notes, under the
 * list), so it never hides the title being hovered; the custom cursor ring is hidden over the rows so the
 * preview is the one hover affordance besides the row highlight. Living inside the page (not portaled), it
 * also fades out with the page on navigation. Pointer coordinates go into motion values only; React state
 * changes only when the hovered row changes.
 *
 * Covers: the post's coverImage when set (https / same-origin via safeUrl), else the blog's generated
 * PostCover, and the accent comes from postAccent(), so a post keeps one look on home and on /blog.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform, useVelocity, type MotionValue } from 'framer-motion';
import { ArrowUpRight, NotebookPen } from 'lucide-react';
import { SectionHeading } from '../SiteShell';
import { PostCover, postAccent } from '../PostCard';
import { Reveal, Stagger, StaggerItem } from '../fx';
import { usePortfolio } from '../../context/PortfolioContext';
import { readableDate, readingTime, safeUrl } from '../../lib/api';
import { EASE_OUT, useFinePointer, usePrefersReducedMotion } from '../../lib/motion';
import type { Post } from '../../types';

const MAX_POSTS = 4;
/** Preview card size (px; keep in sync with home.css .home-preview). */
const PREVIEW_W = 340;
const PREVIEW_H = 230;
/** How far the card may poke past the list's sides (stays inside the page gutter). */
const EDGE_OVERHANG = 16;
const PREVIEW_SPRING = { stiffness: 260, damping: 30, mass: 0.6 };

/* ------------------------------------------------------------------------------------------------
   Preview cover
   ------------------------------------------------------------------------------------------------ */
function PreviewCover({ post, index, shown }: { post: Post; index: number; shown: boolean }) {
  const image = safeUrl(post.coverImage);

  return (
    // data-shown: only the visible slide runs the cover's ambient animations.
    <div className={`home-preview__slide accent--${postAccent(post)}`} data-shown={shown || undefined}>
      {image ? (
        <>
          <img className="home-preview__img" src={image} alt="" decoding="async" />
          <span className="home-preview__label">
            <span className="home-preview__dot" />
            Note {String(index + 1).padStart(2, '0')}
          </span>
        </>
      ) : (
        <PostCover post={post} />
      )}
      <span className="home-preview__label home-preview__label--end">{readingTime(post.body)} min read</span>
    </div>
  );
}

function FloatingPreview({
  posts,
  active,
  x,
  y,
}: {
  posts: Post[];
  active: number | null;
  x: MotionValue<number>;
  y: MotionValue<number>;
}) {
  const velocity = useVelocity(x);
  const rotate = useTransform(velocity, [-1600, 0, 1600], [-9, 0, 9], { clamp: true });
  const visible = active !== null;
  const shownIndex = active ?? 0;

  return (
    <motion.div className="home-preview" aria-hidden="true" style={{ x, y, rotate }}>
      <motion.div
        className="home-preview__card"
        initial={false}
        animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.72 }}
        transition={{ duration: visible ? 0.45 : 0.3, ease: EASE_OUT }}
      >
        <div className="home-preview__track" style={{ transform: `translate3d(0, ${-shownIndex * 100}%, 0)` }}>
          {posts.map((post, i) => (
            <PreviewCover key={post.slug || i} post={post} index={i} shown={visible && i === shownIndex} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------------------------------
   Row
   ------------------------------------------------------------------------------------------------ */
function NoteRow({
  post,
  index,
  onEnter,
}: {
  post: Post;
  index: number;
  /** Set when the hover preview is on (fine pointer, motion allowed). */
  onEnter?: (index: number) => void;
}) {
  const date = readableDate(post.publishedAt);
  const hasDate = Boolean(post.publishedAt) && date !== 'Recently';
  const tags = post.tags.filter(Boolean).slice(0, 2);
  const minutes = readingTime(post.body);

  return (
    <article
      className={`home-note accent--${postAccent(post)}`}
      // With the preview showing, the cursor ring steps aside (one hover affordance, not three).
      data-cursor={onEnter ? 'hide' : 'Read'}
      onPointerEnter={onEnter ? () => onEnter(index) : undefined}
    >
      <p className="home-note__date">
        {hasDate ? <time dateTime={post.publishedAt ?? undefined}>{date}</time> : <span>{date}</span>}
      </p>
      <div className="home-note__main">
        <h3 className="display-3 home-note__title">
          <Link to={`/blog/${post.slug}`} className="home-note__link">
            {post.title}
          </Link>
        </h3>
        {tags.length > 0 && (
          <ul className="home-note__tags" aria-label="Topics">
            {tags.map(tag => (
              <li key={tag} className="home-note__tag">{tag}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="home-note__time">{minutes} min read</p>
      <span className="home-note__arrow" aria-hidden="true">
        <ArrowUpRight />
      </span>
    </article>
  );
}

/* ------------------------------------------------------------------------------------------------
   Section
   ------------------------------------------------------------------------------------------------ */
export function WritingList() {
  const { posts } = usePortfolio();
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const withPreview = fine && !reduced;
  const list = posts.slice(0, MAX_POSTS);

  const notesRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, PREVIEW_SPRING);
  const y = useSpring(targetY, PREVIEW_SPRING);

  /** Centre the card on the pointer (list coordinates), kept over the list. `jump` skips the spring. */
  const place = (event: ReactPointerEvent<HTMLElement>, jump: boolean) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const box = notesRef.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.min(
      Math.max(event.clientX - box.left - PREVIEW_W / 2, -EDGE_OVERHANG),
      box.width - PREVIEW_W + EDGE_OVERHANG,
    );
    const top = Math.min(
      Math.max(event.clientY - box.top - PREVIEW_H / 2, -PREVIEW_H / 6),
      box.height - PREVIEW_H + PREVIEW_H / 6,
    );
    targetX.set(left);
    targetY.set(top);
    if (jump) {
      x.jump(left);
      y.jump(top);
    }
  };

  return (
    <section className="home-writing section">
      <div className="container">
        <SectionHeading
          kicker="04 / THOUGHTS & NOTES"
          title="From the notebook."
          description="Things I'm learning, building, and thinking through."
          action={{ text: 'All writing', href: '/blog' }}
        />

        {list.length === 0 ? (
          <Reveal className="home-empty">
            <NotebookPen aria-hidden="true" />
            <p className="home-empty__title">Notes are on their way.</p>
            <p className="home-empty__text">Fresh articles will appear here when published.</p>
          </Reveal>
        ) : (
          <div
            ref={notesRef}
            className="home-notes"
            onPointerEnter={withPreview ? event => place(event, true) : undefined}
            onPointerMove={withPreview ? event => place(event, false) : undefined}
            onPointerLeave={withPreview ? () => setActive(null) : undefined}
          >
            {/* Before the list in the DOM and under it in the stack: the rows' text stays on top. */}
            {withPreview && <FloatingPreview posts={list} active={active} x={x} y={y} />}
            <Stagger as="ol" className="home-notes__list" step={0.08}>
              {list.map((post, i) => (
                <StaggerItem as="li" key={post.slug || i} className="home-notes__item">
                  <NoteRow post={post} index={i} onEnter={withPreview ? setActive : undefined} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}
      </div>
    </section>
  );
}
