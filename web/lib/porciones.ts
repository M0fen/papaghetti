/**
 * LO QUE SALIÓ DE LA COCINA, EN PORCIONES.
 *
 * "Lo más pedido" contaba el TEXTO del resumen de cada pedido (`p.base`, `p.proteina`),
 * una vez por pedido. Ya contaba mal: una mesa de tres platos sumaba un "3 platos", un
 * plato de la carta se contaba como si su nombre fuera una base, una caja con dos
 * proteínas no le daba crédito a ninguna, y Ghett-IA metía los cancelados. Con dos bases
 * por plato habría sido peor: cada pareja, una base inventada que no le suma a ninguna
 * de las dos de verdad.
 *
 * Aquí se cuentan los COMPONENTES de cada renglón vendido: una porción entera vale 1 y
 * cada base de un "mitad y mitad" vale 0,5, que es lo que de verdad se cocinó. Solo
 * ventas (`esVenta`) y sin adicionales, que no son platos.
 *
 * Es PURO —recibe pedidos, devuelve números—, sin nada de Next: lo leen Finanzas, el
 * cierre de caja (que corre en el navegador) y Ghett-IA, y se prueba en Node.
 */

import { esVenta, lineasDe, type Pedido } from "./menu";

/** Porciones vendidas de cada componente (base, proteína o acompañante), por id. */
export function porcionesPorComponente(pedidos: readonly Pedido[]): Map<string, number> {
  const m = new Map<string, number>();
  const sumar = (id: string, n: number) => m.set(id, (m.get(id) ?? 0) + n);
  for (const p of pedidos) {
    if (!esVenta(p)) continue;
    for (const l of lineasDe(p)) {
      if (l.adicional) continue;
      // `componentes` y `mitades` son de UNA unidad: se multiplican por la cantidad.
      for (const id of l.componentes ?? []) sumar(id, l.cantidad);
      for (const id of l.mitades ?? []) sumar(id, l.cantidad / 2);
    }
  }
  return m;
}

/** Unidades vendidas de cada plato de la carta (de precio cerrado), por id del plato. */
export function platosPorEnredo(pedidos: readonly Pedido[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pedidos) {
    if (!esVenta(p)) continue;
    for (const l of lineasDe(p)) {
      if (l.adicional || !l.enredoId) continue;
      m.set(l.enredoId, (m.get(l.enredoId) ?? 0) + l.cantidad);
    }
  }
  return m;
}

/**
 * Los más pedidos de una lista de la carta, de mayor a menor: `[nombre, porciones]`. Se
 * nombran con la carta de HOY; lo que no se vendió no sale. Empate: el orden de la carta.
 */
export function masPedidos(
  conteo: ReadonlyMap<string, number>,
  lista: readonly { id: string; nombre: string }[],
  max = 5,
): [string, number][] {
  return lista
    .map((x): [string, number] => [x.nombre, conteo.get(x.id) ?? 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
}

/** 2.5 → "2,5" y 3 → "3": las porciones se escriben como se dicen. */
export const porcionesTexto = (n: number): string => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
