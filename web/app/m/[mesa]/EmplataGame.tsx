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

/* =========================================================================
   SPRITES — comida horneada con el modelo de luz del juego (una luz ↖).
   ========================================================================= */
type Off = HTMLCanvasElement;
const SPR = 96; // px del lienzo del sprite
const R = 34; // radio base de la comida dentro del sprite

function makeOff(): { c: Off; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = SPR;
  c.height = SPR;
  return { c, g: c.getContext("2d")! };
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

/** Pinta el sprite de un ingrediente según su id (regex) — o gema+emoji si no lo conocemos. */
function bakeSprite(ing: Ingrediente): Off {
  const { c, g } = makeOff();
  const cx = SPR / 2;
  const cy = SPR / 2;
  const id = ing.id;
  g.lineJoin = "round";
  g.lineCap = "round";
  ao(g, cx, cy, R);

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
    // desconocido → gema cálida con su emoji
    volumen(g, () => {
      g.beginPath();
      g.arc(cx, cy, R * 0.9, 0, TAU);
    }, cx, cy, R * 0.9, "#FFE2A0", ing.color || "#F2A516", "#6E4310");
    g.font = `${R * 1.1}px system-ui`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(ing.emoji || "🍽️", cx, cy + 2);
  }
  return c;
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
};
/** EL FIDEO MESERO — una hebra viva que trae/saca comida entre la carta y la caja. */
type Fideo = {
  ing: Ingrediente;
  tx: number; // objetivo (la carta)
  ty: number;
  t0: number;
  dir: "traer" | "sacar";
  off: number; // desplazamiento del ancla (hebras concurrentes)
  seed: number;
  grabbed?: boolean; // ya sonó el agarre
};
type PilaItem = { id: string; ox: number; oy: number; rot: number; s: number };
type Puff = { x: number; y: number; life: number; max: number; r: number; tipo: "vapor" | "polvo" };
type Pop = { x: number; y: number; life: number; texto: string; gratis: boolean };
type Chispa = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number };

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
    vuelos: [] as Vuelo[],
    fideos: [] as Fideo[],
    fideoN: 0,
    pila: [] as PilaItem[],
    puffs: [] as Puff[],
    pops: [] as Pop[],
    chispas: [] as Chispa[],
    trayScroll: 0,
    trayVel: 0,
    boxSquash: 0, // 0..1 al aterrizar algo
    fold: 0, // 0 abierto → 1 plegado (confirmar)
    folding: false,
    selloHecho: false,
    combo: 0,
    comboT: -9999,
    lastTab: 0,
    tabT: 0,
    lastAct: 0,
    pressed: "",
    wallPat: null as CanvasPattern | null,
    t: 0,
  });

  // hornear sprites al montar (y si cambia el catálogo)
  useEffect(() => {
    const m = world.current.sprites;
    m.clear();
    for (const ing of all) m.set(ing.id, bakeSprite(ing));
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
          world.current.fideos.push({
            ing,
            tx: cx,
            ty: cy,
            t0: world.current.t,
            dir: "sacar",
            off: ((world.current.fideoN++ % 3) - 1) * 22,
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
    if (!canvas || pedido) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---------- geometría de la escena ----------
    const geo = () => {
      const boxW = Math.min(W * 0.58, 250);
      const boxH = boxW * 0.78;
      const boxX = W / 2;
      const boxY = H * 0.295;
      const trayY = H * 0.555; // pestañas
      const cardW = 92;
      const cardH = 118;
      const cardY = trayY + 34 + cardH / 2; // fila de cartas (sin solapar pestañas)
      return { boxW, boxH, boxX, boxY, trayY, cardY, cardW, cardH };
    };

    const listaActiva = (): Ingrediente[] =>
      sel.current.tab === 0 ? bases : sel.current.tab === 1 ? proteinas : toppings;

    /** Aterrizaje en la caja: composición de la montañita + squash + vapor + precio + combo. */
    const aterrizar = (ing: Ingrediente) => {
      const wd = world.current;
      const { boxH, boxX, boxY } = geo();
      const cat = ing.categoria;
      wd.pila = wd.pila.filter((p) => !(cat !== "topping" && find(p.id)?.categoria === cat));
      // slot compuesto: la base es la CAMA (atrás), la proteína al frente-centro,
      // los toppings CORONAN arriba en abanico (la montañita sobresale de la caja)
      let ox = 0;
      let oy = 0;
      let rot = 0;
      let sc = 1;
      if (cat === "base") {
        ox = 0;
        oy = -0.3;
        rot = (Math.random() - 0.5) * 0.1;
        sc = 1.12;
      } else if (cat === "proteina") {
        ox = (Math.random() - 0.5) * 0.12;
        oy = 0.6;
        rot = (Math.random() - 0.5) * 0.3;
        sc = 0.82;
      } else {
        const k = wd.pila.filter((p) => find(p.id)?.categoria === "topping").length;
        const FAN = [-0.5, 0.5, 0, -0.85, 0.85, -0.25, 0.25, -0.65, 0.65, 0.1];
        ox = FAN[k % 10] + (Math.random() - 0.5) * 0.12;
        oy = -0.55 - (k % 3) * 0.5 + (Math.random() - 0.5) * 0.2;
        rot = (Math.random() - 0.5) * 0.7;
        sc = 0.58;
      }
      wd.pila.push({ id: ing.id, ox, oy, rot, s: sc });
      if (wd.pila.length > 18) {
        const idx = wd.pila.findIndex((p) => find(p.id)?.categoria === "topping");
        if (idx >= 0) wd.pila.splice(idx, 1);
      }
      wd.boxSquash = 1;
      s.caida(ing); // el ingrediente SUENA al aterrizar (no al tocar la carta)
      for (let k = 0; k < 3; k++)
        wd.puffs.push({
          x: geo().boxX + (Math.random() - 0.5) * 30,
          y: boxY - boxH * 0.2,
          life: 1,
          max: 60 + Math.random() * 30,
          r: 5 + Math.random() * 6,
          tipo: "vapor",
        });
      const idxT = sel.current.toppingIds.indexOf(ing.id);
      const gratis = ing.categoria === "topping" && idxT >= 0 && idxT < incluidos;
      wd.pops.push({
        x: boxX,
        y: boxY - boxH * 0.56,
        life: 1,
        texto: gratis ? "GRATIS" : ing.precio > 0 ? `+${formatCOP(ing.precio)}` : ing.nombre,
        gratis,
      });
      // seguidilla: emplatar rápido sube el tono (pequeña celebración musical)
      if (wd.t - wd.comboT < 110) wd.combo++;
      else wd.combo = 1;
      wd.comboT = wd.t;
      if (wd.combo >= 2) s.tone(392 + Math.min(wd.combo, 6) * 84, 0.09, "triangle", 0.1);
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
      }
      lastX = x;
    };
    const onUp = (e: PointerEvent) => {
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

    /**
     * EL FIDEO MESERO — hebra de spaghetti viva desde el ancla (boca de la caja) hasta la punta.
     * 3 pasadas como el personaje del juego: sombra propia ↘, cuerpo ámbar, filo de brillo ↖.
     * Con `holdSpr` lleva el ingrediente colgando envuelto en un rizo; con `eyes`, ojitos en la punta.
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
      const c1x = ax + dx * 0.18 + wob;
      const c1y = ay - 46 + wob2 * 0.6 + dy * 0.1;
      const c2x = ax + dx * 0.72 - wob * 0.6;
      const c2y = Math.min(ay, tipY) - 40 + wob2;
      const N = 20;
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const mt = 1 - t;
        const px =
          mt * mt * mt * ax + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * tipX;
        const py =
          mt * mt * mt * ay + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * tipY;
        pts.push([px, py]);
      }
      const trazo = (offY: number) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1] + offY);
        for (let k = 1; k <= N; k++) ctx.lineTo(pts[k][0], pts[k][1] + offY);
        ctx.stroke();
      };
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // el ingrediente cuelga bajo la punta, envuelto en un rizo del fideo
      const hr = SPR * 0.36;
      if (holdSpr) {
        ctx.save();
        ctx.translate(tipX, tipY + hr * 0.6);
        ctx.rotate(Math.sin(wd.t * 0.15 + seed) * 0.12);
        ctx.drawImage(holdSpr, -hr, -hr, hr * 2, hr * 2);
        ctx.restore();
      }
      // sombra propia ↘
      ctx.strokeStyle = "rgba(50,28,10,0.32)";
      ctx.lineWidth = 8.5;
      trazo(2.5);
      // cuerpo ámbar (más claro hacia la punta)
      const bodyG = ctx.createLinearGradient(ax, ay, tipX, tipY);
      bodyG.addColorStop(0, "#B97A24");
      bodyG.addColorStop(1, "#F2AE38");
      ctx.strokeStyle = bodyG;
      ctx.lineWidth = 6.5;
      trazo(0);
      // filo de brillo ↖
      ctx.strokeStyle = "rgba(255,242,205,0.85)";
      ctx.lineWidth = 2;
      trazo(-1.6);
      // rizo que envuelve el ingrediente
      if (holdSpr) {
        ctx.strokeStyle = "#E9A32C";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(tipX, tipY + hr * 0.3, hr * 0.62, hr * 0.26, 0.18, Math.PI * 0.85, Math.PI * 2.15);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,242,205,0.8)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(tipX, tipY + hr * 0.26, hr * 0.6, hr * 0.24, 0.18, Math.PI * 1.05, Math.PI * 1.7);
        ctx.stroke();
      }
      // punta rechoncha + especular
      ctx.fillStyle = "#F6C566";
      ctx.beginPath();
      ctx.arc(tipX, tipY, 4.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(tipX - 1.4, tipY - 1.6, 1.2, 0, TAU);
      ctx.fill();
      // ojitos (el ADN del personaje de EL ENREDO: pequeños, con vida)
      if (eyes && !holdSpr) {
        const [px2, py2] = pts[N - 2];
        let dirX = tipX - px2;
        let dirY = tipY - py2;
        const dl = Math.hypot(dirX, dirY) || 1;
        dirX /= dl;
        dirY /= dl;
        const perX = -dirY;
        const perY = dirX;
        const blink = wd.t % 190 < 7 ? 0.16 : 1;
        for (const sd of [-1, 1]) {
          const ex = tipX - dirX * 1.6 + perX * sd * 3;
          const ey = tipY - dirY * 1.6 + perY * sd * 3;
          ctx.fillStyle = "#2A1608";
          ctx.save();
          ctx.translate(ex, ey + pupilDown);
          ctx.scale(1, blink);
          ctx.beginPath();
          ctx.arc(0, 0, 1.9, 0, TAU);
          ctx.fill();
          ctx.restore();
          if (blink === 1) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.arc(ex - 0.6, ey - 0.6 + pupilDown, 0.6, 0, TAU);
            ctx.fill();
          }
        }
      }
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const wd = world.current;
      wd.t++;
      const { boxW, boxH, boxX, boxY, trayY, cardY, cardW, cardH } = geo();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // cambio de pestaña → animación de entrada de cartas + reset de scroll
      if (sel.current.tab !== wd.lastTab) {
        wd.lastTab = sel.current.tab;
        wd.tabT = wd.t;
        wd.trayScroll = 0;
        wd.trayVel = 0;
      }

      // ===== fondo: pared cálida + remolinos de fideo + luz de cocina ↖ + mostrador =====
      ctx.fillStyle = "#F6E7CB";
      ctx.fillRect(0, 0, W, H);
      const woodY = H * 0.46;
      if (!wd.wallPat) {
        const tcv = document.createElement("canvas");
        tcv.width = 150;
        tcv.height = 150;
        const tg = tcv.getContext("2d")!;
        tg.strokeStyle = "rgba(150,100,50,0.07)";
        tg.lineWidth = 9;
        tg.lineCap = "round";
        tg.beginPath();
        tg.arc(40, 44, 20, 0.4, 4.6);
        tg.stroke();
        tg.beginPath();
        tg.arc(108, 112, 16, 2.2, 7.2);
        tg.stroke();
        tg.beginPath();
        tg.arc(118, 32, 12, 1.2, 5.6);
        tg.stroke();
        wd.wallPat = ctx.createPattern(tcv, "repeat");
      }
      if (wd.wallPat) {
        ctx.fillStyle = wd.wallPat;
        ctx.fillRect(0, 0, W, woodY);
      }
      const luz = ctx.createRadialGradient(W * 0.3, H * 0.1, 20, W * 0.3, H * 0.1, H * 0.9);
      luz.addColorStop(0, "rgba(255,245,220,0.9)");
      luz.addColorStop(0.5, "rgba(255,235,200,0.25)");
      luz.addColorStop(1, "rgba(120,80,40,0.16)");
      ctx.fillStyle = luz;
      ctx.fillRect(0, 0, W, H);
      // motas de polvo flotando en el haz de luz (cocina viva)
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
      // mostrador de madera (desde el tercio inferior)
      const wood = ctx.createLinearGradient(0, woodY, 0, H);
      wood.addColorStop(0, "#8A5A2E");
      wood.addColorStop(0.12, "#6E4523");
      wood.addColorStop(1, "#4A2D16");
      ctx.fillStyle = wood;
      ctx.fillRect(0, woodY, W, H - woodY);
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(0, woodY + (H - woodY) * (k / 4));
        ctx.lineTo(W, woodY + (H - woodY) * (k / 4));
        ctx.stroke();
      }

      // ===== LA CAJA =====
      // entrada: la caja cae a escena con squash en el primer medio segundo
      const ent = Math.min(1, wd.t / 26);
      const entY = (1 - easeOutCubic(ent)) * -H * 0.35;
      if (wd.t === 27) wd.boxSquash = 1;
      const squash = 1 + 0.05 * Math.sin(wd.t * 0.02) * 0.3 + wd.boxSquash * 0.08;
      wd.boxSquash *= 0.86;
      if (wd.folding && wd.fold < 1) wd.fold = Math.min(1, wd.fold + 0.022);
      const f = wd.fold;
      ctx.save();
      ctx.translate(boxX, boxY + boxH * 0.32 + entY);
      ctx.scale(1 + wd.boxSquash * 0.05, squash - wd.boxSquash * 0.05);
      ctx.translate(0, -boxH * 0.32);
      // sombra de contacto (cálida, ceñida)
      ctx.fillStyle = "rgba(70,40,16,0.3)";
      ctx.beginPath();
      ctx.ellipse(4, boxH * 0.4, boxW * 0.5, boxH * 0.1, 0, 0, TAU);
      ctx.fill();

      // ---- vista 3/4: pared TRASERA interior → COMIDA (sobresale) → banda FRONTAL ----
      if (f < 0.9) {
        // pared trasera (interior kraft oscuro, lit ↖)
        const backG = ctx.createLinearGradient(0, -boxH * 0.42, 0, boxH * 0.05);
        backG.addColorStop(0, "#8A6230");
        backG.addColorStop(1, "#6B4A20");
        ctx.fillStyle = backG;
        ctx.beginPath();
        ctx.roundRect(-boxW * 0.42, -boxH * 0.42, boxW * 0.84, boxH * 0.48, 8);
        ctx.fill();
        // sombra interior (la caja tiene hondo)
        const inS = ctx.createLinearGradient(0, -boxH * 0.42, 0, -boxH * 0.18);
        inS.addColorStop(0, "rgba(40,22,8,0.55)");
        inS.addColorStop(1, "rgba(40,22,8,0)");
        ctx.fillStyle = inS;
        ctx.beginPath();
        ctx.roundRect(-boxW * 0.42, -boxH * 0.42, boxW * 0.84, boxH * 0.3, 8);
        ctx.fill();

        // solapas cortas ABIERTAS, pegadas a las esquinas (alas de origami)
        const flapW = boxW * 0.22;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * boxW * 0.42, -boxH * 0.34);
          ctx.rotate(side * (0.85 - f * 0.85));
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
          ctx.restore();
        }

        // LA COMIDA — montañita compuesta: la base es la cama (atrás), la proteína al frente,
        // los toppings coronan arriba; SOBRESALE del borde; clip solo lateral
        ctx.save();
        ctx.beginPath();
        ctx.rect(-boxW * 0.44, -boxH * 0.95, boxW * 0.88, boxH * 1.1);
        ctx.clip();
        const capa = (id: string) => {
          const c = find(id)?.categoria;
          return c === "base" ? 0 : c === "proteina" ? 1 : 2;
        };
        const ordenada = [...wd.pila].sort((a, b) => capa(a.id) - capa(b.id) || a.oy - b.oy);
        for (const p of ordenada) {
          const spr = wd.sprites.get(p.id);
          if (!spr) continue;
          ctx.save();
          ctx.translate(p.ox * boxW * 0.3, -boxH * 0.16 + p.oy * boxH * 0.12);
          ctx.rotate(p.rot);
          const sz = SPR * p.s;
          ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
          ctx.restore();
        }
        ctx.restore();
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
      ctx.font = "800 11px var(--pg-font-display, Georgia), serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,240,210,0.55)";
      ctx.fillText("P A P A G H E T T I", 0, boxH * 0.23 + 1);
      ctx.fillStyle = "rgba(90,58,24,0.9)";
      ctx.fillText("P A P A G H E T T I", 0, boxH * 0.23);

      // tapa plegada + sello (al confirmar)
      if (f > 0.55) {
        const ta = (f - 0.55) / 0.45;
        if (!wd.selloHecho) {
          // el sello ATERRIZA: golpe seco + chispas doradas de fideo
          wd.selloHecho = true;
          wd.boxSquash = 1.3;
          s.tone(196, 0.14, "sine", 0.18);
          for (let k = 0; k < 12; k++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
            const sp = 3 + Math.random() * 4;
            wd.chispas.push({
              x: boxX,
              y: boxY - boxH * 0.06,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              rot: Math.random() * TAU,
              vr: (Math.random() - 0.5) * 0.4,
              life: 1,
            });
          }
        }
        ctx.globalAlpha = ta;
        kraft(0, -boxH * 0.06, boxW * 0.98, boxH * 0.34, 8, 14);
        const selloS = easeOutBack(Math.min(1, ta * 1.6));
        ctx.fillStyle = "rgba(200,50,30,0.92)";
        ctx.beginPath();
        ctx.arc(0, -boxH * 0.06, 16 * selloS, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#FBF1DE";
        ctx.font = "800 9px var(--pg-font-body, system-ui)";
        ctx.fillText("PG", 0, -boxH * 0.06 + 1);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // vapor extra mientras se pliega (la cocina respira al cerrar)
      if (wd.folding && wd.fold < 0.4 && wd.t % 3 === 0) {
        wd.puffs.push({
          x: boxX + (Math.random() - 0.5) * boxW * 0.5,
          y: boxY - boxH * 0.28,
          life: 1,
          max: 50,
          r: 6 + Math.random() * 5,
          tipo: "vapor",
        });
      }

      // ===== rizos de vapor (hebras onduladas — vapor con ADN de fideo) =====
      if (wd.pila.length > 0 && f < 0.5) {
        ctx.lineCap = "round";
        ctx.strokeStyle = "#FFF9EE";
        ctx.lineWidth = 3;
        for (const sd of [0, 1]) {
          ctx.globalAlpha = 0.13 + 0.05 * Math.sin(wd.t * 0.03 + sd * 2);
          ctx.beginPath();
          const x0 = boxX + (sd ? 16 : -14);
          const y0 = boxY - boxH * 0.34;
          for (let k = 0; k < 10; k++) {
            const yy = y0 - k * 7;
            const xx = x0 + Math.sin(wd.t * 0.045 + k * 0.7 + sd * 2.6) * (1.5 + k * 1.1);
            if (k === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // ===== chispas doradas (sello) =====
      for (let i = wd.chispas.length - 1; i >= 0; i--) {
        const ch = wd.chispas[i];
        ch.x += ch.vx;
        ch.y += ch.vy;
        ch.vy += 0.28;
        ch.rot += ch.vr;
        ch.life -= 0.028;
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

      // ===== física: vuelos (la caída final desde la boca de la caja) =====
      for (let i = wd.vuelos.length - 1; i >= 0; i--) {
        const v = wd.vuelos[i];
        v.x += v.vx;
        v.y += v.vy;
        v.vy += 0.55;
        v.rot += v.vr;
        const floorY = boxY + boxH * 0.02;
        if (v.vy > 0 && v.y >= floorY) {
          if (v.bounces < 1) {
            v.bounces++;
            v.vy *= -0.38;
            v.vx *= 0.5;
            wd.boxSquash = 1;
            s.ruido(0.04, 0.05, 900);
          } else {
            aterrizar(v.ing);
            wd.vuelos.splice(i, 1);
            continue;
          }
        }
        const spr = wd.sprites.get(v.ing.id);
        if (spr) {
          ctx.save();
          ctx.translate(v.x, v.y);
          ctx.rotate(v.rot);
          ctx.drawImage(spr, -SPR * 0.4, -SPR * 0.4, SPR * 0.8, SPR * 0.8);
          ctx.restore();
        }
      }

      // ===== vapor idle de la caja =====
      if (wd.t % 34 === 0 && !wd.folding && wd.pila.length > 0) {
        wd.puffs.push({ x: boxX + (Math.random() - 0.5) * 26, y: boxY - boxH * 0.22, life: 1, max: 90, r: 5, tipo: "vapor" });
      }
      for (let i = wd.puffs.length - 1; i >= 0; i--) {
        const p = wd.puffs[i];
        p.life -= 1 / p.max;
        if (p.life <= 0) {
          wd.puffs.splice(i, 1);
          continue;
        }
        const yy = p.y - (1 - p.life) * 46;
        ctx.globalAlpha = p.life * 0.5;
        const gg = ctx.createRadialGradient(p.x, yy, 0, p.x, yy, p.r * (1 + (1 - p.life) * 1.6));
        gg.addColorStop(0, "rgba(255,250,240,0.9)");
        gg.addColorStop(1, "rgba(255,250,240,0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(p.x, yy, p.r * (1 + (1 - p.life) * 1.6), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // ===== BANDEJA (pestañas + cartas) =====
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
        ctx.font = "800 12px var(--pg-font-body, system-ui)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = activo ? "#1E1611" : "rgba(251,241,222,0.85)";
        ctx.fillText(tabsTxt[k], tx, trayY - 2);
        // check de completado
        const done = k === 0 ? !!sel.current.baseId : k === 1 ? !!sel.current.proteinaId : sel.current.toppingIds.length > 0;
        if (done && !activo) {
          ctx.fillStyle = "#7ED07C";
          ctx.beginPath();
          ctx.arc(tx + tw / 2 - 12, trayY - 12, 4.5, 0, TAU);
          ctx.fill();
        }
      }
      // inercia del scroll
      if (Math.abs(wd.trayVel) > 0.2 && !dragging) {
        wd.trayScroll += wd.trayVel;
        wd.trayVel *= 0.92;
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
        ctx.font = "700 10px var(--pg-font-body, system-ui)";
        ctx.textAlign = "center";
        ctx.fillStyle = "#1E1611";
        const words = ing.nombre.split(" ");
        const l1 = words.slice(0, 2).join(" ").slice(0, 14);
        const l2 = words.slice(2).join(" ").slice(0, 14);
        ctx.fillText(l1, 0, cardH / 2 - (l2 ? 34 : 26));
        if (l2) ctx.fillText(l2, 0, cardH / 2 - 24);
        // precio
        const idxT = sel.current.toppingIds.indexOf(ing.id);
        const esGratis = ing.categoria === "topping" && idxT >= 0 && idxT < incluidos;
        ctx.font = "800 10px var(--pg-font-body, system-ui)";
        ctx.fillStyle = ing.agotado ? "#A0A0A0" : esGratis ? "#4C9A5A" : "#C8321E";
        ctx.fillText(
          ing.agotado ? "AGOTADO" : esGratis ? "GRATIS" : ing.precio > 0 ? formatCOP(ing.precio) : "—",
          0,
          cardH / 2 - 11,
        );
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
            const apexX = boxX + fd.off * 0.5;
            const apexY = boxY - boxH * 0.95;
            const dropX = boxX + fd.off * 0.3;
            tipX = bez2(fd.tx, apexX, dropX, u);
            tipY = bez2(fd.ty, apexY, mouthYBase - 6, u);
            holding = true;
          } else {
            // suelta: caída corta con rebote dentro de la caja (la física existente remata)
            wd.vuelos.push({
              ing: fd.ing,
              x: boxX + fd.off * 0.3,
              y: mouthYBase,
              vx: -fd.off * 0.02,
              vy: 1.6,
              rot: (Math.random() - 0.5) * 0.4,
              vr: (Math.random() - 0.5) * 0.1,
              bounces: 0,
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
        drawFideo(anchX, anchY, tipX, tipY, fd.seed, holding ? wd.sprites.get(fd.ing.id) ?? null : null, eyes);
      }

      // ===== fideo curioso: si nadie toca nada, se asoma y mira la bandeja =====
      const idle = wd.t - wd.lastAct;
      if (idle > 420 && wd.fideos.length === 0 && wd.vuelos.length === 0 && !wd.folding) {
        const cycle = (idle - 420) % 640;
        if (cycle < 270) {
          const kIn = easeOutCubic(Math.min(1, cycle / 30));
          const kOut = cycle > 215 ? Math.max(0, 1 - (cycle - 215) / 55) : 1;
          const kk = kIn * kOut;
          if (kk > 0.01) {
            const tipY2 = mouthYBase - 52 * kk;
            const tipX2 = boxX + Math.sin(cycle * 0.045) * 12 * kk;
            drawFideo(boxX, boxY - boxH * 0.1, tipX2, tipY2, 3.7, null, true, 1.3);
          }
        }
      }

      // ===== price pops (nacen ALTOS, entran con rebote) =====
      for (let i = wd.pops.length - 1; i >= 0; i--) {
        const p = wd.pops[i];
        p.life -= 0.016;
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
        ctx.font = `800 ${p.gratis ? 15 : 14}px var(--pg-font-display, Georgia), serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(60,35,15,0.55)";
        ctx.strokeText(p.texto, 0, 0);
        ctx.fillStyle = p.gratis ? "#7ED07C" : "#FFD98A";
        ctx.fillText(p.texto, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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
  }, [pedido, bases, proteinas, toppings, incluidos]);

  /* ======================= DOM shell (accesible) ======================= */
  if (pedido) {
    return (
      <div className="emp-root">
        <header className="emp-top">
          <div className="emp-top__brand">
            <b>{negocio.toUpperCase()}</b>
            <span>· MESA {mesa}</span>
          </div>
        </header>
        <main className="emp-exito">
          <div className="emp-caja emp-caja--cerrada" aria-hidden>
            <div className="emp-caja__cuerpo">
              <span className="emp-caja__marca">PAPAGHETTI</span>
            </div>
            <i className="emp-caja__flap emp-caja__flap--a" />
            <i className="emp-caja__flap emp-caja__flap--b" />
          </div>
          <h1>¡A la cocina!</h1>
          <p className="emp-exito__id">
            Pedido <b>#{pedido.id}</b> · Mesa {mesa} · {formatCOP(pedido.total)}
          </p>
          <ol className="emp-estado" aria-label="Estado del pedido">
            {(["recibido", "cocina", "listo"] as EstadoPedido[]).map((e, k) => {
              const orden: EstadoPedido[] = ["recibido", "cocina", "listo", "entregado"];
              const done = orden.indexOf(estado) >= k;
              const activo = orden.indexOf(estado) === k;
              return (
                <li key={e} className={`${done ? "done" : ""} ${activo ? "activo" : ""}`}>
                  <i>{k === 0 ? "🧾" : k === 1 ? "🔥" : "🔔"}</i>
                  {estadoLabel[e]}
                </li>
              );
            })}
          </ol>
          {estado === "listo" && <p className="emp-listo">¡Tu caja está lista! 🎉</p>}
          <button
            type="button"
            className="emp-cta emp-cta--sec"
            onClick={() => {
              setPedido(null);
              setToppingIds([]);
              setProteinaId("");
              const wd = world.current;
              wd.pila = [];
              wd.fideos = [];
              wd.vuelos = [];
              wd.chispas = [];
              wd.fold = 0;
              wd.folding = false;
              wd.selloHecho = false;
              wd.combo = 0;
            }}
          >
            Pedir otra caja
          </button>
        </main>
      </div>
    );
  }

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
          <button type="button" className="emp-mini emp-modo" onClick={props.onModoRapido}>
            ⚡ PEDIR YA
          </button>
        </div>
      </header>
      {!abierto && <div className="emp-cerrado emp-cerrado--game">😴 Estamos cerrados ahora.</div>}
      <canvas ref={canvasRef} className="emp-canvas" aria-label="Arma tu caja Papaghetti" />
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
    </div>
  );
}
