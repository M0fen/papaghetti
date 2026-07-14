"use client";

import { useState } from "react";
import {
  ESTADOS,
  estadoLabel,
  formatCOP,
  tipoLabel,
  tipoIcon,
  METODOS,
  metodoLabel,
  type Pedido,
  type EstadoPedido,
} from "@/lib/menu";
import {
  avanzarPedidoAction,
  cobrarAction,
  cancelarAction,
} from "@/app/pedido-actions";

type Filtro = "todos" | EstadoPedido | "porpagar";

export default function OrdersTable({ pedidos }: { pedidos: Pedido[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const filtrados =
    filtro === "todos"
      ? pedidos
      : filtro === "porpagar"
      ? pedidos.filter((p) => p.pago === "pendiente" && p.estado !== "cancelado")
      : pedidos.filter((p) => p.estado === filtro);

  const cobrado = pedidos
    .filter((p) => p.pago === "pagado")
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
  return (
    <article className={`ocard ${p.estado === "cancelado" ? "is-cancelado" : ""}`}>
      <div className="ocard__top">
        <b>#{p.id}</b>
        <span className="ocard__tipo">
          {tipoIcon[p.tipo]} {p.tipo === "mesa" ? `Mesa ${p.mesa ?? "?"}` : tipoLabel[p.tipo]}
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
                {metodoLabel[m]}
              </button>
            ))}
          </form>
        )}
        {activo && (
          <form action={cancelarAction} style={{ marginLeft: "auto" }}>
            <input type="hidden" name="id" value={p.id} />
            <button className="ocard__cancel" type="submit">
              Cancelar
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
