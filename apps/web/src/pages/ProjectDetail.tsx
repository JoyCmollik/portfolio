/**
 * /projects/:slug: project case study.
 *
 *   hero        back link, kicker (index + category), RevealText title, lead, magnetic link buttons, "Built with" stack
 *   banner      wide ProjectArt "hero" (or the real image) whose frame scales up into its crop marks while scrolling
 *   body        overview copy (description split on blank lines) + sticky aside (stack, type, links)
 *   next        full-width link to the next project (wraps around) with a pointer-following art preview
 *   more        two other projects + ContactSection
 *
 * Unknown slug: a styled not-found state (a quiet loading state while content is still being fetched).
 */
import { useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useMotionValue, useScroll, useSpring, useTransform, type Variants } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, Code2, ExternalLink, Github, Layers3, Link2 } from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectArt } from '../components/ProjectArt';
import { ContactSection, SectionHeading } from '../components/SiteShell';
import { Magnetic, Reveal, RevealText, RollText, useSpotlight } from '../components/fx';
import { safeUrl } from '../lib/api';
import { useIntroDone } from '../lib/intro';
import { EASE_OUT, REVEAL_DURATION, fadeIn, useFinePointer, usePrefersReducedMotion } from '../lib/motion';
import type { Project } from '../types';
import './work.css';

const ACCENTS = new Set<Project['accent']>(['emerald', 'violet', 'blue', 'orange', 'rose']);
const accentClass = (project: Project) => `accent--${ACCENTS.has(project.accent) ? project.accent : 'emerald'}`;
const pad = (n: number) => String(n).padStart(2, '0');

/** Description paragraphs: split on blank lines (single newlines stay as line breaks). */
function paragraphsOf(text: string): string[] {
  return (text ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map(part => part.trim())
    .filter(Boolean);
}

/** Two other projects for "More to discover": skip the "next" one when there are enough. */
function morePicks(projects: Project[], index: number): { project: Project; index: number }[] {
  const total = projects.length;
  const others: { project: Project; index: number }[] = [];
  for (let step = 1; step < total; step++) {
    const i = (index + step) % total;
    others.push({ project: projects[i], index: i });
  }
  return (others.length > 2 ? others.slice(1) : others).slice(0, 2);
}

export default function ProjectDetail() {
  const { slug } = useParams();
  const { projects, loading } = usePortfolio();
  const index = projects.findIndex(p => p.slug === slug);

  if (index === -1) {
    // The first render uses demo content while the live content loads: don't flash "not found".
    if (loading) {
      return (
        <div className="route-fallback" role="status" aria-live="polite">
          <span className="route-fallback__inner label">
            <span className="dot-live" aria-hidden="true" />
            Loading project
          </span>
        </div>
      );
    }
    return <ProjectNotFound slug={slug ?? ''} projects={projects} />;
  }

  return <ProjectView key={projects[index].slug} project={projects[index]} index={index} projects={projects} />;
}

/* ================================================================================================
   Case study
   ================================================================================================ */

/** Hero copy enters after the first-visit preloader (it is visible on first paint). */
function HeroItem({ children, className, delay = 0, play }: { children: ReactNode; className?: string; delay?: number; play: boolean }) {
  const reduced = usePrefersReducedMotion();
  const variants: Variants = reduced
    ? fadeIn
    : {
        hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
        show: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: { duration: REVEAL_DURATION, ease: EASE_OUT, delay },
          // A lingering filter would make this box the containing block of fixed descendants.
          transitionEnd: { filter: 'none' },
        },
      };
  return (
    <motion.div className={className} variants={variants} initial="hidden" animate={play ? 'show' : 'hidden'}>
      {children}
    </motion.div>
  );
}

function ProjectView({ project, index, projects }: { project: Project; index: number; projects: Project[] }) {
  const introDone = useIntroDone();
  const github = safeUrl(project.links?.github);
  const demo = safeUrl(project.links?.demo);
  const hasLinks = Boolean(github || demo);
  const total = projects.length;
  const number = pad(index + 1);
  const stack = (project.stack ?? []).filter(Boolean);
  const paragraphs = paragraphsOf(project.description);
  const copy = paragraphs.length ? paragraphs : paragraphsOf(project.summary);
  const nextIndex = (index + 1) % total;
  const next = total > 1 ? projects[nextIndex] : null;
  const more = morePicks(projects, index);
  const aside = useSpotlight<HTMLDivElement>();

  return (
    <div className={`pdetail ${accentClass(project)}`}>
      <div className="pdetail-backdrop" aria-hidden="true">
        <span className="grid-bg" />
      </div>

      {/* ---------------------------------------------------------------- hero */}
      <section className="pdetail-hero container" aria-labelledby="pdetail-title">
        <HeroItem className="pdetail-hero__numeral" play={introDone} delay={0.25}>
          <span aria-hidden="true">{number}</span>
        </HeroItem>
        <HeroItem className="pdetail-hero__top" play={introDone}>
          <Link to="/projects" className="pdetail-back fx-roll-host">
            <span className="pdetail-back__icon" aria-hidden="true">
              <ArrowLeft />
            </span>
            <RollText text="All projects" />
          </Link>
          <span className="label pdetail-hero__count">
            Project <span className="pdetail-hero__count-num">{number}</span> / {pad(total)}
          </span>
        </HeroItem>

        <HeroItem play={introDone} delay={0.05}>
          <p className="kicker pdetail-kicker">
            <span className="kicker__index">{number}</span>
            <span className="kicker__line" />
            <span>{project.category}</span>
          </p>
        </HeroItem>

        <h1 id="pdetail-title" className="display-1 pdetail-title">
          <RevealText text={project.title} trigger="mount" play={introDone} delay={0.1} />
        </h1>

        <div className="pdetail-hero__row">
          {project.summary && (
            <HeroItem className="pdetail-hero__lead" play={introDone} delay={0.35}>
              <p className="lead">{project.summary}</p>
            </HeroItem>
          )}
          {hasLinks && (
            <HeroItem className="pdetail-actions" play={introDone} delay={0.45}>
              {github && (
                <Magnetic>
                  <a className="btn btn--ghost fx-roll-host" href={github} target="_blank" rel="noreferrer noopener">
                    <RollText text="View source" />
                    <span className="btn__icon" aria-hidden="true"><Github /></span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </Magnetic>
              )}
              {demo && (
                <Magnetic>
                  <a className="btn btn--primary fx-roll-host" href={demo} target="_blank" rel="noreferrer noopener">
                    <RollText text="Live experience" />
                    <span className="btn__icon" aria-hidden="true"><ArrowUpRight /></span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </Magnetic>
              )}
            </HeroItem>
          )}
        </div>

        {/* What it is built with: the real stack names (index and category already sit in the kicker). */}
        {stack.length > 0 && (
          <HeroItem className="pdetail-built" play={introDone} delay={0.5}>
            <p id="pdetail-built-label" className="label pdetail-built__label">Built with</p>
            <ul className="pdetail-built__chips" aria-labelledby="pdetail-built-label">
              {stack.map(item => (
                <li key={item} className="chip chip--mono pdetail-built__chip">{item}</li>
              ))}
            </ul>
          </HeroItem>
        )}
      </section>

      {/* ---------------------------------------------------------------- banner */}
      <ProjectBanner project={project} index={index} play={introDone} />

      {/* ---------------------------------------------------------------- overview */}
      <section className="pdetail-body section container" aria-labelledby="pdetail-overview">
        <div className="pdetail-body__main">
          <Reveal>
            <p className="kicker">
              <span className="kicker__index">01</span>
              <span className="kicker__line" />
              <span>The overview</span>
            </p>
          </Reveal>
          <h2 id="pdetail-overview" className="display-2 pdetail-h2">
            <RevealText text="Behind the" /> <RevealText text="build." className="serif-accent" delay={0.12} />
          </h2>
          {copy.length > 0 && (
            <div className="pdetail-prose">
              {copy.map((paragraph, i) => (
                <Reveal key={i} as="p" className={i === 0 ? 'pdetail-prose__first' : undefined} delay={i === 0 ? 0.1 : 0}>
                  {paragraph}
                </Reveal>
              ))}
            </div>
          )}
        </div>

        <aside className="pdetail-aside" aria-label="Project details">
          <Reveal delay={0.1}>
            <div ref={aside.ref} onPointerMove={aside.onPointerMove} className="pdetail-card fx-spotlight">
              {stack.length > 0 && (
                <div className="pdetail-card__group">
                  <h3 className="label pdetail-card__label">
                    <Layers3 aria-hidden="true" /> Technology stack
                  </h3>
                  <ul className="pdetail-card__chips">
                    {stack.map(item => (
                      <li key={item} className="chip chip--mono chip--accent">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {project.category && (
                <div className="pdetail-card__group">
                  <h3 className="label pdetail-card__label">
                    <Code2 aria-hidden="true" /> Project type
                  </h3>
                  <p className="pdetail-card__value">{project.category}</p>
                </div>
              )}
              {hasLinks && (
                <div className="pdetail-card__group">
                  <h3 className="label pdetail-card__label">
                    <Link2 aria-hidden="true" /> Links
                  </h3>
                  <ul className="pdetail-card__links">
                    {github && (
                      <li>
                        <a href={github} target="_blank" rel="noreferrer noopener" className="pdetail-card__link fx-roll-host">
                          <Github aria-hidden="true" className="pdetail-card__link-icon" />
                          <RollText text="Source code" />
                          <ArrowUpRight aria-hidden="true" className="pdetail-card__link-arrow" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </li>
                    )}
                    {demo && (
                      <li>
                        <a href={demo} target="_blank" rel="noreferrer noopener" className="pdetail-card__link fx-roll-host">
                          <ExternalLink aria-hidden="true" className="pdetail-card__link-icon" />
                          <RollText text="Live experience" />
                          <ArrowUpRight aria-hidden="true" className="pdetail-card__link-arrow" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              )}
              <div className="pdetail-card__foot">
                <span className="dot-live" aria-hidden="true" />
                <span className="label">{project.featured ? 'Featured case study' : 'Case study'} · {number}</span>
              </div>
            </div>
          </Reveal>
        </aside>
      </section>

      {/* ---------------------------------------------------------------- next */}
      {next && <NextProject project={next} index={nextIndex} total={total} />}

      {/* ---------------------------------------------------------------- more */}
      {more.length > 0 && (
        <section className="pdetail-more section" aria-label="More projects">
          <div className="container">
            <SectionHeading
              kicker="02 / KEEP EXPLORING"
              title="More to discover."
              action={{ text: 'All projects', href: '/projects' }}
            />
            <ul className="work-grid work-grid--pair">
              {more.map(({ project: other, index: otherIndex }, i) => (
                <Reveal key={other.slug} as="li" className="work-grid__item" delay={i * 0.08} amount={0.15}>
                  <ProjectCard project={other} index={otherIndex} />
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      <ContactSection />
    </div>
  );
}

/* ================================================================================================
   Banner: the frame scales up into its crop marks as it scrolls into place
   ================================================================================================ */

function ProjectBanner({ project, index, play }: { project: Project; index: number; play: boolean }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  // 0 = banner top touches the viewport bottom, ~0.5 = banner centred. Settles before the centre.
  // Only the frame scales: the art inside stays at 1 because its HUD labels sit ~20px from its
  // edges, and any inner zoom (or shift) would push them past the frame's clipped border.
  const frameScale = useTransform(scrollYProgress, [0, 0.42], [0.94, 1], { clamp: true });

  return (
    <div className="pdetail-banner container--wide" ref={ref}>
      <HeroItem className="pdetail-banner__stage" play={play} delay={0.55}>
        {/* Crop marks sit just outside the frame: the frame "settles" into them as it scales to 1. */}
        <span className="pdetail-banner__corner pdetail-banner__corner--tl" aria-hidden="true" />
        <span className="pdetail-banner__corner pdetail-banner__corner--tr" aria-hidden="true" />
        <span className="pdetail-banner__corner pdetail-banner__corner--bl" aria-hidden="true" />
        <span className="pdetail-banner__corner pdetail-banner__corner--br" aria-hidden="true" />
        <motion.div className="pdetail-banner__frame" style={reduced ? undefined : { scale: frameScale }}>
          <div className="pdetail-banner__art">
            <ProjectArt project={project} index={index} variant="hero" />
          </div>
        </motion.div>
      </HeroItem>
    </div>
  );
}

/* ================================================================================================
   Next project: huge title, art preview revealed on hover (follows a fine pointer)
   ================================================================================================ */

const PREVIEW_SPRING = { stiffness: 220, damping: 26, mass: 0.6 };

function NextProject({ project, index, total }: { project: Project; index: number; total: number }) {
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const follow = fine && !reduced;
  const linkRef = useRef<HTMLAnchorElement>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, PREVIEW_SPRING);
  const sy = useSpring(y, PREVIEW_SPRING);
  const tilt = useTransform(sx, value => Math.max(-6, Math.min(6, (value - x.get()) * -0.05)));
  // Name from the visible content ("Next project Title"); category + summary become the description.
  const describedBy = useId();

  /** Pointer position -> preview offset from its resting place (centred on the pointer, kept inside the block). */
  const place = (event: ReactPointerEvent<HTMLAnchorElement>, jump: boolean) => {
    const link = linkRef.current;
    const preview = previewRef.current;
    if (!follow || !link || !preview || event.pointerType === 'touch') return;
    const box = link.getBoundingClientRect();
    const w = preview.offsetWidth;
    const h = preview.offsetHeight;
    // Resting place (CSS): right edge area, vertically centred. Offsets are relative to it.
    const restLeft = preview.offsetLeft;
    const restTop = preview.offsetTop;
    const px = Math.min(Math.max(event.clientX - box.left - w / 2, 0), box.width - w);
    const py = Math.min(Math.max(event.clientY - box.top - h / 2, 0), box.height - h);
    const nx = px - restLeft;
    const ny = py - restTop;
    if (jump) {
      x.jump(nx);
      y.jump(ny);
      sx.jump(nx);
      sy.jump(ny);
    } else {
      x.set(nx);
      y.set(ny);
    }
  };

  return (
    <section className={`pdetail-next ${accentClass(project)}`} aria-label="Next project">
      <Link
        ref={linkRef}
        to={`/projects/${project.slug}`}
        className="pdetail-next__link art-hover-host"
        data-cursor="View"
        aria-describedby={describedBy}
        onPointerEnter={event => place(event, true)}
        onPointerMove={event => place(event, false)}
      >
        <span className="pdetail-next__grid grid-bg" aria-hidden="true" />
        <span className="container pdetail-next__inner">
          <span className="pdetail-next__top">
            <span className="label label--accent pdetail-next__label">
              <span className="pdetail-next__pulse" aria-hidden="true" /> Next project
            </span>
            <span className="label" aria-hidden="true">
              {pad(index + 1)} / {pad(total)}
            </span>
          </span>
          <span className="pdetail-next__title-row">
            <span className="pdetail-next__title">{project.title}</span>
            <span className="pdetail-next__arrow" aria-hidden="true">
              <ArrowUpRight />
            </span>
          </span>
          {/* Read as the link's description (aria-describedby), not as part of its name. */}
          <span className="pdetail-next__bottom" id={describedBy} aria-hidden="true">
            <span className="pdetail-next__category">{project.category}</span>
            {project.category && project.summary && <span className="sr-only">. </span>}
            {project.summary && <span className="pdetail-next__summary">{project.summary}</span>}
          </span>
        </span>
        <motion.span
          ref={previewRef}
          className="pdetail-next__preview"
          style={follow ? { x: sx, y: sy, rotate: tilt } : undefined}
          aria-hidden="true"
        >
          <span className="pdetail-next__preview-clip">
            <ProjectArt project={project} index={index} variant="card" />
          </span>
        </motion.span>
      </Link>
    </section>
  );
}

/* ================================================================================================
   Not found
   ================================================================================================ */

function ProjectNotFound({ slug, projects }: { slug: string; projects: Project[] }) {
  const introDone = useIntroDone();
  return (
    <section className="pdetail-404" aria-labelledby="pdetail-404-title">
      <span className="grid-bg" aria-hidden="true" />
      <span className="pdetail-404__glow" aria-hidden="true" />
      <div className="container pdetail-404__inner">
        <HeroItem play={introDone}>
          <p className="pdetail-404__terminal">
            <span className="pdetail-404__prompt" aria-hidden="true">$</span>
            <span>
              GET /projects/<span className="pdetail-404__slug">{slug}</span>
            </span>
            <span className="pdetail-404__status">404</span>
          </p>
        </HeroItem>
        <HeroItem play={introDone} delay={0.05}>
          <p className="kicker">
            <span className="kicker__index">404</span>
            <span className="kicker__line" />
            <span>Signal lost</span>
          </p>
        </HeroItem>
        <h1 id="pdetail-404-title" className="display-1 pdetail-404__title">
          <RevealText text="Project not" play={introDone} delay={0.1} />{' '}
          <RevealText text="found." className="serif-accent" play={introDone} delay={0.22} />
        </h1>
        <HeroItem play={introDone} delay={0.35}>
          <p className="lead pdetail-404__lead">
            This project doesn't exist or is no longer published. The rest of the work is one click away.
          </p>
        </HeroItem>
        <HeroItem className="pdetail-404__actions" play={introDone} delay={0.45}>
          <Magnetic>
            <Link to="/projects" className="btn btn--primary fx-roll-host">
              <span className="btn__icon" aria-hidden="true"><ArrowLeft /></span>
              <RollText text="Back to projects" />
            </Link>
          </Magnetic>
        </HeroItem>
        {projects.length > 0 && (
          <HeroItem play={introDone} delay={0.55}>
            <nav className="pdetail-404__nav" aria-label="Published projects">
              <p className="label">Or jump straight to</p>
              <ul className="pdetail-404__list">
                {projects.slice(0, 6).map(p => (
                  <li key={p.slug}>
                    <Link to={`/projects/${p.slug}`} className={`pdetail-404__chip ${accentClass(p)}`}>
                      <span className="pdetail-404__chip-dot" aria-hidden="true" />
                      {p.title}
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </HeroItem>
        )}
      </div>
    </section>
  );
}
