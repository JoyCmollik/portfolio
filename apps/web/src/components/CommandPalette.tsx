/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Mounted by <Header/> (public routes only), so the global shortcut only exists
 * on the public site. Rendered through a portal on document.body: <main> and the
 * header animate transforms, which would otherwise become the containing block
 * of this fixed overlay.
 *
 * Accessibility: a modal dialog holding an ARIA 1.2 combobox (input with
 * role="combobox" + aria-activedescendant) that controls a grouped listbox.
 * Focus stays in the input; ↑/↓ move the active option (wrapping), Enter opens
 * it, Esc closes, Tab cycles between the input and the close button (handled on
 * the document, so they work even after a stray click). The page behind is inert
 * while it is open, and the exiting layer is inert during its exit animation.
 * Focus goes back to whatever opened the palette, unless the palette navigated to
 * a new page (then App moves focus into the new <main>).
 *
 * Content is data-driven from usePortfolio(): pages, published projects and
 * posts, and only the links / email the owner actually set.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import {
  ArrowUpRight,
  Check,
  Copy,
  CornerDownLeft,
  FolderGit2,
  Github,
  Globe,
  House,
  Linkedin,
  Mail,
  NotebookPen,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';
import { readableDate, safeUrl } from '../lib/api';
import { EASE_OUT, usePrefersReducedMotion } from '../lib/motion';
import { scrollToTarget, startScroll, stopScroll } from './fx';
import type { Project } from '../types';
import './shell.css';

/* ================================================================================================
   Shared helpers (also used by SiteShell)
   ================================================================================================ */

/** True on macOS / iOS, where the palette shortcut is ⌘K instead of Ctrl K. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * True when the owner set at least one way to reach them (email, LinkedIn or GitHub).
 * Without one, every "Let's talk" / "Contact" affordance is swapped or hidden: a CTA must
 * never lead to a contact section that has nothing to click.
 */
export function useCanContact(): boolean {
  const { site } = usePortfolio();
  return Boolean(site.email || safeUrl(site.socials?.linkedin) || safeUrl(site.socials?.github));
}

const inertHolds = new Map<HTMLElement, number>();

/**
 * Makes the page regions matching `selectors` inert while an overlay covers them. Ref-counted,
 * so two overlays that briefly overlap (menu closing as the palette opens) never undo each
 * other. Returns the release function.
 */
export function holdInert(selectors: readonly string[]): () => void {
  const targets = selectors.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)));
  targets.forEach(el => {
    inertHolds.set(el, (inertHolds.get(el) ?? 0) + 1);
    el.inert = true;
  });
  return () => {
    targets.forEach(el => {
      const left = (inertHolds.get(el) ?? 1) - 1;
      if (left > 0) {
        inertHolds.set(el, left);
      } else {
        inertHolds.delete(el);
        el.inert = false;
      }
    });
  };
}

/** Copy text to the clipboard (async API first, legacy execCommand fallback). */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ================================================================================================
   Items
   ================================================================================================ */

type GroupId = 'pages' | 'projects' | 'writing' | 'links';

const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'projects', label: 'Projects' },
  { id: 'writing', label: 'Writing' },
  { id: 'links', label: 'Links' },
];

type PaletteAction =
  | { kind: 'route'; to: string }
  | { kind: 'external'; href: string }
  | { kind: 'mailto'; href: string }
  | { kind: 'copy'; value: string };

interface PaletteItem {
  id: string;
  group: GroupId;
  title: string;
  /** Extra searchable text (category, stack, tags, ...). */
  keywords: string;
  /** Right-aligned secondary text (category, date, hint). */
  meta?: string;
  icon: ReactNode;
  accent?: Project['accent'];
  action: PaletteAction;
}

const ICON_SIZE = 16;

function useItems(): PaletteItem[] {
  const { site, projects, posts } = usePortfolio();
  const canContact = useCanContact();

  return useMemo(() => {
    const items: PaletteItem[] = [
      { id: 'page-home', group: 'pages', title: 'Home', keywords: 'start index landing', meta: '/', icon: <House size={ICON_SIZE} />, action: { kind: 'route', to: '/' } },
      { id: 'page-projects', group: 'pages', title: 'Projects', keywords: 'work portfolio case studies built', meta: '/projects', icon: <FolderGit2 size={ICON_SIZE} />, action: { kind: 'route', to: '/projects' } },
      { id: 'page-about', group: 'pages', title: 'About', keywords: 'bio experience skills resume me', meta: '/about', icon: <UserRound size={ICON_SIZE} />, action: { kind: 'route', to: '/about' } },
      { id: 'page-writing', group: 'pages', title: 'Writing', keywords: 'blog posts notes journal articles', meta: '/blog', icon: <NotebookPen size={ICON_SIZE} />, action: { kind: 'route', to: '/blog' } },
    ];
    if (canContact) {
      items.push({ id: 'page-contact', group: 'pages', title: 'Contact', keywords: "get in touch let's talk hire email conversation", meta: '/#contact', icon: <Send size={ICON_SIZE} />, action: { kind: 'route', to: '/#contact' } });
    }

    projects
      .filter(project => project.status !== 'draft' && project.slug)
      .forEach(project => {
        items.push({
          id: `project-${project.slug}`,
          group: 'projects',
          title: project.title,
          keywords: [project.category, project.summary, ...(project.stack || [])].join(' '),
          meta: project.category || undefined,
          icon: <span className="palette-item__dot" />,
          accent: project.accent,
          action: { kind: 'route', to: `/projects/${project.slug}` },
        });
      });

    posts
      .filter(post => post.status !== 'draft' && post.slug)
      .forEach(post => {
        items.push({
          id: `post-${post.slug}`,
          group: 'writing',
          title: post.title,
          keywords: [post.excerpt, ...(post.tags || [])].join(' '),
          meta: readableDate(post.publishedAt),
          icon: <NotebookPen size={ICON_SIZE} />,
          action: { kind: 'route', to: `/blog/${post.slug}` },
        });
      });

    const github = safeUrl(site.socials?.github);
    const linkedin = safeUrl(site.socials?.linkedin);
    const website = safeUrl(site.socials?.website);
    if (github) items.push({ id: 'link-github', group: 'links', title: 'GitHub', keywords: 'code source repositories', meta: 'External', icon: <Github size={ICON_SIZE} />, action: { kind: 'external', href: github } });
    if (linkedin) items.push({ id: 'link-linkedin', group: 'links', title: 'LinkedIn', keywords: 'profile career network', meta: 'External', icon: <Linkedin size={ICON_SIZE} />, action: { kind: 'external', href: linkedin } });
    if (website) items.push({ id: 'link-website', group: 'links', title: 'Website', keywords: 'site homepage web', meta: 'External', icon: <Globe size={ICON_SIZE} />, action: { kind: 'external', href: website } });
    if (site.email) {
      items.push({ id: 'link-email', group: 'links', title: 'Email', keywords: `mail contact write ${site.email}`, meta: site.email, icon: <Mail size={ICON_SIZE} />, action: { kind: 'mailto', href: `mailto:${site.email}` } });
      items.push({ id: 'link-copy-email', group: 'links', title: 'Copy email', keywords: `clipboard address ${site.email}`, meta: 'Action', icon: <Copy size={ICON_SIZE} />, action: { kind: 'copy', value: site.email } });
    }
    return items;
  }, [site, projects, posts, canContact]);
}

/* ================================================================================================
   Filtering + highlighting
   ================================================================================================ */

function tokenize(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

/** null = no match. Higher is better: title prefix > title substring > keyword. */
function scoreItem(item: PaletteItem, tokens: string[]): number | null {
  if (tokens.length === 0) return 0;
  const title = item.title.toLowerCase();
  const haystack = `${title} ${item.keywords.toLowerCase()} ${(item.meta || '').toLowerCase()}`;
  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) return null;
    if (title.startsWith(token)) score += 3;
    else if (title.includes(token)) score += 2;
    else score += 1;
  }
  return score;
}

/** Wraps every query-token occurrence in the title with <mark>. */
function highlight(text: string, tokens: string[]): ReactNode {
  if (tokens.length === 0) return text;
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return text; // exotic case mapping: skip highlighting
  const marked = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    let at = lower.indexOf(token);
    while (at !== -1) {
      marked.fill(true, at, at + token.length);
      at = lower.indexOf(token, at + token.length);
    }
  }
  const parts: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marked[i] !== marked[start]) {
      const chunk = text.slice(start, i);
      parts.push(marked[start] ? <mark key={start} className="palette-mark">{chunk}</mark> : chunk);
      start = i;
    }
  }
  return parts;
}

/* ================================================================================================
   Component
   ================================================================================================ */

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TOAST_MS = 1800;

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const openRef = useRef(open);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    openRef.current = open;
    onOpenChangeRef.current = onOpenChange;
  });

  /** Element focused before opening (restored on close). */
  const openerRef = useRef<HTMLElement | null>(null);
  /** false when the palette navigated away: App then focuses the new <main>. */
  const restoreRef = useRef(true);
  const [toast, setToast] = useState<string | null>(null);

  // Global ⌘K / Ctrl+K toggle (exists only while the palette is mounted: public routes).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      onOpenChangeRef.current(!openRef.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // While open: lock page scroll and make everything behind the dialog inert (keyboard, pointer
  // and assistive tech), so a stray click can never move focus onto the page underneath.
  // (The dialog itself records the opener and focuses its input; child layout effects run first.)
  useLayoutEffect(() => {
    if (!open) return;
    restoreRef.current = true;
    stopScroll('palette');
    const release = holdInert(['#main', '.site-footer', '.site-header', '.skip-link']);
    return () => {
      release();
      startScroll('palette');
    };
  }, [open]);

  // Closed: give focus back to the opener. A passive cleanup on purpose: it runs after React's
  // commit-phase focus restore, which would otherwise put focus back on the (still mounted,
  // exiting) input and then drop it to <body> when the exit animation removes it.
  useEffect(() => {
    if (!open) return;
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (restoreRef.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  // Toast lifetime.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const close = useCallback((restore = true) => {
    restoreRef.current = restore;
    onOpenChangeRef.current(false);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open && <PaletteDialog key="palette" onClose={close} onToast={setToast} openerRef={openerRef} />}
      </AnimatePresence>
      <div className="palette-toast-region" role="status" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              className="palette-toast"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            >
              <span className="palette-toast__icon" aria-hidden="true">
                <Check size={14} strokeWidth={2.4} />
              </span>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>,
    document.body,
  );
}

/* ------------------------------------------------------------------------------------------------
   Dialog (mounted only while open, so the query resets every time)
   ------------------------------------------------------------------------------------------------ */

interface PaletteDialogProps {
  onClose: (restoreFocus?: boolean) => void;
  onToast: (message: string) => void;
  /** Receives the element that had focus when the palette opened. */
  openerRef: RefObject<HTMLElement | null>;
}

function PaletteDialog({ onClose, onToast, openerRef }: PaletteDialogProps) {
  const items = useItems();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const titleId = `${baseId}-title`;

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  /** false while the exit animation plays: the layer is inert and ignores keys. */
  const isPresent = useIsPresent();

  const tokens = useMemo(() => tokenize(query), [query]);

  /** Visible groups (in fixed order) and the flat option list used for keyboard navigation. */
  const { groups, flat } = useMemo(() => {
    const result: { id: GroupId; label: string; items: PaletteItem[] }[] = [];
    for (const group of GROUPS) {
      const matches = items
        .filter(item => item.group === group.id)
        .map((item, order) => ({ item, order, score: scoreItem(item, tokens) }))
        .filter((entry): entry is { item: PaletteItem; order: number; score: number } => entry.score !== null)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map(entry => entry.item);
      if (matches.length) result.push({ ...group, items: matches });
    }
    return { groups: result, flat: result.flatMap(group => group.items) };
  }, [items, tokens]);

  const activeIndex = flat.length ? Math.min(active, flat.length - 1) : -1;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  // Record the opener, then focus the input in the same commit, so keys typed right after
  // the click / shortcut already land in the field.
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !focused.closest('.palette-layer')) {
      openerRef.current = focused;
    }
    inputRef.current?.focus({ preventScroll: true });
  }, [openerRef]);

  // Esc closes and Tab cycles input <-> close button from anywhere, even if focus left the
  // dialog: listened on the document, like the mobile menu.
  useEffect(() => {
    if (!isPresent) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const next = document.activeElement === inputRef.current ? closeRef.current : inputRef.current;
      next?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isPresent, onClose]);

  // Keep the active option visible inside the scrolling list.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${baseId}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, baseId]);

  const run = async (item: PaletteItem) => {
    const { action } = item;
    switch (action.kind) {
      case 'route': {
        const [path, hash] = action.to.split('#');
        const target = path || '/';
        if (target === location.pathname) {
          // Same page: no route transition, so give focus back to the opener.
          onClose(true);
          if (hash) navigate(action.to);
          else scrollToTarget(0);
          return;
        }
        onClose(false);
        navigate(action.to);
        return;
      }
      case 'external':
        onClose(true);
        window.open(action.href, '_blank', 'noopener,noreferrer');
        return;
      case 'mailto':
        onClose(true);
        window.location.href = action.href;
        return;
      case 'copy': {
        const ok = await copyText(action.value);
        onClose(true);
        onToast(ok ? 'Email copied to clipboard' : 'Could not copy. Email: ' + action.value);
        return;
      }
    }
  };

  const move = (step: number) => {
    if (!flat.length) return;
    setActive(current => {
      const from = Math.min(current, flat.length - 1);
      return (from + step + flat.length) % flat.length;
    });
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        if (flat.length) setActive(flat.length - 1);
        break;
      case 'PageUp':
        event.preventDefault();
        setActive(0);
        break;
      case 'Enter':
        if (activeIndex >= 0) {
          event.preventDefault();
          void run(flat[activeIndex]);
        }
        break;
      default:
    }
  };

  /** A press on any non-interactive part of the panel keeps focus in the input. */
  const onPanelMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== inputRef.current) event.preventDefault();
  };

  const panel = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: -10 },
        animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } },
        exit: { opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.18, ease: EASE_OUT } },
      };

  let flatIndex = -1;
  const count = flat.length;

  return (
    <div className="palette-layer" inert={!isPresent}>
      <motion.div
        className="palette-backdrop"
        aria-hidden="true"
        onClick={() => onClose(true)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0.15 : 0.3, ease: EASE_OUT }}
      />
      <motion.div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={onPanelMouseDown}
        {...panel}
      >
        <h2 id={titleId} className="sr-only">Search the site</h2>

        <div className="palette-search">
          <Search className="palette-search__icon" size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette-search__input"
            type="text"
            role="combobox"
            aria-expanded={count > 0}
            aria-controls={listId}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-label="Search pages, projects and writing"
            placeholder="Search pages, projects, writing…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            data-cursor="hide"
          />
          <button ref={closeRef} type="button" className="palette-esc" onClick={() => onClose(true)} aria-label="Close search">
            esc
          </button>
        </div>

        <div className="palette-list" data-lenis-prevent>
          <div id={listId} role="listbox" aria-label="Results" hidden={count === 0}>
            {groups.map(group => {
              const labelId = `${baseId}-group-${group.id}`;
              return (
                <div key={group.id} role="group" aria-labelledby={labelId} className="palette-group">
                  <div id={labelId} role="presentation" className="palette-group__label">
                    {group.label}
                    <span className="palette-group__count">{group.items.length}</span>
                  </div>
                  {group.items.map(item => {
                    flatIndex += 1;
                    const index = flatIndex;
                    const isActive = index === activeIndex;
                    const external = item.action.kind === 'external' || item.action.kind === 'mailto';
                    return (
                      <div
                        key={item.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isActive}
                        className={`palette-item${item.accent ? ` accent--${item.accent}` : ''}`}
                        data-active={isActive ? 'true' : undefined}
                        data-cursor="link"
                        onPointerMove={() => {
                          if (!isActive) setActive(index);
                        }}
                        onClick={() => void run(item)}
                      >
                        <span className="palette-item__icon" aria-hidden="true">{item.icon}</span>
                        <span className="palette-item__title">{highlight(item.title, tokens)}</span>
                        {item.meta && <span className="palette-item__meta">{item.meta}</span>}
                        <span className="palette-item__go" aria-hidden="true">
                          {external ? <ArrowUpRight size={14} /> : <CornerDownLeft size={14} />}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {count === 0 && (
            <div className="palette-empty">
              <span className="palette-empty__icon" aria-hidden="true">
                <Search size={18} />
              </span>
              <p className="palette-empty__title">
                No results for <span className="palette-empty__query">“{query.trim()}”</span>
              </p>
              <p className="palette-empty__hint">Try a page name, a technology, or a post title.</p>
            </div>
          )}
        </div>

        <div className="palette-foot" aria-hidden="true">
          <span className="palette-foot__hint">
            <kbd className="palette-kbd">↑</kbd>
            <kbd className="palette-kbd">↓</kbd>
            navigate
          </span>
          <span className="palette-foot__hint">
            <kbd className="palette-kbd">↵</kbd>
            open
          </span>
          <span className="palette-foot__hint">
            <kbd className="palette-kbd">esc</kbd>
            close
          </span>
          <span className="palette-foot__count">
            {count} {count === 1 ? 'result' : 'results'}
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {query ? `${count} ${count === 1 ? 'result' : 'results'}` : ''}
        </p>
      </motion.div>
    </div>
  );
}
