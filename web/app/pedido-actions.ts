"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  crearPedido,
  avanzarPedido,
  cobrarPedido,
  cancelarPedido,
  asignarMesa,
  type NuevoPedido,
} from "@/lib/catalog";
import type { MetodoPago } from "@/lib/menu";

async function authed() {
  return (await cookies()).get("pg_admin")?.value === "1";
}

function refrescarPanel() {
  revalidatePath("/admin");
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/cocina");
  revalidatePath("/admin/mesas");
  revalidatePath("/admin/reportes");
}

/**
 * Público: el cliente arma su enredo y lo envía (Fase 3).
 *
 * Nunca lanza hacia el cliente: `crearPedido` puede rechazar (p. ej. pedido mínimo a
 * domicilio) y eso debe llegar como un mensaje que la UI pueda mostrar, no como un
 * error de servidor sin cara. Los campos van siempre presentes para no obligar a
 * los tres consumidores a estrechar tipos.
 */
export async function enviarPedido(input: NuevoPedido) {
  try {
    const pedido = await crearPedido(input);
    revalidatePath("/"); // el stock/agotado pudo cambiar
    refrescarPanel();
    return {
      ok: true,
      id: pedido.id,
      total: pedido.total,
      estado: pedido.estado,
      error: null as string | null,
    };
  } catch (e) {
    return {
      ok: false,
      id: "",
      total: 0,
      estado: "recibido" as const,
      error: e instanceof Error ? e.message : "No pudimos crear el pedido.",
    };
  }
}

/** Público (EMPLATA): estado en vivo de UN pedido para la pantalla del cliente (polling). */
export async function estadoPedido(id: string) {
  if (!id) return null;
  const { getCatalog } = await import("@/lib/catalog");
  const cat = await getCatalog();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) return null;
  return { id: p.id, estado: p.estado, total: p.total, mesa: p.mesa ?? null };
}

/** Cocina/admin: avanza el estado de un pedido. */
export async function avanzarPedidoAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await avanzarPedido(id);
  refrescarPanel();
}

/** Admin: cobra un pedido con su método de pago. */
export async function cobrarAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  const metodo = String(formData.get("metodo") ?? "") as MetodoPago;
  if (!id || !metodo) return;
  const propina = Number(formData.get("propina") ?? 0);
  const descuento = Number(formData.get("descuento") ?? 0);
  await cobrarPedido(id, metodo, propina, descuento);
  refrescarPanel();
}

/** Admin: cancela un pedido. */
export async function cancelarAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await cancelarPedido(id);
  refrescarPanel();
}

/** Admin: asigna una mesa a un pedido. */
export async function asignarMesaAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  const mesa = Number(formData.get("mesa") ?? 0);
  if (!id || !mesa) return;
  await asignarMesa(id, mesa);
  refrescarPanel();
}
