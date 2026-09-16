/**
 * EL COMPROBANTE, DIBUJADO COMO UNA SOLA IMAGEN.
 *
 * Tres rondas de "sale en blanco" enseñaron una cosa: en el camino entre un
 * documento HTML y una térmica de 80mm hay demasiadas manos —el bloque global de
 * impresión, la regla @page, el driver de Windows con sus papeles declarados, la
 * opción "gráficos en segundo plano"— y cada una puede dejar caer el texto sin
 * avisar. La prueba definitiva la dio el dueño desde el local: lo ÚNICO que llegaba
 * al papel era el logo. Una imagen.
 *
 * Así que el papel entero se vuelve una imagen, del ancho EXACTO del cabezal —576
 * píxeles en una de 80 mm (72 mm útiles), 384 en una de 58 mm (48 mm útiles)—,
 * negro puro sobre blanco, sin antialias que el cabezal convierta en manchas. Un
 * driver imprime un bitmap igual que imprime su autotest: no tiene nada que
 * interpretar. Y la misma imagen sirve para descargar, para WhatsApp y para verla
 * en pantalla, así que lo que se ve es exactamente lo que sale.
 *
 * Solo corre en el navegador (usa <canvas>). Es un módulo puro: recibe el pedido, los
 * ajustes y el logo ya cargado, y devuelve el canvas. Nada de React aquí dentro.
 */

import { formatCOP, lineasDe, metodoLabel, tipoLabel, type Ajustes, type Pedido } from "./menu";
import { ROLLO_POR_DEFECTO, ROLLOS, type Rollo } from "./rollo";

/**
 * LA GEOMETRÍA DEL PAPEL. El tiquete se diseñó en unidades de 576 (80 mm) y así se
 * sigue escribiendo; en 58 mm el lienzo mide los 384 puntos reales y se dibuja con
 * una escala de 0,8 sobre un ancho lógico de 480. No es encoger una foto: el texto
 * se rasteriza ya al tamaño final, nítido, y reparte los renglones en el ancho que
 * hay. Solo 0,8 (no 384/576 = 0,67) porque a dos tercios la letra de los renglones
 * bajaba de los 2 mm de alto y en el mostrador no se leía. Los márgenes se recortan:
 * en 48 mm cada milímetro cuenta.
 */
interface Geo {
  /** Puntos reales del cabezal = ancho del lienzo. */
  puntos: number;
  /** Escala lógico → puntos. */
  k: number;
  /** Ancho lógico en el que se dibuja. */
  W: number;
  M: number;
  /** Ancho útil de texto (lógico). */
  T: number;
}
function geometria(rollo: Rollo): Geo {
  const { puntos } = ROLLOS[rollo];
  const k = rollo === 58 ? 0.8 : 1;
  const W = puntos / k;
  const M = rollo === 58 ? 12 : 22;
  return { puntos, k, W, M, T: W - M * 2 };
}

/** Puntos del cabezal del rollo (576 en 80 mm, 384 en 58 mm). */
export const puntosDe = (rollo: Rollo) => ROLLOS[rollo].puntos;

const PARTES = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export function fechaTiquete(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of PARTES.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.day}/${p.month}/${p.year} · ${p.hour}:${p.minute}`;
}

/* Las fuentes del sitio si están cargadas; si no, las del sistema. Un cabezal térmico
   no sabe de Fraunces, pero la imagen se hace en el navegador, donde sí existen. */
const CUERPO = '"Manrope", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const TITULO = '"Fraunces", "Georgia", "Times New Roman", serif';

type Ctx = CanvasRenderingContext2D;

/** Parte un texto en líneas que quepan en `ancho` con la fuente ya puesta en `ctx`. */
function partir(ctx: Ctx, texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const w of palabras) {
    const prueba = actual ? `${actual} ${w}` : w;
    if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = w;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** La hebra de la casa: el mismo fideo ondulado que separa el sitio, en un trazo. */
function hebra(ctx: Ctx, g: Geo, y: number, corta = false): number {
  const ancho = corta ? g.T * 0.62 : g.T;
  const x0 = (g.W - ancho) / 2;
  ctx.save();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  const ondas = corta ? 5 : 8;
  const paso = ancho / ondas;
  ctx.moveTo(x0, y);
  for (let i = 0; i < ondas; i++) {
    const xa = x0 + paso * i;
    ctx.quadraticCurveTo(xa + paso / 2, y + (i % 2 ? 5 : -5), xa + paso, y);
  }
  ctx.stroke();
  ctx.restore();
  return y + 22;
}

export interface EntradaTiquete {
  pedido: Pedido;
  ajustes: Ajustes;
  /** El logo ya cargado (o null si no pudo cargarse: se escribe el nombre). */
  logo: HTMLImageElement | null;
  /** El rollo de la térmica. Por defecto, el del local. */
  rollo?: Rollo;
}

/**
 * Dibuja el tiquete y devuelve el canvas. La altura la decide el contenido: se pinta
 * primero en un canvas muy alto y al final se recorta a lo que se usó, más un
 * colchón abajo para la cuchilla, que se come los últimos milímetros.
 */
export function dibujarTiquete({ pedido: p, ajustes: a, logo, rollo = ROLLO_POR_DEFECTO }: EntradaTiquete): HTMLCanvasElement {
  const g = geometria(rollo);
  const { W: ANCHO_TIQUETE, M: MARGEN, T: ANCHO_TEXTO } = g;
  const lienzo = document.createElement("canvas");
  lienzo.width = g.puntos;
  lienzo.height = 4000; // de sobra; se recorta al final
  const ctx = lienzo.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.scale(g.k, g.k);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";

  let y = 26;
  const centro = (t: string, fuente: string, salto: number) => {
    ctx.font = fuente;
    ctx.textAlign = "center";
    for (const l of partir(ctx, t, ANCHO_TEXTO)) {
      y += salto;
      ctx.fillText(l, ANCHO_TIQUETE / 2, y);
    }
    ctx.textAlign = "left";
  };
  const fila = (izq: string, der: string, fuenteI: string, fuenteD = fuenteI, salto = 30) => {
    ctx.font = fuenteD;
    const wDer = ctx.measureText(der).width;
    ctx.font = fuenteI;
    const lineas = partir(ctx, izq, ANCHO_TEXTO - wDer - 16);
    lineas.forEach((l, i) => {
      y += salto;
      ctx.textAlign = "left";
      ctx.font = fuenteI;
      ctx.fillText(l, MARGEN, y);
      if (i === 0) {
        ctx.textAlign = "right";
        ctx.font = fuenteD;
        ctx.fillText(der, ANCHO_TIQUETE - MARGEN, y);
        ctx.textAlign = "left";
      }
    });
  };

  const anulado = p.estado === "cancelado";
  const devuelto = p.pago === "devuelto";

  // ── Sello de anulado: negro sobre blanco, imposible de no ver ──
  if (anulado) {
    const titulo = devuelto ? "DINERO DEVUELTO" : "PEDIDO ANULADO";
    const detalle = devuelto
      ? `Se devolvieron ${formatCOP(p.devolucion?.monto ?? p.total)}${p.devolucion?.motivo ? ` — ${p.devolucion.motivo}` : ""}. Este pedido ya no es un consumo.`
      : `Este pedido se canceló${p.motivoCancelacion ? `: ${p.motivoCancelacion}` : ""}. No corresponde a un consumo y no debe cobrarse.`;
    const y0 = y;
    ctx.font = `800 30px ${CUERPO}`;
    const lineasDet = (() => {
      ctx.font = `500 21px ${CUERPO}`;
      return partir(ctx, detalle, ANCHO_TEXTO - 32);
    })();
    const alto = 20 + 36 + lineasDet.length * 26 + 18;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(MARGEN, y0, ANCHO_TEXTO, alto);
    y = y0 + 8;
    centro(titulo, `800 30px ${CUERPO}`, 36);
    for (const l of lineasDet) {
      y += 26;
      ctx.font = `500 21px ${CUERPO}`;
      ctx.textAlign = "center";
      ctx.fillText(l, ANCHO_TIQUETE / 2, y);
    }
    ctx.textAlign = "left";
    y = y0 + alto + 24;
  }

  // ── Logo (o el nombre, si el logo no cargó) ──
  if (logo && logo.naturalWidth > 0) {
    const w = 330;
    const h = Math.round((logo.naturalHeight / logo.naturalWidth) * w);
    ctx.drawImage(logo, (ANCHO_TIQUETE - w) / 2, y, w, h);
    y += h + 10;
  } else {
    centro(a.negocio || "Papaghetti", `700 44px ${TITULO}`, 48);
    y += 6;
  }

  // ── Datos del negocio ──
  const datos = [
    a.razonSocial,
    a.nit ? `NIT ${a.nit}` : "",
    a.direccion,
    a.telefonoLocal || a.whatsapp ? `Tel. ${a.telefonoLocal || a.whatsapp}` : "",
  ].filter(Boolean) as string[];
  for (const d of datos) centro(d, `500 20px ${CUERPO}`, 25);
  y += 14;

  y = hebra(ctx, g, y);

  // ── Título + número ──
  // Lado a lado si caben; si no (58 mm con un número largo), el número baja.
  y += 8;
  const numero = `N° ${p.consecutivo ?? p.id}`;
  ctx.font = `700 22px ${CUERPO}`;
  const wTit = ctx.measureText("COMPROBANTE DE CONSUMO").width;
  ctx.font = `700 34px ${TITULO}`;
  const wNum = ctx.measureText(numero).width;
  ctx.font = `700 22px ${CUERPO}`;
  ctx.textAlign = "left";
  ctx.fillText("COMPROBANTE DE CONSUMO", MARGEN, y + 22);
  if (wTit + 16 + wNum > ANCHO_TEXTO) y += 34;
  ctx.font = `700 34px ${TITULO}`;
  ctx.textAlign = "right";
  ctx.fillText(numero, ANCHO_TIQUETE - MARGEN, y + 26);
  ctx.textAlign = "left";
  y += 44;

  // ── Meta ──
  const meta: [string, string][] = [
    ["FECHA", fechaTiquete(p.creadoEn)],
    ["SERVICIO", tipoLabel[p.tipo]],
  ];
  if (p.referencia) meta.push(["UBICACIÓN", p.referencia]);
  if (p.cliente) meta.push(["CLIENTE", p.cliente]);
  for (const [k, v] of meta) fila(k, v, `700 18px ${CUERPO}`, `600 21px ${CUERPO}`, 28);
  y += 14;

  y = hebra(ctx, g, y, true);

  // ── Renglones ──
  y += 6;
  for (const l of lineasDe(p)) {
    const cant = l.cantidad > 1 ? `${l.cantidad}× ` : "";
    fila(`${cant}${l.nombre}`, formatCOP(l.precio * l.cantidad), `800 24px ${CUERPO}`, `800 24px ${CUERPO}`, 32);
    if (l.detalle) {
      ctx.font = `500 19px ${CUERPO}`;
      for (const s of partir(ctx, l.detalle, ANCHO_TEXTO - 24)) {
        y += 24;
        ctx.fillText(s, MARGEN + 24, y);
      }
    }
    y += 6;
  }
  if (p.notas) {
    ctx.font = `600 19px ${CUERPO}`;
    for (const s of partir(ctx, `Nota: ${p.notas}`, ANCHO_TEXTO)) {
      y += 24;
      ctx.fillText(s, MARGEN, y);
    }
  }
  y += 12;

  y = hebra(ctx, g, y, true);

  // ── Sumas ──
  const consumo = p.subtotal - (p.descuento ?? 0);
  const sumas: [string, number][] = [["Consumo", p.subtotal]];
  if (p.descuento) sumas.push(["Descuento", -p.descuento]);
  // La tarifa congelada en el pedido; la de Ajustes solo para los pedidos viejos.
  if (p.impuesto) sumas.push([`Impuesto (${p.impuestoPct ?? a.impuestoPct}%)`, p.impuesto]);
  if (p.domicilio) sumas.push(["Domicilio", p.domicilio]);
  for (const [k, v] of sumas) fila(k, formatCOP(v), `500 21px ${CUERPO}`, `700 21px ${CUERPO}`, 28);
  const total = consumo + (p.impuesto ?? 0) + (p.domicilio ?? 0);

  // ── TOTAL ──
  y += 16;
  ctx.fillRect(MARGEN, y, ANCHO_TEXTO, 3);
  y += 6;
  fila("TOTAL", formatCOP(total), `800 26px ${CUERPO}`, `800 40px ${TITULO}`, 44);
  if (anulado) {
    // Tachado: el total sigue ahí para que se lea, pero no vale.
    const tachado = Math.min(220, ANCHO_TEXTO * 0.5);
    ctx.fillRect(ANCHO_TIQUETE - MARGEN - tachado, y - 14, tachado, 4);
  }
  y += 4;
  ctx.fillRect(MARGEN, y, ANCHO_TEXTO, 3);
  y += 10;

  // ── Pago ──
  const pago = devuelto
    ? "DEVUELTO"
    : p.pago === "pagado"
      ? p.metodoPago
        ? metodoLabel[p.metodoPago]
        : "Pagado"
      : "PENDIENTE";
  fila("PAGO", pago, `700 18px ${CUERPO}`, `800 22px ${CUERPO}`, 30);
  y += 16;

  y = hebra(ctx, g, y);

  // ── Pie ──
  y += 4;
  centro(
    "Documento interno de control. No es factura electrónica de venta ni documento equivalente P.O.S.",
    `500 17px ${CUERPO}`,
    22,
  );
  y += 12;
  centro("¡Gracias por venir!", `700 26px ${TITULO}`, 30);

  // Colchón para la cuchilla: se come los últimos milímetros.
  y += 60;

  // ── Recorte a lo usado ──
  const final = document.createElement("canvas");
  final.width = g.puntos;
  final.height = Math.min(Math.ceil(y * g.k), lienzo.height);
  const fctx = final.getContext("2d")!;
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, final.width, final.height);
  fctx.drawImage(lienzo, 0, 0);
  return final;
}

/**
 * BLANCO Y NEGRO PUROS, para el cabezal térmico.
 *
 * Un cabezal quema un punto o no lo quema: no existe el gris. Cuando le llega el
 * antialias del navegador (bordes de letra en gris), el driver lo convierte con un
 * tramado que ensucia el contorno de cada glifo — texto "peludo", que es lo que se ve
 * en muchos tiquetes web. Un umbral limpio antes de mandar la imagen deja cada borde
 * decidido. En pantalla se sigue mostrando la versión suave; esta es solo para el
 * papel térmico y para el archivo descargado.
 */
export function binarizar(origen: HTMLCanvasElement, umbral = 150): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = origen.width;
  c.height = origen.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(origen, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // luminancia aproximada; el alfa ya es opaco (se pintó blanco debajo)
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = lum < umbral ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * EL PATRÓN DE CALIBRACIÓN: lo que se imprime para saber, en un solo papel, cómo
 * está llegando el bitmap al cabezal. Se dibuja a los puntos REALES del rollo (sin
 * escala), porque lo que mide es justamente si el driver los respeta 1:1.
 *
 *  · Una REGLA en milímetros con marca cada mm y número cada 10: si al medir con
 *    una regla de verdad los "10" caen a 10 mm, cada píxel va sobre un punto; si
 *    caen a 11 o a 9, el driver está reescalando (papel equivocado en el driver o
 *    "ajustar a la página" activo).
 *  · Marcas en los dos bordes: si falta alguna, el driver recorta ese lado.
 *  · Un TABLERO de 1 px: nítido = 1:1; gris o con bandas = remuestreo o dithering.
 *  · Texto de 16, 20, 24 y 30 px, para ver qué tamaño se lee bien en ESTE cabezal.
 */
export function dibujarCalibracion(rollo: Rollo = ROLLO_POR_DEFECTO): HTMLCanvasElement {
  const { puntos, mm: mmUtiles } = ROLLOS[rollo];
  const c = document.createElement("canvas");
  c.width = puntos;
  c.height = 540;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.font = `800 ${rollo === 58 ? 22 : 26}px ${CUERPO}`;
  ctx.fillText("PATRÓN DE PRUEBA", puntos / 2, 32);
  ctx.font = `600 18px ${CUERPO}`;
  ctx.fillText(`Rollo ${rollo} mm · ${puntos} puntos = ${mmUtiles} mm`, puntos / 2, 56);

  // Bordes: si uno no sale, ese lado se recorta.
  ctx.fillRect(0, 0, 3, c.height);
  ctx.fillRect(puntos - 3, 0, 3, c.height);

  // Regla: 8 px = 1 mm.
  const y0 = 76;
  ctx.fillRect(0, y0, puntos, 2);
  ctx.font = `700 18px ${CUERPO}`;
  for (let mm = 0; mm <= mmUtiles; mm++) {
    const x = mm * 8;
    const alto = mm % 10 === 0 ? 26 : mm % 5 === 0 ? 16 : 8;
    ctx.fillRect(Math.min(x, puntos - 2), y0, 2, alto);
    if (mm % 10 === 0 && mm < mmUtiles - 3) ctx.fillText(String(mm), x + (mm === 0 ? 10 : 0), y0 + 46);
  }
  ctx.fillText(String(mmUtiles), puntos - 14, y0 + 46);

  // Tablero de 1 px: la prueba de remuestreo.
  const yt = 150;
  ctx.font = `600 18px ${CUERPO}`;
  ctx.textAlign = "left";
  ctx.fillText("Tablero 1 px (nítido, no gris):", 14, yt - 8);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < puntos - 28; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(14 + x, yt + y, 1, 1);
    }
  }
  // Líneas verticales de 1 px separadas 2 px: si salen bandas, hay escalado.
  const yl = yt + 64;
  ctx.fillText("Líneas de 1 px:", 14, yl - 8);
  for (let x = 14; x < puntos - 14; x += 3) ctx.fillRect(x, yl, 1, 40);

  // Tamaños de texto.
  let y = yl + 80;
  for (const px of [16, 20, 24, 30]) {
    ctx.font = `600 ${px}px ${CUERPO}`;
    ctx.fillText(`${px} px · Papaghetti 0123`, 14, y);
    y += px + 14;
  }
  ctx.font = `500 17px ${CUERPO}`;
  for (const l of [`Regla corta de ${mmUtiles}: recorta.`, "El 10 no mide 10 mm: reescala.", "Tablero gris: hay tramado."]) {
    y += 24;
    ctx.fillText(l, 14, y);
  }

  return binarizar(c);
}

/** Carga una imagen y resuelve con ella, o con null si no se pudo. Nunca rechaza. */
export function cargarImagen(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}
