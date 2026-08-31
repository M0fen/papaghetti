import type { Catalog } from "./menu";
import { diaNegocio, horaNegocio } from "./precios";
import { insumoBajo } from "./menu";

/**
 * LO QUE FALTA POR HACER — calculado, no una lista que alguien tiene que marcar.
 *
 * La diferencia con un checklist normal: estas tareas se marcan solas cuando se
 * cumplen, porque se derivan del estado real del negocio. Nadie tiene que acordarse
 * de tacharlas, y ninguna miente. Si aparece, es porque de verdad falta.
 *
 * Se agrupan en tres momentos del día:
 *  · "montaje"  — lo que hay que dejar listo ANTES de abrir (una sola vez, o cada día).
 *  · "servicio" — lo que pide atención AHORA mismo.
 *  · "cierre"   — lo que queda pendiente al terminar la jornada.
 */

export type MomentoTarea = "montaje" | "servicio" | "cierre";

export interface Tarea {
  id: string;
  momento: MomentoTarea;
  /** Qué hacer, en una frase que se entiende sin contexto. */
  texto: string;
  /** Por qué importa. Corta: se lee de pasada. */
  porque?: string;
  /** A dónde se va a resolverlo. */
  href: string;
  /** urgente = duele hoy · normal = conviene · suave = cuando puedas. */
  tono: "urgente" | "normal" | "suave";
}

export interface ResumenTareas {
  tareas: Tarea[];
  /** Cuántas de las de montaje están hechas, para la barra de progreso. */
  montajeTotal: number;
  montajeHechas: number;
  listoParaAbrir: boolean;
}

/** Todo lo que el panel sabe que falta, mirando el catálogo de verdad. */
export function tareasDelDia(cat: Catalog): ResumenTareas {
  const t: Tarea[] = [];
  const hoy = diaNegocio();
  const hora = horaNegocio(new Date());
  const a = cat.ajustes;
  const componentes = [...cat.bases, ...cat.proteinas, ...cat.toppings];
  const pedidosHoy = cat.pedidos.filter(
    (p) => diaNegocio(p.creadoEn) === hoy && p.estado !== "cancelado",
  );

  /* ---------- MONTAJE: dejarlo listo antes de abrir ---------- */

  // 1. Los datos del negocio, que son los que salen en el comprobante del cliente.
  if (!a.nit || !a.razonSocial) {
    t.push({
      id: "datos-negocio",
      momento: "montaje",
      texto: "Completa el NIT y la razón social",
      porque: "Son los datos que salen impresos en el comprobante del cliente.",
      href: "/admin/ajustes",
      tono: "normal",
    });
  }

  // 2. Costos de la despensa: sin ellos, el margen de cada plato es una ilusión.
  const sinCosto = cat.insumos.filter((i) => i.activo !== false && !i.costo);
  if (sinCosto.length > 0) {
    t.push({
      id: "costos-insumos",
      momento: "montaje",
      texto: `Ponle precio a ${sinCosto.length} ${sinCosto.length === 1 ? "insumo" : "insumos"} de la despensa`,
      porque:
        "Sin el costo, la utilidad de cada plato sale al 100% y no es real. Se llena solo al registrar una entrada con lo que pagaste.",
      href: "/admin/inventario",
      tono: "normal",
    });
  }

  // 3. Conteo real de la despensa: arranca en el nivel estándar, no en lo que hay.
  const abastecidoHoy = (cat.movimientos ?? []).some(
    (m) => m.tipo === "compra" && diaNegocio(m.fecha) === hoy,
  );
  if (!abastecidoHoy) {
    t.push({
      id: "contar-despensa",
      momento: "montaje",
      texto: "Cuenta la despensa y ajústala a lo que de verdad hay",
      porque:
        "El sistema arranca suponiendo el nivel estándar. Si no cuadra, la carta se agotará (o no) en el momento equivocado.",
      href: "/admin/inventario",
      tono: "normal",
    });
  }

  // 4. Platos de cocina sin ficha técnica: se venden, pero no descuentan nada.
  const platosSinFicha = cat.enredos.filter(
    (e) => e.activo !== false && !e.baseId && !e.proteinaId,
  );
  if (platosSinFicha.length > 0) {
    t.push({
      id: "fichas-platos",
      momento: "montaje",
      texto: `${platosSinFicha.length} platos de la carta no descuentan despensa`,
      porque: `${platosSinFicha
        .slice(0, 3)
        .map((e) => e.nombre)
        .join(", ")}${platosSinFicha.length > 3 ? "…" : ""} se venden bien, pero su materia prima hay que descontarla a mano.`,
      href: "/admin/recetas",
      tono: "suave",
    });
  }

  // 5. Promociones heredadas anunciándose en el sitio público.
  const promosActivas = (a.promos ?? []).filter((p) => p.activo);
  if (promosActivas.length > 0) {
    t.push({
      id: "revisar-promos",
      momento: "montaje",
      texto: `Revisa ${promosActivas.length} ${promosActivas.length === 1 ? "promoción activa" : "promociones activas"} en el sitio`,
      porque: `El sitio está anunciando: "${promosActivas[0].texto.slice(0, 48)}". Si no la vas a cumplir, apágala.`,
      href: "/admin/ajustes",
      tono: "urgente",
    });
  }

  // 6. El WhatsApp de ejemplo esconde los botones de pedido del sitio.
  if (!a.whatsapp || a.whatsapp.includes("300000")) {
    t.push({
      id: "whatsapp",
      momento: "montaje",
      texto: "Pon tu número real de WhatsApp",
      porque: "Mientras sea el de ejemplo, el sitio esconde los botones de WhatsApp.",
      href: "/admin/ajustes",
      tono: "normal",
    });
  }

  /* ---------- SERVICIO: lo que pide atención ahora ---------- */

  if (a.abierto === false && hora >= 11 && hora < 22) {
    t.push({
      id: "abrir",
      momento: "servicio",
      texto: "El negocio está CERRADO y nadie puede pedir",
      porque: "Con el local cerrado, la carta y el QR rechazan todos los pedidos.",
      href: "/admin",
      tono: "urgente",
    });
  }

  const agotados = componentes.filter((i) => i.agotado && i.activo !== false);
  if (agotados.length > 0) {
    t.push({
      id: "agotados",
      momento: "servicio",
      texto: `${agotados.length} ${agotados.length === 1 ? "cosa está agotada" : "cosas están agotadas"} en la carta`,
      porque: agotados.slice(0, 4).map((i) => i.nombre).join(", "),
      href: "/admin/inventario",
      tono: "urgente",
    });
  }

  const bajos = cat.insumos.filter((i) => i.activo !== false && i.stock > 0 && insumoBajo(i));
  if (bajos.length > 0) {
    t.push({
      id: "reponer",
      momento: "servicio",
      texto: `Se está acabando: ${bajos.slice(0, 3).map((i) => i.nombre).join(", ")}`,
      porque: bajos.length > 3 ? `y ${bajos.length - 3} más` : undefined,
      href: "/admin/inventario",
      tono: "normal",
    });
  }

  const sinUbicar = cat.pedidos.filter(
    (p) =>
      p.tipo === "mesa" &&
      !p.referencia &&
      p.estado !== "cancelado" &&
      (p.estado !== "entregado" || p.pago === "pendiente"),
  );
  if (sinUbicar.length > 0) {
    t.push({
      id: "ubicar",
      momento: "servicio",
      texto: `${sinUbicar.length} ${sinUbicar.length === 1 ? "pedido sin ubicar" : "pedidos sin ubicar"} en el salón`,
      porque: "Sin saber dónde está el cliente, el mesero no sabe a quién llevarle el plato.",
      href: "/admin/mesas",
      tono: "urgente",
    });
  }

  const lentos = cat.pedidos.filter(
    (p) =>
      (p.estado === "recibido" || p.estado === "cocina") &&
      Date.now() - new Date(p.creadoEn).getTime() > 15 * 60_000,
  );
  if (lentos.length > 0) {
    t.push({
      id: "lentos",
      momento: "servicio",
      texto: `${lentos.length} ${lentos.length === 1 ? "pedido lleva" : "pedidos llevan"} más de 15 minutos en cocina`,
      href: "/kds",
      tono: "urgente",
    });
  }

  /* ---------- CIERRE: lo de después del servicio ---------- */

  const porCobrar = cat.pedidos.filter(
    (p) => p.pago === "pendiente" && p.estado !== "cancelado" && diaNegocio(p.creadoEn) === hoy,
  );
  if (porCobrar.length > 0 && hora >= 20) {
    t.push({
      id: "cobrar-pendientes",
      momento: "cierre",
      texto: `Quedan ${porCobrar.length} ${porCobrar.length === 1 ? "cuenta" : "cuentas"} sin cobrar de hoy`,
      porque: "Si el cliente ya se fue, cancélalas con motivo para que no ensucien la caja.",
      href: "/admin/pedidos",
      tono: "urgente",
    });
  }

  if (hora >= 21 && pedidosHoy.length > 0) {
    t.push({
      id: "cierre-caja",
      momento: "cierre",
      texto: "Haz el cierre de caja del día",
      porque: "Cuadra lo cobrado por cada método contra lo que hay en el cajón.",
      href: "/admin",
      tono: "normal",
    });
  }

  const arrastre = cat.pedidos.filter(
    (p) => p.pago === "pendiente" && p.estado !== "cancelado" && diaNegocio(p.creadoEn) !== hoy,
  );
  if (arrastre.length > 0) {
    t.push({
      id: "arrastre",
      momento: "cierre",
      texto: `${arrastre.length} ${arrastre.length === 1 ? "cuenta vieja sigue" : "cuentas viejas siguen"} sin cobrar`,
      porque: "Son de días anteriores y siguen sumando en 'por cobrar'. Cóbralas o cancélalas.",
      href: "/admin/pedidos",
      tono: "normal",
    });
  }

  const montaje = t.filter((x) => x.momento === "montaje");
  const MONTAJE_TOTAL = 6; // las seis comprobaciones de puesta a punto de arriba
  return {
    tareas: t,
    montajeTotal: MONTAJE_TOTAL,
    montajeHechas: MONTAJE_TOTAL - montaje.length,
    listoParaAbrir: montaje.filter((x) => x.tono === "urgente").length === 0,
  };
}
