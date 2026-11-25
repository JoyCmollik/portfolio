/**
 * Article page (/blog/:slug).
 *
 * - Reading progress bar (portaled to <body>: <main> transforms during page transitions) bound to the
 *   scroll progress through the <article> itself.
 * - Hero: back link, topics, RevealText title (waits for the first-visit intro), excerpt, byline.
 * - Cover: the post's image, or its generated PostCover, in a wide rounded frame with a gentle parallax.
 * - Body: ReactMarkdown + rehypeSanitize (security requirement) styled by `.prose`, beside a sticky
 *   meta rail on wide screens (live reading percentage, date, length, topics, copy link).
 * - "The next read" (the following entries, wrapping around) and the contact CTA.
 * - Not-found and loading states.
 */
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { motion, useIsPresent, useScroll, useSpring, useTransform, type MotionStyle, type MotionValue } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, Check, Clock3, Link2, X } from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';
import { readableDate, readingTime, safeUrl } from '../lib/api';
import { useIntroDone } from '../lib/intro';
import { EASE_OUT, usePrefersReducedMotion } from '../lib/motion';
import { PostCard, PostCover, postAccent } from '../components/PostCard';
import { ContactSection, SectionHeading } from '../components/SiteShell';
import { copyText } from '../components/CommandPalette';
import { Reveal, RevealText, RollText, Stagger, StaggerItem } from '../components/fx';
import type { Post, Site } from '../types';
import './writing.css';

const pad = (n: number) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------------------------------------
   Markdown element overrides (the sanitizing pipeline itself is unchanged)
   - a Markdown "# heading" renders as h2: the page keeps exactly one h1 (the title);
   - code blocks and tables scroll sideways inside themselves (Lenis lets the wheel through), never
     the page. Only when they actually overflow do they become a named, keyboard-focusable region;
   - absolute http(s) links open in a new tab (like every other external link on the site), site
     paths use the router. hrefs were already filtered by rehype-sanitize.
   ------------------------------------------------------------------------------------------------ */
type MdProps<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & ExtraProps;

/** True while the element is wider inside than its box (re-checked on resize and once fonts load). */
function useOverflowX<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    let alive = true;
    document.fonts?.ready.then(() => alive && check()).catch(() => undefined);
    if (typeof ResizeObserver === 'undefined') return () => { alive = false; };
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);
  return { ref, overflows };
}

/** Props that turn a sideways-scrolling box into a labelled, focusable region (only when it scrolls). */
const scrollRegion = (overflows: boolean, label: string) =>
  overflows ? ({ tabIndex: 0, role: 'region', 'aria-label': label } as const) : {};

function MdPre({ node: _node, ...props }: MdProps<'pre'>) {
  const { ref, overflows } = useOverflowX<HTMLPreElement>();
  return <pre {...props} ref={ref} data-lenis-prevent="" {...scrollRegion(overflows, 'Code sample')} />;
}

function MdTable({ node: _node, ...props }: MdProps<'table'>) {
  const { ref, overflows } = useOverflowX<HTMLDivElement>();
  return (
    <div ref={ref} className="prose__table" data-lenis-prevent="" {...scrollRegion(overflows, 'Table')}>
      <table {...props} />
    </div>
  );
}

function MdLink({ node: _node, href = '', children, ...props }: MdProps<'a'>) {
  if (href.startsWith('/') && !href.startsWith('//')) {
    return <Link {...props} to={href}>{children}</Link>;
  }
  if (/^https?:\/\//i.test(href)) {
    const url = safeUrl(href);
    return (
      <a {...props} href={url || undefined} target="_blank" rel="noreferrer noopener">
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <a {...props} href={href || undefined}>{children}</a>;
}

const markdownComponents: Components = {
  h1: ({ node: _node, ...props }: MdProps<'h1'>) => <h2 {...props} />,
  pre: MdPre,
  table: MdTable,
  a: MdLink,
  img: ({ node: _node, alt, ...props }: MdProps<'img'>) => <img {...props} alt={alt ?? ''} loading="lazy" decoding="async" />,
};

/* ------------------------------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------------------------------ */
export default function BlogDetail() {
  const { slug } = useParams();
  const { posts, site, loading } = usePortfolio();
  const post = posts.find(p => p.slug === slug);

  if (!post) return loading ? <ArticleLoading /> : <ArticleMissing posts={posts} />;
  return <Article key={post.slug} post={post} posts={posts} site={site} />;
}

/* ------------------------------------------------------------------------------------------------
   Article
   ------------------------------------------------------------------------------------------------ */
function Article({ post, posts, site }: { post: Post; posts: Post[]; site: Site }) {
  const reduced = usePrefersReducedMotion();
  const introDone = useIntroDone();
  const articleRef = useRef<HTMLElement>(null);

  const accent = postAccent(post);
  const minutes = readingTime(post.body);
  const date = readableDate(post.publishedAt);
  const hasDate = date !== 'Recently' && Boolean(post.publishedAt);
  const tags = post.tags.map(t => t.trim()).filter(Boolean);
  const portrait = safeUrl(site.portraitImage) || '/images/joy-portrait.webp';
  const author = site.shortName || site.name;

  const index = posts.findIndex(p => p.slug === post.slug);
  const entry = posts.length - Math.max(index, 0);
  // The next read: the entries that follow this one, wrapping around to the newest.
  const others = index >= 0 ? [...posts.slice(index + 1), ...posts.slice(0, index)].slice(0, 2) : posts.filter(p => p.slug !== post.slug).slice(0, 2);

  // Reading progress through the article body.
  const { scrollYProgress } = useScroll({ target: articleRef, offset: ['start 0.6', 'end 0.95'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 220, damping: 34, mass: 0.4, restDelta: 0.0005 });
  const progress = reduced ? scrollYProgress : smooth;

  const dateNode = hasDate ? <time dateTime={post.publishedAt ?? undefined}>{date}</time> : <span>{date}</span>;

  return (
    <div className={`article-page accent--${accent}`}>
      <ReadingProgress progress={progress} accent={accent} />

      {/* Hero */}
      <section className="article-hero" aria-labelledby="article-title">
        <div className="article-hero__bg" aria-hidden="true">
          <div className="grid-bg" />
          <div className="article-hero__glow" />
        </div>
        <div className="container article-hero__inner">
          <Reveal className="article-hero__top" y={12}>
            <Link to="/blog" className="article-back fx-roll-host">
              <span className="article-back__icon" aria-hidden="true">
                <ArrowLeft size={16} strokeWidth={1.9} />
              </span>
              <RollText text="All writing" />
            </Link>
            <p className="label article-hero__entry">
              <span className="dot-live" aria-hidden="true" />
              Journal entry {pad(entry)}
            </p>
          </Reveal>

          {tags.length > 0 && (
            <Reveal delay={0.06} y={12}>
              <ul className="article-tags" aria-label="Topics">
                {tags.map(tag => (
                  <li key={tag} className="chip chip--mono chip--accent">{tag}</li>
                ))}
              </ul>
            </Reveal>
          )}

          <h1 id="article-title" className="display-1 article-title">
            <RevealText text={post.title} trigger="mount" play={introDone} />
          </h1>

          <Reveal className="article-hero__foot" delay={0.25}>
            {post.excerpt ? <p className="lead article-excerpt">{post.excerpt}</p> : <span />}
            <div className="article-byline">
              <span className="article-byline__avatar">
                <img src={portrait} alt="" width={48} height={48} decoding="async" />
              </span>
              <span className="article-byline__text">
                {author && <span className="article-byline__name">{author}</span>}
                <span className="article-byline__meta">
                  {dateNode}
                  <span aria-hidden="true">·</span>
                  <Clock3 size={12} strokeWidth={1.9} aria-hidden="true" />
                  <span>{minutes} min read</span>
                </span>
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Cover */}
      <div className="container--wide">
        <ArticleCover post={post} reduced={reduced} />
      </div>

      {/* Body (shares the .container content line with the hero: aside starts where the title does) */}
      <div className="container article-layout">
        <aside className="article-aside" aria-label="Article details">
          <div className="article-aside__inner">
            <div className="article-aside__block" aria-hidden="true">
              <span className="label">Progress</span>
              <span className="article-aside__pct">
                <ReadingPercent progress={scrollYProgress} />%
              </span>
              <span className="article-aside__rail">
                <motion.span className="article-aside__fill" style={{ scaleX: progress }} />
              </span>
            </div>
            <div className="article-aside__block">
              <span className="label">Published</span>
              <span className="article-aside__value">{dateNode}</span>
            </div>
            <div className="article-aside__block">
              <span className="label">Reading time</span>
              <span className="article-aside__value">{minutes} min</span>
            </div>
            {tags.length > 0 && (
              <div className="article-aside__block">
                <span className="label">Filed under</span>
                <ul className="article-aside__tags">
                  {tags.map(tag => (
                    <li key={tag} className="chip chip--mono">{tag}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        <article ref={articleRef} className="article-body" aria-labelledby="article-title">
          <div className="prose">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
              {post.body}
            </ReactMarkdown>
          </div>

          <footer className="article-end">
            <p className="article-end__sign">Thanks for reading.</p>
            <div className="article-end__actions">
              <Link to="/blog" className="btn btn--ghost fx-roll-host">
                <span className="btn__icon" aria-hidden="true">
                  <ArrowLeft />
                </span>
                <RollText text="All writing" />
              </Link>
              <CopyLink />
            </div>
          </footer>
        </article>
      </div>

      {/* The next read */}
      {others.length > 0 && (
        <section className="section article-next" aria-label="The next read">
          <div className="container">
            <SectionHeading kicker="THE NEXT READ" title="Keep exploring." action={{ text: 'All writing', href: '/blog' }} />
            <Stagger as="div" className="article-next__wrap">
              <ul className="article-next__grid">
                {others.map(other => (
                  <li key={other.slug}>
                    <StaggerItem className="article-next__item">
                      <PostCard post={other} />
                    </StaggerItem>
                  </li>
                ))}
              </ul>
            </Stagger>
          </div>
        </section>
      )}

      <ContactSection />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
   Pieces
   ------------------------------------------------------------------------------------------------ */

/** Fixed bar at the top of the viewport. Portaled: <main> is transformed during page transitions. */
function ReadingProgress({ progress, accent }: { progress: MotionValue<number>; accent: string }) {
  const [mounted, setMounted] = useState(false);
  // The bar is portaled out of <main>, so it would not fade with the page exit transition on its own:
  // follow the route's presence and fade out together with the page.
  const isPresent = useIsPresent();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <motion.div
      className={`article-progress accent--${accent}`}
      style={{ scaleX: progress }}
      initial={false}
      animate={{ opacity: isPresent ? 1 : 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      aria-hidden="true"
    />,
    document.body,
  );
}

/** Live "42" without re-rendering React on scroll (a motion value rendered as text). */
function ReadingPercent({ progress }: { progress: MotionValue<number> }) {
  const percent = useTransform(progress, value => String(Math.round(Math.min(1, Math.max(0, value)) * 100)));
  return <motion.span>{percent}</motion.span>;
}

/**
 * Wide cover frame: the post's image, or its generated typographic cover. Gentle parallax.
 * Decorative (the image has no alt text in the data, the generated cover is aria-hidden), so the
 * frame is a plain hidden div rather than an empty <figure>.
 * Only the picture layer moves: an image is shifted + over-scaled as a whole; the generated cover
 * keeps its HUD (label, topic word) still and shifts its art layer through `--cover-shift`, so the
 * labels never slide out of the frame.
 */
function ArticleCover({ post, reduced }: { post: Post; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const image = safeUrl(post.coverImage);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-5%', '5%']);

  let innerStyle: MotionStyle | undefined;
  if (!reduced) innerStyle = image ? { y, scale: 1.12 } : ({ '--cover-shift': y } as MotionStyle);

  return (
    <motion.div
      ref={ref}
      className="article-cover"
      aria-hidden="true"
      initial={reduced ? false : { opacity: 0, y: 40, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.35 }}
    >
      <motion.div className={`article-cover__inner${reduced ? '' : ' article-cover__inner--parallax'}`} style={innerStyle}>
        {image ? (
          <img className="article-cover__img" src={image} alt="" decoding="async" />
        ) : (
          <PostCover post={post} variant="hero" />
        )}
      </motion.div>
    </motion.div>
  );
}

type CopyState = 'idle' | 'copied' | 'failed';
const COPY_LABEL: Record<CopyState, string> = { idle: 'Copy link', copied: 'Link copied', failed: 'Copy failed' };
const COPY_STATUS: Record<CopyState, string> = {
  idle: '',
  copied: 'Article link copied to clipboard',
  failed: 'Could not copy the link. Copy it from the address bar instead.',
};

/**
 * Copies the article URL through the shared copyText() (Clipboard API, execCommand fallback on
 * insecure origins). The live region is a sibling of the button (button children are presentational),
 * and failures are announced too.
 */
function CopyLink() {
  const [state, setState] = useState<CopyState>('idle');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await copyText(window.location.href);
    // The legacy fallback selects a temporary textarea: hand focus back to the button.
    if (document.activeElement === document.body) buttonRef.current?.focus({ preventScroll: true });
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), ok ? 2200 : 4000);
  };

  return (
    <span className="article-copy">
      <button ref={buttonRef} type="button" className="btn btn--ghost" data-state={state} onClick={copy}>
        <span className="btn__icon" aria-hidden="true">
          {state === 'copied' ? <Check /> : state === 'failed' ? <X /> : <Link2 />}
        </span>
        <span>{COPY_LABEL[state]}</span>
      </button>
      <span className="sr-only" role="status">{COPY_STATUS[state]}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------
   Loading / not found
   ------------------------------------------------------------------------------------------------ */
function ArticleLoading() {
  return (
    <section className="article-missing" aria-busy="true">
      <div className="container">
        <p className="label article-loading" role="status">
          <span className="dot-live" aria-hidden="true" />
          Loading article
        </p>
      </div>
    </section>
  );
}

function ArticleMissing({ posts }: { posts: Post[] }) {
  const introDone = useIntroDone();
  const recent = posts.slice(0, 3);
  return (
    <section className="article-missing" aria-labelledby="article-missing-title">
      <div className="article-missing__bg" aria-hidden="true">
        <div className="grid-bg" />
        <span className="article-missing__code">404</span>
      </div>
      <div className="container article-missing__inner">
        <p className="kicker">
          <span className="kicker__index">404</span>
          <span className="kicker__line" />
          <span>Engineering journal</span>
        </p>
        <h1 id="article-missing-title" className="display-1">
          <RevealText text="Article" play={introDone} />{' '}
          <RevealText text="not found." className="serif-accent" delay={0.12} play={introDone} />
        </h1>
        <Reveal as="p" className="lead" delay={0.2}>
          This entry may have moved, been unpublished, or the link has a typo. The rest of the notebook is still here.
        </Reveal>
        <Reveal delay={0.3}>
          <Link to="/blog" className="btn btn--primary fx-roll-host">
            <span className="btn__icon" aria-hidden="true">
              <ArrowLeft />
            </span>
            <RollText text="Back to writing" />
          </Link>
        </Reveal>
        {recent.length > 0 && (
          <Reveal className="article-missing__recent" delay={0.4}>
            <h2 className="label">Recent entries</h2>
            <ul className="article-missing__list">
              {recent.map(p => (
                <li key={p.slug}>
                  <Link to={`/blog/${p.slug}`} className="article-missing__link" data-cursor="Read">
                    <span className="label">{readableDate(p.publishedAt)}</span>
                    <span>{p.title}</span>
                    <ArrowUpRight size={18} strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>
    </section>
  );
}
