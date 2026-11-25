/**
 * Scroll positions per history entry (keyed by React Router's `location.key`), so Back/Forward can
 * return the visitor to where they were. Mirrored to sessionStorage so the positions survive a
 * reload of the tab (history entries and their keys do too). Storage may be unavailable: then the
 * in-memory map is used alone.
 */
const STORAGE_KEY = 'jm:scroll-positions';
const MAX_ENTRIES = 60;

let positions: Map<string, number> | null = null;

function store(): Map<string, number> {
  if (positions) return positions;
  positions = new Map();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && Number.isFinite(entry[1])) {
          positions.set(entry[0], entry[1] as number);
        }
      }
    }
  } catch {
    /* storage blocked or corrupt: start empty */
  }
  return positions;
}

/** Remember the scroll offset of a history entry (most recent entries win when the cap is reached). */
export function saveScrollPosition(key: string, y: number): void {
  const map = store();
  map.delete(key);
  map.set(key, Math.max(0, Math.round(y)));
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...map]));
  } catch {
    /* ignore: memory only */
  }
}

/** The remembered offset for a history entry, if any. */
export function readScrollPosition(key: string): number | undefined {
  return store().get(key);
}
