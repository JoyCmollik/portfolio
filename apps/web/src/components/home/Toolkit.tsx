/**
 * Toolkit: "03 / THE TOOLKIT" as a bento grid.
 * A large cell holds the interactive <SkillConstellation/> (owned by the about page); every skill group
 * gets its own spotlight cell (index, group color dot, title, items as chips).
 */
import { RevealText, Reveal, Stagger, StaggerItem, useSpotlight } from '../fx';
import { SkillConstellation } from '../SkillConstellation';
import { usePortfolio } from '../../context/PortfolioContext';
import type { SkillGroup } from '../../types';

/** Group colors, in the same order as the constellation (mint, violet, amber, then blue, rose). */
const GROUP_ACCENTS = ['emerald', 'violet', 'orange', 'blue', 'rose'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

function GroupCell({ group, index }: { group: SkillGroup; index: number }) {
  const spot = useSpotlight<HTMLDivElement>();
  const items = group.items.map(item => item.trim()).filter(Boolean);
  const accent = GROUP_ACCENTS[index % GROUP_ACCENTS.length];

  return (
    <div
      ref={spot.ref}
      onPointerMove={spot.onPointerMove}
      className={`home-group accent--${accent} fx-spotlight`}
    >
      <div className="home-group__inner">
        <p className="home-group__meta">
          <span className="home-group__dot" aria-hidden="true" />
          <span className="home-group__index">{pad(index + 1)}</span>
          <span className="home-group__count">
            {items.length} {items.length === 1 ? 'tool' : 'tools'}
          </span>
        </p>
        <h3 className="display-3 home-group__title">{group.title}</h3>
        {items.length > 0 && (
          <ul className="home-group__chips" aria-label={`${group.title} tools`}>
            {items.map(item => (
              <li key={item} className="chip chip--mono home-group__chip">{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Toolkit() {
  const { site } = usePortfolio();
  const groups = site.skillGroups.filter(group => group.title.trim() || group.items.some(item => item.trim()));

  return (
    <section className="home-toolkit section" aria-labelledby="home-toolkit-title">
      <div className="container">
        <div className="home-toolkit__head">
          <div className="home-toolkit__heading">
            <Reveal>
              <p className="kicker">
                <span className="kicker__index">03</span>
                <span className="kicker__line" aria-hidden="true" />
                <span>The toolkit</span>
              </p>
            </Reveal>
            <h2 className="display-2 home-toolkit__title" id="home-toolkit-title">
              <RevealText text="Different tools." />
              <br />
              <RevealText text="One mindset." className="serif-accent" delay={0.14} />
            </h2>
          </div>
          <Reveal as="p" className="lead home-toolkit__lead" delay={0.1}>
            The best tool is the one that helps solve the problem. Here's a small universe of technologies I work
            with.
          </Reveal>
        </div>

        <div className={`home-toolkit__bento${groups.length ? '' : ' home-toolkit__bento--solo'}`}>
          <Reveal className="home-toolkit__map" amount={0.15}>
            <SkillConstellation />
          </Reveal>
          {groups.length > 0 && (
            <Stagger as="ul" className="home-toolkit__groups" step={0.09}>
              {groups.map((group, i) => (
                <StaggerItem as="li" key={`${group.title}-${i}`} className="home-toolkit__group">
                  <GroupCell group={group} index={i} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </div>
    </section>
  );
}
