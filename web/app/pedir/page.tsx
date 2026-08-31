import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { TOPPINGS_INCLUIDOS } from "@/lib/menu";
import EmplataSwitch from "../m/[mesa]/EmplataSwitch";
import "../m/[mesa]/emplata.css";

/**
 * EL MENÚ DEL CLIENTE — la dirección del QR.
 *
 * UNA sola dirección para todo el local: papaghetti.vercel.app/pedir. Antes cada mesa
 * tenía su /m/N, pero aquí las mesas no se asignan, así que el número era una ficción
 * y obligaba a imprimir un QR distinto por mesa. Ahora el mismo código sirve en la
 * recepción, en la barra y en cualquier mesa: el cliente escribe DÓNDE está al pedir.
 *
 * Server component: lee el cerebro y entrega solo lo que el cliente necesita.
 */
export const metadata: Metadata = {
  title: "Papaghetti · Pide aquí",
  description: "Arma tu enredo o pide un plato de la carta. Va directo a la cocina.",
};

// El menú cambia con el inventario (agotados) → siempre fresco.
export const dynamic = "force-dynamic";

export default async function PedirPage() {
  const cat = await getCatalog();
  const activos = (list: typeof cat.bases) => list.filter((i) => i.activo);

  return (
    <EmplataSwitch
      mesa={0} /* sin mesa: el cliente escribe dónde está */
      negocio={cat.ajustes.negocio || "Papaghetti"}
      abierto={cat.ajustes.abierto ?? true}
      impuestoPct={cat.ajustes.impuestoPct ?? 0}
      incluidos={TOPPINGS_INCLUIDOS}
      bases={activos(cat.bases)}
      proteinas={activos(cat.proteinas)}
      toppings={activos(cat.toppings)}
      /* Los 12 platos de precio cerrado: sin esto, media carta (y los tickets más
         altos del negocio) no existían para quien pide desde el teléfono. */
      platos={cat.enredos.filter((e) => e.activo !== false)}
    />
  );
}
