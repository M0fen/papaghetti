/**
 * render.ts — draws ONE interpolated frame of EL ENREDO from a World snapshot.
 *
 * Pure view: reads the SoA snapshot (POS = Q16.16) and paints. The engine owns the sim
 * clock and the juice state (particles, mouthOpen, gaze, head flash…) and passes them on
 * FrameState; nothing here advances the sim. Determinism is untouched.
 *
 * North star: "the little-snake game, noodle edition" (slither.io + spaghetti). The body is
 * a glossy sauce-coated noodle that drips a simple red sauce trail; the head is a real little
 * character (two eyes with catchlights + gaze, a mouth that opens when it eats); food is baked
 * once into an offscreen sprite atlas and blitted with a single drawImage (fast + tasty).
 *
 * PERF CONTRACT (from the adversarial review): NO per-frame allocation in the hot loop — every
 * gradient / pattern / dash array is a module cache built once (initCaches) or on resize
 * (vignette). Lethal hazards keep a non-hue (white pulsing) channel so they stay readable when
 * the warm heat wash peaks. Colorblind channel = topping SHAPE, preserved in every baked sprite.
 */

import {
  SPACING,
  EAT_RADIUS,
  HEAD_HITBOX,
  FORK_CAPTURE_RADIUS,
  COSECHA_MAX,
  ALMIDON_MAX,
  SERVICE_COUNT,
  CLUSTER_RADIUS,
  PAPA_LIFE_TICKS,
} from "@/game/sim/constants.ts";
import { TOP_FLAG, OBS, OBS_FLAG, PAPA, CARD_TAG_ORDER } from "@/game/sim/types.ts";
import type { World } from "@/game/sim/types.ts";
import { CARDS, CARD_POOL, CARD_TAGS } from "@/game/sim/cards.ts";
import {
  PALETTE,
  RGB_ESPRESSO,
  RGB_CREMA,
  RGB_AMBAR,
  RGB_ROJO,
  RGB_VERDE,
  RGB_SALSA,
  RGB_SALSA_DARK,
  RGB_PAN,
  RGB_PAN_RIM,
  RGB_IRON_HI,
  RGB_IRON_LO,
  RGB_PLATE,
  RGB_PLATE_LO,
  RGB_HEBRA,
  RGB_HEBRA_STROKE,
  RGB_HEBRA_HI,
  RGB_PAPA_FRANCESA,
  RGB_PAPA_CRIOLLA,
  RGB_OIL,
  RGB_OIL_RIM,
  RGB_WALL,
  RGB_FORK,
  TOPPING_STYLES,
  rgba,
  rgb,
  heatColor,
  panColor,
  tipoColor,
  mixRgb,
} from "./palette.ts";
import { abilityLayout } from "./input.ts";

const F = 65536; // POS -> world units
const MAXN = 4096; // MAX_NODES; matches the sim body cap
const TAU = Math.PI * 2;

// Module-level scratch so the hot render loop never allocates per frame.
const sx = new Float64Array(MAXN);
const sy = new Float64Array(MAXN);

// Synergy tag colours (build visibility). Order matches CARD_TAG_ORDER.
const TAG_RGB: Record<string, readonly [number, number, number]> = {
  FUEGO: [240, 116, 42],
  GRASA: [242, 193, 78],
  LAZO: [200, 50, 30],
  VELOZ: [127, 208, 192],
  COSECHA: [143, 224, 74],
};
const _synCounts = new Int32Array(8);

export type Rect = { x: number; y: number; w: number; h: number };
export type Viewport = { w: number; h: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

export type Camera = {
  x: number; // world-unit focus X
  y: number; // world-unit focus Y
  scale: number; // px per world unit (includes micro-zoom)
  biasY: number; // px: shift content UP so the head sits above the thumb
  shakeX: number; // px
  shakeY: number; // px
};

/**
 * View-only particle pool (owned by engine, passed by reference — zero copy per frame).
 * Positions are WORLD units so the camera moves them. Colors are fixed per type at draw time
 * (no per-particle string building). See PT_* constants for the type meanings.
 */
export type Particles = {
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array; // 0..1 remaining (1 = fresh)
  size: Float32Array; // world units
  type: Uint8Array;
  count: number;
};

// Particle types.
export const PT_SAUCE = 0; // trail decal — under the body, source-over, dark red
export const PT_BURST = 1; // eat splash — additive, sauce-orange
export const PT_SPARK = 2; // enredo — additive, gold
export const PT_SPEED = 3; // boost streak — additive, cream
export const PT_MIGA = 4; // crumb — source-over over body
export const PT_VAPOR = 5; // ambient steam — additive, faint
export const PT_FLASH = 6; // white pop — additive

export type FrameState = {
  world: World;
  prevBodyX: Int32Array;
  prevBodyY: Int32Array;
  prevBodyCount: number;
  alpha: number; // interpolation 0..1 (prev -> current)
  cam: Camera;
  heat01: number; // 0..1 smoothed heat (multiplier)
  enredoFlash: number; // 0..1 golden fill intensity
  reduceEffects: boolean;
  insets: Insets;
  draftCards: Rect[]; // engine-computed (== draftLayout), empty when not drafting
  rerollRect: Rect | null;
  steer: { ox: number; oy: number; x: number; y: number } | null; // joystick geometry (HUD ring)
  boosting: boolean; // for the ability-pad highlight
  pops: { wx: number; wy: number; age: number; text: string }[]; // floating "+score" juice
  // juice (view-only, dt-normalized in engine)
  parts: Particles;
  mouthOpen: number; // 0..1 — opens when eating
  headStretch: number; // squash-stretch scale (~1 idle, >1 boost, <1 gulp)
  flashHead: number; // 0..1 white hit-flash on the head
  gaze: number; // radians — where the eyes look (micro-lag toward heading)
  abilityPulse: number; // 0..1 "ready" pulse on the ability button
  picked: string[]; // card ids taken this run (build chips)
};

// ---------------------------------------------------------------------------
// Module caches (built once against the stable canvas ctx; vignette on resize).
// ---------------------------------------------------------------------------
type Off = OffscreenCanvas | HTMLCanvasElement;

let cachesReady = false;
let GLOW_WARM: CanvasGradient | null = null;
let GLOW_GREEN: CanvasGradient | null = null;
let GLOW_RED: CanvasGradient | null = null;
let EYE_GRAD: CanvasGradient | null = null;
let VIGNETTE: CanvasGradient | null = null;
let vigW = 0;
let vigH = 0;
let GRAIN: CanvasPattern | null = null; // tiled film-grain noise (makes the flat vector look "expensive")
let IRON: CanvasPattern | null = null; // coarse cast-iron mottle (the pan is USED, not a flat colour)
const ATLAS: Off[] = []; // baked food sprites, indexed by ToppingCode 0..7
const ATLAS_PX = 72; // sprite canvas size
const ATLAS_R = 24; // baked food radius inside the sprite
const SAUCE_DASH: number[] = [6, 6]; // obstacle "salsa" ring
const EMPTY_DASH: number[] = [];

function makeOffscreen(w: number, h: number): Off {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      return new OffscreenCanvas(w, h);
    } catch {
      /* fall through to DOM canvas */
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function offCtx(c: Off): CanvasRenderingContext2D {
  return c.getContext("2d") as unknown as CanvasRenderingContext2D;
}

function unitGrad(
  ctx: CanvasRenderingContext2D,
  stops: Array<[number, string]>,
): CanvasGradient {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function initCaches(ctx: CanvasRenderingContext2D): void {
  GLOW_WARM = unitGrad(ctx, [
    [0, "rgba(255,196,110,0.85)"],
    [1, "rgba(255,196,110,0)"],
  ]);
  GLOW_GREEN = unitGrad(ctx, [
    [0, "rgba(120,210,130,0.8)"],
    [1, "rgba(120,210,130,0)"],
  ]);
  GLOW_RED = unitGrad(ctx, [
    [0, "rgba(230,70,40,0.8)"],
    [1, "rgba(230,70,40,0)"],
  ]);
  EYE_GRAD = unitGrad(ctx, [
    [0, "#ffffff"],
    [0.7, "#f3f4f6"],
    [1, "#d7dbe2"],
  ]);
  GRAIN = ctx.createPattern(bakeGrain(), "repeat");
  IRON = ctx.createPattern(bakeIron(), "repeat");
  bakeAtlas();
  cachesReady = true;
}

// Film grain: a 64×64 monochrome noise tile, repeated across the frame at low alpha. Baked once
// (Math.random is fine here — view init, never the sim). Static (screen-fixed) so it never boils.
function bakeGrain(): Off {
  const S = 64;
  const c = makeOffscreen(S, S);
  const g = offCtx(c);
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 110 + ((Math.random() * 90) | 0); // gray 110..200
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Cast-iron mottle: a 128×128 tile of warm-dark speckle + a few smudges, tiled over the pan at low
// alpha so the surface reads as USED seasoned iron, not a flat fill. Baked once (view-only random).
function bakeIron(): Off {
  const S = 128;
  const c = makeOffscreen(S, S);
  const g = offCtx(c);
  g.fillStyle = "rgba(0,0,0,0)";
  g.fillRect(0, 0, S, S);
  // fine speckle
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const light = Math.random() < 0.5;
    const a = 0.04 + Math.random() * 0.06;
    g.fillStyle = light ? `rgba(70,52,36,${a})` : `rgba(14,9,6,${a})`;
    g.beginPath();
    g.arc(x, y, 0.6 + Math.random() * 1.4, 0, TAU);
    g.fill();
  }
  // a few broad seasoning smudges
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 8 + Math.random() * 22;
    const sm = g.createRadialGradient(x, y, 0, x, y, r);
    sm.addColorStop(0, `rgba(20,13,8,${0.05 + Math.random() * 0.05})`);
    sm.addColorStop(1, "rgba(20,13,8,0)");
    g.fillStyle = sm;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  return c;
}

// Stamp a cached unit-radial gradient at (x,y) with radius r. No allocation.
function stamp(
  ctx: CanvasRenderingContext2D,
  g: CanvasGradient | null,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  if (!g || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Bake the 8 food sprites ONCE under a FIXED light (from ABOVE-LEFT). Zero per-frame cost:
// the hot loop is a single drawImage per topping. Math.random here is fine (one-time, view-only).
//
// THE LIGHT MODEL (no black outlines — separation comes from LIGHT, Overcooked-style):
//   1. AO      — soft dark ellipse, offset DOWN-RIGHT (the object floats above the pan)
//   2. FORM    — radial gradient, light core pushed UP-LEFT → volume
//   3. SHADOW  — the OWN dark colour on the DOWN-RIGHT edge (a shadow edge, never a black contour)
//   4. RIM     — a thin WARM arc on the UP-LEFT edge (this is what replaces the outline)
//   5. SPEC    — a specular highlight whose SHAPE encodes the MATERIAL (gloss/semi/matte)
// ---------------------------------------------------------------------------
const FOOD_GREEN = "#5AAE5C";
const FOOD_GREEN_HI = "#8FD07C";
// Material per ToppingCode (0 tomate 1 queso 2 cebolla 3 maíz 4 rizadas 5 piña 6 huevo 7 chicharrón).
type Mat = "gloss" | "semi" | "matte";
const KIND_MAT: Mat[] = ["gloss", "semi", "gloss", "semi", "matte", "semi", "gloss", "matte"];

/** Soft contact shadow (ambient occlusion), offset DOWN-RIGHT — obeys the one-light law. */
function aoEllipse(g: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  const ao = g.createRadialGradient(cx + R * 0.14, cy + R * 0.7, R * 0.1, cx + R * 0.14, cy + R * 0.7, R * 1.15);
  ao.addColorStop(0, "rgba(0,0,0,0.30)");
  ao.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = ao;
  g.beginPath();
  g.ellipse(cx + R * 0.14, cy + R * 0.72, R * 1.02, R * 0.5, 0, 0, TAU);
  g.fill();
}
/** Build a path (beginPath already implied by caller closures); then FORM+SHADOW+RIM in one place. */
function litBody(
  g: CanvasRenderingContext2D,
  build: () => void,
  cx: number,
  cy: number,
  R: number,
  light: string,
  mid: string,
  dark: string,
): void {
  // FORM: light core pushed up-left.
  const vg = g.createRadialGradient(cx - R * 0.38, cy - R * 0.44, R * 0.1, cx, cy, R * 1.08);
  vg.addColorStop(0, light);
  vg.addColorStop(0.55, mid);
  vg.addColorStop(1, dark);
  build();
  g.fillStyle = vg;
  g.fill();
  // SHADOW EDGE: own dark colour, fading in from the down-right (NOT a black outline).
  const sg = g.createLinearGradient(cx + R, cy + R, cx - R * 0.15, cy - R * 0.15);
  sg.addColorStop(0, dark);
  sg.addColorStop(0.5, "rgba(0,0,0,0)");
  build();
  g.lineWidth = Math.max(2, R * 0.17);
  g.strokeStyle = sg;
  g.stroke();
}
/** Warm rim on the UP-LEFT edge — the light-based replacement for the black contour. */
function rimLight(g: CanvasRenderingContext2D, build: () => void, cx: number, cy: number, R: number, strength = 0.95): void {
  const rg = g.createLinearGradient(cx - R, cy - R, cx + R * 0.2, cy + R * 0.2);
  rg.addColorStop(0, `rgba(255,231,180,${strength})`);
  rg.addColorStop(0.5, "rgba(255,231,180,0)");
  build();
  g.lineWidth = Math.max(1.4, R * 0.12);
  g.strokeStyle = rg;
  g.stroke();
}
/** Specular whose SHAPE reads the material: gloss=small hard hot dot, semi=medium, matte=wide faint. */
function specHi(g: CanvasRenderingContext2D, x: number, y: number, R: number, mat: Mat): void {
  if (mat === "matte") {
    const sg = g.createRadialGradient(x, y, 0, x, y, R * 0.62);
    sg.addColorStop(0, "rgba(255,248,232,0.26)");
    sg.addColorStop(1, "rgba(255,248,232,0)");
    g.fillStyle = sg;
    g.beginPath();
    g.arc(x, y, R * 0.62, 0, TAU);
    g.fill();
  } else if (mat === "semi") {
    const sg = g.createRadialGradient(x, y, 0, x, y, R * 0.34);
    sg.addColorStop(0, "rgba(255,252,242,0.72)");
    sg.addColorStop(1, "rgba(255,252,242,0)");
    g.fillStyle = sg;
    g.beginPath();
    g.arc(x, y, R * 0.34, 0, TAU);
    g.fill();
  } else {
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.beginPath();
    g.arc(x, y, R * 0.16, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.4)";
    g.beginPath();
    g.arc(x, y, R * 0.28, 0, TAU);
    g.fill();
  }
}
/** Curly-fry spiral path (stroke it several times with decreasing width for a fried coil). */
function spiralPath(g: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  g.beginPath();
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * 2.4 * TAU;
    const rr = R * 0.26 + t * R * 0.64;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
}
/** roundRect PATH on an offscreen context (no fill/stroke performed). */
function roundRectG(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// Recognisable FOOD, chunky + toy-like, lit by ONE up-left light. Colours from TOPPING_STYLES
// (accent = lit tint, fill = mid, stroke = the OWN dark shade used for the shadow edge & details).
function bakeAtlas(): void {
  ATLAS.length = 0;
  for (let kind = 0; kind < 8; kind++) {
    const c = makeOffscreen(ATLAS_PX, ATLAS_PX);
    const g = offCtx(c);
    const cx = ATLAS_PX / 2;
    const cy = ATLAS_PX / 2;
    const R = ATLAS_R;
    const st = TOPPING_STYLES[kind];
    const mat = KIND_MAT[kind];
    g.lineJoin = "round";
    g.lineCap = "round";
    aoEllipse(g, cx, cy, R);

    if (kind === 0) {
      // TOMATE (salsa): plump red sphere + green calyx & stem.
      const cyb = cy + R * 0.08;
      const body = (): void => {
        g.beginPath();
        g.arc(cx, cyb, R * 0.95, 0, TAU);
      };
      litBody(g, body, cx, cyb, R * 0.95, st.accent, st.fill, st.stroke);
      // green calyx (own lighting: base green + up-left hi)
      for (let k = -2; k <= 2; k++) {
        const a = -Math.PI / 2 + k * 0.55;
        g.fillStyle = k <= 0 ? FOOD_GREEN_HI : FOOD_GREEN;
        g.beginPath();
        g.moveTo(cx, cy - R * 0.46);
        g.lineTo(cx + Math.cos(a) * R * 0.5, cy - R * 0.46 + Math.sin(a) * R * 0.5);
        g.lineTo(cx + Math.cos(a + 0.28) * R * 0.16, cy - R * 0.46 + Math.sin(a + 0.28) * R * 0.16);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = FOOD_GREEN_HI;
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(cx, cy - R * 0.46);
      g.lineTo(cx + 2, cy - R * 0.95);
      g.stroke();
      rimLight(g, body, cx, cyb, R * 0.95);
      specHi(g, cx - R * 0.3, cyb - R * 0.36, R, mat);
    } else if (kind === 1) {
      // CUÑA DE QUESO con corteza y huecos.
      const wedge = (): void => {
        g.beginPath();
        g.moveTo(cx - R * 0.92, cy + R * 0.58);
        g.arcTo(cx + R * 0.98, cy + R * 0.58, cx + R * 0.98, cy - R * 0.3, R * 0.16);
        g.lineTo(cx + R * 0.98, cy - R * 0.3);
        g.closePath();
      };
      litBody(g, wedge, cx, cy + R * 0.2, R * 1.05, st.accent, st.fill, st.stroke);
      // rind band (lighter top)
      g.save();
      wedge();
      g.clip();
      g.fillStyle = st.accent;
      g.fillRect(cx - R, cy + R * 0.42, R * 2, R * 0.2);
      g.restore();
      // holes (own dark, each with a tiny down-right sink)
      const holes: Array<[number, number, number]> = [
        [cx + R * 0.3, cy + R * 0.14, 3],
        [cx + R * 0.56, cy + R * 0.36, 2.4],
        [cx + R * 0.08, cy + R * 0.38, 2.2],
      ];
      for (const [hx, hy, hr] of holes) {
        g.fillStyle = st.stroke;
        g.beginPath();
        g.arc(hx, hy, hr, 0, TAU);
        g.fill();
        g.fillStyle = "rgba(255,235,150,0.5)"; // rim of the hole catches light up-left
        g.beginPath();
        g.arc(hx - hr * 0.3, hy - hr * 0.3, hr * 0.5, 0, TAU);
        g.fill();
      }
      rimLight(g, wedge, cx, cy + R * 0.2, R * 1.05);
      specHi(g, cx + R * 0.4, cy - R * 0.04, R, mat);
    } else if (kind === 2) {
      // RODAJA DE CEBOLLA (capas concéntricas translúcidas).
      const body = (): void => {
        g.beginPath();
        g.arc(cx, cy, R, 0, TAU);
      };
      litBody(g, body, cx, cy, R, "#F6EEFC", st.fill, st.stroke);
      g.strokeStyle = "rgba(120,102,150,0.6)";
      g.lineWidth = Math.max(1.3, R * 0.07);
      for (const rr of [R * 0.72, R * 0.5, R * 0.28]) {
        g.beginPath();
        g.arc(cx, cy, rr, 0, TAU);
        g.stroke();
      }
      rimLight(g, body, cx, cy, R);
      specHi(g, cx - R * 0.32, cy - R * 0.34, R, mat);
    } else if (kind === 3) {
      // MAZORCA DE MAÍZ (hojas verdes + cob con granos).
      g.fillStyle = FOOD_GREEN;
      g.beginPath();
      g.moveTo(cx - R * 0.5, cy + R * 0.35);
      g.quadraticCurveTo(cx - R * 0.95, cy + R * 0.95, cx - R * 0.15, cy + R * 0.98);
      g.quadraticCurveTo(cx - R * 0.28, cy + R * 0.6, cx, cy + R * 0.5);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(cx + R * 0.5, cy + R * 0.35);
      g.quadraticCurveTo(cx + R * 0.95, cy + R * 0.95, cx + R * 0.15, cy + R * 0.98);
      g.quadraticCurveTo(cx + R * 0.28, cy + R * 0.6, cx, cy + R * 0.5);
      g.closePath();
      g.fill();
      const cob = (): void => roundRectG(g, cx - R * 0.46, cy - R * 0.98, R * 0.92, R * 1.7, R * 0.42);
      litBody(g, cob, cx, cy - R * 0.1, R, st.accent, st.fill, st.stroke);
      // kernels (own dark grid, each with a lit top-left facet)
      g.save();
      cob();
      g.clip();
      for (let ry = -3; ry <= 3; ry++) {
        for (let rx = -1; rx <= 1; rx++) {
          const kx = cx + rx * R * 0.28;
          const ky = cy - R * 0.2 + ry * R * 0.22;
          g.fillStyle = "rgba(140,120,20,0.55)";
          g.beginPath();
          g.arc(kx, ky, 2.4, 0, TAU);
          g.fill();
          g.fillStyle = "rgba(255,246,190,0.6)";
          g.beginPath();
          g.arc(kx - 0.7, ky - 0.7, 1.1, 0, TAU);
          g.fill();
        }
      }
      g.restore();
      rimLight(g, cob, cx, cy - R * 0.1, R);
      specHi(g, cx - R * 0.18, cy - R * 0.44, R, mat);
    } else if (kind === 4) {
      // PAPA RIZADA (espiral frita) — matte: no hard highlight, warm cross-light along the coil.
      g.strokeStyle = st.stroke;
      g.lineWidth = R * 0.52;
      spiralPath(g, cx, cy, R);
      g.stroke();
      // volume: coil brighter on the up-left via a linear gradient stroke.
      const vg = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      vg.addColorStop(0, st.accent);
      vg.addColorStop(0.5, st.fill);
      vg.addColorStop(1, st.stroke);
      g.strokeStyle = vg;
      g.lineWidth = R * 0.36;
      spiralPath(g, cx, cy, R);
      g.stroke();
      g.strokeStyle = "rgba(255,240,205,0.4)";
      g.lineWidth = R * 0.1;
      spiralPath(g, cx, cy, R);
      g.stroke();
      specHi(g, cx - R * 0.24, cy - R * 0.26, R, mat);
    } else if (kind === 5) {
      // PIÑA (corona verde + cuerpo con retícula).
      for (const dx of [-R * 0.32, 0, R * 0.32]) {
        g.fillStyle = dx <= 0 ? FOOD_GREEN_HI : FOOD_GREEN;
        g.beginPath();
        g.moveTo(cx + dx, cy - R * 0.48);
        g.lineTo(cx + dx - R * 0.16, cy - R * 1.12);
        g.lineTo(cx + dx + R * 0.16, cy - R * 0.98);
        g.closePath();
        g.fill();
      }
      const body = (): void => {
        g.beginPath();
        g.ellipse(cx, cy + R * 0.16, R * 0.82, R * 0.94, 0, 0, TAU);
      };
      litBody(g, body, cx, cy + R * 0.16, R * 0.94, st.accent, st.fill, st.stroke);
      g.save();
      g.beginPath();
      g.ellipse(cx, cy + R * 0.16, R * 0.8, R * 0.92, 0, 0, TAU);
      g.clip();
      g.strokeStyle = "rgba(120,140,40,0.7)";
      g.lineWidth = 1.3;
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(cx - R, cy + k * 9 - R);
        g.lineTo(cx + R, cy + k * 9 + R);
        g.stroke();
        g.beginPath();
        g.moveTo(cx - R, cy + k * 9 + R);
        g.lineTo(cx + R, cy + k * 9 - R);
        g.stroke();
      }
      g.restore();
      rimLight(g, body, cx, cy + R * 0.16, R * 0.94);
      specHi(g, cx - R * 0.24, cy - R * 0.06, R, mat);
    } else if (kind === 6) {
      // HUEVO FRITO (clara ondulada + yema brillante).
      const white = (): void => {
        g.beginPath();
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * TAU;
          const wob = R * (1 + 0.16 * Math.sin(a * 3 + 0.7));
          const px = cx + Math.cos(a) * wob;
          const py = cy + Math.sin(a) * wob * 0.92;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
      };
      litBody(g, white, cx, cy, R, "#FFFFFF", st.fill, st.stroke);
      rimLight(g, white, cx, cy, R, 0.7);
      // yolk with its own volume + hard gloss.
      const yolk = (): void => {
        g.beginPath();
        g.arc(cx + R * 0.08, cy, R * 0.42, 0, TAU);
      };
      litBody(g, yolk, cx + R * 0.08, cy, R * 0.42, "#FFE79A", "#FFB01F", "#C9740C");
      specHi(g, cx - R * 0.02, cy - R * 0.14, R * 0.42, "gloss");
      specHi(g, cx - R * 0.5, cy - R * 0.36, R, "semi"); // sheen on the white
    } else {
      // CHICHARRÓN (blob crujiente inflado + burbujas) — matte, rugoso.
      const blob = (): void => {
        g.beginPath();
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * TAU;
          const wob = R * (0.82 + 0.2 * Math.sin(a * 3 + 1.2) + 0.08 * Math.sin(a * 5 + 0.5));
          const px = cx + Math.cos(a) * wob;
          const py = cy + Math.sin(a) * wob * 0.94;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
      };
      litBody(g, blob, cx, cy, R, st.accent, st.fill, st.stroke);
      const craters: Array<[number, number, number]> = [
        [cx - R * 0.22, cy - R * 0.12, 3],
        [cx + R * 0.26, cy + R * 0.04, 2.4],
        [cx + R * 0.02, cy + R * 0.34, 2.2],
      ];
      for (const [hx, hy, hr] of craters) {
        g.fillStyle = "rgba(80,50,20,0.6)";
        g.beginPath();
        g.arc(hx, hy, hr, 0, TAU);
        g.fill();
        g.fillStyle = "rgba(255,224,170,0.45)";
        g.beginPath();
        g.arc(hx - hr * 0.3, hy - hr * 0.3, hr * 0.5, 0, TAU);
        g.fill();
      }
      rimLight(g, blob, cx, cy, R, 0.7);
      specHi(g, cx - R * 0.16, cy - R * 0.2, R, mat);
    }
    ATLAS.push(c);
  }
}

// ---------------------------------------------------------------------------
// Small draw helpers
// ---------------------------------------------------------------------------
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Draft layout — shared by the engine (hit-test) and render (draw) so they agree.
// ---------------------------------------------------------------------------
export function draftLayout(
  vw: number,
  vh: number,
  count: number,
  hasReroll: boolean,
  insets: Insets,
): { cards: Rect[]; reroll: Rect | null } {
  const padX = 20 + insets.left;
  const padR = 20 + insets.right;
  const gap = 12;
  const n = Math.max(1, count);
  const areaTop = vh * 0.44;
  const areaBottom = vh - insets.bottom - (hasReroll ? 78 : 22);
  const totalW = vw - padX - padR;
  const cw = (totalW - gap * (n - 1)) / n;
  const ch = Math.max(96, areaBottom - areaTop);
  const cards: Rect[] = [];
  for (let i = 0; i < n; i++) {
    cards.push({ x: padX + i * (cw + gap), y: areaTop, w: cw, h: ch });
  }
  const reroll: Rect | null = hasReroll
    ? { x: vw / 2 - 78, y: areaBottom + 14, w: 156, h: 50 }
    : null;
  return { cards, reroll };
}

// ===========================================================================
// Main entry
// ===========================================================================
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  fs: FrameState,
): void {
  if (!cachesReady) initCaches(ctx);

  const { world: w, cam, alpha } = fs;
  const vw = view.w;
  const vh = view.h;
  const reduce = fs.reduceEffects;

  const w2sx = (ux: number): number => vw / 2 + (ux - cam.x) * cam.scale + cam.shakeX;
  const w2sy = (uy: number): number =>
    vh / 2 + (uy - cam.y) * cam.scale + cam.shakeY - cam.biasY;

  // --- 1. DARK PAN whose colour rides the multiplier (heat), with a soft warm centre glow ---
  ctx.fillStyle = rgb(panColor(fs.heat01));
  ctx.fillRect(0, 0, vw, vh);
  if (!reduce) stamp(ctx, GLOW_WARM, vw / 2, vh * 0.42, Math.min(vw, vh) * 0.62, 0.08 + 0.05 * fs.heat01);

  // --- 3. live border (the pan) + clip playfield ---
  const halfU = w.usableHalf / F;
  const bx = w2sx(-halfU);
  const by = w2sy(-halfU);
  const bw = 2 * halfU * cam.scale;
  const bh = 2 * halfU * cam.scale;
  ctx.save();
  ctx.fillStyle = rgba(RGB_PAN, 0.5);
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.fill();
  ctx.lineWidth = Math.max(2, 3 * (cam.scale > 0.3 ? 1 : 0.6));
  ctx.strokeStyle = rgb(mixRgb(RGB_PAN_RIM, RGB_FORK, fs.heat01 * 0.7));
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.stroke();
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.clip();

  // --- 3b. CAST-IRON surface: mottle tile + concentric wear rings (a USED pan). Under everything. ---
  if (!reduce && IRON) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = IRON;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
  }
  {
    const ox = w2sx(0);
    const oy = w2sy(0);
    const rPx = halfU * cam.scale;
    ctx.lineWidth = Math.max(1, cam.scale * 2.2);
    for (let k = 1; k <= 4; k++) {
      const rr = rPx * (0.26 + k * 0.17);
      ctx.strokeStyle = rgba(RGB_IRON_HI, 0.1); // top arc: lit
      ctx.beginPath();
      ctx.arc(ox, oy, rr, Math.PI, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(RGB_IRON_LO, 0.13); // bottom arc: shadow
      ctx.beginPath();
      ctx.arc(ox, oy, rr, 0, Math.PI);
      ctx.stroke();
    }
  }

  // --- 3c. FORK telegraph: its tall shadow (h4) reaches into frame BEFORE the fork enters. ---
  if (w.fork.active === 1) drawForkShadow(ctx, w, w2sx, w2sy, cam);

  // --- 3d. ceramic PLATES under each cluster (teach the enredo: "surround this"). Decoration. ---
  drawPlates(ctx, w, w2sx, w2sy, cam, fs.enredoFlash, reduce);

  const parts = fs.parts;

  // --- 4. SAUCE TRAIL — a FAINT dark stain under the noodle. Deliberately subdued (no gloss, low
  //        alpha) so it never competes with the salsa TOPPING (sacred hierarchy: food wins). ---
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_SAUCE) continue;
    const life = parts.life[i];
    const a = Math.min(0.3, life * 0.5); // faint residue, fades quickly
    if (a <= 0.02) continue;
    const x = w2sx(parts.px[i]);
    const y = w2sy(parts.py[i]);
    const r = parts.size[i] * cam.scale * (0.55 + 0.3 * life);
    ctx.globalAlpha = a;
    ctx.fillStyle = rgb(RGB_SALSA_DARK); // dark matte stain, no highlight
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- 5. obstacles: oil / walls / knives / sauce / whisk ---
  for (let i = 0; i < w.obsCount; i++) {
    const flags = w.obsFlags[i];
    if ((flags & OBS_FLAG.ACTIVE) === 0) continue;
    if ((flags & OBS_FLAG.DESTROYED) !== 0) continue;
    const ox = w2sx(w.obsX[i] / F);
    const oy = w2sy(w.obsY[i] / F);
    const or = (w.obsRadius[i] / F) * cam.scale;
    const lethal = (flags & OBS_FLAG.LETHAL) !== 0;
    const phase = ((w.obsPhase[i] & 0xffff) / F) * TAU;
    const t = w.obsType[i];
    if (t === OBS.OIL) {
      // OILY MIRROR: a deep dark pool that reads as danger by DARKNESS + shape (never by colour),
      // with a MOVING elongated specular streak (the "espejo/aceitoso" material) that slowly drifts.
      const orr = or * (1 + 0.06 * Math.sin(w.tick * 0.05 + i * 1.3));
      const og = ctx.createRadialGradient(ox - orr * 0.3, oy - orr * 0.34, orr * 0.1, ox, oy, orr);
      og.addColorStop(0, rgb(RGB_OIL_RIM));
      og.addColorStop(0.5, rgb(RGB_OIL));
      og.addColorStop(1, "rgba(8,5,3,1)");
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(ox, oy, orr, 0, TAU);
      ctx.fill();
      if (!reduce) {
        const dphase = w.tick * 0.03 + i * 2.1;
        const sxo = ox + Math.cos(dphase) * orr * 0.26;
        const syo = oy + Math.sin(dphase * 0.7) * orr * 0.16 - orr * 0.22;
        ctx.save();
        ctx.translate(sxo, syo);
        ctx.rotate(-0.7);
        const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, orr * 0.5);
        sg.addColorStop(0, "rgba(255,222,150,0.5)");
        sg.addColorStop(1, "rgba(255,222,150,0)");
        ctx.fillStyle = sg;
        ctx.scale(1, 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, orr * 0.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // warm rim on the up-left lip (light-based edge, not a flat contour)
      const rimG = ctx.createLinearGradient(ox - orr, oy - orr, ox + orr * 0.2, oy + orr * 0.2);
      rimG.addColorStop(0, "rgba(255,210,150,0.4)");
      rimG.addColorStop(0.5, "rgba(255,210,150,0)");
      ctx.lineWidth = 2;
      ctx.strokeStyle = rimG;
      ctx.beginPath();
      ctx.arc(ox, oy, orr, 0, TAU);
      ctx.stroke();
    } else if (t === OBS.WALL) {
      // a chunky iron lump: volume gradient (lit up-left) + warm rim, no flat outline.
      const wg = ctx.createRadialGradient(ox - or * 0.34, oy - or * 0.4, or * 0.1, ox, oy, or);
      wg.addColorStop(0, rgb(mixRgb(RGB_WALL, [96, 76, 56], 0.7)));
      wg.addColorStop(0.6, rgb(RGB_WALL));
      wg.addColorStop(1, rgb(mixRgb(RGB_WALL, RGB_ESPRESSO, 0.6)));
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, TAU);
      ctx.fill();
      const rimG = ctx.createLinearGradient(ox - or, oy - or, ox + or * 0.2, oy + or * 0.2);
      rimG.addColorStop(0, "rgba(255,231,180,0.5)");
      rimG.addColorStop(0.5, "rgba(255,231,180,0)");
      ctx.lineWidth = Math.max(1.5, or * 0.12);
      ctx.strokeStyle = rimG;
      ctx.beginPath();
      ctx.arc(ox, oy, or * 0.95, 0, TAU);
      ctx.stroke();
    } else if (t === OBS.SAUCE) {
      ctx.fillStyle = rgba(RGB_VERDE, 0.3);
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, TAU);
      ctx.fill();
      ctx.setLineDash(SAUCE_DASH);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(RGB_VERDE, 0.8);
      ctx.stroke();
      ctx.setLineDash(EMPTY_DASH);
    } else if (t === OBS.KNIFE) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(phase);
      ctx.fillStyle = lethal ? rgb(RGB_ROJO) : "#9AA0A8";
      ctx.beginPath();
      ctx.moveTo(-or, -3);
      ctx.lineTo(or, -1);
      ctx.lineTo(or, 1);
      ctx.lineTo(-or, 3);
      ctx.closePath();
      ctx.fill();
      // COLD METAL: a hard linear light on the top edge + a dark underside (the steel "filo").
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = lethal ? "rgba(255,190,180,0.95)" : "rgba(245,248,252,0.95)";
      ctx.beginPath();
      ctx.moveTo(-or, -2.4);
      ctx.lineTo(or, -0.8);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.moveTo(-or, 2.4);
      ctx.lineTo(or, 0.8);
      ctx.stroke();
      ctx.restore();
    } else if (t === OBS.WHISK) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(phase);
      ctx.strokeStyle = lethal ? rgb(RGB_ROJO) : "#D9DCE0";
      ctx.lineWidth = 2.5;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(a) * or * 0.5,
          Math.sin(a) * or * 0.5,
          Math.cos(a) * or,
          Math.sin(a) * or,
        );
        ctx.stroke();
      }
      ctx.restore();
    }
    // LETHAL: non-hue channel (white pulse) so hazards stay readable under the warm wash.
    if (lethal) {
      const pulse = 0.55 + 0.45 * Math.sin(w.tick * 0.2 + i);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.4 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(ox, oy, or + 1.5, 0, TAU);
      ctx.stroke();
      if (t !== OBS.KNIFE && t !== OBS.WHISK) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba(RGB_ROJO, 0.9);
        ctx.beginPath();
        ctx.arc(ox, oy, or, 0, TAU);
        ctx.stroke();
      }
    }
  }

  // --- 6. smoke + burn zones ---
  if (!reduce) {
    for (let i = 0; i < w.smokeCount; i++) {
      const life = w.smokeExpire[i] - w.tick;
      if (life <= 0) continue;
      const a = Math.min(0.3, life / 400);
      ctx.fillStyle = rgba([120, 120, 120], a);
      ctx.beginPath();
      ctx.arc(w2sx(w.smokeX[i] / F), w2sy(w.smokeY[i] / F), 10 * cam.scale + 4, 0, TAU);
      ctx.fill();
    }
  }
  for (let i = 0; i < w.burnCount; i++) {
    const life = w.burnExpire[i] - w.tick;
    if (life <= 0) continue;
    const br = (w.burnR[i] / F) * cam.scale;
    ctx.fillStyle = rgba(RGB_AMBAR, Math.min(0.4, life / 300));
    ctx.beginPath();
    ctx.arc(w2sx(w.burnX[i] / F), w2sy(w.burnY[i] / F), br, 0, TAU);
    ctx.fill();
  }

  // --- interpolate body node screen positions ---
  const n = w.bodyCount;
  const pn = fs.prevBodyCount;
  for (let i = 0; i < n; i++) {
    const cxp = w.bodyX[i];
    const cyp = w.bodyY[i];
    if (i < pn) {
      sx[i] = w2sx((fs.prevBodyX[i] + (cxp - fs.prevBodyX[i]) * alpha) / F);
      sy[i] = w2sy((fs.prevBodyY[i] + (cyp - fs.prevBodyY[i]) * alpha) / F);
    } else {
      sx[i] = w2sx(cxp / F);
      sy[i] = w2sy(cyp / F);
    }
  }
  const hx = sx[0];
  const hy = sy[0];

  // --- 7 + 8. the noodle: glossy sauce-coated body ---
  if (n >= 2) {
    const hitboxMul = w.mods.hitboxRadiusMul / F;
    const baseW = (SPACING / F) * cam.scale * 1.7; // visual width tracks the real spacing (no clamp)
    const D = Math.max(3, Math.min(48, baseW * (0.9 + 0.45 * hitboxMul)));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Taper the last K nodes into a tail (kills the constant-diameter "worm" look). The main
    // strand path stops at `pe`; the tail is drawn as shrinking amber discs.
    const K = Math.min(12, n - 1);
    const pe = Math.max(1, n - K);

    const path = new Path2D();
    path.moveTo(sx[0], sy[0]);
    for (let i = 1; i < pe; i++) {
      path.quadraticCurveTo(sx[i], sy[i], (sx[i] + sx[i + 1]) * 0.5, (sy[i] + sy[i + 1]) * 0.5);
    }
    path.lineTo(sx[pe], sy[pe]);

    // The HEBRA (character): amber body, warmed by heat; mods tint it.
    let body = mixRgb(RGB_HEBRA, heatColor(fs.heat01), 0.22 * fs.heat01);
    if (w.mods.infiniteBoost) body = mixRgb(body, [255, 224, 130], 0.4);
    if (w.mods.smokeTrailEnabled) body = mixRgb(body, [150, 150, 150], 0.35);
    let shine = RGB_HEBRA_HI;
    if (fs.enredoFlash > 0.01) shine = mixRgb(shine, [255, 244, 170], fs.enredoFlash);

    // glow (only when hot/boosting)
    if (!reduce && (fs.heat01 > 0.35 || fs.boosting)) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba([255, 170, 70], 0.1 + 0.16 * fs.heat01);
      ctx.lineWidth = D * 1.15;
      ctx.stroke(path);
      ctx.restore();
    }
    // NO black outline. Volume comes from a TRANSVERSE gradient built by offset strokes, all under
    // the one up-left light: cast shadow (down-right) → body → own-dark underside (down-right) →
    // lit ridge (up-left) → thin specular (up-left). Round caps/joins keep it a soft noodle.
    const ridge = mixRgb(body, RGB_HEBRA_HI, 0.55);
    // pass 0: projected shadow onto the pan (a cast shadow, not a contour)
    ctx.save();
    ctx.translate(0.14 * D, 0.26 * D);
    ctx.lineWidth = D + 2;
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.stroke(path);
    ctx.restore();
    // pass 1: amber BODY (full width) — its 8:1 value against the dark pan IS the separation
    ctx.lineWidth = D;
    ctx.strokeStyle = rgb(body);
    ctx.stroke(path);
    // pass 2: shaded UNDERSIDE — own dark colour on the down-right (the shadow side of the tube)
    ctx.save();
    ctx.translate(0.12 * D, 0.14 * D);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = D * 0.74;
    ctx.strokeStyle = rgb(RGB_HEBRA_STROKE);
    ctx.stroke(path);
    ctx.restore();
    // pass 3: lit RIDGE — lighter amber pushed up-left (the top of the tube catches the light)
    ctx.save();
    ctx.translate(-0.16 * D, -0.18 * D);
    ctx.lineWidth = D * 0.58;
    ctx.strokeStyle = rgb(ridge);
    ctx.stroke(path);
    ctx.restore();
    // pass 4: thin SPECULAR filo, offset up-left the most
    ctx.save();
    ctx.translate(-0.24 * D, -0.26 * D);
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = D * 0.2;
    ctx.strokeStyle = rgb(shine);
    ctx.stroke(path);
    ctx.restore();
    ctx.globalAlpha = 1;

    // TAPERED TAIL — shrinking discs, each lit (down-right own-dark under, amber body, up-left kiss)
    const denom = Math.max(1, n - 1 - pe);
    for (let i = pe + 1; i < n; i++) {
      const tt = (i - pe) / denom; // 0 at pe -> 1 at the very tip
      const rr = Math.max(1, D * 0.5 * (1 - tt));
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.arc(sx[i] + rr * 0.28, sy[i] + rr * 0.34, rr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgb(body);
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], rr, 0, TAU);
      ctx.fill();
      if (rr > 2.5) {
        ctx.fillStyle = rgb(ridge);
        ctx.beginPath();
        ctx.arc(sx[i] - rr * 0.28, sy[i] - rr * 0.3, rr * 0.5, 0, TAU);
        ctx.fill();
      }
    }

    // SEGMENT ITEMS: each card taken rides a body node (the build, visible on the snake). Lit like
    // a rounded gem: own down-right shadow, coloured body, warm up-left rim + spec (no black ring).
    for (let p = 0; p < w.pickedCount; p++) {
      const tags = CARD_TAGS[CARD_POOL[w.pickedCards[p]]];
      const col = TAG_RGB[tags[0]] ?? RGB_AMBAR;
      let ni = Math.round(((p + 0.7) / (w.pickedCount + 0.4)) * (n - 1));
      if (ni < 1) ni = 1;
      else if (ni > n - 1) ni = n - 1;
      const bx = sx[ni];
      const by = sy[ni];
      const br = Math.max(3, D * 0.36);
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath();
      ctx.arc(bx + br * 0.24, by + br * 0.3, br, 0, TAU);
      ctx.fill();
      const bg = ctx.createRadialGradient(bx - br * 0.34, by - br * 0.38, br * 0.1, bx, by, br);
      bg.addColorStop(0, rgb(mixRgb(col, [255, 255, 255], 0.4)));
      bg.addColorStop(0.6, rgb(col));
      bg.addColorStop(1, rgb(mixRgb(col, RGB_ESPRESSO, 0.45)));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,231,180,0.7)";
      ctx.lineWidth = Math.max(1, br * 0.18);
      ctx.beginPath();
      ctx.arc(bx, by, br * 0.94, Math.PI * 0.9, Math.PI * 1.7);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(bx - br * 0.32, by - br * 0.34, br * 0.22, 0, TAU);
      ctx.fill();
    }
  }

  // --- 10. crumbs (source-over, over body) ---
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_MIGA) continue;
    ctx.globalAlpha = parts.life[i];
    ctx.fillStyle = "#C9A24E";
    const s = parts.size[i] * cam.scale;
    ctx.fillRect(w2sx(parts.px[i]) - s, w2sy(parts.py[i]) - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;

  // --- 11. food (baked sprite atlas, single drawImage each; visual size == real hitbox, no clamp) ---
  for (let i = 0; i < w.topCount; i++) {
    if ((w.topFlags[i] & TOP_FLAG.ALIVE) === 0) continue;
    const bob = Math.sin(w.tick * 0.12 + i * 1.7) * 2;
    const tx = w2sx(w.topX[i] / F);
    const ty = w2sy(w.topY[i] / F) + bob;
    let r = Math.max(2, (EAT_RADIUS / F) * cam.scale * 0.85);
    const flags = w.topFlags[i];
    if ((flags & TOP_FLAG.EXPLOSIVE) !== 0) {
      r *= 1 + 0.12 * Math.sin(w.tick * 0.3 + i);
      if (!reduce) stamp(ctx, GLOW_RED, tx, ty, r * 1.9, 0.5);
    }
    const k = (r / ATLAS_R) * ATLAS_PX;
    const sprite = ATLAS[w.topKind[i]] || ATLAS[0];
    ctx.drawImage(sprite as CanvasImageSource, tx - k / 2, ty - k / 2, k, k);
    if ((flags & TOP_FLAG.PINA) !== 0) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(RGB_AMBAR, 0.9);
      ctx.beginPath();
      ctx.arc(tx, ty, r * 1.4, 0, TAU);
      ctx.stroke();
    }
  }

  // --- 12. papa (glow / pulse) ---
  for (let i = 0; i < w.papaCount; i++) {
    const px = w2sx(w.papaX[i] / F);
    const py = w2sy(w.papaY[i] / F);
    const francesa = w.papaKind[i] === PAPA.FRANCESA;
    const col = francesa ? RGB_PAPA_FRANCESA : RGB_PAPA_CRIOLLA; // the BRIGHTEST thing on the pan
    // pulse ACCELERATES as it nears expiry (reads as urgency without any UI).
    const life01 = Math.max(0, Math.min(1, (w.papaExpire[i] - w.tick) / PAPA_LIFE_TICKS));
    const pulseSpeed = 0.18 + (1 - life01) * 0.55;
    const pulse = 1 + (0.12 + 0.14 * (1 - life01)) * Math.sin(w.tick * pulseSpeed + i);
    const pr = Math.max(3, (EAT_RADIUS / F) * cam.scale * 0.95) * pulse;
    if (!reduce) stamp(ctx, francesa ? GLOW_WARM : GLOW_GREEN, px, py, pr * 2.4, 0.7);
    ctx.fillStyle = rgb(col);
    ctx.beginPath();
    ctx.ellipse(px, py, pr, pr * 0.78, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgb(RGB_ESPRESSO);
    ctx.stroke();
    if (francesa && w.papaSeq[i] >= 0) {
      ctx.fillStyle = rgb(RGB_ESPRESSO);
      ctx.font = `bold ${Math.round(pr)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(w.papaSeq[i] + 1), px, py);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }

  // --- 13. fork boss ---
  if (w.fork.active === 1) {
    drawFork(ctx, w, w2sx, w2sy, cam, reduce);
  }

  // --- 14. additive particles (burst / spark / speed / vapor / flash) ---
  drawAdditiveParticles(ctx, parts, w2sx, w2sy, cam.scale);

  // --- 15. head character (drawn last on the field so it never hides under food) ---
  drawHead(ctx, fs, hx, hy);

  ctx.restore(); // end playfield clip

  // reset any lingering canvas state before HUD / overlays
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.setLineDash(EMPTY_DASH);

  // --- 17. ENREDO golden flash ---
  if (fs.enredoFlash > 0.01 && !reduce) {
    ctx.fillStyle = rgba([255, 210, 84], 0.22 * fs.enredoFlash);
    ctx.fillRect(0, 0, vw, vh);
    stamp(ctx, GLOW_WARM, hx, hy, 170, 0.7 * fs.enredoFlash);
  }

  // --- 18. warm wash (capped so it never drowns the lethal red) ---
  if (!reduce) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = `rgba(255,150,60,${(0.08 + 0.06 * fs.heat01).toFixed(3)})`;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
  }

  // --- 19. vignette (cached; recreated only on resize) ---
  if (!reduce) {
    if (VIGNETTE === null || vw !== vigW || vh !== vigH) {
      const g = ctx.createRadialGradient(
        vw / 2,
        vh / 2,
        Math.min(vw, vh) * 0.35,
        vw / 2,
        vh / 2,
        Math.max(vw, vh) * 0.72,
      );
      g.addColorStop(0, "rgba(20,10,4,0)");
      g.addColorStop(1, "rgba(16,6,2,0.55)");
      VIGNETTE = g;
      vigW = vw;
      vigH = vh;
    }
    ctx.fillStyle = VIGNETTE;
    ctx.fillRect(0, 0, vw, vh);
  }

  // --- 19b. film grain (tiled noise, low alpha) — the trick that makes flat vector look premium ---
  if (!reduce && GRAIN) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = GRAIN;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
  }

  // --- 20. floating "+score" popups ---
  if (fs.pops.length > 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < fs.pops.length; i++) {
      const p = fs.pops[i];
      const t = p.age / 46;
      const a = 1 - t;
      if (a <= 0) continue;
      const sc = p.age < 8 ? 1.3 - 0.3 * (p.age / 8) : 1;
      const sxp = w2sx(p.wx);
      const syp = w2sy(p.wy) - (1 - (1 - t) * (1 - t)) * 42 - 12;
      ctx.globalAlpha = a;
      ctx.font = "bold " + (13 * sc).toFixed(0) + "px system-ui, sans-serif";
      ctx.fillStyle = rgb(RGB_ESPRESSO);
      ctx.fillText(p.text, sxp + 1, syp + 1);
      ctx.fillStyle = rgb(RGB_AMBAR);
      ctx.fillText(p.text, sxp, syp);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // --- 21. HUD ---
  drawHud(ctx, view, fs);

  // --- 22. touch controls (joystick + ability button) ---
  if (w.phase === "PLAY") drawTouchControls(ctx, view, fs);

  // --- 23. DRAFT overlay ---
  if (w.phase === "DRAFT") drawDraft(ctx, view, fs);
}

// ---------------------------------------------------------------------------
// Head — a real little character.
// ---------------------------------------------------------------------------
function drawHead(ctx: CanvasRenderingContext2D, fs: FrameState, hx: number, hy: number): void {
  const w = fs.world;
  const reduce = fs.reduceEffects;
  const headR = Math.max(3, (HEAD_HITBOX / F) * fs.cam.scale * 2.1);
  const hrad = (w.heading / F) * TAU;
  const st = fs.headStretch;
  const fwdx = Math.cos(hrad);
  const fwdy = Math.sin(hrad);
  const perpx = -fwdy;
  const perpy = fwdx;

  if (!reduce) stamp(ctx, GLOW_WARM, hx, hy, headR * 2.3, 0.32);

  // skull — a bright pasta tip, squash-stretch along heading
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hrad);
  ctx.scale(st, 1 / st);
  ctx.fillStyle = rgb(mixRgb(RGB_CREMA, RGB_AMBAR, 0.06));
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 1.12, headR, 0, 0, TAU);
  ctx.fill();
  // warm bottom shading
  ctx.fillStyle = rgba(RGB_SALSA, 0.16);
  ctx.beginPath();
  ctx.ellipse(0, headR * 0.32, headR * 0.9, headR * 0.5, 0, 0, TAU);
  ctx.fill();
  // top gloss
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-headR * 0.25, -headR * 0.42, headR * 0.52, headR * 0.26, -0.3, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = rgb(mixRgb(RGB_SALSA_DARK, RGB_ESPRESSO, 0.25));
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 1.12, headR, 0, 0, TAU);
  ctx.stroke();
  if (fs.flashHead > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${(fs.flashHead * 0.85).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, headR * 1.12, headR, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // mouth — forward-facing, opens when eating (screen space, orientation-correct)
  const mx = hx + fwdx * headR * 0.58;
  const my = hy + fwdy * headR * 0.58;
  if (fs.mouthOpen > 0.05) {
    const mr = headR * 0.3 * fs.mouthOpen + 2;
    ctx.fillStyle = "#5A1414";
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#E4573C";
    ctx.beginPath();
    ctx.arc(mx + fwdx * mr * 0.3, my + fwdy * mr * 0.3, mr * 0.45, 0, TAU);
    ctx.fill();
  } else {
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.strokeStyle = rgb(RGB_ESPRESSO);
    ctx.beginPath();
    ctx.moveTo(mx - perpx * headR * 0.24, my - perpy * headR * 0.24);
    ctx.quadraticCurveTo(
      mx + fwdx * headR * 0.16,
      my + fwdy * headR * 0.16,
      mx + perpx * headR * 0.24,
      my + perpy * headR * 0.24,
    );
    ctx.stroke();
  }

  // BIG googly eyes — forward + to the sides, looking toward gaze (the "alive" charm)
  const gaze = fs.gaze;
  for (const side of [-1, 1]) {
    const ex = hx + fwdx * headR * 0.24 + perpx * side * headR * 0.46;
    const ey = hy + fwdy * headR * 0.24 + perpy * side * headR * 0.46;
    const er = headR * 0.5;
    stamp(ctx, EYE_GRAD, ex, ey, er, 1);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(70,45,30,0.35)";
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.stroke();
    const pr = er * 0.56;
    const px = ex + Math.cos(gaze) * er * 0.34;
    const py = ey + Math.sin(gaze) * er * 0.34;
    ctx.fillStyle = rgb(RGB_ESPRESSO);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(px - pr * 0.36, py - pr * 0.46, pr * 0.36, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// FORK telegraph shadow (height h4 — the tallest object). Its shadow is offset far DOWN-RIGHT so
// it stretches into frame while the fork is still at/behind the border: the warning comes for free
// from the height/light system (no bespoke telegraph). Drawn on the pan, under everything.
// ---------------------------------------------------------------------------
function drawForkShadow(
  ctx: CanvasRenderingContext2D,
  w: World,
  w2sx: (u: number) => number,
  w2sy: (u: number) => number,
  cam: Camera,
): void {
  const fx = w2sx(w.fork.x / F);
  const fy = w2sy(w.fork.y / F);
  const fr = Math.max(6, (FORK_CAPTURE_RADIUS / F) * cam.scale);
  const ox = fx + fr * 0.55 + 12; // down-right, far (tall object)
  const oy = fy + fr * 0.7 + 16;
  const hr = (w.fork.heading / F) * TAU;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(hr);
  const g = ctx.createRadialGradient(0, 0, fr * 0.2, 0, 0, fr * 1.7);
  g.addColorStop(0, "rgba(0,0,0,0.32)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.scale(1.5, 0.68);
  ctx.beginPath();
  ctx.arc(0, 0, fr * 1.7, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Ceramic PLATES — reconstructed from the topping clusters each frame (the sim has no plate
// entity; a plate is pure decoration that teaches the enredo by composition: "RODEA ESTO"). It is
// ceramic on iron: a low-contrast disc whose RELIEF is a BEVEL (up-left lit arc + down-right shadow
// arc). It breathes, its amber rim tracks how much food is left, and on a loop-close it flashes
// gold and the bevel collapses to flat. REGLA DURA: never more than ~3:1 contrast vs the pan.
// ---------------------------------------------------------------------------
const _twx = new Float64Array(256);
const _twy = new Float64Array(256);
const _tass = new Uint8Array(256);
function drawPlates(
  ctx: CanvasRenderingContext2D,
  w: World,
  w2sx: (u: number) => number,
  w2sy: (u: number) => number,
  cam: Camera,
  enredoFlash: number,
  reduce: boolean,
): void {
  const n = w.topCount;
  if (n < 2) return;
  for (let i = 0; i < n; i++) {
    _twx[i] = w.topX[i] / F;
    _twy[i] = w.topY[i] / F;
    _tass[i] = (w.topFlags[i] & TOP_FLAG.ALIVE) === 0 ? 1 : 0; // dead toppings never anchor a plate
  }
  const cap = (CLUSTER_RADIUS / F) * 1.5; // capture radius from a seed (pocket ≈ 75u radius)
  const cap2 = cap * cap;
  for (let i = 0; i < n; i++) {
    if (_tass[i]) continue;
    // gather this pocket: members within `cap` of seed i.
    let sumx = _twx[i];
    let sumy = _twy[i];
    let cnt = 1;
    _tass[i] = 1;
    for (let j = i + 1; j < n; j++) {
      if (_tass[j]) continue;
      const dx = _twx[j] - _twx[i];
      const dy = _twy[j] - _twy[i];
      if (dx * dx + dy * dy <= cap2) {
        _tass[j] = 1;
        sumx += _twx[j];
        sumy += _twy[j];
        cnt++;
      }
    }
    if (cnt < 2) continue; // no plate under a lone topping
    const cxw = sumx / cnt;
    const cyw = sumy / cnt;
    // radius = furthest member from centroid + margin, clamped so the plate stays a subtle pocket.
    let maxd = 0;
    for (let j = i; j < n; j++) {
      // (re-scan is cheap; members were flagged this pass — approximate with distance to centroid)
      const dx = _twx[j] - cxw;
      const dy = _twy[j] - cyw;
      const d = dx * dx + dy * dy;
      if (d <= cap2 && d > maxd) maxd = d;
    }
    const rw = Math.min(cap, Math.sqrt(maxd) + 16);
    const cxp = w2sx(cxw);
    const cyp = w2sy(cyw);
    const rp = rw * cam.scale;
    if (rp < 6) continue;
    const breathe = reduce ? 1 : 1 + 0.012 * Math.sin(w.tick * 0.03 + (i % 7));
    const rr = rp * breathe;
    const bevel = 1 - Math.min(1, enredoFlash * 1.4); // loop-close → bevel collapses to flat
    // 1. contact shadow (down-right)
    ctx.fillStyle = rgba(RGB_PLATE_LO, 0.45);
    ctx.beginPath();
    ctx.ellipse(cxp + rp * 0.05 + 2, cyp + rp * 0.07 + 3, rr * 1.02, rr * 0.95, 0, 0, TAU);
    ctx.fill();
    // 2. body disc (barely above the pan)
    ctx.fillStyle = rgb(RGB_PLATE);
    ctx.beginPath();
    ctx.arc(cxp, cyp, rr, 0, TAU);
    ctx.fill();
    // 3. BEVEL: up-left lit arc + down-right shadow arc (the relief)
    ctx.lineWidth = Math.max(2, rr * 0.15);
    ctx.strokeStyle = `rgba(255,220,150,${(0.2 * bevel).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cxp, cyp, rr * 0.92, Math.PI * 0.85, Math.PI * 1.7);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0,0,0,${(0.35 * bevel).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cxp, cyp, rr * 0.92, Math.PI * 1.7, Math.PI * 2.85);
    ctx.stroke();
    // 4. glaze: thin specular arc on the upper edge
    if (!reduce) {
      ctx.lineWidth = Math.max(1, rr * 0.05);
      ctx.strokeStyle = `rgba(255,245,220,${(0.4 * bevel).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cxp, cyp, rr * 0.82, Math.PI * 1.02, Math.PI * 1.5);
      ctx.stroke();
    }
    // 5. amber edge = food remaining (dims as the pocket empties)
    const full = Math.min(1, cnt / 5);
    ctx.lineWidth = Math.max(1.5, rr * 0.06);
    ctx.strokeStyle = rgba(RGB_AMBAR, 0.05 + 0.16 * full);
    ctx.beginPath();
    ctx.arc(cxp, cyp, rr, 0, TAU);
    ctx.stroke();
    // 6. loop-close: gold flash
    if (enredoFlash > 0.01) {
      ctx.fillStyle = rgba([255, 210, 84], 0.18 * enredoFlash);
      ctx.beginPath();
      ctx.arc(cxp, cyp, rr, 0, TAU);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// Fork boss — a bit more menace than raw fillRects.
// ---------------------------------------------------------------------------
function drawFork(
  ctx: CanvasRenderingContext2D,
  w: World,
  w2sx: (u: number) => number,
  w2sy: (u: number) => number,
  cam: Camera,
  reduce: boolean,
): void {
  const fr = Math.max(4, (FORK_CAPTURE_RADIUS / F) * cam.scale);
  const frad = (w.fork.heading / F) * TAU;
  const chase = w.fork.state === "CHASE";
  const blocked = w.fork.state === "BLOCKED";
  // telegraphed TREMOR (motion signature): ENTER trembles hard (about to attack), CHASE shakes light.
  const shake = blocked ? 0 : chase ? fr * 0.05 : fr * 0.1;
  const fx = w2sx(w.fork.x / F) + Math.sin(w.tick * 0.9) * shake;
  const fy = w2sy(w.fork.y / F) + Math.cos(w.tick * 1.1) * shake;
  const col: readonly [number, number, number] = chase
    ? RGB_FORK
    : blocked
      ? [110, 110, 110]
      : [230, 170, 60];
  if (!reduce && chase) stamp(ctx, GLOW_RED, fx, fy, fr * 2, 0.45);
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(frad);
  // metallic body with a darker underside
  ctx.fillStyle = rgb(col);
  ctx.fillRect(-fr, -fr * 0.16, fr * 1.1, fr * 0.32);
  for (let k = 0; k < 4; k++) {
    const ty = -fr * 0.45 + (k * fr * 0.9) / 3;
    ctx.fillRect(fr * 0.1, ty - fr * 0.05, fr * 0.9, fr * 0.1);
  }
  // steel highlight
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-fr, -fr * 0.16, fr * 1.1, fr * 0.08);
  // a single angry eye on the handle (telegraphs the threat)
  ctx.fillStyle = "#FBF1DE";
  ctx.beginPath();
  ctx.arc(-fr * 0.55, 0, fr * 0.18, 0, TAU);
  ctx.fill();
  ctx.fillStyle = chase ? "#7C1E12" : "#1E1611";
  ctx.beginPath();
  ctx.arc(-fr * 0.5, 0, fr * 0.09, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Additive particles (single composite switch, fixed color per type, alpha via globalAlpha).
// ---------------------------------------------------------------------------
function drawAdditiveParticles(
  ctx: CanvasRenderingContext2D,
  parts: Particles,
  w2sx: (u: number) => number,
  w2sy: (u: number) => number,
  scale: number,
): void {
  if (parts.count === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // burst
  ctx.fillStyle = "#F0742A";
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_BURST) continue;
    ctx.globalAlpha = parts.life[i];
    const s = parts.size[i] * scale;
    ctx.fillRect(w2sx(parts.px[i]) - s, w2sy(parts.py[i]) - s, s * 2, s * 2);
  }
  // sparks (gold)
  ctx.fillStyle = "#FFD24A";
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_SPARK) continue;
    ctx.globalAlpha = parts.life[i];
    const s = parts.size[i] * scale;
    ctx.fillRect(w2sx(parts.px[i]) - s, w2sy(parts.py[i]) - s, s * 2, s * 2);
  }
  // speed streaks (cream) — drawn as short lines along velocity
  ctx.strokeStyle = "#FBF1DE";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_SPEED) continue;
    ctx.globalAlpha = parts.life[i] * 0.5;
    const x = w2sx(parts.px[i]);
    const y = w2sy(parts.py[i]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - parts.vx[i] * 0.03 * scale, y - parts.vy[i] * 0.03 * scale);
    ctx.stroke();
  }
  // vapor (faint)
  ctx.fillStyle = "#FFF0DC";
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_VAPOR) continue;
    ctx.globalAlpha = parts.life[i] * 0.12;
    const s = parts.size[i] * scale;
    ctx.fillRect(w2sx(parts.px[i]) - s, w2sy(parts.py[i]) - s, s * 2, s * 2);
  }
  // white flash pops
  ctx.fillStyle = "#FFFFFF";
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_FLASH) continue;
    ctx.globalAlpha = parts.life[i];
    const s = parts.size[i] * scale;
    ctx.fillRect(w2sx(parts.px[i]) - s, w2sy(parts.py[i]) - s, s * 2, s * 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Touch controls: floating steer joystick (left) + dedicated ability button (right).
// Geometry from input.ts::abilityLayout so hit-test and draw never diverge.
// ---------------------------------------------------------------------------
function drawTouchControls(ctx: CanvasRenderingContext2D, view: Viewport, fs: FrameState): void {
  const s = fs.steer;
  if (s) {
    const R = 46;
    ctx.strokeStyle = rgba(RGB_CREMA, 0.16);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, R, 0, TAU);
    ctx.stroke();
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy) || 1;
    const kx = (Math.min(d, R) / d) * dx;
    const ky = (Math.min(d, R) / d) * dy;
    ctx.fillStyle = rgba(RGB_CREMA, 0.3);
    ctx.beginPath();
    ctx.arc(s.ox + kx, s.oy + ky, 15, 0, TAU);
    ctx.fill();
  }

  // ability button (default ability = BOOST). Energy ring = almidón.
  const lay = abilityLayout(view.w, view.h, fs.insets);
  const cx = lay.x;
  const cy = lay.y;
  const R = lay.r;
  const alm01 = Math.max(0, Math.min(1, fs.world.almidon / ALMIDON_MAX));
  const boosting = fs.boosting;
  const ready = alm01 > 0.02;

  // "ready" pulse
  const pr = R * (1 + 0.1 * fs.abilityPulse);
  if (!fs.reduceEffects && boosting) stamp(ctx, GLOW_GREEN, cx, cy, R * 1.8, 0.5);

  // disc
  ctx.fillStyle = boosting
    ? rgba(RGB_VERDE, 0.5)
    : ready
      ? rgba(RGB_AMBAR, 0.42)
      : rgba(RGB_CREMA, 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, pr, 0, TAU);
  ctx.fill();
  // energy ring (almidón), clockwise from top
  ctx.lineWidth = 5;
  ctx.strokeStyle = rgba([50, 30, 18], 0.4);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 3, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = boosting
    ? rgb(RGB_VERDE)
    : alm01 < 0.2
      ? rgb(RGB_ROJO)
      : rgb(RGB_AMBAR);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 3, -Math.PI / 2, -Math.PI / 2 + TAU * alm01);
  ctx.stroke();
  // glyph
  ctx.fillStyle = boosting ? rgb(RGB_CREMA) : ready ? rgb(RGB_ESPRESSO) : rgba(RGB_CREMA, 0.5);
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚡", cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function drawHud(ctx: CanvasRenderingContext2D, view: Viewport, fs: FrameState): void {
  const w = fs.world;
  const top = fs.insets.top + 14;
  const left = fs.insets.left + 16;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  ctx.fillStyle = rgb(RGB_CREMA);
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText(String(w.score), left, top);

  const mult = w.globalMult / F;
  ctx.fillStyle = rgb(heatColor(fs.heat01));
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText(`x${mult.toFixed(2)}`, left, top + 34);

  const barW = Math.min(150, view.w * 0.38);
  const cos01 = Math.max(0, Math.min(1, w.cosecha / COSECHA_MAX));
  const alm01 = Math.max(0, Math.min(1, w.almidon / ALMIDON_MAX));
  drawBar(ctx, left, top + 74, barW, 8, cos01, RGB_VERDE, "COSECHA");
  drawBar(ctx, left, top + 92, barW, 8, alm01, RGB_AMBAR, "ALMIDÓN");

  const pipW = 11;
  const pipGap = 4;
  let px = left;
  for (let i = 0; i < SERVICE_COUNT; i++) {
    ctx.fillStyle = i < w.service ? rgb(RGB_AMBAR) : rgba(RGB_CREMA, 0.22);
    roundRect(ctx, px, top + 106, pipW, 7, 3);
    ctx.fill();
    px += pipW + pipGap;
  }

  // active SYNERGIES (the build's traits, TFT-style) — make the build legible at a glance
  drawSynergies(ctx, fs, left, top + 122);

  if (w.pedido.active === 1) drawPedido(ctx, view, fs);
}

function drawSynergies(ctx: CanvasRenderingContext2D, fs: FrameState, x: number, y: number): void {
  const w = fs.world;
  if (w.pickedCount === 0) return;
  _synCounts.fill(0);
  for (let i = 0; i < w.pickedCount; i++) {
    const tags = CARD_TAGS[CARD_POOL[w.pickedCards[i]]];
    for (let t = 0; t < tags.length; t++) {
      const idx = CARD_TAG_ORDER.indexOf(tags[t]);
      if (idx >= 0) _synCounts[idx]++;
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let ry = y;
  for (let t = 0; t < CARD_TAG_ORDER.length; t++) {
    const cnt = _synCounts[t];
    if (cnt === 0) continue; // only show tags you actually carry
    const tier = w.synergyTier[t];
    const active = tier > 0;
    const col = TAG_RGB[CARD_TAG_ORDER[t]] ?? RGB_AMBAR;
    ctx.globalAlpha = active ? 1 : 0.5; // dim = carried but not yet a synergy (shows progress)
    ctx.fillStyle = rgb(col);
    ctx.beginPath();
    ctx.arc(x + 6, ry + 6, active ? 6 : 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = active ? rgb(RGB_CREMA) : rgba(RGB_CREMA, 0.7);
    ctx.font = active ? "bold 11px system-ui, sans-serif" : "11px system-ui, sans-serif";
    const stars = tier >= 2 ? " ★★" : tier >= 1 ? " ★" : "";
    ctx.fillText(`${CARD_TAG_ORDER[t]} ${cnt}${stars}`, x + 18, ry + 6);
    ctx.globalAlpha = 1;
    ry += 17;
  }
  ctx.textBaseline = "alphabetic";
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  wd: number,
  h: number,
  v: number,
  col: readonly [number, number, number],
  label: string,
): void {
  ctx.fillStyle = rgba([0, 0, 0], 0.35);
  roundRect(ctx, x, y, wd, h, h / 2);
  ctx.fill();
  ctx.fillStyle = rgb(col);
  roundRect(ctx, x, y, Math.max(h, wd * v), h, h / 2);
  ctx.fill();
  ctx.fillStyle = rgba(RGB_CREMA, 0.85);
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(label, x + wd, y - 11);
  ctx.textAlign = "left";
}

function drawPedido(ctx: CanvasRenderingContext2D, view: Viewport, fs: FrameState): void {
  const w = fs.world;
  const cardW = 168;
  const cardH = 62;
  const x = view.w / 2 - cardW / 2;
  const y = fs.insets.top + 12;
  ctx.fillStyle = rgba(RGB_CREMA, 0.95);
  roundRect(ctx, x, y, cardW, cardH, 8);
  ctx.fill();
  ctx.fillStyle = rgb(RGB_ESPRESSO);
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("PEDIDO", x + 10, y + 8);
  const remain = Math.max(0, w.pedido.expire - w.tick);
  const frac = Math.max(0, Math.min(1, remain / (25 * 60)));
  ctx.fillStyle = rgba(RGB_ROJO, 0.25);
  roundRect(ctx, x + 10, y + 21, cardW - 20, 4, 2);
  ctx.fill();
  ctx.fillStyle = rgb(RGB_ROJO);
  roundRect(ctx, x + 10, y + 21, (cardW - 20) * frac, 4, 2);
  ctx.fill();
  const slot = (cardW - 20) / 3;
  for (let i = 0; i < 3; i++) {
    const cx = x + 10 + slot * i + slot / 2;
    const cy = y + 42;
    const done = i < w.pedido.progress;
    const kind = w.pedido.seq[i];
    ctx.globalAlpha = done ? 0.4 : 1;
    const k = 20;
    const sprite = ATLAS[kind] || ATLAS[0];
    if (sprite) ctx.drawImage(sprite as CanvasImageSource, cx - k / 2, cy - k / 2, k, k);
    ctx.globalAlpha = 1;
    if (done) {
      ctx.strokeStyle = rgb(RGB_VERDE);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy);
      ctx.lineTo(cx - 2, cy + 5);
      ctx.lineTo(cx + 6, cy - 6);
      ctx.stroke();
    }
    if (i < 2) {
      ctx.fillStyle = rgb(RGB_ESPRESSO);
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("›", cx + slot / 2, cy - 7);
    }
  }
  ctx.textAlign = "left";
}

// ---------------------------------------------------------------------------
// DRAFT overlay
// ---------------------------------------------------------------------------
const TIPO_LABEL: Record<string, string> = { ING: "INGREDIENTE", REC: "RECETA", MAL: "PICANTE" };

/** Split a card's effect text into its buff (before " pero ") and debuff (after). */
function splitEffect(txt: string): { buff: string; debuff: string } {
  const idx = txt.indexOf(" pero ");
  if (idx < 0) return { buff: txt.replace(/\.$/, ""), debuff: "" };
  return {
    buff: txt.slice(0, idx).replace(/[,;]\s*$/, ""),
    debuff: txt.slice(idx + 6).replace(/\.$/, ""),
  };
}

function drawDraft(ctx: CanvasRenderingContext2D, view: Viewport, fs: FrameState): void {
  const w = fs.world;
  // Dim the field to a warm dark, focus the centre.
  ctx.fillStyle = "rgba(18,12,8,0.82)";
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const titleY = fs.insets.top + Math.max(46, view.h * 0.16);
  ctx.fillStyle = rgba(RGB_CREMA, 0.55);
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.fillText(`SERVICIO ${w.service} · ELIGE TU CARTA`, view.w / 2, titleY - 16);
  ctx.fillStyle = rgb(RGB_CREMA);
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.fillText("¿QUÉ AÑADES AL FIDEO?", view.w / 2, titleY + 8);

  for (let i = 0; i < fs.draftCards.length && i < w.offerCount; i++) {
    const r = fs.draftCards[i];
    const id = CARD_POOL[w.offerIds[i]];
    const card = CARDS[id];
    const tc = tipoColor(card.tipo);
    const glow = card.tipo === "ING" ? GLOW_GREEN : card.tipo === "MAL" ? GLOW_RED : GLOW_WARM;
    const cx = r.x + r.w / 2;

    if (!fs.reduceEffects) stamp(ctx, glow, cx, r.y + r.h * 0.32, r.w * 0.85, 0.16);

    // card body (warm dark) + rarity border
    ctx.fillStyle = "rgba(40,29,21,0.98)";
    roundRect(ctx, r.x, r.y, r.w, r.h, 16);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgb(tc);
    roundRect(ctx, r.x, r.y, r.w, r.h, 16);
    ctx.stroke();
    // top accent bar
    ctx.fillStyle = rgb(tc);
    roundRect(ctx, r.x + 10, r.y + 12, r.w - 20, 5, 2.5);
    ctx.fill();

    // emblem: a coloured disc with the card initial
    const ey = r.y + 58;
    if (!fs.reduceEffects) stamp(ctx, glow, cx, ey, 34, 0.5);
    ctx.fillStyle = rgb(tc);
    ctx.beginPath();
    ctx.arc(cx, ey, 24, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(28,18,12,0.9)";
    ctx.font = "800 26px system-ui, sans-serif";
    ctx.fillText(card.nombre.charAt(0).toUpperCase(), cx, ey + 1);

    // tipo label
    ctx.fillStyle = rgb(tc);
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText(TIPO_LABEL[card.tipo] ?? card.tipo, cx, r.y + 92);

    // name
    ctx.fillStyle = rgb(RGB_CREMA);
    ctx.font = "800 17px system-ui, sans-serif";
    const nameLines = wrapText(ctx, card.nombre, r.w - 22);
    let ty = r.y + 116;
    for (const ln of nameLines) {
      ctx.fillText(ln, cx, ty);
      ty += 20;
    }

    // divider
    ty += 6;
    ctx.strokeStyle = rgba(RGB_CREMA, 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r.x + 14, ty);
    ctx.lineTo(r.x + r.w - 14, ty);
    ctx.stroke();
    ty += 14;

    // buff / debuff, left-aligned with a coloured bullet
    const eff = splitEffect(card.texto);
    ctx.textAlign = "left";
    const line = (mark: string, col: readonly [number, number, number], text: string): void => {
      ctx.fillStyle = rgb(col);
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText(mark, r.x + 14, ty);
      ctx.fillStyle = rgba(RGB_CREMA, 0.9);
      ctx.font = "13px system-ui, sans-serif";
      const lines = wrapText(ctx, text, r.w - 44);
      for (const ln of lines) {
        if (ty > r.y + r.h - 16) break;
        ctx.fillText(ln, r.x + 32, ty);
        ty += 17;
      }
      ty += 6;
    };
    line("＋", RGB_VERDE, eff.buff);
    if (eff.debuff) line("－", RGB_ROJO, eff.debuff);
    ctx.textAlign = "center";
  }

  // reroll: dark pill with amber border
  if (fs.rerollRect) {
    const r = fs.rerollRect;
    ctx.fillStyle = "rgba(40,29,21,0.98)";
    roundRect(ctx, r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgb(RGB_AMBAR);
    roundRect(ctx, r.x, r.y, r.w, r.h, r.h / 2);
    ctx.stroke();
    ctx.fillStyle = rgb(RGB_AMBAR);
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(`↻ REROLL · ${w.rerollLeft}`, r.x + r.w / 2, r.y + r.h / 2);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  void PALETTE;
}
