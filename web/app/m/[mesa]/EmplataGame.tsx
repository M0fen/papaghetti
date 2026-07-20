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

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCOP, estadoLabel, type EstadoPedido, type Ingrediente } from "@/lib/menu";
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
/* Muelle amortiguado 1-D (integrador semi-implícito). Da anticipación/overshoot/follow-through.
   Presets típicos: crítico k=170 c=26 · subamortiguado (juguetón) k=180 c=12 · golpe k=320 c=22. */
function springStep(pos: number, vel: number, target: number, k: number, c: number, dt: number): [number, number] {
  const h = dt > 1 / 30 ? 1 / 30 : dt;
  const v = vel + (-k * (pos - target) - c * vel) * h;
  return [pos + v * h, v];
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
    // papitas criollas doradas (3 monedas rechonchas)
    const pts: Array<[number, number, number]> = [
      [cx - R * 0.42, cy + R * 0.2, R * 0.5],
      [cx + R * 0.4, cy + R * 0.12, R * 0.46],
      [cx - R * 0.02, cy - R * 0.3, R * 0.52],
    ];
    for (const [px, py, pr] of pts) {
      volumen(g, () => {
        g.beginPath();
        g.ellipse(px, py, pr, pr * 0.82, 0, 0, TAU);
      }, px, py, pr, "#FFE08A", "#F2C230", "#8A5A12");
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
    g.fillStyle = "rgba(94,26,12,0.8)";
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      g.arc(cx + (Math.random() - 0.5) * R * 1.1, cy + (Math.random() - 0.4) * R * 0.7, 2.2, 0, TAU);
      g.fill();
    }
    spec(g, cx - R * 0.26, cy - R * 0.2, R, true);
  } else if (/pollo|crispy/.test(id)) {
    volumen(g, blob(g, cx, cy, R * 0.86, 3.3), cx, cy, R * 0.86, "#FFD98A", "#E8A83E", "#8A5A12");
    g.fillStyle = "rgba(138,90,18,0.5)";
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      g.arc(cx + (Math.random() - 0.5) * R * 1.2, cy + (Math.random() - 0.5) * R * 0.9, 1.6, 0, TAU);
      g.fill();
    }
    rim(g, blob(g, cx, cy, R * 0.86, 3.3), cx, cy, R * 0.86, 0.7);
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
    spec(g, cx - R * 0.28, cy - R * 0.14, R, true);
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
    spec(g, cx - R * 0.24, cy - R * 0.34, R, false);
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
      }, 0, 0, R * 0.4, "#FFE79A", "#F2C230", "#8A5A12");
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

/** Color dominante de un sprite horneado (promedio de píxeles opacos, sesgado a saturación).
 *  Sirve para el burst de partículas del aterrizaje (Fruit Ninja: partículas del color de la comida). */
function muestrearColor(off: Off): string {
  try {
    const g = off.getContext("2d")!;
    const S = off.width;
    const d = g.getImageData(S * 0.28, S * 0.28, S * 0.44, S * 0.44).data;
    let r = 0;
    let gr = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) {
      if (d[i + 3] < 180) continue;
      r += d[i];
      gr += d[i + 1];
      b += d[i + 2];
      n++;
    }
    if (!n) return "#F2A516";
    return `rgb(${Math.round(r / n)},${Math.round(gr / n)},${Math.round(b / n)})`;
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
  grabbed?: boolean; // ya sonó el agarre
  hx?: number; // muelle de la cabeza (init al primer frame)
  hy?: number;
  hvx?: number;
  hvy?: number;
};
/** Item asentado en la caja. fx/fy = posición FÍSICA (fracción de boxW/boxH, coords locales de la
 *  caja); ty = y de reposo objetivo (el item se asienta hacia ella con lerp); r = radio de colisión. */
type PilaItem = { id: string; fx: number; fy: number; ty: number; rot: number; s: number; r: number; land: number };
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
}) {
  const { mesa, negocio, abierto, impuestoPct, incluidos, bases, proteinas, toppings } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const s = useSonido();

  // ------- selección (React para la barra DOM; refs espejo para el loop) -------
  const [baseId, setBaseId] = useState<string>(() => bases.find((i) => !i.agotado)?.id ?? "");
  const [proteinaId, setProteinaId] = useState<string>("");
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<{ id: string; total: number } | null>(null);
  const [estado, setEstado] = useState<EstadoPedido>("recibido");

  const sel = useRef({ baseId: "", proteinaId: "", toppingIds: [] as string[], tab: 0 as 0 | 1 | 2 });
  useEffect(() => {
    sel.current = { baseId, proteinaId, toppingIds, tab };
  }, [baseId, proteinaId, toppingIds, tab]);

  // W4: la escena NO se desmonta al pedir. faseRef gobierna el loop; estadoRef lo lee sin re-render.
  const faseRef = useRef<"arma" | "espera">("arma");
  const estadoRef = useRef<EstadoPedido>("recibido");
  const estadoAnimRef = useRef<{ last: EstadoPedido; campana: boolean }>({ last: "recibido", campana: false });
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  // ------- precio (espejo de crearPedido) -------
  const all = [...bases, ...proteinas, ...toppings];
  const find = (id: string) => all.find((i) => i.id === id);
  const tops = toppingIds.map(find).filter(Boolean) as Ingrediente[];
  const subtotal =
    (find(baseId)?.precio ?? 0) +
    (find(proteinaId)?.precio ?? 0) +
    tops.reduce((sum, t, i) => sum + (i < incluidos ? 0 : t.precio), 0);
  const impuesto = Math.round((subtotal * impuestoPct) / 100);
  const total = subtotal + impuesto;

  // ------- mundo del juego (refs, cero re-render) -------
  const world = useRef({
    sprites: new Map<string, Off>(),
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
    combo: 0,
    comboT: -9999,
    lastTab: 0,
    tabT: 0,
    lastAct: 0,
    pressed: "",
    bg: null as Off | null, // fondo horneado (crema+luz+mostrador+grano) por resize
    vig: null as Off | null, // viñeta + velo cálido cacheados por resize
    dotSprite: null as Off | null, // partícula de vapor horneada (dot suave)
    entered: false, // one-shot del squash de entrada de la caja
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
      lado: 1 as 1 | -1, // de qué lado de la caja sale (alterna)
      init: false,
    },
    t: 0,
    dt: 1 / 60,
    df: 1,
  });

  // hornear sprites al montar (y si cambia el catálogo)
  useEffect(() => {
    const m = world.current.sprites;
    const col = world.current.colores;
    m.clear();
    col.clear();
    for (const ing of all) {
      const spr = bakeSprite(ing);
      m.set(ing.id, spr);
      col.set(ing.id, muestrearColor(spr));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bases, proteinas, toppings]);

  // ------- acciones -------
  /** Despacha al FIDEO MESERO: sale de la caja hacia la carta (cx,cy). */
  const despachar = useCallback(
    (ing: Ingrediente, cx: number, cy: number) => {
      s.ruido(0.05, 0.05, 1600);
      s.tone(240, 0.09, "sine", 0.05, 640); // latigazo hacia arriba
      if (navigator.vibrate) navigator.vibrate(10);
      const wd = world.current;
      wd.fideos.push({
        ing,
        tx: cx,
        ty: cy,
        t0: wd.t,
        dir: "traer",
        off: ((wd.fideoN++ % 3) - 1) * 26,
        drop: (Math.random() - 0.5) * 2,
        seed: Math.random() * 10,
      });
    },
    [s],
  );

  const tapIngrediente = useCallback(
    (ing: Ingrediente, cx: number, cy: number) => {
      if (ing.agotado || world.current.folding) return;
      const cat = ing.categoria;
      if (cat === "base") {
        if (sel.current.baseId === ing.id) return;
        setBaseId(ing.id);
        world.current.pila = world.current.pila.filter((p) => {
          const it = find(p.id);
          return it?.categoria !== "base";
        });
        despachar(ing, cx, cy);
      } else if (cat === "proteina") {
        if (sel.current.proteinaId === ing.id) return;
        setProteinaId(ing.id);
        world.current.pila = world.current.pila.filter((p) => find(p.id)?.categoria !== "proteina");
        despachar(ing, cx, cy);
      } else {
        if (sel.current.toppingIds.includes(ing.id)) {
          // el fideo lo SACA de la caja y lo devuelve a su carta
          setToppingIds((prev) => prev.filter((t) => t !== ing.id));
          world.current.pila = world.current.pila.filter((p) => p.id !== ing.id);
          world.current.resettle = true; // los de arriba caen al hueco que dejó
          world.current.fideos.push({
            ing,
            tx: cx,
            ty: cy,
            t0: world.current.t,
            dir: "sacar",
            off: ((world.current.fideoN++ % 3) - 1) * 22,
            drop: 0,
            seed: Math.random() * 10,
          });
          s.ruido(0.05, 0.04, 1400);
          return;
        }
        setToppingIds((prev) => [...prev, ing.id]);
        despachar(ing, cx, cy);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [despachar, s],
  );

  const confirmar = useCallback(async () => {
    if (!abierto || enviando || !baseId || world.current.folding) return;
    setEnviando(true);
    world.current.folding = true;
    s.confirmar();
    if (navigator.vibrate) navigator.vibrate([18, 40, 24]);
    await new Promise((r) => setTimeout(r, 950)); // la caja se pliega en el canvas
    try {
      const r = await enviarPedido({
        baseId,
        proteinaId: proteinaId || proteinas[0]?.id || "",
        toppingIds,
        canal: "qr",
        tipo: "mesa",
        mesa,
      });
      setPedido({ id: r.id, total: r.total });
      setEstado(r.estado as EstadoPedido);
      estadoRef.current = r.estado as EstadoPedido;
      estadoAnimRef.current = { last: r.estado as EstadoPedido, campana: false };
      faseRef.current = "espera"; // el canvas NO se desmonta: pasa a teatro de espera
    } catch {
      world.current.folding = false;
      world.current.fold = 0;
      world.current.selloHecho = false;
    }
    setEnviando(false);
  }, [abierto, enviando, baseId, proteinaId, toppingIds, mesa, proteinas, s]);

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

    // ---- ESCENARIO horneado: crema + pool de luz ↖ + mostrador con canto + veta + GRANO ----
    const bakeBg = () => {
      const c = document.createElement("canvas");
      c.width = Math.max(2, Math.round(W));
      c.height = Math.max(2, Math.round(H));
      const g = c.getContext("2d")!;
      const woodY = H * 0.42; // la mesa sube para que la caja se APOYE en ella (no flote)
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
        const t = (H - woodY) / (H - vpy);
        const xBack = vpx + (xFront - vpx) * (1 - t) * 0 + (xFront - vpx) * ((woodY - vpy) / (H - vpy));
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
      // GRANO monocromo (dithering barato) → mata el banding en OLED. Horneado, 0/frame.
      const gn = 42;
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
      bakeBg();
      bakeVig();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---------- geometría de la escena ----------
    const geo = () => {
      const boxW = Math.min(W * 0.66, 300);
      const boxH = boxW * 0.78;
      const boxX = W / 2;
      const boxY = H * 0.32;
      const trayY = H * 0.555; // pestañas
      const cardW = 92;
      const cardH = 118;
      const cardY = trayY + 34 + cardH / 2; // fila de cartas (sin solapar pestañas)
      return { boxW, boxH, boxX, boxY, trayY, cardY, cardW, cardH };
    };

    const listaActiva = (): Ingrediente[] =>
      sel.current.tab === 0 ? bases : sel.current.tab === 1 ? proteinas : toppings;

    /** Radio de colisión (px) según categoría — la comida ocupa ~0.35 del sprite. */
    const radioDe = (cat: string, sc: number) => SPR * sc * 0.35;

    /**
     * FÍSICA DE APILADO: dónde reposa un círculo de radio r soltado en x local `lxIn`.
     * Cae hasta tocar la cama (la base levanta el piso) o apoyarse SOBRE otro item ya
     * asentado (colisión circular con solape buscado — la comida real se toca).
     */
    const reposo = (lxIn: number, r: number, excluirId?: string) => {
      const { boxW, boxH } = geo();
      const wd = world.current;
      const hayBase = wd.pila.some((p) => find(p.id)?.categoria === "base");
      const lim = boxW * 0.3;
      const lx = Math.max(-lim, Math.min(lim, lxIn));
      let y = (hayBase ? -0.16 : -0.04) * boxH - r * 0.35;
      for (const p of wd.pila) {
        if (p.id === excluirId || find(p.id)?.categoria === "base") continue;
        const dx = lx - p.fx * boxW;
        const md = (r + p.r * boxW) * 0.72;
        if (Math.abs(dx) < md) {
          const dy = Math.sqrt(md * md - dx * dx) * 0.8;
          y = Math.min(y, p.ty * boxH - dy);
        }
      }
      return { lx, y };
    };

    /** Aterrizaje: el item se queda DONDE la física lo dejó (x real del vuelo) + squash + precio. */
    const aterrizar = (ing: Ingrediente, xScreen: number, energia = 1) => {
      const wd = world.current;
      const { boxW, boxH, boxX, boxY } = geo();
      const cat = ing.categoria;
      wd.pila = wd.pila.filter((p) => !(cat !== "topping" && find(p.id)?.categoria === cat));
      let fx = 0;
      let ty = -0.1;
      let rot = (Math.random() - 0.5) * 0.5;
      let sc = 0.58;
      if (cat === "base") {
        // la CAMA: ancha, casi plana, al fondo
        rot = (Math.random() - 0.5) * 0.06;
        sc = 1.18;
      } else {
        sc = cat === "proteina" ? 0.8 : 0.58;
        if (cat === "proteina") rot = (Math.random() - 0.5) * 0.25;
        const r = radioDe(cat, sc);
        // rueda hacia el hueco: prueba la x real ±8px y se queda en la MÁS asentada
        let best = reposo(xScreen - boxX, r);
        for (const dxTry of [-8, 8]) {
          const c = reposo(xScreen - boxX + dxTry, r);
          if (c.y > best.y) best = c;
        }
        fx = best.lx / boxW;
        ty = best.y / boxH;
      }
      wd.pila.push({ id: ing.id, fx, fy: ty - 0.035, ty, rot, s: sc, r: radioDe(cat, sc) / boxW, land: 1 });
      if (cat !== "topping") wd.resettle = true; // cambió la cama → el montón se reacomoda
      wd.boxSquash = 1;
      s.caida(ing, energia); // suena al aterrizar, con energía cinética de la caída
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
      const nP = 6 + Math.floor(energia * 5);
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
      for (const pv of wd.pops) pv.y -= 22;
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
    };

    // ---------- input: tap vs drag de bandeja ----------
    let downX = 0;
    let downY = 0;
    let moved = 0;
    let dragging = false;
    let lastX = 0;

    /** Devuelve la carta bajo (x,y) — o null. */
    const cartaEn = (x: number, y: number): { ing: Ingrediente; cx: number } | null => {
      const { cardY, cardW, cardH } = geo();
      if (y < cardY - cardH / 2 - 6 || y > cardY + cardH / 2 + 6) return null;
      const lista = listaActiva().filter((i) => i.activo);
      const step = cardW + 10;
      const totalW = lista.length * step;
      const x0 = Math.max(14, (W - totalW) / 2) - world.current.trayScroll;
      for (let k = 0; k < lista.length; k++) {
        const cx = x0 + k * step + cardW / 2;
        if (Math.abs(x - cx) < cardW / 2) return { ing: lista[k], cx };
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      s.unlock();
      if (faseRef.current !== "arma") return; // en espera la escena no recibe toques
      const r = canvas.getBoundingClientRect();
      downX = e.clientX - r.left;
      downY = e.clientY - r.top;
      lastX = downX;
      moved = 0;
      dragging = downY > geo().trayY + 40; // solo la fila de cartas se arrastra
      world.current.lastAct = world.current.t;
      const c = cartaEn(downX, downY);
      world.current.pressed = c ? c.ing.id : "";
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!e.buttons) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      moved += Math.abs(x - lastX);
      if (moved > 8) world.current.pressed = "";
      if (dragging) {
        world.current.trayScroll -= x - lastX;
        world.current.trayVel = -(x - lastX);
        // rastro dorado del pulgar (Fruit Ninja) — solo si se mueve de verdad
        if (Math.abs(x - lastX) > 1.5) {
          const tr = world.current.trail;
          tr.push({ x, y: e.clientY - r.top, life: 1 });
          if (tr.length > 14) tr.shift();
        }
      }
      lastX = x;
    };
    const onUp = (e: PointerEvent) => {
      if (faseRef.current !== "arma") return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      world.current.pressed = "";
      world.current.lastAct = world.current.t;
      if (moved > 8) return; // fue drag
      const { trayY, cardY } = geo();
      // pestañas
      if (y > trayY - 26 && y < trayY + 24) {
        const tw = Math.min(W / 3 - 8, 128);
        for (let k = 0; k < 3; k++) {
          const tx = W / 2 + (k - 1) * (tw + 8);
          if (Math.abs(x - tx) < tw / 2) {
            setTab(k as 0 | 1 | 2);
            s.tone(600 + k * 120, 0.06, "triangle", 0.08);
            return;
          }
        }
      }
      // cartas
      const c = cartaEn(x, y);
      if (c) tapIngrediente(c.ing, c.cx, cardY);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    // ---------- helpers de dibujo ----------
    const kraft = (x: number, y: number, w: number, h: number, r0: number, light: number) => {
      const grad = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
      grad.addColorStop(0, `rgba(${216 + light},${173 + light},${108 + light},1)`);
      grad.addColorStop(0.5, "#C69A5B");
      grad.addColorStop(1, "#A87B42");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, r0);
      ctx.fill();
    };

    // scratch buffers para la hebra (cero alocación por frame)
    const FN = 22;
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
      holdSpr: Off | null,
      eyes: boolean,
      pupilDown = 0,
    ) => {
      const wd = world.current;
      const wob = Math.sin(wd.t * 0.22 + seed) * 7;
      const wob2 = Math.cos(wd.t * 0.18 + seed * 1.7) * 6;
      const dx = tipX - ax;
      const dy = tipY - ay;
      // control points: la S nace hacia arriba (sale de la caja) y llega a la cabeza
      const c1x = ax + dx * 0.16 + wob;
      const c1y = ay - 48 + wob2 * 0.6 + dy * 0.1;
      const c2x = ax + dx * 0.74 - wob * 0.6;
      const c2y = Math.min(ay, tipY) - 42 + wob2;
      for (let k = 0; k <= FN; k++) {
        const t = k / FN;
        const mt = 1 - t;
        fx0[k] = mt * mt * mt * ax + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * tipX;
        fy0[k] = mt * mt * mt * ay + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * tipY;
      }
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // ancho por nodo: TAPER de la base (7.5) al cuello (3.2), con leve respiración
      const wBase = 7.6;
      const wTip = 3.2;
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
      const headG = ctx.createRadialGradient(-2, -3, 1, 0, 0, 9);
      headG.addColorStop(0, "#FBD27A");
      headG.addColorStop(0.6, "#EEAE3C");
      headG.addColorStop(1, "#B67C22");
      ctx.fillStyle = headG;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.4, 6.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,252,240,0.8)";
      ctx.beginPath();
      ctx.arc(-1.8, -2.4, 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();

      // ===== OJITOS — SIEMPRE (el ADN del personaje). Perpendiculares al avance =====
      if (eyes) {
        const perX = -dirY;
        const perY = dirX;
        const blink = wd.t % 190 < 7 ? 0.14 : 1;
        for (const sd of [-1, 1]) {
          const ex = tipX - dirX * 0.5 + perX * sd * 2.7;
          const ey = tipY - dirY * 0.5 + perY * sd * 2.7;
          ctx.fillStyle = "#2A1608";
          ctx.save();
          ctx.translate(ex, ey + pupilDown);
          ctx.scale(1, blink);
          ctx.beginPath();
          ctx.arc(0, 0, 1.9, 0, TAU);
          ctx.fill();
          ctx.restore();
          if (blink === 1) {
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.beginPath();
            ctx.arc(ex - 0.6, ey - 0.7 + pupilDown, 0.65, 0, TAU);
            ctx.fill();
          }
        }
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
      const { boxW, boxH, boxX, boxY, trayY, cardY, cardW, cardH } = geo();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      // ===== SOMBRA de la caja SOBRE LA MESA (espacio de pantalla, difusa) — la aterriza =====
      // sin esto la caja "flota"; la sombra vive en la superficie, desplazada ↘ por la luz ↖.
      {
        const baseYm = boxY + boxH * 0.32 + entY + focoY + boxH * 0.16 * focoScale;
        const grd = ctx.createRadialGradient(boxX + 10, baseYm, 4, boxX + 10, baseYm, boxW * 0.62 * focoScale);
        grd.addColorStop(0, "rgba(30,16,6,0.42)");
        grd.addColorStop(0.6, "rgba(30,16,6,0.22)");
        grd.addColorStop(1, "rgba(30,16,6,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(boxX + 10, baseYm, boxW * 0.62 * focoScale, boxH * 0.16 * focoScale, 0, 0, TAU);
        ctx.fill();
      }

      // ===== LA MASCOTA — el fideo SIEMPRE presente. Vive a un lado de la caja (hogar fijo) y
      // se mueve CONSTANTEMENTE por 8 modos aleatorios. Se dibuja ANTES de la caja → SALE DE
      // DETRÁS (la caja ocluye su base). Solo se oculta durante una acción o el plegado.
      if (faseRef.current === "arma" && wd.fideos.length === 0 && wd.vuelos.length === 0 && !wd.folding) {
        const m = wd.masc;
        const mby = boxY + boxH * 0.32 + entY + focoY; // base de la caja en pantalla
        const ax = boxX + m.lado * boxW * 0.4; // hogar: justo detrás del costado de la caja
        const ay = mby - boxH * 0.3; // ancla a media altura, tras la caja
        const up = boxH * 0.62;
        if (!m.init) {
          m.init = true;
          m.hx = ax;
          m.hy = ay - up * 0.6;
          m.modeT = wd.t;
        }
        if (wd.t - m.modeT > m.dur) {
          let nm = Math.floor(Math.random() * 8);
          if (nm === m.mode) nm = (nm + 1) % 8;
          m.mode = nm;
          m.modeT = wd.t;
          m.dur = 55 + Math.random() * 130; // ~1-3s por modo
          if (Math.random() < 0.32) m.lado = m.lado === 1 ? -1 : 1;
        }
        const age = wd.t - m.modeT;
        const io = -m.lado; // hacia la caja
        let tx = ax;
        let ty = ay - up;
        let pupil = 0.4;
        if (reduce) {
          ty = ay - up * 0.7;
        } else {
          switch (m.mode) {
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
            default: // 7: esconderse tras la caja y reasomar
              ty = ay - up * (age < m.dur * 0.45 ? 0.1 : 0.95);
              tx = ax;
              pupil = 0.4;
              break;
          }
        }
        [m.hx, m.hvx] = springStep(m.hx, m.hvx, tx, 170, 19, dt);
        [m.hy, m.hvy] = springStep(m.hy, m.hvy, ty, 170, 19, dt);
        m.pupil += (pupil - m.pupil) * (1 - Math.pow(0.86, df));
        drawFideo(ax, ay, m.hx, m.hy, 5, null, true, m.pupil);
      }

      ctx.save();
      ctx.translate(boxX, boxY + boxH * 0.32 + entY + focoY);
      ctx.scale((1 + wd.boxSquash * 0.05) * focoScale, (squash - wd.boxSquash * 0.05) * focoScale);
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
        ctx.roundRect(-boxW * 0.42, -boxH * 0.42, boxW * 0.84, boxH * 0.48, 8);
        ctx.fill();
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
        ctx.roundRect(-boxW * 0.42, -boxH * 0.42, boxW * 0.84, boxH * 0.3, 8);
        ctx.fill();
        const inR = ctx.createLinearGradient(boxW * 0.42, 0, boxW * 0.18, 0);
        inR.addColorStop(0, "rgba(40,22,8,0.4)");
        inR.addColorStop(1, "rgba(40,22,8,0)");
        ctx.fillStyle = inR;
        ctx.beginPath();
        ctx.roundRect(boxW * 0.12, -boxH * 0.42, boxW * 0.3, boxH * 0.48, 8);
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

        // solapas laterales: se DESPLIEGAN al abrir (ángulo animado por `abre`)
        const flapW = boxW * 0.22;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * boxW * 0.42, -boxH * 0.34);
          ctx.rotate(side * 0.85 * abre);
          const grad = ctx.createLinearGradient(0, 0, side * flapW, -flapW * 0.5);
          grad.addColorStop(0, "#C69A5B");
          grad.addColorStop(1, "#E2BA7E");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(0, boxH * 0.1);
          ctx.lineTo(side * flapW, -flapW * 0.35);
          ctx.lineTo(side * flapW * 0.7, -flapW * 0.6);
          ctx.lineTo(0, -boxH * 0.02);
          ctx.closePath();
          ctx.fill();
          // canto iluminado del pliegue
          ctx.strokeStyle = "rgba(255,236,195,0.35)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(0, -boxH * 0.02);
          ctx.lineTo(side * flapW * 0.7, -flapW * 0.6);
          ctx.stroke();
          ctx.restore();
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
          // se quitó algo o cambió la cama → los de arriba resbalan hacia los huecos
          wd.resettle = false;
          for (const p of wd.pila) {
            if (find(p.id)?.categoria === "base") continue;
            p.ty = reposo(p.fx * boxW, p.r * boxW, p.id).y / boxH;
          }
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(-boxW * 0.44, -boxH * 0.95, boxW * 0.88, boxH * 1.1);
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
        // sort ESTABLE: capa (cama→proteína→toppings) y, dentro, orden de llegada = orden de apilado
        const ordenada = [...wd.pila].sort((a, b) => capa(a.id) - capa(b.id));
        for (const p of ordenada) {
          const spr = wd.sprites.get(p.id);
          if (!spr) continue;
          p.fy += (p.ty - p.fy) * (1 - Math.pow(0.75, df)); // micro-asentamiento (dt-normalizado)
          const cp = capa(p.id);
          const lx = p.fx * boxW;
          const ly = cp === 0 ? -boxH * 0.06 : p.fy * boxH; // la base descansa en el suelo
          const rp = p.r * boxW;
          if (cp === 0) {
            // CAMA: sombra ancha y plana que la asienta en el suelo
            ctx.fillStyle = "rgba(40,22,8,0.34)";
            ctx.beginPath();
            ctx.ellipse(lx + 2, ly + boxH * 0.05, boxW * 0.32, boxH * 0.07, 0, 0, TAU);
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
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(p.rot);
          // SQUASH de aterrizaje con conservación de volumen (aplasta ancho, recupera)
          const sq = p.land * 0.32;
          ctx.scale(1 + sq, 1 - sq);
          const sz = SPR * (cp === 0 ? p.s * 1.06 : p.s); // la cama, un poco más ancha
          // niebla cálida de profundidad: los items más ALTOS (al fondo) se atenúan un pelo
          const prof = clamp((-ly - boxH * 0.02) / (boxH * 0.28), 0, 1);
          ctx.globalAlpha = 1 - prof * 0.14;
          ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
          ctx.globalAlpha = 1;
          ctx.restore();
        }
        ctx.restore();
        // labio interior: la sombra del borde frontal CAE sobre la comida (está DENTRO)
        const lip = ctx.createLinearGradient(0, boxH * 0.06, 0, -boxH * 0.06);
        lip.addColorStop(0, "rgba(40,22,8,0.4)");
        lip.addColorStop(1, "rgba(40,22,8,0)");
        ctx.fillStyle = lip;
        ctx.fillRect(-boxW * 0.42, -boxH * 0.06, boxW * 0.84, boxH * 0.12);
      }

      // banda FRONTAL kraft (baja: deja ver la comida) + wordmark emboss
      kraft(0, boxH * 0.22, boxW, boxH * 0.34, 9, 8);
      const sheen = ctx.createLinearGradient(-boxW / 2, boxH * 0.05, boxW / 2, boxH * 0.4);
      sheen.addColorStop(0, "rgba(255,240,210,0.4)");
      sheen.addColorStop(0.45, "rgba(255,240,210,0)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.roundRect(-boxW / 2, boxH * 0.05, boxW, boxH * 0.34, 9);
      ctx.fill();
      // canto superior iluminado ↖ + pliegue central del kraft
      ctx.strokeStyle = "rgba(255,240,205,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-boxW / 2 + 9, boxH * 0.056);
      ctx.lineTo(boxW / 2 - 9, boxH * 0.056);
      ctx.stroke();
      ctx.strokeStyle = "rgba(90,58,24,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, boxH * 0.07);
      ctx.lineTo(0, boxH * 0.37);
      ctx.stroke();
      // wordmark con letterpress (luz ↖: brillo arriba, tinta abajo)
      ctx.font = fontD(11, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,240,210,0.55)";
      ctx.fillText("P A P A G H E T T I", 0, boxH * 0.23 + 1);
      ctx.fillStyle = "rgba(90,58,24,0.9)";
      ctx.fillText("P A P A G H E T T I", 0, boxH * 0.23);

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

      // ===== chispas doradas (sello) =====
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
            : boxY + reposo(v.x - boxX, radioDe(catV, v.scT)).y;
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
            v.bounces++;
            v.vy *= -0.38;
            v.vx *= 0.5;
            wd.boxSquash = 1;
            s.ruido(0.04, 0.05, 900);
            if (navigator.vibrate) navigator.vibrate(10); // haptic SOLO en el 1er contacto
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

      // ===== partículas del color de la comida (burst de aterrizaje) =====
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
        ctx.globalAlpha = Math.min(1, pa.life * 1.6);
        ctx.fillStyle = pa.color;
        ctx.beginPath();
        ctx.arc(pa.x, pa.y, pa.r * (0.4 + pa.life * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ===== vapor idle de la caja (más generoso cuando el plato está completo: "se ve rico") =====
      const completo =
        !!sel.current.baseId && !!sel.current.proteinaId && sel.current.toppingIds.length > 0;
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
      // pestañas
      const tabsTxt = ["LA BASE", "PROTEÍNA", "TOPPINGS"] as const;
      const tw = Math.min(W / 3 - 8, 128);
      for (let k = 0; k < 3; k++) {
        const tx = W / 2 + (k - 1) * (tw + 8);
        const activo = sel.current.tab === k;
        ctx.fillStyle = activo ? "#F2A516" : "rgba(251,241,222,0.16)";
        ctx.beginPath();
        ctx.roundRect(tx - tw / 2, trayY - 22, tw, 40, 999);
        ctx.fill();
        ctx.font = fontB(12, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = activo ? "#1E1611" : "rgba(251,241,222,0.85)";
        ctx.fillText(tabsTxt[k], tx, trayY - 2);
        // check de completado (ámbar, disciplina de color — nunca verde-UI)
        const done = k === 0 ? !!sel.current.baseId : k === 1 ? !!sel.current.proteinaId : sel.current.toppingIds.length > 0;
        if (done && !activo) {
          ctx.fillStyle = "#F2A516";
          ctx.beginPath();
          ctx.arc(tx + tw / 2 - 12, trayY - 12, 4.5, 0, TAU);
          ctx.fill();
        }
      }
      // inercia del scroll
      if (Math.abs(wd.trayVel) > 0.2 && !dragging) {
        wd.trayScroll += wd.trayVel * df;
        wd.trayVel *= Math.pow(0.92, df);
      }
      const lista = listaActiva().filter((i) => i.activo);
      const step = cardW + 10;
      const totalW2 = lista.length * step;
      const maxScroll = Math.max(0, totalW2 - W + 28);
      wd.trayScroll = Math.max(0, Math.min(maxScroll, wd.trayScroll));
      const x0 = Math.max(14, (W - totalW2) / 2) - wd.trayScroll;
      for (let k = 0; k < lista.length; k++) {
        const ing = lista[k];
        const cx = x0 + k * step + cardW / 2;
        if (cx < -cardW || cx > W + cardW) continue;
        const selr =
          ing.id === sel.current.baseId ||
          ing.id === sel.current.proteinaId ||
          sel.current.toppingIds.includes(ing.id);
        // entrada escalonada al cambiar de pestaña
        const ap = Math.min(1, Math.max(0, (wd.t - wd.tabT - k * 2) / 10));
        const ea = easeOutCubic(ap);
        const bob = Math.sin(wd.t * 0.04 + k) * 2;
        const press = wd.pressed === ing.id ? 0.94 : 1;
        ctx.save();
        ctx.translate(cx, cardY + bob + (1 - ea) * 30);
        ctx.scale(press, press);
        ctx.globalAlpha = ea;
        // carta (coordenadas locales: centro en 0,0)
        ctx.fillStyle = "rgba(30,16,8,0.35)";
        ctx.beginPath();
        ctx.roundRect(-cardW / 2 + 2, -cardH / 2 + 4, cardW, cardH, 14);
        ctx.fill();
        ctx.fillStyle = selr ? "#FFF3D6" : "#FBF1DE";
        ctx.beginPath();
        ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 14);
        ctx.fill();
        if (selr) {
          ctx.lineWidth = 3 + Math.sin(wd.t * 0.09 + k) * 0.6;
          ctx.strokeStyle = "#F2A516";
          ctx.beginPath();
          ctx.roundRect(-cardW / 2 + 1.5, -cardH / 2 + 1.5, cardW - 3, cardH - 3, 12);
          ctx.stroke();
        }
        // sprite (los elegidos se mecen contentos)
        const spr = wd.sprites.get(ing.id);
        if (spr) {
          ctx.globalAlpha = ea * (ing.agotado ? 0.35 : 1);
          if (selr) {
            ctx.save();
            ctx.translate(0, -cardH / 2 + 37);
            ctx.rotate(Math.sin(wd.t * 0.09 + k * 1.3) * 0.07);
            ctx.drawImage(spr, -33, -33, 66, 66);
            ctx.restore();
          } else {
            ctx.drawImage(spr, -33, -cardH / 2 + 4, 66, 66);
          }
          ctx.globalAlpha = ea;
        }
        // nombre (2 líneas máx)
        ctx.font = fontB(10, 700);
        ctx.textAlign = "center";
        ctx.fillStyle = "#1E1611";
        const words = ing.nombre.split(" ");
        const l1 = words.slice(0, 2).join(" ").slice(0, 14);
        const l2 = words.slice(2).join(" ").slice(0, 14);
        ctx.fillText(l1, 0, cardH / 2 - (l2 ? 34 : 26));
        if (l2) ctx.fillText(l2, 0, cardH / 2 - 24);
        // precio — disciplina de color: espresso, nunca rojo; GRATIS como chip kraft
        const idxT = sel.current.toppingIds.indexOf(ing.id);
        const esGratis = ing.categoria === "topping" && idxT >= 0 && idxT < incluidos;
        ctx.font = fontB(10, 800);
        if (esGratis && !ing.agotado) {
          ctx.fillStyle = "#C69A5B";
          ctx.beginPath();
          ctx.roundRect(-24, cardH / 2 - 20, 48, 15, 8);
          ctx.fill();
          ctx.fillStyle = "#2A1C0E";
          ctx.fillText("GRATIS", 0, cardH / 2 - 11.5);
        } else {
          ctx.fillStyle = ing.agotado ? "#9A8C7A" : "#5A3A18";
          ctx.fillText(
            ing.agotado ? "AGOTADO" : ing.precio > 0 ? formatCOP(ing.precio) : "—",
            0,
            cardH / 2 - 11,
          );
        }
        // check
        if (selr) {
          ctx.fillStyle = "#F2A516";
          ctx.beginPath();
          ctx.arc(cardW / 2 - 13, -cardH / 2 + 13, 9, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "#1E1611";
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(cardW / 2 - 17, -cardH / 2 + 13);
          ctx.lineTo(cardW / 2 - 14, -cardH / 2 + 16.5);
          ctx.lineTo(cardW / 2 - 9, -cardH / 2 + 9);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // pista de scroll — un fideíto ondulado
      if (maxScroll > 0) {
        const trackX = W * 0.3;
        const trackW = W * 0.4;
        const yb = cardY + cardH / 2 + 14;
        ctx.lineCap = "round";
        const onda = (xa: number, xb: number) => {
          ctx.beginPath();
          for (let xx = xa; xx <= xb; xx += 5) {
            const yy = yb + Math.sin(xx * 0.14) * 2.2;
            if (xx === xa) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        };
        ctx.strokeStyle = "rgba(251,241,222,0.22)";
        ctx.lineWidth = 3;
        onda(trackX, trackX + trackW);
        const th = trackW * (W / (totalW2 + 1));
        const tx0 = trackX + (trackW - th) * (wd.trayScroll / maxScroll);
        ctx.strokeStyle = "#F2A516";
        ctx.lineWidth = 3.4;
        onda(tx0, tx0 + th);
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
        // el FIDEO MESERO camarero: asoma junto a la caja y actúa el estado
        const wob = Math.sin(wd.t * 0.06);
        const anchXe = boxX - boxW * 0.32;
        const anchYe = by - boxH * 0.02;
        let tipXe = anchXe;
        let tipYe = by - boxH * 0.4;
        let ticket = false;
        if (est === "recibido") {
          tipXe = boxX - boxW * 0.08 + wob * 8; // lleva la comanda a la caja
          tipYe = by - boxH * 0.52;
          ticket = true;
        } else if (est === "cocina") {
          tipXe = anchXe + 6 + wob * 12; // atiza el horno (sube y baja)
          tipYe = by - boxH * 0.5 + Math.sin(wd.t * 0.13) * 12;
        } else if (est === "listo") {
          tipXe = boxX + Math.sin(wd.t * 0.26) * 18; // toca la campanita
          tipYe = by - boxH * 0.62;
        } else {
          tipXe = anchXe - 10; // reverencia y se va
          tipYe = by - boxH * 0.24 + Math.sin(wd.t * 0.05) * 6;
        }
        drawFideo(anchXe, anchYe, tipXe, tipYe, 5.5, null, true, 0.4);
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

      // ===== EL FIDEO MESERO (encima de la bandeja: agarra sobre las cartas) =====
      const mouthYBase = boxY - boxH * 0.34;
      for (let i = wd.fideos.length - 1; i >= 0; i--) {
        const fd = wd.fideos[i];
        const age = wd.t - fd.t0;
        const mouthX = boxX + fd.off;
        const anchX = boxX + fd.off * 0.5;
        const anchY = boxY - boxH * 0.1;
        let tipX = 0;
        let tipY = 0;
        let holding = false;
        let eyes = false;
        if (fd.dir === "traer") {
          if (age <= F_EXT) {
            const u = easeOutCubic(age / F_EXT);
            const cxm = (mouthX + fd.tx) / 2;
            const cym = Math.min(mouthYBase, fd.ty) - 60;
            tipX = bez2(mouthX, cxm, fd.tx, u);
            tipY = bez2(mouthYBase, cym, fd.ty, u);
            eyes = true;
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
          // sacar: levanta el ingrediente de la caja y lo devuelve a su carta
          if (age <= F_SUBIR) {
            const u = easeOutCubic(age / F_SUBIR);
            tipX = mouthX;
            tipY = mouthYBase - u * boxH * 0.35;
            holding = true;
          } else if (age <= F_SUBIR + F_LLEVAR) {
            const u = smooth((age - F_SUBIR) / F_LLEVAR);
            const apexX = (mouthX + fd.tx) / 2;
            const apexY = Math.min(mouthYBase - boxH * 0.5, fd.ty - 80);
            tipX = bez2(mouthX, apexX, fd.tx, u);
            tipY = bez2(mouthYBase - boxH * 0.35, apexY, fd.ty, u);
            holding = true;
          } else {
            for (let k = 0; k < 3; k++)
              wd.puffs.push({ x: fd.tx + (Math.random() - 0.5) * 24, y: fd.ty, life: 1, max: 30, r: 6, tipo: "polvo" });
            s.tone(340, 0.08, "triangle", 0.09, 200);
            wd.fideos.splice(i, 1);
            continue;
          }
        }
        void eyes;
        // muelle de la cabeza: persigue el objetivo con lag → anticipación + whip + follow-through
        if (fd.hx === undefined) {
          fd.hx = anchX;
          fd.hy = anchY;
          fd.hvx = 0;
          fd.hvy = 0;
        }
        [fd.hx, fd.hvx] = springStep(fd.hx!, fd.hvx!, tipX, 320, 26, dt);
        [fd.hy, fd.hvy] = springStep(fd.hy!, fd.hvy!, tipY, 320, 26, dt);
        drawFideo(anchX, anchY, fd.hx!, fd.hy!, fd.seed, holding ? wd.sprites.get(fd.ing.id) ?? null : null, true);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bases, proteinas, toppings, incluidos]);

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
    setToppingIds([]);
    setProteinaId("");
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
      if (proteinaId) drawSpr(proteinaId, bw * 0.02, bh * 0.02, 300);
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
      const extras = [find(proteinaId)?.nombre, ...tl.map((t) => t.nombre)].filter(Boolean) as string[];
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
        await navigator.share({ files: [file], title: "Mi caja Papaghetti", text: "Armé mi caja en Papaghetti 🍝" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mi-caja-papaghetti.png";
        a.click();
        URL.revokeObjectURL(url);
        window.open("https://wa.me/?text=" + encodeURIComponent("Armé mi caja en Papaghetti 🍝 papaghetti.vercel.app"), "_blank");
      }
    } catch {
      /* usuario canceló el share o no soportado */
    } finally {
      setCompartiendo(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, mesa, baseId, proteinaId, toppingIds]);

  /* Un solo árbol DOM: el canvas NUNCA se desmonta (arma → teatro de espera). La barra
     inferior cambia; un aria-live anuncia el estado para lectores de pantalla. */
  return (
    <div className="emp-game" onPointerDown={s.unlock}>
      <header className="emp-top emp-top--game">
        <div className="emp-top__brand">
          <b>{negocio.toUpperCase()}</b>
          <span>· MESA {mesa}</span>
        </div>
        <div className="emp-top__actions">
          <button type="button" className="emp-mini" onClick={s.toggleMute} aria-label="Sonido">
            {s.mute ? "🔇" : "🔊"}
          </button>
          {!pedido && (
            <button type="button" className="emp-mini emp-modo" onClick={props.onModoRapido}>
              ⚡ PEDIR YA
            </button>
          )}
        </div>
      </header>
      {!abierto && !pedido && <div className="emp-cerrado emp-cerrado--game">😴 Estamos cerrados ahora.</div>}
      <canvas ref={canvasRef} className="emp-canvas" aria-label="Arma tu caja Papaghetti" />

      <p className="emp-sr" aria-live="polite">
        {pedido ? `Pedido ${pedido.id}, estado: ${estadoLabel[estado]}` : ""}
      </p>

      {!pedido ? (
        <footer className="emp-bar emp-bar--game">
          <div className="emp-total">
            <small>
              {tops.length > incluidos
                ? `${incluidos} gratis · ${tops.length - incluidos} con precio`
                : `toppings gratis: ${tops.length}/${incluidos}`}
              {impuesto > 0 ? ` · imp. ${formatCOP(impuesto)}` : ""}
            </small>
            <b>{formatCOP(total)}</b>
          </div>
          <button
            type="button"
            className={`emp-cta ${abierto && baseId && !enviando ? "emp-cta--vivo" : ""}`}
            onClick={confirmar}
            disabled={!abierto || enviando || !baseId}
          >
            {enviando ? "Cerrando…" : "EMPLATAR →"}
          </button>
        </footer>
      ) : (
        <footer className="emp-bar emp-bar--game emp-bar--espera">
          <div className="emp-espera">
            <div className="emp-espera__id">
              Pedido <b>#{pedido.id}</b> · {formatCOP(pedido.total)}
            </div>
            <ol className="emp-pasos" aria-hidden>
              {(["recibido", "cocina", "listo"] as EstadoPedido[]).map((e, k) => (
                <li key={e} className={`${ordenIdx >= k ? "on" : ""} ${ordenIdx === k ? "now" : ""}`}>
                  <i />
                  {estadoLabel[e]}
                </li>
              ))}
            </ol>
          </div>
          <div className="emp-espera__acciones">
            <button type="button" className="emp-cta emp-cta--otra" onClick={compartirCaja} disabled={compartiendo}>
              {compartiendo ? "…" : "📸 Compartir"}
            </button>
            <button type="button" className="emp-cta emp-cta--sec emp-cta--otra" onClick={otraCaja}>
              Otra
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
