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

export const TOPPING_STYLES: readonly ToppingStyle[] = [
  { shape: "disc", fill: "#C8321E", stroke: "#7C1E12", accent: "#F2A516", label: "Salsa" },
  { shape: "square", fill: "#F2A516", stroke: "#9A6606", accent: "#FBF1DE", label: "Queso" },
  { shape: "ring", fill: "#C9B6E4", stroke: "#6E5A8C", accent: "#FBF1DE", label: "Cebolla" },
  { shape: "triangle", fill: "#F5D547", stroke: "#8A7314", accent: "#FBF1DE", label: "Maíz" },
  { shape: "wave", fill: "#E8B06B", stroke: "#8A5A24", accent: "#FBF1DE", label: "Rizadas" },
  { shape: "diamond", fill: "#B6D94C", stroke: "#5C7A1E", accent: "#F2A516", label: "Piña" },
  { shape: "egg", fill: "#FBF1DE", stroke: "#C9B48A", accent: "#F2A516", label: "Huevo" },
  { shape: "star", fill: "#8A4726", stroke: "#4A2413", accent: "#F2A516", label: "Chicharrón" },
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
