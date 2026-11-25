/**
 * /projects: every published project, filterable by primary category.
 *
 * - Categories are derived from the data as before: the part of `category` before " / "
 *   ("FINTECH / BACKEND" -> "FINTECH"), each with its project count.
 * - Filter pills are plain toggle buttons (aria-pressed) with a sliding layoutId indicator.
 * - Grid: two columns on desktop. With "All" and >= 3 projects the first card is a full-width
 *   feature; an odd card left alone on the last row also spans the full width (the card's
 *   container query turns it into the wide layout). Filter changes animate with
 *   LayoutGroup + AnimatePresence (popLayout); reduced motion gets a short fade only.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, type Variants } from 'framer-motion';
import { FolderKanban, RotateCcw } from 'lucide-react';
import { PageIntro, ContactSection } from '../components/SiteShell';
import { ProjectCard } from '../components/ProjectCard';
import { usePortfolio } from '../context/PortfolioContext';
import { EASE_OUT, usePrefersReducedMotion } from '../lib/motion';
import type { Project } from '../types';
import './work.css';

const ALL = 'All';

/** Primary category label used by the filters (never empty: an empty pill is a bug). */
function primaryCategory(project: Project): string {
  return (project.category ?? '').split(' / ')[0].trim() || 'Other';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Grid item motion: fade / rise / blur clear on first view, soft scale-out on filter exit. */
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 32, filter: 'blur(6px)' },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.8, ease: EASE_OUT, delay: (i % 2) * 0.08 },
    transitionEnd: { filter: 'none' },
  }),
  exit: { opacity: 0, scale: 0.96, filter: 'blur(4px)', transition: { duration: 0.3, ease: EASE_OUT } },
};

const reducedItemVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

const PILL_SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 } as const;
const LAYOUT_TRANSITION = { duration: 0.6, ease: EASE_OUT };

export default function Projects() {
  const { projects } = usePortfolio();
  const reduced = usePrefersReducedMotion();
  const [filter, setFilter] = useState(ALL);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      const label = primaryCategory(project);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [{ label: ALL, count: projects.length }, ...Array.from(counts, ([label, count]) => ({ label, count }))];
  }, [projects]);

  // A filter can disappear when the live content replaces the demo content: fall back to All.
  const active = groups.some(group => group.label === filter) ? filter : ALL;

  const entries = useMemo(
    () =>
      projects
        .map((project, index) => ({ project, index }))
        .filter(entry => active === ALL || primaryCategory(entry.project) === active),
    [projects, active],
  );

  const hasFeature = active === ALL && entries.length >= 3;
  const restCount = entries.length - (hasFeature ? 1 : 0);
  const lastIsWide = restCount % 2 === 1;
  const variants = reduced ? reducedItemVariants : itemVariants;

  return (
    <>
      <PageIntro
        tag="SELECTED WORK / 01"
        title="Things I've built."
        sub="A collection of systems, experiments, and products — from first sketch to production."
      />

      <section className="work-list container" aria-labelledby="work-list-title">
        <h2 id="work-list-title" className="sr-only">Project list</h2>

        {projects.length > 0 && (
          <div className="work-toolbar">
            <LayoutGroup id="work-filters">
              <div className="work-filters" role="group" aria-label="Filter projects by category">
                {groups.map(group => {
                  const selected = group.label === active;
                  return (
                    <button
                      key={group.label}
                      type="button"
                      className="work-filter"
                      aria-pressed={selected}
                      onClick={() => setFilter(group.label)}
                    >
                      {selected && (
                        <motion.span
                          layoutId="work-filter-indicator"
                          className="work-filter__indicator"
                          transition={reduced ? { duration: 0 } : PILL_SPRING}
                          aria-hidden="true"
                        />
                      )}
                      <span className="work-filter__label">{group.label}</span>
                      <span className="work-filter__count" aria-hidden="true">{pad(group.count)}</span>
                      <span className="sr-only">, {group.count} {group.count === 1 ? 'project' : 'projects'}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>

            <p className="work-count">
              <span className="work-count__dot" aria-hidden="true" />
              <span className="work-count__num" aria-hidden="true">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={entries.length}
                    className="work-count__digits"
                    initial={reduced ? { opacity: 0 } : { y: '105%', opacity: 0 }}
                    animate={{ y: '0%', opacity: 1 }}
                    exit={reduced ? { opacity: 0 } : { y: '-105%', opacity: 0 }}
                    transition={{ duration: reduced ? 0.15 : 0.55, ease: EASE_OUT }}
                  >
                    {pad(entries.length)}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span aria-hidden="true">{entries.length === 1 ? 'Project' : 'Projects'}</span>
              <span className="sr-only" aria-live="polite">
                {active === ALL
                  ? `Showing all ${entries.length} ${entries.length === 1 ? 'project' : 'projects'}`
                  : `Showing ${entries.length} ${entries.length === 1 ? 'project' : 'projects'} in ${active}`}
              </span>
            </p>
          </div>
        )}

        {entries.length > 0 ? (
          <LayoutGroup id="work-grid">
            <ul className="work-grid">
              <AnimatePresence mode="popLayout">
                {entries.map(({ project, index }, position) => {
                  const feature = hasFeature && position === 0;
                  const wide = feature || (lastIsWide && position === entries.length - 1);
                  return (
                    <motion.li
                      key={project.slug}
                      className={`work-grid__item${wide ? ' work-grid__item--wide' : ''}`}
                      layout={reduced ? false : 'position'}
                      custom={position}
                      variants={variants}
                      initial="hidden"
                      whileInView="show"
                      exit="exit"
                      viewport={{ once: true, amount: 0.15 }}
                      transition={{ layout: LAYOUT_TRANSITION }}
                    >
                      <ProjectCard project={project} index={index} feature={feature} />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </LayoutGroup>
        ) : (
          <div className="work-empty">
            <span className="work-empty__icon" aria-hidden="true">
              <FolderKanban />
            </span>
            {projects.length === 0 ? (
              <>
                <h3 className="display-3">No projects published yet.</h3>
                <p className="work-empty__text">Case studies will appear here as soon as they are published.</p>
              </>
            ) : (
              <>
                <h3 className="display-3">Nothing in this category yet.</h3>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFilter(ALL)}>
                  <RotateCcw aria-hidden="true" size={15} />
                  Show all projects
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <ContactSection />
    </>
  );
}
