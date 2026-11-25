/**
 * Writing: article card + generated typographic cover.
 *
 * - PostCard({ post, featured? }): spotlight card with a stretched link to /blog/{slug}.
 *   `featured` switches to a horizontal layout (large cover left, content right).
 * - PostCover({ post, variant? }): the generated "journal cover" used when a post has no coverImage
 *   (accent glow + fine grid + outlined display glyph + serif-italic topic word + a signal trace).
 *   Everything about it is derived deterministically from the post (first tag -> accent, slug -> layout),
 *   so a post always gets the same cover, on the card and on its article page.
 * - postAccent(post): the accent name ('emerald' | 'violet' | ...) for `accent--*` scopes.
 */
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import type { Post } from '../types';
import { readableDate, readingTime, safeUrl } from '../lib/api';
import { useSpotlight } from './fx';
import '../pages/writing.css';

/* ------------------------------------------------------------------------------------------------
   Deterministic look
   ------------------------------------------------------------------------------------------------ */
const ACCENTS = ['emerald', 'violet', 'blue', 'orange', 'rose'] as const;
type Accent = (typeof ACCENTS)[number];

/** Token holding each accent's rgb channels (used for the secondary glow). */
const ACCENT_RGB_TOKEN: Record<Accent, string> = {
  emerald: 'var(--c-signal-rgb)',
  violet: 'var(--c-violet-rgb)',
  blue: 'var(--c-blue-rgb)',
  orange: 'var(--c-amber-rgb)',
  rose: 'var(--c-rose-rgb)',
};

/** FNV-1a: tiny, stable string hash. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Accent of a post: derived from its first tag (same topic, same color), else its slug. */
export function postAccent(post: Pick<Post, 'tags' | 'slug' | 'title'>): Accent {
  const seed = (post.tags[0] || post.slug || post.title || 'journal').trim().toLowerCase();
  return ACCENTS[hash(seed) % ACCENTS.length];
}

/** A smooth, deterministic "signal trace" across a 400 x 100 box. */
function wavePath(seed: number): string {
  const f1 = 1.2 + (seed % 7) * 0.28;
  const f2 = 3.1 + ((seed >>> 3) % 5) * 0.55;
  const p1 = ((seed >>> 6) % 628) / 100;
  const p2 = ((seed >>> 10) % 628) / 100;
  const points: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    // Envelope: calm at the edges, louder in the middle (a pulse travelling through).
    const envelope = 0.35 + 0.65 * Math.sin(Math.PI * t) ** 2;
    const y = 50 + envelope * (22 * Math.sin(t * Math.PI * 2 * f1 + p1) + 9 * Math.sin(t * Math.PI * 2 * f2 + p2));
    points.push(`${i === 0 ? 'M' : 'L'}${(t * 400).toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(' ');
}

interface CoverLook {
  accent: Accent;
  word: string;
  glyph: string;
  wave: string;
  style: CSSProperties;
}

function coverLook(post: Post): CoverLook {
  const accent = postAccent(post);
  const seed = hash(post.slug || post.title || 'journal');
  // Secondary hue: any accent other than the primary one.
  const others = ACCENTS.filter(a => a !== accent);
  const secondary = others[seed % others.length];
  const word = (post.tags[0] || 'Notes').trim() || 'Notes';
  const glyph = Array.from(word)[0]?.toUpperCase() ?? 'N';
  const style = {
    '--pc-b-rgb': ACCENT_RGB_TOKEN[secondary],
    '--pc-x': `${18 + (seed % 46)}%`,
    '--pc-y': `${12 + ((seed >>> 5) % 30)}%`,
    '--pc-x2': `${62 + ((seed >>> 9) % 30)}%`,
    '--pc-y2': `${58 + ((seed >>> 13) % 34)}%`,
    '--pc-len': Math.max(4, Array.from(word).length),
  } as CSSProperties;
  return { accent, word, glyph, wave: wavePath(seed), style };
}

/* ------------------------------------------------------------------------------------------------
   PostCover
   ------------------------------------------------------------------------------------------------ */
export interface PostCoverProps {
  post: Post;
  /** 'card' for PostCard, 'hero' for the wide frame on the article page. */
  variant?: 'card' | 'hero';
}

/** Generated typographic cover. Decorative: fills its positioned parent, aria-hidden. */
export function PostCover({ post, variant = 'card' }: PostCoverProps) {
  const look = useMemo(() => coverLook(post), [post]);
  return (
    <div className={`post-cover post-cover--${variant} accent--${look.accent}`} style={look.style} aria-hidden="true">
      <span className="post-cover__zoom">
        <span className="post-cover__glow" />
        <span className="post-cover__grid" />
        <span className="post-cover__glyph">{look.glyph}</span>
        <svg className="post-cover__wave" viewBox="0 0 400 100" preserveAspectRatio="none" focusable="false">
          <path className="post-cover__trace" d={look.wave} pathLength={1} />
          <path className="post-cover__pulse" d={look.wave} pathLength={1} />
        </svg>
      </span>
      {/* HUD layer: stays put while the art layer above zooms / drifts (never clipped by it).
          The date lives in the card meta / article byline only, not repeated here. */}
      <span className="post-cover__label post-cover__label--start">
        <span className="post-cover__dot" />
        Engineering journal
      </span>
      <span className="post-cover__word">{look.word}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
   PostCard
   ------------------------------------------------------------------------------------------------ */
export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const spot = useSpotlight<HTMLElement>();
  const cover = safeUrl(post.coverImage);
  const accent = postAccent(post);
  const minutes = readingTime(post.body);
  const date = readableDate(post.publishedAt);
  const hasDate = date !== 'Recently' && Boolean(post.publishedAt);
  const tags = post.tags.filter(Boolean).slice(0, 2);

  return (
    <article
      ref={spot.ref}
      onPointerMove={spot.onPointerMove}
      className={`post-card fx-spotlight accent--${accent}${featured ? ' post-card--featured' : ''}`}
      data-cursor="Read"
    >
      <div className="post-card__media">
        {cover ? <img className="post-card__img" src={cover} alt="" loading="lazy" decoding="async" /> : <PostCover post={post} />}
      </div>

      <div className="post-card__body">
        {featured && (
          <p className="post-card__flag">
            <span className="dot-live" aria-hidden="true" />
            Latest entry
          </p>
        )}
        <p className="post-card__meta">
          {hasDate ? <time dateTime={post.publishedAt ?? undefined}>{date}</time> : <span>{date}</span>}
          <span className="post-card__sep" aria-hidden="true" />
          <span className="post-card__time">
            <Clock3 size={13} strokeWidth={1.8} aria-hidden="true" />
            {minutes} min read
          </span>
        </p>
        <h3 className="post-card__title">
          <Link to={`/blog/${post.slug}`} className="post-card__link">
            <span className="post-card__title-text">{post.title}</span>
          </Link>
        </h3>
        {post.excerpt && <p className="post-card__excerpt">{post.excerpt}</p>}
        <div className="post-card__foot">
          {tags.length > 0 ? (
            <ul className="post-card__tags" aria-label="Topics">
              {tags.map(tag => (
                <li key={tag} className="chip chip--mono post-card__tag">{tag}</li>
              ))}
            </ul>
          ) : (
            <span />
          )}
          <span className="post-card__arrow" aria-hidden="true">
            <ArrowUpRight size={18} strokeWidth={1.8} />
          </span>
        </div>
      </div>
    </article>
  );
}
