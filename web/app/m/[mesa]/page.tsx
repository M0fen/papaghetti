import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { TOPPINGS_INCLUIDOS } from "@/lib/menu";
import EmplataClient from "./EmplataClient";
import "./emplata.css";

/**
 * EMPLATA — la capa de pedido del cliente por QR en mesa (mobile-first, una mano).
 *
 * Server component: lee EL CEREBRO (getCatalog — Supabase o archivo, da igual aquí) y le pasa al
 * cliente SOLO lo que necesita. Cero data hardcodeada: menú, precios, impuesto y estado de negocio
 * salen del catálogo vivo. El pedido entra por el MISMO flujo existente (enviarPedido → crearPedido,
 * canal "qr") y aparece solo en el KDS de cocina.
 */

export const metadata: Metadata = {
  title: "Papaghetti · Emplata tu caja",
  description: "Arma tu caja Papaghetti desde la mesa y pídela a cocina.",
};

// El menú cambia con el inventario (agotados) → siempre fresco.
export const dynamic = "force-dynamic";

export default async function MesaPage({
  params,
}: {
  params: Promise<{ mesa: string }>;
}) {
  const { mesa: mesaRaw } = await params;
  const cat = await getCatalog();

  const numMesas = cat.ajustes.numMesas ?? 12;
  let mesa = parseInt(mesaRaw, 10);
  if (!Number.isFinite(mesa) || mesa < 1) mesa = 1;
  if (mesa > numMesas) mesa = numMesas;

  const activos = (list: typeof cat.bases) => list.filter((i) => i.activo);

  return (
    <EmplataClient
      mesa={mesa}
      negocio={cat.ajustes.negocio || "Papaghetti"}
      abierto={cat.ajustes.abierto ?? true}
      impuestoPct={cat.ajustes.impuestoPct ?? 0}
      incluidos={TOPPINGS_INCLUIDOS}
      bases={activos(cat.bases)}
      proteinas={activos(cat.proteinas)}
      toppings={activos(cat.toppings)}
    />
  );
}
