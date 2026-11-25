/**
 * Selected work: featured projects (max 4; fallback: the first 3).
 *
 * Two presentations of the same card (WorkCard):
 * - Sticky stack (wide + tall viewport, motion allowed): every card is `position: sticky` a little lower
 *   than the previous one, so the cards pile up like file tabs. While the NEXT card travels over a card,
 *   that card scales toward .92 and dims. Driven by useScroll on the next card's wrapper + useTransform:
 *   pure motion values, no React state per frame.
 * - List (phones / tablets / reduced motion): normal vertical cards that reveal once.
 *
 * Card: art-hover-host + fx-spotlight + accent scope. The title link is stretched over the whole card;
 * source / demo icon links sit above it and stay independently clickable.
 */
import { createRef, useMemo, type CSSProperties, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ExternalLink, FolderOpen, Github } from 'lucide-react';
import { SectionHeading } from '../SiteShell';
import { ProjectArt } from '../ProjectArt';
import { Reveal, RollText, useSpotlight } from '../fx';
import { usePortfolio } from '../../context/PortfolioContext';
import { safeUrl } from '../../lib/api';
import { usePrefersReducedMotion } from '../../lib/motion';
import type { Project } from '../../types';
import { STACK_QUERY, useMediaQuery } from './useMediaQuery';
import './work-stack.css';

/** Sticky offset of the first card (header clearance) and the extra offset per card (px). */
const STACK_TOP = 104;
const STACK_STEP = 30;
/** Scale a card settles at once the next card covers it. */
const COVERED_SCALE = 0.92;

const ACCENTS = new Set<Project['accent']>(['emerald', 'violet', 'blue', 'orange', 'rose']);
const MAX_CHIPS = 5;
const pad = (n: number) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------------------------------------
   Card
   ------------------------------------------------------------------------------------------------ */
function WorkCard({ project, index }: { project: Project; index: number }) {
  const spot = useSpotlight<HTMLElement>();
  const accent = ACCENTS.has(project.accent) ? project.accent : 'emerald';
  const github = safeUrl(project.links?.github);
  const demo = safeUrl(project.links?.demo);
  const stack = (project.stack ?? []).filter(Boolean);
  const chips = stack.slice(0, MAX_CHIPS);
  const extra = stack.length - chips.length;
  const number = pad(index + 1);
  const href = `/projects/${project.slug}`;

  return (
    <article
      ref={spot.ref}
      onPointerMove={spot.onPointerMove}
      className={`home-pcard accent--${accent} art-hover-host fx-spotlight fx-roll-host`}
      data-cursor="View"
    >
      <div className="home-pcard__bar" aria-hidden="true">
        <span className="home-pcard__tab">
          <span className="home-pcard__dot" />
          <span>{number}</span>
          <span className="home-pcard__slash">/</span>
          <span className="home-pcard__tab-title">{project.title}</span>
        </span>
        <span className="home-pcard__path">{href}</span>
      </div>

      <div className="home-pcard__body">
        <div className="home-pcard__info">
          <div className="home-pcard__top">
            <span className="home-pcard__index" aria-hidden="true">{number}</span>
            {project.category && <p className="home-pcard__category">{project.category}</p>}
          </div>

          <h3 className="display-2 home-pcard__title">
            <Link to={href} className="home-pcard__link">
              {project.title}
            </Link>
          </h3>

          {project.summary && <p className="home-pcard__summary">{project.summary}</p>}

          {chips.length > 0 && (
            <ul className="home-pcard__chips" aria-label="Technology stack">
              {chips.map(item => (
                <li key={item} className="chip chip--mono">{item}</li>
              ))}
              {extra > 0 && (
                <li className="chip chip--mono">
                  <span aria-hidden="true">+{extra}</span>
                  <span className="sr-only">and {extra} more</span>
                </li>
              )}
            </ul>
          )}

          <div className="home-pcard__foot">
            <span className="home-pcard__cta" aria-hidden="true">
              <RollText text="Explore project" />
              <span className="home-pcard__cta-icon"><ArrowRight /></span>
            </span>
            {(github || demo) && (
              <span className="home-pcard__links">
                {github && (
                  <a
                    className="home-pcard__icon-link"
                    href={github}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${project.title}: source code (opens in a new tab)`}
                    data-cursor="link"
                  >
                    <Github aria-hidden="true" />
                  </a>
                )}
                {demo && (
                  <a
                    className="home-pcard__icon-link"
                    href={demo}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${project.title}: live demo (opens in a new tab)`}
                    data-cursor="link"
                  >
                    <ExternalLink aria-hidden="true" />
                  </a>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="home-pcard__media">
          <ProjectArt project={project} index={index} variant="stack" />
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------------------------------------
   Sticky stack
   ------------------------------------------------------------------------------------------------ */
function StackItem({
  project,
  index,
  selfRef,
  nextRef,
  last,
}: {
  project: Project;
  index: number;
  selfRef: RefObject<HTMLLIElement | null>;
  nextRef: RefObject<HTMLLIElement | null>;
  last: boolean;
}) {
  // Progress of the NEXT card travelling from the bottom of the viewport to its own sticky top.
  const nextTop = STACK_TOP + (index + 1) * STACK_STEP;
  const { scrollYProgress } = useScroll({ target: nextRef, offset: ['start end', `start ${nextTop}px`] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, last ? 1 : COVERED_SCALE]);
  const dim = useTransform(scrollYProgress, [0.15, 1], [0, last ? 0 : 0.62]);

  return (
    <li ref={selfRef} className="home-stack__item" style={{ top: STACK_TOP + index * STACK_STEP }}>
      <motion.div className="home-stack__scale" style={{ scale }}>
        <WorkCard project={project} index={index} />
        <motion.div className="home-stack__dim" style={{ opacity: dim }} aria-hidden="true" />
      </motion.div>
    </li>
  );
}

function StickyStack({ items }: { items: Project[] }) {
  const refs = useMemo(() => items.map(() => createRef<HTMLLIElement>()), [items]);
  return (
    <ol
      className="home-stack home-stack--sticky"
      style={{ '--stack-n': items.length, '--stack-top': `${STACK_TOP}px`, '--stack-step': `${STACK_STEP}px` } as CSSProperties}
    >
      {items.map((project, i) => {
        const last = i === items.length - 1;
        return (
          <StackItem
            key={project.slug || i}
            project={project}
            index={i}
            selfRef={refs[i]}
            nextRef={last ? refs[i] : refs[i + 1]}
            last={last}
          />
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------------------------------------
   Section
   ------------------------------------------------------------------------------------------------ */
export function WorkStack() {
  const { projects } = usePortfolio();
  const reduced = usePrefersReducedMotion();
  const wide = useMediaQuery(STACK_QUERY);

  const items = useMemo(() => {
    const featured = projects.filter(p => p.featured).slice(0, 4);
    return featured.length ? featured : projects.slice(0, 3);
  }, [projects]);
  const sticky = wide && !reduced && items.length > 1;

  return (
    <section className="home-work section" id="work">
      <div className="container">
        <SectionHeading
          kicker="01 / SELECTED WORK"
          title="Ideas, shipped."
          description="Some of the systems, products, and experiences I've helped bring to life."
          action={{ text: 'All projects', href: '/projects' }}
        />

        {items.length === 0 ? (
          <Reveal className="home-empty">
            <FolderOpen aria-hidden="true" />
            <p className="home-empty__title">Projects are on their way.</p>
            <p className="home-empty__text">Case studies will appear here once they are published.</p>
          </Reveal>
        ) : sticky ? (
          <StickyStack items={items} />
        ) : (
          <ol className="home-stack home-stack--list">
            {items.map((project, i) => (
              <Reveal as="li" key={project.slug || i} className="home-stack__item" amount={0.15}>
                <WorkCard project={project} index={i} />
              </Reveal>
            ))}
          </ol>
        )}

        {projects.length > 0 && (
          <Reveal className="home-work__end">
            <Link to="/projects" className="home-work__archive fx-roll-host" data-cursor="link">
              <span className="home-work__archive-label">
                <RollText text="See the full project archive" />
              </span>
              <span className="home-work__archive-count" aria-hidden="true">
                {pad(projects.length)} {projects.length === 1 ? 'project' : 'projects'}
              </span>
              <span className="home-work__archive-icon" aria-hidden="true">
                <ArrowUpRight />
              </span>
            </Link>
          </Reveal>
        )}
      </div>
    </section>
  );
}
