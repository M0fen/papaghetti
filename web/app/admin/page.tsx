import { getCatalog } from "@/lib/catalog";
import {
  formatCOP,
  formatCantidad,
  insumoBajo,
  estadoLabel,
  esVenta,
  ventaNeta,
} from "@/lib/menu";
import { diaNegocio } from "@/lib/precios";
import TurnoReportes from "@/components/admin/TurnoReportes";
import { toggleAbiertoAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const cat = await getCatalog();
  /* El día se cuenta en hora de PEREIRA (antes `toDateString()` usaba la del servidor,
     que en Vercel es UTC: el día "de hoy" empezaba a las 7 p.m.), y los CANCELADOS no
     son ventas (esta pantalla los sumaba mientras Finanzas los excluía: dos cifras
     distintas del mismo día en el mismo panel). */
  const hoy = diaNegocio();
  const pedidosHoy = cat.pedidos.filter(
    (p) => diaNegocio(p.creadoEn) === hoy && esVenta(p)
  );
  const ventasHoy = pedidosHoy.reduce((s, p) => s + ventaNeta(p), 0);
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

  const abierto = cat.ajustes.abierto !== false;
  const porReponer = agotados.length + bajos.length;
  /* LO QUE PIDE ACCIÓN AHORA. Antes las siete cifras pesaban lo mismo y ninguna
     decía qué hacer: el operario tenía que interpretar el tablero. Esto solo
     aparece cuando hay algo pendiente, y cada línea lleva a su pantalla. */
  const pendientes = [
    activos.length > 0 && {
      href: "/admin/cocina",
      txt: `${activos.length} ${activos.length === 1 ? "pedido" : "pedidos"} en marcha`,
      tono: "activo",
    },
    porCobrar > 0 && {
      href: "/admin/pedidos",
      txt: `${formatCOP(porCobrar)} por cobrar`,
      tono: "cobro",
    },
    platosAgotados.length > 0 && {
      href: "/admin/inventario",
      txt: `${platosAgotados.length} en la carta sin disponibilidad`,
      tono: "alto",
    },
    porReponer > 0 && {
      href: "/admin/inventario",
      txt: `${porReponer} ${porReponer === 1 ? "insumo" : "insumos"} por reponer`,
      tono: "medio",
    },
    leadsNuevos.length > 0 && {
      href: "/admin/leads",
      txt: `${leadsNuevos.length} ${leadsNuevos.length === 1 ? "lead nuevo" : "leads nuevos"}`,
      tono: "info",
    },
  ].filter(Boolean) as { href: string; txt: string; tono: string }[];

  return (
    <section>
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Resumen</h1>
          <p>Cómo va Papaghetti hoy.</p>
        </div>
        {/* Abrir y cerrar es la acción MÁS frecuente del día y vivía enterrada en
            Ajustes. Aquí, y con el estado visible sin buscarlo. */}
        <form action={toggleAbiertoAction}>
          <button
            className={`estado-btn ${abierto ? "is-on" : "is-off"}`}
            type="submit"
            title={abierto ? "Cerrar el negocio (deja de aceptar pedidos)" : "Abrir el negocio"}
          >
            <span className="estado-btn__dot" aria-hidden />
            {abierto ? "Abierto" : "Cerrado"}
            <span className="estado-btn__accion">{abierto ? "cerrar" : "abrir"}</span>
          </button>
        </form>
      </div>

      {/* EL DINERO DEL DÍA, primero y en grande: es lo que se viene a mirar. */}
      <div className="hoy">
        <div className="hoy__main">
          <span className="hoy__k">Ventas de hoy</span>
          <b className="hoy__v">{formatCOP(ventasHoy)}</b>
          <span className="hoy__sub">
            {pedidosHoy.length} {pedidosHoy.length === 1 ? "pedido" : "pedidos"}
            {pedidosHoy.length > 0 && ` · ticket ${formatCOP(ticket)}`}
          </span>
        </div>
        {pendientes.length > 0 ? (
          <ul className="hoy__pend">
            {pendientes.map((p) => (
              <li key={p.txt}>
                <a href={p.href} className={`pend pend--${p.tono}`}>
                  {p.txt} <span aria-hidden>→</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hoy__limpio">Todo al día. Nada pendiente. 🎉</p>
        )}
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
