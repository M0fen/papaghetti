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
 * Así que el papel entero se vuelve una imagen. Un PNG de 576 píxeles de ancho —el
 * cabezal de una térmica de 80mm tiene exactamente 576 puntos en sus 72mm útiles—
 * negro puro sobre blanco, sin antialias que el cabezal convierta en manchas. Un
 * driver imprime un bitmap igual que imprime su autotest: no tiene nada que
 * interpretar. Y la misma imagen sirve para descargar, para WhatsApp y para verla
 * en pantalla, así que lo que se ve es exactamente lo que sale.
 *
 * Solo corre en el navegador (usa <canvas>). Es un módulo puro: recibe el pedido, los
 * ajustes y el logo ya cargado, y devuelve el canvas. Nada de React aquí dentro.
 */

import { formatCOP, lineasDe, metodoLabel, tipoLabel, type Ajustes, type Pedido } from "./menu";

/** 72mm útiles × 8 puntos/mm. La resolución nativa del cabezal, ni más ni menos. */
export const ANCHO_TIQUETE = 576;
const MARGEN = 22;
const ANCHO_TEXTO = ANCHO_TIQUETE - MARGEN * 2;

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
function hebra(ctx: Ctx, y: number, corta = false): number {
  const ancho = corta ? ANCHO_TEXTO * 0.62 : ANCHO_TEXTO;
  const x0 = (ANCHO_TIQUETE - ancho) / 2;
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
}

/**
 * Dibuja el tiquete y devuelve el canvas. La altura la decide el contenido: se pinta
 * primero en un canvas muy alto y al final se recorta a lo que se usó, más un
 * colchón abajo para la cuchilla, que se come los últimos milímetros.
 */
export function dibujarTiquete({ pedido: p, ajustes: a, logo }: EntradaTiquete): HTMLCanvasElement {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO_TIQUETE;
  lienzo.height = 4000; // de sobra; se recorta al final
  const ctx = lienzo.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
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

  y = hebra(ctx, y);

  // ── Título + número ──
  y += 8;
  ctx.font = `700 22px ${CUERPO}`;
  ctx.textAlign = "left";
  ctx.fillText("COMPROBANTE DE CONSUMO", MARGEN, y + 22);
  ctx.font = `700 34px ${TITULO}`;
  ctx.textAlign = "right";
  ctx.fillText(`N° ${p.consecutivo ?? p.id}`, ANCHO_TIQUETE - MARGEN, y + 26);
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

  y = hebra(ctx, y, true);

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

  y = hebra(ctx, y, true);

  // ── Sumas ──
  const consumo = p.subtotal - (p.descuento ?? 0);
  const sumas: [string, number][] = [["Consumo", p.subtotal]];
  if (p.descuento) sumas.push(["Descuento", -p.descuento]);
  if (p.impuesto) sumas.push([`Impuesto (${a.impuestoPct}%)`, p.impuesto]);
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
    ctx.fillRect(ANCHO_TIQUETE - MARGEN - 220, y - 14, 220, 4);
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

  y = hebra(ctx, y);

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
  final.width = ANCHO_TIQUETE;
  final.height = Math.min(y, lienzo.height);
  const fctx = final.getContext("2d")!;
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, final.width, final.height);
  fctx.drawImage(lienzo, 0, 0);
  return final;
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
