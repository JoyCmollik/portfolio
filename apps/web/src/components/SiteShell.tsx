/**
 * Site shell: the public chrome shared by every page.
 *
 * Exports (contract, DESIGN_SPEC section 6; pages import these):
 *   Header()                     floating glass capsule + mobile menu + command palette
 *   Footer()                     columns, back-to-top, giant wordmark, bottom bar
 *   Wordmark()                   monogram tile + "joy/mollik" (derived from site.shortName)
 *   ArrowAction({ to, children }) primary pill link with letter roll + arrow
 *   SectionHeading({ kicker, title, description?, action? })
 *       kicker "01 / SELECTED WORK" -> index "01" + text. title: the last word gets the
 *       serif accent; "Line one / Line two" puts line two (accented) on its own line.
 *   PageIntro({ tag, title, sub })  page-top intro with THE page <h1>. tag "SELECTED WORK / 01".
 *   ContactSection()             closing CTA (id="contact").
 *   useCanContact()              true when an email / LinkedIn / GitHub is set. Without one,
 *       "Let's talk" becomes "Explore my work", "Contact" entries are hidden and the
 *       contact section offers ways to browse instead of an empty action slot.
 *
 * Every position: fixed overlay (mobile menu, palette, toast) is portaled to <body>,
 * because <main> and the header animate transforms.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  type Variants,
} from 'framer-motion';
import { ArrowRight, ArrowUp, ArrowUpRight, Check, Copy, Github, Globe, Linkedin, Mail, MapPin, Search } from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';
import { safeUrl } from '../lib/api';
import { useIntroDone } from '../lib/intro';
import { EASE_IN_OUT, EASE_OUT, fadeIn, fadeUp, usePrefersReducedMotion } from '../lib/motion';
import type { Site } from '../types';
import {
  LocalTime,
  Magnetic,
  Reveal,
  RevealText,
  RollText,
  ShaderBackdrop,
  TextScramble,
  scrollToTarget,
  startScroll,
  stopScroll,
} from './fx';
import { CommandPalette, copyText, holdInert, isApplePlatform, useCanContact } from './CommandPalette';
import './shell.css';

// Defined next to the palette (which needs it too) to avoid a circular import; part of this module's contract.
export { useCanContact };

/* ================================================================================================
   Shared helpers
   ================================================================================================ */

const NAV_ITEMS = [
  { to: '/projects', text: 'Projects' },
  { to: '/about', text: 'About' },
  { to: '/blog', text: 'Writing' },
] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** "01 / SELECTED WORK" or "SELECTED WORK / 01" -> { index: "01", text: "SELECTED WORK" }. */
function parseIndexed(value: string): { index: string; text: string } {
  const parts = value.split('/').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (/^\d{1,3}$/.test(first)) return { index: first, text: parts.slice(1).join(' / ') };
    if (/^\d{1,3}$/.test(last)) return { index: last, text: parts.slice(0, -1).join(' / ') };
  }
  return { index: '', text: value.trim() };
}

/**
 * Heading copy -> [lead, accent, breakLine].
 * "Ideas, shipped." -> ["Ideas,", "shipped.", false]; "Different tools. / One mindset." ->
 * ["Different tools.", "One mindset.", true]; single words stay unaccented.
 */
function splitAccent(title: string): [string, string, boolean] {
  const clean = title.trim();
  const slash = clean.split(/\s+\/\s+/);
  if (slash.length === 2 && slash[0] && slash[1]) return [slash[0], slash[1], true];
  const words = clean.split(/\s+/);
  if (words.length < 2) return [clean, '', false];
  return [words.slice(0, -1).join(' '), words[words.length - 1], false];
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

interface SocialLink {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  external: boolean;
}

/** Only the links the owner actually set (passed through safeUrl). */
function socialLinks(site: Site, iconSize = 16): SocialLink[] {
  const links: SocialLink[] = [];
  const github = safeUrl(site.socials?.github);
  const linkedin = safeUrl(site.socials?.linkedin);
  const website = safeUrl(site.socials?.website);
  if (github) links.push({ key: 'github', label: 'GitHub', href: github, icon: <Github size={iconSize} />, external: true });
  if (linkedin) links.push({ key: 'linkedin', label: 'LinkedIn', href: linkedin, icon: <Linkedin size={iconSize} />, external: true });
  if (website) links.push({ key: 'website', label: 'Website', href: website, icon: <Globe size={iconSize} />, external: true });
  if (site.email) links.push({ key: 'email', label: 'Email', href: `mailto:${site.email}`, icon: <Mail size={iconSize} />, external: false });
  return links;
}

/** Ways to keep browsing, used in place of contact actions when no contact channel is set. */
const BROWSE_ACTIONS = [
  { to: '/projects', text: 'Explore my work' },
  { to: '/about', text: 'More about me' },
  { to: '/blog', text: 'Read my writing' },
] as const;

/** The first `count` browse actions that do not point at the page you are on. */
function browseActions(pathname: string, count: number) {
  return BROWSE_ACTIONS.filter(action => action.to !== pathname).slice(0, count);
}

/** The header / menu CTA: "Let's talk" when there is a way to talk, otherwise the work. */
function primaryCta(canContact: boolean, pathname: string): { to: string; text: string } {
  return canContact ? { to: '/#contact', text: "Let's talk" } : browseActions(pathname, 1)[0];
}

/** "Sylhet, Bangladesh" -> "SYL". */
function placeCode(location: string): string {
  const first = (location || '').split(',')[0].trim();
  const letters = first.replace(/[^\p{L}]/gu, '');
  return letters.slice(0, 3).toUpperCase();
}

/** Is `to` the current route (exact) or an ancestor of it (e.g. /projects for /projects/x)? */
function matchRoute(pathname: string, to: string): 'page' | 'section' | null {
  if (pathname === to) return 'page';
  if (pathname.startsWith(`${to}/`)) return 'section';
  return null;
}

/* ================================================================================================
   Wordmark
   ================================================================================================ */

export function Wordmark() {
  const { site } = usePortfolio();
  const name = (site.shortName || site.name || 'Home').trim();
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const initial = name.charAt(0).toUpperCase();
  return (
    <Link to="/" className="wordmark" aria-label={`${name}, home`}>
      <span className="wordmark__tile" aria-hidden="true">
        {/* Painted by CSS (attr) so the visible text is exactly the name in the aria-label (WCAG 2.5.3). */}
        <span className="wordmark__initial" data-initial={initial} />
        <span className="wordmark__dot" />
      </span>
      <span className="wordmark__text" aria-hidden="true">
        {words.map((word, i) => (
          <span key={i}>
            {i > 0 && <span className="wordmark__slash">/</span>}
            {word}
          </span>
        ))}
      </span>
    </Link>
  );
}

/* ================================================================================================
   Header
   ================================================================================================ */

const HIDE_AFTER = 240;
const HIDDEN_Y = -110;

export function Header() {
  const { site } = usePortfolio();
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  const introDone = useIntroDone();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [apple] = useState(isApplePlatform);
  const cta = primaryCta(useCanContact(), location.pathname);

  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  /** Give focus back to the menu toggle when the menu closes (Esc / toggle, not navigation). */
  const restoreToggleRef = useRef(false);

  /* ---------------- hide on scroll down / show on scroll up (motion values only) ---------------- */
  const y = useMotionValue(0);
  const hiddenRef = useRef(false);
  const lockedRef = useRef(false);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const setHidden = useCallback(
    (hide: boolean) => {
      if (hiddenRef.current === hide) return;
      hiddenRef.current = hide;
      headerRef.current?.setAttribute('data-hidden', String(hide));
      animate(y, hide ? HIDDEN_Y : 0, {
        duration: reducedRef.current ? 0 : hide ? 0.45 : 0.6,
        ease: hide ? EASE_IN_OUT : EASE_OUT,
      });
    },
    [y],
  );

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', latest => {
    const header = headerRef.current;
    if (!header) return;
    const scrolled = latest > 12;
    if ((header.dataset.scrolled === 'true') !== scrolled) header.dataset.scrolled = String(scrolled);
    if (reducedRef.current || lockedRef.current || latest < HIDE_AFTER || header.contains(document.activeElement)) {
      setHidden(false);
      return;
    }
    const delta = latest - (scrollY.getPrevious() ?? latest);
    if (delta > 2) setHidden(true);
    else if (delta < -2) setHidden(false);
  });

  useEffect(() => {
    if (headerRef.current) headerRef.current.dataset.scrolled = String(window.scrollY > 12);
  }, []);

  // Never hidden while an overlay is open.
  useEffect(() => {
    lockedRef.current = menuOpen || paletteOpen;
    if (lockedRef.current) setHidden(false);
  }, [menuOpen, paletteOpen, setHidden]);

  /* ---------------- overlays ---------------- */
  // Any navigation (route or hash) closes both overlays.
  useEffect(() => {
    setMenuOpen(false);
    setPaletteOpen(false);
  }, [location.key]);

  // Menu closed: return focus to the toggle when it was dismissed (not when it navigated).
  useEffect(() => {
    if (menuOpen || !restoreToggleRef.current) return;
    restoreToggleRef.current = false;
    toggleRef.current?.focus({ preventScroll: true });
  }, [menuOpen]);

  // The menu is a mobile affordance: close it when the viewport grows past the breakpoint.
  useEffect(() => {
    if (!menuOpen) return;
    const mql = window.matchMedia('(min-width: 900px)');
    const onChange = () => {
      if (mql.matches) setMenuOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [menuOpen]);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    restoreToggleRef.current = restoreFocus;
    setMenuOpen(false);
  }, []);

  const onPaletteChange = useCallback((open: boolean) => {
    if (open) setMenuOpen(false);
    setPaletteOpen(open);
  }, []);

  const code = placeCode(site.location);
  const shortcut = apple ? '⌘K' : 'Ctrl K';

  return (
    <>
      <motion.header
        ref={headerRef}
        className="site-header"
        data-menu={menuOpen ? 'true' : 'false'}
        data-ready={introDone ? 'true' : 'false'}
        style={{ y }}
        onFocus={() => setHidden(false)}
      >
        <div className="site-header__bar">
          <div className="site-header__start">
            <Wordmark />
          </div>

          <DesktopNav pathname={location.pathname} reduced={reduced} />

          <div className="site-header__end">
            <span className="site-header__time">
              {code && (
                <span className="site-header__time-code" aria-hidden="true">
                  {code}
                </span>
              )}
              <span className="sr-only">Local time{site.location ? ` in ${site.location}` : ''}: </span>
              <LocalTime />
            </span>

            <button
              type="button"
              className="site-header__search"
              onClick={() => onPaletteChange(true)}
              aria-haspopup="dialog"
              aria-expanded={paletteOpen}
              aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'}
            >
              <Search size={15} aria-hidden="true" />
              {/* Name = "Search the site" + the visible shortcut, so it contains the visible label. */}
              <span className="sr-only">Search the site</span>
              <kbd className="site-header__kbd">{shortcut}</kbd>
            </button>

            <Magnetic className="site-header__talk" strength={0.28}>
              <Link to={cta.to} className="btn btn--primary btn--sm fx-roll-host">
                <RollText text={cta.text} />
                <span className="btn__icon btn__icon--rotate" aria-hidden="true">
                  <ArrowRight />
                </span>
              </Link>
            </Magnetic>

            <button
              ref={toggleRef}
              type="button"
              className="site-header__toggle"
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              onClick={() => {
                if (menuOpen) closeMenu(true);
                else setMenuOpen(true);
              }}
            >
              <span className="site-header__toggle-line" />
              <span className="site-header__toggle-line" />
            </button>
          </div>
        </div>
      </motion.header>

      <MobileMenu open={menuOpen} onClose={closeMenu} toggleRef={toggleRef} pathname={location.pathname} cta={cta} />
      <CommandPalette open={paletteOpen} onOpenChange={onPaletteChange} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
   Desktop nav with a sliding pill (shared layoutId): follows the hovered link, rests on the
   active route.
   ------------------------------------------------------------------------------------------------ */

function DesktopNav({ pathname, reduced }: { pathname: string; reduced: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const active = NAV_ITEMS.find(item => matchRoute(pathname, item.to))?.to ?? null;
  const pillAt = hovered ?? active;

  return (
    <nav className="site-nav" aria-label="Main">
      <LayoutGroup id="site-nav">
        <ul className="site-nav__list" onPointerLeave={() => setHovered(null)}>
          {NAV_ITEMS.map(item => {
            const match = matchRoute(pathname, item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="site-nav__link"
                  data-active={match ? 'true' : undefined}
                  aria-current={match === 'page' ? 'page' : match === 'section' ? 'true' : undefined}
                  onPointerEnter={() => setHovered(item.to)}
                  onFocus={() => setHovered(item.to)}
                  onBlur={() => setHovered(null)}
                >
                  {pillAt === item.to && (
                    <motion.span
                      layoutId="site-nav-pill"
                      className="site-nav__pill"
                      data-resting={hovered ? undefined : 'true'}
                      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
                    />
                  )}
                  <span className="site-nav__text">{item.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
    </nav>
  );
}

/* ------------------------------------------------------------------------------------------------
   Mobile menu: full-screen overlay (portal), focus trapped between the header toggle and the
   menu, background made inert, scroll locked.
   ------------------------------------------------------------------------------------------------ */

interface MobileMenuProps {
  open: boolean;
  onClose: (restoreFocus: boolean) => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  pathname: string;
  cta: { to: string; text: string };
}

function MobileMenu({ open, onClose, toggleRef, pathname, cta }: MobileMenuProps) {
  const { site } = usePortfolio();
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    stopScroll('mobile-menu');
    // Background is unreachable for keyboard + assistive tech while the menu covers it.
    const releaseInert = holdInert(['#main', '.site-footer']);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      const toggle = toggleRef.current;
      if (!panel || !toggle) return;
      const list = [toggle, ...Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))];
      const current = list.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      const next = event.shiftKey
        ? current <= 0
          ? list.length - 1
          : current - 1
        : current === -1 || current === list.length - 1
          ? 0
          : current + 1;
      list[next]?.focus();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      startScroll('mobile-menu');
      releaseInert();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, toggleRef]);

  const socials = socialLinks(site, 18);

  const overlay: Variants = reduced
    ? {
        closed: { opacity: 0, transition: { duration: 0.15 } },
        open: { opacity: 1, transition: { duration: 0.2 } },
      }
    : {
        closed: {
          clipPath: 'inset(0% 0% 100% 0% round 0px 0px 48px 48px)',
          transition: { duration: 0.55, ease: EASE_IN_OUT, when: 'afterChildren', staggerChildren: 0.03, staggerDirection: -1 },
        },
        open: {
          clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0px 0px)',
          transition: { duration: 0.7, ease: EASE_IN_OUT, delayChildren: 0.22, staggerChildren: 0.07 },
        },
      };
  const rise: Variants = reduced
    ? { closed: { opacity: 1 }, open: { opacity: 1 } }
    : {
        closed: { y: '110%', transition: { duration: 0.3, ease: EASE_IN_OUT } },
        open: { y: '0%', transition: { duration: 0.9, ease: EASE_OUT } },
      };
  const fade: Variants = reduced
    ? { closed: { opacity: 1 }, open: { opacity: 1 } }
    : {
        closed: { opacity: 0, y: 12, transition: { duration: 0.2 } },
        open: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
      };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="site-menu"
          ref={panelRef}
          id="site-menu"
          className="site-menu"
          // A non-modal dialog on purpose: its close control is the header toggle, which sits
          // outside it and must stay reachable (aria-modal would hide it from screen readers).
          role="dialog"
          aria-label="Site menu"
          initial="closed"
          animate="open"
          exit="closed"
          variants={overlay}
          data-lenis-prevent
        >
          <div className="site-menu__bg" aria-hidden="true">
            <div className="grid-bg" />
            <div className="site-menu__glow" />
          </div>

          <nav className="site-menu__inner" aria-label="Menu">
            <motion.p className="label site-menu__eyebrow" variants={fade}>
              Navigate
            </motion.p>
            <ol className="site-menu__list">
              {NAV_ITEMS.map((item, i) => {
                const match = matchRoute(pathname, item.to);
                return (
                  <li key={item.to} className="site-menu__item">
                    <Link
                      to={item.to}
                      className="site-menu__link"
                      data-active={match ? 'true' : undefined}
                      aria-current={match === 'page' ? 'page' : match === 'section' ? 'true' : undefined}
                      onClick={() => onClose(match === 'page')}
                    >
                      <motion.span className="site-menu__row" variants={rise}>
                        <span className="site-menu__index">{String(i + 1).padStart(2, '0')}</span>
                        <span className="site-menu__text">{item.text}</span>
                        <ArrowUpRight className="site-menu__arrow" aria-hidden="true" />
                      </motion.span>
                    </Link>
                  </li>
                );
              })}
            </ol>

            <motion.div className="site-menu__cta" variants={fade}>
              <Link
                to={cta.to}
                className="btn btn--primary btn--lg fx-roll-host"
                onClick={() => onClose(cta.to.split('#')[0] === pathname)}
              >
                <RollText text={cta.text} />
                <span className="btn__icon btn__icon--rotate" aria-hidden="true">
                  <ArrowRight />
                </span>
              </Link>
            </motion.div>

            <motion.div className="site-menu__foot" variants={fade}>
              {socials.length > 0 && (
                <ul className="site-menu__socials" aria-label="Elsewhere">
                  {socials.map(link => (
                    <li key={link.key}>
                      <a
                        href={link.href}
                        className="site-menu__social"
                        aria-label={link.label}
                        {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                      >
                        {link.icon}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="label site-menu__meta">
                {site.location && (
                  <>
                    <MapPin size={12} aria-hidden="true" />
                    <span>{site.location}</span>
                    <span className="site-menu__sep" aria-hidden="true">·</span>
                  </>
                )}
                <LocalTime withLabel />
              </p>
            </motion.div>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ================================================================================================
   Footer
   ================================================================================================ */

export function Footer() {
  const { site } = usePortfolio();
  const canContact = useCanContact();
  const socials = socialLinks(site);
  const year = new Date().getFullYear();
  const name = site.shortName || site.name;

  return (
    <footer className="site-footer">
      <div className="site-footer__glow" aria-hidden="true" />
      <div className="container site-footer__top">
        <div className="site-footer__intro">
          <p className="site-footer__tagline">
            Thoughtfully engineered.
            <br />
            <span className="serif-accent">Built to last.</span>
          </p>
          <Magnetic className="site-footer__top-btn" strength={0.4}>
            <button
              type="button"
              className="site-footer__back"
              onClick={() => {
                scrollToTarget(0);
                // Move the focus start point up with the page, so the next Tab doesn't jump back down here.
                document.getElementById('main')?.focus({ preventScroll: true });
              }}
              aria-label="Back to top"
            >
              <ArrowUp size={20} aria-hidden="true" />
            </button>
          </Magnetic>
        </div>

        <div className="site-footer__cols">
          <nav className="site-footer__col" aria-label="Footer">
            <p className="label site-footer__heading">Navigate</p>
            <ul className="site-footer__links">
              <li>
                <Link to="/" className="site-footer__link fx-roll-host">
                  <RollText text="Home" />
                </Link>
              </li>
              {NAV_ITEMS.map(item => (
                <li key={item.to}>
                  <Link to={item.to} className="site-footer__link fx-roll-host">
                    <RollText text={item.text} />
                  </Link>
                </li>
              ))}
              {canContact && (
                <li>
                  <Link to="/#contact" className="site-footer__link fx-roll-host">
                    <RollText text="Contact" />
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          {socials.length > 0 && (
            <div className="site-footer__col">
              <p className="label site-footer__heading" id="site-footer-elsewhere">
                Elsewhere
              </p>
              <ul className="site-footer__links" aria-labelledby="site-footer-elsewhere">
                {socials.map(link => (
                  <li key={link.key}>
                    <a
                      href={link.href}
                      className="site-footer__link fx-roll-host"
                      {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    >
                      <RollText text={link.label} />
                      <ArrowUpRight className="site-footer__ext" size={14} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="site-footer__col">
            <p className="label site-footer__heading">Local time</p>
            <p className="site-footer__clock">
              <LocalTime withLabel />
            </p>
            {site.location && (
              <p className="site-footer__place">
                <MapPin size={14} aria-hidden="true" />
                {site.location}
              </p>
            )}
          </div>
        </div>
      </div>

      {name && <GiantWordmark text={name} />}

      <div className="container site-footer__bottom">
        <p className="site-footer__legal">
          <span>
            © {year} {name}
          </span>
          <span className="site-footer__dot" aria-hidden="true" />
          <span>Crafted with intention</span>
        </p>
        <Link to="/admin" className="site-footer__admin">
          Admin
          <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </footer>
  );
}

/** The name, fitted to the full content width, revealed with a masked slide-up. Decorative. */
function GiantWordmark({ text }: { text: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(hostRef, { once: true, amount: 0.3 });

  // Fit: measure the text at 100px and scale the font so it spans the host exactly.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const measure = measureRef.current;
    if (!host || !measure) return;
    const fit = () => {
      const available = host.clientWidth;
      const natural = measure.getBoundingClientRect().width;
      if (available > 0 && natural > 0) host.style.setProperty('--giant-size', `${(available / natural) * 100}px`);
    };
    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(host);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) fit();
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [text]);

  return (
    <div ref={hostRef} className="site-giant" aria-hidden="true" data-shown={inView ? 'true' : 'false'}>
      <span ref={measureRef} className="site-giant__measure">
        {text}
      </span>
      <span className="site-giant__mask">
        <span className="site-giant__text">{text}</span>
      </span>
    </div>
  );
}

/* ================================================================================================
   SectionHeading
   ================================================================================================ */

export function SectionHeading({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description?: string;
  action?: { text: string; href: string };
}) {
  const { index, text } = parseIndexed(kicker);
  const [lead, accent, breakLine] = splitAccent(title);
  const external = action ? /^https?:\/\//i.test(action.href) : false;
  const actionHref = action ? (external ? safeUrl(action.href) : action.href) : '';

  const actionInner = action ? (
    <>
      <RollText text={action.text} />
      <span className="section-head__action-icon" aria-hidden="true">
        <ArrowUpRight size={16} />
      </span>
    </>
  ) : null;

  return (
    <div className={`section-head${action && actionHref ? ' section-head--with-action' : ''}`}>
      <div className="section-head__main">
        <p className="kicker section-head__kicker">
          {index && <span className="kicker__index">{index}</span>}
          <span className="kicker__line" />
          <TextScramble text={text} />
        </p>
        <h2 className="display-2 section-head__title">
          <RevealText text={lead} />
          {accent && (breakLine ? <br /> : ' ')}
          {accent && <RevealText text={accent} className="serif-accent" delay={wordCount(lead) * 0.06 + 0.04} />}
        </h2>
        {description && (
          <Reveal as="p" className="lead section-head__desc" delay={0.15}>
            {description}
          </Reveal>
        )}
      </div>
      {action && actionHref && (
        <Reveal className="section-head__aside" delay={0.25}>
          {external ? (
            <a href={actionHref} className="section-head__action fx-roll-host" target="_blank" rel="noreferrer">
              {actionInner}
            </a>
          ) : (
            <Link to={actionHref} className="section-head__action fx-roll-host">
              {actionInner}
            </Link>
          )}
        </Reveal>
      )}
    </div>
  );
}

/* ================================================================================================
   PageIntro
   ================================================================================================ */

export function PageIntro({ tag, title, sub }: { tag: string; title: string; sub: string }) {
  const introDone = useIntroDone();
  const reduced = usePrefersReducedMotion();
  const { index, text } = parseIndexed(tag);
  const [lead, accent, breakLine] = splitAccent(title);
  const accentDelay = 0.12 + wordCount(lead) * 0.06;
  const subVariants: Variants = reduced
    ? fadeIn
    : {
        hidden: fadeUp.hidden,
        // transitionEnd clears the filter: a lingering blur(0px) would disable backdrop-filter on glass descendants.
        show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE_OUT, delay: accentDelay + 0.2 }, transitionEnd: { filter: 'none' } },
      };

  return (
    <header className="intro-section">
      <div className="intro-bg" aria-hidden="true">
        <ShaderBackdrop palette="signal" intensity={0.6} />
        <div className="grid-bg intro-grid" />
        <div className="intro-glow" />
      </div>

      <div className="container intro-inner">
        <p className="kicker intro-kicker">
          {index && <span className="kicker__index">{index}</span>}
          <span className="kicker__line" />
          <TextScramble text={text} trigger="mount" play={introDone} />
        </p>

        <h1 className="display-1 intro-title">
          <RevealText text={lead} trigger="mount" play={introDone} delay={0.08} />
          {accent && (breakLine ? <br /> : ' ')}
          {accent && <RevealText text={accent} className="serif-accent" trigger="mount" play={introDone} delay={accentDelay} />}
        </h1>

        {sub && (
          <motion.p
            className="lead intro-sub"
            variants={subVariants}
            initial="hidden"
            animate={introDone ? 'show' : 'hidden'}
          >
            {sub}
          </motion.p>
        )}

        <motion.div
          className="intro-foot"
          initial={{ opacity: 0 }}
          animate={{ opacity: introDone ? 1 : 0 }}
          transition={{ duration: reduced ? 0.2 : 0.9, delay: reduced ? 0 : accentDelay + 0.35, ease: EASE_OUT }}
        >
          <span className="intro-cue" aria-hidden="true">
            <span className="intro-cue__track">
              <span className="intro-cue__bead" />
            </span>
            <span className="label">Scroll</span>
          </span>
        </motion.div>
      </div>
    </header>
  );
}

/* ================================================================================================
   ContactSection
   ================================================================================================ */

export function ContactSection() {
  const { site } = usePortfolio();
  const { pathname } = useLocation();
  const canContact = useCanContact();
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const github = safeUrl(site.socials?.github);
  const linkedin = safeUrl(site.socials?.linkedin);

  useEffect(() => {
    if (copied === 'idle') return;
    const id = window.setTimeout(() => setCopied('idle'), 2200);
    return () => window.clearTimeout(id);
  }, [copied]);

  const onCopy = async () => {
    const ok = await copyText(site.email);
    setCopied(ok ? 'copied' : 'failed');
  };

  let actions: ReactNode;
  if (site.email) {
    actions = (
      <>
        <Magnetic strength={0.3}>
          <a
            className="btn btn--primary btn--lg fx-roll-host"
            href={`mailto:${site.email}?subject=Let's%20build%20something`}
          >
            <RollText text="Start a conversation" />
            <span className="btn__icon btn__icon--rotate" aria-hidden="true">
              <ArrowRight />
            </span>
          </a>
        </Magnetic>
        <button
          type="button"
          className="btn btn--ghost btn--lg contact-copy"
          onClick={onCopy}
          data-state={copied}
        >
          <span className="contact-copy__icon" aria-hidden="true">
            {copied === 'copied' ? <Check size={16} /> : <Copy size={16} />}
          </span>
          {copied === 'copied' ? 'Copied' : 'Copy email'}
        </button>
      </>
    );
  } else if (linkedin || github) {
    actions = (
      <>
        {linkedin && (
          <Magnetic strength={0.3}>
            <a className="btn btn--primary btn--lg fx-roll-host" href={linkedin} target="_blank" rel="noreferrer">
              <RollText text="Message me on LinkedIn" />
              <span className="btn__icon btn__icon--rotate" aria-hidden="true">
                <ArrowRight />
              </span>
            </a>
          </Magnetic>
        )}
        {github && (
          <a
            className={`btn ${linkedin ? 'btn--ghost' : 'btn--primary'} btn--lg fx-roll-host`}
            href={github}
            target="_blank"
            rel="noreferrer"
          >
            <Github size={18} aria-hidden="true" />
            <RollText text="Find me on GitHub" />
          </a>
        )}
      </>
    );
  } else {
    // No contact channel yet: never an empty slot or a dead promise; keep the visitor browsing.
    const [primary, secondary] = browseActions(pathname, 2);
    actions = (
      <>
        <Magnetic strength={0.3}>
          <Link className="btn btn--primary btn--lg fx-roll-host" to={primary.to}>
            <RollText text={primary.text} />
            <span className="btn__icon" aria-hidden="true">
              <ArrowRight />
            </span>
          </Link>
        </Magnetic>
        <Link className="btn btn--ghost btn--lg fx-roll-host" to={secondary.to}>
          <RollText text={secondary.text} />
        </Link>
      </>
    );
  }

  return (
    <section id="contact" className="contact-section" aria-labelledby="contact-title">
      <div className="container">
        <div className="contact-panel">
          <div className="contact-bg" aria-hidden="true">
            <ShaderBackdrop palette="warm" intensity={1} />
            <div className="grid-bg contact-grid" />
            <div className="contact-vignette" />
          </div>

          <div className="contact-inner">
            {site.availability && (
              <Reveal as="p" className="chip contact-chip">
                <span className="dot-live" aria-hidden="true" />
                {site.availability}
              </Reveal>
            )}

            <h2 id="contact-title" className="display-1 contact-title">
              <RevealText text="Have something" />
              <br />
              <RevealText text="worth building?" className="serif-accent" delay={0.16} />
            </h2>

            <Reveal as="p" className="lead contact-text" delay={0.15}>
              I'm always interested in ambitious ideas, thoughtful teams, and opportunities to solve meaningful problems.
            </Reveal>

            <Reveal className="contact-actions" delay={0.25}>
              {actions}
            </Reveal>
            {!canContact && import.meta.env.DEV && (
              <p className="contact-hint">Add your public email in the dashboard to enable contact</p>
            )}

            <span className="sr-only" aria-live="polite">
              {copied === 'copied' ? 'Email address copied to clipboard' : copied === 'failed' ? `Copy failed. The email is ${site.email}` : ''}
            </span>

            {site.location && (
              <Reveal as="p" className="contact-meta label" delay={0.3}>
                <MapPin size={13} aria-hidden="true" />
                <span>{site.location}</span>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================================================
   ArrowAction
   ================================================================================================ */

export function ArrowAction({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="btn btn--primary fx-roll-host" to={to}>
      {typeof children === 'string' ? <RollText text={children} /> : children}
      <span className="btn__icon" aria-hidden="true">
        <ArrowRight />
      </span>
    </Link>
  );
}
