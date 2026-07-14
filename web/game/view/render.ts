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
} from "@/game/sim/constants.ts";
import { TOP_FLAG, OBS, OBS_FLAG, PAPA } from "@/game/sim/types.ts";
import type { World, CardId } from "@/game/sim/types.ts";
import { CARDS, CARD_POOL } from "@/game/sim/cards.ts";
import {
  PALETTE,
  RGB_ESPRESSO,
  RGB_CREMA,
  RGB_AMBAR,
  RGB_ROJO,
  RGB_VERDE,
  RGB_SALSA,
  RGB_SALSA_DARK,
  RGB_FIDEO,
  rgba,
  rgb,
  heatColor,
  heatTint,
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
let BG_GRAD: CanvasGradient | null = null;
let SAUCE_GRAD: CanvasGradient | null = null;
let GLOW_WARM: CanvasGradient | null = null;
let GLOW_GREEN: CanvasGradient | null = null;
let GLOW_RED: CanvasGradient | null = null;
let EYE_GRAD: CanvasGradient | null = null;
let VIGNETTE: CanvasGradient | null = null;
let vigW = 0;
let vigH = 0;
const ATLAS: Off[] = []; // baked food sprites, indexed by ToppingCode 0..7
const ATLAS_PX = 72; // sprite canvas size
const ATLAS_R = 24; // baked food radius inside the sprite
const SAUCE_DASH: number[] = [6, 6];
const EMPTY_DASH: number[] = [];
const GLOSS_DASH: number[] = [1, 1]; // rewritten each frame (2 numbers, no alloc)

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
  BG_GRAD = unitGrad(ctx, [
    [0, "rgb(46,33,24)"],
    [0.55, "rgb(30,22,17)"],
    [1, "rgb(18,12,9)"],
  ]);
  SAUCE_GRAD = unitGrad(ctx, [
    [0, "rgba(168,44,22,0.55)"],
    [0.6, "rgba(120,26,12,0.38)"],
    [1, "rgba(120,26,12,0)"],
  ]);
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
  bakeAtlas();
  cachesReady = true;
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
// Bake the 8 food sprites ONCE (shadow + volume + rim + specular baked in) so the hot
// loop is a single drawImage per topping. Math.random here is fine: one-time, view-only.
// ---------------------------------------------------------------------------
function bakeSphere(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  light: string,
  mid: string,
  dark: string,
): void {
  const grad = g.createRadialGradient(cx - R * 0.34, cy - R * 0.4, R * 0.08, cx, cy, R);
  grad.addColorStop(0, light);
  grad.addColorStop(0.5, mid);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fill();
}
function spec(g: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(cx - R * 0.34, cy - R * 0.42, R * 0.2, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.arc(cx + R * 0.28, cy + R * 0.3, R * 0.1, 0, TAU);
  g.fill();
}
function contactShadow(g: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  g.fillStyle = "rgba(0,0,0,0.26)";
  g.beginPath();
  g.ellipse(cx + 1.5, cy + R * 0.82, R * 0.92, R * 0.4, 0, 0, TAU);
  g.fill();
}

function bakeAtlas(): void {
  ATLAS.length = 0;
  for (let kind = 0; kind < 8; kind++) {
    const c = makeOffscreen(ATLAS_PX, ATLAS_PX);
    const g = offCtx(c);
    const cx = ATLAS_PX / 2;
    const cy = ATLAS_PX / 2;
    const R = ATLAS_R;
    contactShadow(g, cx, cy, R);
    g.lineJoin = "round";
    switch (kind) {
      case 0: {
        // SALSA — tomato droplet
        bakeSphere(g, cx, cy, R, "#F58466", "#C8321E", "#7C1E12");
        g.lineWidth = 2;
        g.strokeStyle = "#5E150B";
        g.beginPath();
        g.arc(cx, cy, R, 0, TAU);
        g.stroke();
        spec(g, cx, cy, R);
        break;
      }
      case 1: {
        // QUESO — isometric cheese cube
        const h = R * 0.98;
        const w = R * 0.86;
        // top face
        g.fillStyle = "#FFE08A";
        g.beginPath();
        g.moveTo(cx, cy - h);
        g.lineTo(cx + w, cy - h * 0.4);
        g.lineTo(cx, cy + h * 0.2);
        g.lineTo(cx - w, cy - h * 0.4);
        g.closePath();
        g.fill();
        // left face
        g.fillStyle = "#E0B23F";
        g.beginPath();
        g.moveTo(cx - w, cy - h * 0.4);
        g.lineTo(cx, cy + h * 0.2);
        g.lineTo(cx, cy + h);
        g.lineTo(cx - w, cy + h * 0.35);
        g.closePath();
        g.fill();
        // right face
        g.fillStyle = "#C68C28";
        g.beginPath();
        g.moveTo(cx + w, cy - h * 0.4);
        g.lineTo(cx, cy + h * 0.2);
        g.lineTo(cx, cy + h);
        g.lineTo(cx + w, cy + h * 0.35);
        g.closePath();
        g.fill();
        g.strokeStyle = "#8A6018";
        g.lineWidth = 1.4;
        g.stroke();
        // holes on the top face
        g.fillStyle = "rgba(150,105,24,0.55)";
        for (const [hx, hy, hr] of [
          [cx - w * 0.28, cy - h * 0.32, 2.4],
          [cx + w * 0.34, cy - h * 0.22, 1.8],
          [cx, cy - h * 0.02, 2.0],
        ] as const) {
          g.beginPath();
          g.ellipse(hx, hy, hr, hr * 0.6, 0, 0, TAU);
          g.fill();
        }
        // top-face sheen
        g.fillStyle = "rgba(255,255,255,0.4)";
        g.beginPath();
        g.ellipse(cx - w * 0.1, cy - h * 0.5, w * 0.3, h * 0.12, 0, 0, TAU);
        g.fill();
        break;
      }
      case 2: {
        // CEBOLLA — battered onion ring
        bakeSphere(g, cx, cy, R, "#F0C878", "#D89A46", "#A56B22");
        // punch the hole
        g.globalCompositeOperation = "destination-out";
        g.beginPath();
        g.arc(cx, cy, R * 0.46, 0, TAU);
        g.fill();
        g.globalCompositeOperation = "source-over";
        g.lineWidth = 2;
        g.strokeStyle = "#8A5A24";
        g.beginPath();
        g.arc(cx, cy, R, 0, TAU);
        g.stroke();
        g.strokeStyle = "#F6E4BE";
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(cx, cy, R * 0.46, 0, TAU);
        g.stroke();
        // breadcrumb speckle
        g.fillStyle = "rgba(120,74,20,0.6)";
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + 0.3;
          const rr = R * 0.72;
          g.beginPath();
          g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.4, 0, TAU);
          g.fill();
        }
        break;
      }
      case 3: {
        // MAIZ — corn kernel
        g.save();
        g.beginPath();
        g.moveTo(cx, cy - R);
        g.quadraticCurveTo(cx + R, cy - R * 0.2, cx + R * 0.86, cy + R * 0.72);
        g.lineTo(cx - R * 0.86, cy + R * 0.72);
        g.quadraticCurveTo(cx - R, cy - R * 0.2, cx, cy - R);
        g.closePath();
        g.clip();
        bakeSphere(g, cx, cy, R * 1.1, "#FFF0A0", "#F5D033", "#C79A16");
        g.restore();
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.beginPath();
        g.arc(cx - R * 0.2, cy - R * 0.35, R * 0.16, 0, TAU);
        g.fill();
        break;
      }
      case 4: {
        // RIZADAS — curly fry (3-pass wavy tube)
        const draw = (col: string, wd: number, dy: number) => {
          g.strokeStyle = col;
          g.lineWidth = wd;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(cx - R, cy + dy);
          g.bezierCurveTo(cx - R * 0.4, cy - R + dy, cx + R * 0.4, cy + R + dy, cx + R, cy + dy);
          g.stroke();
        };
        draw("#8A5A24", R * 0.62, 1.5);
        draw("#E8B06B", R * 0.5, 0);
        draw("rgba(255,240,200,0.7)", R * 0.16, -R * 0.14);
        break;
      }
      case 5: {
        // PINA — pineapple diamond
        g.save();
        g.beginPath();
        g.moveTo(cx, cy - R);
        g.lineTo(cx + R, cy);
        g.lineTo(cx, cy + R);
        g.lineTo(cx - R, cy);
        g.closePath();
        g.clip();
        bakeSphere(g, cx, cy, R * 1.2, "#E9F58A", "#B6D94C", "#7FA02E");
        // crosshatch
        g.strokeStyle = "rgba(120,140,40,0.7)";
        g.lineWidth = 1.2;
        for (let k = -2; k <= 2; k++) {
          g.beginPath();
          g.moveTo(cx - R, cy + k * 7);
          g.lineTo(cx + R, cy + k * 7 - R);
          g.stroke();
          g.beginPath();
          g.moveTo(cx - R, cy + k * 7);
          g.lineTo(cx + R, cy + k * 7 + R);
          g.stroke();
        }
        g.restore();
        g.strokeStyle = "#5C7A1E";
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(cx, cy - R);
        g.lineTo(cx + R, cy);
        g.lineTo(cx, cy + R);
        g.lineTo(cx - R, cy);
        g.closePath();
        g.stroke();
        break;
      }
      case 6: {
        // HUEVO — fried egg (wavy white + glossy yolk)
        g.fillStyle = "#FBF3E2";
        g.beginPath();
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * TAU;
          const wob = R * (1 + 0.16 * Math.sin(a * 3 + 0.7));
          const px = cx + Math.cos(a) * wob;
          const py = cy + Math.sin(a) * wob * 0.9;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(220,196,140,0.6)";
        g.lineWidth = 1.2;
        g.stroke();
        // yolk
        bakeSphere(g, cx + R * 0.12, cy, R * 0.5, "#FFE07A", "#FFB01F", "#E07A10");
        g.fillStyle = "rgba(255,255,255,0.95)";
        g.beginPath();
        g.arc(cx - R * 0.06, cy - R * 0.16, R * 0.12, 0, TAU);
        g.fill();
        break;
      }
      default: {
        // CHICHARRON — crunchy pork rind star
        g.save();
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a0 = -Math.PI / 2 + (i * TAU) / 5;
          const a1 = a0 + Math.PI / 5;
          g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
          g.lineTo(cx + Math.cos(a1) * R * 0.46, cy + Math.sin(a1) * R * 0.46);
        }
        g.closePath();
        g.clip();
        bakeSphere(g, cx, cy, R * 1.2, "#C6884E", "#8A4726", "#4A2413");
        g.restore();
        g.fillStyle = "rgba(60,30,16,0.7)";
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + 0.5;
          const rr = R * 0.4;
          g.beginPath();
          g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6, 0, TAU);
          g.fill();
        }
        g.fillStyle = "rgba(255,240,220,0.8)";
        g.beginPath();
        g.arc(cx - R * 0.24, cy - R * 0.3, R * 0.14, 0, TAU);
        g.fill();
        break;
      }
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

  // --- 1. living background: warm kitchen spotlight (cached radial) ---
  ctx.fillStyle = "rgb(18,12,9)";
  ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(vw / 2, vh * 0.42);
  ctx.scale(vw * 0.82, vh * 0.82);
  ctx.fillStyle = BG_GRAD as CanvasGradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (fs.heat01 > 0.01) {
    ctx.fillStyle = rgba(heatTint(fs.heat01), 0.05 + 0.06 * fs.heat01);
    ctx.fillRect(0, 0, vw, vh);
  }

  // --- 3. live border (the pan) + clip playfield ---
  const halfU = w.usableHalf / F;
  const bx = w2sx(-halfU);
  const by = w2sy(-halfU);
  const bw = 2 * halfU * cam.scale;
  const bh = 2 * halfU * cam.scale;
  ctx.save();
  ctx.fillStyle = rgba(RGB_ESPRESSO, 0.55);
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.fill();
  ctx.lineWidth = Math.max(2, 3 * (cam.scale > 0.3 ? 1 : 0.6));
  ctx.strokeStyle = rgb(mixRgb(RGB_AMBAR, RGB_ROJO, fs.heat01));
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.stroke();
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.clip();

  const parts = fs.parts;

  // --- 4. sauce trail decals (UNDER everything on the pan) ---
  for (let i = 0; i < parts.count; i++) {
    if (parts.type[i] !== PT_SAUCE) continue;
    stamp(
      ctx,
      SAUCE_GRAD,
      w2sx(parts.px[i]),
      w2sy(parts.py[i]),
      parts.size[i] * cam.scale,
      parts.life[i] * 0.8,
    );
  }

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
      if (!reduce) stamp(ctx, GLOW_RED, ox, oy, or, 0.55);
      ctx.fillStyle = rgba(RGB_ROJO, 0.28);
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, TAU);
      ctx.fill();
    } else if (t === OBS.WALL) {
      ctx.fillStyle = rgb(RGB_ESPRESSO);
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgb(RGB_AMBAR);
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
      ctx.fillStyle = lethal ? rgb(RGB_ROJO) : "#C9CDD2";
      ctx.beginPath();
      ctx.moveTo(-or, -3);
      ctx.lineTo(or, -1);
      ctx.lineTo(or, 1);
      ctx.lineTo(-or, 3);
      ctx.closePath();
      ctx.fill();
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
    const baseW = Math.max(7, (SPACING / F) * cam.scale * 1.7);
    const D = Math.min(42, baseW * (0.9 + 0.45 * hitboxMul));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // one smoothed path (quadratics through node midpoints), reused across strokes
    const path = new Path2D();
    path.moveTo(sx[0], sy[0]);
    for (let i = 1; i < n - 1; i++) {
      path.quadraticCurveTo(sx[i], sy[i], (sx[i] + sx[i + 1]) * 0.5, (sy[i] + sy[i + 1]) * 0.5);
    }
    path.lineTo(sx[n - 1], sy[n - 1]);

    // body color: sauce, warmed by heat
    let bodyCol = mixRgb(RGB_SALSA, heatColor(fs.heat01), 0.35 * fs.heat01);
    if (w.mods.infiniteBoost) bodyCol = mixRgb(bodyCol, RGB_AMBAR, 0.4);
    if (w.mods.smokeTrailEnabled) bodyCol = mixRgb(bodyCol, [140, 140, 140], 0.35);

    // glow (only when hot/boosting)
    if (!reduce && (fs.heat01 > 0.35 || fs.boosting)) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba([255, 120, 60], 0.1 + 0.16 * fs.heat01);
      ctx.lineWidth = D * 1.15;
      ctx.stroke(path);
      ctx.restore();
    }

    // pass 0: projected shadow
    ctx.save();
    ctx.translate(0.16 * D, 0.28 * D);
    ctx.lineWidth = D + 4;
    ctx.strokeStyle = rgba(RGB_ESPRESSO, 0.32);
    ctx.stroke(path);
    ctx.restore();
    // pass 1: dark sauce base / outline
    ctx.lineWidth = D + 2;
    ctx.strokeStyle = rgb(RGB_SALSA_DARK);
    ctx.stroke(path);
    // pass 2: sauce body
    ctx.lineWidth = D;
    ctx.strokeStyle = rgb(bodyCol);
    ctx.stroke(path);
    // pass 3: warm ridge (pasta peeking through), offset toward the light (up-left)
    ctx.save();
    ctx.translate(-0.14 * D, -0.16 * D);
    ctx.lineWidth = D * 0.42;
    let ridge = mixRgb(bodyCol, RGB_FIDEO, 0.55);
    if (fs.enredoFlash > 0.01) ridge = mixRgb(ridge, [255, 214, 90], fs.enredoFlash);
    ctx.strokeStyle = rgb(ridge);
    ctx.stroke(path);
    ctx.restore();
    // pass 4 (gated): running specular gloss (dashed), skipped when reduced / long / zoomed out
    if (!reduce && n < 900 && cam.scale > 0.28) {
      GLOSS_DASH[0] = D * 1.4;
      GLOSS_DASH[1] = D * 4.2;
      ctx.save();
      ctx.translate(-0.22 * D, -0.24 * D);
      ctx.lineWidth = D * (fs.boosting ? 0.22 : 0.15);
      ctx.strokeStyle = "rgba(255,244,214,0.8)";
      ctx.setLineDash(GLOSS_DASH);
      ctx.lineDashOffset = -((w.tick + alpha) * (fs.boosting ? 4.4 : 2.2)) % 100000;
      ctx.stroke(path);
      ctx.setLineDash(EMPTY_DASH);
      ctx.restore();
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

  // --- 11. food (baked sprite atlas, single drawImage each) ---
  for (let i = 0; i < w.topCount; i++) {
    if ((w.topFlags[i] & TOP_FLAG.ALIVE) === 0) continue;
    const bob = Math.sin(w.tick * 0.12 + i * 1.7) * 2;
    const tx = w2sx(w.topX[i] / F);
    const ty = w2sy(w.topY[i] / F) + bob;
    let r = Math.min(18, Math.max(8, (EAT_RADIUS / F) * cam.scale * 0.8));
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
    const col = francesa ? RGB_AMBAR : RGB_VERDE;
    const pulse = 1 + 0.15 * Math.sin(w.tick * 0.18 + i);
    const pr = Math.max(9, (EAT_RADIUS / F) * cam.scale * 0.9) * pulse;
    if (!reduce) stamp(ctx, francesa ? GLOW_WARM : GLOW_GREEN, px, py, pr * 2.2, 0.6);
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
  const headR = Math.max(10, (HEAD_HITBOX / F) * fs.cam.scale * 2.1);
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
  const fx = w2sx(w.fork.x / F);
  const fy = w2sy(w.fork.y / F);
  const fr = Math.max(14, (FORK_CAPTURE_RADIUS / F) * cam.scale);
  const frad = (w.fork.heading / F) * TAU;
  const chase = w.fork.state === "CHASE";
  const col: [number, number, number] =
    chase ? [210, 60, 40] : w.fork.state === "BLOCKED" ? [110, 110, 110] : [230, 170, 60];
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
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
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

  // build chips — the upgrades you carry, colored good/bad (make the build visible)
  drawBuildChips(ctx, fs, left, top + 122);

  if (w.pedido.active === 1) drawPedido(ctx, view, fs);
}

function drawBuildChips(
  ctx: CanvasRenderingContext2D,
  fs: FrameState,
  x: number,
  y: number,
): void {
  const picked = fs.picked;
  if (!picked || picked.length === 0) return;
  const chip = picked.length > 8 ? 26 : 30;
  const gap = 5;
  const maxPerRow = Math.max(1, Math.floor((fs.world.usableHalf > 0 ? 6 : 6)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < picked.length && i < 12; i++) {
    const id = picked[i] as CardId;
    const card = CARDS[id];
    if (!card) continue;
    const col = i % maxPerRow;
    const row = Math.floor(i / maxPerRow);
    const cx = x + col * (chip + gap);
    const cy = y + row * (chip + gap);
    const tc = tipoColor(card.tipo);
    ctx.fillStyle = rgba(RGB_CREMA, 0.92);
    roundRect(ctx, cx, cy, chip, chip, 8);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = rgb(tc);
    roundRect(ctx, cx, cy, chip, chip, 8);
    ctx.stroke();
    // good/bad footer bar (every card is a trade-off)
    ctx.fillStyle = rgb(RGB_VERDE);
    ctx.fillRect(cx + 3, cy + chip - 6, (chip - 6) / 2, 3);
    ctx.fillStyle = rgb(RGB_ROJO);
    ctx.fillRect(cx + 3 + (chip - 6) / 2, cy + chip - 6, (chip - 6) / 2, 3);
    // abbreviation glyph
    ctx.fillStyle = rgb(RGB_ESPRESSO);
    ctx.font = `bold ${Math.round(chip * 0.4)}px system-ui, sans-serif`;
    ctx.fillText(card.nombre.slice(0, 2).toUpperCase(), cx + chip / 2, cy + chip / 2 - 1);
  }
  ctx.textAlign = "left";
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
function drawDraft(ctx: CanvasRenderingContext2D, view: Viewport, fs: FrameState): void {
  const w = fs.world;
  ctx.fillStyle = rgba(RGB_ESPRESSO, 0.72);
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.fillStyle = rgb(RGB_CREMA);
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("ELIGE UNA CARTA", view.w / 2, fs.insets.top + view.h * 0.3);

  for (let i = 0; i < fs.draftCards.length && i < w.offerCount; i++) {
    const r = fs.draftCards[i];
    const id = CARD_POOL[w.offerIds[i]];
    const card = CARDS[id];
    const tc = tipoColor(card.tipo);
    ctx.fillStyle = rgb(RGB_CREMA);
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgb(tc);
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.stroke();
    ctx.fillStyle = rgb(tc);
    roundRect(ctx, r.x, r.y, r.w, 26, 12);
    ctx.fill();
    ctx.fillStyle = rgb(RGB_CREMA);
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(card.tipo, r.x + 10, r.y + 7);
    ctx.fillStyle = rgb(RGB_ESPRESSO);
    ctx.font = "bold 16px system-ui, sans-serif";
    const nameLines = wrapText(ctx, card.nombre, r.w - 20);
    let ty = r.y + 36;
    for (const ln of nameLines) {
      ctx.fillText(ln, r.x + 10, ty);
      ty += 19;
    }
    ctx.fillStyle = rgba(RGB_ESPRESSO, 0.85);
    ctx.font = "12px system-ui, sans-serif";
    const bodyLines = wrapText(ctx, card.texto, r.w - 20);
    ty += 4;
    for (const ln of bodyLines) {
      if (ty > r.y + r.h - 14) break;
      ctx.fillText(ln, r.x + 10, ty);
      ty += 15;
    }
  }

  if (fs.rerollRect) {
    const r = fs.rerollRect;
    ctx.fillStyle = rgb(RGB_AMBAR);
    roundRect(ctx, r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fill();
    ctx.fillStyle = rgb(RGB_ESPRESSO);
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`REROLL (${w.rerollLeft})`, r.x + r.w / 2, r.y + r.h / 2);
    ctx.textBaseline = "top";
  }
  ctx.textAlign = "left";
  void PALETTE;
}
