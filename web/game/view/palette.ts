/**
 * palette.ts — EL ENREDO view palette, heat ramp, and colorblind-safe topping shapes.
 *
 * VIEW-ONLY. Contains no sim state and no gameplay math — just sanctioned colors, a
 * warm heat ramp (crema → ámbar → rojo brasa) driven by the global multiplier, and a
 * per-topping SHAPE table so the field stays legible without relying on hue alone.
 */

import type { ToppingCode, CardTipo } from "@/game/sim/types.ts";

// Sanctioned brand palette (the game ships UNBRANDED, but these are the hues).
export const PALETTE = {
  crema: "#FBF1DE",
  espresso: "#1E1611",
  ambar: "#F2A516",
  rojo: "#C8321E",
  verde: "#4C9A5A",
} as const;

export type RGB = readonly [number, number, number];

export const RGB_CREMA: RGB = [251, 241, 222];
export const RGB_ESPRESSO: RGB = [30, 22, 17];
export const RGB_AMBAR: RGB = [242, 165, 22];
export const RGB_ROJO: RGB = [200, 50, 30];
export const RGB_VERDE: RGB = [76, 154, 90];
export const RGB_BRASA: RGB = [214, 74, 28]; // ember-red for peak heat
export const RGB_SALSA: RGB = [188, 56, 26]; // cooked-tomato sauce (now a PATCH overlay, not full-width)
export const RGB_SALSA_DARK: RGB = [92, 22, 12]; // deep sauce base / pooling
export const RGB_SALSA_HI: RGB = [244, 168, 120]; // warm sauce sheen (NOT white — reads as sauce, not plastic)
export const RGB_FIDEO: RGB = [245, 206, 128]; // legacy pasta tone (kept for compat)
// Spaghetti strand palette — the pasta is the DOMINANT full-width color; sauce clings on top.
export const RGB_PASTA: RGB = [232, 205, 138]; // cooked strand (dominant body color)
export const RGB_PASTA_HI: RGB = [250, 240, 200]; // lit ridge of the strand
export const RGB_PASTA_SH: RGB = [176, 140, 74]; // shaded underside of the strand

// ===========================================================================
// VALUE-INVERTED GAME PALETTE (art-direction overhaul): the PAN is DARK and the FOOD GLOWS on
// it (food photography). The brand crema palette above stays for the SITE/marketing, not gameplay.
// Sacred value hierarchy: Papa > Toppings > Hebra > Obstacles > Pan > decoration. Nothing
// decorative may exceed ~3:1 contrast against the pan. All contrast ratios measured vs #241A14.
// ===========================================================================
export const RGB_PAN: RGB = [36, 26, 20]; // #241A14 dark pan (the stage)
export const RGB_PAN_RIM: RGB = [58, 42, 28]; // #3A2A1C border of the pan
export const RGB_PAN_GLOW: RGB = [74, 51, 32]; // #4A3320 soft warm centre glow

// CAST-IRON pan surface (used, not flat): mottle specks + concentric wear rings.
export const RGB_IRON_HI: RGB = [52, 38, 27]; // lighter mottle / ring highlight (top-left of a ring)
export const RGB_IRON_LO: RGB = [26, 18, 13]; // darker mottle / ring shadow (bottom-right of a ring)

// CERAMIC plate under a cluster (stoneware on iron; kept muted so it never outshines the food).
// It reads as a plate by STRUCTURE — a raised RIM (ala) around a recessed WELL (hondo) — not by
// brightness. Contrast stays modest vs the pan; the relief (bevel + rim/well steps) does the work.
export const RGB_PLATE_RIM: RGB = [108, 88, 66]; // the raised lip / ala (catches the up-left light)
export const RGB_PLATE: RGB = [74, 58, 44]; // the recessed well / hondo (where the food sits)
export const RGB_PLATE_LO: RGB = [24, 17, 12]; // contact shadow under the plate

// LIGHT LAW: one light from ABOVE-LEFT. This is the universal warm rim that REPLACES black outlines
// (top-left edge catches the light); shadows are the object's OWN dark color on the lower-right.
export const RGB_LIGHT_WARM: RGB = [255, 231, 180]; // #FFE7B4 warm key-light rim

// The HEBRA (the character): amber body, thick dark outline, single cream shine.
export const RGB_HEBRA_STROKE: RGB = [122, 62, 18]; // #7A3E12
export const RGB_HEBRA: RGB = [242, 165, 22]; // #F2A516 (8.25:1)
export const RGB_HEBRA_HI: RGB = [255, 233, 168]; // #FFE9A8 (14.17:1) — the ONE shine

// PAPA — must be the BRIGHTEST thing on screen (draws the eye to the objective).
export const RGB_PAPA_FRANCESA: RGB = [255, 210, 74]; // #FFD24A (11.82:1)
export const RGB_PAPA_CRIOLLA: RGB = [150, 235, 90]; // bright green-yellow, equally luminous

// DANGER reads by DARKNESS + SHAPE (a hole in the pan), never by hue.
export const RGB_OIL: RGB = [58, 42, 24]; // #3A2A18 (1.24:1 — a dark hole)
export const RGB_OIL_RIM: RGB = [90, 64, 32]; // #5A4020
export const RGB_WALL: RGB = [46, 33, 24]; // #2E2118
export const RGB_FORK: RGB = [200, 50, 30]; // #C8321E (the one true red = the boss)

// Pan HEAT ramp, tied to the GLOBAL MULTIPLIER (never to time): the pan reddens as tension rises.
const RGB_HEAT: readonly RGB[] = [
  [36, 26, 20], // #241A14
  [51, 32, 15], // #33200F
  [74, 37, 16], // #4A2510
  [107, 42, 16], // #6B2A10
];

export function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
export function rgb(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Linear mix of two RGB triplets; t clamped to [0,1]. */
export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

/**
 * Heat ramp crema → ámbar → rojo brasa as the global multiplier rises.
 * t in [0,1]: 0 = cool crema, ~0.5 = ámbar, 1 = ember. Two-stop piecewise.
 */
export function heatColor(t: number): RGB {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  if (u < 0.5) return mixRgb(RGB_CREMA, RGB_AMBAR, u / 0.5);
  return mixRgb(RGB_AMBAR, RGB_BRASA, (u - 0.5) / 0.5);
}

/** Warm scene-tint color for a given heat, used as a translucent wash + vignette. */
export function heatTint(t: number): RGB {
  return mixRgb(RGB_AMBAR, RGB_BRASA, t < 0 ? 0 : t > 1 ? 1 : t);
}

/** Pan base color for a given heat (multiplier). Dark → reddish-ember. 4-stop piecewise. */
export function panColor(t: number): RGB {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const seg = u * (RGB_HEAT.length - 1);
  const i = Math.min(RGB_HEAT.length - 2, Math.floor(seg));
  return mixRgb(RGB_HEAT[i], RGB_HEAT[i + 1], seg - i);
}

// ---------------------------------------------------------------------------
// Topping SHAPE table — colorblind-safe: SHAPE is the primary channel, color 2nd.
// Indexed by ToppingCode: SALSA0 QUESO1 CEBOLLA2 MAIZ3 RIZADAS4 PINA5 HUEVO6 CHICHARRON7
// ---------------------------------------------------------------------------

export type ToppingShapeKind =
  | "disc"
  | "square"
  | "ring"
  | "triangle"
  | "wave"
  | "diamond"
  | "egg"
  | "star";

export type ToppingStyle = {
  shape: ToppingShapeKind;
  fill: string;
  stroke: string;
  accent: string; // egg yolk / star core / ring dot
  label: string;
};

// 8/8 legible on the dark pan now (was 1/8). Contrast vs #241A14 noted. SHAPE stays the primary
// (colorblind) channel; the renderer bakes fill + thick stroke + a SINGLE accent shine per sprite.
export const TOPPING_STYLES: readonly ToppingStyle[] = [
  { shape: "disc", fill: "#F0553A", stroke: "#7A1F12", accent: "#FFC9A8", label: "Salsa" }, // 4.92:1
  { shape: "square", fill: "#F2A516", stroke: "#7A4E06", accent: "#FFE9A8", label: "Queso" }, // 8.25:1
  { shape: "ring", fill: "#D6C4EE", stroke: "#5A4A78", accent: "#FFFFFF", label: "Cebolla" }, // 10.54:1
  { shape: "triangle", fill: "#F7DE5E", stroke: "#7A6A14", accent: "#FFFBE0", label: "Maíz" }, // 12.62:1
  { shape: "wave", fill: "#F0BC7A", stroke: "#7A4A20", accent: "#FFE6C8", label: "Rizadas" }, // 9.88:1
  { shape: "diamond", fill: "#F2C230", stroke: "#8A5A12", accent: "#FFE79A", label: "Piña" }, // golden pineapple body
  { shape: "egg", fill: "#FFF6E6", stroke: "#A08A62", accent: "#FFFFFF", label: "Huevo" }, // 15.88:1
  { shape: "star", fill: "#D98E4F", stroke: "#5A3A18", accent: "#FFD9A8", label: "Chicharrón" }, // 6.43:1
];

export function toppingStyle(kind: ToppingCode | number): ToppingStyle {
  const i = kind as number; // pools store codes as raw Int8 numbers
  return TOPPING_STYLES[i >= 0 && i < TOPPING_STYLES.length ? i : 0];
}

/** Draft card taxonomy color: ING = verde (buena), REC = ámbar (receta), MAL = rojo. */
export function tipoColor(tipo: CardTipo): RGB {
  if (tipo === "ING") return RGB_VERDE;
  if (tipo === "MAL") return RGB_ROJO;
  return RGB_AMBAR;
}
