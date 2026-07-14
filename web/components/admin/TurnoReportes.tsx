"use client";

import { useState } from "react";
import {
  formatCOP,
  formatCantidad,
  unidadCorta,
  insumoBajo,
  type Catalog,
  type Pedido,
} from "@/lib/menu";

type Vista = null | "apertura" | "cierre" | "jornada";

const topDe = (arr: string[]) => {
  const m = new Map<string, number>();
  arr.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
};

export default function TurnoReportes({ catalog }: { catalog: Catalog }) {
  const [vista, setVista] = useState<Vista>(null);

  const insumos = catalog.insumos ?? [];
  const hoyStr = new Date().toDateString();
  const hoyPed = catalog.pedidos.filter((p) => new Date(p.creadoEn).toDateString() === hoyStr);
  const validos = hoyPed.filter((p) => p.estado !== "cancelado");
  const cancelados = hoyPed.length - validos.length;
  const activos = catalog.pedidos.filter(
    (p) => p.estado !== "entregado" && p.estado !== "cancelado"
  );
  const porCobrar = activos.filter((p) => p.pago === "pendiente");
  const sum = (arr: Pedido[], f: (p: Pedido) => number) => arr.reduce((s, p) => s + f(p), 0);
  const metodo = (m: string) =>
    sum(validos.filter((p) => p.pago === "pagado" && p.metodoPago === m), (p) => p.total);

  const ventasHoy = sum(validos, (p) => p.total);
  const ticket = validos.length ? Math.round(ventasHoy / validos.length) : 0;
  const cobrado = sum(validos.filter((p) => p.pago === "pagado"), (p) => p.total);

  const reponer = insumos
    .map((i) => ({
      nombre: i.nombre,
      emoji: i.emoji,
      unidad: i.unidad,
      act: i.stock,
      par: i.parStock,
      falta: Math.max(0, Number((i.parStock - i.stock).toFixed(3))),
      agotado: i.stock <= 0,
    }))
    .filter((r) => r.falta > 0 || r.agotado)
    .sort((a, b) => b.falta - a.falta);

  const bajos = insumos.filter((i) => i.stock > 0 && insumoBajo(i));
  const agotados = insumos.filter((i) => i.stock <= 0);
  const fecha = new Date().toLocaleString("es-CO", { dateStyle: "full", timeStyle: "short" });

  return (
    <div className="card turno">
      <div className="card__h">
        <h2>Resúmenes de turno</h2>
      </div>
      <div className="turno__btns no-print">
        <button
          className={`btn ${vista === "apertura" ? "btn--primary" : "btn--ghost"} btnmini`}
          onClick={() => setVista((v) => (v === "apertura" ? null : "apertura"))}
        >
          <span>🌅 Apertura de turno</span>
        </button>
        <button
          className={`btn ${vista === "cierre" ? "btn--primary" : "btn--ghost"} btnmini`}
          onClick={() => setVista((v) => (v === "cierre" ? null : "cierre"))}
        >
          <span>🌙 Cierre de caja</span>
        </button>
        <button
          className={`btn ${vista === "jornada" ? "btn--primary" : "btn--ghost"} btnmini`}
          onClick={() => setVista((v) => (v === "jornada" ? null : "jornada"))}
        >
          <span>📊 Resumen de la jornada</span>
        </button>
      </div>

      {vista && (
        <>
          <div className="turno__actions no-print">
            <button className="btn btn--gold btnmini" onClick={() => window.print()}>
              <span>🖨️ Imprimir</span>
            </button>
          </div>
          <div className="printable turno__rep">
            <h3>
              {vista === "apertura" && "🌅 Apertura de turno"}
              {vista === "cierre" && "🌙 Cierre de caja"}
              {vista === "jornada" && "📊 Resumen de la jornada"}
              {" — "}
              {catalog.ajustes.negocio}
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>{fecha}</p>

            {vista === "apertura" && (
              <>
                <h4>Reposición de despensa (actual vs. estándar)</h4>
                {reponer.length === 0 ? (
                  <p>Despensa completa ✅ — nada por reponer.</p>
                ) : (
                  <table className="md-table">
                    <thead>
                      <tr><th>Insumo</th><th>Actual</th><th>Estándar</th><th>Reponer</th></tr>
                    </thead>
                    <tbody>
                      {reponer.map((r) => (
                        <tr key={r.nombre}>
                          <td>{r.emoji ? `${r.emoji} ` : ""}{r.nombre}{r.agotado ? " (agotado)" : ""}</td>
                          <td>{formatCantidad(r.act, r.unidad)}</td>
                          <td>{r.par} {unidadCorta[r.unidad]}</td>
                          <td><b>{r.falta} {unidadCorta[r.unidad]}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p style={{ marginTop: 10 }}>
                  Pedidos activos heredados: <b>{activos.length}</b> · por cobrar:{" "}
                  <b>{porCobrar.length}</b> ({formatCOP(sum(porCobrar, (p) => p.total))}).
                </p>
              </>
            )}

            {vista === "cierre" && (
              <>
                <h4>Ventas del día</h4>
                <table className="md-table">
                  <tbody>
                    <tr><td>Pedidos válidos</td><td>{validos.length}</td></tr>
                    <tr><td>Cancelados</td><td>{cancelados}</td></tr>
                    <tr><td>Ventas (con impuesto)</td><td><b>{formatCOP(ventasHoy)}</b></td></tr>
                    <tr><td>Ticket promedio</td><td>{formatCOP(ticket)}</td></tr>
                    <tr><td>Impuesto recaudado</td><td>{formatCOP(sum(validos, (p) => p.impuesto))}</td></tr>
                    <tr><td>Propinas</td><td>{formatCOP(sum(validos, (p) => p.propina))}</td></tr>
                  </tbody>
                </table>
                <h4>Caja por método</h4>
                <table className="md-table">
                  <tbody>
                    <tr><td>Efectivo</td><td>{formatCOP(metodo("efectivo"))}</td></tr>
                    <tr><td>Tarjeta</td><td>{formatCOP(metodo("tarjeta"))}</td></tr>
                    <tr><td>Transferencia</td><td>{formatCOP(metodo("transferencia"))}</td></tr>
                    <tr><td><b>Total cobrado</b></td><td><b>{formatCOP(cobrado)}</b></td></tr>
                    <tr><td>Por cobrar (pendiente)</td><td>{formatCOP(sum(porCobrar, (p) => p.total))}</td></tr>
                  </tbody>
                </table>
                <p style={{ marginTop: 8 }}>
                  Más pedido — base: <b>{topDe(validos.map((p) => p.base))}</b> · proteína:{" "}
                  <b>{topDe(validos.map((p) => p.proteina))}</b>.
                </p>
                <h4>Para mañana (despensa)</h4>
                <p>
                  Agotados: {agotados.map((i) => i.nombre).join(", ") || "ninguno"}. Bajos:{" "}
                  {bajos.map((i) => `${i.nombre} (${formatCantidad(i.stock, i.unidad)})`).join(", ") || "ninguno"}.
                </p>
              </>
            )}

            {vista === "jornada" && (
              <table className="md-table">
                <tbody>
                  <tr><td>Ventas hoy</td><td><b>{formatCOP(ventasHoy)}</b></td></tr>
                  <tr><td>Pedidos válidos / cancelados</td><td>{validos.length} / {cancelados}</td></tr>
                  <tr><td>Ticket promedio</td><td>{formatCOP(ticket)}</td></tr>
                  <tr><td>Pedidos activos</td><td>{activos.length}</td></tr>
                  <tr><td>Por cobrar</td><td>{formatCOP(sum(porCobrar, (p) => p.total))} ({porCobrar.length})</td></tr>
                  <tr><td>Mesas ocupadas</td><td>{new Set(activos.filter((p) => p.tipo === "mesa").map((p) => p.mesa)).size} / {catalog.ajustes.numMesas}</td></tr>
                  <tr><td>Insumos agotados / bajos</td><td>{agotados.length} / {bajos.length}</td></tr>
                  <tr><td>Leads nuevos</td><td>{catalog.leads.filter((l) => l.estado === "nuevo").length}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
