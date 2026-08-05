/**
 * EL PRECIO, UNA SOLA VEZ.
 *
 * `crearPedido` (catalog.ts) es la verdad del servidor. Este módulo es su ESPEJO para el
 * cliente: el armador clásico, el juego y el modal de los enredos insignia calculan aquí,
 * no cada uno por su cuenta. Si cambia la regla, cambia en dos sitios (aquí y crearPedido)
 * y no en cinco.
 *
 * Reglas vivas:
 *  · los primeros `incluidos` toppings van por cuenta de la casa, POR ORDEN de agregado
 *  · las proteínas (hasta 2) van a precio completo
 *  · el impuesto se calcula sobre el subtotal
 *  · el DOMICILIO se cobra aparte y solo cuando el servicio es a domicilio
 *  · un enredo insignia tiene precio de carta CERRADO (todo incluido): se desglosa hacia
 *    atrás para que el pedido guarde subtotal/impuesto coherentes con el resto
 */

import { TOPPINGS_INCLUIDOS, type Ingrediente, type TipoServicio } from "./menu";

/**
 * EL TOTAL DE UN PEDIDO, EN UN SOLO SITIO.
 *
 * La fórmula vivía escrita dos veces en el servidor (al crear y al cobrar) y se
 * escribieron distintas: `cobrarPedido` olvidaba el domicilio, así que el pedido
 * entraba a caja con el envío dentro y salía sin él — $5.000 evaporados en cada
 * domicilio, en el instante de cobrarlo. Ahora hay una función y una sola verdad.
 */
export function totalDe(p: {
  subtotal: number;
  impuesto: number;
  domicilio?: number;
  propina?: number;
  descuento?: number;
}): number {
  return Math.max(
    0,
    p.subtotal + p.impuesto + (p.domicilio ?? 0) + (p.propina ?? 0) - (p.descuento ?? 0),
  );
}

/**
 * EL DÍA DEL NEGOCIO, en la zona horaria de Pereira.
 *
 * `new Date().setHours(0,0,0,0)` usa la hora del PROCESO, y en Vercel el runtime
 * corre en UTC: el día contable arrancaba a las 7:00 p.m. hora Colombia, así que
 * a las 7:30 p.m. el reporte de "hoy" borraba el almuerzo entero. Colombia es
 * UTC−5 fijo (sin horario de verano desde 1993), pero se usa Intl con la zona
 * nombrada para no codificar el desfase a mano.
 *
 * Devuelve "YYYY-MM-DD" — comparable con `===` y ordenable como texto.
 */
export const ZONA_NEGOCIO = "America/Bogota";
const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_NEGOCIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function diaNegocio(fecha: string | Date = new Date()): string {
  return fmtDia.format(typeof fecha === "string" ? new Date(fecha) : fecha);
}

/** La hora local del negocio (0-23) de una fecha ISO — para "ventas por hora". */
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_NEGOCIO,
  hour: "2-digit",
  hour12: false,
});
export function horaNegocio(fecha: string | Date): number {
  return Number(fmtHora.format(typeof fecha === "string" ? new Date(fecha) : fecha));
}

export interface Totales {
  subtotal: number;
  impuesto: number;
  domicilio: number;
  total: number;
}

export function calcularTotales(opts: {
  base?: Ingrediente | null;
  /** hasta 2; los undefined se ignoran */
  proteinas?: (Ingrediente | null | undefined)[];
  toppings?: Ingrediente[];
  impuestoPct: number;
  tipo?: TipoServicio;
  costoDomicilio?: number;
  incluidos?: number;
}): Totales {
  const incluidos = opts.incluidos ?? TOPPINGS_INCLUIDOS;
  const prots = (opts.proteinas ?? []).filter(Boolean) as Ingrediente[];
  const tops = opts.toppings ?? [];

  const subtotal =
    (opts.base?.precio ?? 0) +
    prots.reduce((s, p) => s + p.precio, 0) +
    tops.reduce((s, t, i) => s + (i < incluidos ? 0 : t.precio), 0);

  const impuesto = Math.round((subtotal * (opts.impuestoPct ?? 0)) / 100);
  const domicilio = opts.tipo === "domicilio" ? opts.costoDomicilio ?? 0 : 0;

  return { subtotal, impuesto, domicilio, total: subtotal + impuesto + domicilio };
}

/**
 * Precio de carta cerrado → subtotal + impuesto. Se usa para los enredos insignia:
 * el cliente ve UN número ("todo incluido") y el pedido guarda el desglose de siempre.
 */
export function desglosarPrecioFinal(
  precioFinal: number,
  impuestoPct: number
): { subtotal: number; impuesto: number } {
  const subtotal = Math.round(precioFinal / (1 + (impuestoPct ?? 0) / 100));
  return { subtotal, impuesto: precioFinal - subtotal };
}

/** Lo que falta para alcanzar el pedido mínimo (0 si ya alcanza o no aplica). */
export function faltaParaMinimo(
  subtotal: number,
  tipo: TipoServicio | undefined,
  pedidoMinimo: number | undefined
): number {
  if (tipo !== "domicilio" || !pedidoMinimo) return 0;
  return Math.max(0, pedidoMinimo - subtotal);
}
