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

/* ══════════════════════════════════════════════════════════════════════════
   SUBIR O BAJAR LOS PRECIOS DE UNA VEZ (Precios → Ajustar precios)

   Cuando sube el queso o el arriendo, el dueño cambiaba la carta precio por precio:
   cuarenta guardados, y a mitad de camino ya no sabía cuáles había tocado. Aquí se
   hace de una vez y con vista previa. La pantalla y el servidor (`ajustarPrecios`, en
   catalog.ts) arman el MISMO plan con esta misma función: lo que se ve antes de
   confirmar es exactamente lo que se guarda, y si algo cambió en el medio la firma de
   la vista previa deja de coincidir y no se toca nada.

   Las decisiones, de una vez:
    · Se redondea a $100, con aritmética de enteros (ver `precioAjustado`).
    · Las SALSAS no se tocan nunca: van con el plato, y ni siquiera son un grupo que se
      pueda elegir. Un precio en $0 se queda en $0: es "va incluido", no un descuido.
    · Los productos FUERA DE LA CARTA (apagados) también se ajustan. Un plato que se
      apaga por temporada y vuelve en tres meses tiene que volver al precio de ahora, no
      al de antes del alza. La vista previa los marca para que no sorprendan.
    · Lo que ya se pidió NO cambia: cada renglón congeló su precio al crearse, así que
      las cuentas abiertas se cobran como se pidieron.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un precio subido (o bajado, con `pct` negativo) un porcentaje y redondeado a $100.
 *
 * Con enteros y no con `precio * (1 + pct / 100)`: en coma flotante, $3.000 + 15 % da
 * 3449,999… y se redondeaba a $3.400 en vez de $3.500 ($5.000 + 13 % daba $5.600). El
 * porcentaje admite UN decimal (8,5 %), así que se cuenta en décimas: precio × (1000 +
 * décimas) es un entero exacto y al dividir entre 100.000 un medio exacto cae en ,5 sin
 * error de representación. Un precio con valor nunca baja de $100 (el redondeo no puede
 * regalar un producto) y uno en $0 se queda en $0.
 */
export function precioAjustado(precio: number, pct: number): number {
  const p = Math.round(Number(precio));
  if (!Number.isFinite(p) || p <= 0) return 0;
  const decimas = Math.round(Number(pct) * 10);
  if (!Number.isFinite(decimas) || decimas === 0) return p;
  const centenas = Math.round((p * Math.max(0, 1000 + decimas)) / 100_000);
  return Math.max(100, centenas * 100);
}

/** Los grupos que se pueden ajustar, en el orden de la carta. Las salsas no están: no se tocan. */
export type GrupoAjuste = "bases" | "proteinas" | "acompanantes" | "platos" | "adicionales";
export const GRUPOS_AJUSTE: readonly { id: GrupoAjuste; etiqueta: string; detalle: string }[] = [
  { id: "bases", etiqueta: "Bases", detalle: "La base de cada plato armado" },
  { id: "proteinas", etiqueta: "Proteínas", detalle: "Las que se eligen al armar" },
  { id: "acompanantes", etiqueta: "Acompañantes", detalle: "Los que se cobran; las salsas no se tocan" },
  { id: "platos", etiqueta: "Platos", detalle: "Los de precio cerrado: combos, ensaladas, a la carta" },
  { id: "adicionales", etiqueta: "Adicionales", detalle: "Los botones de la caja: bebidas, empaques…" },
];
/** Lista blanca: lo que llega de un formulario solo vale si es uno de estos. */
export const esGrupoAjuste = (x: unknown): x is GrupoAjuste => GRUPOS_AJUSTE.some((g) => g.id === x);

/** Cuánto se puede mover de una vez. Más de 50 % casi siempre es un cero de más. */
export const PCT_MAX_AJUSTE = 50;
/**
 * El tope de un adicional: el MISMO de `itemAdicional` en catalog.ts (un adicional de más
 * de esto es, casi seguro, un cero de más). El servidor lo vuelve a revisar al aplicar.
 */
export const TOPE_ADICIONAL = 5_000_000;

/**
 * El porcentaje tal como lo escribe la gente ("8", "8,5", "8.5 %") → un número con un
 * decimal, o NaN si no lo es. Sin signo: si sube o baja lo dice el botón, no el texto.
 */
export function leerPct(raw: unknown): number {
  const t = String(raw ?? "").replace(/[\s%]/g, "").replace(",", ".");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return NaN;
  return Math.round(Number(t) * 10) / 10;
}

/** Lo mínimo de un producto para ajustarle el precio. */
export interface ProductoAjuste {
  id: string;
  nombre: string;
  precio: number;
  /** `false` = fuera de la carta (se ajusta igual; ver arriba). */
  activo?: boolean;
}
/** Lo que el plan necesita del cerebro. La pantalla lo recibe así, recortado (sin fotos ni recetas). */
export interface ListasAjuste {
  bases: ProductoAjuste[];
  proteinas: ProductoAjuste[];
  toppings: (ProductoAjuste & { categoria?: string })[];
  enredos: (ProductoAjuste & { baseId?: string; proteinaId?: string; toppingIds?: string[]; gancho?: string })[];
  adicionales: ProductoAjuste[];
  promos: { id: string; texto: string; activo?: boolean }[];
  /** Cuentas sin cobrar en este momento (solo para el aviso). */
  cuentasAbiertas: number;
}

/**
 * Del cerebro a lo que necesita el plan, con lo justo de cada producto. Lo usan la
 * página (que se lo pasa a la pantalla) y el servidor: los dos planes salen de lo mismo.
 */
export function listasAjusteDe(c: {
  bases: readonly ProductoAjuste[];
  proteinas: readonly ProductoAjuste[];
  toppings: readonly (ProductoAjuste & { categoria?: string })[];
  enredos: readonly (ProductoAjuste & { baseId?: string; proteinaId?: string; toppingIds?: string[]; gancho?: string })[];
  ajustes: { adicionales?: readonly ProductoAjuste[]; promos?: readonly { id: string; texto: string; activo?: boolean }[] };
  pedidos?: readonly { pago: string; estado: string }[];
}): ListasAjuste {
  const prod = (x: ProductoAjuste): ProductoAjuste => ({ id: x.id, nombre: x.nombre, precio: x.precio, activo: x.activo });
  return {
    bases: (c.bases ?? []).map(prod),
    proteinas: (c.proteinas ?? []).map(prod),
    toppings: (c.toppings ?? []).map((t) => ({ ...prod(t), categoria: t.categoria })),
    enredos: (c.enredos ?? []).map((e) => ({
      ...prod(e),
      baseId: e.baseId,
      proteinaId: e.proteinaId,
      toppingIds: [...(e.toppingIds ?? [])],
      gancho: e.gancho,
    })),
    adicionales: (c.ajustes?.adicionales ?? []).map(prod),
    promos: (c.ajustes?.promos ?? []).map((p) => ({ id: p.id, texto: p.texto, activo: p.activo })),
    cuentasAbiertas: (c.pedidos ?? []).filter((p) => p.pago === "pendiente" && p.estado !== "cancelado").length,
  };
}

export interface CambioPrecio {
  grupo: GrupoAjuste;
  id: string;
  nombre: string;
  antes: number;
  despues: number;
  fueraDeCarta?: true;
}
export interface PrecioIgual {
  grupo: GrupoAjuste;
  id: string;
  nombre: string;
  precio: number;
  fueraDeCarta?: true;
  /** Por qué no cambia, dicho para el dueño. */
  porque: string;
}
export interface AvisoAjuste {
  /** ahorro: el "Ahorras" de un combo en la portada · texto: un precio escrito a mano ·
   *  tope: un adicional que se pasaría · cuentas: lo que ya se pidió no cambia. */
  tipo: "ahorro" | "texto" | "tope" | "cuentas";
  texto: string;
}
export interface PlanAjuste {
  cambios: CambioPrecio[];
  sinCambio: PrecioIgual[];
  avisos: AvisoAjuste[];
  /** La huella de la vista previa: el servidor solo aplica si la suya es la misma. */
  firma: string;
}

/** FNV-1a de 32 bits: una huella corta para saber si dos listas son la misma, no un secreto. */
function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
/**
 * La firma de un plan: cada "grupo:id:antes>después", en orden. Un precio que otro tocó,
 * un producto nuevo o borrado en esos grupos, otro porcentaje… y deja de coincidir.
 */
const firmaDe = (cambios: readonly CambioPrecio[]): string =>
  `${cambios.length}-${huella(cambios.map((c) => `${c.grupo}:${c.id}:${c.antes}>${c.despues}`).join("|"))}`;

const PRECIO_ESCRITO = /\$\s?\d/;
const corto = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * EL "AHORRAS" DE LA PORTADA. FeaturedMenu le pone a cada combo "Ahorras $X", con X =
 * lo que cuestan sus piezas sueltas − el precio del combo. Subir las piezas y no el combo
 * (o al revés) lo hace aparecer, desaparecer o cambiar, y hasta el redondeo a $100 lo
 * mueve: con +5 % parejo, el Don crocante pasa a decir "Ahorras $100". Se calcula con la
 * MISMA cuenta que la portada (`calcularTotales`), antes y después.
 */
function avisosAhorro(listas: ListasAjuste, cambios: readonly CambioPrecio[]): AvisoAjuste[] {
  const ingNuevo = new Map<string, number>();
  const platoNuevo = new Map<string, number>();
  for (const c of cambios) {
    if (c.grupo === "platos") platoNuevo.set(c.id, c.despues);
    else if (c.grupo !== "adicionales") ingNuevo.set(c.id, c.despues);
  }
  const indice = new Map([...listas.bases, ...listas.proteinas, ...listas.toppings].map((i) => [i.id, i]));
  const sueltas = (e: ListasAjuste["enredos"][number], nuevos: boolean): number | null => {
    const pieza = (id?: string): Ingrediente | undefined => {
      const i = id ? indice.get(id) : undefined;
      if (!i) return undefined;
      return { ...i, precio: nuevos ? (ingNuevo.get(i.id) ?? i.precio) : i.precio } as Ingrediente;
    };
    const base = pieza(e.baseId);
    const proteina = pieza(e.proteinaId);
    // Solo los combos se comparan con armarlos por partes (la misma regla de la portada).
    if (!base || !proteina) return null;
    const toppings = (e.toppingIds ?? []).map(pieza).filter(Boolean) as Ingrediente[];
    return calcularTotales({ base, proteinas: [proteina], toppings, impuestoPct: 0 }).total;
  };
  const avisos: AvisoAjuste[] = [];
  for (const e of listas.enredos) {
    if (e.activo === false) continue; // fuera de la carta no debería salir en la portada
    const antesSuelto = sueltas(e, false);
    const despuesSuelto = sueltas(e, true);
    if (antesSuelto === null || despuesSuelto === null) continue;
    const antes = antesSuelto - e.precio;
    const despues = despuesSuelto - (platoNuevo.get(e.id) ?? e.precio);
    if (antes === despues) continue;
    let texto = "";
    if (despues < 0 && antes >= 0) {
      texto = `«${e.nombre}» queda ${formatCOP(-despues)} más caro que armarlo por partes${antes > 0 ? ` (hoy la portada dice «Ahorras ${formatCOP(antes)}»)` : ""}.`;
    } else if (antes <= 0 && despues > 0) {
      texto = `«${e.nombre}» va a decir «Ahorras ${formatCOP(despues)}» en la portada.`;
    } else if (antes > 0 && despues <= 0) {
      texto = `«${e.nombre}» deja de decir «Ahorras ${formatCOP(antes)}» en la portada.`;
    } else if (antes > 0 && despues > 0) {
      texto = `«${e.nombre}»: el «Ahorras» de la portada pasa de ${formatCOP(antes)} a ${formatCOP(despues)}.`;
    }
    if (texto) avisos.push({ tipo: "ahorro", texto });
  }
  return avisos;
}

/** Textos con un precio escrito a mano: no los cambia nadie más que una persona. */
function avisosPrecioEscrito(listas: ListasAjuste): AvisoAjuste[] {
  const avisos: AvisoAjuste[] = [];
  for (const p of listas.promos ?? []) {
    if (!PRECIO_ESCRITO.test(p.texto ?? "")) continue;
    avisos.push({
      tipo: "texto",
      texto: `La promoción «${corto(p.texto)}»${p.activo ? "" : " (apagada)"} tiene un precio escrito a mano: no cambia sola. Se edita en Ajustes → Promociones.`,
    });
  }
  for (const e of listas.enredos ?? []) {
    if (!PRECIO_ESCRITO.test(e.gancho ?? "")) continue;
    avisos.push({
      tipo: "texto",
      texto: `La descripción de «${e.nombre}» tiene un precio escrito a mano: no cambia sola. Se edita en Menú.`,
    });
  }
  return avisos;
}

function avisoCuentas(abiertas: number): AvisoAjuste {
  const texto =
    abiertas > 1
      ? `Las ${abiertas} cuentas abiertas conservan sus precios: lo nuevo aplica desde el próximo pedido.`
      : abiertas === 1
        ? "La cuenta abierta conserva sus precios: lo nuevo aplica desde el próximo pedido."
        : "Los pedidos ya tomados conservan sus precios: lo nuevo aplica desde el próximo pedido.";
  return { tipo: "cuentas", texto };
}

/**
 * EL PLAN: qué precio pasa a cuál, qué se queda igual (y por qué) y qué conviene mirar.
 * Pura: la vista previa la corre en cada tecla y el servidor una vez, con su propia
 * lectura. `pct` lleva el signo (−5 = bajar 5 %); un grupo desconocido se ignora.
 */
export function planAjuste(listas: ListasAjuste, pct: number, grupos: readonly string[]): PlanAjuste {
  const elegidos = new Set(grupos.filter(esGrupoAjuste));
  const fuentes: Record<GrupoAjuste, readonly ProductoAjuste[]> = {
    bases: listas.bases ?? [],
    proteinas: listas.proteinas ?? [],
    // La misma regla que la caja y la hoja de precios: las salsas no son acompañantes que se cobren.
    acompanantes: (listas.toppings ?? []).filter((t) => t.categoria !== "salsa"),
    platos: listas.enredos ?? [],
    adicionales: listas.adicionales ?? [],
  };
  const cambios: CambioPrecio[] = [];
  const sinCambio: PrecioIgual[] = [];
  const topes: AvisoAjuste[] = [];
  const hayPct = Number.isFinite(pct) && Math.round(pct * 10) !== 0;
  for (const g of GRUPOS_AJUSTE) {
    if (!hayPct || !elegidos.has(g.id)) continue;
    for (const it of fuentes[g.id]) {
      const antes = Math.max(0, Math.round(Number(it.precio) || 0));
      const despues = precioAjustado(antes, pct);
      const fueraDeCarta = it.activo === false || undefined;
      const quien = { grupo: g.id, id: it.id, nombre: it.nombre, fueraDeCarta };
      if (g.id === "adicionales" && despues > TOPE_ADICIONAL) {
        sinCambio.push({ ...quien, precio: antes, porque: "pasaría el tope de un adicional" });
        topes.push({
          tipo: "tope",
          texto: `«${it.nombre}» quedaría en ${formatCOP(despues)}, más que el tope de un adicional (${formatCOP(TOPE_ADICIONAL)}): se queda como está.`,
        });
        continue;
      }
      if (despues === antes) {
        sinCambio.push({ ...quien, precio: antes, porque: antes === 0 ? "está en $0" : "con el redondeo queda igual" });
        continue;
      }
      cambios.push({ ...quien, antes, despues });
    }
  }
  const avisos = cambios.length
    ? [...avisosAhorro(listas, cambios), ...avisosPrecioEscrito(listas), ...topes, avisoCuentas(listas.cuentasAbiertas ?? 0)]
    : topes;
  return { cambios, sinCambio, avisos, firma: firmaDe(cambios) };
}

/** "8 %" o "8,5 %", sin signo. */
export const pctTexto = (pct: number): string =>
  `${(Math.round(Math.abs(pct) * 10) / 10).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;

/** "Bases", "Bases y Proteínas", "Bases, Proteínas y Platos": solo los grupos que cambian. */
export function gruposTexto(cambios: readonly { grupo: GrupoAjuste }[]): string {
  const n = GRUPOS_AJUSTE.filter((g) => cambios.some((c) => c.grupo === g.id)).map((g) => g.etiqueta);
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}` : (n[0] ?? "");
}

/** Lo que queda en el historial y en el botón Deshacer: "Subió 8 % los precios de Bases (6 productos)". */
export function textoAjuste(plan: Pick<PlanAjuste, "cambios">, pct: number): string {
  const n = plan.cambios.length;
  return `${pct > 0 ? "Subió" : "Bajó"} ${pctTexto(pct)} los precios de ${gruposTexto(plan.cambios)} (${n} producto${n === 1 ? "" : "s"})`;
}

/** El aviso de que salió bien, con la salida a mano. */
export function textoListo(n: number, pct: number): string {
  const verbo = pct > 0 ? (n === 1 ? "subió" : "subieron") : n === 1 ? "bajó" : "bajaron";
  return `Listo: ${n} ${n === 1 ? "precio" : "precios"} ${verbo} ${pctTexto(pct)}. Si no era eso, toca Deshacer.`;
}

/**
 * Lo que la acción le devuelve a la pantalla. `vez` cuenta los ajustes que salieron bien:
 * cuando sube, el formulario se vuelve a montar vacío (la vista previa ya no puede invitar
 * a aplicar el mismo porcentaje otra vez sobre los precios nuevos). `marca` dice a qué
 * versión del formulario responde el error, para borrarlo en cuanto se toque algo.
 */
export interface EstadoAjuste {
  vez: number;
  listo?: string;
  error?: string;
  marca?: string;
}
