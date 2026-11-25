/**
 * ProjectArt: generative, deterministic key-art for a project.
 *
 * Contract (DESIGN_SPEC section 5):
 *   <ProjectArt project={p} index={i} variant="card" | "stack" | "hero" className? />
 *   - Fills its parent (100% x 100%); the parent owns size / aspect ratio / radius.
 *   - project.imageUrl set   -> renders that image (accent overlay, hover zoom), alt = "<title> preview".
 *   - project.imageUrl empty -> renders the generative "infrastructure diagram" art (aria-hidden).
 *   - Brightens / speeds up while an ancestor with class `art-hover-host` is hovered.
 *
 * The art reads like product-launch key-art for a backend system: a glass "core" chip holding a glyph,
 * tilted orbit rings with travelling particles (the front half of each ring passes IN FRONT of the chip),
 * PCB-style data traces routed to nodes labelled with the project's stack, packets flowing along them,
 * a floating code chip, mono corner labels and (variant "stack") a boot log that "loads" each module.
 *
 * Determinism: every random choice comes from a PRNG seeded by project.slug, so each project is unique
 * but identical on every render / reload. Geometry is computed in CSS pixels from the measured size
 * (ResizeObserver), so circles stay circles and labels stay crisp from 280px to 1600px wide.
 *
 * Motion: CSS only (transform, opacity, stroke-dashoffset), keyframes named art-*. Animations pause when
 * the art is offscreen and are removed under prefers-reduced-motion (see project-art.css).
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Blocks, Cpu, Database, Layers3, Network, type LucideIcon } from 'lucide-react';
import type { Project } from '../types';
import { safeUrl } from '../lib/api';
import './project-art.css';

export type ProjectArtVariant = 'card' | 'stack' | 'hero';

export interface ProjectArtProps {
  project: Project;
  index?: number;
  variant?: ProjectArtVariant;
  className?: string;
}

/* ================================================================================================
   Palette, glyphs and snippets
   ================================================================================================ */

type Accent = Project['accent'];

interface AccentSpec {
  /** Main accent (matches the spec's project accent table). */
  hex: string;
  /** Same color as an "r, g, b" triplet for rgba(). */
  rgb: string;
  /** Secondary light mixed into the mesh glow and used for strings in the code chip. */
  alt: string;
  /** Accent-tinted near-black base. */
  deep: string;
}

const ACCENTS: Record<Accent, AccentSpec> = {
  emerald: { hex: '#5cf0a8', rgb: '92, 240, 168', alt: '122, 215, 240', deep: '#050d0c' },
  violet: { hex: '#a5adff', rgb: '165, 173, 255', alt: '122, 215, 240', deep: '#08091a' },
  blue: { hex: '#8fb8ff', rgb: '143, 184, 255', alt: '165, 173, 255', deep: '#060b17' },
  orange: { hex: '#f4c38a', rgb: '244, 195, 138', alt: '245, 163, 181', deep: '#110b07' },
  rose: { hex: '#f5a3b5', rgb: '245, 163, 181', alt: '165, 173, 255', deep: '#12080f' },
};

/** Core glyph, picked by index (same order as the original cards). */
const GLYPHS: LucideIcon[] = [Network, Cpu, Blocks, Database, Layers3];

/** One code fragment per accent (carried over from the original card art). */
const SNIPPETS: Record<Accent, string> = {
  emerald: 'transaction.status = "settled"',
  violet: 'await agents.collaborate()',
  blue: 'community.connect(people)',
  orange: 'subscriptions.activate()',
  rose: 'learn.create(impact)',
};

/* ================================================================================================
   Variant configuration
   ================================================================================================ */

interface Size {
  w: number;
  h: number;
}

interface VariantConfig {
  /** Size used before the first measurement (matches the CSS aspect-ratio fallback). */
  fallback: Size;
  /** Orbit radii as multiples of the chip size. */
  rings: number[];
  /** Number of data traces at full size (halved in compact layouts). */
  traces: number;
  /** Background "data points". */
  stars: number;
  /** Duration multiplier: > 1 is slower and calmer. */
  tempo: number;
  /** Chip size multiplier. */
  chipScale: number;
}

const VARIANTS: Record<ProjectArtVariant, VariantConfig> = {
  card: { fallback: { w: 560, h: 350 }, rings: [0.92, 1.42, 2.05], traces: 4, stars: 12, tempo: 1, chipScale: 1 },
  stack: { fallback: { w: 600, h: 450 }, rings: [0.92, 1.42, 2.05], traces: 5, stars: 16, tempo: 1.15, chipScale: 1.04 },
  hero: { fallback: { w: 1260, h: 540 }, rings: [0.92, 1.42, 2.05, 2.9], traces: 8, stars: 30, tempo: 1.6, chipScale: 1.12 },
};

/** Terminal metrics; MUST match .art-term in project-art.css (used to reserve layout space). */
const TERM = { header: 30, line: 18, padY: 10, progress: 14 } as const;
/** Height reserved for the floating code chip (matches .art-code). */
const CODE_H = 32;

/* ================================================================================================
   Deterministic randomness
   ================================================================================================ */

/** FNV-1a with a murmur3 finalizer: fast, well-distributed 32-bit string hash. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: tiny seeded PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent stream per feature, so resizing (which changes counts) never reshuffles other features. */
function stream(seed: number, feature: string): () => number {
  return mulberry32(hashString(`${seed}:${feature}`));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;

/* ================================================================================================
   Scene model
   ================================================================================================ */

type Side = 'left' | 'right';

interface Ring {
  rx: number;
  ry: number;
  tilt: number;
  /** Seconds per revolution. */
  dur: number;
  reverse: boolean;
  /** Particle start positions on the ring, 0..1. */
  phases: number[];
  dashed: boolean;
  alpha: number;
  /** Comet tail lengths in pathLength units (0..100), derived from fixed pixel lengths. */
  tailNear: number;
  tailFar: number;
}

interface Trace {
  key: string;
  side: Side;
  d: string;
  len: number;
  /** Where the trace leaves the chip edge (pin start). */
  edge: { x: number; y: number };
  port: { x: number; y: number };
  node: { x: number; y: number };
  label: string;
  labelX: number;
  labelY: number;
  /** Estimated label width (px), used to size the "service box" behind it. */
  labelW: number;
  /** Packet timing (seconds). */
  dur: number;
  delay: number;
  inbound: boolean;
  pulseDelay: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  dur: number;
  delay: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  o?: number;
}

interface TerminalPlan {
  width: number;
  /** Top edge (px), used to keep nodes and the chip clear of the panel. */
  top: number;
  left: number;
  lines: string[];
  wide: boolean;
}

interface Scene {
  w: number;
  h: number;
  /** Global scale unit (1 at a 560px wide card). */
  u: number;
  pad: number;
  cx: number;
  cy: number;
  /** Chip size (px). */
  chip: number;
  tilt: number;
  rings: Ring[];
  tickRing: number;
  traces: Trace[];
  pins: Segment[];
  ticks: Segment[];
  stars: Star[];
  labelSize: number;
  packet: { head: number; tail: number };
  glow: { x1: number; y1: number; x2: number; y2: number };
  showCode: boolean;
  showLabels: boolean;
  terminal: TerminalPlan | null;
  /** Labels drawn as boxed "services" sitting on the trace (stack / hero). */
  pills: boolean;
  /** Light disc in the orbital plane: radius (px) and vertical squash. */
  disc: { r: number; k: number };
  hex: string;
}

/** Terminal (variant "stack") placement: bottom-right panel when wide, full-width strip when narrow. */
function planTerminal(w: number, h: number, pad: number, stack: string[]): TerminalPlan | null {
  if (w < 260 || h < 230) return null;
  const wide = w >= 520;
  const width = wide ? clamp(w * 0.42, 220, 300) : w - pad * 2;
  const fixed = TERM.header + TERM.padY * 2 + TERM.progress + TERM.line * 2; // header, cmd + done lines
  const budget = (wide ? h * 0.58 : h * 0.46) - fixed;
  const count = Math.max(0, Math.min(stack.length, 5, Math.floor(budget / TERM.line)));
  const height = fixed + TERM.line * count;
  return { width, top: h - pad - height, left: w - pad - width, lines: stack.slice(0, count), wide };
}

/**
 * Route one side's traces: chip port -> horizontal -> 45deg chamfer -> vertical -> chamfer -> node.
 * Traces are nested (the one travelling furthest vertically turns closest to the chip), so they never cross.
 */
function routeSide(opts: {
  side: Side;
  rand: () => number;
  count: number;
  cx: number;
  cy: number;
  chip: number;
  u: number;
  yMin: number;
  yMax: number;
  xMin: number;
  xMax: number;
  labels: string[];
  labelSize: number;
  showLabels: boolean;
  pills: boolean;
  tempo: number;
}): { traces: Trace[]; pins: Segment[] } {
  const { side, rand, cx, cy, chip, u, yMin, yMax, xMin, xMax, labelSize, pills, tempo } = opts;
  // Fixed draw count per slot keeps positions stable while counts change with size.
  const jitter = Array.from({ length: 6 }, () => [rand(), rand(), rand(), rand(), rand()]);
  const span = yMax - yMin;
  const count = Math.max(0, Math.min(opts.count, Math.floor(span / 34)));
  if (count === 0) return { traces: [], pins: [] };

  const dir = side === 'left' ? -1 : 1; // outward x direction
  const slot = span / count;
  const nodes = Array.from({ length: count }, (_, i) => ({
    x: xMin + jitter[i][0] * (xMax - xMin),
    y: yMin + slot * (i + 0.5) + (jitter[i][1] - 0.5) * slot * 0.42,
    label: opts.showLabels ? (opts.labels[i] ?? '') : '',
  }));

  // Ports: node y-order compressed onto the chip edge, so traces fan out without crossing.
  const portHalf = chip * 0.28;
  const spread = Math.max(1, ...nodes.map(n => Math.abs(n.y - cy)));
  const edgeX = cx + dir * chip * 0.5;
  const pin = Math.max(4, 6 * u);
  const portX = edgeX + dir * pin;

  const charW = labelSize * 0.72; // mono advance (0.6em) + letter-spacing (0.12em)
  const widthOf = (label: string) => Math.max(0, label.length * charW - labelSize * 0.12);
  const needOf = (label: string) => (label ? widthOf(label) + (pills ? 34 : 22) : 16);
  // Farthest-out turning point any trace may use while keeping its label clear.
  let far = dir < 0 ? Math.max(...nodes.map(n => n.x + needOf(n.label))) : Math.min(...nodes.map(n => n.x - needOf(n.label)));
  const near = portX + dir * 14 * u;
  if ((dir < 0 && far > near - 4) || (dir > 0 && far < near + 4)) {
    // Not enough room for labels: drop them and retry with the minimum clearance.
    nodes.forEach(n => { n.label = ''; });
    far = dir < 0 ? Math.max(...nodes.map(n => n.x + 16)) : Math.min(...nodes.map(n => n.x - 16));
  }

  // Traces travelling furthest vertically turn closest to the chip.
  const order = nodes
    .map((n, i) => ({ i, dy: Math.abs(n.y - (cy + ((n.y - cy) / spread) * portHalf)) }))
    .sort((a, b) => b.dy - a.dy)
    .map(o => o.i);

  const traces: Trace[] = [];
  const pins: Segment[] = [];
  order.forEach((nodeIndex, rank) => {
    const n = nodes[nodeIndex];
    const j = jitter[nodeIndex];
    const py = cy + ((n.y - cy) / spread) * portHalf;
    const t = count === 1 ? 0.5 : rank / (count - 1);
    const xm = near + (far - near) * t;
    const dy = n.y - py;
    const sy = Math.sign(dy) || 1;
    const c = Math.min(8 * u + 2, Math.abs(dy) / 2, Math.abs(xm - portX) / 2, Math.abs(n.x - xm) / 2);

    const pts: [number, number][] =
      Math.abs(dy) < 1
        ? [[portX, py], [n.x, n.y]]
        : [
            [portX, py],
            [xm - dir * c, py],
            [xm, py + sy * c],
            [xm, n.y - sy * c],
            [xm + dir * c, n.y],
            [n.x, n.y],
          ];
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const d = `M${pts.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L')}`;

    const speed = 70 * u; // px per second while a packet is travelling
    const dur = ((len / speed) / 0.7) * tempo; // packet travels for 70% of the cycle (see art-flow)
    traces.push({
      key: `${side}-${nodeIndex}`,
      side,
      d,
      len: round(len),
      edge: { x: edgeX, y: py },
      port: { x: portX, y: py },
      node: { x: n.x, y: n.y },
      label: n.label,
      // Boxed labels sit ON the trace next to the node; plain labels float just above it.
      labelX: n.x - dir * (pills ? 15 : 11),
      labelY: pills ? n.y + labelSize * 0.36 : n.y - 7,
      labelW: round(widthOf(n.label)),
      dur: round(dur),
      delay: round(-j[2] * dur),
      inbound: j[3] < 0.5,
      pulseDelay: round(-j[4] * 3.2),
    });
    pins.push({ x1: edgeX, y1: py, x2: portX, y2: py });
  });
  return { traces, pins };
}

function buildScene(seed: number, variant: ProjectArtVariant, size: Size, stack: string[]): Scene {
  const cfg = VARIANTS[variant];
  const { w, h } = size;
  const u = clamp(Math.min(w, h * 1.6) / 560, 0.5, 1.6);
  const pad = Math.round(clamp(w * 0.036, 12, 26));
  const compact = w < 440 || h < 240;
  const labelSize = round(9.5 * clamp(u, 0.92, 1.16));
  const showLabels = w >= 420 && h >= 220;
  const pills = variant !== 'card' && w >= 520;

  /* ---- Panels that reserve space ---- */
  const terminal = variant === 'stack' ? planTerminal(w, h, pad, stack) : null;
  const showCode = w >= 280 && h >= 180 && (!terminal || (terminal.wide && w >= 580));

  /* ---- Core chip ---- */
  const rc = stream(seed, 'chip');
  let chip = clamp(96 * u * cfg.chipScale, 46, 164);
  let cx = w * (0.5 + (rc() - 0.5) * 0.06);
  let cy = h * (0.5 + (rc() - 0.5) * 0.05);
  if (terminal) {
    if (terminal.wide) {
      // Centre-left, above the log panel's top edge whenever the two overlap horizontally.
      cx = Math.min(w * 0.42, terminal.left - 12);
      cy = h * 0.41;
      if (cx + chip * 0.5 + 8 > terminal.left) cy = Math.min(cy, terminal.top - chip * 0.62);
    } else {
      const top = pad + 26;
      const bottom = terminal.top - 10;
      chip = Math.min(chip, (bottom - top) * 0.5);
      cx = w * 0.5;
      cy = (top + bottom) / 2;
    }
  }
  chip = Math.round(chip);

  /* ---- Orbits ---- */
  const rr = stream(seed, 'rings');
  const tilt = (rr() < 0.5 ? -1 : 1) * (9 + rr() * 10);
  const rings: Ring[] = cfg.rings.map((m, i) => {
    const values = [rr(), rr(), rr(), rr(), rr()];
    const rx = chip * m * (0.95 + values[0] * 0.1);
    const ry = rx * (0.3 + values[1] * 0.1);
    const dur = round((12 + i * 7 + values[2] * 5) * cfg.tempo);
    // Ramanujan's ellipse perimeter, so tails have the same pixel length on every ring.
    const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    return {
      rx: round(rx),
      ry: round(ry),
      tailNear: round(clamp((14 * u) / perimeter, 0.01, 0.08) * 100),
      tailFar: round(clamp((44 * u) / perimeter, 0.03, 0.18) * 100),
      tilt: round(tilt + (values[3] - 0.5) * 6),
      dur,
      reverse: i % 2 === 1,
      phases: i === 1 ? [values[4], (values[4] + 0.5) % 1] : [values[4]],
      dashed: i === cfg.rings.length - 1,
      alpha: round(0.3 - i * 0.05),
    };
  });

  /* ---- Data traces ---- */
  const total = compact ? Math.max(2, Math.round(cfg.traces / 2)) : cfg.traces;
  const leftCount = Math.ceil(total / 2);
  const rightCount = total - leftCount;
  const yTop = pad + 36 * clamp(u, 0.8, 1.2);
  const leftBottom = showCode ? h - pad - CODE_H - 22 : h - pad - 30;
  const rightBottom = terminal ? terminal.top - 22 : h - pad - 34;
  const edgeBand = clamp(w * 0.1, 24, 150);
  // Stack items alternate sides top-to-bottom: left[0], right[0], left[1] ...
  const labels = stack.map(s => s.toUpperCase());
  const leftLabels = labels.filter((_, i) => i % 2 === 0);
  const rightLabels = labels.filter((_, i) => i % 2 === 1);
  const common = { cx, cy, chip, u, labelSize, showLabels, pills, tempo: cfg.tempo };
  const left = routeSide({
    ...common,
    side: 'left',
    rand: stream(seed, 'left'),
    count: leftCount,
    yMin: yTop,
    yMax: terminal && !terminal.wide ? Math.min(leftBottom, terminal.top - 18) : leftBottom,
    xMin: pad + 8,
    xMax: pad + 8 + edgeBand,
    labels: leftLabels,
  });
  const right = routeSide({
    ...common,
    side: 'right',
    rand: stream(seed, 'right'),
    count: rightCount,
    yMin: yTop,
    yMax: rightBottom,
    xMin: w - pad - 8 - edgeBand,
    xMax: w - pad - 8,
    labels: rightLabels,
  });

  /* ---- Decorative pins on the chip's top and bottom edges ---- */
  const pins = [...left.pins, ...right.pins];
  const pinLen = Math.max(3, 5 * u);
  for (let i = 0; i < 4; i++) {
    const x = cx - chip * 0.27 + (chip * 0.54 * i) / 3;
    pins.push({ x1: x, y1: cy - chip / 2, x2: x, y2: cy - chip / 2 - pinLen });
    pins.push({ x1: x, y1: cy + chip / 2, x2: x, y2: cy + chip / 2 + pinLen });
  }

  /* ---- Crosshair ruler ticks centred on the chip ---- */
  const ticks: Segment[] = [];
  const step = Math.max(7, Math.round(10 * u));
  const reachX = Math.min(w / 2, chip * 2.3);
  const reachY = Math.min(h / 2, chip * 1.5);
  for (let i = 1; i * step < reachX; i++) {
    const big = i % 5 === 0;
    const len = big ? 6 : 3;
    const o = round(1 - (i * step) / reachX);
    for (const s of [-1, 1]) ticks.push({ x1: cx + s * i * step, y1: cy - len / 2, x2: cx + s * i * step, y2: cy + len / 2, o });
  }
  for (let i = 1; i * step < reachY; i++) {
    const big = i % 5 === 0;
    const len = big ? 6 : 3;
    const o = round(1 - (i * step) / reachY);
    for (const s of [-1, 1]) ticks.push({ x1: cx - len / 2, y1: cy + s * i * step, x2: cx + len / 2, y2: cy + s * i * step, o });
  }

  /* ---- Background data points (kept clear of the chip, nodes, labels and corner tags) ---- */
  const rs = stream(seed, 'stars');
  const starCount = compact ? Math.ceil(cfg.stars / 2) : cfg.stars;
  const allTraces = [...left.traces, ...right.traces];
  const charW = labelSize * 0.72;
  const crowded = (x: number, y: number) =>
    Math.hypot(x - cx, (y - cy) * 1.6) < chip * 1.1 ||
    // corner tag rows / code chip / hash (the centre of the top and bottom bands stays open)
    ((y < pad + 26 || y > h - pad - CODE_H - 14) && (x < w * 0.36 || x > w * 0.64)) ||
    allTraces.some(t => {
      if (Math.hypot(x - t.node.x, y - t.node.y) < 26) return true;
      if (!t.label) return false;
      const x0 = t.side === 'left' ? t.labelX - 12 : t.labelX - t.label.length * charW - 12;
      const x1 = x0 + t.label.length * charW + 24;
      return x > x0 && x < x1 && Math.abs(y - (t.labelY - labelSize * 0.35)) < labelSize + 8;
    }) ||
    (terminal !== null && x > terminal.left - 10 && y > terminal.top - 10);
  const stars: Star[] = [];
  for (let i = 0; i < 60 && stars.length < starCount; i++) {
    const values = [rs(), rs(), rs(), rs(), rs()];
    const x = values[0] * w;
    const y = values[1] * h;
    if (crowded(x, y)) continue;
    stars.push({ x: round(x), y: round(y), r: round(0.5 + values[2] * 0.9), dur: round(3 + values[3] * 4), delay: round(-values[4] * 7) });
  }

  /* ---- Mesh glow anchors (percent) ---- */
  const rg = stream(seed, 'glow');
  const glow = {
    x1: round((cx / w) * 100 + (rg() - 0.5) * 16),
    y1: round((cy / h) * 100 + (rg() - 0.5) * 14),
    x2: rg() < 0.5 ? 10 + rg() * 12 : 78 + rg() * 12,
    y2: rg() < 0.5 ? 8 + rg() * 14 : 80 + rg() * 12,
  };

  return {
    w,
    h,
    u,
    pad,
    cx: round(cx),
    cy: round(cy),
    chip,
    tilt: round(tilt),
    rings,
    tickRing: round(chip * 0.74),
    traces: allTraces,
    pins,
    ticks,
    stars,
    labelSize,
    packet: { head: round(9 * clamp(u, 0.8, 1.3)), tail: round(42 * clamp(u, 0.8, 1.3)) },
    glow,
    showCode,
    showLabels,
    terminal,
    pills,
    disc: {
      r: round(rings[rings.length - 1].rx * 1.04),
      k: round(rings.reduce((sum, ring) => sum + ring.ry / ring.rx, 0) / rings.length * 100) / 100,
    },
    hex: seed.toString(16).padStart(8, '0').slice(0, 4).toUpperCase(),
  };
}

/* ================================================================================================
   Hooks
   ================================================================================================ */

/** Untransformed layout size of an element (ignores parent scale transforms), integer px. */
function useElementSize(ref: RefObject<HTMLElement | null>, fallback: Size): Size {
  const [size, setSize] = useState<Size>(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (w > 0 && h > 0) setSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Pause every CSS animation inside the art while it is offscreen (data-inview="false"). */
function useOffscreenPause(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => { el.dataset.inview = entry.isIntersecting ? 'true' : 'false'; },
      { rootMargin: '120px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

type NamedAnimation = Animation & { animationName?: string };

/**
 * While the nearest `.art-hover-host` ancestor is hovered, ease every orbit / packet animation up to a
 * slightly faster playback rate. Uses updatePlaybackRate, so motion accelerates smoothly instead of
 * jumping (changing animation-duration in CSS would teleport the particles).
 */
function useHoverTempo(ref: RefObject<HTMLElement | null>, boost = 1.7) {
  useEffect(() => {
    const el = ref.current;
    const host = el?.closest<HTMLElement>('.art-hover-host');
    if (!el || !host || typeof el.getAnimations !== 'function') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let rate = 1;
    let target = 1;
    const apply = () => {
      for (const animation of el.getAnimations({ subtree: true }) as NamedAnimation[]) {
        const name = animation.animationName;
        // CSS animations only (skip transitions) and keep the boot log on its own clock.
        if (!name || name.startsWith('art-log')) continue;
        animation.updatePlaybackRate(rate);
      }
    };
    const tick = () => {
      rate += (target - rate) * 0.12;
      if (Math.abs(target - rate) < 0.01) rate = target;
      apply();
      raf = rate === target ? 0 : requestAnimationFrame(tick);
    };
    const to = (value: number) => () => {
      if (reduced.matches) return;
      target = value;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const enter = to(boost);
    const leave = to(1);
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointerleave', leave);
    };
  }, [ref, boost]);
}

/* ================================================================================================
   Small render helpers
   ================================================================================================ */

type TokenKind = 'kw' | 'str' | 'fn' | 'prop' | 'id' | 'punc' | 'ws';

const TOKEN_RE = /(\s+)|("(?:[^"\\]|\\.)*")|\b(await|const|return|new|async)\b|([A-Za-z_$][\w$]*)(?=\()|([A-Za-z_$][\w$]*)|([^\sA-Za-z_$"]+)/g;

/** Minimal JS highlighter for the one-line snippets (no HTML injection: returns text tokens). */
function tokenize(code: string): { text: string; kind: TokenKind }[] {
  const out: { text: string; kind: TokenKind }[] = [];
  for (const m of code.matchAll(TOKEN_RE)) {
    const prev = out[out.length - 1]?.text ?? '';
    let kind: TokenKind = 'punc';
    if (m[1]) kind = 'ws';
    else if (m[2]) kind = 'str';
    else if (m[3]) kind = 'kw';
    else if (m[4]) kind = 'fn';
    else if (m[5]) kind = prev.endsWith('.') ? 'prop' : 'id';
    out.push({ text: m[0], kind });
  }
  return out;
}

const vars = (values: Record<string, string | number>) => values as CSSProperties;

/**
 * Dash offsets for one packet (bright head + faint comet tail) travelling along a trace.
 * A dash with offset `o` covers [-o, -o + length] along the path. The animation (art-flow) runs from
 * --art-from (packet fully before the start) to --art-to (fully past the end); inbound packets play the
 * same keyframes in reverse, so their tail must sit on the other side of the head.
 * The plain strokeDashoffset is the frozen mid-path frame shown when animations are off.
 */
function packetMotion(t: Trace, head: number, tail: number) {
  const len = t.len;
  const px = (n: number) => `${round(n)}px`;
  const mid = -len * 0.45;
  const gap = round(len + head + tail + 40); // one packet per pattern period
  if (t.inbound) {
    return {
      gap,
      head: { '--art-from': px(head + tail + 1), '--art-to': px(-len - 1), strokeDashoffset: px(mid) },
      tail: { '--art-from': px(tail + 1), '--art-to': px(-len - head - 1), strokeDashoffset: px(mid - head) },
    };
  }
  return {
    gap,
    head: { '--art-from': px(head + 1), '--art-to': px(-len - tail - 1), strokeDashoffset: px(mid) },
    tail: { '--art-from': px(head + tail + 1), '--art-to': px(-len - 1), strokeDashoffset: px(mid + tail) },
  };
}

/* ================================================================================================
   Image mode
   ================================================================================================ */

function ProjectImage({ project, src, variant, className, accent, onError }: {
  project: Project;
  src: string;
  variant: ProjectArtVariant;
  className?: string;
  accent: AccentSpec;
  onError: () => void;
}) {
  return (
    <div
      className={['art', 'art--image', `art--${variant}`, className].filter(Boolean).join(' ')}
      style={vars({ '--art-accent': accent.hex, '--art-accent-rgb': accent.rgb, '--art-alt-rgb': accent.alt, '--art-deep': accent.deep })}
    >
      <img
        className="art-image"
        src={src}
        alt={`${project.title} preview`}
        loading={variant === 'hero' ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onError={onError}
      />
      <span className="art-image__tint" aria-hidden="true" />
    </div>
  );
}

/* ================================================================================================
   Generative mode
   ================================================================================================ */

function GenerativeArt({ project, index, variant, className, accent }: {
  project: Project;
  index: number;
  variant: ProjectArtVariant;
  className?: string;
  accent: AccentSpec;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = `art${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const size = useElementSize(rootRef, VARIANTS[variant].fallback);
  useOffscreenPause(rootRef);
  useHoverTempo(rootRef);

  const seedSource = project.slug || project.title || `project-${index}`;
  const seed = useMemo(() => hashString(seedSource), [seedSource]);
  const stackKey = (project.stack ?? []).map(s => String(s).trim()).filter(Boolean).join('\u0000');
  const scene = useMemo(
    () => buildScene(seed, variant, size, stackKey ? stackKey.split('\u0000') : []),
    [seed, variant, size, stackKey],
  );

  const Glyph = GLYPHS[Math.abs(index) % GLYPHS.length];
  const snippet = SNIPPETS[project.accent] ?? SNIPPETS.emerald;
  const tokens = useMemo(() => tokenize(snippet), [snippet]);
  const indexLabel = String(Math.abs(index) + 1).padStart(2, '0');
  const { w, h, cx, cy, chip, rings, traces } = scene;

  const ringProps = (ring: Ring) => ({
    cx,
    cy,
    rx: ring.rx,
    ry: ring.ry,
    transform: `rotate(${ring.tilt} ${cx} ${cy})`,
  });

  /**
   * Orbit particles: white-hot dot + halo + two-step comet tail, all dash patterns riding the same ellipse.
   * Rendered twice: behind the chip, and (clipped to the front half of the orbit) in front of it.
   */
  const particles = (layer: 'back' | 'front') =>
    rings.flatMap((ring, ri) => {
      // Only orbits that actually pass in front of the chip need a front-layer copy.
      if (layer === 'front' && ring.ry > chip * 0.62) return [];
      // Tail dashes trail the dot: behind it when moving forward, on its other side when reversed.
      const tail = (len: number) => (ring.reverse ? `${len} ${round(100 - len)}` : `0 ${round(100 - len)} ${len} 0`);
      return ring.phases.map((phase, pi) => {
        const style: CSSProperties = {
          animationDuration: `${ring.dur}s`,
          animationDelay: `${round(-phase * ring.dur)}s`,
          animationDirection: ring.reverse ? 'reverse' : 'normal',
          // Frozen position used when animations are off (reduced motion).
          strokeDashoffset: ring.reverse ? round(-100 + phase * 100) : round(-phase * 100),
        };
        return (
          <g key={`${layer}-${ri}-${pi}`}>
            <ellipse {...ringProps(ring)} className="art-orbit-tail art-orbit-tail--far" pathLength={100} strokeDasharray={tail(ring.tailFar)} style={style} />
            <ellipse {...ringProps(ring)} className="art-orbit-tail" pathLength={100} strokeDasharray={tail(ring.tailNear)} style={style} />
            <ellipse {...ringProps(ring)} className="art-orbit-halo" pathLength={100} style={style} />
            <ellipse {...ringProps(ring)} className="art-orbit-dot" pathLength={100} style={style} />
          </g>
        );
      });
    });

  const rootStyle = vars({
    '--art-accent': accent.hex,
    '--art-accent-rgb': accent.rgb,
    '--art-alt-rgb': accent.alt,
    '--art-deep': accent.deep,
    '--art-pad': `${scene.pad}px`,
    '--art-cx': `${cx}px`,
    '--art-cy': `${cy}px`,
    '--art-chip': `${chip}px`,
    '--art-g1x': `${scene.glow.x1}%`,
    '--art-g1y': `${scene.glow.y1}%`,
    '--art-g2x': `${scene.glow.x2}%`,
    '--art-g2y': `${scene.glow.y2}%`,
    '--art-tempo': VARIANTS[variant].tempo,
  });

  return (
    <div
      ref={rootRef}
      className={['art', `art--${variant}`, className].filter(Boolean).join(' ')}
      style={rootStyle}
      aria-hidden="true"
      data-variant={variant}
    >
      {/* ---------- Light: accent mesh, fine grid, core glow ---------- */}
      <span className="art__mesh" />
      <span className="art__grid" />
      <span className="art__core" />
      {/* Light disc lying in the orbital plane, with a slow sweep. */}
      <span
        className="art-disc"
        style={{
          left: cx,
          top: cy,
          width: scene.disc.r * 2,
          height: scene.disc.r * 2,
          transform: `translate(-50%, -50%) rotate(${scene.tilt}deg) scaleY(${scene.disc.k})`,
        }}
      >
        <span className="art-disc__sweep" />
      </span>

      {/* ---------- Diagram (behind the chip) ---------- */}
      <svg className="art-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id={`${uid}-gx`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset={round(cx / w)} stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-gy`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={h}>
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset={round(cy / h)} stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.85" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="art-stars">
          {scene.stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }} />
          ))}
        </g>

        <g className="art-cross">
          <line x1={0} y1={cy} x2={w} y2={cy} stroke={`url(#${uid}-gx)`} />
          <line x1={cx} y1={0} x2={cx} y2={h} stroke={`url(#${uid}-gy)`} />
          {scene.ticks.map((t, i) => (
            <line key={i} className="art-tick" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeOpacity={t.o} />
          ))}
        </g>

        <g className="art-rings">
          {rings.map((ring, i) => (
            <ellipse key={i} {...ringProps(ring)} className={ring.dashed ? 'art-ring art-ring--dashed' : 'art-ring'} strokeOpacity={ring.alpha} />
          ))}
          <circle className="art-tick-ring" cx={cx} cy={cy} r={scene.tickRing} pathLength={360} />
        </g>

        <g className="art-traces">
          {traces.map(t => <path key={t.key} d={t.d} />)}
        </g>

        <g className="art-packets">
          {traces.map(t => {
            const motion = packetMotion(t, scene.packet.head, scene.packet.tail);
            const timing = {
              animationDuration: `${t.dur}s`,
              animationDelay: `${t.delay}s`,
              animationDirection: t.inbound ? 'reverse' : 'normal',
            };
            return (
              <g key={t.key}>
                <path
                  d={t.d}
                  className="art-packet-tail"
                  strokeDasharray={`${scene.packet.tail} ${motion.gap}`}
                  style={vars({ ...timing, ...motion.tail })}
                />
                <path
                  d={t.d}
                  className="art-packet-halo"
                  strokeDasharray={`${scene.packet.head} ${motion.gap}`}
                  style={vars({ ...timing, ...motion.head })}
                />
                <path
                  d={t.d}
                  className="art-packet"
                  strokeDasharray={`${scene.packet.head} ${motion.gap}`}
                  style={vars({ ...timing, ...motion.head })}
                />
              </g>
            );
          })}
        </g>

        <g className="art-pins">
          {scene.pins.map((p, i) => <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />)}
        </g>

        <g className="art-nodes">
          {traces.map(t => (
            <g key={t.key}>
              <circle className="art-node-ping" cx={t.node.x} cy={t.node.y} r={6} style={{ animationDelay: `${t.pulseDelay}s` }} />
              <circle className="art-node" cx={t.node.x} cy={t.node.y} r={3.4} />
              <circle className="art-node-core" cx={t.node.x} cy={t.node.y} r={1.5} />
              {t.label && scene.pills && (
                <rect
                  className="art-node-box"
                  x={round(t.side === 'left' ? t.labelX - 8 : t.labelX - t.labelW - 8)}
                  y={round(t.node.y - scene.labelSize * 0.5 - 6)}
                  width={round(t.labelW + 16)}
                  height={round(scene.labelSize + 12)}
                  rx={4}
                />
              )}
              {t.label && (
                <text
                  className="art-node-label"
                  x={round(t.labelX)}
                  y={round(t.labelY)}
                  textAnchor={t.side === 'left' ? 'start' : 'end'}
                  style={{ fontSize: `${scene.labelSize}px` }}
                >
                  {t.label}
                </text>
              )}
            </g>
          ))}
        </g>

        <g className="art-particles">{particles('back')}</g>
      </svg>

      <span className="art__vignette" />

      {/* ---------- Core chip ---------- */}
      <div className="art-chip" style={{ left: cx, top: cy, width: chip, height: chip }}>
        <span className="art-chip__halo" />
        <span className="art-chip__ping" />
        <span className="art-chip__ping art-chip__ping--late" />
        <div className="art-chip__float">
          <div className="art-chip__body">
            <span className="art-chip__rim"><span className="art-chip__rim-spin" /></span>
            <span className="art-chip__marker" />
            <div className="art-chip__die">
              <span className="art-chip__dots" />
              <Glyph className="art-chip__glyph" size={Math.round(chip * 0.34)} strokeWidth={1.4} absoluteStrokeWidth />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Diagram (in front of the chip): front half of every orbit ---------- */}
      <svg className="art-svg art-svg--front" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <clipPath id={`${uid}-front`}>
            <rect x={-w * 2} y={0} width={w * 4} height={h * 2} transform={`translate(${cx} ${cy}) rotate(${scene.tilt})`} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-front)`}>
          {rings.map((ring, i) => (
            <ellipse key={i} {...ringProps(ring)} className="art-ring-front" stroke={`url(#${uid}-ring)`} strokeOpacity={ring.alpha * 2.2} />
          ))}
          <g className="art-particles">{particles('front')}</g>
        </g>
      </svg>

      {/* ---------- Mono labels ---------- */}
      <span className="art-tag art-tag--tl">
        <b>{indexLabel}</b>
        <i>/</i>
        CASE STUDY
      </span>
      <span className="art-tag art-tag--tr">
        SYSTEM ONLINE
        <span className="art-live" />
      </span>
      {!scene.terminal && (
        <span className="art-tag art-tag--br">
          <span className="art-eq"><i /><i /><i /><i /><i /></span>
          0x{scene.hex}
        </span>
      )}

      {/* ---------- Floating code chip ---------- */}
      {scene.showCode && (
        <div className="art-code">
          <span className="art-code__dot" />
          <code className="art-code__text">
            {tokens.map((t, i) => <span key={i} className={`art-tok art-tok--${t.kind}`}>{t.text}</span>)}
          </code>
          <span className="art-code__caret" />
        </div>
      )}

      {/* ---------- Boot log (variant "stack") ---------- */}
      {scene.terminal && (
        <div className={`art-term${scene.terminal.wide ? '' : ' art-term--full'}`} style={{ width: scene.terminal.width }}>
          <div className="art-term__bar">
            <span className="art-term__lights"><i /><i /><i /></span>
            <span className="art-term__file">modules.log</span>
            <span className="art-term__live"><span className="art-live" />live</span>
          </div>
          <div className="art-term__body">
            <p className="art-term__row art-term__cmd">
              <span className="art-term__prompt">$</span> boot <span className="art-term__arg">./{project.slug || 'project'}</span>
            </p>
            {scene.terminal.lines.map((item, i) => (
              <p key={`${item}-${i}`} className={`art-term__row art-term__line art-log-slot-${i}`}>
                <span className="art-term__check">
                  <span className="art-term__wait">··</span>
                  <span className="art-term__ok">✓</span>
                </span>
                <span className="art-term__name">{item.toLowerCase()}</span>
                <span className="art-term__status">
                  <span className="art-term__wait">loading</span>
                  <span className="art-term__ok">ready</span>
                </span>
              </p>
            ))}
            <p className={`art-term__row art-term__done art-log-slot-${scene.terminal.lines.length}`}>
              <span className="art-term__prompt">→</span> {scene.terminal.lines.length ? 'all modules online' : 'core online'}
            </p>
          </div>
          <div className="art-term__progress">
            {scene.terminal.lines.map((item, i) => <i key={`${item}-${i}`} className={`art-log-slot-${i}`} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================================================
   Public component
   ================================================================================================ */

export function ProjectArt({ project, index = 0, variant = 'card', className }: ProjectArtProps) {
  const accent = ACCENTS[project.accent] ?? ACCENTS.emerald;
  const imageUrl = safeUrl(project.imageUrl);
  // Remember a URL that failed to load and fall back to the generative art for it.
  const [failedUrl, setFailedUrl] = useState('');

  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <ProjectImage
        project={project}
        src={imageUrl}
        variant={variant}
        className={className}
        accent={accent}
        onError={() => setFailedUrl(imageUrl)}
      />
    );
  }
  return <GenerativeArt project={project} index={index} variant={variant} className={className} accent={accent} />;
}

