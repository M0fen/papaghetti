"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  crearPedido,
  avanzarPedido,
  retrocederPedido,
  cobrarPedido,
  cancelarPedido,
  asignarMesa,
  type NuevoPedido,
} from "@/lib/catalog";
import { haySesion } from "@/lib/sesion";
import { avisar } from "@/app/admin/actions";
import type { EstadoPedido, MetodoPago } from "@/lib/menu";

async function authed() {
  return haySesion();
}

function refrescarPanel() {
  revalidatePath("/admin");
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/cocina");
  revalidatePath("/admin/mesas");
  revalidatePath("/admin/reportes");
}

/** Convierte el "no" del cerebro en un aviso visible del panel, nunca en un 500. */
async function operar(fn: () => Promise<unknown>, exito?: string) {
  try {
    await fn();
    if (exito) await avisar(exito, "ok");
  } catch (e) {
    await avisar(e instanceof Error ? e.message : "No se pudo completar la acción.");
  }
  refrescarPanel();
}

/* ------------------------------------------------------------------ */
/* PÚBLICO                                                            */
/* ------------------------------------------------------------------ */

/**
 * Freno de pedidos por origen. `enviarPedido` es la ÚNICA acción pública que muta el
 * cerebro y no tenía límite alguno: en bucle vaciaba la despensa real (marcando toda la
 * carta como agotada para los clientes de verdad) y empujaba los pedidos reales fuera
 * del tope del documento. En memoria de la instancia — no es una defensa distribuida,
 * pero corta el abuso desde un solo origen, que es el ataque realista aquí.
 */
const ultimos = new Map<string, number[]>();
const VENTANA_MS = 60_000;
const MAX_POR_MINUTO = 5;

async function origen(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocido";
}

function demasiados(ip: string): boolean {
  const ahora = Date.now();
  const previos = (ultimos.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  previos.push(ahora);
  ultimos.set(ip, previos);
  if (ultimos.size > 1000) ultimos.clear(); // techo de memoria
  return previos.length > MAX_POR_MINUTO;
}

/**
 * Público: el cliente arma su enredo y lo envía (Fase 3).
 *
 * Nunca lanza hacia el cliente: `crearPedido` rechaza por muchos motivos legítimos
 * (cerrado, agotado, mínimo a domicilio, falta la dirección) y eso debe llegar como un
 * mensaje que la UI pueda mostrar, no como un error de servidor sin cara.
 */
export async function enviarPedido(input: NuevoPedido) {
  const fallo = (error: string) => ({
    ok: false,
    id: "",
    total: 0,
    estado: "recibido" as const,
    error,
  });
  try {
    if (demasiados(await origen())) {
      return fallo("Vas muy rápido. Espera un momento y vuelve a intentarlo.");
    }
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
    return fallo(e instanceof Error ? e.message : "No pudimos crear el pedido.");
  }
}

/** Público (EMPLATA): estado en vivo de UN pedido para la pantalla del cliente (polling). */
export async function estadoPedido(id: string) {
  if (!id) return null;
  const { getCatalog } = await import("@/lib/catalog");
  const cat = await getCatalog();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) return null;
  // Solo lo que la pantalla de espera necesita: el total y la mesa ya los conoce quien
  // pidió, pero este endpoint es público y adivinable, así que no repartimos de más.
  return { id: p.id, estado: p.estado };
}

/* ------------------------------------------------------------------ */
/* PANEL (requieren sesión)                                           */
/* ------------------------------------------------------------------ */

/**
 * Cocina/admin: avanza el estado de un pedido.
 * `desde` lo hace idempotente: el doble toque en una tablet con red lenta ya no salta
 * de "recibido" a "listo" sin pasar por la plancha.
 */
export async function avanzarPedidoAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const desde = String(formData.get("desde") ?? "") as EstadoPedido;
  await operar(() => avanzarPedido(id, desde || undefined));
}

/** Cocina: devuelve un pedido al paso anterior (corregir un toque de más). */
export async function retrocederPedidoAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await operar(() => retrocederPedido(id));
}

/** Admin: cobra un pedido con su método de pago. */
export async function cobrarAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  const metodo = String(formData.get("metodo") ?? "") as MetodoPago;
  if (!id || !metodo) return;
  const propina = Number(formData.get("propina") ?? 0);
  const descuento = Number(formData.get("descuento") ?? 0);
  await operar(() => cobrarPedido(id, metodo, propina, descuento), `Cobrado #${id}`);
}

/** Admin: cancela un pedido (con motivo, y devolviendo la despensa si no se cocinó). */
export async function cancelarAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const motivo = String(formData.get("motivo") ?? "").trim();
  await operar(() => cancelarPedido(id, motivo || undefined), `Pedido #${id} cancelado`);
}

/** Admin: asigna una mesa a un pedido. */
export async function asignarMesaAction(formData: FormData) {
  if (!(await authed())) return;
  const id = String(formData.get("id") ?? "");
  const mesa = Number(formData.get("mesa") ?? 0);
  if (!id || !mesa) return;
  await operar(() => asignarMesa(id, mesa), `#${id} → mesa ${mesa}`);
}

/**
 * Admin: cobra TODOS los pendientes de una mesa de una vez.
 * Un grupo de 4 que pide por QR son 4 pedidos; cobrarlos uno a uno buscándolos entre
 * los del día era el trabajo más tonto del turno.
 */
export async function cobrarMesaAction(formData: FormData) {
  if (!(await authed())) return;
  const mesa = Number(formData.get("mesa") ?? 0);
  const metodo = String(formData.get("metodo") ?? "efectivo") as MetodoPago;
  if (!mesa) return;
  const { getCatalog } = await import("@/lib/catalog");
  const cat = await getCatalog();
  const pendientes = cat.pedidos.filter(
    (p) => p.tipo === "mesa" && p.mesa === mesa && p.pago === "pendiente" && p.estado !== "cancelado",
  );
  if (!pendientes.length) {
    await avisar("Esa mesa no tiene nada por cobrar.");
    refrescarPanel();
    return;
  }
  let total = 0;
  for (const p of pendientes) {
    try {
      await cobrarPedido(p.id, metodo, 0, 0);
      total += p.subtotal + p.impuesto + (p.domicilio ?? 0);
    } catch (e) {
      await avisar(e instanceof Error ? e.message : "No se pudo cobrar un pedido.");
    }
  }
  await avisar(`Mesa ${mesa} cobrada: ${pendientes.length} pedido(s) · $${total.toLocaleString("es-CO")}`, "ok");
  refrescarPanel();
}

/** Admin: crea un pedido desde el mostrador o el teléfono (canal "salon"). */
export async function crearPedidoPanelAction(formData: FormData) {
  if (!(await authed())) return;
  const baseId = String(formData.get("baseId") ?? "");
  const proteinaIds = formData.getAll("proteinaId").map(String).filter(Boolean);
  const toppingIds = formData.getAll("toppingId").map(String).filter(Boolean);
  const tipo = String(formData.get("tipo") ?? "llevar") as NuevoPedido["tipo"];
  if (!baseId || proteinaIds.length === 0) {
    await avisar("Elige al menos una base y una proteína.");
    return;
  }
  await operar(
    () =>
      crearPedido({
        baseId,
        proteinaId: proteinaIds[0],
        proteinaIds,
        toppingIds,
        canal: "salon",
        tipo,
        mesa: tipo === "mesa" ? Number(formData.get("mesa") ?? 0) : undefined,
        cliente: String(formData.get("cliente") ?? "").trim() || undefined,
        telefono: String(formData.get("telefono") ?? "").trim() || undefined,
        direccion: String(formData.get("direccion") ?? "").trim() || undefined,
        notas: String(formData.get("notas") ?? "").trim() || undefined,
      }),
    "Pedido creado",
  );
}
