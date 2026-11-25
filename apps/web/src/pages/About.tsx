/**
 * About: "Beyond the code."
 *
 * 1. PageIntro (the page h1).
 * 2. The human side: portrait (clip-path wipe + inner scroll parallax +
 *    floating chip) beside the about heading, text, a facts grid and the
 *    resume button (only when a safe resume URL exists).
 * 3. Professional journey: a timeline whose rail fills with scroll progress
 *    and whose nodes light up once the fill reaches them.
 * 4. Building blocks: the interactive SkillConstellation + grouped skill chips.
 * 5. ContactSection.
 *
 * Every piece of personal content comes from usePortfolio(); empty fields
 * hide their UI instead of rendering empty pills or dead links.
 */
import { useRef, type ReactNode } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Clock3, Compass, MapPin, Sparkles } from 'lucide-react';
import { ContactSection, PageIntro } from '../components/SiteShell';
import { SkillConstellation, toneStyle } from '../components/SkillConstellation';
import { LocalTime, Magnetic, Reveal, RevealText, RollText, Stagger, StaggerItem, useSpotlight } from '../components/fx';
import { usePortfolio } from '../context/PortfolioContext';
import { safeUrl } from '../lib/api';
import { usePrefersReducedMotion } from '../lib/motion';
import type { Experience } from '../types';
import './about.css';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Engineer by craft. Curious by default." -> ["Engineer by craft.", "Curious by default."] */
function splitSentences(text: string): [string, string] | null {
  const match = text.trim().match(/^(.+?[.!?])\s+(\S.*)$/);
  return match ? [match[1], match[2]] : null;
}

function Kicker({ index, children }: { index: string; children: ReactNode }) {
  return (
    <p className="kicker about-kicker">
      <span className="kicker__index">{index}</span>
      <span className="kicker__line" />
      <span>{children}</span>
    </p>
  );
}

/* --------------------------------------------------------------------------
   Portrait
   -------------------------------------------------------------------------- */
function AboutPortrait({ src, name }: { src: string; name: string }) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Observe the unclipped wrapper: Chromium's IntersectionObserver applies the
  // frame's own clip-path, so the hidden (fully clipped) frame never "enters".
  const inView = useInView(rootRef, { once: true, amount: 0.2 });
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-6%', '6%']);
  const shown = reduced || inView;

  return (
    <div ref={rootRef} className="about-portrait" data-shown={shown ? 'true' : 'false'}>
      <div className="about-portrait-glow" aria-hidden="true" />
      <div ref={frameRef} className="about-portrait-frame">
        <div className="about-portrait-zoom">
          <motion.img
            className="about-portrait-img"
            src={src}
            alt={`Photo of ${name}`}
            decoding="async"
            style={reduced ? undefined : { y, scale: 1.14 }}
          />
        </div>
        <span className="about-portrait-sheen" aria-hidden="true" />
      </div>
      <span className="about-portrait-tick about-portrait-tick--tl" aria-hidden="true" />
      <span className="about-portrait-tick about-portrait-tick--br" aria-hidden="true" />
      <span className="about-portrait-chip">
        <Sparkles size={15} aria-hidden="true" />
        Constantly evolving
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Facts grid cell (glass + spotlight)
   -------------------------------------------------------------------------- */
function Fact({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const spot = useSpotlight<HTMLDivElement>();
  return (
    <div ref={spot.ref} onPointerMove={spot.onPointerMove} className="about-fact glass fx-spotlight">
      <span className="about-fact-label">
        <span className="about-fact-icon" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      <span className="about-fact-value">{children}</span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Experience timeline
   -------------------------------------------------------------------------- */
const CURRENT = /\b(present|current|now|today)\b/i;

function ExperienceItem({ job, index }: { job: Experience; index: number }) {
  const reduced = usePrefersReducedMotion();
  const nodeRef = useRef<HTMLSpanElement>(null);
  // "Reached" = above the line the rail fill tracks (72% of the viewport).
  // The huge top margin keeps passed nodes lit after they scroll off screen.
  const reached = useInView(nodeRef, { margin: '99999px 0px -28% 0px' });
  const lit = reduced || reached;
  const current = CURRENT.test(job.period);

  return (
    <Reveal as="li" className={`exp-item${lit ? ' is-lit' : ''}`} amount={0.2}>
      <div className="exp-when">
        <span className="exp-index">{pad2(index + 1)}</span>
        {job.period && <span className="exp-period">{job.period}</span>}
        {current && (
          <span className="exp-now">
            <span className="dot-live" aria-hidden="true" />
            Current
          </span>
        )}
      </div>
      <span ref={nodeRef} className="exp-node" aria-hidden="true" />
      <div className="exp-body">
        <h3 className="display-3 exp-role">{job.role}</h3>
        {(job.company || job.location) && (
          <p className="exp-org">
            {job.company && <span className="exp-company">{job.company}</span>}
            {job.location && (
              <span className="exp-location">
                <MapPin size={14} aria-hidden="true" />
                {job.location}
              </span>
            )}
          </p>
        )}
        {job.description && <p className="exp-desc">{job.description}</p>}
      </div>
    </Reveal>
  );
}

function Journey({ items }: { items: Experience[] }) {
  const reduced = usePrefersReducedMotion();
  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: timelineRef, offset: ['start 72%', 'end 72%'] });
  const headY = useTransform(scrollYProgress, v => `${(Math.min(1, Math.max(0, v)) - 1) * 100}%`);
  // The bead appears once the fill starts and fades out as it lands.
  const headOpacity = useTransform(scrollYProgress, [0, 0.03, 0.97, 1], [0, 1, 1, 0]);

  return (
    <section className="section about-journey" aria-labelledby="about-journey-title">
      <div className="container">
        <header className="about-head about-head--split">
          <div>
            <Kicker index="02">Professional journey</Kicker>
            <h2 id="about-journey-title" className="display-2 about-title">
              <RevealText text="My path" /> <RevealText text="so far." className="serif-accent" delay={0.12} />
            </h2>
          </div>
          <Reveal as="p" className="about-head-note" delay={0.1}>
            <span className="about-head-count">{pad2(items.length)}</span>
            <span className="label">{items.length === 1 ? 'Chapter' : 'Chapters'}, most recent first</span>
          </Reveal>
        </header>

        <div ref={timelineRef} className="exp-timeline">
          <span className="exp-rail" aria-hidden="true">
            <motion.span className="exp-rail-fill" style={reduced ? undefined : { scaleY: scrollYProgress }} />
            {!reduced && (
              <motion.span className="exp-rail-head" style={{ y: headY, opacity: headOpacity }}>
                <span className="exp-rail-bead" />
              </motion.span>
            )}
          </span>
          <ol className="exp-list">
            {items.map((job, i) => (
              <ExperienceItem key={`${job.company}-${job.role}-${i}`} job={job} index={i} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */
export default function About() {
  const { site } = usePortfolio();
  const portrait = safeUrl(site.portraitImage) || '/images/joy-portrait.webp';
  const resume = safeUrl(site.resumeUrl);
  const heading = splitSentences(site.aboutHeading ?? '');
  const groups = site.skillGroups.filter(group => group.items.some(item => item.trim()));
  const experience = site.experience ?? [];

  return (
    <>
      <PageIntro tag="A BIT MORE PERSONAL / 02" title="Beyond the code." sub="A little about the person behind the pull requests." />

      {/* ---- 1. The human side ---- */}
      <section
        className="section about-intro"
        aria-labelledby={site.aboutHeading ? 'about-human-title' : undefined}
        aria-label={site.aboutHeading ? undefined : 'The human side'}
      >
        <div className="container about-intro-grid">
          <AboutPortrait src={portrait} name={site.name} />

          <div className="about-intro-copy">
            <Kicker index="01">The human side</Kicker>
            {site.aboutHeading && (
              <h2 id="about-human-title" className="display-2 about-title about-heading">
                {heading ? (
                  <>
                    <RevealText text={heading[0]} />
                    <br />
                    <RevealText text={heading[1]} className="serif-accent" delay={0.06 * heading[0].split(/\s+/).length + 0.08} />
                  </>
                ) : (
                  <RevealText text={site.aboutHeading} />
                )}
              </h2>
            )}
            {site.aboutText && (
              <Reveal as="p" className="lead about-text" delay={0.1}>
                {site.aboutText}
              </Reveal>
            )}

            <Stagger as="ul" className="about-facts" step={0.08} delay={0.1}>
              {site.location && (
                <StaggerItem as="li">
                  <Fact label="Based in" icon={<MapPin size={14} />}>
                    {site.location}
                  </Fact>
                </StaggerItem>
              )}
              <StaggerItem as="li">
                <Fact label="Local time" icon={<Clock3 size={14} />}>
                  <LocalTime withLabel className="about-fact-time" />
                </Fact>
              </StaggerItem>
              <StaggerItem as="li">
                <Fact label="What keeps me going" icon={<Compass size={14} />}>
                  Curiosity, craft &amp; impact
                </Fact>
              </StaggerItem>
              {site.availability && (
                <StaggerItem as="li">
                  <Fact label="Availability" icon={<span className="dot-live" />}>
                    {site.availability}
                  </Fact>
                </StaggerItem>
              )}
            </Stagger>

            {resume && (
              <Reveal className="about-actions" delay={0.2}>
                <Magnetic>
                  <a className="btn btn--primary fx-roll-host" href={resume} target="_blank" rel="noreferrer">
                    <RollText text="View my resume" />
                    <span className="btn__icon btn__icon--rotate" aria-hidden="true">
                      <ArrowRight />
                    </span>
                  </a>
                </Magnetic>
              </Reveal>
            )}
          </div>
        </div>
      </section>

      {/* ---- 2. Professional journey ---- */}
      {experience.length > 0 && <Journey items={experience} />}

      {/* ---- 3. Building blocks ---- */}
      {groups.length > 0 && (
        <section className="section about-skills" aria-labelledby="about-skills-title">
          <div className="grid-bg about-skills-grid" aria-hidden="true" />
          <div className="container about-skills-layout">
            <header className="about-head about-skills-head">
              <Kicker index="03">Building blocks</Kicker>
              <h2 id="about-skills-title" className="display-2 about-title">
                <RevealText text="Tools I" /> <RevealText text="reach for." className="serif-accent" delay={0.12} />
              </h2>
              <Reveal as="p" className="lead about-skills-lead" delay={0.1}>
                Comfortable across the stack, with a growing focus on backend architecture and dependable systems.
              </Reveal>
            </header>

            <div className="about-skills-map">
              <Reveal className="about-map-panel" y={32} amount={0.15}>
                <SkillConstellation />
              </Reveal>
            </div>

            <Stagger className="about-groups" step={0.08}>
              {groups.map((group, g) => {
                const items = group.items.map(item => item.trim()).filter(Boolean);
                return (
                  <StaggerItem key={`${group.title}-${g}`}>
                    <div className="about-group" style={toneStyle(site.skillGroups.indexOf(group))}>
                      <h3 className="about-group-title">
                        <span className="about-group-swatch" aria-hidden="true" />
                        <span className="about-group-name">{group.title}</span>
                        <span className="about-group-count" aria-hidden="true">
                          {pad2(items.length)}
                        </span>
                      </h3>
                      <ul className="about-group-chips">
                        {items.map((skill, i) => (
                          <li key={`${skill}-${i}`} className="chip about-chip">
                            {skill}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        </section>
      )}

      <ContactSection />
    </>
  );
}
