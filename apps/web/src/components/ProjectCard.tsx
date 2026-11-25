/**
 * ProjectCard: the work card used on /projects and in "More to discover".
 *
 *   <ProjectCard project={p} index={i} />            regular card (16/10 art on top)
 *   <ProjectCard project={p} index={0} feature />    feature card (richer "stack" art, larger title)
 *
 * - The title link is the card's single navigation target, stretched over the whole card
 *   (::after, inset 0). Source / demo icon links sit above it and stay independently clickable.
 * - Layout follows the card's OWN width (container query, work.css): any card wider than
 *   ~820px (a full-width grid slot) switches to a side-by-side layout, so a lone card in a
 *   two-column grid never looks stranded.
 * - Hover / keyboard focus: lift, accent border glow, cursor spotlight, art brightens
 *   (.art-hover-host), arrow turns, "Explore project" rolls. Reduced motion: no lift.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ExternalLink, Github } from 'lucide-react';
import type { Project } from '../types';
import { safeUrl } from '../lib/api';
import { ProjectArt } from './ProjectArt';
import { RollText, useSpotlight } from './fx';
import '../pages/work.css';

/** Stack chips shown before collapsing the rest into a "+N" chip. */
const MAX_CHIPS = 5;

const ACCENTS = new Set<Project['accent']>(['emerald', 'violet', 'blue', 'orange', 'rose']);

export interface ProjectCardProps {
  project: Project;
  /** Position of the project in the full list (drives the art glyph + "01" label). */
  index?: number;
  /** Feature treatment (first card of the unfiltered grid). */
  feature?: boolean;
}

export function ProjectCard({ project, index = 0, feature = false }: ProjectCardProps) {
  const spot = useSpotlight<HTMLElement>();
  const accent = ACCENTS.has(project.accent) ? project.accent : 'emerald';
  const github = safeUrl(project.links?.github);
  const demo = safeUrl(project.links?.demo);
  const stack = (project.stack ?? []).filter(Boolean);
  const chips = stack.slice(0, MAX_CHIPS);
  const extra = stack.length - chips.length;
  const number = String(index + 1).padStart(2, '0');

  return (
    <article
      ref={spot.ref}
      onPointerMove={spot.onPointerMove}
      className={`pcard${feature ? ' pcard--feature' : ''} accent--${accent} art-hover-host fx-spotlight fx-roll-host`}
      data-cursor="View"
    >
      <div className="pcard__inner">
        <div className="pcard__media">
          <ProjectArt project={project} index={index} variant={feature ? 'stack' : 'card'} />
        </div>

        <div className="pcard__body">
          <p className="pcard__meta">
            <span className="pcard__dot" aria-hidden="true" />
            <span className="pcard__category">{project.category}</span>
            <span className="pcard__index" aria-hidden="true">{number}</span>
          </p>

          <div className="pcard__head">
            <h3 className="display-3 pcard__title">
              <Link to={`/projects/${project.slug}`} className="pcard__link">
                {project.title}
              </Link>
            </h3>
            <span className="pcard__arrow" aria-hidden="true">
              <ArrowUpRight />
            </span>
          </div>

          {project.summary && <p className="pcard__summary">{project.summary}</p>}

          {chips.length > 0 && (
            <ul className="pcard__stack" aria-label="Technology stack">
              {chips.map(item => (
                <li key={item} className="chip chip--mono">{item}</li>
              ))}
              {extra > 0 && (
                <li className="chip chip--mono pcard__more">
                  <span aria-hidden="true">+{extra}</span>
                  <span className="sr-only">and {extra} more</span>
                </li>
              )}
            </ul>
          )}

          <div className="pcard__foot">
            <span className="pcard__cta" aria-hidden="true">
              <RollText text="Explore project" />
              <ArrowRight className="pcard__cta-icon" />
            </span>
            {(github || demo) && (
              <span className="pcard__links">
                {github && (
                  <a
                    className="pcard__icon-link"
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
                    className="pcard__icon-link"
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
      </div>
    </article>
  );
}
