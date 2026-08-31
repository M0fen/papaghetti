"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ESTADOS,
  estadoLabel,
  formatCOP,
  tipoLabel,
  tipoIcon,
  METODOS,
  metodoLabel,
  metodoEmoji,
  type Pedido,
  type EstadoPedido,
} from "@/lib/menu";
import {
  avanzarPedidoAction,
  retrocederPedidoAction,
  cobrarAction,
  cancelarAction,
} from "@/app/pedido-actions";
import { esVenta } from "@/lib/menu";

type Filtro = "todos" | EstadoPedido | "porpagar";

/**
 * El comprobante en texto, listo para WhatsApp, al número que el cliente dejó en su
 * propio pedido. La misma información del papel: sin propina escondida y con el aviso
 * de que este comprobante no es un documento fiscal.
 */
function waComprobante(p: Pedido): string {
  const linea = (k: string, v: number) => `${k}: ${formatCOP(v)}`;
  const consumo = p.subtotal - (p.descuento ?? 0);
  const txt = [
    `*Papaghetti* — comprobante N° ${p.consecutivo ?? p.id}`,
    "",
    `${p.base}${p.proteina && p.proteina !== "—" ? ` · ${p.proteina}` : ""}`,
    p.toppings.length ? `+ ${p.toppings.join(", ")}` : "",
    "",
    linea("Consumo", p.subtotal),
    p.descuento ? linea("Descuento", -p.descuento) : "",
    p.impuesto ? linea("Impuesto", p.impuesto) : "",
    p.domicilio ? linea("Domicilio", p.domicilio) : "",
    `*TOTAL: ${formatCOP(consumo + (p.impuesto ?? 0) + (p.domicilio ?? 0))}*`,
    p.propina ? linea("Propina voluntaria", p.propina) : "",
    p.propina ? `*Recibido: ${formatCOP(p.total)}*` : "",
    "",
    "Comprobante interno. No es factura electrónica.",
    "¡Gracias por venir!",
  ]
    .filter(Boolean)
    .join("\n");
  return `https://wa.me/${p.telefono?.replace(/\D/g, "")}?text=${encodeURIComponent(txt)}`;
}

export default function OrdersTable({ pedidos }: { pedidos: Pedido[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const router = useRouter();

  /* La caja era la ÚNICA de las tres pantallas operativas sin auto-refresco (cocina va
     a 8s y mesas a 15s): el cajero cobraba sobre una lista vieja, sin nada que le
     avisara de que estaba desactualizada. */
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(id);
  }, [router]);

  const filtrados =
    filtro === "todos"
      ? pedidos
      : filtro === "porpagar"
      ? pedidos.filter((p) => p.pago === "pendiente" && p.estado !== "cancelado")
      : pedidos.filter((p) => p.estado === filtro);

  /* "Cobrado" excluye los cancelados, igual que Finanzas. Antes esta pantalla los
     seguía sumando y las dos daban cifras distintas del mismo turno. */
  const cobrado = pedidos
    .filter((p) => p.pago === "pagado" && esVenta(p))
    .reduce((s, p) => s + p.total, 0);
  const porCobrar = pedidos
    .filter((p) => p.pago === "pendiente" && p.estado !== "cancelado")
    .reduce((s, p) => s + p.total, 0);

  return (
    <>
      <div className="filters">
        <button
          className={`fbtn ${filtro === "todos" ? "is-on" : ""}`}
          onClick={() => setFiltro("todos")}
        >
          Todos ({pedidos.length})
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e}
            className={`fbtn ${filtro === e ? "is-on" : ""}`}
            onClick={() => setFiltro(e)}
          >
            {estadoLabel[e]} ({pedidos.filter((p) => p.estado === e).length})
          </button>
        ))}
        <button
          className={`fbtn ${filtro === "porpagar" ? "is-on" : ""}`}
          onClick={() => setFiltro("porpagar")}
        >
          💵 Por pagar
        </button>
        <span className="filters__spacer" />
        <span className="muted">
          Cobrado <b style={{ color: "var(--pg-oro-ink)" }}>{formatCOP(cobrado)}</b> · Por
          cobrar <b style={{ color: "var(--pg-pomodoro)" }}>{formatCOP(porCobrar)}</b>
        </span>
      </div>

      <div className="orders">
        {filtrados.length === 0 && (
          <p className="muted" style={{ padding: 8 }}>
            Sin pedidos en este filtro.
          </p>
        )}
        {filtrados.map((p) => (
          <OrderCard key={p.id} p={p} />
        ))}
      </div>
    </>
  );
}

function OrderCard({ p }: { p: Pedido }) {
  const activo = p.estado !== "entregado" && p.estado !== "cancelado";
  /* Un pedido ENTREGADO por error (un toque de más en la cocina) no se podía ni
     devolver ni cancelar desde ninguna pantalla: el plato desaparecía del flujo y la
     cuenta se quedaba viva para siempre. Mientras no esté cobrado, siempre hay salida. */
  const corregible = p.estado !== "cancelado" && p.pago === "pendiente";
  return (
    <article className={`ocard ${p.estado === "cancelado" ? "is-cancelado" : ""}`}>
      <div className="ocard__top">
        <b>#{p.id}</b>
        <span className="ocard__tipo">
          {tipoIcon[p.tipo]} {tipoLabel[p.tipo]}
          {p.referencia ? ` · ${p.referencia}` : ""}
        </span>
        <time suppressHydrationWarning>
          {new Date(p.creadoEn).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>

      {(p.cliente || p.telefono) && (
        <p className="ocard__ref">
          👤 {p.cliente || "Cliente"}
          {p.telefono && (
            <>
              {" · "}
              <a
                href={`https://wa.me/${p.telefono.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📱 {p.telefono}
              </a>
            </>
          )}
        </p>
      )}

      <p className="ocard__detail">
        {p.base} · {p.proteina}
        {p.toppings.length ? ` · ${p.toppings.join(", ")}` : ""}
      </p>

      <div className="ocard__badges">
        <span className={`badge badge--${p.estado}`}>{estadoLabel[p.estado]}</span>
        <span className={`badge ${p.pago === "pagado" ? "badge--ok" : "badge--warn"}`}>
          {p.pago === "pagado"
            ? `Pagado · ${p.metodoPago ? metodoLabel[p.metodoPago] : ""}`
            : "Pendiente por pagar"}
        </span>
        <span className="ocard__total">{formatCOP(p.total)}</span>
      </div>

      <div className="ocard__actions">
        {activo && (
          <form action={avanzarPedidoAction}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="desde" value={p.estado} />
            <button className="btn btn--primary btnmini" type="submit">
              <span>Avanzar →</span>
            </button>
          </form>
        )}
        {p.pago === "pendiente" && p.estado !== "cancelado" && (
          <form action={cobrarAction} className="ocard__cobrar">
            <input type="hidden" name="id" value={p.id} />
            <label className="ocard__pd">
              Propina
              <input type="number" name="propina" min={0} step={500} defaultValue={0} aria-label="Propina" />
            </label>
            <label className="ocard__pd">
              Descuento
              <input type="number" name="descuento" min={0} step={500} defaultValue={0} aria-label="Descuento" />
            </label>
            <span className="muted">Cobrar:</span>
            {METODOS.map((m) => (
              <button key={m} className="chipbtn" name="metodo" value={m} type="submit">
                {metodoEmoji[m]} {metodoLabel[m]}
              </button>
            ))}
          </form>
        )}
        {/* Devolver un paso: la única salida cuando la cocina avanzó de más. */}
        {corregible && p.estado !== "recibido" && (
          <form action={retrocederPedidoAction}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn btn--ghost btnmini" type="submit" title="Devolver al paso anterior">
              <span>← Devolver</span>
            </button>
          </form>
        )}

        {/* El comprobante para el cliente. Existe cobrado o no: muchas veces se pide
            la cuenta ANTES de pagar. */}
        <a
          className="btn btn--ghost btnmini"
          href={`/admin/tiquete/${p.id}`}
          target="_blank"
          rel="noopener"
        >
          <span>🧾 Comprobante</span>
        </a>
        {/* Y directo al WhatsApp que dejó el cliente en su pedido: un toque, sin
            copiar números a mano. */}
        {p.telefono && (
          <a
            className="btn btn--ghost btnmini"
            href={waComprobante(p)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Enviar el comprobante al ${p.telefono}`}
          >
            <span>📲 Enviar cuenta</span>
          </a>
        )}

        {/* Cancelar pide MOTIVO y confirma: estaba a un mis-tap de los chips de cobro,
            sin confirmación ninguna, y el motivo ahora queda en el historial. */}
        {corregible && (
          <form
            action={cancelarAction}
            style={{ marginLeft: "auto" }}
            onSubmit={(e) => {
              const motivo = window.prompt(
                `¿Por qué se cancela el pedido #${p.id}? (queda registrado)`,
              );
              if (motivo === null) {
                e.preventDefault();
                return;
              }
              (e.currentTarget.elements.namedItem("motivo") as HTMLInputElement).value =
                motivo;
            }}
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="motivo" defaultValue="" />
            <button className="ocard__cancel" type="submit">
              Cancelar
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
