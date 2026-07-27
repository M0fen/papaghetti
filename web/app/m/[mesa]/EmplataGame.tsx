"use client";

/**
 * EMPLATA v2 — el pedido ES un juego (canvas, artesanía de EL ENREDO).
 *
 * Escena Canvas2D 60fps: cocina cálida con UNA luz arriba-izquierda, la caja origami kraft
 * centro-escenario (volumen + vapor), y una BANDEJA táctil en zona de pulgar con los ingredientes
 * como SPRITES HORNEADOS (modelo de 5 capas: AO → volumen → sombra propia → rim → especular).
 *
 * EL FIDEO MESERO: al tocar una carta, una hebra de spaghetti VIVA (el ADN del personaje de
 * EL ENREDO — punta con ojitos) sale de la caja, agarra el ingrediente y lo lleva en arco hasta
 * soltarlo dentro; rebota con squash y se apila. Quitar un topping = el fideo lo SACA de la caja
 * y lo devuelve a su carta. Si nadie toca nada, el fideo se asoma curioso y mira la bandeja.
 * Confirmar → la caja se pliega en origami, sello PG con chispas doradas, y el pedido entra por
 * el flujo existente (canal "qr").
 *
 * El cerebro manda: menú/precios/gratis/impuesto del catálogo. Física y arte son VIEW puro.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatCOP,
  estadoLabel,
  TIPOS,
  tipoLabel,
  type EstadoPedido,
  type Ingrediente,
  type TipoServicio,
} from "@/lib/menu";
import { calcularTotales, faltaParaMinimo } from "@/lib/precios";
import { EJES, perfilDe, rasgoDominante, saborDe, tituloAntojo, type Sabor } from "@/lib/sabor";
import { enviarPedido, estadoPedido } from "@/app/pedido-actions";
import { useSonido } from "./sonido";

const TAU = Math.PI * 2;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const bez2 = (a: number, b: number, c: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/* HOGARES de la mascota: de dónde sale el fideo. Lados + POR ENCIMA de la caja. Tras cada
   agarre se reubica a otro al azar, así el siguiente agarre nace en un lugar distinto.
   axf/ayf = offset del ancla (fracción de boxW/boxH desde la base de la caja); up = cuánto se
   asoma; io = hacia dónde queda el interior de la caja. */
const HOMES = [
  { axf: -0.42, ayf: -0.3, up: 0.62, io: 1 }, // costado izquierdo
  { axf: 0.42, ayf: -0.3, up: 0.62, io: -1 }, // costado derecho
  { axf: 0.0, ayf: -0.52, up: 0.44, io: 0 }, // asoma por ARRIBA (centro)
  { axf: -0.24, ayf: -0.48, up: 0.48, io: 1 }, // arriba-izquierda
  { axf: 0.24, ayf: -0.48, up: 0.48, io: -1 }, // arriba-derecha
];
const otroHome = (cur: number) => {
  let n = Math.floor(Math.random() * HOMES.length);
  if (n === cur) n = (n + 1) % HOMES.length;
  return n;
};

/* Muelle amortiguado 1-D (integrador semi-implícito). Da anticipación/overshoot/follow-through.
   Presets típicos: crítico k=170 c=26 · subamortiguado (juguetón) k=180 c=12 · golpe k=320 c=22. */
function springStep(pos: number, vel: number, target: number, k: number, c: number, dt: number): [number, number] {
  const h = dt > 1 / 30 ? 1 / 30 : dt;
  const v = vel + (-k * (pos - target) - c * vel) * h;
  return [pos + v * h, v];
}

/* Ruido coherente barato: value noise + 2 octavas. Sirve para que la vida del fideo
   (respiro, parpadeo, mirada) deje de ser un metrónomo sin traer una librería.
   Ojo: `n << 13` fuerza int32 → mantener el argumento por debajo de 2^18. */
const hash1 = (n: number) => {
  let h = (n << 13) ^ n;
  h = (h * (h * h * 15731 + 789221) + 1376312589) & 0x7fffffff;
  return 1 - h / 1073741824;
};
const vnoise = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
};
const fbm = (x: number) => vnoise(x) * 0.65 + vnoise(x * 2.17) * 0.35;

/* Amortiguador de vida media EXACTA (estable a cualquier dt, sin explotar a framerate bajo).
   Se usa para los puntos de control del fideo: encadenados con vidas medias crecientes
   producen el LÁTIGO — el cuerpo se queda atrás y alcanza a la cabeza con retraso. */
const LN2 = 0.6931471805599453;
const negexp = (x: number) => 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
function damper(pos: number, vel: number, target: number, hl: number, dt: number): [number, number] {
  const y = (4 * LN2) / (hl + 1e-5) / 2;
  const j0 = pos - target;
  const j1 = vel + j0 * y;
  const e = negexp(y * dt);
  return [e * (j0 + j1 * dt) + target, e * (vel - j1 * y * dt)];
}

/** Estado con memoria de los puntos de control de una hebra. */
type CtrlFideo = { x1: number; v1x: number; y1: number; v1y: number; x2: number; v2x: number; y2: number; v2y: number; on: boolean };
const nuevoCtrl = (): CtrlFideo => ({ x1: 0, v1x: 0, y1: 0, v1y: 0, x2: 0, v2x: 0, y2: 0, v2y: 0, on: false });

/* =========================================================================
   EL NIDO SERVIBLE — la comida NO se apila al azar: cada ingrediente cae en un SLOT
   determinista (rol + índice) que forma un MONTÍCULO con héroe(s) de proteína y toppings
   dispuestos por ángulo áureo. Estructura y forma, foto reproducible. Ver recomputeSlots().
   ========================================================================= */
const YB = -0.05; // tapa de la CAMA (fracción de boxH; el nido se apoya aquí, cerca del suelo)
const HM = 0.3; // altura del penacho: 0.20→0.30 sube el apex a −0.35·boxH (hueco al rim 34→14px)
const FXLIM = 0.37; // límite lateral: 0.30→0.37 abre los flancos (comida a ±95px vs pared ±108)
const FXENV = 0.42; // soporte de la envolvente: la cúpula no colapsa a la altura del suelo antes del muro

/* Unidades de DISEÑO de la escena (px a escala 1 = teléfono de 390). Todo lo demás las
   multiplica por `U` (ver geo()), así el mismo dibujo sirve en un móvil y en un portátil.
   MOBILE FIRST: a 390px U vale exactamente 1 → la escena del teléfono no se mueve un píxel. */
const CAJA_BASE = 300; // ancho de la caja a escala 1
const CARTA_W = 96; // +4 respecto al original: gana texto sin quitar cartas a la vista
const CARTA_H = 118;
/** Hash determinista str→[0,1): jitter/rot reproducibles (jamás Math.random posicional). */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
/** Envolvente del montículo: alto al centro-fondo, cae a flancos y frente. ty en fracción de boxH
 *  (negativo = arriba). depth 0=frente/cámara, 1=fondo. Apex ≈ -0.33 (bajo el rim, no se sale). */
function moundY(fx: number, depth: number): number {
  const t = Math.min(1, Math.abs(fx) / FXENV); // por FXENV, no FXLIM: un topping en el flanco
  const prof = Math.pow(1 - t * t, 0.6); // mantiene altura hasta el muro (antes caía al suelo)
  return YB - HM * prof * (0.4 + 0.6 * depth);
}

/* =========================================================================
   TIPOGRAFÍA — Canvas2D NO resuelve var(--…) en ctx.font. Hay que leer las
   familias resueltas de las custom properties UNA vez (portado del juego
   hermano render.ts). Sin esto, TODO el texto cae a "10px sans-serif".
   ========================================================================= */
let FONT_DISPLAY = "system-ui, sans-serif"; // Bricolage Grotesque
let FONT_BODY = "system-ui, sans-serif"; // Manrope
let fontsResolved = false;
function resolveFonts(): void {
  if (fontsResolved || typeof document === "undefined") return;
  try {
    const cs = getComputedStyle(document.documentElement);
    const disp = cs.getPropertyValue("--font-display").trim();
    const body = cs.getPropertyValue("--font-body").trim();
    if (disp) FONT_DISPLAY = `${disp}, system-ui, sans-serif`;
    if (body) FONT_BODY = `${body}, system-ui, sans-serif`;
    const fonts = (document as unknown as { fonts?: { load?: (s: string) => Promise<unknown> } }).fonts;
    if (fonts?.load && disp && body) {
      [`700 24px ${disp}`, `800 24px ${disp}`, `500 14px ${body}`, `800 14px ${body}`].forEach((sp) => {
        try {
          void fonts.load!(sp);
        } catch {
          /* ignore */
        }
      });
    }
    fontsResolved = true;
  } catch {
    /* mantener fallbacks */
  }
}
/** Cara display (Bricolage) — wordmark, números, nombres. */
const fontD = (px: number, weight = 800) => `${weight} ${px}px ${FONT_DISPLAY}`;
/** Cara body (Manrope) — labels, precios, small print. */
const fontB = (px: number, weight = 600) => `${weight} ${px}px ${FONT_BODY}`;

/** Envuelve `text` en hasta 2 líneas que quepan en maxW (px), con ELIPSIS real (measureText).
 *  Requiere ctx.font ya seteado. Sustituye el slice(0,15) que partía palabras a la mitad. */
function wrap2(ctx: CanvasRenderingContext2D, text: string, maxW: number): [string, string] {
  const words = text.split(" ");
  const lines: [string, string] = ["", ""];
  let li = 0;
  for (const w of words) {
    const cand = lines[li] ? lines[li] + " " + w : w;
    if (ctx.measureText(cand).width <= maxW || !lines[li]) lines[li] = cand;
    else if (li === 0) {
      li = 1;
      lines[1] = w;
    } else lines[1] = cand;
  }
  const elip = (str: string): string => {
    if (ctx.measureText(str).width <= maxW) return str;
    let t = str;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  };
  return [elip(lines[0]), lines[1] ? elip(lines[1]) : ""];
}

/* =========================================================================
   PERFIL DE SABOR — cada ingrediente tiene un carácter en 4 ejes (0..1). Sirve al
   TERMÓMETRO DEL ANTOJO (perfil agregado de la caja) y a la REACCIÓN por ingrediente
   (el rasgo dominante decide el tinte de escena, las partículas y el gesto del fideo).
   No hay picante en el catálogo → los ejes que de verdad varían: cro/cre/fre/dul.
   ========================================================================= */
/* El modelo vive en lib/sabor.ts: lo comparten el juego y las fichas de la carta. */

/* =========================================================================
   SPRITES — comida horneada con el modelo de luz del juego (una luz ↖).
   ========================================================================= */
type Off = HTMLCanvasElement;
const SPR = 96; // px lógicos del sprite (unidad de dibujo/display)
const R = 34; // radio base de la comida dentro del sprite
// SUPERSAMPLING: se hornea a SPR·Q y se dibuja a tamaño de display → nítido aun en la base heroína
// (~240px device). Q=2 equilibra nitidez (la base sube a 192px, ~1.25× upscale) y coste en gama media.
const Q = 2;

function makeOff(): { c: Off; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = SPR * Q;
  c.height = SPR * Q;
  const g = c.getContext("2d")!;
  g.scale(Q, Q);
  return { c, g };
}
function ao(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const a = g.createRadialGradient(cx + r * 0.14, cy + r * 0.66, r * 0.1, cx + r * 0.14, cy + r * 0.66, r * 1.1);
  a.addColorStop(0, "rgba(60,38,18,0.32)");
  a.addColorStop(1, "rgba(60,38,18,0)");
  g.fillStyle = a;
  g.beginPath();
  g.ellipse(cx + r * 0.12, cy + r * 0.68, r, r * 0.46, 0, 0, TAU);
  g.fill();
}
function volumen(
  g: CanvasRenderingContext2D,
  build: () => void,
  cx: number,
  cy: number,
  r: number,
  light: string,
  mid: string,
  dark: string,
): void {
  const v = g.createRadialGradient(cx - r * 0.36, cy - r * 0.42, r * 0.1, cx, cy, r * 1.1);
  v.addColorStop(0, light);
  v.addColorStop(0.55, mid);
  v.addColorStop(1, dark);
  build();
  g.fillStyle = v;
  g.fill();
  const s = g.createLinearGradient(cx + r, cy + r, cx - r * 0.2, cy - r * 0.2);
  s.addColorStop(0, dark);
  s.addColorStop(0.55, "rgba(0,0,0,0)");
  build();
  g.lineWidth = Math.max(2, r * 0.16);
  g.strokeStyle = s;
  g.stroke();
}
function rim(g: CanvasRenderingContext2D, build: () => void, cx: number, cy: number, r: number, a = 0.9): void {
  const rg = g.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.2);
  rg.addColorStop(0, `rgba(255,236,190,${a})`);
  rg.addColorStop(0.55, "rgba(255,236,190,0)");
  build();
  g.lineWidth = Math.max(1.4, r * 0.11);
  g.strokeStyle = rg;
  g.stroke();
}
function spec(g: CanvasRenderingContext2D, x: number, y: number, r: number, hard: boolean): void {
  if (hard) {
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.arc(x, y, r * 0.15, 0, TAU);
    g.fill();
  } else {
    const s = g.createRadialGradient(x, y, 0, x, y, r * 0.5);
    s.addColorStop(0, "rgba(255,248,232,0.4)");
    s.addColorStop(1, "rgba(255,248,232,0)");
    g.fillStyle = s;
    g.beginPath();
    g.arc(x, y, r * 0.5, 0, TAU);
    g.fill();
  }
}
/** Brillo HÚMEDO para salsas/cremosos (comemos con los ojos): sheen elíptico amplio orientado ↖ +
 *  2 micro-catchlights + menisco brillante en el borde inferior. `source-atop` lo confina a la
 *  silueta ya dibujada. Da la lectura "jugoso" que el spec() de punto duro no logra en una salsa. */
function glossy(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.save();
  g.globalCompositeOperation = "source-atop"; // solo sobre la comida ya pintada, jamás fuera
  const sg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.36, r * 0.05, cx - r * 0.2, cy - r * 0.24, r * 0.92);
  sg.addColorStop(0, "rgba(255,252,240,0.55)");
  sg.addColorStop(0.5, "rgba(255,250,235,0.14)");
  sg.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = sg;
  g.beginPath();
  g.ellipse(cx - r * 0.16, cy - r * 0.22, r * 0.72, r * 0.52, -0.5, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.9)"; // catchlight duro (la gota de reflejo)
  g.beginPath();
  g.arc(cx - r * 0.34, cy - r * 0.36, r * 0.08, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.arc(cx + r * 0.1, cy - r * 0.48, r * 0.05, 0, TAU);
  g.fill();
  g.strokeStyle = "rgba(255,246,225,0.4)"; // menisco húmedo inferior
  g.lineWidth = Math.max(1, r * 0.09);
  g.beginPath();
  g.ellipse(cx, cy + r * 0.04, r * 0.8, r * 0.64, 0, Math.PI * 0.12, Math.PI * 0.88);
  g.stroke();
  g.restore();
}

/** Deriva tonos cálidos del color del catálogo: f>0 aclara hacia crema, f<0 oscurece hacia marrón. */
function shade(hex: string | undefined, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  let r = 242;
  let g = 165;
  let b = 22;
  if (m) {
    r = parseInt(m[1].slice(0, 2), 16);
    g = parseInt(m[1].slice(2, 4), 16);
    b = parseInt(m[1].slice(4, 6), 16);
  }
  const t = f > 0 ? [255, 244, 214] : [58, 34, 12];
  const k = Math.abs(f);
  return `rgb(${Math.round(r + (t[0] - r) * k)},${Math.round(g + (t[1] - g) * k)},${Math.round(b + (t[2] - b) * k)})`;
}

function blob(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, s1: number, sq = 0.94): () => void {
  return () => {
    g.beginPath();
    for (let k = 0; k <= 18; k++) {
      const a = (k / 18) * TAU;
      const w = r * (0.9 + 0.12 * Math.sin(a * 3 + s1) + 0.05 * Math.sin(a * 5));
      if (k === 0) g.moveTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w * sq);
      else g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w * sq);
    }
    g.closePath();
  };
}

/**
 * Pinta el sprite de un ingrediente según su id (regex) — y si no lo conocemos, un GENERADOR
 * PROCEDURAL con volumen a partir de ing.color + categoría. NUNCA emoji, nunca system-ui.
 * Al final, TODA silueta pasa por el horneado volumétrico (luz ↖ + sombra propia ↘) y se
 * compone sobre su sombra de contacto — una sola luz, coherente con la biblia de arte.
 */
function bakeSprite(ing: Ingrediente): Off {
  const { c, g } = makeOff();
  const cx = SPR / 2;
  const cy = SPR / 2;
  const id = ing.id;
  g.lineJoin = "round";
  g.lineCap = "round";

  if (/spaghetti|pasta|fideo/.test(id)) {
    // nido de spaghetti: hebras ámbar enrolladas con brillo
    for (let ring = 0; ring < 3; ring++) {
      const rr = R * (0.85 - ring * 0.22);
      g.strokeStyle = ring === 0 ? "#B97A24" : ring === 1 ? "#E9A32C" : "#F6C566";
      g.lineWidth = R * 0.34;
      g.beginPath();
      for (let k = 0; k <= 26; k++) {
        const a = (k / 26) * TAU;
        const w = rr * (1 + 0.1 * Math.sin(a * 4 + ring * 2));
        if (k === 0) g.moveTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w * 0.72);
        else g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w * 0.72);
      }
      g.stroke();
    }
    g.strokeStyle = "rgba(255,240,200,0.8)";
    g.lineWidth = R * 0.09;
    g.beginPath();
    g.arc(cx - R * 0.2, cy - R * 0.24, R * 0.5, Math.PI * 0.9, Math.PI * 1.7);
    g.stroke();
  } else if (/criolla/.test(id)) {
    // papitas criollas — naranja SATURADO (distinto del pollo pálido y la piña ácida; no comparten mid+dark)
    const pts: Array<[number, number, number]> = [
      [cx - R * 0.42, cy + R * 0.2, R * 0.5],
      [cx + R * 0.4, cy + R * 0.12, R * 0.46],
      [cx - R * 0.02, cy - R * 0.3, R * 0.52],
    ];
    // AO de contacto que AGRUPA las monedas (no flotan como stickers sueltos)
    g.fillStyle = "rgba(74,42,8,0.42)";
    g.beginPath();
    g.ellipse(cx, cy + R * 0.28, R * 0.7, R * 0.26, 0, 0, TAU);
    g.fill();
    for (const [px, py, pr] of pts) {
      volumen(g, () => {
        g.beginPath();
        g.ellipse(px, py, pr, pr * 0.82, 0, 0, TAU);
      }, px, py, pr, "#FFC94E", "#EC9A1E", "#6E3E08");
      spec(g, px - pr * 0.3, py - pr * 0.32, pr, false);
    }
    rim(g, () => {
      g.beginPath();
      g.ellipse(cx - R * 0.02, cy - R * 0.3, R * 0.52, R * 0.43, 0, 0, TAU);
    }, cx, cy - R * 0.3, R * 0.5, 0.7);
  } else if (/francesa|fries|papa-a-la/.test(id)) {
    // manojo de papas a la francesa
    const sticks = [-0.5, -0.18, 0.14, 0.46];
    for (let k = 0; k < sticks.length; k++) {
      const px = cx + sticks[k] * R * 1.3;
      const tilt = sticks[k] * 0.4;
      g.save();
      g.translate(px, cy);
      g.rotate(tilt);
      const grad = g.createLinearGradient(-R * 0.16, 0, R * 0.16, 0);
      grad.addColorStop(0, "#FFD98A");
      grad.addColorStop(0.5, "#F2B035");
      grad.addColorStop(1, "#B97A24");
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(-R * 0.15, -R * 0.9, R * 0.3, R * 1.7, R * 0.12);
      g.fill();
      g.restore();
    }
    spec(g, cx - R * 0.4, cy - R * 0.5, R, false);
  } else if (/chicharron/.test(id)) {
    volumen(g, blob(g, cx, cy, R * 0.94, 1.2), cx, cy, R * 0.94, "#F0B078", "#D98E4F", "#5A3A18");
    g.fillStyle = "rgba(80,50,20,0.55)";
    for (const [hx, hy, hr] of [[-0.24, -0.1, 3.2], [0.26, 0.06, 2.6], [0.0, 0.32, 2.4]] as const) {
      g.beginPath();
      g.arc(cx + hx * R, cy + hy * R, hr, 0, TAU);
      g.fill();
    }
    rim(g, blob(g, cx, cy, R * 0.94, 1.2), cx, cy, R * 0.94, 0.65);
    spec(g, cx - R * 0.2, cy - R * 0.24, R, false);
  } else if (/tocineta|bacon/.test(id)) {
    // tira de tocineta ondulada
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.5);
    for (let band = 0; band < 3; band++) {
      g.strokeStyle = band === 1 ? "#F3C9A2" : band === 0 ? "#A93B22" : "#C8513A";
      g.lineWidth = R * (band === 1 ? 0.22 : 0.3);
      g.beginPath();
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const x = (t - 0.5) * R * 1.9;
        const y = Math.sin(t * Math.PI * 3) * R * 0.22 + (band - 1) * R * 0.16;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
    spec(g, cx - R * 0.3, cy - R * 0.36, R, true);
  } else if (/bolonesa|carne/.test(id)) {
    volumen(g, blob(g, cx, cy + R * 0.06, R * 0.9, 2.1, 0.8), cx, cy, R * 0.9, "#E06A3A", "#B23A1C", "#5E1A0C");
    // TROZOS de carne (masas redondeadas con su propia luz ↖) — no un blob liso
    for (const [mx, my, mr] of [[-0.28, -0.02, 0.2], [0.18, -0.16, 0.17], [0.06, 0.22, 0.19], [0.34, 0.1, 0.14]] as const) {
      const bx = cx + mx * R;
      const byc = cy + my * R;
      const br = mr * R;
      const cg = g.createRadialGradient(bx - br * 0.4, byc - br * 0.4, br * 0.1, bx, byc, br);
      cg.addColorStop(0, "#A8482A");
      cg.addColorStop(1, "#5E1E10");
      g.fillStyle = cg;
      g.beginPath();
      g.arc(bx, byc, br, 0, TAU);
      g.fill();
    }
    // HEBRA de fideo asomando (la firma papaghetti) — rizo ámbar con filo de brillo
    g.strokeStyle = "#E9A83C";
    g.lineWidth = R * 0.14;
    g.lineCap = "round";
    g.beginPath();
    g.ellipse(cx + R * 0.08, cy - R * 0.16, R * 0.32, R * 0.16, -0.4, 0.3, Math.PI * 1.7);
    g.stroke();
    g.strokeStyle = "rgba(255,240,200,0.6)";
    g.lineWidth = R * 0.045;
    g.beginPath();
    g.ellipse(cx + R * 0.08, cy - R * 0.18, R * 0.3, R * 0.14, -0.4, 0.5, Math.PI * 1.4);
    g.stroke();
    glossy(g, cx, cy, R * 0.9); // salsa: brillo húmedo
  } else if (/pollo|crispy/.test(id)) {
    // pollo apanado CRUJIENTE: base dorada pálida + CRÁTERES de costra (bultitos con volumen,
    // luz ↖ y sombra ↘) → lee como frito, no como blob liso
    volumen(g, blob(g, cx, cy, R * 0.86, 3.3), cx, cy, R * 0.86, "#FBE7AE", "#E6BC63", "#9A6A24");
    const nubs: Array<[number, number, number]> = [
      [-0.3, -0.18, 0.2], [0.12, -0.28, 0.16], [0.34, 0.02, 0.18],
      [-0.1, 0.12, 0.22], [0.2, 0.3, 0.15], [-0.34, 0.24, 0.14], [0.02, -0.02, 0.17],
    ];
    for (const [nx, ny, nr] of nubs) {
      const bx = cx + nx * R;
      const byc = cy + ny * R;
      const br = nr * R;
      g.fillStyle = "rgba(120,78,24,0.38)"; // sombra ↘ del bulto
      g.beginPath();
      g.arc(bx + br * 0.3, byc + br * 0.32, br, 0, TAU);
      g.fill();
      const bg = g.createRadialGradient(bx - br * 0.4, byc - br * 0.4, br * 0.1, bx, byc, br);
      bg.addColorStop(0, "#FFEFC0");
      bg.addColorStop(0.6, "#EDC066");
      bg.addColorStop(1, "#B5842E");
      g.fillStyle = bg;
      g.beginPath();
      g.arc(bx, byc, br, 0, TAU);
      g.fill();
    }
    rim(g, blob(g, cx, cy, R * 0.86, 3.3), cx, cy, R * 0.86, 0.7);
  } else if (/mixta/.test(id)) {
    // MIXTA: revuelto de dos proteínas — parches dorados (frito) + rojos (carne) sobre una masa
    volumen(g, blob(g, cx, cy, R * 0.9, 2.6, 0.86), cx, cy, R * 0.9, "#E8B45A", "#C88A34", "#7A4E14");
    const parche = (mx: number, my: number, mr: number, c0: string, c1: string) => {
      const bx = cx + mx * R;
      const byc = cy + my * R;
      const br = mr * R;
      const cg = g.createRadialGradient(bx - br * 0.4, byc - br * 0.4, br * 0.1, bx, byc, br);
      cg.addColorStop(0, c0);
      cg.addColorStop(1, c1);
      g.fillStyle = cg;
      g.beginPath();
      g.arc(bx, byc, br, 0, TAU);
      g.fill();
    };
    parche(0.2, -0.1, 0.22, "#C05A32", "#6E2412"); // carne
    parche(0.34, 0.16, 0.16, "#B85030", "#6E2412");
    parche(0.08, 0.24, 0.18, "#C05A32", "#6E2412");
    parche(-0.3, -0.05, 0.2, "#FFE6A8", "#B5842E"); // frito
    parche(-0.16, 0.2, 0.15, "#FBE0A0", "#B5842E");
    parche(-0.34, 0.22, 0.13, "#FFE6A8", "#B5842E");
    rim(g, blob(g, cx, cy, R * 0.9, 2.6, 0.86), cx, cy, R * 0.9, 0.6);
    spec(g, cx - R * 0.24, cy - R * 0.28, R, false);
  } else if (/maicito|maiz/.test(id)) {
    // montoncito de granos de maíz
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      const rr = k === 0 ? 0 : R * (0.34 + (k % 3) * 0.16);
      const px = cx + Math.cos(a * 2.4) * rr;
      const py = cy + Math.sin(a * 2.4) * rr * 0.7;
      volumen(g, () => {
        g.beginPath();
        g.ellipse(px, py, R * 0.22, R * 0.26, 0, 0, TAU);
      }, px, py, R * 0.24, "#FFF0A8", "#F7DE5E", "#9A7A14");
    }
    spec(g, cx - R * 0.2, cy - R * 0.3, R, true);
  } else if (/hogao|napolitana|salsa/.test(id)) {
    volumen(g, blob(g, cx, cy + R * 0.08, R * 0.92, 0.6, 0.75), cx, cy, R * 0.92, "#F0714A", "#C8321E", "#6E150A");
    g.fillStyle = "#4C9A5A";
    g.beginPath();
    g.ellipse(cx + R * 0.3, cy - R * 0.18, R * 0.14, R * 0.08, 0.6, 0, TAU);
    g.fill();
    glossy(g, cx, cy, R * 0.92); // hogao/salsa: superficie húmeda brillante
  } else if (/parmesano|queso/.test(id)) {
    // virutas de queso
    for (let k = 0; k < 5; k++) {
      g.save();
      g.translate(cx + (k - 2) * R * 0.34, cy + ((k % 2) - 0.5) * R * 0.4);
      g.rotate((k - 2) * 0.5);
      const grad = g.createLinearGradient(0, -R * 0.3, 0, R * 0.3);
      grad.addColorStop(0, "#FFF2C0");
      grad.addColorStop(1, "#E8B54E");
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(-R * 0.11, -R * 0.42, R * 0.22, R * 0.84, R * 0.1);
      g.fill();
      g.restore();
    }
    spec(g, cx - R * 0.3, cy - R * 0.4, R, true);
  } else if (/aguacate/.test(id)) {
    volumen(g, () => {
      g.beginPath();
      g.ellipse(cx, cy, R * 0.72, R * 0.9, 0, 0, TAU);
    }, cx, cy, R * 0.85, "#D7F0A2", "#8FBF4D", "#3E5A1E");
    volumen(g, () => {
      g.beginPath();
      g.arc(cx, cy + R * 0.12, R * 0.3, 0, TAU);
    }, cx, cy + R * 0.12, R * 0.3, "#C89A5B", "#A87B42", "#6B4A1E");
    glossy(g, cx, cy, R * 0.82); // aguacate: cremoso, brillo húmedo suave
  } else if (/perejil|cilantro|hierba/.test(id)) {
    g.strokeStyle = "#3E7A46";
    g.lineWidth = 2.4;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.5;
      g.beginPath();
      g.moveTo(cx, cy + R * 0.5);
      g.quadraticCurveTo(cx + Math.cos(a) * R * 0.5, cy, cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.7);
      g.stroke();
      g.fillStyle = k % 2 ? "#5AAE5C" : "#4C9A5A";
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.7, R * 0.16, 0, TAU);
      g.fill();
    }
  } else if (/pina|piña|nugget/.test(id)) {
    // trocitos de piña calada
    for (const [px, py] of [[-0.34, 0.12], [0.34, 0.04], [0, -0.3]] as const) {
      const x = cx + px * R;
      const y = cy + py * R;
      g.save();
      g.translate(x, y);
      g.rotate(px * 0.8);
      volumen(g, () => {
        g.beginPath();
        g.roundRect(-R * 0.3, -R * 0.26, R * 0.6, R * 0.52, R * 0.12);
      }, 0, 0, R * 0.4, "#FFF07A", "#F5CE2C", "#9A7A12");
      // filo VERDE ácido de la cáscara (separa de criolla/pollo dorados)
      g.strokeStyle = "rgba(122,166,74,0.7)";
      g.lineWidth = R * 0.08;
      g.beginPath();
      g.roundRect(-R * 0.3, -R * 0.26, R * 0.6, R * 0.52, R * 0.12);
      g.stroke();
      g.restore();
    }
    spec(g, cx - R * 0.2, cy - R * 0.36, R, true);
  } else {
    // DESCONOCIDO → forma rechoncha procedural con el color del catálogo (jamás emoji)
    const hi = shade(ing.color, 0.45);
    const mi = shade(ing.color, 0);
    const lo = shade(ing.color, -0.55);
    if (ing.categoria === "topping") {
      // montículo triple: tres masas redondeadas que se tocan
      const masas: Array<[number, number, number]> = [
        [-0.34, 0.16, 0.44],
        [0.36, 0.1, 0.4],
        [0.0, -0.24, 0.48],
      ];
      for (const [px, py, pr] of masas) {
        const x = cx + px * R;
        const y = cy + py * R;
        volumen(g, () => {
          g.beginPath();
          g.ellipse(x, y, pr * R, pr * R * 0.85, px * 0.4, 0, TAU);
        }, x, y, pr * R, hi, mi, lo);
      }
      rim(g, () => {
        g.beginPath();
        g.ellipse(cx, cy - R * 0.24, R * 0.48, R * 0.4, 0, 0, TAU);
      }, cx, cy - R * 0.24, R * 0.46, 0.6);
      spec(g, cx - R * 0.18, cy - R * 0.42, R * 0.7, false);
    } else if (ing.categoria === "proteina") {
      // masa generosa e irregular
      volumen(g, blob(g, cx, cy, R * 0.9, 2.6, 0.86), cx, cy, R * 0.9, hi, mi, lo);
      rim(g, blob(g, cx, cy, R * 0.9, 2.6, 0.86), cx, cy, R * 0.9, 0.65);
      spec(g, cx - R * 0.24, cy - R * 0.28, R, false);
    } else {
      // base: montículo ancho y bajo (una cama)
      volumen(g, () => {
        g.beginPath();
        g.ellipse(cx, cy + R * 0.12, R * 0.95, R * 0.58, 0, 0, TAU);
      }, cx, cy, R * 0.9, hi, mi, lo);
      rim(g, () => {
        g.beginPath();
        g.ellipse(cx, cy + R * 0.12, R * 0.95, R * 0.58, 0, 0, TAU);
      }, cx, cy, R * 0.9, 0.55);
      spec(g, cx - R * 0.3, cy - R * 0.12, R, false);
    }
  }

  // ===== HORNEADO VOLUMÉTRICO (todas las siluetas, una sola luz ↖) =====
  g.globalCompositeOperation = "source-atop";
  const vg = g.createRadialGradient(cx - R * 0.5, cy - R * 0.55, R * 0.1, cx, cy, R * 1.5);
  vg.addColorStop(0, "rgba(255,248,225,0.30)");
  vg.addColorStop(0.55, "rgba(255,248,225,0)");
  g.fillStyle = vg;
  g.fillRect(0, 0, SPR, SPR);
  const dg = g.createLinearGradient(cx + R * 0.9, cy + R * 0.9, cx - R * 0.3, cy - R * 0.3);
  dg.addColorStop(0, "rgba(58,32,10,0.30)");
  dg.addColorStop(0.5, "rgba(58,32,10,0)");
  g.fillStyle = dg;
  g.fillRect(0, 0, SPR, SPR);
  g.globalCompositeOperation = "source-over";

  // ===== composición final: sombra de contacto elíptica + la forma horneada =====
  const { c: out, g: og } = makeOff();
  ao(og, cx, cy, R);
  og.drawImage(c, 0, 0, SPR, SPR); // c es SPR·Q; el contexto va escalado Q → 1:1
  return out;
}

/**
 * BARNIZ: una medialuna especular ↖ recortada a la SILUETA del ingrediente (la lectura
 * "húmedo/recién hecho" que pide el estilo Ghibli). Se hornea UNA vez por ingrediente y se
 * dibuja en espacio de pantalla con blend `lighter`: así no gira con las rotaciones del
 * montón (que apuntarían el brillo a cualquier lado) y una sola luz manda siempre.
 * Técnica: se borra una copia desplazada ↘ del sprite (queda solo el filo ↖) y esa
 * medialuna se tiñe de blanco-cálido con degradado. Vale para el Off procedural y el .webp.
 */
function bakeGlaze(src: CanvasImageSource): Off {
  const { c, g } = makeOff();
  g.drawImage(src, 0, 0, SPR, SPR);
  g.globalCompositeOperation = "destination-out";
  g.drawImage(src, SPR * 0.085, SPR * 0.105, SPR, SPR); // borra la copia ↘ → queda el filo ↖
  g.globalCompositeOperation = "source-in";
  const lg = g.createLinearGradient(SPR * 0.22, SPR * 0.16, SPR * 0.78, SPR * 0.72);
  lg.addColorStop(0, "rgba(255,250,235,1)");
  lg.addColorStop(0.55, "rgba(255,240,205,0.35)");
  lg.addColorStop(1, "rgba(255,240,205,0)");
  g.fillStyle = lg;
  g.fillRect(0, 0, SPR, SPR);
  return c;
}
/** Cuánto brilla cada ingrediente (0-1): salsas/cremosos mojados, fritos medios, secos casi nada. */
const WET: Record<string, number> = {
  hogao: 0.2,
  bolonesa: 0.18,
  aguacate: 0.14,
  "papa-criolla": 0.13,
  spaghetti: 0.12,
  tocineta: 0.1,
  chicharron: 0.1,
  "chicharron-crocante": 0.1,
  "papa-francesa": 0.09,
  "pollo-crispy": 0.09,
  nuggets: 0.09,
  "nuggets-pina": 0.11,
  parmesano: 0.04,
  perejil: 0.05,
  maicitos: 0.07,
  champinon: 0.1,
};
const wetDe = (id: string) => WET[id] ?? 0.14;

/** Color DOMINANTE de un sprite: media ponderada por SATURACIÓN² sobre TODA la región opaca. El
 *  velo ámbar del horneado es de baja saturación → pesa casi nada, así el burst sale del color real
 *  de la comida (Fruit Ninja). Antes era media aritmética del centro → todo tiraba a ámbar uniforme. */
function muestrearColor(off: Off): string {
  try {
    const g = off.getContext("2d")!;
    const S = off.width;
    const d = g.getImageData(0, 0, S, S).data;
    let r = 0;
    let gr = 0;
    let b = 0;
    let wsum = 0;
    for (let i = 0; i < d.length; i += 8) {
      if (d[i + 3] < 180) continue;
      const R = d[i];
      const G = d[i + 1];
      const B = d[i + 2];
      const mx = Math.max(R, G, B);
      const mn = Math.min(R, G, B);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const w = 0.12 + sat * sat; // el gris/ámbar de baja saturación apenas cuenta
      r += R * w;
      gr += G * w;
      b += B * w;
      wsum += w;
    }
    if (!wsum) return "#F2A516";
    return `rgb(${Math.round(r / wsum)},${Math.round(gr / wsum)},${Math.round(b / wsum)})`;
  } catch {
    return "#F2A516";
  }
}

/* =========================================================================
   Tipos del juego (view puro)
   ========================================================================= */
type Vuelo = {
  ing: Ingrediente;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  bounces: number;
  sc: number; // escala actual (interpola de la carta al reposo — sin salto)
  scT: number; // escala objetivo (la de reposo según categoría)
};
/** EL FIDEO MESERO — una hebra viva que trae/saca comida entre la carta y la caja.
 *  hx/hy = posición de la CABEZA gobernada por muelle (persigue al objetivo con lag → whip). */
type Fideo = {
  ing: Ingrediente;
  tx: number; // objetivo (la carta)
  ty: number;
  t0: number;
  dir: "traer" | "sacar";
  off: number; // desplazamiento del ancla (hebras concurrentes)
  drop: number; // [-1,1] dónde suelta sobre la caja (dispersa el montón)
  seed: number;
  sx: number; // posición de la cabeza al ARRANCAR (la mascota donde estaba) — no el centro de la caja
  sy: number;
  haxf: number; // ancla del hogar desde el que sale (fracción de boxW/boxH)
  hayf: number;
  grabbed?: boolean; // ya sonó el agarre
  hx?: number; // muelle de la cabeza (init al primer frame)
  hy?: number;
  hvx?: number;
  hvy?: number;
  ctrl?: CtrlFideo; // memoria del cuerpo (muelles en cascada)
};
/** Item asentado en la caja. fx/fy = posición FÍSICA (fracción de boxW/boxH, coords locales de la
 *  caja); ty = y de reposo objetivo (el item se asienta hacia ella con lerp); r = radio de colisión. */
type PilaItem = { id: string; fx: number; fxT: number; fy: number; ty: number; rot: number; s: number; r: number; land: number; depth: number };
type Puff = { x: number; y: number; life: number; max: number; r: number; tipo: "vapor" | "polvo" };
type Pop = { x: number; y: number; life: number; texto: string; gratis: boolean };
type Chispa = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number };
type Part = { x: number; y: number; vx: number; vy: number; life: number; r: number; color: string };
type Mancha = { fx: number; fy: number; life: number; r: number };
type Trail = { x: number; y: number; life: number };

// duraciones del fideo (frames a ~60fps)
const F_EXT = 15;
const F_GRAB = 6;
const F_CARRY = 20;
const F_SUBIR = 10;
const F_LLEVAR = 20;

/* =========================================================================
   ICONOS SVG propios del shell — CERO emoji de sistema (mandato de marca).
   stroke=currentColor → heredan el color del botón (espresso). Trazo 1.7.
   ========================================================================= */
const IcoSonido = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 6a8 8 0 0 1 0 12" />
  </svg>
);
const IcoMute = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="m17 9 5 6" />
    <path d="m22 9-5 6" />
  </svg>
);
const IcoRayo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);
const IcoLuna = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const IcoCompartir = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 15V3" />
    <path d="m8 7 4-4 4 4" />
    <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
  </svg>
);
/** Volver al menú del sitio (solo en modo web, cuando el juego vive como overlay). */
const IcoVolver = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
/** Sello de lacre con swirl de fideo — EMPLATAR = SELLAR la caja (encadena con el cierre origami). */
const IcoSello = () => (
  <svg className="emp-cta__sello" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M15 10a3.2 3.2 0 1 0 .4 3.2" />
  </svg>
);

export default function EmplataGame(props: {
  mesa: number;
  negocio: string;
  abierto: boolean;
  impuestoPct: number;
  incluidos: number;
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  onModoRapido: () => void;
  /** "qr" = mesa por QR (flujo original). "web" = el menú principal del sitio: pide servicio+contacto. */
  canal?: "qr" | "web";
  numMesas?: number; // para el selector de mesa en modo web
  onSalir?: () => void; // cerrar el overlay y volver al sitio (solo modo web)
  costoDomicilio?: number; // se cobra aparte cuando el servicio es a domicilio
  pedidoMinimo?: number; // mínimo para domicilio; bloquea el sellado
  /** Enredo insignia con el que arrancar la caja ya emplatada (desde la carta). */
  precargar?: { baseId: string; proteinaId: string; toppingIds: string[] } | null;
}) {
  const { mesa, negocio, abierto, impuestoPct, incluidos, bases, proteinas, toppings } = props;
  const canal = props.canal ?? "qr";
  const esWeb = canal === "web";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const s = useSonido();

  // ------- selección (React para la barra DOM; refs espejo para el loop) -------
  /**
   * ARRANQUE HONESTO: sin base elegida. Antes se pre-elegía la primera base disponible
   * ANTES de que el cliente tocara nada, y de ahí salían los tres síntomas que el
   * "primer servicio" automático venía a tapar: la barra ya cobraba $20.412, la carta
   * salía con glow y palomita, y la pestaña con su punto de completado. Se corta la raíz.
   * Todo el camino ya está blindado para "" (precios.ts usa `base?.precio ?? 0`, el CTA
   * sale disabled, el aviso pide `baseId &&`, el ticket cae a "").
   */
  const [baseId, setBaseId] = useState<string>("");
  const [proteinaIds, setProteinaIds] = useState<string[]>([]); // N proteínas, sin tope
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<{ id: string; total: number } | null>(null);
  const [estado, setEstado] = useState<EstadoPedido>("recibido");
  // ------- modo WEB: servicio + contacto (se piden al EMPLATAR, no antes: primero se juega) -------
  const [pidiendoDatos, setPidiendoDatos] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [tipoSel, setTipoSel] = useState<TipoServicio>("domicilio");
  const [mesaSel, setMesaSel] = useState(1);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");

  const sel = useRef({ baseId: "", proteinaIds: [] as string[], toppingIds: [] as string[], tab: 0 as 0 | 1 | 2 });
  useEffect(() => {
    sel.current = { baseId, proteinaIds, toppingIds, tab };
  }, [baseId, proteinaIds, toppingIds, tab]);

  // W4: la escena NO se desmonta al pedir. faseRef gobierna el loop; estadoRef lo lee sin re-render.
  const faseRef = useRef<"arma" | "espera">("arma");
  const estadoRef = useRef<EstadoPedido>("recibido");
  const estadoAnimRef = useRef<{ last: EstadoPedido; campana: boolean }>({ last: "recibido", campana: false });
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  /**
   * FIRMA DEL MENÚ — blindaje contra el parpadeo.
   *
   * El horneado de sprites y el bucle de render dependían de las ARRAYS de ingredientes.
   * Cualquier llamador que las filtrara durante su render (`bases.filter(...)` en el JSX)
   * les daba identidad nueva en cada re-render → los efectos se desmontaban y la escena
   * se re-horneaba entera, varias veces por segundo. Ahora dependen de esta firma: solo
   * cambia cuando cambia el menú DE VERDAD (alta/baja, agotado, precio).
   */
  const menuSig = useMemo(
    () =>
      [...bases, ...proteinas, ...toppings]
        .map((i) => `${i.id}:${i.activo ? 1 : 0}${i.agotado ? "x" : ""}:${i.precio}`)
        .join("|"),
    [bases, proteinas, toppings],
  );

  // ------- precio (espejo de crearPedido, vía lib/precios) -------
  const all = [...bases, ...proteinas, ...toppings];
  const find = (id: string) => all.find((i) => i.id === id);
  const tops = toppingIds.map(find).filter(Boolean) as Ingrediente[];
  // En QR el servicio es siempre "mesa" (sin domicilio); en web depende de la hoja final.
  const tipoActual: TipoServicio = esWeb ? tipoSel : "mesa";
  const { subtotal, impuesto, domicilio, total } = calcularTotales({
    base: find(baseId),
    proteinas: proteinaIds.map(find),
    toppings: tops,
    impuestoPct,
    tipo: tipoActual,
    costoDomicilio: props.costoDomicilio,
    incluidos,
  });
  const faltaMin = faltaParaMinimo(subtotal, tipoActual, props.pedidoMinimo);
  // La barra de abajo muestra LA COMIDA. El envío aparece en la hoja final, cuando el
  // cliente ya eligió domicilio: cobrarlo antes de que lo pida se lee como sorpresa.
  const totalComida = subtotal + impuesto;
  // Precio de entrada de la carta. Guarda obligatoria: Math.min() sin argumentos es
  // Infinity y formatCOP imprimiría "$∞" (estado alcanzable si todo está agotado).
  const basesDispo = bases.filter((b) => !b.agotado);
  const desdeBase = basesDispo.length
    ? formatCOP(Math.min(...basesDispo.map((b) => b.precio)))
    : null;

  // ------- mundo del juego (refs, cero re-render) -------
  const world = useRef({
    sprites: new Map<string, CanvasImageSource>(), // Off procedural o Image de IA (drawImage acepta ambos)
    glaze: new Map<string, Off>(), // medialuna especular ↖ por ingrediente (barniz húmedo)
    colores: new Map<string, string>(), // color dominante por ingrediente (partículas)
    vuelos: [] as Vuelo[],
    fideos: [] as Fideo[],
    fideoN: 0,
    pila: [] as PilaItem[],
    puffs: [] as Puff[],
    pops: [] as Pop[],
    chispas: [] as Chispa[],
    parts: [] as Part[], // partículas del color de la comida al aterrizar (Fruit Ninja)
    manchas: [] as Mancha[], // micro-manchas en el kraft del suelo (multiply)
    trail: [] as Trail[], // rastro dorado del pulgar al arrastrar la bandeja
    trayScroll: 0,
    trayVel: 0,
    boxSquash: 0, // 0..1 al aterrizar algo
    fold: 0, // 0 abierto → 1 plegado (confirmar)
    folding: false,
    resettle: false, // el montón debe reacomodarse (cambió la cama o se sacó algo)
    selloHecho: false,
    hitStop: 0, // segundos de congelación al aterrizar el sello (golpe de juego de pelea)
    selloScale: 0, // muelle de escala del sello (cae 1.7→1 con overshoot)
    selloScaleV: 0,
    selloRot: 0, // rotación aleatoria del sello (±6°)
    ondas: [] as { r: number; life: number }[], // anillos de la onda de impacto del sello
    flash: { r: 0, g: 0, b: 0, life: 0 }, // tinte de escena breve al elegir (reacción por sabor)
    shake: 0, // sacudida de escena (crocante)
    reactMode: -1, // modo de reacción de la mascota (-1 = ninguno)
    reactT: 0,
    termoV: { cro: 0, cre: 0, fre: 0, dul: 0 }, // termómetro suavizado (las barras crecen animadas)
    combo: 0,
    comboT: -9999,
    lastTab: 0,
    tabT: 0,
    lastAct: 0,
    pressed: "",
    bg: null as Off | null, // fondo horneado (crema+luz+mostrador+grano) por resize
    vig: null as Off | null, // viñeta + velo cálido cacheados por resize
    dotSprite: null as Off | null, // partícula de vapor horneada (dot suave)
    kraftPat: null as CanvasPattern | null, // textura de cartón (fibra + corrugado)
    stamp: null as Off | null, // sello "recién hecho" horneado
    frontBand: null as Off | null, // banda frontal ESTÁTICA horneada (perf: drawImage vs patrón/frame)
    fbMeta: null as { left: number; top: number; w: number; h: number } | null,
    entered: false, // one-shot del squash de entrada de la caja
    espT: 0, // 0→1: transición de la caja al retirarse en la espera (deja sitio al mesero)
    tiltX: 0, // luz interactiva: inclinación del teléfono suavizada (−1..1)
    tiltY: 0,
    // MASCOTA: el fideo SIEMPRE presente, con hogar fijo (detrás de la caja, a un lado) y
    // muchos modos de movimiento aleatorios. hx/hy = cabeza gobernada por muelle.
    masc: {
      hx: 0,
      hy: 0,
      hvx: 0,
      hvy: 0,
      mode: 0,
      modeT: 0,
      dur: 90,
      pupil: 0.4,
      home: 0, // índice en HOMES (se reubica tras cada agarre y de vez en cuando)
      init: false,
      ctrl: nuevoCtrl(),
    },
    t: 0,
    ts: 0, // reloj en SEGUNDOS (wd.t está en frames-a-60): la vida no puede depender del framerate
    dt: 1 / 60,
    df: 1,
  });

  // hornear sprites al montar (y si cambia el catálogo)
  useEffect(() => {
    const m = world.current.sprites;
    const col = world.current.colores;
    m.clear();
    col.clear();
    const gz = world.current.glaze;
    gz.clear();
    for (const ing of all) {
      const spr = bakeSprite(ing);
      m.set(ing.id, spr);
      col.set(ing.id, muestrearColor(spr));
      gz.set(ing.id, bakeGlaze(spr));
    }
    // ASSETS DE COMIDA (IA plana en /public/food/{id}.webp) — carga DIFERIDA tras el procedural:
    // el procedural es el placeholder instantáneo (LCP intacto); al llegar el asset reemplaza el
    // sprite y re-muestrea el color, y TODOS los drawImage lo usan sin cambios. Si el asset no
    // existe (404), onload no dispara → se queda el procedural. Rollout incremental sin riesgo.
    for (const ing of all) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        world.current.sprites.set(ing.id, img);
        world.current.glaze.set(ing.id, bakeGlaze(img)); // re-hornea el barniz con el asset real
        try {
          const c = document.createElement("canvas");
          c.width = 64;
          c.height = 64;
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0, 64, 64);
          world.current.colores.set(ing.id, muestrearColor(c));
        } catch {
          /* mantener color procedural */
        }
      };
      img.src = `/food/${ing.id}.webp`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuSig]);

  // ------- acciones -------
  /** Despacha al FIDEO MESERO: sale de la caja hacia la carta (cx,cy). */
  const despachar = useCallback(
    (ing: Ingrediente, cx: number, cy: number) => {
      s.ruido(0.05, 0.05, 1600);
      s.tone(240, 0.09, "sine", 0.05, 640); // latigazo hacia arriba
      if (navigator.vibrate) navigator.vibrate(10);
      const wd = world.current;
      const m = wd.masc;
      const h = HOMES[m.home];
      wd.fideos.push({
        ing,
        tx: cx,
        ty: cy,
        t0: wd.t,
        dir: "traer",
        off: ((wd.fideoN++ % 3) - 1) * 26,
        drop: (Math.random() - 0.5) * 2,
        seed: Math.random() * 10,
        sx: m.init ? m.hx : cx, // ARRANCA donde está la mascota ahora (no el centro de la caja)
        sy: m.init ? m.hy : cy - 80,
        haxf: h.axf,
        hayf: h.ayf,
      });
      // reubica la mascota → el SIGUIENTE agarre nacerá en otro lugar (lado distinto o por arriba)
      m.home = otroHome(m.home);
      m.modeT = wd.t;
    },
    [s],
  );

  /** El fideo SACA un ingrediente de la caja y lo devuelve a su plato (parte visual; el estado lo
   *  cambia quien llama). Reusado por quitar-topping y deseleccionar una proteína. */
  const sacarDeCaja = useCallback(
    (ing: Ingrediente, cx: number, cy: number) => {
      const wd = world.current;
      const mm = wd.masc;
      const hh = HOMES[mm.home];
      wd.pila = wd.pila.filter((p) => p.id !== ing.id);
      wd.resettle = true; // el nido se recompone y los demás fluyen al hueco
      wd.fideos.push({
        ing,
        tx: cx,
        ty: cy,
        t0: wd.t,
        dir: "sacar",
        off: ((wd.fideoN++ % 3) - 1) * 22,
        drop: 0,
        seed: Math.random() * 10,
        sx: mm.init ? mm.hx : cx,
        sy: mm.init ? mm.hy : cy - 80,
        haxf: hh.axf,
        hayf: hh.ayf,
      });
      mm.home = otroHome(mm.home);
      mm.modeT = wd.t;
      s.ruido(0.05, 0.04, 1400);
    },
    [s],
  );

  const tapIngrediente = useCallback(
    (ing: Ingrediente, cx: number, cy: number) => {
      if (ing.agotado || world.current.folding) {
        if (ing.agotado && !world.current.folding) {
          s.tone(150, 0.08, "sine", 0.05); // "nope" grave: agotado ya no es un tap muerto silencioso
          s.tone(110, 0.1, "sine", 0.04, undefined, 0.03);
        }
        return;
      }
      const cat = ing.categoria;
      if (cat === "base") {
        if (sel.current.baseId === ing.id) {
          s.tone(560, 0.05, "sine", 0.04); // ya elegida: acuse suave, no silencio
          return;
        }
        setBaseId(ing.id);
        world.current.pila = world.current.pila.filter((p) => {
          const it = find(p.id);
          return it?.categoria !== "base";
        });
        despachar(ing, cx, cy);
      } else if (cat === "proteina") {
        // multi-select SIN límite: las proteínas que quieras
        if (sel.current.proteinaIds.includes(ing.id)) {
          setProteinaIds((prev) => prev.filter((p) => p !== ing.id));
          sacarDeCaja(ing, cx, cy); // el fideo la saca y la devuelve a su plato
          return;
        }
        setProteinaIds((prev) => [...prev, ing.id]);
        despachar(ing, cx, cy);
      } else {
        if (sel.current.toppingIds.includes(ing.id)) {
          setToppingIds((prev) => prev.filter((t) => t !== ing.id));
          sacarDeCaja(ing, cx, cy); // el fideo lo saca y lo devuelve a su plato
          return;
        }
        setToppingIds((prev) => [...prev, ing.id]);
        despachar(ing, cx, cy);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [despachar, sacarDeCaja, s],
  );

  /** Envía de verdad: pliega la caja y manda el pedido por el flujo existente (canal según modo). */
  const enviarAhora = useCallback(async () => {
    if (enviando || world.current.folding) return;
    setErrorEnvio(null);
    setPidiendoDatos(false);
    setEnviando(true);
    world.current.folding = true;
    s.confirmar();
    if (navigator.vibrate) navigator.vibrate([18, 40, 24]);
    await new Promise((r) => setTimeout(r, 950)); // la caja se pliega en el canvas
    try {
      const r = await enviarPedido({
        baseId,
        proteinaId: proteinaIds[0] ?? "", // retro-compat; el array manda
        proteinaIds, // N proteínas, sin límite
        toppingIds,
        canal,
        tipo: esWeb ? tipoSel : "mesa",
        mesa: esWeb ? (tipoSel === "mesa" ? mesaSel : undefined) : mesa,
        cliente: esWeb && tipoSel !== "mesa" ? cliente.trim() || undefined : undefined,
        telefono: esWeb && tipoSel === "domicilio" ? telefono.trim() || undefined : undefined,
      });
      // El cerebro puede rechazar (p. ej. pedido mínimo): la caja se vuelve a abrir
      // y el aviso se muestra en la hoja, no se pierde en silencio.
      if (!r.ok) {
        world.current.folding = false;
        world.current.fold = 0;
        world.current.selloHecho = false;
        setErrorEnvio(r.error);
        setPidiendoDatos(esWeb);
        setEnviando(false);
        return;
      }
      setPedido({ id: r.id, total: r.total });
      setEstado(r.estado as EstadoPedido);
      estadoRef.current = r.estado as EstadoPedido;
      estadoAnimRef.current = { last: r.estado as EstadoPedido, campana: false };
      faseRef.current = "espera"; // el canvas NO se desmonta: pasa a teatro de espera
    } catch {
      world.current.folding = false;
      world.current.fold = 0;
      world.current.selloHecho = false;
      setErrorEnvio("No pudimos enviar el pedido. Intenta otra vez.");
      setPidiendoDatos(esWeb);
    }
    setEnviando(false);
  }, [enviando, baseId, proteinaIds, toppingIds, canal, esWeb, tipoSel, mesaSel, cliente, telefono, mesa, s]);

  /**
   * PRIMER SERVICIO. Dos casos, un mismo gesto: el fideo trae la comida a la caja.
   *  · con `precargar` (llegaste desde un enredo insignia): sirve el plato completo en cascada
   *  · sin precarga: sirve la base por defecto — antes la caja se veía VACÍA mientras la barra
   *    ya cobraba $20.412 y la carta salía marcada. Ahora lo que cobras está adentro.
   */
  const servido = useRef(false);
  useEffect(() => {
    const cv = canvasRef.current;
    if (servido.current || !cv) return;
    servido.current = true;
    const p = props.precargar;
    const ids = p
      ? [p.baseId, p.proteinaId, ...(p.toppingIds ?? [])]
      : baseId
        ? [baseId]
        : [];
    const ings = ids.map(find).filter(Boolean) as Ingrediente[];
    if (!ings.length) return;
    if (p) {
      setBaseId(p.baseId);
      setProteinaIds(p.proteinaId ? [p.proteinaId] : []);
      setToppingIds(p.toppingIds ?? []);
    }
    const W = cv.clientWidth || window.innerWidth;
    const H = cv.clientHeight || window.innerHeight;
    const timers = ings.map((ing, i) =>
      setTimeout(
        () => despachar(ing, W * (0.26 + 0.16 * (i % 3)), H * 0.66),
        520 + i * 320, // deja respirar la entrada de la caja antes del primer plato
      ),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** EMPLATAR: en QR manda directo; en el menú WEB pide antes servicio + contacto (se juega primero). */
  const confirmar = useCallback(() => {
    if (!abierto || enviando || !baseId || world.current.folding) return;
    if (esWeb) {
      setPidiendoDatos(true);
      return;
    }
    void enviarAhora();
  }, [abierto, enviando, baseId, esWeb, enviarAhora]);

  useEffect(() => {
    if (!pedido) return;
    const t = setInterval(async () => {
      const r = await estadoPedido(pedido.id);
      if (r?.estado) setEstado(r.estado as EstadoPedido);
    }, 5000);
    return () => clearInterval(t);
  }, [pedido]);

  /* =======================================================================
     EL LOOP — dibuja la cocina, la caja, la bandeja; integra física y juice.
     ======================================================================= */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 0;
    let H = 0;

    // ---------- geometría de la escena ----------
    /**
     * LA ESCENA, A LA MEDIDA DE LA PANTALLA.
     *
     * El juego se calibró a ~390×844 (una mano) y todos los tamaños eran px fijos: en un
     * portátil la caja topaba en 300px sobre un lienzo de 1440 y sobraba medio metro de
     * piso vacío — se leía como una app de teléfono estirada en una pared. `U` escala la
     * escena entera. Manda la ALTURA, que es lo que de verdad escasea en horizontal.
     */
    const geo = () => {
      const U = clamp(Math.min(W / 390, H / 700), 1, 2.2);
      const ancho = W >= 820; // tablet/desktop: hay sitio de sobra a los lados
      const boxW = Math.min(W * (ancho ? 0.42 : 0.66), CAJA_BASE * U);
      const boxH = boxW * 0.78;
      const boxX = W / 2;
      const boxY = H * (ancho ? 0.335 : 0.32);
      const trayY = H * (ancho ? 0.6 : 0.555); // pestañas
      const cardW = CARTA_W * U;
      const cardH = CARTA_H * U;
      const cardY = trayY + 34 * U + cardH / 2; // fila de cartas (sin solapar pestañas)
      /* LA CAJA SE APOYA EN LA MESA. El canto inferior real de la caja es la banda frontal
         (boxY + 0.39·boxH) y el horizonte era `H * 0.42`, una constante que solo conocía
         bakeBg: una depende del ANCHO (vía boxW) y la otra solo del ALTO, así que su
         relación derivaba libre con el tamaño y la caja acababa flotando sobre la pared.
         Ahora el horizonte se coloca un mordisco FIJO en unidades de caja por encima del
         canto: 12% de boxH en cualquier pantalla. El clamp es solo raíl de seguridad para
         relaciones de aspecto extremas. */
      const baseY = boxY + boxH * 0.39;
      const woodY = clamp(baseY - boxH * 0.12, H * 0.3, H * 0.46);
      return { U, boxW, boxH, boxX, boxY, baseY, woodY, trayY, cardY, cardW, cardH };
    };

    /**
     * LAS PESTAÑAS, UNA SOLA VEZ. El dibujo ya escalaba por U pero el hit-test seguía en
     * píxeles crudos (8 y 128): en una tablet la píldora se pinta en un sitio y se toca en
     * otro — en iPad el 63% izquierdo de "LA BASE" era sordo. Y `setTab` solo se llama desde
     * ese hit-test: si falla, la pestaña queda INALCANZABLE (no hay botón DOM de respaldo).
     * Las bandas táctiles (−26U..+24U) son a propósito más altas que el dibujo (−22U..+18U).
     */
    const tabsGeo = () => {
      const { U, trayY } = geo();
      const tw = Math.min(W / 3 - 8 * U, 128 * U);
      return {
        U,
        trayY,
        tw,
        th: 40 * U,
        tx: (k: number) => W / 2 + (k - 1) * (tw + 8 * U),
        top: trayY - 26 * U,
        bot: trayY + 24 * U,
      };
    };

    let dpr = 1;
    let lastT = 0; // timestamp del rAF anterior (reloj real, no contador de frames)
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Tipografía de marca: resolver ya, y re-resolver cuando las webfonts terminen de cargar.
    resolveFonts();
    const fdoc = document as unknown as { fonts?: { ready?: Promise<unknown> } };
    if (fdoc.fonts?.ready) {
      fdoc.fonts.ready.then(() => {
        fontsResolved = false;
        resolveFonts();
        bakeFrontBand(); // re-hornear con la fuente de marca ya cargada (wordmark/sello)
      });
    }

    // ---- dot de vapor horneado (una vez): reemplaza createRadialGradient por puff/frame ----
    const bakeDot = () => {
      const c = document.createElement("canvas");
      c.width = 48;
      c.height = 48;
      const g = c.getContext("2d")!;
      const rad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      rad.addColorStop(0, "rgba(255,250,240,0.9)");
      rad.addColorStop(1, "rgba(255,250,240,0)");
      g.fillStyle = rad;
      g.beginPath();
      g.arc(24, 24, 24, 0, TAU);
      g.fill();
      world.current.dotSprite = c;
    };

    // ---- TEXTURA de CARTÓN kraft (fibra + corrugado) horneada como patrón tileable ----
    const bakeKraft = () => {
      const T = 72;
      const c = document.createElement("canvas");
      c.width = T;
      c.height = T;
      const g = c.getContext("2d")!;
      // fibra: motas cálidas claras y oscuras (papel reciclado)
      const img = g.createImageData(T, T);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 2 - 1) * 26;
        // mota ocasional oscura (impureza del cartón)
        const mota = Math.random() < 0.015 ? -40 : 0;
        img.data[i] = 200 + v + mota;
        img.data[i + 1] = 150 + v * 0.7 + mota;
        img.data[i + 2] = 90 + v * 0.4 + mota;
        img.data[i + 3] = 40; // el patrón va tenue sobre el color base
      }
      g.putImageData(img, 0, 0);
      // corrugado sutil: líneas verticales apenas visibles (la flauta del cartón)
      g.globalAlpha = 0.05;
      g.strokeStyle = "#5A3A18";
      g.lineWidth = 1;
      for (let x = 3; x < T; x += 6) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, T);
        g.stroke();
      }
      g.globalAlpha = 0.04;
      g.strokeStyle = "#FFE8C0";
      for (let x = 5; x < T; x += 6) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, T);
        g.stroke();
      }
      g.globalAlpha = 1;
      world.current.kraftPat = ctx.createPattern(c, "repeat");
    };

    // ---- SELLO "RECIÉN HECHO" horneado (tinta ámbar desgastada, ligeramente rotado) ----
    const bakeStamp = () => {
      const S = 120;
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S;
      const g = c.getContext("2d")!;
      g.translate(S / 2, S / 2);
      g.rotate(-0.18);
      g.strokeStyle = "rgba(150,60,30,0.72)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, 50, 0, TAU);
      g.stroke();
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, 44, 0, TAU);
      g.stroke();
      g.fillStyle = "rgba(150,60,30,0.72)";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `800 17px ${FONT_DISPLAY}`;
      g.fillText("RECIÉN", 0, -9);
      g.fillText("HECHO", 0, 11);
      // estrellitas a los lados
      g.font = `800 12px ${FONT_DISPLAY}`;
      g.fillText("★", -34, 0);
      g.fillText("★", 34, 0);
      // desgaste: borra motas al azar (tinta imperfecta de sello)
      g.globalCompositeOperation = "destination-out";
      for (let k = 0; k < 60; k++) {
        g.globalAlpha = 0.5 + Math.random() * 0.5;
        g.beginPath();
        g.arc((Math.random() - 0.5) * 110, (Math.random() - 0.5) * 110, 1 + Math.random() * 2.5, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      world.current.stamp = c;
    };

    // ---- BANDA FRONTAL horneada (perf): todo lo estático de la banda (kraft+textura+canto
    // corrugado+motivo+wordmark+sello) en UN sprite → drawImage/frame en vez de patrón+arcos+texto.
    const bakeFrontBand = () => {
      const { boxW, boxH } = geo(); // MISMA geometría que la escena (si no, la banda no calza)
      if (boxW < 10) return;
      const eh = boxH * 0.028;
      const left = -boxW / 2 - 3;
      const top = boxH * 0.05 - eh - 4;
      const bw = boxW + 6;
      const bh = boxH * 0.39 + 4 - top;
      const SS = 2; // supersampling → nítido al escalar con foco
      const cv = document.createElement("canvas");
      cv.width = Math.round(bw * SS);
      cv.height = Math.round(bh * SS);
      const g = cv.getContext("2d")!;
      g.scale(SS, SS);
      g.translate(-left, -top); // ahora g usa las MISMAS coords box-local que el dibujo procedural

      // banda kraft + textura de cartón
      g.beginPath();
      g.roundRect(-boxW / 2, boxH * 0.05, boxW, boxH * 0.34, 9);
      const grad = g.createLinearGradient(-boxW / 2, boxH * 0.05, boxW / 2, boxH * 0.39);
      grad.addColorStop(0, "rgba(224,181,116,1)");
      grad.addColorStop(0.5, "#C69A5B");
      grad.addColorStop(1, "#A87B42");
      g.fillStyle = grad;
      g.fill();
      const kp = world.current.kraftPat;
      if (kp) {
        g.fillStyle = kp;
        g.fill();
      }
      // sheen
      const sheen = g.createLinearGradient(-boxW / 2, boxH * 0.05, boxW / 2, boxH * 0.4);
      sheen.addColorStop(0, "rgba(255,240,210,0.4)");
      sheen.addColorStop(0.45, "rgba(255,240,210,0)");
      g.fillStyle = sheen;
      g.beginPath();
      g.roundRect(-boxW / 2, boxH * 0.05, boxW, boxH * 0.34, 9);
      g.fill();
      // canto de cartón corrugado (la flauta)
      const edgeY = boxH * 0.05;
      g.save();
      g.beginPath();
      g.rect(-boxW / 2 + 6, edgeY - eh, boxW - 12, eh + 1);
      g.clip();
      const edgeG = g.createLinearGradient(0, edgeY - eh, 0, edgeY);
      edgeG.addColorStop(0, "#D8B27A");
      edgeG.addColorStop(1, "#B98E52");
      g.fillStyle = edgeG;
      g.fillRect(-boxW / 2, edgeY - eh, boxW, eh + 1);
      g.strokeStyle = "rgba(90,58,24,0.38)";
      g.lineWidth = 1;
      g.beginPath();
      for (let fx = -boxW / 2; fx < boxW / 2; fx += 8) {
        g.moveTo(fx + 8, edgeY);
        g.arc(fx + 4, edgeY, 4, 0, Math.PI, false);
      }
      g.stroke();
      g.restore();
      // pliegue central
      g.strokeStyle = "rgba(90,58,24,0.14)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, boxH * 0.08);
      g.lineTo(0, boxH * 0.37);
      g.stroke();
      // motivo de fideos impreso
      g.strokeStyle = "rgba(120,80,40,0.12)";
      g.lineWidth = 2;
      g.lineCap = "round";
      for (const my of [boxH * 0.15, boxH * 0.31]) {
        g.beginPath();
        for (let mx = -boxW * 0.42; mx <= boxW * 0.42; mx += 5) {
          const yy = my + Math.sin(mx * 0.12) * 2.4;
          if (mx === -boxW * 0.42) g.moveTo(mx, yy);
          else g.lineTo(mx, yy);
        }
        g.stroke();
      }
      // wordmark letterpress
      g.font = fontD(11, 800);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(255,240,210,0.55)";
      g.fillText("P A P A G H E T T I", 0, boxH * 0.23 + 1);
      g.fillStyle = "rgba(90,58,24,0.9)";
      g.fillText("P A P A G H E T T I", 0, boxH * 0.23);
      // sello "recién hecho"
      if (world.current.stamp) {
        const ss = boxH * 0.19;
        g.globalAlpha = 0.9;
        g.drawImage(world.current.stamp, boxW * 0.3 - ss / 2, boxH * 0.32 - ss / 2, ss, ss);
        g.globalAlpha = 1;
      }
      world.current.frontBand = cv;
      world.current.fbMeta = { left, top, w: bw, h: bh };
    };

    // ---- ESCENARIO horneado: crema + pool de luz ↖ + mostrador con canto + veta + GRANO ----
    const bakeBg = () => {
      const c = document.createElement("canvas");
      c.width = Math.max(2, Math.round(W));
      c.height = Math.max(2, Math.round(H));
      const g = c.getContext("2d")!;
      const { woodY } = geo(); // el horizonte lo fija la CAJA (ver geo): así se apoya de verdad
      // pared crema
      g.fillStyle = "#F6E7CB";
      g.fillRect(0, 0, W, H);
      // remolinos kraft sutiles en la pared
      g.strokeStyle = "rgba(150,100,50,0.06)";
      g.lineWidth = 9;
      g.lineCap = "round";
      for (let yy = 20; yy < woodY; yy += 74) {
        for (let xx = 20; xx < W; xx += 96) {
          g.beginPath();
          g.arc(xx + (yy % 48), yy, 18, 0.4, 4.6);
          g.stroke();
        }
      }
      // pool de luz ↖ (la premisa lumínica, por fin visible)
      const luz = g.createRadialGradient(W * 0.3, H * 0.08, 20, W * 0.32, H * 0.16, H * 0.95);
      luz.addColorStop(0, "rgba(255,247,224,0.85)");
      luz.addColorStop(0.5, "rgba(255,236,200,0.18)");
      luz.addColorStop(1, "rgba(120,80,40,0.12)");
      g.fillStyle = luz;
      g.fillRect(0, 0, W, woodY);
      // ===== LA MESA (superficie de madera que RECEDE, no una pared) =====
      // plano de la mesa: más oscuro al fondo (bajo la sombra del muro) → cálido al frente
      const wood = g.createLinearGradient(0, woodY, 0, H);
      wood.addColorStop(0, "#5E3C1E");
      wood.addColorStop(0.08, "#7A5228");
      wood.addColorStop(0.5, "#6E4A24");
      wood.addColorStop(1, "#4A2D16");
      g.fillStyle = wood;
      g.fillRect(0, woodY, W, H - woodY);
      // sombra del MURO que cae sobre la mesa (ancla la pared arriba de la superficie)
      const muro = g.createLinearGradient(0, woodY, 0, woodY + 26);
      muro.addColorStop(0, "rgba(26,14,6,0.5)");
      muro.addColorStop(1, "rgba(26,14,6,0)");
      g.fillStyle = muro;
      g.fillRect(0, woodY, W, 26);
      // canto donde la pared toca la mesa (filo iluminado ↖)
      g.strokeStyle = "rgba(255,232,190,0.45)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, woodY - 0.5);
      g.lineTo(W, woodY - 0.5);
      g.stroke();
      // POOL de luz sobre la mesa donde se apoya la caja (la luz ↖ toca la superficie)
      const mesaLuz = g.createRadialGradient(W * 0.42, woodY + (H - woodY) * 0.34, 10, W * 0.5, woodY + (H - woodY) * 0.4, W * 0.7);
      mesaLuz.addColorStop(0, "rgba(255,226,170,0.22)");
      mesaLuz.addColorStop(1, "rgba(255,226,170,0)");
      g.fillStyle = mesaLuz;
      g.fillRect(0, woodY, W, H - woodY);
      // TABLONES en perspectiva: costuras verticales que convergen hacia un punto de fuga arriba
      const vpx = W * 0.5;
      const vpy = woodY - (H - woodY) * 1.6; // punto de fuga por encima de la mesa
      g.strokeStyle = "rgba(30,16,6,0.22)";
      g.lineWidth = 1.4;
      for (let k = -3; k <= 3; k++) {
        const xFront = W * 0.5 + k * W * 0.2;
        const xBack = vpx + (xFront - vpx) * ((woodY - vpy) / (H - vpy));
        g.beginPath();
        g.moveTo(xBack, woodY);
        g.lineTo(xFront, H);
        g.stroke();
        // filo iluminado a la izquierda de cada costura (relieve del tablón)
        g.strokeStyle = "rgba(255,230,190,0.12)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(xBack - 1.5, woodY);
        g.lineTo(xFront - 2, H);
        g.stroke();
        g.strokeStyle = "rgba(30,16,6,0.22)";
        g.lineWidth = 1.4;
      }
      // veta horizontal ondulada, MÁS DENSA al fondo (foreshortening de la superficie)
      g.strokeStyle = "rgba(30,16,6,0.14)";
      g.lineWidth = 1;
      for (let li = 1; li <= 8; li++) {
        const tt = Math.pow(li / 9, 1.7); // denso arriba (fondo), espaciado abajo (cerca)
        const base = woodY + (H - woodY) * tt;
        g.beginPath();
        for (let xx = 0; xx <= W; xx += 12) {
          const yy = base + Math.sin(xx * 0.025 + li * 1.7) * (2 + tt * 3);
          if (xx === 0) g.moveTo(xx, yy);
          else g.lineTo(xx, yy);
        }
        g.stroke();
      }
      // GRANO monocromo (dithering barato) → mata el banding en OLED. Horneado, 0/frame. (T5: tile 128px)
      const gn = 128;
      const nc = document.createElement("canvas");
      nc.width = gn;
      nc.height = gn;
      const ng = nc.getContext("2d")!;
      const img = ng.createImageData(gn, gn);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() * 2 - 1) * 128;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 10; // alpha ~0.04
      }
      ng.putImageData(img, 0, 0);
      const pat = g.createPattern(nc, "repeat");
      if (pat) {
        g.fillStyle = pat;
        g.fillRect(0, 0, W, H);
      }
      world.current.bg = c;
    };

    // ---- VIÑETA cacheada (descentrada hacia la luz ↖, más oscura abajo-derecha) ----
    const bakeVig = () => {
      const c = document.createElement("canvas");
      c.width = Math.max(2, Math.round(W));
      c.height = Math.max(2, Math.round(H));
      const g = c.getContext("2d")!;
      const vg = g.createRadialGradient(W * 0.34, H * 0.28, H * 0.2, W * 0.5, H * 0.6, H * 0.95);
      vg.addColorStop(0, "rgba(28,20,14,0)");
      vg.addColorStop(1, "rgba(28,20,14,0.32)");
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
      world.current.vig = c;
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      if (!world.current.dotSprite) bakeDot();
      if (!world.current.kraftPat) bakeKraft();
      if (!world.current.stamp) bakeStamp();
      bakeBg();
      bakeVig();
      bakeFrontBand();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);


    // Lo AGOTADO al final: no tiene por qué ocupar el mejor sitio de la bandeja (la
    // tocineta agotada salía tercera, delante de cosas que sí se pueden pedir).
    const ordenar = (l: Ingrediente[]) =>
      [...l].sort((a, b) => Number(!!a.agotado) - Number(!!b.agotado));
    const basesO = ordenar(bases);
    const proteinasO = ordenar(proteinas);
    const toppingsO = ordenar(toppings);
    const listaActiva = (): Ingrediente[] =>
      sel.current.tab === 0 ? basesO : sel.current.tab === 1 ? proteinasO : toppingsO;

    /** Radio de colisión (px) según categoría — la comida ocupa ~0.35 del sprite. */
    const radioDe = (cat: string, sc: number) => SPR * sc * 0.35;

    /**
     * EL NIDO SERVIBLE — coloca cada ingrediente en un SLOT determinista (rol + índice) formando
     * un MONTÍCULO: cama al fondo, héroe(s) de proteína montados sobre ella, toppings dispuestos por
     * ÁNGULO ÁUREO (Vogel) con keep-out de la cara del héroe y relajación de solapes. Da ESTRUCTURA
     * y forma apetitosa en vez de un apilado al azar. Solo corre al cambiar la composición (flag),
     * nunca por frame. Escribe fxT/ty/depth/rot/s (fx/fy fluyen hacia ellos con lerp en el dibujo).
     */
    const recomputeSlots = () => {
      const wd = world.current;
      const { boxW } = geo();
      const base = wd.pila.filter((p) => find(p.id)?.categoria === "base");
      const prot = wd.pila.filter((p) => find(p.id)?.categoria === "proteina");
      const tops = wd.pila.filter((p) => find(p.id)?.categoria === "topping");
      const seed = hash01((base[0]?.id ?? "b") + prot.map((p) => p.id).join("_"));
      const side = seed < 0.5 ? -1 : 1;
      const setR = (p: PilaItem, sc: number) => {
        p.s = sc;
        p.r = radioDe(find(p.id)?.categoria ?? "topping", sc) / boxW;
      };
      // CAMA: UN solo sprite de la base (los assets ya son una porción: un nido, un montón de
      // papas), grande y apoyado al frente como lecho. El relleno de la caja lo hace un COJÍN
      // cálido del color de la base bajo la comida (ver el bucle de dibujo), no copias
      // repetidas del sprite —eso se veía a repetición—.
      for (const p of base) {
        p.fxT = 0;
        p.ty = YB;
        p.depth = 0.55;
        p.rot = 0;
        setR(p, 1.9); // porción generosa: el nido/montón llena el ancho del lecho
      }
      // RANK por IDENTIDAD: la posición dependía del orden de PULSACIÓN (quitar un topping
      // movía a otro hasta 123 px). Anclando todo al índice del catálogo, "misma receta,
      // misma foto" vuelve a ser cierto.
      const RANKp = (id: string) => proteinas.findIndex((x) => x.id === id);
      const RANKt = (id: string) => toppings.findIndex((x) => x.id === id);
      // HÉROE(S): N proteínas (sin tope) repartidas en abanico frontal, jerárquicas — las
      // primeras del catálogo mayores y adelante, alternando profundidad para escalonar.
      const heroFaces: Array<{ fx: number; ty: number; rx: number; ry: number }> = [];
      const protOrd = [...prot].sort((a, b) => RANKp(a.id) - RANKp(b.id));
      const nP = protOrd.length;
      protOrd.forEach((p, i) => {
        let fx: number;
        let depth: number;
        let sc: number;
        let rot: number;
        if (nP === 1) {
          fx = side * 0.18;
          depth = 0.4;
          sc = 0.82;
          rot = side * 0.12;
        } else {
          const t = i / (nP - 1); // 0..1 a lo ancho
          fx = (t - 0.5) * Math.min(0.56, 0.28 + nP * 0.06); // el abanico se abre con N
          depth = 0.34 + (i % 2) * 0.16; // alterna cerca/lejos → escalonado, no fila plana
          sc = 0.82 - Math.min(i, 4) * 0.035; // las primeras un pelo mayores (jerarquía)
          rot = (i % 2 === 0 ? -1 : 1) * 0.12;
        }
        p.fxT = fx;
        p.ty = moundY(fx, depth) - 0.02;
        p.depth = depth;
        p.rot = rot;
        setR(p, sc);
        heroFaces.push({ fx, ty: p.ty, rx: p.r * 0.95, ry: p.r * 1.15 });
      });
      // TOPPINGS anclados por IDENTIDAD en TRESBOLILLO de 3 gradas (el ángulo áureo dependía
      // de N y del orden de tap → el "baile"). Cada topping tiene su sitio fijo; quitar otro
      // ya no lo mueve.
      const ANCLA_TOP: Record<string, [number, number]> = {
        // [fx, depth] — grada trasera (alta)
        maicitos: [0.05, 0.92],
        hogao: [-0.17, 0.92],
        perejil: [0.27, 0.92],
        // grada media
        "nuggets-pina": [-0.3, 0.58],
        "chicharron-crocante": [-0.01, 0.58],
        parmesano: [0.3, 0.58],
        // grada frontal (baja)
        aguacate: [-0.2, 0.24],
        tocineta: [0.19, 0.24],
      };
      const N = tops.length;
      for (const p of tops) {
        const a = ANCLA_TOP[p.id] ?? [0, 0.58];
        p.fxT = clamp(a[0], -FXLIM, FXLIM);
        p.depth = a[1];
        p.ty = moundY(p.fxT, p.depth);
        p.rot = (hash01(p.id + "r") - 0.5) * 0.26; // ±7.4° (era ±28.6°): no gira la luz horneada
        setR(p, 0.62);
      }
      // 1-2 toppings: slots frontales equilibrados (no un flanco vacío). Recalcula ty en la envolvente.
      const DUO: Array<[number, number]> = [[-0.2, 0.34], [0.21, 0.66]];
      if (N === 1) {
        const p0 = tops[0];
        p0.fxT = -0.03;
        p0.depth = 0.62;
        p0.ty = moundY(p0.fxT, p0.depth);
      } else if (N === 2) {
        const o = [...tops].sort((x, y) => RANKt(x.id) - RANKt(y.id));
        o.forEach((p0, i) => {
          p0.fxT = DUO[i][0];
          p0.depth = DUO[i][1];
          p0.ty = moundY(p0.fxT, p0.depth);
        });
      }
      // keep-out de la cara del héroe: un topping nunca sobre el rostro de la proteína
      for (const p0 of tops) {
        for (const hf of heroFaces) {
          const dfx = p0.fxT - hf.fx;
          const dty = p0.ty - hf.ty;
          const nd = (dfx / hf.rx) ** 2 + (dty / hf.ry) ** 2;
          if (nd < 1) {
            const push = (1 - Math.sqrt(Math.max(nd, 0.0001))) * 0.16 + 0.02;
            p0.fxT += (dfx >= 0 ? 1 : -1) * push;
            p0.ty += push * 0.45;
          }
        }
      }
      // relajación de solapes en ORDEN DE IDENTIDAD (determinista con cadenas de 3+ solapes)
      const mov = [...protOrd, ...[...tops].sort((a, b) => RANKt(a.id) - RANKt(b.id))];
      for (let iter = 0; iter < 2; iter++) {
        for (let a = 0; a < mov.length; a++) {
          for (let b = a + 1; b < mov.length; b++) {
            const pa = mov[a];
            const pb = mov[b];
            const dfx = pa.fxT - pb.fxT;
            const dty = pa.ty - pb.ty;
            const dist = Math.hypot(dfx, dty) || 0.0001;
            const min = (pa.r + pb.r) * 0.6; // 0.68→0.60: 32%→40% de solape, se funde
            if (dist < min) {
              const push = (min - dist) * 0.5;
              const ux = dfx / dist;
              const uy = dty / dist;
              pa.fxT += ux * push * 0.85; // esparce a los flancos (montículo), no torre
              pa.ty += uy * push * 0.25;
              pb.fxT -= ux * push * 0.85;
              pb.ty -= uy * push * 0.25;
            }
          }
        }
      }
      // MURO elíptico + SUELO: el clamp plano expulsaba los toppings al borde, donde el labio
      // frontal se los comía. Ahora el SPRITE ENTERO queda dentro del trapecio interior, y un
      // suelo duro impide que ningún borde entre en la sombra del labio.
      const FXMURO = (d: number) => 0.4 - 0.06 * d; // trapecio: 0.386 al frente, 0.34 al fondo
      const TY_SUELO = -0.085; // borde inferior de comida por ENCIMA del labio oscuro
      const TY_TECHO = -0.345; // nada supera la cúpula
      for (const p of mov) {
        const d = p.depth ?? 0.5;
        const half = (p.r ?? 0) + 0.05; // margen = radio + media loseta → el sprite entero cabe
        const lim = FXMURO(d) - half;
        if (Math.abs(p.fxT) > lim) p.fxT = Math.sign(p.fxT) * lim;
        p.ty = Math.min(p.ty, moundY(p.fxT, d) - 0.01); // re-asienta en la envolvente ancha
        p.ty = clamp(p.ty, TY_TECHO, TY_SUELO);
      }
    };

    /** Aterrizaje: el item se queda DONDE la física lo dejó (x real del vuelo) + squash + precio. */
    const aterrizar = (ing: Ingrediente, xScreen: number, energia = 1) => {
      const wd = world.current;
      const { boxW, boxH, boxX, boxY } = geo();
      const cat = ing.categoria;
      if (cat === "base") wd.pila = wd.pila.filter((p) => find(p.id)?.categoria !== "base"); // solo la base reemplaza a la base
      const sc = cat === "base" ? 1.2 : cat === "proteina" ? 0.8 : 0.58;
      const fxDrop = clamp((xScreen - boxX) / boxW, -FXLIM, FXLIM); // desde donde cayó → FLUYE a su slot
      wd.pila.push({ id: ing.id, fx: fxDrop, fxT: fxDrop, fy: YB - 0.05, ty: YB, rot: 0, s: sc, r: radioDe(cat, sc) / boxW, land: 1, depth: 0.5 });
      recomputeSlots(); // EL NIDO decide el lugar determinista por rol + índice
      const nuevo = wd.pila[wd.pila.length - 1];
      nuevo.fy = nuevo.ty - 0.05; // cae el último tramo a su slot (micro-asentamiento)
      const fx = nuevo.fxT;
      const ty = nuevo.ty;
      wd.boxSquash = 1;
      s.caida(ing, energia); // suena al aterrizar, con energía cinética de la caída
      if (!reduce)
        for (let k = 0; k < 3; k++)
          wd.puffs.push({
            x: geo().boxX + (Math.random() - 0.5) * 30,
            y: boxY - boxH * 0.2,
            life: 1,
            max: 60 + Math.random() * 30,
            r: 5 + Math.random() * 6,
            tipo: "vapor",
          });
      // BURST de partículas del color de la comida (Fruit Ninja) + micro-mancha en el kraft
      const col = wd.colores.get(ing.id) ?? "#F2A516";
      const nP = reduce ? 0 : 6 + Math.floor(energia * 5);
      const px0 = clamp(xScreen, boxX - boxW * 0.34, boxX + boxW * 0.34);
      const py0 = boxY + fx * 0 + ty * boxH * 0 - boxH * 0.14; // sobre la boca de la caja
      for (let k = 0; k < nP; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = 1.6 + Math.random() * 3.2 * (0.6 + energia);
        wd.parts.push({ x: px0, y: py0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, r: 1.6 + Math.random() * 2, color: col });
      }
      if (cat !== "base") wd.manchas.push({ fx, fy: ty, life: 1, r: radioDe(cat, sc) * 0.7 });
      const idxT = sel.current.toppingIds.indexOf(ing.id);
      const gratis = ing.categoria === "topping" && idxT >= 0 && idxT < incluidos;
      // los pops vivos suben para dejar sitio (nunca ilegibles apilados); el nuevo nace en el borde
      if (!reduce) for (const pv of wd.pops) pv.y -= 22;
      wd.pops.push({
        x: clamp(xScreen, boxX - boxW * 0.34, boxX + boxW * 0.34),
        y: boxY - boxH * 0.5,
        life: 1,
        texto: gratis ? "GRATIS" : ing.precio > 0 ? `+${formatCOP(ing.precio)}` : ing.nombre,
        gratis,
      });
      // seguidilla: emplatar rápido sube el tono (pequeña celebración musical)
      if (wd.t - wd.comboT < 110) wd.combo++;
      else wd.combo = 1;
      wd.comboT = wd.t;
      if (wd.combo >= 2) s.combo(wd.combo - 1); // seguidilla musical (pentatónica)
      if (wd.combo >= 3 && navigator.vibrate) navigator.vibrate(8);

      // ===== CADA INGREDIENTE SU CARÁCTER: la escena reacciona al rasgo dominante =====
      const esPrem = ing.tags?.includes("premium");
      const rasgo = rasgoDominante(ing);
      // tinte de escena breve (premium manda: destello dorado)
      const tinte = esPrem
        ? { r: 245, g: 200, b: 90 }
        : rasgo === "cro"
          ? { r: 230, g: 150, b: 40 } // ámbar cálido
          : rasgo === "fre"
            ? { r: 130, g: 180, b: 90 } // verde fresco
            : rasgo === "dul"
              ? { r: 235, g: 160, b: 185 } // rosa dulce
              : { r: 240, g: 224, b: 180 }; // crema cremoso
      wd.flash = reduce ? { r: 0, g: 0, b: 0, life: 0 } : { ...tinte, life: 1 };
      if (!reduce && (rasgo === "cro" || esPrem)) wd.shake = rasgo === "cro" ? 1 : 0.5; // crocante sacude
      // partículas temáticas EXTRA del color del rasgo (encima del burst del color de la comida)
      const tcol = `rgb(${tinte.r},${tinte.g},${tinte.b})`;
      const nX = reduce ? 0 : esPrem ? 10 : rasgo === "cro" ? 8 : 5;
      for (let k = 0; k < nX; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * (esPrem ? TAU : 2.2);
        const sp = 2 + Math.random() * 3.5;
        wd.parts.push({ x: px0, y: py0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 1, r: 1.4 + Math.random() * 1.8, color: tcol });
      }
      // el FIDEO reacciona: modo de gesto temático (crunch-nod / sniff / bounce / bow)
      wd.reactMode = esPrem ? 11 : rasgo === "cro" ? 8 : rasgo === "fre" ? 9 : 10;
      wd.reactT = wd.t;
    };

    // ---------- input: tap vs drag de bandeja ----------
    let downX = 0;
    let downY = 0;
    /**
     * EXCURSIÓN MÁXIMA desde el punto de contacto, no suma de temblores.
     * Antes se acumulaba `moved += |x - lastX|` y solo en X: (a) un barrido VERTICAL sobre
     * una carta la seleccionaba sin querer, y (b) un tap lento con pulso tembloroso sumaba
     * 8 px de jitter y se cancelaba sin ningún feedback. 10 px CSS, SIN escalar por U: el
     * dedo mide lo mismo en un teléfono que en una tablet.
     */
    let maxExc = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastMoveT = 0;

    /** Devuelve la carta bajo (x,y) — o null. */
    const cartaEn = (x: number, y: number): { ing: Ingrediente; cx: number } | null => {
      const { U, cardY, cardW, cardH } = geo();
      if (y < cardY - cardH / 2 - 6 * U || y > cardY + cardH / 2 + 6 * U) return null;
      const lista = listaActiva().filter((i) => i.activo);
      const step = cardW + 10 * U;
      const totalW = lista.length * step;
      const x0 = Math.max(14, (W - totalW) / 2) - world.current.trayScroll;
      for (let k = 0; k < lista.length; k++) {
        const cx = x0 + k * step + cardW / 2;
        if (Math.abs(x - cx) < step / 2) return { ing: lista[k], cx }; // step/2: sin franja muerta entre cartas
      }
      return null;
    };

    // ===== LUZ INTERACTIVA (tilt-to-relight): la "biblia de una luz" del dibujo se vuelve INTERACTIVA
    // — al inclinar el móvil, la luz ↖ se desplaza un poco y la sombra + un brillo cálido la siguen.
    // Subtil, dentro del concepto (no exagerado). iOS pide permiso en el primer toque. =====
    let tiltTX = 0;
    let tiltTY = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      const g = e.gamma ?? 0; // izq/der (−90..90)
      const bt = e.beta ?? 0; // adelante/atrás
      tiltTX = clamp(g / 28, -1, 1);
      tiltTY = clamp((bt - 45) / 28, -1, 1); // reposo ~45° (móvil sostenido en la mano)
    };
    let tiltOn = false;
    let tiltAsked = false; // si el usuario DENIEGA, no volver a preguntar en cada toque
    const setupTilt = () => {
      if (tiltOn || tiltAsked || reduce || typeof window === "undefined") return;
      const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (!DOE) return;
      if (typeof DOE.requestPermission === "function") {
        tiltAsked = true;
        DOE.requestPermission()
          .then((st) => {
            if (st === "granted") {
              window.addEventListener("deviceorientation", onOrient);
              tiltOn = true;
            }
          })
          .catch(() => {});
      } else {
        window.addEventListener("deviceorientation", onOrient);
        tiltOn = true;
      }
    };

    const onDown = (e: PointerEvent) => {
      s.unlock();
      setupTilt(); // activa la luz interactiva en el primer gesto (permiso iOS)
      // ANTES del guard de fase: si la fase cambia con el dedo abajo, el `return` se
      // llevaba el reset y `dragging` se quedaba pegado.
      dragging = false;
      world.current.trayVel = 0;
      if (faseRef.current !== "arma") return; // en espera la escena no recibe toques
      const r = canvas.getBoundingClientRect();
      downX = e.clientX - r.left;
      downY = e.clientY - r.top;
      lastX = downX;
      lastY = downY;
      lastMoveT = e.timeStamp;
      maxExc = 0;
      // El gate sale de la GEOMETRÍA de las cartas, no de un +40 a ojo: quedaban 16 px
      // muertos en el borde superior donde el gesto ni arrastraba ni tocaba.
      const g = geo();
      dragging = downY > g.cardY - g.cardH / 2 - 10 * g.U;
      world.current.lastAct = world.current.t;
      const c = cartaEn(downX, downY);
      world.current.pressed = c ? c.ing.id : "";
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!e.buttons) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      maxExc = Math.max(maxExc, Math.hypot(x - downX, y - downY));
      if (maxExc > 10) world.current.pressed = "";
      if (dragging) {
        world.current.trayScroll -= x - lastX;
        /* La velocidad se medía en px por EVENTO y se consumía como px por FRAME de 60:
           en un iPhone de 120 Hz el mismo gesto físico deslizaba la mitad. Ahora es px/s
           normalizados a un frame de 60, con tope (la inercia multiplica por 1/(1−0.92) =
           12.5×) y con media móvil para que un pico del stream no dispare un flick que
           nadie hizo. */
        const dtm = Math.max(8, e.timeStamp - lastMoveT);
        const vNueva = clamp((-(x - lastX) / dtm) * 16.67, -22, 22);
        world.current.trayVel = world.current.trayVel * 0.65 + vNueva * 0.35;
        lastMoveT = e.timeStamp;
        // rastro dorado del pulgar (Fruit Ninja) — solo si se mueve de verdad
        if (Math.abs(x - lastX) > 1.5) {
          const tr = world.current.trail;
          tr.push({ x, y: e.clientY - r.top, life: 1 });
          if (tr.length > 14) tr.shift();
        }
      }
      lastX = x;
      lastY = y;
    };
    const onUp = (e: PointerEvent) => {
      // El reset va ANTES del guard de fase: si no, `dragging` no volvía NUNCA a false
      // (no se soltaba en ningún sitio) y la inercia quedaba muerta con velocidad rancia.
      dragging = false;
      world.current.pressed = "";
      if (e.timeStamp - lastMoveT > 90) world.current.trayVel = 0; // dedo parado = sin flick
      if (faseRef.current !== "arma") return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      world.current.lastAct = world.current.t;
      if (maxExc > 10) return; // fue drag: excursión máxima, no suma de temblores
      const { cardY, cardH } = geo();
      // pestañas: MISMA geometría que el dibujo (ver tabsGeo)
      const T = tabsGeo();
      if (y > T.top && y < T.bot) {
        for (let k = 0; k < 3; k++) {
          const tx = T.tx(k);
          if (Math.abs(x - tx) < T.tw / 2) {
            setTab(k as 0 | 1 | 2);
            s.tone(600 + k * 120, 0.06, "triangle", 0.08);
            return;
          }
        }
      }
      // platos: el fideo se estira hasta el INGREDIENTE en su plato (arriba del ítem)
      const c = cartaEn(x, y);
      if (c) tapIngrediente(c.ing, c.cx, cardY - cardH / 2 + 42);
    };
    // gesto abortado por el sistema (multitáctil, rechazo de palma): sin esto la carta se
    // queda encogida a 0.94 hasta el siguiente toque
    const onCancel = () => {
      dragging = false;
      world.current.pressed = "";
      world.current.trayVel = 0;
      maxExc = 1e9;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);

    // ---------- helpers de dibujo ----------
    const kraft = (x: number, y: number, w: number, h: number, r0: number, light: number) => {
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, r0);
      const grad = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
      grad.addColorStop(0, `rgba(${216 + light},${173 + light},${108 + light},1)`);
      grad.addColorStop(0.5, "#C69A5B");
      grad.addColorStop(1, "#A87B42");
      ctx.fillStyle = grad;
      ctx.fill();
      // textura de cartón encima (fibra + corrugado) — recortada al panel
      const kp = world.current.kraftPat;
      if (kp) {
        ctx.fillStyle = kp;
        ctx.fill();
      }
    };

    // scratch buffers para la hebra (cero alocación por frame)
    const FN = 22;
    let headGrad: CanvasGradient | null = null; // local del efecto: un ctx nuevo exige uno nuevo
    const fx0 = new Float32Array(FN + 1);
    const fy0 = new Float32Array(FN + 1);

    /**
     * EL FIDEO MESERO como SER VIVO — cinta de spaghetti con TAPER (gruesa en la base, fina
     * en el cuello), CABEZA con volumen y OJITOS SIEMPRE visibles (también al cargar), sombra
     * propia ↘ y filo ↖. La curva sale de la boca de la caja y llega a la cabeza (hx,hy) que el
     * loop gobierna con muelle → whip natural. `holdSpr` = ingrediente colgando envuelto en rizo.
     */
    const drawFideo = (
      ax: number,
      ay: number,
      tipX: number,
      tipY: number,
      seed: number,
      holdSpr: CanvasImageSource | null,
      eyes: boolean,
      pupilDown = 0,
      hvx = 0,
      hvy = 0,
      scale = 1,
      ctrl: CtrlFideo | null = null,
    ) => {
      const wd = world.current;
      const S = scale; // el fideo escala con su objeto (p.ej. la caja crecida en la espera)
      /* El ondulado era un METRÓNOMO: 2.10 Hz y 1.72 Hz, razón 11/9 → el patrón se repetía
         EXACTO cada 5.24 s, y un cliente que mira la pantalla mientras decide lo nota. Misma
         sensación, razón irracional (φ/2): ya no vuelve nunca al mismo sitio. Y en segundos,
         no en frames, para que no cambie de velocidad con el framerate. */
      const F1 = 2.1;
      const F2 = 2.1 * 0.809016994374947;
      const wob = Math.sin(TAU * F1 * wd.ts + seed) * 7 * S;
      const wob2 = Math.cos(TAU * F2 * wd.ts + seed * 1.7) * 6 * S;
      const dx = tipX - ax;
      const dy = tipY - ay;
      // WHIP: el cuerpo TRAILA la velocidad de la cabeza (follow-through) → ondula como ser vivo,
      // no es un cable rígido. El nodo cercano a la cabeza (c2) se retrasa opuesto al movimiento.
      const whipX = clamp(hvx * 0.05, -15, 15) * S;
      const whipY = clamp(hvy * 0.05, -15, 15) * S;
      const t1x = ax + dx * 0.16 + wob - whipX * 0.35;
      const t1y = ay - 48 * S + wob2 * 0.6 + dy * 0.1 - whipY * 0.35;
      const t2x = ax + dx * 0.74 - wob * 0.6 - whipX;
      const t2y = Math.min(ay, tipY) - 42 * S + wob2 - whipY;
      /* EL CUERPO ADQUIERE MEMORIA. Antes los puntos de control se calculaban
         ANALÍTICAMENTE desde la cabeza cada frame: si la cabeza iba y volvía al mismo punto,
         el cuerpo quedaba idéntico — sin historia, sin inercia, sin coleteo (el "whip" lo
         fingía con un offset). Ahora son objetivos y los puntos reales los persiguen con
         muelles de vida media CRECIENTE hacia la cabeza (0.075 s → 0.135 s): ese escalonado
         es lo que produce el látigo. Los EXTREMOS siguen siendo exactos, así que la hebra
         nunca se despega ni del hogar ni de la cabeza. */
      let c1x = t1x;
      let c1y = t1y;
      let c2x = t2x;
      let c2y = t2y;
      if (ctrl) {
        if (!ctrl.on) {
          ctrl.on = true;
          ctrl.x1 = t1x;
          ctrl.y1 = t1y;
          ctrl.x2 = t2x;
          ctrl.y2 = t2y;
        }
        const hdt = Math.min(wd.dt, 1 / 30);
        [ctrl.x1, ctrl.v1x] = damper(ctrl.x1, ctrl.v1x, t1x, 0.075, hdt);
        [ctrl.y1, ctrl.v1y] = damper(ctrl.y1, ctrl.v1y, t1y, 0.075, hdt);
        [ctrl.x2, ctrl.v2x] = damper(ctrl.x2, ctrl.v2x, t2x, 0.135, hdt);
        [ctrl.y2, ctrl.v2y] = damper(ctrl.y2, ctrl.v2y, t2y, 0.135, hdt);
        c1x = ctrl.x1;
        c1y = ctrl.y1;
        c2x = ctrl.x2;
        c2y = ctrl.y2;
      }
      for (let k = 0; k <= FN; k++) {
        const t = k / FN;
        const mt = 1 - t;
        fx0[k] = mt * mt * mt * ax + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * tipX;
        fy0[k] = mt * mt * mt * ay + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * tipY;
      }
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // ancho por nodo: TAPER de la base al cuello, escalado por S (respira ±4% para "vida")
      /* 0.86 Hz = 52 respiraciones/min: eso es JADEAR. Un bicho tranquilo va a 0.20-0.30 Hz,
         y con una pizca de ruido para que no sea un émbolo. */
      const breathe =
        1 + (Math.sin(TAU * 0.26 * wd.ts + seed) * 0.75 + fbm(wd.ts * 0.55 + seed * 13) * 0.25) * 0.045;
      const wBase = 7.6 * S * breathe;
      const wTip = 3.2 * S * breathe;
      // construye la cinta como polígono (borde izq de ida, borde der de vuelta)
      const ribbon = (grow: number, offx: number, offy: number) => {
        ctx.beginPath();
        for (let k = 0; k <= FN; k++) {
          const t = k / FN;
          const pkx = k === 0 ? fx0[0] : fx0[k - 1];
          const pky = k === 0 ? fy0[0] : fy0[k - 1];
          let nx = fx0[k] - pkx;
          let ny = fy0[k] - pky;
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          const hw = ((wBase + (wTip - wBase) * t) * 0.5 + grow) ;
          const lx = fx0[k] - ny * hw + offx;
          const ly = fy0[k] + nx * hw + offy;
          if (k === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        for (let k = FN; k >= 0; k--) {
          const t = k / FN;
          const pkx = k === 0 ? fx0[0] : fx0[k - 1];
          const pky = k === 0 ? fy0[0] : fy0[k - 1];
          let nx = fx0[k] - pkx;
          let ny = fy0[k] - pky;
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          const hw = ((wBase + (wTip - wBase) * t) * 0.5 + grow);
          const rx = fx0[k] + ny * hw + offx;
          const ry = fy0[k] - nx * hw + offy;
          ctx.lineTo(rx, ry);
        }
        ctx.closePath();
      };

      // el ingrediente cuelga bajo la cabeza, envuelto en un rizo
      const hr = SPR * 0.34;
      if (holdSpr) {
        ctx.save();
        ctx.translate(tipX, tipY + hr * 0.72);
        ctx.rotate(Math.sin(wd.t * 0.15 + seed) * 0.12);
        ctx.drawImage(holdSpr, -hr, -hr, hr * 2, hr * 2);
        ctx.restore();
      }
      // sombra propia ↘
      ribbon(0.6, 2.4, 2.8);
      ctx.fillStyle = "rgba(50,28,10,0.3)";
      ctx.fill();
      // cuerpo ámbar (degradado a lo largo)
      ribbon(0, 0, 0);
      const bodyG = ctx.createLinearGradient(ax, ay, tipX, tipY);
      bodyG.addColorStop(0, "#B27821");
      bodyG.addColorStop(1, "#F0AC36");
      ctx.fillStyle = bodyG;
      ctx.fill();
      // filo de brillo ↖ (línea fina sobre el borde superior-izquierdo)
      ctx.strokeStyle = "rgba(255,244,210,0.7)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k <= FN; k++) {
        const t = k / FN;
        const pkx = k === 0 ? fx0[0] : fx0[k - 1];
        const pky = k === 0 ? fy0[0] : fy0[k - 1];
        let nx = fx0[k] - pkx;
        let ny = fy0[k] - pky;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const hw = (wBase + (wTip - wBase) * t) * 0.42;
        const lx = fx0[k] - ny * hw;
        const ly = fy0[k] + nx * hw;
        if (k === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      }
      ctx.stroke();

      // rizo que envuelve el ingrediente
      if (holdSpr) {
        ctx.strokeStyle = "#E29A2A";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.ellipse(tipX, tipY + hr * 0.42, hr * 0.66, hr * 0.28, 0.18, Math.PI * 0.85, Math.PI * 2.15);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,242,205,0.8)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(tipX, tipY + hr * 0.38, hr * 0.64, hr * 0.26, 0.18, Math.PI * 1.05, Math.PI * 1.7);
        ctx.stroke();
      }

      // ===== CABEZA con volumen (elipse orientada según el avance) =====
      let dirX = tipX - fx0[FN - 2];
      let dirY = tipY - fy0[FN - 2];
      const dl = Math.hypot(dirX, dirY) || 1;
      dirX /= dl;
      dirY /= dl;
      const ang = Math.atan2(dirY, dirX);
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(ang + Math.PI / 2); // el eje largo sigue la hebra
      ctx.scale(S, S); // la cabeza escala con el cuerpo
      const spd = Math.hypot(hvx, hvy);
      /* Dos defectos: el coeficiente saturaba a 187 px/s y la cabeza vuela a 1200-1800 px/s,
         así que el estiramiento era BINARIO (pegado al tope el 90% del tiempo, no comunicaba
         velocidad); y 0.82 × 1.30 hacía que la cabeza GANARA 6.6% de área al ir rápido, que
         es la lectura contraria a la de un ser con masa. Ahora satura a ~970 px/s y el área
         se conserva. */
      const st = clamp(spd * 0.00035, 0, 0.34);
      const sy = 1 + st;
      const sx = 1 / sy;
      /* Cacheado: se creaba en cada llamada de cada frame — con 3 hebras, 180 CanvasGradient
         por segundo solo de la cabeza. Sus coordenadas son locales fijas y se pinta dentro de
         translate+scale, así que un solo objeto sirve siempre. */
      if (!headGrad) {
        headGrad = ctx.createRadialGradient(-2, -3, 1, 0, 0, 9);
        headGrad.addColorStop(0, "#FBD27A");
        headGrad.addColorStop(0.6, "#EEAE3C");
        headGrad.addColorStop(1, "#B67C22");
      }
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.4 * sx, 6.6 * sy, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,252,240,0.8)";
      ctx.beginPath();
      ctx.arc(-1.8, -2.4, 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();

      // ===== OJITOS con esclerótica + PUPILA DIRECCIONAL (mira hacia donde se mueve / al ingrediente) =====
      if (eyes) {
        const perX = -dirY;
        const perY = dirX;
        /* El parpadeo tenía periodo EXACTO de 3.17 s: la señal más barata de "esto es un
           bucle". Ahora el intervalo lo sortea el ruido (1.5-3.3 s) y a veces sale doble,
           como un bicho de verdad. */
        const bt = wd.ts + seed * 0.9;
        const kb = Math.floor(bt / 2.4);
        const tb0 = kb * 2.4 + 1.2 + fbm(kb * 1.7) * 0.9;
        const dtb = bt - tb0;
        const doble = fbm(kb * 3.3) > 0.55;
        const blink = (dtb > 0 && dtb < 0.11) || (doble && dtb > 0.29 && dtb < 0.4) ? 0.12 : 1;
        const spd2 = Math.hypot(hvx, hvy);
        // quieto, la pupila se quedaba CLAVADA en el centro; ahora hace sacadas lentas
        const lx = spd2 > 10 ? clamp(hvx / spd2, -1, 1) * 1.3 : fbm(wd.ts * 0.19 + seed) * 0.9;
        const ly = clamp((spd2 > 10 ? clamp(hvy / spd2, -1, 1) * 1.1 : 0) + pupilDown * 0.7, -1.15, 1.15);
        ctx.save();
        ctx.translate(tipX, tipY); // marco local a la cabeza, escalado por S (ojos/boca crecen con ella)
        ctx.scale(S, S);
        for (const sd of [-1, 1]) {
          const ex = -dirX * 0.5 + perX * sd * 2.7;
          const ey = -dirY * 0.5 + perY * sd * 2.7;
          ctx.save();
          ctx.translate(ex, ey);
          ctx.scale(1, blink);
          ctx.fillStyle = "#FCF3DE"; // esclerótica (da dirección a la mirada)
          ctx.beginPath();
          ctx.arc(0, 0, 2.4, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#2A1608"; // pupila
          ctx.beginPath();
          ctx.arc(lx, ly, 1.35, 0, TAU);
          ctx.fill();
          if (blink > 0.5) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.beginPath();
            ctx.arc(lx - 0.5, ly - 0.6, 0.5, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        }
        // BOCA mínima hacia el frente de la cabeza: sonríe, o "o" de esfuerzo al cargar / ir rápido
        const mx = dirX * 2.6;
        const my = dirY * 2.6;
        ctx.strokeStyle = "rgba(58,28,10,0.85)";
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        ctx.beginPath();
        if (holdSpr || spd2 > 150) {
          ctx.arc(mx, my, 1.15, 0, TAU); // boca abierta
        } else {
          ctx.moveTo(mx - 1.3, my - 0.2);
          ctx.quadraticCurveTo(mx, my + 1, mx + 1.3, my - 0.2); // sonrisa sutil
        }
        ctx.stroke();
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const wd = world.current;
      // reloj real → dt en segundos; df = factor de frame (1.0 a 60fps). Toda la coreografía
      // y la física se escalan por df, así corre igual a 60/90/120Hz.
      const dtReal = lastT ? Math.min((now - lastT) / 1000, 1 / 30) : 1 / 60;
      lastT = now;
      // HIT-STOP: al aterrizar el sello, el TIEMPO DEL JUEGO se congela ~90ms (el frame sigue vivo)
      let dt = dtReal;
      if (wd.hitStop > 0) {
        wd.hitStop -= dtReal;
        dt = dtReal * 0.18;
      }
      const df = dt * 60;
      wd.dt = dt;
      wd.df = df;
      wd.t += df;
      wd.ts += dt; // usa `dt` (no dtReal): el hit-stop congela también la vida idle
      // suaviza la inclinación del móvil → la luz se mueve con calma, no nerviosa (luz interactiva)
      wd.tiltX += (tiltTX - wd.tiltX) * (1 - Math.pow(0.9, df));
      wd.tiltY += (tiltTY - wd.tiltY) * (1 - Math.pow(0.9, df));
      const { U, boxW, boxH, boxX, boxY, trayY, cardY, cardW, cardH } = geo();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // sacudida de escena (crocante) — decae; se suma a la caja y la mascota (no al fondo)
      wd.shake *= Math.pow(0.72, df);
      const shX = wd.shake > 0.015 && !reduce ? (Math.random() - 0.5) * 9 * wd.shake : 0;
      const shY = wd.shake > 0.015 && !reduce ? (Math.random() - 0.5) * 6 * wd.shake : 0;

      // cambio de pestaña → animación de entrada de cartas + reset de scroll
      if (sel.current.tab !== wd.lastTab) {
        wd.lastTab = sel.current.tab;
        wd.tabT = wd.t;
        wd.trayScroll = 0;
        wd.trayVel = 0;
      }

      // ===== fondo horneado (crema + pool de luz ↖ + mostrador con canto + veta + grano) =====
      if (wd.bg) ctx.drawImage(wd.bg, 0, 0, W, H);
      else {
        ctx.fillStyle = "#F6E7CB";
        ctx.fillRect(0, 0, W, H);
      }
      // motas de polvo flotando en el haz de luz (única capa viva del fondo)
      if (!reduce) {
        for (let k = 0; k < 7; k++) {
          const mx = W * 0.07 + (((k * 137) % 100) / 100) * W * 0.5 + Math.sin(wd.t * 0.005 + k * 1.7) * 14;
          const my = H * 0.05 + (((k * 71) % 100) / 100) * H * 0.3 + Math.cos(wd.t * 0.004 + k) * 10;
          ctx.globalAlpha = 0.08 + 0.05 * Math.sin(wd.t * 0.01 + k * 2);
          ctx.fillStyle = "#FFF6E4";
          ctx.beginPath();
          ctx.arc(mx, my, 1.6, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // ===== LA CAJA =====
      // entrada: la caja cae a escena con squash en el primer medio segundo
      const ent = Math.min(1, wd.t / 26);
      const entY = (1 - easeOutCubic(ent)) * -H * 0.35;
      if (!wd.entered && wd.t >= 27) {
        wd.entered = true;
        wd.boxSquash = 1;
      }
      const squash = 1 + 0.05 * Math.sin(wd.t * 0.02) * 0.3 + wd.boxSquash * 0.08;
      wd.boxSquash *= Math.pow(0.86, df);
      if (wd.folding && wd.fold < 1) wd.fold = Math.min(1, wd.fold + 0.022 * df);
      const f = wd.fold;
      // al cerrar, la caja crece y SUBE a centro-escena (foco total en el clímax)
      const foco = smooth(Math.min(1, f * 1.3));
      const focoScale = 1 + 0.1 * foco;
      const focoY = -foco * H * 0.06;
      // ESPERA: la caja se RETIRA (se corre a la derecha y encoge un pelo) para dejar sitio limpio al
      // MESERO parado a la izquierda, sobre la mesa. Transición suave al entrar en la fase de espera.
      if (faseRef.current === "espera") wd.espT = Math.min(1, wd.espT + 0.03 * df);
      else wd.espT = 0;
      const espMix = smooth(wd.espT);
      const boxXE = boxX + espMix * boxW * 0.17; // caja corrida a la derecha en espera
      const focoScaleE = focoScale * (1 - espMix * 0.16); // y encogida un pelo
      // ===== SOMBRA DIRECCIONAL de la caja SOBRE LA MESA — la luz viene de ↖, la sombra cae ↘.
      // Dos capas: núcleo de CONTACTO duro y ceñido (ancla la caja) + halo ambiente elongado y
      // rotado sobre el eje luz→sombra; el gradiente se centra en el contacto → aclara en el
      // extremo lejano. Antes era una elipse simétrica con offset +10x: delator nº1 de "sticker".
      {
        // SOMBRA DE CONTACTO CREÍBLE (contact-hardening): un núcleo ceñido y oscuro justo bajo la
        // base + una penumbra ancha muy suave. Cálida (matiz de la mesa, no gris). SIN rotación
        // diagonal (era el "borrón extraño"). Al SELLAR la caja se alza → la sombra se ensancha
        // pero se ACLARA (objeto que se levanta), en vez de agigantarse oscura.
        const base = boxY + boxH * 0.32 + entY + focoY;
        const cy2 = base + boxH * 0.12 * focoScaleE;
        const lift = clamp(-focoY / (H * 0.06), 0, 1); // 0 apoyada → 1 alzada (al sellar)
        const spread = 1 + lift * 0.4;
        const fade = 1 - lift * 0.4;
        // sigue a la caja (corrida en espera) y se desplaza un pelo OPUESTO a la luz interactiva (tilt)
        const cxs = boxXE + boxW * 0.02 - wd.tiltX * boxW * 0.08;
        ctx.save();
        // La sombra es de MESA: recortada al plano de la mesa. Antes pintaba hasta 20 px por
        // encima del horizonte —y durante la entrada, con la caja a media pared, la sombra
        // entera— lo que remataba la lectura de "pegatina con sombra pintada".
        ctx.beginPath();
        ctx.rect(0, geo().woodY, W, H - geo().woodY);
        ctx.clip();
        ctx.globalCompositeOperation = "multiply"; // la mesa asoma su tono cálido a través de la sombra (una-luz)
        // AMBIENTE: ancha, tenuísima, apenas ↘ (única capa con dirección de luz)
        const amb = ctx.createRadialGradient(cxs + boxW * 0.05, cy2 + boxH * 0.02, boxW * 0.06, cxs + boxW * 0.06, cy2 + boxH * 0.02, boxW * 0.85 * focoScaleE * spread);
        amb.addColorStop(0, `rgba(74,44,20,${0.1 * fade})`);
        amb.addColorStop(0.55, `rgba(74,44,20,${0.05 * fade})`);
        amb.addColorStop(1, "rgba(74,44,20,0)");
        ctx.fillStyle = amb;
        ctx.beginPath();
        ctx.ellipse(cxs + boxW * 0.06, cy2 + boxH * 0.02, boxW * 0.85 * focoScaleE * spread, boxH * 0.14 * focoScaleE * spread, 0, 0, TAU);
        ctx.fill();
        // MEDIA (penumbra)
        const med = ctx.createRadialGradient(cxs, cy2, boxW * 0.04, cxs, cy2, boxW * 0.42 * focoScaleE);
        med.addColorStop(0, `rgba(74,44,20,${0.16 * fade})`);
        med.addColorStop(0.6, `rgba(74,44,20,${0.07 * fade})`);
        med.addColorStop(1, "rgba(74,44,20,0)");
        ctx.fillStyle = med;
        ctx.beginPath();
        ctx.ellipse(cxs, cy2, boxW * 0.42 * focoScaleE, boxH * 0.08 * focoScaleE, 0, 0, TAU);
        ctx.fill();
        // CONTACTO: ceñido, stops que se desploman → línea de contacto casi dura (contact-hardening)
        const con = ctx.createRadialGradient(cxs, cy2, 1, cxs, cy2, boxW * 0.22 * focoScaleE);
        con.addColorStop(0, `rgba(58,32,14,${0.5 * fade})`);
        con.addColorStop(0.25, `rgba(58,32,14,${0.34 * fade})`);
        con.addColorStop(0.5, `rgba(58,32,14,${0.12 * fade})`);
        con.addColorStop(1, "rgba(58,32,14,0)");
        ctx.fillStyle = con;
        ctx.beginPath();
        ctx.ellipse(cxs, cy2, boxW * 0.22 * focoScaleE, boxH * 0.05 * focoScaleE, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // ===== LA MASCOTA — el fideo SIEMPRE presente. Vive a un lado de la caja (hogar fijo) y
      // se mueve CONSTANTEMENTE por 8 modos aleatorios. Se dibuja ANTES de la caja → SALE DE
      // DETRÁS (la caja ocluye su base). Solo se oculta durante una acción o el plegado.
      if (faseRef.current === "arma" && wd.fideos.length === 0 && wd.vuelos.length === 0 && !wd.folding) {
        const m = wd.masc;
        const mby = boxY + boxH * 0.32 + entY + focoY; // base de la caja en pantalla
        const h = HOMES[m.home];
        const ax = boxX + h.axf * boxW + shX; // hogar actual (lado o por encima de la caja)
        const ay = mby + h.ayf * boxH + shY;
        const up = boxH * h.up;
        if (!m.init) {
          m.init = true;
          m.hx = ax;
          m.hy = ay - up * 0.6;
          m.modeT = wd.t;
        }
        // REACCIÓN por sabor: al aterrizar un ingrediente, el fideo hace un gesto temático
        const react = wd.reactMode >= 0 && wd.t - wd.reactT < 48;
        if (wd.t - m.modeT > m.dur && !react) {
          let nm = Math.floor(Math.random() * 8);
          if (nm === m.mode) nm = (nm + 1) % 8;
          m.mode = nm;
          m.modeT = wd.t;
          m.dur = 55 + Math.random() * 130; // ~1-3s por modo
          if (Math.random() < 0.28) m.home = otroHome(m.home); // se muda de vez en cuando
        }
        const em = react ? wd.reactMode : m.mode;
        const age = react ? wd.t - wd.reactT : wd.t - m.modeT;
        const io = h.io; // hacia la caja
        let tx = ax;
        let ty = ay - up;
        let pupil = 0.4;
        if (reduce) {
          ty = ay - up * 0.7;
        } else {
          switch (em) {
            case 0: // mirar alrededor
              tx = ax + Math.sin(age * 0.05) * boxW * 0.14;
              ty = ay - up * (0.92 + 0.08 * Math.sin(age * 0.08));
              pupil = 0.4 + Math.sin(age * 0.05) * 0.6;
              break;
            case 1: // estirarse alto
              ty = ay - up * (0.7 + 0.55 * smooth(Math.min(1, age / 45)));
              tx = ax + Math.sin(age * 0.2) * 5;
              pupil = 0.2;
              break;
            case 2: // asomarse a mirar la bandeja (abajo)
              tx = ax + Math.sin(age * 0.06) * boxW * 0.1;
              ty = ay - up * 0.6;
              pupil = 1.4;
              break;
            case 3: // noodle-dance
              tx = ax + Math.sin(age * 0.24) * boxW * 0.2;
              ty = ay - up * (0.9 + 0.15 * Math.sin(age * 0.48));
              pupil = 0.5;
              break;
            case 4: // saludar
              tx = ax + Math.sin(age * 0.55) * boxW * 0.13;
              ty = ay - up * 1.08;
              pupil = 0.3;
              break;
            case 5: // curiosear la caja (se inclina hacia adentro, se esconde un poco)
              tx = ax + io * boxW * 0.18 + Math.sin(age * 0.05) * boxW * 0.05;
              ty = ay - up * 0.82;
              pupil = 1.1;
              break;
            case 6: // mirar a cámara (quieto, parpadea)
              tx = ax + Math.sin(age * 0.03) * 4;
              ty = ay - up * 1.02;
              pupil = 0.45;
              break;
            case 7: // esconderse tras la caja y reasomar
              ty = ay - up * (age < m.dur * 0.45 ? 0.1 : 0.95);
              tx = ax;
              pupil = 0.4;
              break;
            // ---- gestos de REACCIÓN por sabor ----
            case 8: // crocante: asiente con fuerza (crunch-nod)
              tx = ax + io * boxW * 0.06;
              ty = ay - up * (0.9 - 0.28 * Math.abs(Math.sin(age * 0.45)));
              pupil = 1.2;
              break;
            case 9: // fresco: se inclina y huele, aprobando
              tx = ax + io * boxW * 0.16;
              ty = ay - up * (0.72 + 0.06 * Math.sin(age * 0.6));
              pupil = 1.2;
              break;
            case 10: // dulce/cremoso: brinca contento
              tx = ax + Math.sin(age * 0.4) * 6;
              ty = ay - up * (1.02 + 0.14 * Math.abs(Math.sin(age * 0.42)));
              pupil = 0.3;
              break;
            default: // 11: premium: reverencia (baja y sube con gracia)
              ty = ay - up * (age < 18 ? 0.42 : 1.06);
              tx = ax;
              pupil = 0.5;
              break;
          }
        }
        [m.hx, m.hvx] = springStep(m.hx, m.hvx, tx, react ? 240 : 170, react ? 22 : 19, dt);
        [m.hy, m.hvy] = springStep(m.hy, m.hvy, ty, react ? 240 : 170, react ? 22 : 19, dt);
        m.pupil += (pupil - m.pupil) * (1 - Math.pow(0.86, df));
        drawFideo(ax, ay, m.hx, m.hy, 5, null, true, m.pupil, m.hvx, m.hvy, 1, m.ctrl);
      }

      ctx.save();
      ctx.translate(boxXE + shX, boxY + boxH * 0.32 + entY + focoY + shY);
      ctx.scale((1 + wd.boxSquash * 0.05) * focoScaleE, (squash - wd.boxSquash * 0.05) * focoScaleE);
      ctx.translate(0, -boxH * 0.32);

      // ---- vista 3/4: pared TRASERA interior → COMIDA (sobresale) → banda FRONTAL ----
      // DESPLIEGUE de apertura: la caja llega plegada y las solapas se abren en origami
      // (easeOutBack = pasan de largo y asientan); al confirmar, (1-f) las vuelve a cerrar.
      const abre = easeOutBack(Math.min(1, Math.max(0, (wd.t - 28) / 40))) * (1 - f);
      if (f < 0.9) {
        // solapa TRASERA: se abate hacia atrás con escorzo (detrás de la pared)
        const bh = boxW * 0.24 * (1 - abre * 0.82);
        const bfG = ctx.createLinearGradient(0, -boxH * 0.42 - bh, 0, -boxH * 0.42);
        bfG.addColorStop(0, "#B98A4C");
        bfG.addColorStop(1, "#9A7038");
        ctx.fillStyle = bfG;
        ctx.beginPath();
        ctx.moveTo(-boxW * 0.36, -boxH * 0.42);
        ctx.lineTo(boxW * 0.36, -boxH * 0.42);
        ctx.lineTo(boxW * 0.29, -boxH * 0.42 - bh);
        ctx.lineTo(-boxW * 0.29, -boxH * 0.42 - bh);
        ctx.closePath();
        ctx.fill();
        // pared trasera (interior kraft oscuro, lit ↖)
        const backG = ctx.createLinearGradient(0, -boxH * 0.42, 0, boxH * 0.05);
        backG.addColorStop(0, "#8A6230");
        backG.addColorStop(1, "#6B4A20");
        ctx.fillStyle = backG;
        ctx.beginPath();
        /* Esquinas superiores VIVAS. El radio 8 dejaba, en cada esquina, 13.7 px² que no
           pintaba NADIE (las paredes laterales arrancan en el vértice y crecen hacia fuera)
           y asomaba el fondo crema contra el interior kraft: una muesca a máximo contraste
           justo donde el ojo lee la silueta. Y el 8 era px fijo: pesaba 3.1% del ancho de
           caja en móvil y 2.1% en portátil. */
        ctx.roundRect(-boxW * 0.42, -boxH * 0.42, boxW * 0.84, boxH * 0.48, [0, 0, boxW * 0.031, boxW * 0.031]);
        ctx.fill();
        // corrugado interior: líneas verticales de la flauta (la comida las irá tapando)
        ctx.globalAlpha = 0.09;
        ctx.strokeStyle = "#3A2410";
        ctx.lineWidth = 1;
        for (let vx = -boxW * 0.36; vx < boxW * 0.4; vx += boxW * 0.09) {
          ctx.beginPath();
          ctx.moveTo(vx, -boxH * 0.42);
          ctx.lineTo(vx, boxH * 0.0);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // canto superior iluminado ↖ (la luz marca el borde del pliegue)
        ctx.strokeStyle = "rgba(255,236,195,0.5)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-boxW * 0.4, -boxH * 0.42);
        ctx.lineTo(boxW * 0.32, -boxH * 0.42);
        ctx.stroke();
        // sombra interior (la caja tiene hondo) — más honda abajo-derecha
        const inS = ctx.createLinearGradient(0, -boxH * 0.42, 0, -boxH * 0.16);
        inS.addColorStop(0, "rgba(40,22,8,0.6)");
        inS.addColorStop(1, "rgba(40,22,8,0)");
        ctx.fillStyle = inS;
        ctx.beginPath();
        ctx.roundRect(-boxW * 0.42, -boxH * 0.42, boxW * 0.84, boxH * 0.3, [0, 0, boxW * 0.031, boxW * 0.031]);
        ctx.fill();
        const inR = ctx.createLinearGradient(boxW * 0.42, 0, boxW * 0.18, 0);
        inR.addColorStop(0, "rgba(40,22,8,0.4)");
        inR.addColorStop(1, "rgba(40,22,8,0)");
        ctx.fillStyle = inR;
        ctx.beginPath();
        ctx.roundRect(boxW * 0.12, -boxH * 0.42, boxW * 0.3, boxH * 0.48, [boxW * 0.031, 0, boxW * 0.031, boxW * 0.031]);
        ctx.fill();
        // branding interior: se lee al abrir vacía, la comida lo va tapando
        const marcaA = Math.max(0, 0.55 - wd.pila.length * 0.14) * Math.min(1, abre * 1.4);
        if (marcaA > 0.02) {
          ctx.font = fontD(10, 800);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = marcaA;
          ctx.fillStyle = "rgba(40,22,8,0.9)";
          ctx.fillText("P A P A G H E T T I", 0, -boxH * 0.18 + 1);
          ctx.fillStyle = "rgba(230,190,130,0.8)";
          ctx.fillText("P A P A G H E T T I", 0, -boxH * 0.18);
          ctx.globalAlpha = 1;
        }

        // ===== PAREDES LATERALES (volumen 3/4): la caja es un CONTENEDOR real, no una fachada.
        // Izquierda LIT ↖, derecha en SOMBRA. Tras la pared trasera y bajo el suelo (la comida las tapa). =====
        {
          const wl = ctx.createLinearGradient(-boxW * 0.5, -boxH * 0.42, -boxW * 0.34, boxH * 0.08);
          wl.addColorStop(0, "#E4BC80");
          wl.addColorStop(0.5, "#C69A5B");
          wl.addColorStop(1, "#9C7238");
          ctx.fillStyle = wl;
          ctx.beginPath();
          ctx.moveTo(-boxW * 0.42, -boxH * 0.42);
          ctx.lineTo(-boxW * 0.5, -boxH * 0.08);
          ctx.lineTo(-boxW * 0.48, boxH * 0.08);
          ctx.lineTo(-boxW * 0.34, boxH * 0.02);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "rgba(255,238,200,0.5)"; // canto superior iluminado del rim izquierdo
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(-boxW * 0.42, -boxH * 0.42);
          ctx.lineTo(-boxW * 0.5, -boxH * 0.08);
          ctx.stroke();

          const wr = ctx.createLinearGradient(boxW * 0.34, -boxH * 0.42, boxW * 0.5, boxH * 0.08);
          wr.addColorStop(0, "#9A7038");
          wr.addColorStop(1, "#5E3F1C");
          ctx.fillStyle = wr;
          ctx.beginPath();
          ctx.moveTo(boxW * 0.42, -boxH * 0.42);
          ctx.lineTo(boxW * 0.5, -boxH * 0.08);
          ctx.lineTo(boxW * 0.48, boxH * 0.08);
          ctx.lineTo(boxW * 0.34, boxH * 0.02);
          ctx.closePath();
          ctx.fill();
          const wrAO = ctx.createLinearGradient(boxW * 0.34, 0, boxW * 0.5, 0); // se hunde al borde
          wrAO.addColorStop(0, "rgba(40,22,8,0)");
          wrAO.addColorStop(1, "rgba(40,22,8,0.35)");
          ctx.fillStyle = wrAO;
          ctx.beginPath();
          ctx.moveTo(boxW * 0.42, -boxH * 0.42);
          ctx.lineTo(boxW * 0.5, -boxH * 0.08);
          ctx.lineTo(boxW * 0.48, boxH * 0.08);
          ctx.lineTo(boxW * 0.34, boxH * 0.02);
          ctx.closePath();
          ctx.fill();
        }

        /* SOLAPAS LATERALES, reconstruidas. Antes se dibujaban ANTES que las paredes (la
           pared las repintaba y las partía en dos) y colgaban de un pivote situado a media
           pared, 0.08·boxH por DEBAJO del canto: al rotar barrían hacia DENTRO del interior
           y sobresalían 38.5 px por lado. Ahora cuelgan del CANTO SUPERIOR real de la pared
           como un paralelogramo: ningún vértice puede caer dentro (todos con |x| ≥ 0.42·boxW
           y creciendo hacia fuera) y el saliente máximo baja a la mitad, 25.3 px en móvil.
           El escorzo va con `abre`: cerrada es un labio de canto, abierta una solapa larga. */
        {
          const ab = Math.min(1, abre); // mata el overshoot de easeOutBack
          const thick = Math.max(4, boxW * 0.0155); // grosor visible del cartón
          for (const side of [-1, 1]) {
            const rax = side * boxW * 0.42;
            const ray = -boxH * 0.42; // canto trasero-alto de la pared
            const rbx = side * boxW * 0.5;
            const rby = -boxH * 0.08; // canto delantero-bajo
            const L = boxW * 0.1 * (0.28 + 0.72 * ab);
            const ox = side * L * 0.94;
            const oy = L * 0.26;
            ctx.save();
            ctx.beginPath();
            ctx.rect(side * boxW * 0.415, -boxH * 0.62, side * boxW * 0.34, boxH * 0.78);
            ctx.clip(); // red de seguridad + evita el hairline en la unión solapa/pared
            ctx.fillStyle = "#8A6636"; // grosor del cartón
            ctx.beginPath();
            ctx.moveTo(rax + ox, ray + oy);
            ctx.lineTo(rbx + ox, rby + oy);
            ctx.lineTo(rbx + ox, rby + oy + thick);
            ctx.lineTo(rax + ox, ray + oy + thick);
            ctx.closePath();
            ctx.fill();
            const gf = ctx.createLinearGradient(rax, ray, rbx + ox, rby + oy);
            gf.addColorStop(0, side < 0 ? "#E2BA7E" : "#C69A5B"); // izq LIT, der en sombra:
            gf.addColorStop(1, side < 0 ? "#C69A5B" : "#9A7038"); // coherente con las paredes
            ctx.fillStyle = gf;
            ctx.beginPath();
            ctx.moveTo(rax, ray);
            ctx.lineTo(rbx, rby);
            ctx.lineTo(rbx + ox, rby + oy);
            ctx.lineTo(rax + ox, ray + oy);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(255,236,195,0.4)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(rax, ray);
            ctx.lineTo(rbx, rby);
            ctx.stroke();
            ctx.restore();
          }
        }

        // ===== SUELO interior: la comida se apoya en una superficie kraft (no flota en el vacío) =====
        const floorY = boxH * 0.0;
        const floorG = ctx.createLinearGradient(-boxW * 0.32, -boxH * 0.12, boxW * 0.3, boxH * 0.06);
        floorG.addColorStop(0, "#A6793C");
        floorG.addColorStop(1, "#6A4620");
        ctx.fillStyle = floorG;
        ctx.beginPath();
        ctx.ellipse(0, floorY, boxW * 0.4, boxH * 0.14, 0, 0, TAU);
        ctx.fill();
        // AO del suelo (hondo abajo-derecha, luz ↖) — suave, sin borde de "plato"
        const floorAO = ctx.createRadialGradient(-boxW * 0.12, floorY - boxH * 0.06, boxH * 0.03, boxW * 0.04, floorY + boxH * 0.02, boxW * 0.46);
        floorAO.addColorStop(0, "rgba(40,22,8,0)");
        floorAO.addColorStop(0.7, "rgba(40,22,8,0.12)");
        floorAO.addColorStop(1, "rgba(40,22,8,0.34)");
        ctx.fillStyle = floorAO;
        ctx.beginPath();
        ctx.ellipse(0, floorY, boxW * 0.41, boxH * 0.15, 0, 0, TAU);
        ctx.fill();

        // LA COMIDA — montón FÍSICO: cada item está donde la física lo dejó; se asienta con
        // lerp hacia su y de reposo; SOBRESALE del borde; clip solo lateral
        if (wd.resettle) {
          // se quitó/cambió algo → el nido se recompone y los items FLUYEN a sus nuevos slots
          wd.resettle = false;
          recomputeSlots();
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(-boxW * 0.46, -boxH * 0.92, boxW * 0.92, boxH * 1.08); // más ancho: la comida besa la pared
        ctx.clip();
        // micro-manchas en el kraft del suelo (multiply, se desvanecen) — jugosidad del emplatado
        ctx.globalCompositeOperation = "multiply";
        for (let mi = wd.manchas.length - 1; mi >= 0; mi--) {
          const m = wd.manchas[mi];
          m.life -= 0.012 * df;
          if (m.life <= 0) {
            wd.manchas.splice(mi, 1);
            continue;
          }
          ctx.globalAlpha = m.life * 0.16;
          ctx.fillStyle = "#5A3A18";
          ctx.beginPath();
          ctx.ellipse(m.fx * boxW + 2, m.fy * boxH + m.r * 0.5, m.r * 1.1, m.r * 0.5, 0, 0, TAU);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        const capa = (id: string) => {
          const c = find(id)?.categoria;
          return c === "base" ? 0 : c === "proteina" ? 1 : 2;
        };
        // sort: capa (cama→proteína→toppings) y, DENTRO de toppings, por profundidad desc → el fondo
        // se dibuja primero y el frente lo ocluye (lectura 3/4 correcta del montículo)
        // LECHO: el relleno del suelo de la caja con el color de la base. Antes era un foco de
        // color plano flotando SOBRE el rim (elipse que rebasaba la boca y trepaba la pared);
        // los jueces lo señalaron como "lo pegado". Ahora se apoya en el SUELO, recortado al
        // trapecio interior (sin canto elíptico), con grano de kraft en multiply para que lea
        // como materia, no como glow. La luz va ↖ como toda la escena (fuera el sheen vertical).
        const baseItem = wd.pila.find((q) => find(q.id)?.categoria === "base");
        if (baseItem) {
          const col = wd.colores.get(baseItem.id) ?? "rgb(202,161,90)";
          const colT = col.replace("rgb(", "rgba(").replace(")", ",0)");
          const cyc = -boxH * 0.02; // al plano del suelo (no flotando en la pared)
          ctx.save();
          // CLIP al trapecio del interior → el borde del lecho es la caja, no una elipse
          ctx.beginPath();
          ctx.moveTo(-boxW * 0.29, -boxH * 0.42);
          ctx.lineTo(boxW * 0.29, -boxH * 0.42);
          ctx.lineTo(boxW * 0.4, boxH * 0.1);
          ctx.lineTo(-boxW * 0.4, boxH * 0.1);
          ctx.closePath();
          ctx.clip();
          const cg = ctx.createRadialGradient(-boxW * 0.1, cyc - boxH * 0.05, boxW * 0.04, 0, cyc, boxW * 0.44); // foco ↖
          cg.addColorStop(0, col);
          cg.addColorStop(0.34, col);
          cg.addColorStop(1, colT);
          ctx.globalAlpha = 0.66;
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.ellipse(0, cyc, boxW * 0.4, boxH * 0.2, 0, 0, TAU); // 206×40, dentro de la boca
          ctx.fill();
          if (wd.kraftPat) {
            // grano de cartón horneado (1 fill de patrón cacheado): rompe el plano
            ctx.globalCompositeOperation = "multiply";
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = wd.kraftPat;
            ctx.beginPath();
            ctx.ellipse(0, cyc, boxW * 0.4, boxH * 0.2, 0, 0, TAU);
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        }
        // AO de GRUPO: una sombra que abraza toda la masa y la pega al piso. Va DESPUÉS del
        // lecho (antes se pintaba antes y el cojín opaco lo borraba → la comida no se anclaba).
        if (wd.pila.length > 1) {
          const rw = boxW * (0.3 + 0.03 * Math.min(6, wd.pila.length));
          ctx.fillStyle = "rgba(40,22,8,0.24)";
          ctx.beginPath();
          ctx.ellipse(2, -boxH * 0.01, rw, boxH * 0.11, 0, 0, TAU);
          ctx.fill();
        }
        const ordenada = [...wd.pila].sort((a, b) => capa(a.id) - capa(b.id) || (b.depth ?? 0.5) - (a.depth ?? 0.5));
        for (const p of ordenada) {
          const spr = wd.sprites.get(p.id);
          if (!spr) continue;
          p.fy += (p.ty - p.fy) * (1 - Math.pow(0.75, df)); // asentamiento vertical (dt-normalizado)
          p.fx += (p.fxT - p.fx) * (1 - Math.pow(0.75, df)); // FLUYE a su slot (la composición se recompone viva)
          const cp = capa(p.id);
          const lx = p.fx * boxW;
          const ly = cp === 0 ? -boxH * 0.02 : p.fy * boxH; // la CAMA se apoya al frente, visible como lecho
          const rp = p.r * boxW;
          if (cp === 0) {
            // CAMA: sombra ancha y plana que abraza las 16 losetas del lecho
            ctx.fillStyle = "rgba(40,22,8,0.34)";
            ctx.beginPath();
            ctx.ellipse(lx + 2, ly + boxH * 0.05, boxW * 0.4, boxH * 0.07, 0, 0, TAU);
            ctx.fill();
          } else {
            // DOBLE sombra: halo ambiente (grande, suave) + contacto (ceñido) — pega el item al montón
            ctx.fillStyle = "rgba(40,22,8,0.1)";
            ctx.beginPath();
            ctx.ellipse(lx + 2, ly + rp * 0.55, rp * 1.5, rp * 0.6, 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = "rgba(40,22,8,0.3)";
            ctx.beginPath();
            ctx.ellipse(lx + 2, ly + rp * 0.62, rp * 0.85, rp * 0.32, 0, 0, TAU);
            ctx.fill();
          }
          p.land *= Math.pow(0.8, df); // el squash de impacto se recupera
          const sq = p.land * 0.32; // SQUASH de aterrizaje (conserva volumen: aplasta ancho)
          const gl = wd.glaze.get(p.id); // barniz húmedo (medialuna especular ↖)
          const wet = wetDe(p.id);
          ctx.save();
          ctx.translate(lx, ly);
          // UN solo sprite (base grande y ancha como lecho; proteína/topping por profundidad).
          // La base se ensancha un pelo para leerse como porción tendida, no como bola.
          const sz = SPR * p.s * (cp === 0 ? 1.0 : 0.93 + 0.12 * (1 - (p.depth ?? 0.5)));
          const wideX = cp === 0 ? 1.12 : 1; // el lecho se extiende a lo ancho
          const prof = clamp((-ly - boxH * 0.02) / (boxH * 0.28), 0, 1); // niebla cálida de profundidad
          ctx.save();
          ctx.scale((1 + sq) * wideX, 1 - sq); // squash ANTES del rotate: aplasta contra el SUELO
          ctx.rotate(p.rot);
          ctx.globalAlpha = 1 - prof * 0.14;
          ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
          ctx.globalAlpha = 1;
          ctx.restore();
          // BARNIZ en espacio de pantalla (sin rotar ni squash): la medialuna apunta ↖ y no
          // se deforma al aterrizar. tiltX la desliza un pelo → la comida "brilla" al inclinar.
          if (gl && wet > 0.02) {
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = wet * (0.78 + 0.22 * clamp(wd.tiltX * 3, -1, 1)) * (1 - prof * 0.35);
            ctx.drawImage(gl, (-sz / 2 + sz * 0.02) * wideX, -sz / 2, sz * wideX, sz);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
        ctx.restore();
        // PICK de marca clavado en la comida (banderita kraft con el fideo del logo)
        if (wd.pila.length >= 2 && f < 0.5 && abre > 0.9) {
          const px = -boxW * 0.06;
          const baseYp = -boxH * 0.2;
          const topYp = -boxH * 0.44;
          const sway = Math.sin(wd.t * 0.05) * 0.04;
          ctx.save();
          ctx.translate(px, baseYp);
          ctx.rotate(0.08 + sway);
          // palillo
          ctx.strokeStyle = "#8A6636";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, topYp - baseYp);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,240,205,0.5)";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(-0.8, 0);
          ctx.lineTo(-0.8, topYp - baseYp);
          ctx.stroke();
          // banderita triangular kraft
          const fy0p = topYp - baseYp;
          ctx.fillStyle = "#D8B27A";
          ctx.beginPath();
          ctx.moveTo(0, fy0p);
          ctx.lineTo(boxW * 0.16, fy0p + boxH * 0.03);
          ctx.lineTo(0, fy0p + boxH * 0.06);
          ctx.closePath();
          ctx.fill();
          const kpk = world.current.kraftPat;
          if (kpk) {
            ctx.fillStyle = kpk;
            ctx.fill();
          }
          ctx.strokeStyle = "rgba(90,58,24,0.25)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
          // el fideo del logo (mini swirl ámbar en la banderita)
          ctx.strokeStyle = "#C8321E";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(boxW * 0.05, fy0p + boxH * 0.03, boxH * 0.012, 0.4, TAU);
          ctx.stroke();
          ctx.restore();
        }
        // labio interior: la sombra del borde frontal CAE sobre la comida (está DENTRO)
        const lip = ctx.createLinearGradient(0, boxH * 0.06, 0, -boxH * 0.06);
        lip.addColorStop(0, "rgba(40,22,8,0.4)");
        lip.addColorStop(1, "rgba(40,22,8,0)");
        ctx.fillStyle = lip;
        ctx.fillRect(-boxW * 0.42, -boxH * 0.06, boxW * 0.84, boxH * 0.12);
      }

      // banda FRONTAL kraft (baja: deja ver la comida) — SPRITE horneado (kraft+textura+canto
      // corrugado+motivo+wordmark+sello en 1 drawImage; el patrón/arcos/texto ya no van por frame).
      if (wd.frontBand && wd.fbMeta) {
        const fm = wd.fbMeta;
        ctx.drawImage(wd.frontBand, fm.left, fm.top, fm.w, fm.h);
      } else {
        kraft(0, boxH * 0.22, boxW, boxH * 0.34, 9, 8);
      }

      // ===== CIERRE ORIGAMI REAL + SELLO con hit-stop (el clímax fotografiable) =====
      if (f > 0.5) {
        const ta = clamp((f - 0.5) / 0.5, 0, 1);
        // LA TAPA se PLIEGA hacia abajo (pivota en su borde trasero, no crossfade); slap con overshoot
        const lidS = easeOutBack(Math.min(1, ta * 1.25));
        const lidTop = -boxH * 0.235;
        ctx.save();
        ctx.translate(0, lidTop);
        ctx.scale(1, Math.max(0.02, lidS));
        ctx.translate(0, -lidTop);
        kraft(0, -boxH * 0.06, boxW * 0.98, boxH * 0.34, 8, 14);
        // canto iluminado del pliegue + brillo de lacre en el borde
        ctx.strokeStyle = "rgba(255,240,205,0.5)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-boxW * 0.46, -boxH * 0.06 - boxH * 0.155);
        ctx.lineTo(boxW * 0.46, -boxH * 0.06 - boxH * 0.155);
        ctx.stroke();
        ctx.restore();

        // el SELLO cae cuando la tapa está abajo: golpe seco, hit-stop, onda, chispas, campanita
        if (!wd.selloHecho && ta > 0.72) {
          wd.selloHecho = true;
          wd.selloScale = 1.7;
          wd.selloScaleV = 0;
          wd.selloRot = (Math.random() - 0.5) * 0.2;
          wd.hitStop = 0.09; // ← congela el tiempo del juego 90ms
          wd.boxSquash = 1.5;
          wd.ondas.push({ r: 0, life: 1 });
          for (let k = 0; k < 16; k++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
            const sp = 3.5 + Math.random() * 4.5;
            wd.chispas.push({
              x: boxX,
              y: boxY - boxH * 0.06 + entY + focoY,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              rot: Math.random() * TAU,
              vr: (Math.random() - 0.5) * 0.4,
              life: 1,
            });
          }
          s.ruido(0.12, 0.06, 900); // crinkle de papel
          s.tone(80, 0.2, "sine", 0.22); // thump grave
          s.tone(1568, 0.42, "triangle", 0.1, undefined, 0.06); // campanita
          if (navigator.vibrate) navigator.vibrate([12, 30, 8]);
        }
        // onda(s) de impacto sobre la tapa
        for (let oi = wd.ondas.length - 1; oi >= 0; oi--) {
          const o = wd.ondas[oi];
          o.r += boxW * 0.02 * df;
          o.life -= 0.03 * df;
          if (o.life <= 0) {
            wd.ondas.splice(oi, 1);
            continue;
          }
          ctx.globalAlpha = o.life * 0.5;
          ctx.strokeStyle = "#F6C566";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, -boxH * 0.06, o.r, o.r * 0.5, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // el SELLO de lacre (muelle de escala + rotación aleatoria + contra-rotación del monograma)
        if (wd.selloHecho) {
          [wd.selloScale, wd.selloScaleV] = springStep(wd.selloScale, wd.selloScaleV, 1, 320, 20, dt);
          const sr = 16.5 * wd.selloScale;
          ctx.save();
          ctx.translate(0, -boxH * 0.06);
          ctx.rotate(wd.selloRot);
          ctx.beginPath();
          for (let k = 0; k <= 44; k++) {
            const a = (k / 44) * TAU;
            const rr = sr * (1 + 0.08 * Math.sin(a * 11));
            const px = Math.cos(a) * rr;
            const py = Math.sin(a) * rr;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          const lacre = ctx.createRadialGradient(-sr * 0.3, -sr * 0.35, sr * 0.1, 0, 0, sr * 1.15);
          lacre.addColorStop(0, "#E4553A");
          lacre.addColorStop(0.6, "#C8321E");
          lacre.addColorStop(1, "#8E1E10");
          ctx.fillStyle = lacre;
          ctx.fill();
          ctx.strokeStyle = "rgba(255,220,200,0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
          // brillo especular de lacre ↖
          ctx.fillStyle = "rgba(255,230,215,0.4)";
          ctx.beginPath();
          ctx.ellipse(-sr * 0.32, -sr * 0.38, sr * 0.3, sr * 0.18, -0.6, 0, TAU);
          ctx.fill();
          // monograma con contra-rotación (efecto de sello mecánico)
          ctx.rotate(-wd.selloRot * 1.4);
          ctx.font = fontD(11, 800);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(90,20,10,0.6)";
          ctx.fillText("PG", 0, sr * 0.06 + 1);
          ctx.fillStyle = "#FBE7DD";
          ctx.fillText("PG", 0, sr * 0.06);
          ctx.restore();
        }
      }
      ctx.restore();

      // vapor extra mientras se pliega (la cocina respira al cerrar)
      if (wd.folding && wd.fold < 0.4 && !reduce && Math.random() < 0.34 * df) {
        wd.puffs.push({
          x: boxX + (Math.random() - 0.5) * boxW * 0.5,
          y: boxY - boxH * 0.28,
          life: 1,
          max: 50,
          r: 6 + Math.random() * 5,
          tipo: "vapor",
        });
      }

      // ===== VAPOR GHIBLI PERPETUO — hebras senoidales que NUNCA se detienen (señal de calor).
      // Activo desde que la caja se despliega; +vida cuando hay comida; retroiluminado al cruzar ↖.
      // Con reduced-motion: se dibuja congelado en fase fija (sin animación).
      if (f < 0.6) {
        const nH = wd.pila.length > 0 ? 3 : 2; // 2 hebras invitando en vacío, 3 con comida
        const vida = wd.pila.length > 0 ? 1 : 0.7;
        const ph = reduce ? 0 : wd.t;
        ctx.lineCap = "round";
        for (let sd = 0; sd < nH; sd++) {
          const x0 = boxX + (sd - (nH - 1) / 2) * 18;
          const y0 = boxY - boxH * 0.34;
          const fase = sd * 2.1;
          for (let pass = 0; pass < 2; pass++) {
            // pass 0 = retroiluminación (más ancha, cálida); pass 1 = filo crema
            ctx.strokeStyle = pass === 0 ? "#FFE9C8" : "#FFF9EE";
            ctx.lineWidth = pass === 0 ? 6 : 2.4;
            ctx.globalAlpha = (pass === 0 ? 0.06 : 0.14) * vida * (0.75 + 0.25 * Math.sin(ph * 0.03 + fase));
            ctx.beginPath();
            for (let k = 0; k < 12; k++) {
              const yy = y0 - k * 7;
              // más luz arriba-izquierda: la amplitud crece con la altura y deriva ↖
              const xx = x0 - k * 0.6 + Math.sin(ph * 0.045 + k * 0.62 + fase) * (1.5 + k * 1.15);
              if (k === 0) ctx.moveTo(xx, yy);
              else ctx.lineTo(xx, yy);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      // ===== chispas doradas (sello) — aditivas: se suman como brasas =====
      if (wd.chispas.length) ctx.globalCompositeOperation = "lighter";
      for (let i = wd.chispas.length - 1; i >= 0; i--) {
        const ch = wd.chispas[i];
        ch.x += ch.vx * df;
        ch.y += ch.vy * df;
        ch.vy += 0.28 * df;
        ch.rot += ch.vr * df;
        ch.life -= 0.028 * df;
        if (ch.life <= 0) {
          wd.chispas.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(ch.x, ch.y);
        ctx.rotate(ch.rot);
        ctx.globalAlpha = ch.life;
        ctx.strokeStyle = "#F6C566";
        ctx.lineWidth = 2.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, 2.4);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // ===== física: vuelos (caen hasta la SUPERFICIE del montón bajo su x, no un piso fijo) =====
      for (let i = wd.vuelos.length - 1; i >= 0; i--) {
        const v = wd.vuelos[i];
        v.x += v.vx * df;
        v.y += v.vy * df;
        v.vy += 0.55 * df;
        v.rot += v.vr * df;
        v.sc += (v.scT - v.sc) * (1 - Math.pow(0.86, df)); // escala continua carta→reposo (sin salto)
        const catV = v.ing.categoria;
        const surfY =
          catV === "base"
            ? boxY - boxH * 0.1
            : boxY + moundY(clamp((v.x - boxX) / boxW, -FXLIM, FXLIM), 0.5) * boxH;
        // sombra de caída: encoge y se oscurece al acercarse a la superficie (vende la caída)
        const alto = Math.max(0, surfY - v.y);
        if (v.vy > 0 && alto < boxH * 0.7 && catV !== "base") {
          const sr = radioDe(catV, v.scT) * (0.5 + alto / (boxH * 0.7));
          ctx.globalAlpha = 0.28 * (1 - alto / (boxH * 0.7));
          ctx.fillStyle = "#2A1808";
          ctx.beginPath();
          ctx.ellipse(v.x, surfY, sr, sr * 0.4, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (v.vy > 0 && v.y >= surfY) {
          if (v.bounces < 1) {
            const e = clamp(v.vy / 14, 0, 1); // energía del impacto → intensidad del haptic
            v.bounces++;
            v.vy *= -0.38;
            v.vx *= 0.5;
            wd.boxSquash = 1;
            s.ruido(0.04, 0.05, 900);
            if (!reduce && navigator.vibrate && e > 0.15) navigator.vibrate(Math.round(4 + e * 16)); // haptic escalado, 1er contacto
          } else {
            aterrizar(v.ing, v.x, clamp(v.vy / 14, 0, 1));
            wd.vuelos.splice(i, 1);
            continue;
          }
        }
        const spr = wd.sprites.get(v.ing.id);
        if (spr) {
          ctx.save();
          ctx.translate(v.x, v.y);
          ctx.rotate(v.rot);
          const sz = SPR * v.sc;
          ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
          ctx.restore();
        }
      }

      // ===== partículas del color de la comida (burst de aterrizaje) — blending ADITIVO (Fruit Ninja) =====
      if (wd.parts.length) ctx.globalCompositeOperation = "lighter";
      for (let i = wd.parts.length - 1; i >= 0; i--) {
        const pa = wd.parts[i];
        pa.x += pa.vx * df;
        pa.y += pa.vy * df;
        pa.vy += 0.32 * df;
        pa.life -= 0.04 * df;
        if (pa.life <= 0) {
          wd.parts.splice(i, 1);
          continue;
        }
        const rr = pa.r * (0.4 + pa.life * 0.6);
        ctx.globalAlpha = Math.min(1, pa.life * 1.6);
        ctx.fillStyle = pa.color;
        ctx.beginPath();
        ctx.arc(pa.x, pa.y, rr, 0, TAU);
        ctx.fill();
        // núcleo blanco-caliente (la chispa recién nacida quema; se apaga al color)
        ctx.globalAlpha = Math.min(1, pa.life * pa.life * 1.4);
        ctx.fillStyle = "#FFF6E6";
        ctx.beginPath();
        ctx.arc(pa.x, pa.y, rr * 0.45, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // ===== vapor idle de la caja (más generoso cuando el plato está completo: "se ve rico") =====
      const completo =
        !!sel.current.baseId && sel.current.proteinaIds.length > 0 && sel.current.toppingIds.length > 0;
      if (!reduce && !wd.folding && wd.pila.length > 0 && Math.random() < (completo ? 0.05 : 0.03) * df) {
        wd.puffs.push({ x: boxX + (Math.random() - 0.5) * 26, y: boxY - boxH * 0.22, life: 1, max: 90, r: 5, tipo: "vapor" });
      }
      // dot-sprite horneado (evita createRadialGradient POR PUFF POR FRAME)
      const dot = wd.dotSprite!;
      for (let i = wd.puffs.length - 1; i >= 0; i--) {
        const p = wd.puffs[i];
        p.life -= (1 / p.max) * df;
        if (p.life <= 0) {
          wd.puffs.splice(i, 1);
          continue;
        }
        const yy = p.y - (1 - p.life) * 46;
        const rr = p.r * (1 + (1 - p.life) * 1.6);
        ctx.globalAlpha = p.life * 0.5;
        ctx.drawImage(dot, p.x - rr, yy - rr, rr * 2, rr * 2);
        ctx.globalAlpha = 1;
      }

      // ===== BANDEJA (pestañas + cartas) — se desliza fuera al cerrar (foco en la caja) =====
      const enArma = faseRef.current === "arma";
      if (enArma) {
      ctx.save();
      if (foco > 0.001) ctx.translate(0, foco * (H - trayY + 40));
      // panel
      const panel = ctx.createLinearGradient(0, trayY - 30, 0, H);
      panel.addColorStop(0, "rgba(30,18,8,0.0)");
      panel.addColorStop(0.2, "rgba(30,18,8,0.25)");
      panel.addColorStop(1, "rgba(20,12,6,0.5)");
      ctx.fillStyle = panel;
      ctx.fillRect(0, trayY - 30, W, H - trayY + 30);
      /* INVITACIÓN (no autoplay): si a los ~2.5 s el cliente no ha tocado nada y todavía
         no hay base, las cartas de base laten y aparece el rótulo. Antes, a los 520 ms,
         el fideo salía disparado y servía él solo. `wd.t += df` con `df = dt*60` → 150
         frames ≈ 2.5 s. */
      const invita = !sel.current.baseId && sel.current.tab === 0 && wd.t - wd.lastAct > 150;
      if (invita) {
        ctx.font = fontB(12 * U, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(242,165,22,${0.55 + 0.35 * Math.sin(wd.t * 0.06)})`;
        ctx.fillText("ELIGE TU BASE", W / 2, trayY - 44 * U);
      }
      // pestañas
      const tabsTxt = ["LA BASE", "PROTEÍNA", "TOPPINGS"] as const;
      const TG = tabsGeo();
      const tw = TG.tw;
      const th0 = TG.th;
      for (let k = 0; k < 3; k++) {
        const tx = TG.tx(k);
        const activo = sel.current.tab === k;
        // inactiva: píldora OSCURA (no crema-sobre-crema translúcido que casi no se lee sobre la madera clara)
        ctx.fillStyle = activo ? "#F2A516" : "rgba(24,15,7,0.42)";
        ctx.beginPath();
        ctx.roundRect(tx - tw / 2, trayY - 22 * U, tw, th0, 999);
        ctx.fill();
        ctx.font = fontB(12 * U, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = activo ? "#1E1611" : "rgba(255,247,230,0.94)";
        ctx.fillText(tabsTxt[k], tx, trayY - 2 * U);
        // check de completado (ámbar, disciplina de color — nunca verde-UI)
        const done = k === 0 ? !!sel.current.baseId : k === 1 ? sel.current.proteinaIds.length > 0 : sel.current.toppingIds.length > 0;
        if (done && !activo) {
          ctx.fillStyle = "#F2A516";
          ctx.beginPath();
          ctx.arc(tx + tw / 2 - 12 * U, trayY - 12 * U, 4.5 * U, 0, TAU);
          ctx.fill();
        }
      }
      // inercia del scroll
      if (Math.abs(wd.trayVel) > 0.2 && !dragging) {
        wd.trayScroll += wd.trayVel * df;
        wd.trayVel *= Math.pow(0.92, df);
      }
      const lista = listaActiva().filter((i) => i.activo);
      const step = cardW + 10 * U;
      const totalW2 = lista.length * step;
      const maxScroll = Math.max(0, totalW2 - W + 28);
      wd.trayScroll = Math.max(0, Math.min(maxScroll, wd.trayScroll));
      if (wd.trayScroll <= 0 || wd.trayScroll >= maxScroll) wd.trayVel = 0; // sin temblor en el tope
      const x0 = Math.max(14, (W - totalW2) / 2) - wd.trayScroll;
      for (let k = 0; k < lista.length; k++) {
        const ing = lista[k];
        const cx = x0 + k * step + cardW / 2;
        if (cx < -cardW || cx > W + cardW) continue;
        const selr =
          ing.id === sel.current.baseId ||
          sel.current.proteinaIds.includes(ing.id) ||
          sel.current.toppingIds.includes(ing.id);
        // entrada escalonada al cambiar de pestaña
        const ap = Math.min(1, Math.max(0, (wd.t - wd.tabT - k * 2) / 10));
        const ea = easeOutCubic(ap);
        const bob = Math.sin(wd.t * 0.04 + k) * 2;
        const press = wd.pressed === ing.id ? 0.94 : 1;
        ctx.save();
        ctx.translate(cx, cardY + bob + (1 - ea) * 30);
        // La carta se dibuja SIEMPRE en unidades de diseño (CARTA_W×CARTA_H) y la escena
        // la escala: un solo dibujo sirve en móvil y en portátil.
        ctx.scale(press * U, press * U);
        ctx.globalAlpha = ea;
        const cardWd = CARTA_W;
        const cardHd = CARTA_H;
        // ===== PLATO de cerámica (mise-en-place): el ingrediente servido en su plato =====
        // el TAMAÑO del plato cambia por categoría (base grande → topping pequeño)
        const plCat = ing.categoria;
        const prx = plCat === "base" ? 43 : plCat === "proteina" ? 38 : 33;
        const pry = prx * 0.42;
        const ply = -cardHd / 2 + 42; // el plato arriba; nombre/precio abajo
        // glow ámbar: de selección, o de INVITACIÓN mientras no hay base elegida
        const llama = invita && ing.categoria === "base" && !ing.agotado;
        if (selr || llama) {
          const gsz = prx + 8 + Math.sin(wd.t * 0.09 + k) * 1.5;
          const ga = selr ? 0.45 : 0.22 + 0.14 * Math.sin(wd.t * 0.12 + k);
          const gg = ctx.createRadialGradient(0, ply, 2, 0, ply, gsz * 1.7);
          gg.addColorStop(0, `rgba(242,165,22,${ga})`);
          gg.addColorStop(1, "rgba(242,165,22,0)");
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.ellipse(0, ply, gsz * 1.7, gsz * 0.95, 0, 0, TAU);
          ctx.fill();
        }
        // sombra de contacto del plato en la bandeja
        ctx.fillStyle = "rgba(18,9,3,0.32)";
        ctx.beginPath();
        ctx.ellipse(2, ply + pry * 0.85, prx * 1.06, pry * 0.66, 0, 0, TAU);
        ctx.fill();
        // cuerpo de cerámica (luz ↖)
        const pg = ctx.createRadialGradient(-prx * 0.32, ply - pry * 0.55, 2, 0, ply, prx * 1.15);
        pg.addColorStop(0, "#FFFDF7");
        pg.addColorStop(0.68, "#F2E7CF");
        pg.addColorStop(1, "#D8C6A2");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(0, ply, prx, pry, 0, 0, TAU);
        ctx.fill();
        // aro exterior + filo iluminado ↖ + well interior (relieve del plato)
        ctx.strokeStyle = "rgba(120,90,50,0.22)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, ply, prx, pry, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, ply - 0.5, prx, pry, 0, Math.PI * 1.02, Math.PI * 1.78);
        ctx.stroke();
        ctx.strokeStyle = "rgba(120,90,50,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, ply, prx * 0.62, pry * 0.62, 0, 0, TAU);
        ctx.stroke();
        // el INGREDIENTE servido sobre el plato (se mece contento si está elegido)
        const spr = wd.sprites.get(ing.id);
        if (spr) {
          const isz = plCat === "base" ? 70 : plCat === "proteina" ? 62 : 56;
          ctx.save();
          ctx.translate(0, ply - pry * 0.4 + (selr ? Math.sin(wd.t * 0.09 + k * 1.3) * 2 : 0));
          if (selr) ctx.rotate(Math.sin(wd.t * 0.09 + k * 1.3) * 0.06);
          ctx.globalAlpha = ea * 0.18;
          ctx.fillStyle = "#5A3A18";
          ctx.beginPath();
          ctx.ellipse(2, isz * 0.3, isz * 0.28, isz * 0.1, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = ea * (ing.agotado ? 0.35 : 1);
          ctx.drawImage(spr, -isz / 2, -isz / 2, isz, isz);
          ctx.restore();
          ctx.globalAlpha = ea;
        }
        // nombre (crema sobre la bandeja oscura, 2 líneas máx con elipsis real) + HALO de defensa
        ctx.font = fontB(13, 700);
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(18,9,3,0.7)"; // no se pierde si un sprite claro o el pool de luz asoma detrás
        ctx.shadowBlur = 4;
        ctx.fillStyle = ing.agotado ? "rgba(251,241,222,0.5)" : "#FBF1DE";
        const [l1, l2] = wrap2(ctx, ing.nombre, cardWd - 6);
        ctx.fillText(l1, 0, cardHd / 2 - (l2 ? 31 : 23));
        if (l2) ctx.fillText(l2, 0, cardHd / 2 - 19);
        ctx.shadowBlur = 0;
        // precio / GRATIS chip (oro sobre bandeja oscura — legible; el espresso desaparecería)
        const idxT = sel.current.toppingIds.indexOf(ing.id);
        const esGratis = ing.categoria === "topping" && idxT >= 0 && idxT < incluidos;
        ctx.font = fontB(12, 800);
        if (esGratis && !ing.agotado) {
          ctx.fillStyle = "#C69A5B";
          ctx.beginPath();
          ctx.roundRect(-26, cardHd / 2 - 9, 52, 16, 8);
          ctx.fill();
          ctx.fillStyle = "#2A1C0E";
          ctx.fillText("GRATIS", 0, cardHd / 2 - 0.5);
        } else {
          ctx.shadowColor = "rgba(18,9,3,0.7)";
          ctx.shadowBlur = 4;
          ctx.fillStyle = ing.agotado ? "rgba(251,241,222,0.55)" : "#F6D79A";
          ctx.fillText(
            ing.agotado ? "AGOTADO" : ing.precio > 0 ? formatCOP(ing.precio) : "—",
            0,
            cardHd / 2 - 2,
          );
          ctx.shadowBlur = 0;
        }
        // LA CORTESÍA, DONDE SE DECIDE: mientras queden toppings de la casa, la carta lo
        // dice en vez de mostrar solo un precio que el cliente cree que va a pagar.
        if (
          ing.categoria === "topping" &&
          !ing.agotado &&
          !esGratis &&
          sel.current.toppingIds.length < incluidos
        ) {
          ctx.font = fontB(9, 800);
          ctx.fillStyle = "#C69A5B";
          ctx.beginPath();
          ctx.roundRect(-33, -cardHd / 2 + 1, 66, 14, 7); // DENTRO de la carta: no invade las pestañas
          ctx.fill();
          ctx.fillStyle = "#2A1C0E";
          ctx.fillText("VA DE LA CASA", 0, -cardHd / 2 + 8.2);
        }
        // check de seleccionado (en el borde del plato)
        if (selr) {
          ctx.fillStyle = "#F2A516";
          ctx.beginPath();
          ctx.arc(prx - 4, ply - pry - 1, 9, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "#1E1611";
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(prx - 8, ply - pry - 1);
          ctx.lineTo(prx - 5, ply - pry + 2.5);
          ctx.lineTo(prx, ply - pry - 5);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // indicador de scroll — BARRA limpia (riel + pulgar ámbar), no un fideo suelto en el aire
      /* El riel se dibuja SIEMPRE. Antes solo aparecía si había recorrido, así que en la
         pestaña con la que arranca el juego (LA BASE, 3 cartas → maxScroll = 0) el gesto de
         arrastrar quedaba MUDO: nada decía si la fila responde o si ya lo ves todo. Lleno y
         atenuado = "ya lo ves todo". Los ternarios son obligatorios: con maxScroll = 0,
         0/0 = NaN y el pulgar desaparecería. */
      {
        const trackW = W * 0.34;
        const trackX = W / 2 - trackW / 2;
        const yb = cardY + cardH / 2 + 16;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(251,241,222,0.18)"; // riel
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(trackX, yb);
        ctx.lineTo(trackX + trackW, yb);
        ctx.stroke();
        const th = maxScroll > 0 ? Math.max(trackW * 0.2, trackW * (W / (totalW2 + 1))) : trackW;
        const prog = maxScroll > 0 ? clamp(wd.trayScroll / maxScroll, 0, 1) : 0;
        const tx0 = trackX + (trackW - th) * prog;
        ctx.globalAlpha = maxScroll > 0 ? 1 : 0.45;
        ctx.strokeStyle = "#F2A516";
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(tx0, yb);
        ctx.lineTo(tx0 + th, yb);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore(); // fin del slide de la bandeja
      } // fin de enArma (bandeja)

      // ===== TEATRO DE ESPERA (W4): el fideo mesero actúa el estado REAL del KDS =====
      if (faseRef.current === "espera") {
        const est = estadoRef.current;
        const by = boxY + entY + focoY;
        // transición de estado → FX (una sola vez por cambio)
        if (estadoAnimRef.current.last !== est) {
          estadoAnimRef.current.last = est;
          if (est === "cocina") {
            s.ruido(0.2, 0.05, 700); // sizzle
          } else if (est === "listo") {
            s.tone(1568, 0.4, "triangle", 0.12, undefined, 0);
            s.tone(2093, 0.5, "sine", 0.08, undefined, 0.08);
            if (navigator.vibrate) navigator.vibrate([12, 30, 8]);
            for (let k = 0; k < 14; k++) {
              const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
              const sp = 3 + Math.random() * 4;
              wd.chispas.push({ x: boxX, y: by - boxH * 0.1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.4, life: 1 });
            }
          }
        }
        // pulso cálido cuando está EN COCINA (el horno respira)
        if (est === "cocina") {
          const pulso = 0.5 + 0.5 * Math.sin(wd.t * 0.09);
          const glow = ctx.createRadialGradient(boxX, by, 10, boxX, by, boxW * 0.7);
          glow.addColorStop(0, `rgba(242,150,22,${0.05 + pulso * 0.08})`);
          glow.addColorStop(1, "rgba(242,150,22,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, W, H);
          if (!reduce && Math.random() < 0.5 * df)
            wd.puffs.push({ x: boxX + (Math.random() - 0.5) * boxW * 0.5, y: by - boxH * 0.28, life: 1, max: 70, r: 6 + Math.random() * 5, tipo: "vapor" });
        }
        // el FIDEO MESERO asoma COMPACTO sobre el borde superior-derecho de la caja sellada (cuello
        // corto, escalado con la caja) y actúa el estado con gestos pequeños — no una hebra larga que
        // arquea desde la base (eso se veía como un hilo suelto).
        const wob = Math.sin(wd.t * 0.06);
        const fs = focoScaleE;
        const base = boxY + boxH * 0.32 + entY + focoY; // base de la caja = nivel de la mesa
        // MESERO AL LADO: como la caja se corrió a la derecha en la espera, el fideo tiene sitio LIMPIO
        // a la izquierda: parado sobre la mesa, cuerpo entero, actuando el estado (comanda/atiza/campana/venia).
        const anchXe = boxXE - boxW * 0.66 * fs; // pies en el sitio libre a la izquierda de la caja
        const anchYe = base + boxH * 0.48 * fs; // PIES ABAJO, sobre la mesa
        const stand = boxH * 0.5 * fs; // cuerpo entero con presencia (ya no un bastón)
        let tipXe = anchXe;
        let tipYe = anchYe - stand;
        let ticket = false;
        if (est === "recibido") {
          tipXe = anchXe + boxW * 0.05 * fs + wob * 4; // presenta la comanda hacia la caja
          tipYe = anchYe - stand * (0.94 + 0.05 * Math.sin(wd.t * 0.12));
          ticket = true;
        } else if (est === "cocina") {
          tipXe = anchXe + boxW * 0.06 * fs + wob * 5; // atiza hacia la caja, sube y baja
          tipYe = anchYe - stand * (0.82 + 0.16 * Math.abs(Math.sin(wd.t * 0.14)));
        } else if (est === "listo") {
          tipXe = anchXe + boxW * 0.03 * fs + Math.sin(wd.t * 0.26) * 6; // se estira ALTO a la campana
          tipYe = anchYe - stand * 1.35;
        } else {
          tipXe = anchXe + boxW * 0.04 * fs; // reverencia
          tipYe = anchYe - stand * (0.55 + 0.05 * Math.sin(wd.t * 0.05));
        }
        drawFideo(anchXe, anchYe, tipXe, tipYe, 5.5, null, true, est === "cocina" ? 1.0 : 0.4, 0, 0, fs * 1.4);
        // la comanda kraft que lleva el fideo (recibido)
        if (ticket) {
          ctx.save();
          ctx.translate(tipXe + 6, tipYe + 10);
          ctx.rotate(0.2 + wob * 0.05);
          ctx.fillStyle = "#EBD3A6";
          ctx.beginPath();
          ctx.roundRect(-7, -9, 14, 18, 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(120,80,40,0.5)";
          ctx.lineWidth = 0.8;
          for (let li = -5; li <= 5; li += 3) {
            ctx.beginPath();
            ctx.moveTo(-5, li);
            ctx.lineTo(5, li);
            ctx.stroke();
          }
          ctx.restore();
        }
        // la campanita (listo)
        if (est === "listo") {
          const ring = Math.abs(Math.sin(wd.t * 0.26));
          ctx.save();
          ctx.translate(tipXe, tipYe - 10);
          ctx.fillStyle = "#E8B54E";
          ctx.beginPath();
          ctx.moveTo(-6, 4);
          ctx.quadraticCurveTo(-6, -6, 0, -6);
          ctx.quadraticCurveTo(6, -6, 6, 4);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#B67C22";
          ctx.beginPath();
          ctx.arc(0, 5, 1.6, 0, TAU);
          ctx.fill();
          // ondas de sonido de la campana
          ctx.strokeStyle = `rgba(242,165,22,${0.6 * ring})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(0, -1, 9 + ring * 3, -0.8, 0.8);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ===== EL FIDEO MESERO — sale DESDE LA MASCOTA (su posición actual, su hogar), no del
      // centro de la caja: se estira desde donde estaba, agarra la carta y vuelve a emplatar. =====
      const mby2 = boxY + boxH * 0.32 + entY + focoY;
      const mouthYBase = boxY - boxH * 0.34; // punto de SOLTADO: encima de la caja (el item cae dentro)
      for (let i = wd.fideos.length - 1; i >= 0; i--) {
        const fd = wd.fideos[i];
        const age = wd.t - fd.t0;
        const anchX = boxX + fd.haxf * boxW + shX; // ancla = hogar desde el que salió (lado o arriba)
        const anchY = mby2 + fd.hayf * boxH + shY;
        let tipX = 0;
        let tipY = 0;
        let holding = false;
        if (fd.dir === "traer") {
          if (age <= F_EXT) {
            // se estira DESDE su posición actual (sx,sy) hasta la carta — no desde el centro
            const u = easeOutCubic(age / F_EXT);
            const cxm = (fd.sx + fd.tx) / 2;
            const cym = Math.min(fd.sy, fd.ty) - 50;
            tipX = bez2(fd.sx, cxm, fd.tx, u);
            tipY = bez2(fd.sy, cym, fd.ty, u);
          } else if (age <= F_EXT + F_GRAB) {
            if (!fd.grabbed) {
              fd.grabbed = true;
              s.tone(760, 0.05, "triangle", 0.07);
              for (let k = 0; k < 2; k++)
                wd.puffs.push({ x: fd.tx + (Math.random() - 0.5) * 20, y: fd.ty - 10, life: 1, max: 26, r: 5, tipo: "polvo" });
            }
            tipX = fd.tx;
            tipY = fd.ty - Math.sin(((age - F_EXT) / F_GRAB) * Math.PI) * 5;
            holding = age > F_EXT + 2;
          } else if (age <= F_EXT + F_GRAB + F_CARRY) {
            const u = smooth((age - F_EXT - F_GRAB) / F_CARRY);
            const dropX = boxX + fd.off * 0.2 + fd.drop * boxW * 0.22;
            const apexX = (dropX + boxX) / 2 + fd.off * 0.4;
            const apexY = boxY - boxH * 0.95;
            tipX = bez2(fd.tx, apexX, dropX, u);
            tipY = bez2(fd.ty, apexY, mouthYBase - 6, u);
            holding = true;
          } else {
            // suelta DISPERSO sobre la caja: cada strand emplata en un punto distinto (montón real)
            const catR = fd.ing.categoria;
            wd.vuelos.push({
              ing: fd.ing,
              x: boxX + fd.off * 0.2 + fd.drop * boxW * 0.22,
              y: mouthYBase,
              vx: (Math.random() - 0.5) * 1.4,
              vy: 1.6,
              rot: (Math.random() - 0.5) * 0.4,
              vr: (Math.random() - 0.5) * 0.1,
              bounces: 0,
              sc: 0.68, // sale del rizo del fideo (≈ su tamaño colgando)
              scT: catR === "base" ? 1.25 : catR === "proteina" ? 0.8 : 0.58, // → reposo, sin salto
            });
            wd.fideos.splice(i, 1);
            continue;
          }
        } else {
          // sacar: se estira hacia DENTRO de la caja, levanta el ingrediente y lo devuelve a su carta
          const inX = boxX + fd.off * 0.2;
          const outY = mby2 - boxH * 0.6; // altura a la que lo saca de la caja
          if (age <= F_SUBIR) {
            const u = easeOutCubic(age / F_SUBIR);
            tipX = inX;
            tipY = (mby2 - boxH * 0.08) - u * (boxH * 0.52); // desde dentro de la caja, sube
            holding = age > F_SUBIR * 0.35;
          } else if (age <= F_SUBIR + F_LLEVAR) {
            const u = smooth((age - F_SUBIR) / F_LLEVAR);
            const apexX = (inX + fd.tx) / 2;
            const apexY = Math.min(outY - boxH * 0.2, fd.ty - 80);
            tipX = bez2(inX, apexX, fd.tx, u);
            tipY = bez2(outY, apexY, fd.ty, u);
            holding = true;
          } else {
            for (let k = 0; k < 3; k++)
              wd.puffs.push({ x: fd.tx + (Math.random() - 0.5) * 24, y: fd.ty, life: 1, max: 30, r: 6, tipo: "polvo" });
            s.tone(340, 0.08, "triangle", 0.09, 200);
            wd.fideos.splice(i, 1);
            continue;
          }
        }
        // muelle de la cabeza: persigue el objetivo con lag → anticipación + whip + follow-through
        if (fd.hx === undefined) {
          fd.hx = fd.sx; // arranca donde estaba la mascota (continuidad perfecta)
          fd.hy = fd.sy;
          fd.hvx = 0;
          fd.hvy = 0;
        }
        [fd.hx, fd.hvx] = springStep(fd.hx!, fd.hvx!, tipX, 320, 26, dt);
        [fd.hy, fd.hvy] = springStep(fd.hy!, fd.hvy!, tipY, 320, 26, dt);
        if (!fd.ctrl) fd.ctrl = nuevoCtrl();
        drawFideo(anchX, anchY, fd.hx!, fd.hy!, fd.seed, holding ? wd.sprites.get(fd.ing.id) ?? null : null, true, 0.35, fd.hvx ?? 0, fd.hvy ?? 0, 1, fd.ctrl);
      }


      // ===== price pops (nacen ALTOS, entran con rebote) =====
      for (let i = wd.pops.length - 1; i >= 0; i--) {
        const p = wd.pops[i];
        p.life -= 0.016 * df;
        if (p.life <= 0) {
          wd.pops.splice(i, 1);
          continue;
        }
        const yy = p.y - (1 - p.life) * 26;
        const scl = easeOutBack(Math.min(1, (1 - p.life) * 4));
        ctx.save();
        ctx.translate(p.x, yy);
        ctx.scale(scl, scl);
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.font = fontD(p.gratis ? 15 : 14, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(46,22,8,0.7)";
        ctx.strokeText(p.texto, 0, 0);
        ctx.fillStyle = p.gratis ? "#F4D08A" : "#FFE7B0";
        ctx.fillText(p.texto, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // ===== rastro dorado del pulgar (se desvanece) =====
      if (wd.trail.length > 1) {
        for (let i = wd.trail.length - 1; i >= 0; i--) {
          wd.trail[i].life -= 0.06 * df;
          if (wd.trail[i].life <= 0) wd.trail.splice(i, 1);
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 1; i < wd.trail.length; i++) {
          const a = wd.trail[i - 1];
          const bpt = wd.trail[i];
          ctx.globalAlpha = bpt.life * 0.5;
          ctx.strokeStyle = "#F2A516";
          ctx.lineWidth = 2 + bpt.life * 5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(bpt.x, bpt.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // ===== TERMÓMETRO DEL ANTOJO — el carácter de tu caja, en vivo =====
      if (faseRef.current === "arma") {
        const idsA = [sel.current.baseId, ...sel.current.proteinaIds, ...sel.current.toppingIds].filter(Boolean);
        const nA = idsA.length;
        if (nA > 0) {
          const agg: Sabor = { cro: 0, cre: 0, fre: 0, dul: 0 };
          for (const id of idsA) {
            const it = find(id);
            if (!it) continue;
            const sv = saborDe(it);
            agg.cro += sv.cro;
            agg.cre += sv.cre;
            agg.fre += sv.fre;
            agg.dul += sv.dul;
          }
          // DOMINANCIA, no promedio: el eje líder llega alto y la barra CRECE al construir. Antes
          // pf=agg/nA promediaba → más ingredientes = barras más cortas y "BIEN BALANCEADO" (valor invertido).
          const maxA = Math.max(agg.cro, agg.cre, agg.fre, agg.dul, 0.0001);
          const pf: Sabor = { cro: agg.cro / maxA, cre: agg.cre / maxA, fre: agg.fre / maxA, dul: agg.dul / maxA };
          // suavizado dt-normalizado → las barras se animan al añadir/quitar (no saltan)
          const tv = wd.termoV;
          const kk = 1 - Math.pow(0.8, df);
          tv.cro += (pf.cro - tv.cro) * kk;
          tv.cre += (pf.cre - tv.cre) * kk;
          tv.fre += (pf.fre - tv.fre) * kk;
          tv.dul += (pf.dul - tv.dul) * kk;
          const mw = Math.min(W * 0.68, 256 * U);
          const mh = 52 * U;
          const myc = H * 0.11;
          // píldora kraft SÓLIDA (vive sobre el punto más claro de la escena → sin fondo real nada
          // cumple contraste; 0.24 era ilegible). Borde crema tenue para asentarla.
          ctx.fillStyle = "rgba(26,17,8,0.66)";
          ctx.beginPath();
          ctx.roundRect(W / 2 - mw / 2, myc - mh / 2, mw, mh, 14 * U);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,244,220,0.14)";
          ctx.lineWidth = 1;
          ctx.stroke();
          // título evocador (13px + sombra → legible a plena luz)
          ctx.font = fontD(13 * U, 800);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(0,0,0,0.45)";
          ctx.shadowBlur = 3;
          ctx.fillStyle = "rgba(255,248,232,0.98)";
          ctx.fillText(tituloAntojo(pf, nA), W / 2, myc - mh / 2 + 13 * U);
          ctx.shadowBlur = 0;
          // 4 barras: crocante / cremoso / fresco / dulce (anchas → los labels de 10px no se tocan)
          const bw = 46 * U;
          const gap = 10 * U;
          const totalB = EJES.length * bw + (EJES.length - 1) * gap;
          const bx0 = W / 2 - totalB / 2;
          const by = myc + mh / 2 - 15 * U;
          const bh = 9 * U;
          let domK = 0;
          EJES.forEach((e, k) => {
            if (tv[e.k] > tv[EJES[domK].k]) domK = k;
          });
          EJES.forEach((e, k) => {
            const v = tv[e.k];
            const bx = bx0 + k * (bw + gap);
            ctx.fillStyle = "rgba(251,241,222,0.16)";
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 4 * U);
            ctx.fill();
            const fw = Math.max(4, bw * clamp(v, 0, 1));
            if (k === domK && v > 0.15) {
              ctx.shadowColor = e.color;
              ctx.shadowBlur = 8;
            }
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.roundRect(bx, by, fw, bh, 4 * U);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(255,255,255,0.22)"; // filo superior (relieve)
            ctx.beginPath();
            ctx.roundRect(bx, by, fw, 2 * U, 2 * U);
            ctx.fill();
            ctx.font = fontB(10 * U, 800); // 8px era el peor texto de la app; sube a 10 legible
            ctx.fillStyle = k === domK ? "rgba(255,246,224,0.98)" : "rgba(251,241,222,0.9)";
            ctx.fillText(e.label.toUpperCase(), bx + bw / 2, by - 8 * U);
          });
        }
      }

      // ===== FLASH de sabor (destello cálido de la reacción por ingrediente) =====
      if (wd.flash.life > 0) {
        wd.flash.life -= 0.05 * df;
        if (wd.flash.life > 0) {
          const fl = wd.flash;
          ctx.globalCompositeOperation = "lighter";
          const fg = ctx.createRadialGradient(boxX, boxY + boxH * 0.1, 10, boxX, boxY + boxH * 0.1, W * 0.8);
          fg.addColorStop(0, `rgba(${fl.r},${fl.g},${fl.b},${fl.life * 0.22})`);
          fg.addColorStop(1, `rgba(${fl.r},${fl.g},${fl.b},0)`);
          ctx.fillStyle = fg;
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = "source-over";
        }
      }

      // ===== LUZ INTERACTIVA: un brillo cálido que SIGUE la inclinación del móvil (la luz es "real";
      // la sombra ya se desplaza opuesta arriba). Solo con inclinación real (sensor concedido). Subtil.
      if (!reduce && (Math.abs(wd.tiltX) > 0.015 || Math.abs(wd.tiltY) > 0.015)) {
        const lgX = W * 0.32 + wd.tiltX * W * 0.3;
        const lgY = H * 0.14 + wd.tiltY * H * 0.14;
        ctx.globalCompositeOperation = "soft-light";
        const lg = ctx.createRadialGradient(lgX, lgY, 10, lgX, lgY, H * 0.6);
        lg.addColorStop(0, "rgba(255,242,205,0.6)");
        lg.addColorStop(1, "rgba(255,242,205,0)");
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "screen"; // especular que barre la caja/comida con el tilt
        const sgX = boxXE + wd.tiltX * boxW * 0.45;
        const sgY = boxY + boxH * 0.1 + wd.tiltY * boxH * 0.35;
        const sg = ctx.createRadialGradient(sgX, sgY, 4, sgX, sgY, boxW * 0.55);
        sg.addColorStop(0, "rgba(255,246,222,0.14)");
        sg.addColorStop(1, "rgba(255,246,222,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
      }
      // ===== grado final: velo cálido (soft-light) + viñeta (multiply) — temperatura unificada =====
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(242,165,22,0.06)";
      ctx.fillRect(0, 0, W, H);
      if (wd.vig) {
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(wd.vig, 0, 0, W, H);
      }
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("deviceorientation", onOrient);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuSig, incluidos]);

  // W4: al pedir otra caja, la escena canvas se reinicia sin desmontar (fase → arma)
  const otraCaja = useCallback(() => {
    const wd = world.current;
    wd.pila = [];
    wd.fideos = [];
    wd.vuelos = [];
    wd.chispas = [];
    wd.ondas = [];
    wd.pops = [];
    wd.parts = [];
    wd.manchas = [];
    wd.trail = [];
    wd.fold = 0;
    wd.folding = false;
    wd.selloHecho = false;
    wd.selloScale = 0;
    wd.hitStop = 0;
    wd.combo = 0;
    wd.lastAct = wd.t;
    faseRef.current = "arma";
    setPedido(null);
    setBaseId(""); // sin esto, "otra caja" deja caja vacía COBRANDO $20.412
    setToppingIds([]);
    setProteinaIds([]);
    setEstado("recibido");
    estadoRef.current = "recibido";
    estadoAnimRef.current = { last: "recibido", campana: false };
  }, []);

  const ordenIdx = (["recibido", "cocina", "listo", "entregado"] as EstadoPedido[]).indexOf(estado);

  // W5: compone una FOTO vertical 1080×1920 del emplatado y la comparte (WhatsApp/Stories).
  const [compartiendo, setCompartiendo] = useState(false);
  const compartirCaja = useCallback(async () => {
    if (!pedido) return;
    setCompartiendo(true);
    try {
      const cv = document.createElement("canvas");
      cv.width = 1080;
      cv.height = 1920;
      const g = cv.getContext("2d")!;
      // fondo cálido + pool de luz ↖
      g.fillStyle = "#F6E7CB";
      g.fillRect(0, 0, 1080, 1920);
      const luz = g.createRadialGradient(360, 240, 40, 480, 640, 1500);
      luz.addColorStop(0, "rgba(255,247,224,0.9)");
      luz.addColorStop(1, "rgba(120,80,40,0.14)");
      g.fillStyle = luz;
      g.fillRect(0, 0, 1080, 1920);
      // grano
      const gc = document.createElement("canvas");
      gc.width = 80;
      gc.height = 80;
      const gg = gc.getContext("2d")!;
      const im = gg.createImageData(80, 80);
      for (let i = 0; i < im.data.length; i += 4) {
        const v = 128 + (Math.random() * 2 - 1) * 128;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
        im.data[i + 3] = 9;
      }
      gg.putImageData(im, 0, 0);
      const pat = g.createPattern(gc, "repeat");
      if (pat) {
        g.fillStyle = pat;
        g.fillRect(0, 0, 1080, 1920);
      }
      // título
      g.textAlign = "center";
      g.fillStyle = "#1E1611";
      g.font = `800 60px ${FONT_DISPLAY}`;
      g.fillText("MI CAJA PAPAGHETTI", 540, 200);
      g.font = `700 34px ${FONT_BODY}`;
      g.fillStyle = "rgba(30,22,17,0.55)";
      g.fillText(`MESA ${mesa}`, 540, 250);

      // caja kraft con la comida (vista 3/4, grande)
      const cx = 540;
      const cyb = 760;
      const bw = 720;
      const bh = 520;
      g.save();
      g.translate(cx, cyb);
      // sombra
      g.fillStyle = "rgba(70,40,16,0.25)";
      g.beginPath();
      g.ellipse(10, bh * 0.5, bw * 0.5, bh * 0.11, 0, 0, TAU);
      g.fill();
      // pared trasera interior
      const back = g.createLinearGradient(0, -bh * 0.42, 0, bh * 0.1);
      back.addColorStop(0, "#8A6230");
      back.addColorStop(1, "#6B4A20");
      g.fillStyle = back;
      g.beginPath();
      g.roundRect(-bw * 0.42, -bh * 0.42, bw * 0.84, bh * 0.5, 16);
      g.fill();
      // suelo
      const fl = g.createLinearGradient(-bw * 0.3, -bh * 0.1, bw * 0.3, bh * 0.05);
      fl.addColorStop(0, "#A6793C");
      fl.addColorStop(1, "#6A4620");
      g.fillStyle = fl;
      g.beginPath();
      g.ellipse(0, 0, bw * 0.4, bh * 0.15, 0, 0, TAU);
      g.fill();
      // comida: base ancha + resto
      const drawSpr = (id: string, x: number, y: number, sc: number) => {
        const sp = world.current.sprites.get(id);
        if (sp) g.drawImage(sp, x - sc / 2, y - sc / 2, sc, sc);
      };
      if (baseId) drawSpr(baseId, 0, -bh * 0.02, 360);
      proteinaIds.forEach((id, i) => drawSpr(id, bw * 0.02 + (i - (proteinaIds.length - 1) / 2) * bw * 0.2, bh * 0.02, 300));
      const tl = toppingIds.map(find).filter(Boolean) as Ingrediente[];
      const FAN = [-0.5, 0.5, 0, -0.85, 0.85, -0.25, 0.25];
      tl.forEach((t, k) => drawSpr(t.id, FAN[k % 7] * bw * 0.28, -bh * 0.14 - (k % 3) * bh * 0.06, 210));
      // banda frontal kraft
      const kg = g.createLinearGradient(-bw / 2, 0, bw / 2, bh * 0.3);
      kg.addColorStop(0, "#D2A868");
      kg.addColorStop(1, "#A87B42");
      g.fillStyle = kg;
      g.beginPath();
      g.roundRect(-bw / 2, bh * 0.06, bw, bh * 0.34, 16);
      g.fill();
      g.fillStyle = "rgba(90,58,24,0.9)";
      g.font = `800 30px ${FONT_DISPLAY}`;
      g.fillText("P A P A G H E T T I", 0, bh * 0.25);
      // sello PG
      g.translate(bw * 0.3, -bh * 0.28);
      g.fillStyle = "#C8321E";
      g.beginPath();
      for (let k = 0; k <= 44; k++) {
        const a = (k / 44) * TAU;
        const rr = 46 * (1 + 0.08 * Math.sin(a * 11));
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      g.fillStyle = "#FBE7DD";
      g.font = `800 34px ${FONT_DISPLAY}`;
      g.fillText("PG", 0, 12);
      g.restore();

      // lista de ingredientes
      g.textAlign = "center";
      g.fillStyle = "#1E1611";
      g.font = `800 40px ${FONT_DISPLAY}`;
      const nombreBase = find(baseId)?.nombre ?? "";
      g.fillText(nombreBase.toUpperCase(), 540, 1160);
      g.font = `600 32px ${FONT_BODY}`;
      g.fillStyle = "rgba(30,22,17,0.7)";
      const extras = [...proteinaIds.map((id) => find(id)?.nombre), ...tl.map((t) => t.nombre)].filter(Boolean) as string[];
      let ly = 1220;
      for (const ex of extras.slice(0, 6)) {
        g.fillText(`+ ${ex}`, 540, ly);
        ly += 46;
      }
      // total + id
      g.fillStyle = "#1E1611";
      g.font = `800 56px ${FONT_DISPLAY}`;
      g.fillText(formatCOP(pedido.total), 540, 1560);
      g.fillStyle = "rgba(30,22,17,0.45)";
      g.font = `600 28px ${FONT_BODY}`;
      g.fillText(`Pedido #${pedido.id}`, 540, 1610);
      // footer marca
      g.fillStyle = "var(--ambar)";
      g.fillStyle = "#F2A516";
      g.beginPath();
      g.roundRect(540 - 260, 1720, 520, 76, 38);
      g.fill();
      g.fillStyle = "#1E1611";
      g.font = `800 34px ${FONT_DISPLAY}`;
      g.fillText("papaghetti.vercel.app", 540, 1770);

      const blob: Blob | null = await new Promise((res) => cv.toBlob(res, "image/png"));
      if (!blob) return;
      const file = new File([blob], "mi-caja-papaghetti.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "Mi caja Papaghetti", text: "Armé mi caja en Papaghetti" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mi-caja-papaghetti.png";
        a.click();
        URL.revokeObjectURL(url);
        window.open("https://wa.me/?text=" + encodeURIComponent("Armé mi caja en Papaghetti — papaghetti.vercel.app"), "_blank");
      }
    } catch {
      /* usuario canceló el share o no soportado */
    } finally {
      setCompartiendo(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, mesa, baseId, proteinaIds, toppingIds]);

  /* Un solo árbol DOM: el canvas NUNCA se desmonta (arma → teatro de espera). La barra
     inferior cambia; un aria-live anuncia el estado para lectores de pantalla. */
  return (
    <div className="emp-game" onPointerDown={s.unlock}>
      <header className="emp-top emp-top--game">
        <div className="emp-top__brand">
          {esWeb && props.onSalir && (
            <button type="button" className="emp-volver" onClick={props.onSalir} aria-label="Volver al menú">
              <IcoVolver />
            </button>
          )}
          <b>{negocio.toUpperCase()}</b>
          {/* en web el ← ya ocupa espacio: la marca sola respira mejor que "· ENREDA TU PLATO" */}
          {!esWeb && <span>· MESA {mesa}</span>}
        </div>
        <div className="emp-top__actions">
          <button type="button" className="emp-mini" onClick={s.toggleMute} aria-label={s.mute ? "Activar sonido" : "Silenciar"}>
            {s.mute ? <IcoMute /> : <IcoSonido />}
          </button>
          {!pedido && (
            <button type="button" className="emp-mini emp-modo" onClick={props.onModoRapido}>
              <IcoRayo /> PEDIR YA
            </button>
          )}
        </div>
      </header>
      {!abierto && !pedido && (
        <div className="emp-cerrado emp-cerrado--game">
          <IcoLuna /> Estamos cerrados ahora.
        </div>
      )}
      <canvas ref={canvasRef} className="emp-canvas" aria-label="Arma tu caja Papaghetti" />

      <p className="emp-sr" aria-live="polite">
        {pedido ? `Pedido ${pedido.id}, estado: ${estadoLabel[estado]}` : ""}
      </p>

      {!pedido ? (
        <footer className="emp-bar emp-bar--game">
          <div className="emp-total">
            {/* El hueco del aviso existe SIEMPRE (con nbsp si no hay nada que decir):
                así la barra mide igual en todos los estados y el canvas no se re-hornea. */}
            <span
              className={`emp-total__aviso${!baseId || proteinaIds.length === 0 ? "" : " emp-total__aviso--hueco"}`}
            >
              {!baseId
                ? "Elige tu base para emplatar"
                : proteinaIds.length === 0
                  ? "Va sin proteína"
                  : "\u00a0"}
            </span>
            <small>
              {!baseId
                ? desdeBase
                  ? `Arma tu caja · desde ${desdeBase}`
                  : "Sin bases disponibles hoy"
                : tops.length > incluidos
                  ? `${incluidos} gratis · ${tops.length - incluidos} con precio`
                  : `${tops.length}/${incluidos} de cortesía`}
              {impuesto > 0 ? ` · imp. ${formatCOP(impuesto)}` : ""}
            </small>
            <div className="emp-total__row">
              <span className="emp-total__label">TOTAL</span>
              {/* la comida, sin envío: el domicilio todavía no lo ha elegido nadie */}
              <b>{totalComida > 0 ? formatCOP(totalComida) : "—"}</b>
            </div>
          </div>
          <button
            type="button"
            className={`emp-cta ${abierto && baseId && !enviando ? "emp-cta--vivo" : ""}`}
            onClick={confirmar}
            disabled={!abierto || enviando || !baseId}
          >
            {enviando ? "SELLANDO…" : (<><IcoSello /> EMPLATAR</>)}
          </button>
        </footer>
      ) : (
        <footer className="emp-bar emp-bar--game emp-bar--espera">
          <div className="emp-wstate">
            <div className="emp-wstate__hero">
              <b className="emp-wstate__now">{estadoLabel[estado]}</b>
              <span className="emp-wstate__sub">
                {estado === "recibido"
                  ? "La cocina ya recibió tu caja"
                  : estado === "cocina"
                    ? "La están preparando…"
                    : estado === "listo"
                      ? "¡Lista! Recógela en la barra"
                      : "¡Buen provecho!"}
              </span>
            </div>
            <ol className="emp-timeline" aria-label={`Estado del pedido: ${estadoLabel[estado]}`}>
              {(["recibido", "cocina", "listo"] as EstadoPedido[]).map((e, k) => (
                <li key={e} className={`${ordenIdx >= k ? "on" : ""} ${ordenIdx === k ? "now" : ""}`}>
                  <span className="emp-timeline__dot" />
                  <span className="emp-timeline__lbl">{estadoLabel[e]}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="emp-espera__foot">
            <span className="emp-espera__id">
              <span className="emp-espera__k">COMANDA</span> <b>#{pedido.id}</b> · {formatCOP(pedido.total)}
            </span>
            <div className="emp-espera__acciones">
              <button type="button" className="emp-cta emp-cta--otra" onClick={compartirCaja} disabled={compartiendo}>
                {compartiendo ? "…" : (<><IcoCompartir /> Compartir</>)}
              </button>
              <button type="button" className="emp-cta emp-cta--sec emp-cta--otra" onClick={otraCaja}>
                Otra
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* MODO WEB — último paso: servicio + contacto. Se pide DESPUÉS de jugar (primero la diversión),
          y se manda por el mismo flujo existente (enviarPedido, canal "web"). */}
      {pidiendoDatos && (
        <div className="emp-datos" role="dialog" aria-modal="true" aria-label="Servicio y contacto">
          <div className="emp-datos__panel">
            <p className="emp-datos__k">ÚLTIMO PASO</p>
            <h3 className="emp-datos__h">¿Cómo quieres tu enredo?</h3>
            <div className="emp-datos__tipos" role="group" aria-label="Tipo de servicio">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`emp-datos__tipo ${tipoSel === t ? "is-on" : ""}`}
                  aria-pressed={tipoSel === t}
                  onClick={() => setTipoSel(t)}
                >
                  {tipoLabel[t]}
                </button>
              ))}
            </div>
            {tipoSel === "mesa" ? (
              <label className="emp-datos__campo">
                <span>Mesa</span>
                <select value={mesaSel} onChange={(e) => setMesaSel(Number(e.target.value))} aria-label="Número de mesa">
                  {Array.from({ length: Math.max(1, props.numMesas ?? 12) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="emp-datos__campo">
                  <span>Tu nombre</span>
                  <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="¿A nombre de quién?" />
                </label>
                {tipoSel === "domicilio" && (
                  <label className="emp-datos__campo">
                    <span>WhatsApp / teléfono</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="Para confirmar el domicilio"
                    />
                  </label>
                )}
              </>
            )}
            <div className="emp-datos__linea">
              <span>Tu caja</span>
              <span>{formatCOP(totalComida)}</span>
            </div>
            {domicilio > 0 && (
              <div className="emp-datos__linea">
                <span>Domicilio</span>
                <span>{formatCOP(domicilio)}</span>
              </div>
            )}
            <div className="emp-datos__total">
              <span>Total</span>
              <b>{formatCOP(total)}</b>
            </div>
            {faltaMin > 0 && (
              <p className="emp-datos__alerta">
                Mínimo a domicilio {formatCOP(props.pedidoMinimo ?? 0)} · te faltan{" "}
                <b>{formatCOP(faltaMin)}</b>
              </p>
            )}
            {errorEnvio && <p className="emp-datos__alerta">{errorEnvio}</p>}
            <button
              type="button"
              className="emp-cta emp-datos__ok"
              onClick={() => void enviarAhora()}
              disabled={enviando || faltaMin > 0}
            >
              {enviando ? "SELLANDO…" : (<><IcoSello /> SELLAR MI CAJA</>)}
            </button>
            <button type="button" className="emp-datos__volver" onClick={() => setPidiendoDatos(false)}>
              Volver a enredar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
