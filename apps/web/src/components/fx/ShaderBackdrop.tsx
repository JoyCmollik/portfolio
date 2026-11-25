/**
 * ShaderBackdrop: the portfolio's signature "signal light" aurora.
 *
 * A raw WebGL 1 fragment shader (no libraries) draws slow, domain-warped
 * ribbons of light over a near-black base. It is designed to sit under very
 * large type, so the light stays atmospheric: the brightest areas land around
 * 30-40% luminance, the edges fall off into the page, and a tiny triangular
 * dither keeps the dark gradients free of banding.
 *
 * Contract (DESIGN_SPEC section 5):
 *   <ShaderBackdrop className? palette?="signal" | "warm" intensity?={1} interactive?={true} />
 *   Fills its positioned parent (absolute, inset 0, pointer-events none,
 *   aria-hidden). The parent must be `position: relative; overflow: hidden`.
 *
 * Behaviour:
 *   - Renders at a reduced resolution (min(dpr, 1.5) * 0.5 of the CSS size) and
 *     lets CSS upscale it. Frame rate is capped to about 45-60fps, and quality
 *     steps down automatically on slow (for example software) renderers.
 *   - Starts lazily: nothing (no context, no shader compile) until the host is
 *     within one viewport of the screen, and then only in an idle period, so
 *     the headline reveal and page transition always get the main thread
 *     first. With KHR_parallel_shader_compile the compile + link runs on a
 *     driver thread and is polled once per frame instead of blocking.
 *   - Pauses when offscreen (IntersectionObserver), when the tab is hidden, or
 *     while the visitor paused motion (lib/motion.ts; the frame stays).
 *   - With a fine pointer and `interactive`, a smoothed cursor gently swirls and
 *     brightens the flow nearby. Listens on window because the canvas itself
 *     never receives pointer events.
 *   - prefers-reduced-motion: exactly one static frame, redrawn on resize or
 *     prop changes.
 *   - No WebGL (or a shader failure / unrecovered context loss): a CSS gradient
 *     fallback (.fx-shader--fallback).
 *   - The canvas fades in over ~800ms after its first frame.
 *
 * CSS hooks (see shader.css): --fx-shader-base (hex colour the shader treats as
 * its base, default #080b11), --fx-shader-fade (height of the bottom fade),
 * --fx-shader-fade-color, --fx-shader-vignette (edge vignette alpha).
 */
import { useEffect, useRef, useState } from 'react';
import { useFinePointer, useMotionPaused, usePrefersReducedMotion } from '../../lib/motion';
import './shader.css';

/* ------------------------------------------------------------------------ */
/* Public types                                                              */
/* ------------------------------------------------------------------------ */

export type ShaderPalette = 'signal' | 'warm';

export interface ShaderBackdropProps {
  className?: string;
  /** Colour story: 'signal' = mint / cyan / violet, 'warm' = amber / rose / violet. */
  palette?: ShaderPalette;
  /** Brightness multiplier for the light (0 to 2; 1 is the designed level). */
  intensity?: number;
  /** Let a fine pointer bend and brighten the flow. */
  interactive?: boolean;
}

/* ------------------------------------------------------------------------ */
/* Colour + tuning constants                                                 */
/* ------------------------------------------------------------------------ */

type RGB = [number, number, number];
type Triad = [RGB, RGB, RGB];

/** Parses `#rgb` / `#rrggbb` into 0..1 floats; null for anything else. */
function parseHex(input: string): RGB | null {
  const value = input.trim().replace(/^#/, '');
  const full = value.length === 3 ? value.replace(/./g, ch => ch + ch) : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const hex = (value: string): RGB => parseHex(value) ?? [0, 0, 0];

/** [ribbon core, ribbon body, upper glow / haze] for each palette. */
const PALETTES: Record<ShaderPalette, Triad> = {
  signal: [hex('#5cf0a8'), hex('#7ad7f0'), hex('#a5adff')],
  warm: [hex('#f4c38a'), hex('#f5a3b5'), hex('#a5adff')],
};

/** Matches --c-ink-1, the page background. */
const DEFAULT_BASE = hex('#080b11');

/** Fraction of (capped) device pixels actually rendered; CSS upscales the rest. */
const RENDER_SCALE = 0.5;
const MAX_DPR = 1.5;
/** Hard ceiling on drawing-buffer pixels (protects 4K / ultrawide screens). */
const MAX_PIXELS = 1_200_000;
/** Frame cap: 60fps on 60/120Hz, about 45-48fps on 90/144Hz panels. */
const MIN_FRAME_MS = 1000 / 60 - 2;
const SOFTWARE_MIN_FRAME_MS = 1000 / 30;
/** Adaptive quality: step the resolution down when frames average slower than this. */
const SLOW_FRAME_MS = 40;
const MIN_QUALITY = 0.45;
/**
 * Where in the flow each palette starts, hand-picked for a strong composition.
 * Also the reduced-motion still frame. Distinct per palette so two backdrops
 * on one page never look like copies.
 */
const SEED_TIME: Record<ShaderPalette, number> = { signal: 90, warm: 140 };
const VISIBLE_CLASS = 'fx-shader__canvas--visible';

/** Start once the host is within this distance of the viewport. */
const NEAR_MARGIN = '100% 0px';
/** requestIdleCallback deadline (ms): start even if the page never goes idle. */
const IDLE_TIMEOUT_MS = 1000;
/** Without requestIdleCallback (Safari): a short delay past the first frames. */
const NO_IDLE_DELAY_MS = 260;

const clampIntensity = (value: number) => (Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 1);

/* ------------------------------------------------------------------------ */
/* GLSL (WebGL 1 / GLSL ES 1.00)                                             */
/* ------------------------------------------------------------------------ */

/** A single oversized triangle covers the viewport with no diagonal seam. */
const VERTEX_SHADER = /* glsl */ `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  u_resolution; // drawing-buffer size in px
uniform float u_time;       // seconds of animated time
uniform vec3  u_pointer;    // xy: smoothed pointer in 0..1 (y up), z: influence 0..1+
uniform float u_intensity;  // light multiplier
uniform vec3  u_base;       // background colour
uniform vec3  u_colorA;     // ribbon cores   (mint  | amber)
uniform vec3  u_colorB;     // ribbon bodies  (cyan  | rose)
uniform vec3  u_colorC;     // upper glow/haze (violet)

/* ---- hashing + noise --------------------------------------------------- */

// Sine-free hashes (Dave Hoskins): stable across GPUs, no precision cliffs.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

// Gradient noise with a quintic fade, roughly in [-0.7, 0.7].
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Four-octave fBm; each octave is rotated to hide the lattice. A gain under
// 0.5 keeps the fine octaves from making ribbon edges look jagged.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.55;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    sum += amp * gnoise(p);
    p = rot * p * 1.97 + vec2(13.7, 7.1);
    amp *= 0.42;
  }
  return sum;
}

/* ---- one aurora curtain ------------------------------------------------ */

// e:      signed distance above the ribbon's luminous lower edge (flow space)
// x:      position along the ribbon (flow space)
// warp:   domain-warp vector, used to colour-shift and fold the curtain
// seed:   per-ribbon offset so ribbons never move in lockstep
// width:  falloff below the edge; tail: length of the glow rising above it
vec3 curtain(float e, float x, vec2 warp, float seed, float width, float tail,
             vec3 coreColor, vec3 bodyColor, float t) {
  // Ribbons drift in and out of existence along their length.
  float presence = smoothstep(-0.42, 0.2, gnoise(vec2(x * 0.7 + t * 0.045 + seed * 3.1, seed * 1.7)));

  // Vertical folds in the rising glow, like real auroral rays.
  float rays = 0.7 + 0.6 * gnoise(vec2(x * 11.0 + warp.x * 5.0, t * 0.12 + seed * 4.3));

  // Sharp-ish falloff below the edge, long exponential tail above it.
  float below = exp(-(e * e) / (width * width));
  float above = exp(-max(e, 0.0) / tail);
  float body = mix(below, above, step(0.0, e));

  // The thin luminous edge carries a slow travelling "signal" pulse.
  float core = exp(-(e * e) / (width * width * 0.16));
  float pulse = pow(0.5 + 0.5 * sin(x * 2.6 - t * 0.85 + seed * 2.4), 14.0);

  vec3 edge = mix(coreColor, bodyColor, smoothstep(-0.9, 0.9, x + warp.y * 1.4));
  vec3 glow = mix(edge, u_colorC, smoothstep(0.0, tail * 1.6, e));

  return presence * (glow * body * rays * 0.5 + edge * core * (0.32 + 0.6 * pulse));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  // Portrait frames (phones) see a wider slice of the field so they still get
  // whole ribbons rather than a narrow fragment.
  float zoom = mix(1.0, 1.45, clamp((1.0 - aspect) / 0.55, 0.0, 1.0));
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * zoom;
  float t = u_time;

  /* Pointer: a soft swirl + lift around the smoothed cursor. */
  vec2 m = (u_pointer.xy - 0.5) * vec2(aspect, 1.0) * zoom;
  vec2 dm = p - m;
  float halo = exp(-dot(dm, dm) * 7.0) * u_pointer.z;
  p += (vec2(-dm.y, dm.x) * 0.5 + dm * 0.2) * halo * 0.4;

  /* Flow space: tilt so the ribbons run on a gentle diagonal. */
  vec2 fp = mat2(0.96, -0.28, 0.28, 0.96) * p;

  /* Domain warp: nested fBm lookups bend everything organically. */
  vec2 q = vec2(fbm(fp * 0.9 + vec2(0.0, t * 0.035)),
                fbm(fp * 0.9 + vec2(5.2, 1.3) - vec2(t * 0.03, 0.0)));
  vec2 r = vec2(fbm(fp * 1.3 + q * 1.6 + vec2(1.7, 9.2) + t * 0.045),
                fbm(fp * 1.3 + q * 1.6 + vec2(8.3, 2.8) - t * 0.04));
  float haze = fbm(fp * 1.1 + r * 1.8 + vec2(t * 0.02, 0.0));

  vec3 light = vec3(0.0);

  /* Deep atmospheric haze between the ribbons. */
  float h = smoothstep(-0.2, 0.45, haze);
  light += mix(u_colorC, u_colorB, smoothstep(-0.25, 0.35, q.y)) * h * h * 0.13;

  /* Three curtains, each bent by the warp field. */
  float y = fp.y + r.y * 0.55 + q.x * 0.25;
  light += curtain(y + 0.04 - 0.05 * sin(fp.x * 1.3 + t * 0.07), fp.x, r, 0.0, 0.05, 0.32,
                   u_colorA, u_colorB, t);
  light += curtain(y - 0.24 - 0.06 * sin(fp.x * 1.1 - t * 0.05 + 1.7), fp.x, r, 1.0, 0.045, 0.22,
                   u_colorB, u_colorC, t) * 0.6;
  light += curtain(y + 0.33 + 0.05 * sin(fp.x * 0.9 + t * 0.06 + 3.1), fp.x, r, 2.0, 0.06, 0.13,
                   u_colorC, u_colorA, t) * 0.4;

  /* Pointer brightening: lifts nearby light plus a faint glow of its own. */
  light *= 1.0 + halo * 0.75;
  light += mix(u_colorA, u_colorB, 0.5) * halo * 0.05;

  /* Centre-weighted falloff so the light gathers mid-frame, darker at edges. */
  float vignette = 1.0 - smoothstep(0.3, 1.1, length((uv - vec2(0.5, 0.56)) * vec2(1.0, 1.25)));
  light *= mix(0.38, 1.0, vignette) * u_intensity;

  /* Keep the light saturated: pastel palette colours turn grey at low levels. */
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  float lum = dot(light, LUMA);
  light = max(mix(vec3(lum), light, 1.5), 0.0);

  /* Soft shoulder on luminance only (keeps hue + saturation): the brightest
     light settles around 30-40% so overlaid text stays legible. */
  float shoulder = 0.42 * (1.0 - exp(-lum / 0.42));
  light *= shoulder / max(lum, 1e-4);
  vec3 col = u_base + light;

  /* Triangular dither (about 1 LSB) to kill banding in the dark gradients. */
  float n = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 71.37) - 1.0;
  col += n / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------------ */
/* WebGL plumbing                                                            */
/* ------------------------------------------------------------------------ */

interface FrameUniforms {
  width: number;
  height: number;
  time: number;
  pointer: RGB;
  intensity: number;
  base: RGB;
  colors: Triad;
}

interface Renderer {
  draw(frame: FrameUniforms): void;
  dispose(): void;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
};

function getContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  try {
    return (
      canvas.getContext('webgl', CONTEXT_ATTRIBUTES) ??
      (canvas.getContext('experimental-webgl', CONTEXT_ATTRIBUTES) as WebGLRenderingContext | null)
    );
  } catch {
    return null;
  }
}

function warnDev(message: string, detail?: unknown) {
  if (import.meta.env.DEV) console.warn(`[ShaderBackdrop] ${message}`, detail ?? '');
}

/** A program whose compile + link may still be running on a driver thread. */
interface PendingProgram {
  program: WebGLProgram;
  vertex: WebGLShader;
  fragment: WebGLShader;
}

/** KHR_parallel_shader_compile's COMPLETION_STATUS_KHR. */
const COMPLETION_STATUS_KHR = 0x91b1;

/**
 * Queues compile + link WITHOUT asking for any status: a status query right
 * after linkProgram forces the driver to finish on the main thread (200 ms+
 * on real GPUs). Null when GL objects cannot even be created.
 */
function beginProgram(gl: WebGLRenderingContext): PendingProgram | null {
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }
  gl.shaderSource(vertex, VERTEX_SHADER);
  gl.compileShader(vertex);
  gl.shaderSource(fragment, FRAGMENT_SHADER);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);
  return { program, vertex, fragment };
}

/**
 * With KHR_parallel_shader_compile: true once the driver has finished, so the
 * LINK_STATUS read in finishRenderer no longer blocks. Without the extension
 * there is nothing to wait for (the read will block once, off the critical
 * path, see the deferred start in the component).
 */
function isProgramSettled(gl: WebGLRenderingContext, parallel: object | null, pending: PendingProgram): boolean {
  if (!parallel) return true;
  // null when the context is lost: settle and let finishRenderer bail out.
  return gl.getProgramParameter(pending.program, COMPLETION_STATUS_KHR) !== false;
}

/** Checks the link result and uploads the full-screen triangle. Null on failure. */
function finishRenderer(gl: WebGLRenderingContext, pending: PendingProgram): Renderer | null {
  const { program, vertex, fragment } = pending;
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  if (!linked && !gl.isContextLost()) {
    warnDev(
      'program link failed',
      gl.getProgramInfoLog(program) || gl.getShaderInfoLog(fragment) || gl.getShaderInfoLog(vertex),
    );
  }
  // Shaders are no longer needed once linked (or once linking has failed).
  gl.detachShader(program, vertex);
  gl.detachShader(program, fragment);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!linked) {
    gl.deleteProgram(program);
    return null;
  }

  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.useProgram(program);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    resolution: uniform('u_resolution'),
    time: uniform('u_time'),
    pointer: uniform('u_pointer'),
    intensity: uniform('u_intensity'),
    base: uniform('u_base'),
    colorA: uniform('u_colorA'),
    colorB: uniform('u_colorB'),
    colorC: uniform('u_colorC'),
  };

  return {
    draw(frame) {
      gl.viewport(0, 0, frame.width, frame.height);
      gl.uniform2f(loc.resolution, frame.width, frame.height);
      gl.uniform1f(loc.time, frame.time);
      gl.uniform3fv(loc.pointer, frame.pointer);
      gl.uniform1f(loc.intensity, frame.intensity);
      gl.uniform3fv(loc.base, frame.base);
      gl.uniform3fv(loc.colorA, frame.colors[0]);
      gl.uniform3fv(loc.colorB, frame.colors[1]);
      gl.uniform3fv(loc.colorC, frame.colors[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

/** Synchronous compile + link (used after a context restore). Null on failure. */
function createRenderer(gl: WebGLRenderingContext): Renderer | null {
  const pending = beginProgram(gl);
  return pending ? finishRenderer(gl, pending) : null;
}

/** Best-effort detection of CPU rasterisers (SwiftShader, llvmpipe, ...). */
function isSoftwareRenderer(gl: WebGLRenderingContext): boolean {
  try {
    let name = String(gl.getParameter(gl.RENDERER) ?? '');
    // Chromium/WebKit mask RENDERER; Firefox exposes a sanitised real name (and
    // warns about the debug extension), so only ask the extension when masked.
    if (/^webkit webgl$/i.test(name)) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
    }
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------------ */
/* Component                                                                 */
/* ------------------------------------------------------------------------ */

type Mode = 'pending' | 'webgl' | 'fallback';

/** Latest props, read by the long-lived render loop without restarting it. */
interface LiveSettings {
  palette: ShaderPalette;
  intensity: number;
  reduced: boolean;
  /** Visitor paused motion: hold the current frame. */
  paused: boolean;
}

/** Raw pointer data written by window listeners, consumed once per frame. */
interface PointerInput {
  enabled: boolean;
  present: boolean;
  clientX: number;
  clientY: number;
}

export function ShaderBackdrop({ className, palette = 'signal', intensity = 1, interactive = true }: ShaderBackdropProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const paused = useMotionPaused();
  const [mode, setMode] = useState<Mode>('pending');

  const liveRef = useRef<LiveSettings>({ palette, intensity: clampIntensity(intensity), reduced, paused });
  const pointerRef = useRef<PointerInput>({ enabled: false, present: false, clientX: 0, clientY: 0 });
  /** Set by the GL effect: re-applies liveRef (start/stop the loop, redraw a still frame). */
  const syncRef = useRef<(() => void) | null>(null);

  // 1. Push prop / preference changes into the running renderer.
  useEffect(() => {
    liveRef.current = { palette, intensity: clampIntensity(intensity), reduced, paused };
    syncRef.current?.();
  }, [palette, intensity, reduced, paused]);

  // 2. Pointer tracking (fine pointers only, never under reduced motion or a pause).
  const trackPointer = interactive && finePointer && !reduced && !paused;
  useEffect(() => {
    const input = pointerRef.current;
    input.enabled = trackPointer;
    input.present = false;
    if (!trackPointer) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      input.clientX = event.clientX;
      input.clientY = event.clientY;
      input.present = true;
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) input.present = false; // left the window
    };
    const onBlur = () => {
      input.present = false;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('blur', onBlur);
    return () => {
      input.enabled = false;
      input.present = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onOut);
      window.removeEventListener('blur', onBlur);
    };
  }, [trackPointer]);

  // 3. WebGL lifecycle: one context per mount, created lazily (see header):
  //    near the viewport + idle -> context + queued compile -> (poll) -> first
  //    frame. The canvas is created here (not by React) so StrictMode's
  //    mount/unmount/mount gets a fresh context each time and the old one can
  //    be released explicitly. Until the first frame the host stays 'pending'
  //    (plain page ink) and the canvas fades in over it.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;
    let idleId = 0;
    let timeoutId = 0;

    const boot = () => {
      idleId = 0;
      timeoutId = 0;
      if (!cancelled) teardown = startWebGL(host);
    };

    const near = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        near.disconnect();
        if (typeof window.requestIdleCallback === 'function') {
          idleId = window.requestIdleCallback(boot, { timeout: IDLE_TIMEOUT_MS });
        } else {
          timeoutId = window.setTimeout(boot, NO_IDLE_DELAY_MS);
        }
      },
      { rootMargin: NEAR_MARGIN },
    );
    near.observe(host);

    return () => {
      cancelled = true;
      near.disconnect();
      if (idleId) window.cancelIdleCallback(idleId);
      window.clearTimeout(timeoutId);
      teardown?.();
    };
  }, []);

  /** Creates the context and runs the renderer; returns its teardown. */
  function startWebGL(host: HTMLDivElement): () => void {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-shader__canvas';
    const gl = getContext(canvas);
    const pending = gl ? beginProgram(gl) : null;
    if (!gl || !pending) {
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      setMode('fallback');
      return () => {};
    }
    const parallel = gl.getExtension('KHR_parallel_shader_compile');
    let renderer: Renderer | null = null;
    host.appendChild(canvas); // transparent until the first frame

    let disposed = false;
    let lost = false;
    let revealed = false;

    /* ---- resolution ------------------------------------------------------ */
    const software = isSoftwareRenderer(gl);
    const minFrameMs = software ? SOFTWARE_MIN_FRAME_MS : MIN_FRAME_MS;
    let quality = software ? 0.6 : 1;
    let cssWidth = host.clientWidth;
    let cssHeight = host.clientHeight;

    /** Sizes the drawing buffer; returns true when it changed (buffer cleared). */
    const resize = (): boolean => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const scale = dpr * RENDER_SCALE * quality;
      let width = Math.max(1, Math.round(cssWidth * scale));
      let height = Math.max(1, Math.round(cssHeight * scale));
      const pixels = width * height;
      if (pixels > MAX_PIXELS) {
        const shrink = Math.sqrt(MAX_PIXELS / pixels);
        width = Math.max(1, Math.round(width * shrink));
        height = Math.max(1, Math.round(height * shrink));
      }
      if (canvas.width === width && canvas.height === height) return false;
      canvas.width = width;
      canvas.height = height;
      return true;
    };

    /* ---- animated state ---------------------------------------------------- */
    const base = parseHex(getComputedStyle(host).getPropertyValue('--fx-shader-base')) ?? DEFAULT_BASE;
    const target = () => PALETTES[liveRef.current.palette];
    const colors: Triad = target().map(c => [...c] as RGB) as Triad;
    let intensityNow = liveRef.current.intensity;
    let time = SEED_TIME[liveRef.current.palette];
    // x/y: smoothed position, tx/ty: last raw sample, energy: recent speed (0..1).
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, strength: 0, energy: 0 };
    const pointerUniform: RGB = [0.5, 0.5, 0];

    const snapSettings = () => {
      const goal = target();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) colors[i][j] = goal[i][j];
      intensityNow = liveRef.current.intensity;
    };

    /** Frame-rate independent easing of palette, intensity and pointer. */
    const step = (dt: number) => {
      const goal = target();
      const kColor = 1 - Math.exp(-dt * 2.5);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) colors[i][j] += (goal[i][j] - colors[i][j]) * kColor;
      intensityNow += (liveRef.current.intensity - intensityNow) * kColor;

      const input = pointerRef.current;
      let targetStrength = 0;
      if (input.enabled && input.present) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const nx = (input.clientX - rect.left) / rect.width;
          const ny = 1 - (input.clientY - rect.top) / rect.height;
          if (nx > -0.05 && nx < 1.05 && ny > -0.05 && ny < 1.05) {
            targetStrength = 1;
            // Appear where the pointer is instead of sliding in from the centre.
            if (pointer.strength < 0.02) {
              pointer.x = pointer.tx = nx;
              pointer.y = pointer.ty = ny;
            }
            // Speed in frame-heights per second (about 1-2 for a brisk sweep).
            const speed = Math.hypot((nx - pointer.tx) * (rect.width / rect.height), ny - pointer.ty) / dt;
            pointer.tx = nx;
            pointer.ty = ny;
            pointer.energy += (Math.min(speed * 0.5, 1) - pointer.energy) * (1 - Math.exp(-dt * 4));
            const kPos = 1 - Math.exp(-dt * 3.2);
            pointer.x += (nx - pointer.x) * kPos;
            pointer.y += (ny - pointer.y) * kPos;
          }
        }
      }
      if (targetStrength === 0) pointer.energy *= Math.exp(-dt * 3);
      pointer.strength += (targetStrength - pointer.strength) * (1 - Math.exp(-dt * 2.2));
      pointerUniform[0] = pointer.x;
      pointerUniform[1] = pointer.y;
      pointerUniform[2] = pointer.strength * (0.75 + 0.5 * pointer.energy);
    };

    /* ---- drawing ------------------------------------------------------------ */
    const render = () => {
      if (!renderer || lost || disposed || cssWidth < 1 || cssHeight < 1) return;
      renderer.draw({
        width: canvas.width,
        height: canvas.height,
        time,
        pointer: pointerUniform,
        intensity: intensityNow,
        base,
        colors,
      });
      if (!revealed) {
        revealed = true;
        // Flush the initial opacity: 0 style so the fade-in transition runs.
        void getComputedStyle(canvas).opacity;
        canvas.classList.add(VISIBLE_CLASS);
        setMode('webgl');
      }
    };

    /* ---- loop control ------------------------------------------------------- */
    let raf = 0;
    let last = 0;
    let inView = true;
    let pageVisible = !document.hidden;
    let frames = 0;
    let sampleTotal = 0;
    let sampleCount = 0;

    const canRun = () =>
      !liveRef.current.reduced &&
      !liveRef.current.paused &&
      inView &&
      pageVisible &&
      !lost &&
      !disposed &&
      renderer !== null;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const delta = now - last;
      if (delta < minFrameMs) return;
      last = now;
      const dt = Math.min(delta, 100) / 1000;
      time += dt;
      step(dt);
      render();

      // Adaptive quality: after a warm-up, average frame intervals and step the
      // resolution down (never up, to avoid oscillation) if we're struggling.
      frames += 1;
      if (frames > 45 && delta < 250) {
        sampleTotal += delta;
        sampleCount += 1;
        if (sampleCount >= 60) {
          if (sampleTotal / sampleCount > SLOW_FRAME_MS && quality > MIN_QUALITY) {
            quality = Math.max(MIN_QUALITY, quality * 0.8);
            if (resize()) render();
          }
          sampleTotal = 0;
          sampleCount = 0;
        }
      }
    };

    const start = () => {
      if (raf || !canRun()) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    /** Applies liveRef: animate, hold the current frame (paused) or a still (reduced). */
    const sync = () => {
      if (liveRef.current.reduced) {
        stop();
        snapSettings();
        time = SEED_TIME[liveRef.current.palette]; // the curated still
        pointerUniform[2] = 0;
        render();
      } else if (liveRef.current.paused) {
        stop(); // the last frame stays on the canvas
      } else {
        start();
      }
    };
    syncRef.current = sync;

    /* ---- observers + events ------------------------------------------------- */
    const resizeObserver = new ResizeObserver(entries => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box) return;
      cssWidth = box.width;
      cssHeight = box.height;
      // Resizing clears the buffer: redraw now so no blank frame is composited.
      if (resize() || !revealed) render();
    });
    resizeObserver.observe(host);

    const intersectionObserver = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        inView = entry.isIntersecting;
        if (inView) start();
        else stop();
      },
      { rootMargin: '160px 0px' },
    );
    intersectionObserver.observe(host);

    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible) start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onContextLost = (event: Event) => {
      event.preventDefault(); // allows webglcontextrestored to fire
      lost = true;
      stop();
      renderer = null; // GPU objects died with the context
      revealed = false;
      canvas.classList.remove(VISIBLE_CLASS);
      if (!disposed) setMode('fallback');
    };
    const onContextRestored = () => {
      if (disposed) return;
      lost = false;
      renderer = createRenderer(gl);
      if (!renderer) return; // stay on the CSS fallback
      resize(); // the host may have changed size while the context was gone
      render(); // first frame fades the canvas back in
      sync();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    /* ---- first frame, once the program is ready ------------------------------ */
    let pollRaf = 0;
    const firstFrame = () => {
      pollRaf = 0;
      if (disposed || lost) return;
      if (!isProgramSettled(gl, parallel, pending)) {
        pollRaf = requestAnimationFrame(firstFrame); // compile still running off-thread
        return;
      }
      renderer = finishRenderer(gl, pending);
      if (!renderer) {
        if (gl.isContextLost()) return; // onContextLost shows the fallback, a restore retries
        lost = true;
        canvas.remove();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        setMode('fallback');
        return;
      }
      snapSettings();
      resize();
      render(); // also the one still frame under reduced motion / a pause
      start(); // no-op under reduced motion / a pause
    };
    firstFrame();

    return () => {
      disposed = true;
      cancelAnimationFrame(pollRaf);
      stop();
      syncRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (!lost) {
        renderer?.dispose();
        // Release the GPU context now rather than whenever GC gets to it
        // (browsers cap live contexts at ~16).
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      renderer = null;
      canvas.remove();
      canvas.width = 1;
      canvas.height = 1;
    };
  }

  const classes = ['fx-shader', `fx-shader--${palette}`, mode === 'fallback' && 'fx-shader--fallback', className]
    .filter(Boolean)
    .join(' ');

  return <div ref={hostRef} className={classes} aria-hidden="true" data-state={mode} />;
}
