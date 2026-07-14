import { getCatalog } from "@/lib/catalog";
import {
  formatCOP,
  formatCantidad,
  insumoBajo,
  estadoLabel,
} from "@/lib/menu";
import TurnoReportes from "@/components/admin/TurnoReportes";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const cat = await getCatalog();
  const hoy = new Date().toDateString();
  const pedidosHoy = cat.pedidos.filter(
    (p) => new Date(p.creadoEn).toDateString() === hoy
  );
  const ventasHoy = pedidosHoy.reduce((s, p) => s + p.total, 0);
  const ticket = pedidosHoy.length ? Math.round(ventasHoy / pedidosHoy.length) : 0;
  const activos = cat.pedidos.filter(
    (p) => p.estado !== "entregado" && p.estado !== "cancelado"
  );
  const porCobrar = cat.pedidos
    .filter((p) => p.pago === "pendiente" && p.estado !== "cancelado")
    .reduce((s, p) => s + p.total, 0);
  const agotados = cat.insumos.filter((i) => i.stock <= 0);
  const bajos = cat.insumos.filter((i) => i.stock > 0 && insumoBajo(i));
  const platosAgotados = [...cat.bases, ...cat.proteinas, ...cat.toppings].filter(
    (i) => i.agotado
  );
  const leadsNuevos = cat.leads.filter((l) => l.estado === "nuevo");
  const recientes = cat.pedidos.slice(0, 6);

  return (
    <section>
      <div className="adminx__pageh">
        <h1>Resumen</h1>
        <p>Cómo va Papaghetti hoy.</p>
      </div>

      <div className="kpis">
        <Kpi label="Ventas hoy" value={formatCOP(ventasHoy)} accent />
        <Kpi label="Pedidos hoy" value={pedidosHoy.length} />
        <Kpi label="Ticket promedio" value={formatCOP(ticket)} />
        <Kpi label="Pedidos activos" value={activos.length} warn={activos.length > 0} />
        <Kpi label="Por cobrar" value={formatCOP(porCobrar)} warn={porCobrar > 0} />
        <Kpi label="Insumos por reponer" value={agotados.length + bajos.length} warn={agotados.length + bajos.length > 0} />
        <Kpi label="Leads nuevos" value={leadsNuevos.length} accent={leadsNuevos.length > 0} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <TurnoReportes catalog={cat} />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card__h">
            <h2>Últimos pedidos</h2>
            <a href="/admin/pedidos">Ver todos →</a>
          </div>
          {recientes.length === 0 ? (
            <p className="muted">Aún no hay pedidos. Arma uno desde el sitio para probar.</p>
          ) : (
            <ul className="dash-list">
              {recientes.map((p) => (
                <li key={p.id}>
                  <span>
                    <b>#{p.id}</b> · {p.base} · {p.proteina}
                  </span>
                  <span className={`badge badge--${p.estado}`}>
                    {estadoLabel[p.estado]}
                  </span>
                  <span className="dash-list__price">{formatCOP(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__h">
            <h2>Alertas de despensa</h2>
            <a href="/admin/inventario">Gestionar →</a>
          </div>
          {agotados.length === 0 && bajos.length === 0 ? (
            <p className="muted">Despensa con buen nivel. 🎉</p>
          ) : (
            <ul className="dash-list">
              {agotados.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.emoji} {i.nombre}
                  </span>
                  <span className="badge badge--danger">Agotado</span>
                </li>
              ))}
              {bajos.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.emoji} {i.nombre}
                  </span>
                  <span className="badge badge--warn">Quedan {formatCantidad(i.stock, i.unidad)}</span>
                </li>
              ))}
            </ul>
          )}
          {platosAgotados.length > 0 && (
            <p className="muted" style={{ marginTop: 10, fontSize: "0.82rem" }}>
              Platos sin disponibilidad: {platosAgotados.map((i) => i.nombre).join(", ")}.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`kpi ${accent ? "kpi--accent" : ""} ${warn ? "kpi--warn" : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
