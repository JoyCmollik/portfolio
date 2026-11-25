/**
 * SkillConstellation: an interactive d3-force map of site.skillGroups.
 *
 * - Zero props (reads usePortfolio()); fills its container width. The SVG
 *   viewBox is sized in real CSS pixels from a ResizeObserver, so labels stay
 *   legible from ~300px bento cells up to wide panels (height follows width,
 *   and grows when many skills need more room).
 * - Layout: d3-force (charge + collision + per-group gravity + soft bounds),
 *   settled synchronously once ("home" layout, used for the links and as the
 *   static reduced-motion render). When it first scrolls into view the live
 *   simulation "blooms" the orbs out from their group centers.
 * - Rendering: React renders the structure once; positions are written to the
 *   DOM through refs inside one rAF loop (no React state per tick). The loop
 *   only runs while the map is on screen; the simulation only ticks while it
 *   is warm or a node is being dragged; otherwise the loop just applies a
 *   gentle idle drift.
 * - Interaction: hover an orb (or a legend key, incl. keyboard focus) to focus
 *   it and its group; drag to fling on fine pointers; tap to focus on touch.
 * - Reduced motion: static settled layout, no bloom / drift / drag.
 * - Accessibility: the SVG is role="img" with a summary label; a visually
 *   hidden list carries every skill grouped by title.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  forceCollide,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import { usePortfolio } from '../context/PortfolioContext';
import { useFinePointer, usePrefersReducedMotion } from '../lib/motion';
import type { SkillGroup } from '../types';
import './constellation.css';

/* --------------------------------------------------------------------------
   Group tones (token names). The first three are the spec's mint / violet /
   amber; extra groups cycle through the rest of the signal palette.
   -------------------------------------------------------------------------- */
export const SKILL_TONES = ['signal', 'violet', 'amber', 'cyan', 'rose', 'blue'] as const;
export type SkillTone = (typeof SKILL_TONES)[number];

/** Tone for the n-th skill group (shared with the About page chips). */
export function skillTone(groupIndex: number): SkillTone {
  return SKILL_TONES[((groupIndex % SKILL_TONES.length) + SKILL_TONES.length) % SKILL_TONES.length];
}

/** Inline custom properties (--g, --g-rgb) for a group tone. */
export function toneStyle(groupIndex: number): CSSProperties {
  const tone = skillTone(groupIndex);
  return { '--g': `var(--c-${tone})`, '--g-rgb': `var(--c-${tone}-rgb)` } as CSSProperties;
}

/** Visual cap per group (the hidden list and the About chips show all). */
const MAX_PER_GROUP = 10;

/* --------------------------------------------------------------------------
   Model
   -------------------------------------------------------------------------- */
interface Orb extends SimulationNodeDatum {
  key: string;
  label: string;
  lines: string[];
  group: number;
  /** Order inside the whole map (entrance stagger). */
  order: number;
  r: number;
  fs: number;
  x: number;
  y: number;
  /** Settled "home" position. */
  hx: number;
  hy: number;
  phase: number;
}

interface Center {
  x: number;
  y: number;
  ring: number;
}

interface Model {
  w: number;
  h: number;
  gap: number;
  orbs: Orb[];
  links: Array<[number, number]>;
  centers: Center[];
}

const LABEL_FONT = (fs: number) => `600 ${fs}px "Space Grotesk", system-ui, sans-serif`;
const TAG_FS = 9.5;
const TAG_FONT = `500 ${TAG_FS}px "JetBrains Mono", ui-monospace, monospace`;
const TAG_TRACKING = TAG_FS * 0.14;

let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, font: string, fs: number): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return text.length * fs * 0.58;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Two lines for longer multi-word labels ("Stripe" / "Treasury"). */
function splitLabel(label: string): string[] {
  if (label.length <= 10 || !label.includes(' ')) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [label.slice(0, best), label.slice(best + 1)];
}

const clamp = (v: number, min: number, max: number) => (max < min ? (min + max) / 2 : Math.min(max, Math.max(min, v)));

function groupCenters(n: number, w: number, h: number): Array<{ x: number; y: number }> {
  if (n <= 1) return [{ x: w / 2, y: h / 2 }];
  if (n === 2) {
    return w >= h
      ? [{ x: w * 0.3, y: h * 0.5 }, { x: w * 0.7, y: h * 0.5 }]
      : [{ x: w * 0.5, y: h * 0.28 }, { x: w * 0.5, y: h * 0.72 }];
  }
  const wide = w >= h;
  const rx = w * (wide ? 0.29 : 0.24);
  const ry = h * (wide ? 0.27 : 0.29);
  const shift = n === 3 ? h * 0.04 : 0; // optical centering of the triangle
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: w / 2 + Math.cos(a) * rx, y: h / 2 + Math.sin(a) * ry + shift };
  });
}

/** Keeps orbs inside the stage by steering their velocity. */
function boundsForce(w: number, h: number, edge: number): Force<Orb, undefined> {
  let nodes: Orb[] = [];
  const force = () => {
    for (const o of nodes) {
      const minX = o.r + edge;
      const maxX = w - o.r - edge;
      const minY = o.r + edge;
      const maxY = h - o.r - edge;
      const nx = o.x + (o.vx ?? 0);
      const ny = o.y + (o.vy ?? 0);
      if (nx < minX) o.vx = minX - o.x;
      else if (nx > maxX) o.vx = maxX - o.x;
      if (ny < minY) o.vy = minY - o.y;
      else if (ny > maxY) o.vy = maxY - o.y;
    }
  };
  force.initialize = (n: Orb[]) => {
    nodes = n;
  };
  return force;
}

function applyForces(sim: Simulation<Orb, undefined>, model: Pick<Model, 'w' | 'h' | 'gap' | 'centers'>) {
  const { w, h, gap, centers } = model;
  sim
    .force('charge', forceManyBody<Orb>().strength(-16).distanceMax(180))
    .force('collide', forceCollide<Orb>(o => o.r + gap).strength(0.9).iterations(2))
    .force('x', forceX<Orb>(o => centers[o.group].x).strength(0.085))
    .force('y', forceY<Orb>(o => centers[o.group].y).strength(0.085))
    .force('bounds', boundsForce(w, h, 4));
}

/** Minimum spanning tree per group (+ one closing edge) on the home layout. */
function groupLinks(orbs: Orb[]): Array<[number, number]> {
  const links: Array<[number, number]> = [];
  const byGroup = new Map<number, number[]>();
  orbs.forEach((o, i) => byGroup.set(o.group, [...(byGroup.get(o.group) ?? []), i]));
  const d2 = (a: number, b: number) => (orbs[a].hx - orbs[b].hx) ** 2 + (orbs[a].hy - orbs[b].hy) ** 2;

  for (const members of byGroup.values()) {
    if (members.length < 2) continue;
    const linked = new Set<string>();
    const tree = [members[0]];
    const rest = members.slice(1);
    while (rest.length) {
      let bestA = tree[0];
      let bestJ = 0;
      let best = Infinity;
      for (const a of tree) {
        rest.forEach((b, j) => {
          const d = d2(a, b);
          if (d < best) {
            best = d;
            bestA = a;
            bestJ = j;
          }
        });
      }
      const b = rest.splice(bestJ, 1)[0];
      links.push([bestA, b]);
      linked.add(`${Math.min(bestA, b)}-${Math.max(bestA, b)}`);
      tree.push(b);
    }
    // One extra short edge closes a loop: reads as a constellation, not a tree.
    if (members.length >= 4) {
      let extra: [number, number] | null = null;
      let best = Infinity;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const a = members[i];
          const b = members[j];
          if (linked.has(`${Math.min(a, b)}-${Math.max(a, b)}`)) continue;
          const d = d2(a, b);
          if (d < best) {
            best = d;
            extra = [a, b];
          }
        }
      }
      if (extra) links.push(extra);
    }
  }
  return links;
}

function buildModel(groups: SkillGroup[], w: number): Model {
  const fs = w >= 560 ? 12.5 : w >= 400 ? 11.5 : 11;
  const pad = fs * 0.62;
  const gap = fs * 0.42;
  const minR = fs * 2.05;
  const maxR = fs * 4.6;

  const orbs: Orb[] = [];
  groups.forEach((group, g) => {
    group.items
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, MAX_PER_GROUP)
      .forEach((label, i) => {
        const lines = splitLabel(label);
        const tw = Math.max(...lines.map(line => textWidth(line, LABEL_FONT(fs), fs)));
        const th = lines.length * fs * 1.12;
        const want = Math.sqrt((tw / 2) ** 2 + (th / 2) ** 2) + pad;
        const r = clamp(want, minR, maxR);
        // Very long single words shrink their own font to fit the cap.
        const nodeFs = want > maxR ? Math.max(8.5, fs * ((2 * (maxR - pad)) / Math.max(tw, 1))) : fs;
        orbs.push({
          key: `${g}-${i}-${label}`,
          label,
          lines,
          group: g,
          order: orbs.length,
          r,
          fs: nodeFs,
          x: 0,
          y: 0,
          hx: 0,
          hy: 0,
          phase: (orbs.length * 2.399) % (Math.PI * 2),
        });
      });
  });

  const groupCount = Math.max(1, groups.length);
  const ratio = w >= 600 ? 0.68 : w >= 440 ? 0.86 : 1.16;
  const area = orbs.reduce((sum, o) => sum + Math.PI * (o.r + gap) ** 2, 0);
  const h = Math.round(Math.max(w * ratio, area / (w * 0.42), 240));

  const points = groupCenters(groupCount, w, h);
  const centers: Center[] = points.map((p, g) => {
    const members = orbs.filter(o => o.group === g);
    const packed = Math.sqrt(members.reduce((s, o) => s + (o.r + gap) ** 2, 0) / 0.72);
    return { x: p.x, y: p.y, ring: Math.max(packed * 1.08, minR * 2) };
  });

  // Golden-angle spiral seeds around each group center: deterministic.
  const seen = new Map<number, number>();
  for (const o of orbs) {
    const k = seen.get(o.group) ?? 0;
    seen.set(o.group, k + 1);
    const c = centers[o.group];
    const a = k * 2.39996;
    const d = Math.sqrt(k + 0.5) * o.r * 0.9;
    o.x = c.x + Math.cos(a) * d;
    o.y = c.y + Math.sin(a) * d;
  }

  const model: Model = { w, h, gap, orbs, links: [], centers };
  if (orbs.length) {
    const sim = forceSimulation<Orb>(orbs).stop();
    applyForces(sim, model);
    for (let i = 0; i < 280; i++) sim.tick();
    sim.stop();
  }
  for (const o of orbs) {
    o.hx = clamp(o.x, o.r + 2, w - o.r - 2);
    o.hy = clamp(o.y, o.r + 2, h - o.r - 2);
    o.vx = 0;
    o.vy = 0;
  }
  model.links = groupLinks(orbs);
  return model;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */
interface DragState {
  index: number;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
}

const DRIFT = 2.4;
const MAX_FLING = 38;

export function SkillConstellation() {
  const { site } = usePortfolio();
  const groups = site.skillGroups;
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();
  const canDrag = fine && !reduced;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const orbEls = useRef<Array<SVGGElement | null>>([]);
  const linkEls = useRef<Array<SVGLineElement | null>>([]);
  const tagRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<Orb, undefined> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const wakeRef = useRef<() => void>(() => {});
  const lastTRef = useRef(0);
  const bloomedRef = useRef(false);

  const [width, setWidth] = useState(0);
  const [fontsReady, setFontsReady] = useState(0);
  const [live, setLive] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tapIdx, setTapIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [keyHover, setKeyHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  /* ---- measure the stage (content width, inside the root's padding) ---- */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.clientWidth));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- re-measure labels once the display font has loaded ---- */
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || fonts.check(LABEL_FONT(12))) return;
    let cancelled = false;
    fonts.ready.then(() => {
      if (!cancelled) setFontsReady(n => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const model = useMemo(() => {
    void fontsReady;
    return width > 0 ? buildModel(groups, width) : null;
  }, [groups, width, fontsReady]);

  const activeIdx = dragIdx ?? hoverIdx ?? tapIdx;
  const activeOrb = model && activeIdx !== null ? model.orbs[activeIdx] : undefined;
  const activeGroup = activeOrb ? activeOrb.group : keyHover ?? pinned;
  const activeRef = useRef<number | null>(null);
  activeRef.current = activeOrb ? activeIdx : null;

  /* ---- paint: write positions to the DOM (no React render) ---- */
  const paint = useCallback(
    (t: number) => {
      if (!model) return;
      lastTRef.current = t;
      const { w, h, orbs, links } = model;
      const drifting = !reduced;
      const dragged = dragRef.current?.index ?? -1;
      const px = new Float32Array(orbs.length);
      const py = new Float32Array(orbs.length);
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        let x = o.x;
        let y = o.y;
        if (drifting && i !== dragged) {
          x += Math.sin(t * 0.00052 + o.phase) * DRIFT;
          y += Math.cos(t * 0.00043 + o.phase * 1.7) * DRIFT;
        }
        x = clamp(x, o.r + 1, w - o.r - 1);
        y = clamp(y, o.r + 1, h - o.r - 1);
        px[i] = x;
        py[i] = y;
        orbEls.current[i]?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
      for (let k = 0; k < links.length; k++) {
        const el = linkEls.current[k];
        if (!el) continue;
        const [a, b] = links[k];
        const dx = px[b] - px[a];
        const dy = py[b] - py[a];
        const dist = Math.hypot(dx, dy) || 1;
        const ra = orbs[a].r + 4;
        const rb = orbs[b].r + 4;
        const visible = dist > ra + rb + 2;
        const ux = dx / dist;
        const uy = dy / dist;
        el.setAttribute('x1', (px[a] + ux * ra).toFixed(1));
        el.setAttribute('y1', (py[a] + uy * ra).toFixed(1));
        el.setAttribute('x2', (visible ? px[b] - ux * rb : px[a] + ux * ra).toFixed(1));
        el.setAttribute('y2', (visible ? py[b] - uy * rb : py[a] + uy * ra).toFixed(1));
      }
      const tag = tagRef.current;
      const ai = activeRef.current;
      if (tag && ai !== null && orbs[ai]) {
        const o = orbs[ai];
        const tw = Number(tag.dataset.width) || 80;
        const above = py[ai] - o.r - 20;
        const ty = above > 12 ? above : py[ai] + o.r + 20;
        const tx = clamp(px[ai], tw / 2 + 4, w - tw / 2 - 4);
        tag.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`);
      }
    },
    [model, reduced],
  );

  /* ---- place the orbs before the browser paints (no flash at 0,0) ---- */
  useLayoutEffect(() => {
    if (!model) return;
    const bloom = !reduced && !bloomedRef.current;
    for (const o of model.orbs) {
      const c = model.centers[o.group];
      o.x = bloom ? c.x + (o.hx - c.x) * 0.1 : o.hx;
      o.y = bloom ? c.y + (o.hy - c.y) * 0.1 : o.hy;
      o.vx = 0;
      o.vy = 0;
      o.fx = null;
      o.fy = null;
    }
    paint(lastTRef.current);
  }, [model, reduced, paint]);

  /* ---- simulation + render loop ---- */
  useEffect(() => {
    if (!model) return;
    const { orbs } = model;
    const bloom = !reduced && !bloomedRef.current;

    if (reduced || !orbs.length) {
      setLive(true);
      return;
    }

    const sim = forceSimulation<Orb>(orbs).stop().alphaDecay(0.03).velocityDecay(0.34);
    applyForces(sim, model);
    sim.alpha(bloom ? 0 : 0.05);
    simRef.current = sim;

    const root = rootRef.current;
    let raf = 0;
    let visible = false;

    const loop = (t: number) => {
      raf = 0;
      if (!visible) return;
      if (dragRef.current || sim.alpha() >= sim.alphaMin()) sim.tick();
      paint(t);
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (visible && !raf) raf = requestAnimationFrame(loop);
    };
    wakeRef.current = wake;

    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          visible = entry.isIntersecting;
          root?.setAttribute('data-visible', visible ? 'true' : 'false');
          if (visible && !bloomedRef.current && entry.intersectionRatio >= 0.2) {
            bloomedRef.current = true;
            sim.alpha(1);
            setLive(true);
          }
          if (visible) wake();
        }
      },
      { threshold: [0, 0.2, 0.4] },
    );
    if (root) io.observe(root);
    if (bloomedRef.current) setLive(true);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      sim.stop();
      simRef.current = null;
      wakeRef.current = () => {};
      dragRef.current = null;
    };
  }, [model, reduced, paint]);

  /* Keep the tag in place when focus changes while the loop is idle. */
  useLayoutEffect(() => {
    paint(lastTRef.current);
  }, [activeIdx, paint]);

  /* ---- pointer: drag to fling (fine pointers, motion allowed) ---- */
  const toLocal = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg || !model) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * model.w,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * model.h,
    };
  };

  const onOrbPointerDown = (event: ReactPointerEvent<SVGGElement>, index: number) => {
    if (!canDrag || !model || event.button !== 0 || event.pointerType === 'touch') return;
    const sim = simRef.current;
    const svg = svgRef.current;
    if (!sim || !svg) return;
    event.preventDefault();
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      /* capture can fail for synthetic events */
    }
    const o = model.orbs[index];
    const p = toLocal(event);
    dragRef.current = {
      index,
      pointerId: event.pointerId,
      offsetX: o.x - p.x,
      offsetY: o.y - p.y,
      lastX: p.x,
      lastY: p.y,
      lastT: event.timeStamp,
      vx: 0,
      vy: 0,
    };
    o.fx = o.x;
    o.fy = o.y;
    sim.alphaTarget(0.22);
    if (sim.alpha() < 0.22) sim.alpha(0.22);
    setDragIdx(index);
    wakeRef.current();
  };

  const onSvgPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !model) return;
    const o = model.orbs[drag.index];
    const p = toLocal(event);
    o.fx = clamp(p.x + drag.offsetX, o.r + 2, model.w - o.r - 2);
    o.fy = clamp(p.y + drag.offsetY, o.r + 2, model.h - o.r - 2);
    const dt = Math.max(event.timeStamp - drag.lastT, 1);
    // Velocity in px per 60 Hz frame, smoothed.
    drag.vx = drag.vx * 0.4 + (((p.x - drag.lastX) / dt) * 16.7) * 0.6;
    drag.vy = drag.vy * 0.4 + (((p.y - drag.lastY) / dt) * 16.7) * 0.6;
    drag.lastX = p.x;
    drag.lastY = p.y;
    drag.lastT = event.timeStamp;
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !model) return;
    const o = model.orbs[drag.index];
    o.fx = null;
    o.fy = null;
    // Stale velocity (pointer held still before release) does not fling.
    const still = event.timeStamp - drag.lastT > 90;
    o.vx = still ? 0 : clamp(drag.vx, -MAX_FLING, MAX_FLING);
    o.vy = still ? 0 : clamp(drag.vy, -MAX_FLING, MAX_FLING);
    dragRef.current = null;
    const sim = simRef.current;
    if (sim) {
      sim.alphaTarget(0);
      if (sim.alpha() < 0.35) sim.alpha(0.35);
    }
    try {
      svgRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    setDragIdx(null);
    wakeRef.current();
  };

  const onOrbEnter = (event: ReactPointerEvent<SVGGElement>, index: number) => {
    if (event.pointerType === 'touch') return;
    setHoverIdx(index);
  };
  const onOrbLeave = (event: ReactPointerEvent<SVGGElement>) => {
    if (event.pointerType === 'touch') return;
    setHoverIdx(null);
  };
  /* Touch / coarse pointers: tap focuses an orb, tapping it again clears. */
  const onOrbClick = (index: number) => {
    if (fine) return;
    setTapIdx(current => (current === index ? null : index));
  };
  const onStageClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (event.target === event.currentTarget) setTapIdx(null);
  };

  /* ---- derived render data ---- */
  const totalSkills = groups.reduce((n, g) => n + g.items.filter(item => item.trim()).length, 0);
  const summary = totalSkills
    ? `Interactive skill map: ${totalSkills} skills in ${groups.length} ${groups.length === 1 ? 'group' : 'groups'} (${groups
        .map(g => g.title)
        .join(', ')}). The full list follows.`
    : 'Skill map (no skills listed yet).';

  const tagText = activeOrb ? (groups[activeOrb.group]?.title ?? '').toUpperCase() : '';
  const tagWidth = tagText ? textWidth(tagText, TAG_FONT, TAG_FS) + tagText.length * TAG_TRACKING + 30 : 0;

  const hint = reduced ? 'Hover to focus' : fine ? 'Drag to fling' : 'Tap an orb';

  return (
    <div
      ref={rootRef}
      className={`constellation${canDrag ? ' constellation--drag' : ''}`}
      data-live={live ? 'true' : 'false'}
      data-focus={activeGroup !== null ? 'true' : 'false'}
      data-dragging={dragIdx !== null ? 'true' : 'false'}
    >
      <div className="constellation-meta">
        <span>Interactive skill map</span>
        <span className="constellation-meta-live">
          <span className="constellation-meta-by">Powered by</span> D3.js{' '}
          <span className="dot-live constellation-meta-dot" aria-hidden="true" />
        </span>
      </div>

      <div ref={stageRef} className="constellation-stage" data-cursor={canDrag ? 'hide' : undefined}>
        {model && (
          <svg
            ref={svgRef}
            className="constellation-svg"
            viewBox={`0 0 ${model.w} ${model.h}`}
            width={model.w}
            height={model.h}
            role="img"
            aria-label={summary}
            onPointerMove={canDrag ? onSvgPointerMove : undefined}
            onPointerUp={canDrag ? endDrag : undefined}
            onPointerCancel={canDrag ? endDrag : undefined}
            onClick={onStageClick}
          >
            <defs>
              {SKILL_TONES.map(tone => (
                <radialGradient key={`f-${tone}`} id={`${uid}-fill-${tone}`} cx="36%" cy="30%" r="78%">
                  <stop offset="0%" style={{ stopColor: `var(--c-${tone})`, stopOpacity: 0.42 }} />
                  <stop offset="48%" style={{ stopColor: `var(--c-${tone})`, stopOpacity: 0.12 }} />
                  <stop offset="100%" style={{ stopColor: `var(--c-${tone})`, stopOpacity: 0.04 }} />
                </radialGradient>
              ))}
              {SKILL_TONES.map(tone => (
                <radialGradient key={`h-${tone}`} id={`${uid}-halo-${tone}`}>
                  <stop offset="0%" style={{ stopColor: `var(--c-${tone})`, stopOpacity: 0.5 }} />
                  <stop offset="38%" style={{ stopColor: `var(--c-${tone})`, stopOpacity: 0.16 }} />
                  <stop offset="100%" style={{ stopColor: `var(--c-${tone})`, stopOpacity: 0 }} />
                </radialGradient>
              ))}
              {/* Orbit rings fade out toward the stage edges (never spill past the host card). */}
              <radialGradient id={`${uid}-ring-fade`} cx="50%" cy="50%" r="50%">
                <stop offset="72%" stopColor="#fff" />
                <stop offset="100%" stopColor="#000" />
              </radialGradient>
              <mask id={`${uid}-ring-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={model.w} height={model.h}>
                <rect width={model.w} height={model.h} fill={`url(#${uid}-ring-fade)`} />
              </mask>
            </defs>

            <g className="constellation-rings" aria-hidden="true" mask={`url(#${uid}-ring-mask)`}>
              {model.centers.map((c, g) => (
                <g key={g} style={toneStyle(g)} className={activeGroup === g ? 'is-group' : undefined}>
                  <circle className="constellation-ring" cx={c.x} cy={c.y} r={c.ring} />
                  <circle className="constellation-ring constellation-ring--outer" cx={c.x} cy={c.y} r={c.ring * 1.38} />
                </g>
              ))}
            </g>

            <g className="constellation-links" aria-hidden="true">
              {model.links.map(([a, b], k) => {
                const g = model.orbs[a].group;
                return (
                  <line
                    key={`${model.orbs[a].key}|${model.orbs[b].key}`}
                    ref={el => {
                      linkEls.current[k] = el;
                    }}
                    className={`constellation-link${activeGroup === g ? ' is-group' : ''}`}
                    style={toneStyle(g)}
                  />
                );
              })}
            </g>

            <g className="constellation-orbs" aria-hidden="true">
              {model.orbs.map((o, i) => {
                const tone = skillTone(o.group);
                const state =
                  activeIdx === i ? ' is-active' : activeGroup === o.group ? ' is-group' : activeGroup !== null ? ' is-dim' : '';
                const lineHeight = o.fs * 1.12;
                const firstY = -((o.lines.length - 1) * lineHeight) / 2;
                return (
                  <g
                    key={o.key}
                    ref={el => {
                      orbEls.current[i] = el;
                    }}
                    className={`constellation-orb${state}`}
                    style={{ ...toneStyle(o.group), '--i': o.order } as CSSProperties}
                    onPointerEnter={event => onOrbEnter(event, i)}
                    onPointerLeave={onOrbLeave}
                    onPointerDown={canDrag ? event => onOrbPointerDown(event, i) : undefined}
                    onClick={() => onOrbClick(i)}
                  >
                    <g className="constellation-orb-body">
                      <g className="constellation-orb-focus">
                        <circle className="constellation-halo" r={o.r * 2.1} fill={`url(#${uid}-halo-${tone})`} />
                        <circle className="constellation-orb-base" r={o.r} />
                        <circle className="constellation-orb-fill" r={o.r} fill={`url(#${uid}-fill-${tone})`} />
                        <circle className="constellation-orb-edge" r={o.r - 0.5} />
                        <circle className="constellation-orb-inner" r={Math.max(o.r - 5, 4)} />
                        <text className="constellation-label" textAnchor="middle" fontSize={o.fs}>
                          {o.lines.map((line, l) => (
                            <tspan key={l} x="0" y={(firstY + l * lineHeight + o.fs * 0.36).toFixed(1)}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    </g>
                  </g>
                );
              })}
            </g>

            {activeOrb && tagText && (
              <g
                ref={tagRef}
                className="constellation-tag"
                data-width={tagWidth.toFixed(1)}
                style={toneStyle(activeOrb.group)}
                aria-hidden="true"
              >
                <rect x={-tagWidth / 2} y={-11} width={tagWidth} height={22} rx={11} />
                <circle cx={-tagWidth / 2 + 11} cy={0} r={2.5} className="constellation-tag-dot" />
                <text x={4} y={TAG_FS * 0.36} textAnchor="middle" letterSpacing={TAG_TRACKING}>
                  {tagText}
                </text>
              </g>
            )}
          </svg>
        )}
        {model && !model.orbs.length && <p className="constellation-empty">Skills will appear here soon.</p>}
      </div>

      {groups.length > 0 && (
        <div className="constellation-legend">
          {groups.map((group, g) => {
            const count = group.items.filter(item => item.trim()).length;
            const on = activeGroup === g;
            return (
              <button
                key={`${group.title}-${g}`}
                type="button"
                className={`constellation-key${on ? ' is-active' : ''}`}
                style={toneStyle(g)}
                aria-pressed={pinned === g}
                onPointerEnter={event => event.pointerType !== 'touch' && setKeyHover(g)}
                onPointerLeave={() => setKeyHover(null)}
                onFocus={() => setKeyHover(g)}
                onBlur={() => setKeyHover(null)}
                onClick={() => setPinned(current => (current === g ? null : g))}
              >
                <span className="constellation-key-swatch" aria-hidden="true" />
                <span className="constellation-key-title">{group.title}</span>
                <span className="constellation-key-count" aria-hidden="true">
                  {String(count).padStart(2, '0')}
                </span>
                {/* Name = visible title + spoken count ("Frontend, 5 skills"), so it
                    always contains the visible label (WCAG 2.5.3). */}
                <span className="sr-only">
                  , {count} {count === 1 ? 'skill' : 'skills'}
                </span>
              </button>
            );
          })}
          {totalSkills > 0 && (
            <span className="constellation-hint" aria-hidden="true">
              {hint}
            </span>
          )}
        </div>
      )}

      <ul className="sr-only">
        {groups.map((group, g) => (
          <li key={`${group.title}-${g}`}>
            {group.title}
            <ul>
              {group.items
                .filter(item => item.trim())
                .map((item, i) => (
                  <li key={`${item}-${i}`}>{item}</li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
