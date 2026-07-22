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
