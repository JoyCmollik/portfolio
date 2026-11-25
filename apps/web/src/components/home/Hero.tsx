/**
 * Home hero: the first screen of the site.
 *
 * Layers (back to front): WebGL aurora (ShaderBackdrop) -> hairline grid -> vignette -> content.
 * Content: 12-col grid, copy (cols 1-7) + arch portrait (cols 8-12), bottom meta strip.
 *
 * Motion
 * - Entrance waits for the first-visit preloader (useIntroDone): kicker scramble, masked headline words,
 *   then lead, CTAs, portrait and the floating chips.
 * - Scroll-out (desktop layout only, never with reduced motion): copy drifts up and fades, the portrait
 *   moves slower (depth), the photo itself drifts inside its frame. All motion values, no React state.
 * - Portrait: animated conic border, spring tilt (fine pointer), frosted glass chips riding on the card.
 * - Local time appears once in the hero (the chip); the bottom strip keeps location + availability.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, type Variants } from 'framer-motion';
import { ArrowRight, Clock3, Code2, MapPin } from 'lucide-react';
import { LocalTime, Magnetic, RevealText, RollText, ShaderBackdrop, TextScramble, Tilt } from '../fx';
import { usePortfolio } from '../../context/PortfolioContext';
import { safeUrl } from '../../lib/api';
import { useIntroDone } from '../../lib/intro';
import { EASE_OUT, usePrefersReducedMotion } from '../../lib/motion';
import { useMediaQuery } from './useMediaQuery';
import './hero.css';

/** Two-column hero layout (keep in sync with home.css). */
const DESKTOP_QUERY = '(min-width: 960px)';

/** Fade + rise + blur clear with a delay; reduced motion: short opacity fade. */
function rise(delay: number, reduced: boolean, y = 24): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: 0.2, delay: Math.min(delay, 0.1) } },
    };
  }
  return {
    hidden: { opacity: 0, y, filter: 'blur(6px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.9, ease: EASE_OUT, delay },
      // A lingering filter would turn this wrapper into a backdrop root (breaks the glass chips).
      transitionEnd: { filter: 'none' },
    },
  };
}

/** Portrait entrance: rises and settles from a slight zoom. */
function portraitIn(reduced: boolean): Variants {
  if (reduced) return rise(0, true);
  return {
    hidden: { opacity: 0, y: 48, scale: 0.94, filter: 'blur(10px)' },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: { duration: 1.3, ease: EASE_OUT, delay: 0.25 },
      transitionEnd: { filter: 'none' },
    },
  };
}

/** Floating chip entrance: pops in from a smaller scale. */
function chipIn(delay: number, reduced: boolean): Variants {
  if (reduced) return rise(0, true);
  return {
    hidden: { opacity: 0, scale: 0.86, y: 14 },
    show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.9, ease: EASE_OUT, delay } },
  };
}

export function Hero() {
  const { site } = usePortfolio();
  const introDone = useIntroDone();
  const reduced = usePrefersReducedMotion();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const parallax = desktop && !reduced;

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.1]);
  const visualY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const photoY = useTransform(scrollYProgress, [0, 1], ['0%', '7%']);
  const stripOpacity = useTransform(scrollYProgress, [0, 0.35], [1, 0]);

  const state = introDone ? 'show' : 'hidden';
  const initial = reduced ? false : 'hidden';
  const line1Words = site.heroLine1.trim().split(/\s+/).filter(Boolean).length;
  const line2Delay = 0.12 + line1Words * 0.06;
  const portrait = safeUrl(site.heroImage) || '/images/joy-hero.webp';
  const year = new Date().getFullYear();

  return (
    <section ref={heroRef} className="home-hero" id="top" aria-labelledby="home-hero-title">
      <ShaderBackdrop className="home-hero__shader" palette="signal" />
      <div className="grid-bg home-hero__grid" aria-hidden="true" />
      <div className="home-hero__vignette" aria-hidden="true" />

      <div className="container home-hero__layout">
        {/* ------------------------------------------------------------ copy */}
        <motion.div className="home-hero__copy" style={parallax ? { y: copyY, opacity: copyOpacity } : undefined}>
          {site.heroKicker && (
            <motion.p className="home-hero__kicker" variants={rise(0, reduced, 12)} initial={initial} animate={state}>
              <span className="dot-live" aria-hidden="true" />
              <TextScramble text={site.heroKicker} trigger="mount" play={introDone} delay={0.1} />
            </motion.p>
          )}

          <h1 className="display-hero home-hero__title" id="home-hero-title">
            <RevealText text={site.heroLine1} trigger="mount" play={introDone} delay={0.12} />
            {site.heroLine2 && (
              <>
                <br />
                <RevealText text={site.heroLine2} className="serif-accent" trigger="mount" play={introDone} delay={line2Delay} />
              </>
            )}
          </h1>

          {site.heroDescription && (
            <motion.p className="lead home-hero__lead" variants={rise(0.55, reduced)} initial={initial} animate={state}>
              {site.heroDescription}
            </motion.p>
          )}

          <motion.div className="home-hero__ctas" variants={rise(0.7, reduced)} initial={initial} animate={state}>
            <Magnetic className="home-hero__cta">
              <Link to="/projects" className="btn btn--primary btn--lg fx-roll-host">
                <RollText text="Explore my work" />
                <span className="btn__icon" aria-hidden="true"><ArrowRight /></span>
              </Link>
            </Magnetic>
            <Magnetic className="home-hero__cta">
              <Link to="/about" className="btn btn--ghost btn--lg fx-roll-host">
                <RollText text="More about me" />
                <span className="btn__icon btn__icon--rotate" aria-hidden="true"><ArrowRight /></span>
              </Link>
            </Magnetic>
          </motion.div>
        </motion.div>

        {/* ------------------------------------------------------------ portrait */}
        <motion.div className="home-hero__visual" style={parallax ? { y: visualY } : undefined}>
          <motion.div className="home-hero__stage" variants={portraitIn(reduced)} initial={initial} animate={state}>
            <div className="home-orbits" aria-hidden="true">
              <span className="home-orbits__ring home-orbits__ring--a"><i /></span>
              <span className="home-orbits__ring home-orbits__ring--b"><i /></span>
              <span className="home-orbits__ring home-orbits__ring--c"><i /></span>
            </div>
            <div className="home-portrait__aura" aria-hidden="true" />

            <Tilt className="home-portrait" max={5}>
              <div className="home-portrait__frame">
                <div className="home-portrait__photo">
                  <motion.img
                    className="home-portrait__img"
                    src={portrait}
                    alt={`Portrait of ${site.name}`}
                    width={1086}
                    height={1448}
                    fetchPriority="high"
                    decoding="async"
                    style={parallax ? { y: photoY } : undefined}
                  />
                  <span className="home-portrait__shade" aria-hidden="true" />
                </div>
              </div>

              <div className="home-chip home-chip--status">
                <motion.div variants={chipIn(1.0, reduced)} initial={initial} animate={state}>
                  <div className="home-chip__float glass">
                    <span className="dot-live" aria-hidden="true" />
                    <span className="home-chip__mono">status: <b>always building</b></span>
                  </div>
                </motion.div>
              </div>

              <div className="home-chip home-chip--role">
                <motion.div variants={chipIn(1.15, reduced)} initial={initial} animate={state}>
                  <div className="home-chip__float glass">
                    <span className="home-chip__icon" aria-hidden="true"><Code2 /></span>
                    <span className="home-chip__stack">
                      <span className="home-chip__label">What I do</span>
                      <strong className="home-chip__strong">Build things that scale.</strong>
                    </span>
                  </div>
                </motion.div>
              </div>

              <div className="home-chip home-chip--time">
                <motion.div variants={chipIn(1.3, reduced)} initial={initial} animate={state}>
                  <div className="home-chip__float glass">
                    <span className="home-chip__icon home-chip__icon--sm" aria-hidden="true"><Clock3 /></span>
                    <span className="home-chip__stack">
                      <span className="home-chip__label">Local time</span>
                      <LocalTime className="home-chip__time" withLabel />
                    </span>
                  </div>
                </motion.div>
              </div>
            </Tilt>
          </motion.div>
        </motion.div>
      </div>

      {/* ------------------------------------------------------------ bottom strip */}
      <motion.div className="home-hero__strip-wrap" style={parallax ? { opacity: stripOpacity } : undefined}>
        <motion.div className="container home-hero__strip" variants={rise(0.9, reduced, 12)} initial={initial} animate={state}>
          {site.location || site.availability ? (
            <ul className="home-hero__meta" aria-label="At a glance">
              {site.location && (
                <li className="home-hero__meta-item">
                  <MapPin aria-hidden="true" />
                  <span>{site.location}</span>
                </li>
              )}
              {site.availability && (
                <li className="home-hero__meta-item home-hero__meta-item--live">
                  <span className="dot-live" aria-hidden="true" />
                  <span>{site.availability}</span>
                </li>
              )}
            </ul>
          ) : (
            // Keeps the strip's three-column grid (cue stays centred) without an empty list.
            <span aria-hidden="true" />
          )}

          <Link to={{ hash: '#work' }} className="home-hero__cue" data-cursor="link">
            <span className="home-hero__cue-track" aria-hidden="true"><span className="home-hero__cue-dot" /></span>
            <span>Scroll to explore</span>
          </Link>

          <p className="home-hero__index">
            <span className="home-hero__index-num">01</span> / Portfolio — {year}
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
