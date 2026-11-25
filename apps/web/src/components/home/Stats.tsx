/**
 * Stats band: site.stats as glass spotlight cards with counting values.
 * Renders nothing when there are no stats.
 */
import { Counter, Stagger, StaggerItem, useSpotlight } from '../fx';
import { usePortfolio } from '../../context/PortfolioContext';

const pad = (n: number) => String(n).padStart(2, '0');

function StatCard({ value, label, index }: { value: string; label: string; index: number }) {
  const spot = useSpotlight<HTMLDivElement>();
  return (
    <div ref={spot.ref} onPointerMove={spot.onPointerMove} className="home-stat fx-spotlight">
      <div className="home-stat__inner">
        <span className="home-stat__index" aria-hidden="true">
          {pad(index + 1)}
          <span className="home-stat__tick" />
        </span>
        {value && (
          <Counter
            value={value}
            className={/\d/.test(value) ? 'home-stat__value' : 'home-stat__value home-stat__value--glyph'}
          />
        )}
        {label && <span className="home-stat__label">{label}</span>}
      </div>
    </div>
  );
}

export function Stats() {
  const { site } = usePortfolio();
  const stats = site.stats.filter(stat => stat.value.trim() || stat.label.trim());
  if (!stats.length) return null;

  return (
    <section className="home-stats" aria-labelledby="home-stats-title">
      <div className="container home-stats__layout">
        <div className="home-stats__head">
          <h2 className="kicker home-stats__kicker" id="home-stats-title">
            <span className="kicker__index" aria-hidden="true">✦</span>
            <span className="kicker__line" aria-hidden="true" />
            <span>The numbers, briefly</span>
          </h2>
        </div>
        <Stagger as="ul" className={`home-stats__grid home-stats__grid--${Math.min(stats.length, 4)}`} step={0.09}>
          {stats.map((stat, i) => (
            <StaggerItem as="li" key={`${stat.label}-${i}`} className="home-stats__cell">
              <StatCard value={stat.value} label={stat.label} index={i} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
