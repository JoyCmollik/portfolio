/**
 * Site-wide atmosphere, two fixed, non-interactive layers:
 * - two huge, very soft radial glows (mint + violet) drifting slowly
 *   (fx-drift, 30-40 s loops) like light leaking from the signal;
 * - fine film grain (inline SVG feTurbulence data URI, ~4.5% opacity) with a
 *   subtle stepped jitter (fx-grain), above everything but the preloader.
 *
 * Both are aria-hidden and pointer-events: none, so they never block clicks.
 * Mount it once, BEFORE <main>, so positioned page content paints above the
 * glows. Reduced motion: both layers stay still.
 */
import './fx.css';

export function AmbientLayer() {
  return (
    <>
      <div className="fx-ambient" aria-hidden="true">
        <div className="fx-ambient__glow fx-ambient__glow--mint" />
        <div className="fx-ambient__glow fx-ambient__glow--violet" />
      </div>
      <div className="fx-grain" aria-hidden="true" />
    </>
  );
}
