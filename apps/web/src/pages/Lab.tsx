/**
 * /lab: DEV-ONLY showcase of the design system (never shipped: App.tsx only registers it when
 * import.meta.env.DEV is true, so production builds drop this module entirely).
 *
 * Use it to eyeball every primitive in isolation: tokens, type scale, buttons, chips, fx motion
 * components, the WebGL ShaderBackdrop and every ProjectArt accent x variant.
 * Content shown here comes from usePortfolio() so nothing personal is hardcoded.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Github } from 'lucide-react';
import {
  Counter, LocalTime, Magnetic, Marquee, Reveal, RevealText, RollText, ScrollHighlight,
  ShaderBackdrop, Stagger, StaggerItem, TextScramble, Tilt, useSpotlight,
} from '../components/fx';
import { ProjectArt } from '../components/ProjectArt';
import { usePortfolio } from '../context/PortfolioContext';
import type { Project } from '../types';
import './lab.css';

type Accent = Project['accent'];
type ArtVariant = 'card' | 'stack' | 'hero';

const ACCENTS: Accent[] = ['emerald', 'violet', 'blue', 'orange', 'rose'];
const ART_VARIANTS: { variant: ArtVariant; ratio: string }[] = [
  { variant: 'card', ratio: '16 / 10' },
  { variant: 'stack', ratio: '4 / 3' },
  { variant: 'hero', ratio: '21 / 9' },
];

const SWATCHES: { group: string; tokens: string[] }[] = [
  { group: 'Ink', tokens: ['--c-ink-0', '--c-ink-1', '--c-ink-2', '--c-ink-3', '--c-ink-4'] },
  { group: 'Lines & text', tokens: ['--c-line', '--c-line-strong', '--c-text', '--c-text-2', '--c-text-3'] },
  { group: 'Signal', tokens: ['--c-mint', '--c-signal', '--c-cyan', '--c-violet', '--c-amber', '--c-rose', '--c-blue'] },
  { group: 'Gradients', tokens: ['--grad-signal', '--grad-warm'] },
];

const TYPE_SCALE: { className: string; token: string; sample: string }[] = [
  { className: 'display-hero', token: '--t-hero', sample: 'Signal over noise' },
  { className: 'display-1', token: '--t-1', sample: 'Ideas, shipped.' },
  { className: 'display-2', token: '--t-2', sample: 'Different tools. One mindset.' },
  { className: 'display-3', token: '--t-3', sample: 'Systems behind great ideas' },
  { className: 'lead', token: '--t-lead', sample: 'Lead paragraph: calm, generous and easy to read at any width.' },
  { className: 'lab-body', token: '--t-body', sample: 'Body copy at 1rem with a 1.7 line height for long-form reading.' },
  { className: 'lab-small', token: '--t-small', sample: 'Small print and secondary metadata.' },
  { className: 'label', token: '--t-label', sample: '01 / Portfolio label' },
];

const RADII = ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-pill'];
const COUNTERS = ['3+', '5+', '∞', '99.9%'];

/** Placeholder used only if the portfolio has no projects at all. */
const SAMPLE_PROJECT: Project = {
  title: 'Sample project', slug: 'sample-project', category: 'SAMPLE', summary: '', description: '',
  stack: [], featured: false, order: 0, accent: 'emerald', imageUrl: '', links: { github: '', demo: '' }, status: 'published',
};

/** One project per accent (real data when available, otherwise a clone with the accent swapped). */
function projectsByAccent(projects: Project[]): Project[] {
  const base = projects[0] ?? SAMPLE_PROJECT;
  return ACCENTS.map(accent => {
    const match = projects.find(p => p.accent === accent) ?? { ...base, accent, slug: `${base.slug}-${accent}` };
    // Force the generative art (imageUrl wins over art when set).
    return { ...match, imageUrl: '' };
  });
}

/* ------------------------------------------------------------------------------------------------ */

function LabSection({ id, index, title, children }: { id: string; index: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="lab-section" aria-labelledby={`${id}-title`}>
      <header className="lab-section__head">
        <p className="kicker"><span className="kicker__index">{index}</span><span className="kicker__line" /><span>Lab</span></p>
        <h2 id={`${id}-title`} className="display-3">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Demo({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`lab-demo ${className}`}>
      <div className="lab-demo__meta">
        <h3 className="lab-demo__title">{title}</h3>
        {note && <p className="lab-demo__note">{note}</p>}
      </div>
      <div className="lab-demo__stage">{children}</div>
    </div>
  );
}

function SpotlightCard() {
  const { ref, onPointerMove } = useSpotlight<HTMLDivElement>();
  return (
    <div ref={ref} onPointerMove={onPointerMove} className="lab-card fx-spotlight accent--violet">
      <span className="label label--accent">useSpotlight + .fx-spotlight</span>
      <p className="lab-card__title">Move the pointer across this card.</p>
      <p className="lab-card__text">The border and surface glow follow the cursor using --accent (violet here).</p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

export default function Lab() {
  const { site, projects } = usePortfolio();
  const artProjects = projectsByAccent(projects);
  const imageProject = projects.find(p => p.imageUrl);
  const skills = site.skillGroups.flatMap(group => group.items);

  const toc = [
    ['lab-tokens', 'Tokens'], ['lab-type', 'Type'], ['lab-controls', 'Controls'], ['lab-text', 'Text motion'],
    ['lab-data', 'Data & loops'], ['lab-surfaces', 'Surfaces'], ['lab-shader', 'Shader'], ['lab-art', 'Project art'],
  ];

  return (
    <div className="lab">
      {/* ------------------------------------------------------------ Intro */}
      <header className="lab-intro container">
        <p className="kicker"><span className="kicker__index">DEV</span><span className="kicker__line" /><span>Design system lab</span></p>
        <h1 className="display-1 lab-intro__title">
          <RevealText text="The lab." trigger="mount" />{' '}
          <RevealText text="Every primitive." className="serif-accent" trigger="mount" delay={0.15} />
        </h1>
        <p className="lead lab-intro__lead">
          A development-only bench for the foundation: tokens, primitives, fx components, the shader and the
          generative project art. This route is never registered in production builds.
        </p>
        <nav className="lab-toc" aria-label="Lab sections">
          {toc.map(([id, text]) => <Link key={id} to={`#${id}`} className="chip chip--mono">{text}</Link>)}
        </nav>
      </header>

      <div className="container lab-body-wrap">
        {/* ------------------------------------------------------------ Tokens */}
        <LabSection id="lab-tokens" index="01" title="Color tokens">
          {SWATCHES.map(({ group, tokens }) => (
            <div key={group} className="lab-swatch-group">
              <p className="label">{group}</p>
              <ul className="lab-swatches">
                {tokens.map(token => (
                  <li key={token} className="lab-swatch">
                    <span className="lab-swatch__chip" style={{ background: `var(${token})` }} />
                    <code className="lab-swatch__name">{token}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="lab-swatch-group">
            <p className="label">Project accents (.accent--*)</p>
            <ul className="lab-swatches">
              {ACCENTS.map(accent => (
                <li key={accent} className={`lab-swatch accent--${accent}`}>
                  <span className="lab-swatch__chip lab-swatch__chip--accent" />
                  <code className="lab-swatch__name">.accent--{accent}</code>
                </li>
              ))}
            </ul>
          </div>
          <div className="lab-swatch-group">
            <p className="label">Radii &amp; depth</p>
            <ul className="lab-radii">
              {RADII.map(token => (
                <li key={token} className="lab-radius" style={{ borderRadius: `var(${token})` } as CSSProperties}>
                  <code>{token}</code>
                </li>
              ))}
              <li className="lab-radius lab-radius--shadow"><code>--shadow-card</code></li>
              <li className="lab-radius lab-radius--glow"><code>--glow-signal</code></li>
            </ul>
          </div>
        </LabSection>

        {/* ------------------------------------------------------------ Type */}
        <LabSection id="lab-type" index="02" title="Type scale">
          <ul className="lab-type">
            {TYPE_SCALE.map(({ className, token, sample }) => (
              <li key={className} className="lab-type__row">
                <code className="lab-type__token">.{className} <span>{token}</span></code>
                <p className={className}>{sample}</p>
              </li>
            ))}
            <li className="lab-type__row">
              <code className="lab-type__token">.serif-accent (plain)</code>
              <p className="display-2">What&apos;s <span className="serif-accent">worth building?</span></p>
            </li>
            <li className="lab-type__row">
              <code className="lab-type__token">.text-gradient / .muted / .faint / .mono</code>
              <p className="lab-body"><span className="text-gradient">gradient text</span> · <span className="muted">muted</span> · <span className="faint">faint</span> · <span className="mono">mono()</span></p>
            </li>
          </ul>
        </LabSection>

        {/* ------------------------------------------------------------ Controls */}
        <LabSection id="lab-controls" index="03" title="Buttons, chips & labels">
          <div className="lab-grid lab-grid--2">
            <Demo title=".btn variants" note="RollText on hover/focus, Magnetic wrapper, .btn__icon arrow slide (or .btn__icon--rotate).">
              {/* Primary uses the rotate modifier, ghost the default slide-through. */}
              <div className="lab-row">
                <Magnetic>
                  <button type="button" className="btn btn--primary fx-roll-host">
                    <RollText text="Explore my work" />
                    <span className="btn__icon btn__icon--rotate" aria-hidden="true"><ArrowRight /></span>
                  </button>
                </Magnetic>
                <Magnetic>
                  <button type="button" className="btn btn--ghost fx-roll-host">
                    <RollText text="More about me" />
                    <span className="btn__icon" aria-hidden="true"><ArrowUpRight /></span>
                  </button>
                </Magnetic>
              </div>
              <div className="lab-row">
                <button type="button" className="btn btn--primary btn--lg fx-roll-host"><RollText text="Large primary" /></button>
                <button type="button" className="btn btn--ghost btn--sm fx-roll-host">
                  <RollText text="Small ghost" />
                  <span className="btn__icon" aria-hidden="true"><ArrowRight /></span>
                </button>
                <button type="button" className="btn btn--ghost btn--sm" aria-label="Source code"><Github size={16} aria-hidden="true" /></button>
                <button type="button" className="btn btn--primary btn--sm" disabled>Disabled</button>
              </div>
            </Demo>
            <Demo title="Chips, kicker, labels, live dot">
              <div className="lab-row">
                <span className="chip">TypeScript</span>
                <span className="chip chip--mono">node:22</span>
                {ACCENTS.map(accent => <span key={accent} className={`chip chip--accent chip--mono accent--${accent}`}>{accent}</span>)}
              </div>
              <div className="lab-row">
                <p className="kicker"><span className="kicker__index">01</span><span className="kicker__line" /><span>Selected work</span></p>
              </div>
              <div className="lab-row">
                <span className="label">.label</span>
                <span className="label label--accent">.label--accent</span>
                <span className="chip chip--mono"><span className="dot-live" aria-hidden="true" /> status: always building</span>
              </div>
            </Demo>
          </div>
        </LabSection>

        {/* ------------------------------------------------------------ Text motion */}
        <LabSection id="lab-text" index="04" title="Text motion">
          <div className="lab-grid lab-grid--2">
            <Demo title="RevealText (trigger: view)" note="Masked per-word slide-up; per-word gradient on the serif accent.">
              <h3 className="display-2 lab-reveal-heading">
                <RevealText text="Have an idea" />{' '}
                <RevealText text="worth building?" className="serif-accent" delay={0.2} />
              </h3>
            </Demo>
            <Demo title="TextScramble" note="mount / view / hover (hover the last one).">
              <div className="lab-stack">
                <TextScramble className="label label--accent" text="Decoding signal" trigger="mount" />
                <TextScramble className="label" text="01 / Selected work" trigger="view" />
                <TextScramble className="chip chip--mono" text="hover to scramble" trigger="hover" />
              </div>
            </Demo>
            <Demo title="LocalTime" note="Owner time zone from config.ts, blinking colon.">
              <div className="lab-stack">
                <LocalTime className="display-3" />
                <LocalTime className="label" withLabel />
              </div>
            </Demo>
            <Demo title="Reveal + Stagger" note="Fade, rise and blur clear once in view; 70ms stagger.">
              <Reveal className="lab-card lab-card--compact">
                <span className="label">Reveal</span>
                <p className="lab-card__text">This block fades, rises and un-blurs when it enters the viewport.</p>
              </Reveal>
              <Stagger as="div" className="lab-stagger">
                {['Design', 'Build', 'Ship', 'Measure', 'Learn', 'Repeat'].map(word => (
                  <StaggerItem key={word} className="lab-stagger__item">{word}</StaggerItem>
                ))}
              </Stagger>
            </Demo>
          </div>
          <Demo title="ScrollHighlight" note="Word opacity follows scroll progress (site.aboutText).">
            <ScrollHighlight text={site.aboutText} className="display-3 lab-highlight" />
          </Demo>
        </LabSection>

        {/* ------------------------------------------------------------ Data & loops */}
        <LabSection id="lab-data" index="05" title="Counters & marquee">
          <ul className="lab-counters">
            {COUNTERS.map(value => (
              <li key={value} className="lab-counter glass">
                <Counter value={value} className="lab-counter__value" />
                <span className="label">Counter("{value}")</span>
              </li>
            ))}
          </ul>
          <div className="lab-marquee">
            <Marquee speed={40}>
              {skills.map((skill, i) => <span key={`${skill}-${i}`} className="lab-marquee__item">{skill}<span aria-hidden="true">✦</span></span>)}
            </Marquee>
            <Marquee speed={48} reverse>
              {skills.map((skill, i) => <span key={`${skill}-${i}`} className="lab-marquee__item lab-marquee__item--outline">{skill}<span aria-hidden="true">✦</span></span>)}
            </Marquee>
          </div>
        </LabSection>

        {/* ------------------------------------------------------------ Surfaces */}
        <LabSection id="lab-surfaces" index="06" title="Surfaces: glass, tilt, spotlight, grid">
          <div className="lab-grid lab-grid--3">
            <div className="lab-card glass">
              <span className="label">.glass</span>
              <p className="lab-card__title">Frosted surface</p>
              <p className="lab-card__text">rgba(255,255,255,.035), blur(16px) saturate(140%), hairline border.</p>
            </div>
            <Tilt className="lab-tilt">
              <div className="lab-card lab-card--tilt accent--orange">
                <span className="label label--accent">Tilt</span>
                <p className="lab-card__title">Tilts toward the pointer</p>
                <p className="lab-card__text">Spring-driven 3D tilt with a glare layer. Static on touch and reduced motion.</p>
              </div>
            </Tilt>
            <SpotlightCard />
          </div>
          <div className="lab-grid-demo">
            <div className="grid-bg" />
            <span className="label">.grid-bg (64px hairline grid, radial mask)</span>
          </div>
        </LabSection>

        {/* ------------------------------------------------------------ Shader */}
        <LabSection id="lab-shader" index="07" title="ShaderBackdrop">
          <div className="lab-grid lab-grid--2">
            {(['signal', 'warm'] as const).map(palette => (
              <div key={palette} className="lab-shader">
                <ShaderBackdrop palette={palette} />
                <div className="lab-shader__copy">
                  <span className="label label--accent">palette="{palette}"</span>
                  <p className="display-3">Light that flows like a signal.</p>
                </div>
              </div>
            ))}
          </div>
        </LabSection>

        {/* ------------------------------------------------------------ Project art */}
        <LabSection id="lab-art" index="08" title="ProjectArt: every accent x variant">
          {ART_VARIANTS.map(({ variant, ratio }) => (
            <div key={variant} className={`lab-art-group lab-art-group--${variant}`}>
              <p className="label">variant="{variant}" · aspect {ratio}</p>
              <ul className="lab-art-grid">
                {artProjects.map((project, index) => (
                  <li key={`${variant}-${project.accent}`} className="lab-art art-hover-host">
                    <div className="lab-art__frame" style={{ aspectRatio: ratio }}>
                      <ProjectArt project={project} index={index} variant={variant} />
                    </div>
                    <p className="lab-art__caption"><code>{project.accent}</code><span>{project.title}</span></p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {imageProject && (
            <div className="lab-art-group">
              <p className="label">imageUrl set: renders the real image</p>
              <ul className="lab-art-grid">
                <li className="lab-art art-hover-host">
                  <div className="lab-art__frame" style={{ aspectRatio: '16 / 10' }}>
                    <ProjectArt project={imageProject} variant="card" />
                  </div>
                  <p className="lab-art__caption"><code>{imageProject.accent}</code><span>{imageProject.title}</span></p>
                </li>
              </ul>
            </div>
          )}
        </LabSection>
      </div>
    </div>
  );
}
