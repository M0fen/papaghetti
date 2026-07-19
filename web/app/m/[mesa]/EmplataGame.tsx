"use client";

/**
 * EMPLATA v2 — el pedido ES un juego (canvas, artesanía de EL ENREDO).
 *
 * Escena Canvas2D 60fps: cocina cálida con UNA luz arriba-izquierda, la caja origami kraft
 * centro-escenario (volumen + vapor), y una BANDEJA táctil en zona de pulgar con los ingredientes
 * como SPRITES HORNEADOS (modelo de 5 capas: AO → volumen → sombra propia → rim → especular).
 * Tap → el ingrediente VUELA en arco con gravedad, rebota con squash y se APILA dentro de la caja.
 * Confirmar → la caja se pliega en origami y el pedido entra por el flujo existente (canal "qr").
 *
 * El cerebro manda: menú/precios/gratis/impuesto del catálogo. Física y arte son VIEW puro.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCOP, estadoLabel, type EstadoPedido, type Ingrediente } from "@/lib/menu";
import { enviarPedido, estadoPedido } from "@/app/pedido-actions";
import { useSonido } from "./sonido";

const TAU = Math.PI * 2;

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
type PilaItem = { id: string; ox: number; oy: number; rot: number; s: number };
type Puff = { x: number; y: number; life: number; max: number; r: number; tipo: "vapor" | "polvo" };
type Pop = { x: number; y: number; life: number; texto: string; gratis: boolean };

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
    pila: [] as PilaItem[],
    puffs: [] as Puff[],
    pops: [] as Pop[],
    trayScroll: 0,
    trayVel: 0,
    boxSquash: 0, // 0..1 al aterrizar algo
    fold: 0, // 0 abierto → 1 plegado (confirmar)
    folding: false,
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
  const lanzar = useCallback(
    (ing: Ingrediente, fromX: number, fromY: number, W: number, H: number) => {
      s.caida(ing);
      if (navigator.vibrate) navigator.vibrate(12);
      const bx = W / 2;
      const by = H * 0.3;
      const dx = bx - fromX;
      const t = 34; // frames de vuelo aprox
      world.current.vuelos.push({
        ing,
        x: fromX,
        y: fromY,
        vx: dx / t,
        vy: -9 - Math.random() * 2,
        rot: (Math.random() - 0.5) * 0.6,
        vr: (Math.random() - 0.5) * 0.12,
        bounces: 0,
      });
      void by;
    },
    [s],
  );

  const tapIngrediente = useCallback(
    (ing: Ingrediente, cx: number, cy: number, W: number, H: number) => {
      if (ing.agotado || world.current.folding) return;
      const cat = ing.categoria;
      if (cat === "base") {
        if (sel.current.baseId === ing.id) return;
        setBaseId(ing.id);
        world.current.pila = world.current.pila.filter((p) => {
          const it = find(p.id);
          return it?.categoria !== "base";
        });
        lanzar(ing, cx, cy, W, H);
      } else if (cat === "proteina") {
        if (sel.current.proteinaId === ing.id) return;
        setProteinaId(ing.id);
        world.current.pila = world.current.pila.filter((p) => find(p.id)?.categoria !== "proteina");
        lanzar(ing, cx, cy, W, H);
      } else {
        if (sel.current.toppingIds.includes(ing.id)) {
          setToppingIds((prev) => prev.filter((t) => t !== ing.id));
          world.current.pila = world.current.pila.filter((p) => p.id !== ing.id);
          s.tone(300, 0.08, "triangle", 0.1); // sale de la caja
          return;
        }
        setToppingIds((prev) => [...prev, ing.id]);
        lanzar(ing, cx, cy, W, H);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lanzar, s],
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

    // ---------- input: tap vs drag de bandeja ----------
    let downX = 0;
    let downY = 0;
    let moved = 0;
    let dragging = false;
    let lastX = 0;

    const onDown = (e: PointerEvent) => {
      s.unlock();
      const r = canvas.getBoundingClientRect();
      downX = e.clientX - r.left;
      downY = e.clientY - r.top;
      lastX = downX;
      moved = 0;
      dragging = downY > geo().trayY + 40; // solo la fila de cartas se arrastra
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!e.buttons) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      moved += Math.abs(x - lastX);
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
      if (moved > 8) return; // fue drag
      const { trayY, cardY, cardW, cardH } = geo();
      // pestañas
      if (y > trayY - 26 && y < trayY + 24) {
        const tabs = ["LA BASE", "PROTEÍNA", "TOPPINGS"];
        const tw = Math.min(W / 3 - 8, 128);
        for (let k = 0; k < 3; k++) {
          const tx = W / 2 + (k - 1) * (tw + 8);
          if (Math.abs(x - tx) < tw / 2) {
            setTab(k as 0 | 1 | 2);
            s.tone(600 + k * 120, 0.06, "triangle", 0.08);
            return;
          }
        }
        void tabs;
      }
      // cartas
      if (y > cardY - cardH / 2 - 6 && y < cardY + cardH / 2 + 6) {
        const lista = listaActiva().filter((i) => i.activo);
        const step = cardW + 10;
        const total = lista.length * step;
        const x0 = Math.max(14, (W - total) / 2) - world.current.trayScroll;
        for (let k = 0; k < lista.length; k++) {
          const cx = x0 + k * step + cardW / 2;
          if (Math.abs(x - cx) < cardW / 2) {
            tapIngrediente(lista[k], cx, cardY, W, H);
            return;
          }
        }
      }
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

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const wd = world.current;
      wd.t++;
      const { boxW, boxH, boxX, boxY, trayY, cardY, cardW, cardH } = geo();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ===== fondo: pared cálida + luz de cocina ↖ + mostrador =====
      ctx.fillStyle = "#F6E7CB";
      ctx.fillRect(0, 0, W, H);
      const luz = ctx.createRadialGradient(W * 0.3, H * 0.1, 20, W * 0.3, H * 0.1, H * 0.9);
      luz.addColorStop(0, "rgba(255,245,220,0.9)");
      luz.addColorStop(0.5, "rgba(255,235,200,0.25)");
      luz.addColorStop(1, "rgba(120,80,40,0.16)");
      ctx.fillStyle = luz;
      ctx.fillRect(0, 0, W, H);
      // mostrador de madera (desde el tercio inferior)
      const woodY = H * 0.46;
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
      const squash = 1 + 0.05 * Math.sin(wd.t * 0.02) * 0.3 + wd.boxSquash * 0.08;
      wd.boxSquash *= 0.86;
      if (wd.folding && wd.fold < 1) wd.fold = Math.min(1, wd.fold + 0.022);
      const f = wd.fold;
      ctx.save();
      ctx.translate(boxX, boxY + boxH * 0.32);
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

        // LA COMIDA — apilada, SOBRESALE del borde (montañita); clip solo lateral
        ctx.save();
        ctx.beginPath();
        ctx.rect(-boxW * 0.44, -boxH * 0.95, boxW * 0.88, boxH * 1.1);
        ctx.clip();
        const ordenada = [...wd.pila].sort((a, b) => (a.oy - b.oy));
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
        ctx.globalAlpha = ta;
        kraft(0, -boxH * 0.06, boxW * 0.98, boxH * 0.34, 8, 14);
        ctx.fillStyle = "rgba(200,50,30,0.92)";
        ctx.beginPath();
        ctx.arc(0, -boxH * 0.06, 16 * ta, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#FBF1DE";
        ctx.font = "800 9px var(--pg-font-body, system-ui)";
        ctx.fillText("PG", 0, -boxH * 0.06 + 1);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // ===== física: vuelos =====
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
            // aterrizó → a la pila
            const cat = v.ing.categoria;
            wd.pila = wd.pila.filter((p) => !(cat !== "topping" && find(p.id)?.categoria === cat));
            wd.pila.push({
              id: v.ing.id,
              ox: cat === "base" ? 0 : (Math.random() - 0.5) * 1.6,
              oy: cat === "base" ? 0.6 : Math.random() * 0.8 - 0.1,
              rot: (Math.random() - 0.5) * 0.5,
              s: cat === "base" ? 0.98 : cat === "proteina" ? 0.8 : 0.58,
            });
            if (wd.pila.length > 14) wd.pila.shift();
            wd.boxSquash = 1;
            // vapor + polvo + precio
            for (let k = 0; k < 3; k++)
              wd.puffs.push({ x: boxX + (Math.random() - 0.5) * 30, y: boxY - boxH * 0.2, life: 1, max: 60 + Math.random() * 30, r: 5 + Math.random() * 6, tipo: "vapor" });
            const idxT = sel.current.toppingIds.indexOf(v.ing.id);
            const gratis = v.ing.categoria === "topping" && idxT >= 0 && idxT < incluidos;
            wd.pops.push({
              x: boxX,
              y: boxY - boxH * 0.42,
              life: 1,
              texto: gratis ? "GRATIS" : v.ing.precio > 0 ? `+${formatCOP(v.ing.precio)}` : v.ing.nombre,
              gratis,
            });
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

      // ===== price pops =====
      for (let i = wd.pops.length - 1; i >= 0; i--) {
        const p = wd.pops[i];
        p.life -= 0.016;
        if (p.life <= 0) {
          wd.pops.splice(i, 1);
          continue;
        }
        const yy = p.y - (1 - p.life) * 34;
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.font = `800 ${p.gratis ? 15 : 14}px var(--pg-font-display, Georgia), serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(60,35,15,0.55)";
        ctx.strokeText(p.texto, p.x, yy);
        ctx.fillStyle = p.gratis ? "#7ED07C" : "#FFD98A";
        ctx.fillText(p.texto, p.x, yy);
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
        const bob = Math.sin(wd.t * 0.04 + k) * 2;
        const cyk = cardY + bob;
        // carta
        ctx.fillStyle = "rgba(30,16,8,0.35)";
        ctx.beginPath();
        ctx.roundRect(cx - cardW / 2 + 2, cyk - cardH / 2 + 4, cardW, cardH, 14);
        ctx.fill();
        ctx.fillStyle = selr ? "#FFF3D6" : "#FBF1DE";
        ctx.beginPath();
        ctx.roundRect(cx - cardW / 2, cyk - cardH / 2, cardW, cardH, 14);
        ctx.fill();
        if (selr) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#F2A516";
          ctx.beginPath();
          ctx.roundRect(cx - cardW / 2 + 1.5, cyk - cardH / 2 + 1.5, cardW - 3, cardH - 3, 12);
          ctx.stroke();
        }
        // sprite
        const spr = wd.sprites.get(ing.id);
        if (spr) {
          ctx.globalAlpha = ing.agotado ? 0.35 : 1;
          ctx.drawImage(spr, cx - 33, cyk - cardH / 2 + 4, 66, 66);
          ctx.globalAlpha = 1;
        }
        // nombre (2 líneas máx)
        ctx.font = "700 10px var(--pg-font-body, system-ui)";
        ctx.textAlign = "center";
        ctx.fillStyle = "#1E1611";
        const words = ing.nombre.split(" ");
        const l1 = words.slice(0, 2).join(" ").slice(0, 14);
        const l2 = words.slice(2).join(" ").slice(0, 14);
        ctx.fillText(l1, cx, cyk + cardH / 2 - (l2 ? 34 : 26));
        if (l2) ctx.fillText(l2, cx, cyk + cardH / 2 - 24);
        // precio
        const idxT = sel.current.toppingIds.indexOf(ing.id);
        const esGratis = ing.categoria === "topping" && idxT >= 0 && idxT < incluidos;
        ctx.font = "800 10px var(--pg-font-body, system-ui)";
        ctx.fillStyle = ing.agotado ? "#A0A0A0" : esGratis ? "#4C9A5A" : "#C8321E";
        ctx.fillText(
          ing.agotado ? "AGOTADO" : esGratis ? "GRATIS" : ing.precio > 0 ? formatCOP(ing.precio) : "—",
          cx,
          cyk + cardH / 2 - 11,
        );
        // check
        if (selr) {
          ctx.fillStyle = "#F2A516";
          ctx.beginPath();
          ctx.arc(cx + cardW / 2 - 13, cyk - cardH / 2 + 13, 9, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "#1E1611";
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(cx + cardW / 2 - 17, cyk - cardH / 2 + 13);
          ctx.lineTo(cx + cardW / 2 - 14, cyk - cardH / 2 + 16.5);
          ctx.lineTo(cx + cardW / 2 - 9, cyk - cardH / 2 + 9);
          ctx.stroke();
        }
      }
      // pista de scroll
      if (maxScroll > 0) {
        ctx.fillStyle = "rgba(251,241,222,0.25)";
        ctx.beginPath();
        ctx.roundRect(W * 0.3, cardY + cardH / 2 + 12, W * 0.4, 3, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(242,165,22,0.9)";
        const th = (W * 0.4) * (W / (totalW2 + 1));
        ctx.beginPath();
        ctx.roundRect(W * 0.3 + (W * 0.4 - th) * (wd.trayScroll / maxScroll), cardY + cardH / 2 + 12, th, 3, 2);
        ctx.fill();
      }
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
              world.current.pila = [];
              world.current.fold = 0;
              world.current.folding = false;
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
          className="emp-cta"
          onClick={confirmar}
          disabled={!abierto || enviando || !baseId}
        >
          {enviando ? "Cerrando…" : "EMPLATAR →"}
        </button>
      </footer>
    </div>
  );
}
