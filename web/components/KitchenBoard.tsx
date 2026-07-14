"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ESTADOS,
  estadoLabel,
  formatCOP,
  tipoLabel,
  tipoIcon,
  type Pedido,
  type EstadoPedido,
} from "@/lib/menu";
import { avanzarPedidoAction } from "@/app/pedido-actions";

// Columnas visibles del tablero (los entregados se ocultan del flujo activo).
const COLUMNAS: EstadoPedido[] = ["recibido", "cocina", "listo"];

export default function KitchenBoard({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();

  // Auto-refresh suave: nuevos pedidos aparecen sin recargar a mano.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(id);
  }, [router]);

  const activos = pedidos.filter((p) => p.estado !== "entregado");
  const entregadosHoy = pedidos.filter((p) => p.estado === "entregado").length;

  return (
    <section>
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Cocina</h1>
          <p>Los pedidos en vivo · se refresca solo cada 8s.</p>
        </div>
        <span className="muted">
          {activos.length} activos · {entregadosHoy} entregados
        </span>
      </div>

      <div className="kitchen__cols">
        {COLUMNAS.map((estado) => {
          const items = pedidos.filter((p) => p.estado === estado);
          return (
            <section key={estado} className={`kcol kcol--${estado}`}>
              <h2 className="kcol__title">
                {estadoLabel[estado]} <span>{items.length}</span>
              </h2>
              <div className="kcol__list">
                {items.length === 0 && <p className="kcol__empty">Sin pedidos</p>}
                {items.map((p) => (
                  <article key={p.id} className="ticket-card">
                    <div className="ticket-card__top">
                      <b>#{p.id}</b>
                      <span className="ticket-card__tipo">
                        {tipoIcon[p.tipo]}{" "}
                        {p.tipo === "mesa" ? `Mesa ${p.mesa ?? "?"}` : tipoLabel[p.tipo]}
                      </span>
                      <time suppressHydrationWarning>{hora(p.creadoEn)}</time>
                    </div>
                    {(p.cliente || p.telefono) && (
                      <p className="ticket-card__ref">
                        👤 {p.cliente || "Cliente"}{p.telefono ? ` · ${p.telefono}` : ""}
                      </p>
                    )}
                    <p className="ticket-card__line">
                      <b>{p.base}</b> · {p.proteina}
                    </p>
                    {p.pago === "pendiente" && (
                      <span className="badge badge--warn" style={{ marginTop: 4 }}>
                        💵 Por pagar
                      </span>
                    )}
                    {p.toppings.length > 0 && (
                      <p className="ticket-card__tops">+ {p.toppings.join(", ")}</p>
                    )}
                    <div className="ticket-card__bottom">
                      <span>{formatCOP(p.total)}</span>
                      <form action={avanzarPedidoAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn btn--primary ticket-card__btn" type="submit">
                          <span>{siguiente(p.estado)}</span>
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function siguiente(e: EstadoPedido) {
  const i = ESTADOS.indexOf(e);
  const n = ESTADOS[i + 1];
  return n === "cocina" ? "A cocina →" : n === "listo" ? "Listo 🔔" : "Entregar ✓";
}
