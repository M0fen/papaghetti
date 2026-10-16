/**
 * EL PRECIO, UNA SOLA VEZ.
 *
 * `crearComanda` (catalog.ts) es la verdad del servidor. Este módulo es su ESPEJO para el
 * cliente: el armador clásico, el juego y el modal de los enredos insignia calculan aquí,
 * no cada uno por su cuenta. Si cambia la regla, cambia en dos sitios (aquí y crearComanda)
 * y no en cinco.
 *
 * Reglas vivas:
 *  · PRECIO VISTO = PRECIO PAGADO. Todo precio de la carta (bases, proteínas,
 *    acompañantes, platos, adicionales) ya trae el impuesto dentro. Antes los platos de
 *    carta lo traían y las cajas armadas lo sumaban al final: la carta decía $15.900 y
 *    se cobraban $17.172. Ahora el impuesto se informa como "incluido", no se suma.
 *  · cada acompañante se cobra a su precio; nada va por cuenta de la casa
 *    (`incluidos` es 0 hoy; existe por si algún día hay promoción)
 *  · las salsas valen $0 en la carta: van con el plato siempre
 *  · las proteínas van a precio completo
 *  · DOS BASES (Ajustes → Cobro y servicio): en "mitad y mitad" se cobra la más cara;
 *    en "suma", las dos (ver `precioBases`)
 *  · el DOMICILIO se cobra aparte y solo cuando el servicio es a domicilio
 *  · el descuento se teclea en pesos que deja de pagar el cliente
 */

import {
  TOPPINGS_INCLUIDOS,
  formatCOP,
  lineasDe,
  type CobroBases,
  type Ingrediente,
  type Pedido,
  type TipoServicio,
} from "./menu";

/** 1,08 con un impuesto del 8 %. */
const factor = (impuestoPct?: number) => 1 + (impuestoPct ?? 0) / 100;

/** Lo que queda de un precio final sin el impuesto (redondeado al peso). */
export const sinImpuesto = (precioFinal: number, impuestoPct?: number): number =>
  Math.round(precioFinal / factor(impuestoPct));

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
  /** Lo que suma la carta, con el impuesto dentro (es lo que paga por la comida). */
  subtotal: number;
  /** La parte de `subtotal` que es impuesto. Se INFORMA, no se suma. */
  impuesto: number;
  domicilio: number;
  /** subtotal + domicilio. */
  total: number;
}

/**
 * LO QUE SE COBRA POR LOS ACOMPAÑANTES.
 *
 * Con `incluidos = 0` (lo normal) esto es simplemente la suma de todos: cada
 * acompañante se cobra a su precio de carta. El parámetro sobrevive para promociones,
 * y si alguna vez vuelve a ser > 0 se descuentan SIEMPRE los más caros: una sola
 * respuesta posible para una misma selección, igual en el cliente y en el servidor.
 */
export function cobroToppings(toppings: Ingrediente[], incluidos: number): number {
  const precios = soloCobrables(toppings)
    .map((t) => t.precio)
    .sort((a, b) => b - a);
  return precios.slice(incluidos).reduce((s, p) => s + p, 0);
}

/** Las salsas van con el plato: no se cobran ni entran en el conteo. */
export const soloCobrables = (toppings: Ingrediente[]) =>
  (toppings ?? []).filter((t) => t && t.categoria !== "salsa");

/**
 * QUIÉNES no se cobran, por id. Una sola respuesta para toda la interfaz.
 *
 * Hoy devuelve un conjunto VACÍO (`TOPPINGS_INCLUIDOS` es 0) y por eso ninguna
 * pantalla marca nada como regalado. Sigue centralizado para que, si vuelve a haber
 * promoción, la etiqueta y el precio salgan de la misma función y no se contradigan.
 */
export function idsGratis(toppings: Ingrediente[], incluidos = TOPPINGS_INCLUIDOS): Set<string> {
  return new Set(
    soloCobrables(toppings)
      .slice()
      .sort((a, b) => b.precio - a.precio)
      .slice(0, incluidos)
      .map((t) => t.id),
  );
}

/**
 * LO QUE SE COBRA POR LAS BASES. Una base: su precio. Dos en "mitad": la más cara (es un
 * plato repartido). Dos en "suma": las dos. El orden en que se tocaron no cambia nada.
 * `crearComanda` usa ESTA función: la pantalla no puede decir un precio y la caja otro.
 */
export function precioBases(bases: (Ingrediente | null | undefined)[], modo: CobroBases = "mitad"): number {
  const bs = (bases ?? []).filter(Boolean) as Ingrediente[];
  if (!bs.length) return 0;
  return modo === "suma" ? bs.reduce((s, b) => s + b.precio, 0) : Math.max(...bs.map((b) => b.precio));
}

/**
 * Las bases elegidas EN EL ORDEN DE LA CARTA, no en el de los toques: el mismo plato se
 * llama igual lo pida quien lo pida, y los reportes no lo cuentan como dos platos.
 */
export const basesElegidas = <T extends { id: string }>(ids: readonly string[], catalogo: readonly T[]): T[] =>
  catalogo.filter((b) => ids.includes(b.id));

/** El nombre del renglón con dos bases: "Spaghetti / Papa criolla". */
export const nombreBases = (bases: readonly { nombre: string }[]): string => bases.map((b) => b.nombre).join(" / ");

/** Lo que la cocina tiene que saber de un plato con dos bases. Va al frente del detalle. */
export const modoBasesTexto = (modo: CobroBases): string => (modo === "mitad" ? "mitad y mitad" : "dos bases completas");

/**
 * Los renglones de las bases en un ticket de pantalla (armador, juego). Su suma ES
 * `precioBases`, así que el ticket siempre cuadra con lo que se cobra: en "mitad" las
 * dos van en UN renglón a precio de la más cara, nunca cada una a su precio completo.
 */
export function renglonesBases(bases: readonly Ingrediente[], modo: CobroBases): { nombre: string; precio: number }[] {
  if (bases.length < 2 || modo === "suma") return bases.map((b) => ({ nombre: b.nombre, precio: b.precio }));
  return [{ nombre: `${nombreBases(bases)} · ${modoBasesTexto(modo)}`, precio: precioBases([...bases], modo) }];
}

/**
 * TOCAR UNA BASE, igual en todas las pantallas. Con máximo 1: reemplaza (tocar la que ya
 * está no hace nada, como siempre). Con 2: prende y apaga, y si ya hay dos la última cede
 * su sitio. La única base elegida no se suelta: un toque nunca deja el plato sin base.
 */
export function alternarBase(prev: readonly string[], id: string, max: 1 | 2): string[] {
  if (prev.includes(id)) return max === 1 || prev.length === 1 ? [...prev] : prev.filter((x) => x !== id);
  return prev.length < max ? [...prev, id] : [...prev.slice(0, max - 1), id];
}

export function calcularTotales(opts: {
  base?: Ingrediente | null;
  /** Una o dos bases; si viene, manda sobre `base`. */
  bases?: (Ingrediente | null | undefined)[];
  /** Cómo se cobran dos bases (de fábrica, "mitad"). */
  cobroBases?: CobroBases;
  /** las que vengan; los undefined se ignoran */
  proteinas?: (Ingrediente | null | undefined)[];
  toppings?: Ingrediente[];
  impuestoPct: number;
  tipo?: TipoServicio;
  costoDomicilio?: number;
  incluidos?: number;
}): Totales {
  const incluidos = opts.incluidos ?? TOPPINGS_INCLUIDOS;
  const prots = (opts.proteinas ?? []).filter(Boolean) as Ingrediente[];
  // Las SALSAS valen $0 en la carta: se filtran para que no ensucien el conteo.
  const tops = soloCobrables(opts.toppings ?? []);

  const subtotal =
    precioBases(opts.bases ?? [opts.base], opts.cobroBases) +
    prots.reduce((s, p) => s + p.precio, 0) +
    cobroToppings(tops, incluidos);

  const impuesto = subtotal - sinImpuesto(subtotal, opts.impuestoPct);
  const domicilio = opts.tipo === "domicilio" ? opts.costoDomicilio ?? 0 : 0;

  return { subtotal, impuesto, domicilio, total: subtotal + domicilio };
}

/**
 * LA CUENTA DE UN PEDIDO CON PRECIOS FINALES.
 *
 * Una sola función decide cómo se parte lo que paga el cliente entre lo que es del
 * negocio y lo que es de la DIAN. El total sale EXACTO de la carta: se resta el
 * descuento a lo que vio el cliente y solo después se separa el impuesto, así que
 * nunca aparece un $40.901 donde la carta suma $40.900.
 *
 * Devuelve las dos caras:
 *  · lo que vio el cliente: `bruto`, `descuentoFinal`, `neto`, `total`;
 *  · la contabilidad sin impuesto que leen reportes y arqueo: `subtotal`, `descuento`,
 *    `impuesto`, que cumplen subtotal − descuento + impuesto + domicilio = total.
 */
export interface CuentaIncluida {
  bruto: number;
  descuentoFinal: number;
  neto: number;
  subtotal: number;
  descuento: number;
  impuesto: number;
  domicilio: number;
  total: number;
}
export function cuentaIncluida(o: {
  bruto: number;
  impuestoPct?: number;
  descuentoFinal?: number;
  domicilio?: number;
}): CuentaIncluida {
  const bruto = Math.max(0, Math.round(o.bruto));
  const descuentoFinal = Math.max(0, Math.min(bruto, Math.round(o.descuentoFinal ?? 0)));
  const neto = bruto - descuentoFinal;
  const subtotal = sinImpuesto(bruto, o.impuestoPct);
  const baseNeta = sinImpuesto(neto, o.impuestoPct);
  const domicilio = Math.max(0, Math.round(o.domicilio ?? 0));
  return {
    bruto,
    descuentoFinal,
    neto,
    subtotal,
    descuento: subtotal - baseNeta,
    impuesto: neto - baseNeta,
    domicilio,
    total: neto + domicilio,
  };
}

/** Lo que suma la carta en un pedido (precio final por renglón × cantidad). */
export function brutoDe(p: Pedido): number {
  return lineasDe(p).reduce((s, l) => s + (l.precioFinal ?? l.precio) * l.cantidad, 0);
}

/**
 * EL PAPEL, UNA SOLA VEZ: renglones, sumas y total de un comprobante.
 *
 * Cuatro sitios lo imprimen (la imagen de la térmica, el texto ESC/POS, el WhatsApp y
 * la vista en pantalla) y cada uno hacía su propia suma. Ahora todos leen de aquí.
 *
 * Un pedido con precios finales imprime cada renglón a precio de carta y el impuesto
 * como "incluido". Uno de antes conserva su papel de siempre (renglones sin impuesto,
 * impuesto sumado): reimprimirlo tiene que decir lo mismo que el día que se cobró.
 */
export interface CuentaImpresa {
  lineas: { cantidad: number; nombre: string; detalle?: string; importe: number; adicional?: boolean }[];
  sumas: [string, number][];
  total: number;
  /** "Incluye impuesto al consumo (8%): $3.852" — va debajo del total. */
  nota?: string;
}
export function cuentaImpresa(p: Pedido, impuestoPctAjustes?: number): CuentaImpresa {
  const pct = p.impuestoPct ?? impuestoPctAjustes;
  const ls = lineasDe(p);
  if (p.impuestoIncluido) {
    const lineas = ls.map((l) => ({
      cantidad: l.cantidad,
      nombre: l.nombre,
      detalle: l.detalle,
      importe: (l.precioFinal ?? l.precio) * l.cantidad,
      adicional: l.adicional,
    }));
    const bruto = p.bruto ?? lineas.reduce((s, l) => s + l.importe, 0);
    const desc = p.descuentoFinal ?? 0;
    const domicilio = p.domicilio ?? 0;
    const sumas: [string, number][] = [];
    /* "Subtotal" solo cuando algo lo separa del total: con un pedido sin descuento ni
       envío, dos renglones con la misma cifra seguidos son ruido. */
    if (desc || domicilio) sumas.push(["Subtotal", bruto]);
    if (desc) sumas.push(["Descuento", -desc]);
    if (domicilio) sumas.push(["Domicilio", domicilio]);
    return {
      lineas,
      sumas,
      total: bruto - desc + domicilio,
      nota: p.impuesto
        ? `Incluye impuesto al consumo${pct ? ` (${pct}%)` : ""}: ${formatCOP(p.impuesto)}`
        : undefined,
    };
  }
  const lineas = ls.map((l) => ({
    cantidad: l.cantidad,
    nombre: l.nombre,
    detalle: l.detalle,
    importe: l.precio * l.cantidad,
    adicional: l.adicional,
  }));
  const sumas: [string, number][] = [["Consumo", p.subtotal]];
  if (p.descuento) sumas.push(["Descuento", -p.descuento]);
  if (p.impuesto) sumas.push([`Impuesto${pct ? ` (${pct}%)` : ""}`, p.impuesto]);
  if (p.domicilio) sumas.push(["Domicilio", p.domicilio]);
  return {
    lineas,
    sumas,
    total: p.subtotal - (p.descuento ?? 0) + (p.impuesto ?? 0) + (p.domicilio ?? 0),
  };
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
