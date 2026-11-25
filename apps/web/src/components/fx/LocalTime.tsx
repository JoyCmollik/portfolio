/**
 * The owner's local time (TIMEZONE) as HH:MM with a softly blinking colon.
 * Renders a <time dateTime="HH:MM">; assistive tech reads "14:05" (plus the
 * zone label when withLabel) from a visually hidden copy.
 *
 * Every instance reads ONE shared minute clock (a tiny external store read
 * through useSyncExternalStore), so the header, hero and footer clocks always
 * agree and all flip together on the minute boundary. The store runs a single
 * timeout aligned to the next minute, only while at least one clock is
 * mounted and the tab is visible; it catches up as soon as the tab returns.
 */
import { useSyncExternalStore } from 'react';
import { TIMEZONE, TIMEZONE_LABEL } from '../../config';
import { cx } from './utils';
import './fx.css';

export interface LocalTimeProps {
  className?: string;
  /** Append ` GMT+6` (TIMEZONE_LABEL). */
  withLabel?: boolean;
}

/* --------------------------------------------------------------------------
   Shared minute clock
   -------------------------------------------------------------------------- */

const MINUTE_MS = 60_000;

/** Start of the current minute (epoch ms): the store's snapshot. */
const currentMinute = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

let minute = currentMinute();
let timer: number | undefined;
const listeners = new Set<() => void>();

/** Re-read the time; notify every clock if the minute changed. */
function refresh(): void {
  const next = currentMinute();
  if (next === minute) return;
  minute = next;
  listeners.forEach(listener => listener());
}

function schedule(): void {
  window.clearTimeout(timer);
  timer = undefined;
  if (!listeners.size || document.hidden) return;
  // A few ms past the boundary, so the new minute is certainly current.
  const wait = MINUTE_MS - (Date.now() % MINUTE_MS) + 20;
  timer = window.setTimeout(() => {
    refresh();
    schedule();
  }, wait);
}

function onVisibilityChange(): void {
  if (!document.hidden) refresh();
  schedule();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibilityChange);
    refresh(); // the clock may have been idle (no instances) for a while
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.clearTimeout(timer);
    timer = undefined;
  };
}

/** While idle (nothing subscribed) the cached minute may be stale: re-read it. */
const getSnapshot = () => (listeners.size ? minute : (minute = currentMinute()));

/* --------------------------------------------------------------------------
   Formatting
   -------------------------------------------------------------------------- */

let formatter: Intl.DateTimeFormat | null = null;

function getFormatter(): Intl.DateTimeFormat {
  if (formatter) return formatter;
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  try {
    formatter = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: TIMEZONE });
  } catch {
    // Very old engines without IANA zone data: fall back to the visitor's zone.
    formatter = new Intl.DateTimeFormat('en-GB', options);
  }
  return formatter;
}

function readParts(date: Date): { hours: string; minutes: string } {
  const parts = getFormatter().formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '00';
  // Some engines format midnight as "24" with hour12: false.
  const hours = get('hour') === '24' ? '00' : get('hour');
  return { hours, minutes: get('minute') };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LocalTime({ className, withLabel = false }: LocalTimeProps) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { hours, minutes } = readParts(new Date(now));
  const value = `${hours}:${minutes}`;

  return (
    <time className={cx('fx-time', className)} dateTime={value}>
      <span className="fx-sr">{withLabel ? `${value} ${TIMEZONE_LABEL}` : value}</span>
      <span className="fx-time__digits" aria-hidden="true">
        {hours}
        <span className="fx-time__colon">:</span>
        {minutes}
        {withLabel && <span className="fx-time__zone"> {TIMEZONE_LABEL}</span>}
      </span>
    </time>
  );
}
