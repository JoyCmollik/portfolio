/**
 * Writing index (/blog): page intro, glass search ("/" focuses it), topic pills with a sliding
 * indicator, an animated result count, and a layout-animated grid of PostCards. When nothing is
 * filtered the newest post opens the page as a wide featured card.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, LayoutGroup, motion, type Transition } from 'framer-motion';
import { BookOpen, RotateCcw, Search, X } from 'lucide-react';
import { ContactSection, PageIntro } from '../components/SiteShell';
import { PostCard } from '../components/PostCard';
import { Reveal } from '../components/fx';
import { usePortfolio } from '../context/PortfolioContext';
import { EASE_OUT, usePrefersReducedMotion } from '../lib/motion';
import type { Post } from '../types';
import './writing.css';

const ALL = 'All';
const LAYOUT_SPRING: Transition = { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 };
const PILL_SPRING: Transition = { type: 'spring', stiffness: 460, damping: 36 };

/** True when the key event comes from somewhere the user is typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
}

const pad = (n: number) => String(n).padStart(2, '0');

function matches(post: Post, tag: string, query: string): boolean {
  if (tag !== ALL && !post.tags.includes(tag)) return false;
  if (!query) return true;
  return `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLowerCase().includes(query);
}

export default function Blog() {
  const { posts } = usePortfolio();
  const reduced = usePrefersReducedMotion();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState(ALL);
  const inputRef = useRef<HTMLInputElement>(null);

  // First paint staggers the cards in; later changes (filtering) animate without delay.
  const firstPaint = useRef(true);
  useEffect(() => {
    const id = window.setTimeout(() => { firstPaint.current = false; }, 50);
    return () => window.clearTimeout(id);
  }, []);

  // Topics with counts, most used first (ties keep their first-seen order).
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach(post => post.tags.forEach(t => {
      const name = t.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [posts]);

  // A topic that disappeared after a content refresh falls back to "All".
  const activeTag = tag === ALL || topics.some(([name]) => name === tag) ? tag : ALL;
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => posts.filter(post => matches(post, activeTag, query)), [posts, activeTag, query]);
  const featured = !query && activeTag === ALL && filtered.length >= 2 ? filtered[0] : null;
  const rest = featured ? filtered.slice(1) : filtered;
  const isFiltered = Boolean(query) || activeTag !== ALL;

  // "/" focuses the search (never while typing elsewhere, never with modifiers: ⌘K stays the palette's).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const input = inputRef.current;
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Esc clears the query; on an empty field it does nothing (focus stays put, never dropped to <body>).
  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || !search) return;
    event.preventDefault();
    setSearch('');
  };

  const clearSearch = () => {
    setSearch('');
    inputRef.current?.focus();
  };

  // The empty state (and this button) unmounts on reset: move focus to the search field first.
  const clearFilters = () => {
    setSearch('');
    setTag(ALL);
    inputRef.current?.focus();
  };

  const layout = reduced ? false : ('position' as const);
  const itemTransition = (index: number): Transition => ({
    duration: reduced ? 0.2 : 0.7,
    ease: EASE_OUT,
    delay: firstPaint.current && !reduced ? 0.12 + Math.min(index, 6) * 0.07 : 0,
    layout: LAYOUT_SPRING,
  });
  const itemInitial = reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.98 };
  const itemExit = reduced
    ? { opacity: 0, transition: { duration: 0.12 } }
    : { opacity: 0, scale: 0.96, transition: { duration: 0.25, ease: EASE_OUT } };

  return (
    <>
      <PageIntro
        tag="ENGINEERING JOURNAL / 03"
        title="Notes from the field."
        sub="Ideas, lessons, and little discoveries from building software."
      />

      <section className="blog-index" aria-labelledby="blog-articles-title">
        <div className="container">
          <h2 id="blog-articles-title" className="sr-only">Articles</h2>

          {posts.length === 0 ? (
            <Reveal className="blog-empty">
              <span className="blog-empty__icon" aria-hidden="true"><BookOpen size={24} strokeWidth={1.6} /></span>
              <h3 className="blog-empty__title">Notes are on their way.</h3>
              <p className="blog-empty__text">Fresh articles will appear here as soon as they are published.</p>
            </Reveal>
          ) : (
            <LayoutGroup id="blog">
              <Reveal className="blog-toolbar" y={16}>
                <div className="blog-toolbar__row">
                  <div className="blog-search glass" role="search">
                    <Search className="blog-search__icon" size={18} strokeWidth={1.8} aria-hidden="true" />
                    <input
                      ref={inputRef}
                      className="blog-search__input"
                      type="search"
                      aria-label="Search articles"
                      aria-keyshortcuts="/"
                      placeholder="Search articles..."
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="search"
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      onKeyDown={onSearchKey}
                    />
                    {search ? (
                      <button type="button" className="blog-search__clear" aria-label="Clear search" onClick={clearSearch}>
                        <X size={15} strokeWidth={2} aria-hidden="true" />
                      </button>
                    ) : (
                      <kbd className="blog-search__kbd" title="Press / to search">/</kbd>
                    )}
                  </div>

                  <p className="blog-count">
                    <span className="sr-only" aria-live="polite" aria-atomic="true">
                      {isFiltered
                        ? `Showing ${filtered.length} of ${posts.length} articles`
                        : `${posts.length} ${posts.length === 1 ? 'article' : 'articles'}`}
                    </span>
                    <span className="blog-count__num" aria-hidden="true">
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={filtered.length}
                          className="blog-count__digit"
                          initial={reduced ? { opacity: 0 } : { y: '100%', opacity: 0 }}
                          animate={{ y: '0%', opacity: 1 }}
                          exit={reduced ? { opacity: 0 } : { y: '-100%', opacity: 0 }}
                          transition={{ duration: reduced ? 0.15 : 0.5, ease: EASE_OUT }}
                        >
                          {pad(filtered.length)}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span aria-hidden="true">
                      {isFiltered ? `of ${pad(posts.length)} ` : ''}
                      {filtered.length === 1 && !isFiltered ? 'article' : 'articles'}
                    </span>
                  </p>
                </div>

                {topics.length > 0 && (
                  <div className="blog-tags-scroller">
                    <ul className="blog-tags" aria-label="Filter articles by topic">
                      {[[ALL, posts.length] as [string, number], ...topics].map(([name, count]) => {
                        const active = activeTag === name;
                        return (
                          <li key={name}>
                            <button
                              type="button"
                              className="blog-tag"
                              aria-pressed={active}
                              onClick={() => setTag(name)}
                            >
                              {active && (
                                <motion.span
                                  layoutId="blog-tag-pill"
                                  className="blog-tag__pill"
                                  transition={reduced ? { duration: 0 } : PILL_SPRING}
                                />
                              )}
                              <span>{name}</span>
                              <span className="blog-tag__count" aria-label={`${count} ${count === 1 ? 'article' : 'articles'}`}>
                                {pad(count)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </Reveal>

              <div className="blog-results">
                <AnimatePresence mode="popLayout" initial={!reduced}>
                  {featured && (
                    <motion.div
                      key={`featured:${featured.slug}`}
                      className="blog-results__featured"
                      layout={layout}
                      initial={itemInitial}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={itemExit}
                      transition={itemTransition(0)}
                    >
                      <PostCard post={featured} featured />
                    </motion.div>
                  )}
                </AnimatePresence>

                {rest.length > 0 && (
                  <motion.ul className="blog-grid" layout={layout} transition={{ layout: LAYOUT_SPRING }}>
                    <AnimatePresence mode="popLayout" initial={!reduced}>
                      {rest.map((post, index) => (
                        <motion.li
                          key={post.slug}
                          className="blog-grid__item"
                          layout={layout}
                          initial={itemInitial}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={itemExit}
                          transition={itemTransition(index + (featured ? 1 : 0))}
                        >
                          <PostCard post={post} />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ul>
                )}

                <AnimatePresence initial={false}>
                  {filtered.length === 0 && (
                    <motion.div
                      key="empty"
                      className="blog-empty"
                      initial={{ opacity: 0, y: reduced ? 0 : 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      transition={{ duration: reduced ? 0.2 : 0.5, ease: EASE_OUT }}
                    >
                      <span className="blog-empty__icon" aria-hidden="true"><BookOpen size={24} strokeWidth={1.6} /></span>
                      <h3 className="blog-empty__title">No articles found.</h3>
                      <p className="blog-empty__text">
                        {query ? (
                          <>Nothing matches <span className="blog-empty__query">&ldquo;{search.trim()}&rdquo;</span>{activeTag !== ALL ? ` in ${activeTag}` : ''}. Try a different search or topic.</>
                        ) : (
                          'Try a different search or topic.'
                        )}
                      </p>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
                        <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                        Clear filters
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </LayoutGroup>
          )}
        </div>
      </section>

      <ContactSection />
    </>
  );
}
