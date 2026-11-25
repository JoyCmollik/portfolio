/**
 * About statement: "02 / A LITTLE ABOUT ME".
 * Left: heading + site.aboutText as a scroll-linked reading highlight + "Get to know me".
 * Right (desktop: sticky): a terminal card that types a small `const engineer = {...}` snapshot line by
 * line once it scrolls into view, then prints `$ ready_to_build ✓` with a blinking cursor.
 *
 * Typing: one timer chain that advances a character count (a few dozen renders of a tiny subtree,
 * then it stops for good). Reduced motion: shown fully typed. Assistive tech gets the snippet once,
 * as plain text; the animated copy is aria-hidden.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'framer-motion';
import { ArrowRight, Command } from 'lucide-react';
import { Magnetic, Reveal, RevealText, RollText, ScrollHighlight } from '../fx';
import { usePortfolio } from '../../context/PortfolioContext';
import { usePrefersReducedMotion } from '../../lib/motion';

/* ------------------------------------------------------------------------------------------------
   Snippet model: lines of [text, token class] pairs (class '' = plain punctuation)
   ------------------------------------------------------------------------------------------------ */
type Token = [string, string];
type Line = Token[];

function buildSnippet(name: string): Line[] {
  const str = (value: string): Token => [`"${value}"`, 'str'];
  return [
    [['// A snapshot, in code', 'comment']],
    [['const', 'kw'], [' ', ''], ['engineer', 'var'], [' = {', '']],
    [['  name', 'key'], [': ', ''], str(name), [',', '']],
    [['  focus', 'key'], [': [', ''], str('backend'), [', ', ''], str('AI'), ['],', '']],
    [['  approach', 'key'], [': ', ''], str('build with purpose'), [',', '']],
    [['  learning', 'key'], [': ', ''], ['true', 'bool'], [',', '']],
    [['};', '']],
  ];
}

const lineLength = (line: Line) => line.reduce((sum, [text]) => sum + text.length, 0);

/** Per-character delay (ms), extra pause at the end of each line, start delay. */
const CHAR_MS = 26;
const LINE_PAUSE_MS = 170;
const START_MS = 380;

function Terminal({ name, handle }: { name: string; handle: string }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });

  const lines = buildSnippet(name);
  const lengths = lines.map(lineLength);
  const total = lengths.reduce((a, b) => a + b, 0);

  // Characters typed so far; `total` + 1 = the prompt line is printed too.
  const [typed, setTyped] = useState(0);
  const shown = reduced ? total + 1 : typed;

  useEffect(() => {
    if (reduced || !inView) return;
    let count = 0;
    let lineIndex = 0;
    let lineEnd = lengths[0] ?? 0;
    let timer = 0;
    const step = () => {
      count += 1;
      setTyped(count);
      if (count > total) return; // prompt printed: done
      let delay = CHAR_MS;
      if (count === lineEnd) {
        delay = LINE_PAUSE_MS;
        lineIndex += 1;
        lineEnd += lengths[lineIndex] ?? 0;
      }
      timer = window.setTimeout(step, delay);
    };
    timer = window.setTimeout(step, START_MS);
    return () => window.clearTimeout(timer);
    // `lengths` / `total` derive from `name` only (fresh arrays every render, so not listed).
  }, [reduced, inView, name]);

  // Render the typed prefix of every line, keeping token colors.
  let remaining = shown;
  let caretLine = -1;
  const rendered = lines.map((line, li) => {
    const visible: Token[] = [];
    for (const [text, kind] of line) {
      if (remaining <= 0) break;
      const part = text.slice(0, remaining);
      remaining -= part.length;
      visible.push([part, kind]);
    }
    const full = visible.reduce((sum, [text]) => sum + text.length, 0) === lengths[li];
    if (caretLine === -1 && !full) caretLine = li;
    return visible;
  });
  const done = shown > total;
  const plain = lines.map(line => line.map(([text]) => text).join('')).join('\n');

  return (
    <div ref={ref} className="home-term" data-done={done ? 'true' : 'false'}>
      <div className="home-term__bar">
        <span className="home-term__lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="home-term__title">
          {handle}@workspace <span className="home-term__path">~/about</span>
        </span>
        <span className="home-term__lang" aria-hidden="true">ts</span>
      </div>

      <pre className="sr-only">{`${plain}\n$ ready_to_build ✓`}</pre>
      <div className="home-term__body" aria-hidden="true">
        <ol className="home-term__code">
          {rendered.map((tokens, li) => (
            <li key={li} className="home-term__line" data-typed={tokens.length > 0 ? 'true' : 'false'}>
              <span className="home-term__ln">{String(li + 1).padStart(2, '0')}</span>
              <span className="home-term__src">
                {tokens.map(([text, kind], ti) => (
                  <span key={ti} className={kind ? `home-term__${kind}` : undefined}>
                    {text}
                  </span>
                ))}
                {caretLine === li && <span className="home-term__caret" />}
              </span>
            </li>
          ))}
        </ol>
        <p className="home-term__prompt" data-shown={done ? 'true' : 'false'}>
          <span className="home-term__dollar">$</span> ready_to_build <b className="home-term__ok">✓</b>
          <span className="home-term__caret home-term__caret--blink" />
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
   Section
   ------------------------------------------------------------------------------------------------ */
export function AboutStatement() {
  const { site } = usePortfolio();
  const name = site.shortName || site.name;
  const handle = (name.split(/\s+/)[0] || 'dev').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'dev';

  return (
    <section className="home-about section" aria-labelledby="home-about-title">
      <div className="home-about__glow" aria-hidden="true" />
      <div className="container home-about__layout">
        <div className="home-about__copy">
          <Reveal>
            <p className="kicker">
              <span className="kicker__index">02</span>
              <span className="kicker__line" aria-hidden="true" />
              <span>A little about me</span>
            </p>
          </Reveal>
          <h2 className="display-2 home-about__title" id="home-about-title">
            <RevealText text="Complex problems." />
            <br />
            <RevealText text="Simple solutions." className="serif-accent" delay={0.14} />
          </h2>

          {site.aboutText && <ScrollHighlight text={site.aboutText} className="home-about__text" />}

          <Reveal className="home-about__cta">
            <Magnetic>
              <Link to="/about" className="btn btn--ghost btn--lg fx-roll-host">
                <RollText text="Get to know me" />
                <span className="btn__icon btn__icon--rotate" aria-hidden="true">
                  <ArrowRight />
                </span>
              </Link>
            </Magnetic>
          </Reveal>
        </div>

        <div className="home-about__aside">
          <div className="home-about__sticky">
            <Reveal y={32}>
              <figure className="home-about__figure" aria-label={`A snapshot of ${name}, in code`}>
                <Terminal name={name} handle={handle} />
                <figcaption className="home-about__caption label">
                  <Command aria-hidden="true" />
                  <span>Think. Design. Build.</span>
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
