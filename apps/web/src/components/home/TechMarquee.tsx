/**
 * Tech marquee: every skill (site.skillGroups) in two rows drifting in opposite directions, set in large
 * display type alternating filled / outlined, separated by mint stars.
 *
 * The visual rows are decorative (aria-hidden); assistive tech gets one plain list instead of two
 * duplicated, endlessly repeating rows. Reduced motion: Marquee renders a single static wrapping row.
 */
import { Fragment } from 'react';
import { Marquee } from '../fx';
import { usePortfolio } from '../../context/PortfolioContext';
import { usePrefersReducedMotion } from '../../lib/motion';

function Row({ items, offset }: { items: string[]; offset: number }) {
  return (
    <>
      {items.map((item, i) => (
        <Fragment key={`${item}-${i}`}>
          <span className={(i + offset) % 2 ? 'home-marquee__item home-marquee__item--outline' : 'home-marquee__item'}>
            {item}
          </span>
          <span className="home-marquee__star">✦</span>
        </Fragment>
      ))}
    </>
  );
}

export function TechMarquee() {
  const { site } = usePortfolio();
  const reduced = usePrefersReducedMotion();
  const items = Array.from(new Set(site.skillGroups.flatMap(group => group.items).map(item => item.trim()).filter(Boolean)));
  if (!items.length) return null;

  // Second row starts halfway through the list so the two rows never line up word for word.
  const half = Math.ceil(items.length / 2);
  const rowB = [...items.slice(half), ...items.slice(0, half)];
  // Seconds per loop scale with content so the drift speed stays calm (~90px/s) whatever the list length.
  const speed = Math.max(24, items.length * 3.2);

  return (
    <section className="home-marquee" aria-label="Technologies I work with">
      <ul className="sr-only">
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="home-marquee__rows" aria-hidden="true">
        <Marquee speed={speed} className="home-marquee__row">
          <Row items={items} offset={0} />
        </Marquee>
        {!reduced && (
          <Marquee speed={speed * 1.15} reverse className="home-marquee__row home-marquee__row--b">
            <Row items={rowB} offset={1} />
          </Marquee>
        )}
      </div>
    </section>
  );
}
