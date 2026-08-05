import { getCatalog } from "@/lib/catalog";
import {
  formatCOP,
  formatCantidad,
  unidadCorta,
  insumoBajo,
  PERIODOS,
  periodoNombre,
  enPeriodo,
  gastoCatLabel,
  gastoCatEmoji,
  GASTO_CATEGORIAS,
  METODOS,
  metodoLabel,
  TIPOS,
  tipoLabel,
  tipoIcon,
  esVenta,
  ventaNeta,
  type Periodo,
  type Pedido,
} from "@/lib/menu";
import { diaNegocio } from "@/lib/precios";
import { crearGastoAction, eliminarMovimientoAction } from "../actions";
import type { CSSVars } from "@/lib/cssVars";

export const dynamic = "force-dynamic";

const PERIODO_IDS: Periodo[] = ["hoy", "semana", "mes", "anio"];

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const periodo: Periodo = PERIODO_IDS.includes(sp.p as Periodo)
    ? (sp.p as Periodo)
    : "hoy";
  const label = periodoNombre[periodo];

  const cat = await getCatalog();
  const now = new Date();

  // --- Ventas del período (pedidos no cancelados) ---
  const pedPer = cat.pedidos.filter(
    (p) => p.estado !== "cancelado" && enPeriodo(p.creadoEn, periodo, now)
  );
  const sum = (a: Pedido[], f: (p: Pedido) => number) => a.reduce((s, p) => s + f(p), 0);
  /* VENTAS = lo que se queda el negocio. `p.total` lleva dentro el impoconsumo (de la
     DIAN) y la propina (del personal): contarlos como venta inflaba la utilidad con
     plata ajena. Se muestran aparte, como lo que son: dinero de terceros en tránsito. */
  const ventas = sum(pedPer, ventaNeta);
  const impuestoRecaudado = sum(pedPer, (p) => p.impuesto ?? 0);
  const propinas = sum(pedPer, (p) => p.propina ?? 0);
  const domicilios = sum(pedPer, (p) => p.domicilio ?? 0);
  const cobrado = sum(pedPer.filter((p) => p.pago === "pagado"), (p) => p.total);
  const porCobrar = sum(pedPer.filter((p) => p.pago === "pendiente"), (p) => p.total);
  const cogs = sum(pedPer, (p) => p.costo ?? 0);
  const utilBruta = ventas - cogs;
  const margenPct = ventas > 0 ? Math.round((utilBruta / ventas) * 100) : 0;
  const ticket = pedPer.length ? Math.round(ventas / pedPer.length) : 0;
  /* Cuántos pedidos NO tienen ficha técnica: su costo entra como 0 y el margen sale
     inflado. Mejor decirlo que dibujar un 100% que nadie puede creerse. */
  const sinFicha = pedPer.filter((p) => !p.costo).length;
  const porCanal = (["web", "qr", "salon"] as const).map((c) => ({
    c,
    n: pedPer.filter((p) => p.canal === c).length,
    total: sum(pedPer.filter((p) => p.canal === c), ventaNeta),
  }));

  // --- Movimientos del período (salidas de caja) ---
  const movPer = (cat.movimientos ?? []).filter((m) => enPeriodo(m.fecha, periodo, now));
  const compras = movPer.filter((m) => m.tipo === "compra");
  const gastos = movPer.filter((m) => m.tipo === "gasto");
  const totalCompras = compras.reduce((s, m) => s + m.monto, 0);
  const totalGastos = gastos.reduce((s, m) => s + m.monto, 0);
  const salidas = totalCompras + totalGastos;
  /* Los gastos de categoría "insumos" YA se cuentan como COGS cuando esos insumos se
     venden. Restarlos otra vez en la utilidad los contaba dos veces, y la utilidad del
     mes salía negativa justo cuando más se había abastecido. Siguen en el flujo de caja
     (son salida real de plata), pero fuera del P&L. */
  const gastosOperativos = gastos
    .filter((g) => g.categoria !== "insumos")
    .reduce((s, m) => s + m.monto, 0);

  // Compras agrupadas por insumo (lo gastado de cada cosa)
  const porInsumo = new Map<string, { nombre: string; monto: number; cant: number }>();
  for (const m of compras) {
    const ins = cat.insumos.find((i) => i.id === m.insumoId);
    const key = m.insumoId ?? m.concepto;
    const prev = porInsumo.get(key) ?? { nombre: ins?.nombre ?? m.concepto, monto: 0, cant: 0 };
    prev.monto += m.monto;
    prev.cant += m.cantidad ?? 0;
    porInsumo.set(key, prev);
  }
  const comprasRank = [...porInsumo.entries()]
    .map(([id, v]) => ({ id, ...v, unidad: cat.insumos.find((i) => i.id === id)?.unidad }))
    .sort((a, b) => b.monto - a.monto);

  // Gastos por categoría
  const gastoPorCat = GASTO_CATEGORIAS.map((c) => ({
    cat: c,
    total: gastos.filter((g) => g.categoria === c).reduce((s, g) => s + g.monto, 0),
  })).filter((x) => x.total > 0);

  // Desempeño: top productos
  const rank = (getter: (p: Pedido) => string) => {
    const m = new Map<string, number>();
    pedPer.forEach((p) => m.set(getter(p), (m.get(getter(p)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const porMetodo = METODOS.map((m) => ({
    m,
    total: sum(pedPer.filter((p) => p.pago === "pagado" && p.metodoPago === m), (p) => p.total),
  }));
  const porTipo = TIPOS.map((t) => ({ t, n: pedPer.filter((p) => p.tipo === t).length }));

  // Ventas últimos 7 días (siempre, independiente del período)
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const porDia = dias.map((d) => {
    // El día se compara en hora de PEREIRA: con toDateString() del servidor (UTC) cada
    // barra se partía a las 7 p.m. y mezclaba el cierre de un día con la apertura del otro.
    const key = diaNegocio(d);
    const total = cat.pedidos
      .filter((p) => esVenta(p) && diaNegocio(p.creadoEn) === key)
      .reduce((s, p) => s + ventaNeta(p), 0);
    return { label: d.toLocaleDateString("es-CO", { weekday: "short" }), total };
  });
  const maxDia = Math.max(1, ...porDia.map((x) => x.total));

  // Lo que hay vs. lo que se necesita (estado actual de despensa)
  const necesita = cat.insumos
    .map((i) => ({
      ...i,
      falta: Math.max(0, Number((i.parStock - i.stock).toFixed(3))),
    }))
    .filter((i) => i.falta > 0 || insumoBajo(i))
    .sort((a, b) => Number(insumoBajo(b)) - Number(insumoBajo(a)));

  const utilTeorica = utilBruta - gastosOperativos;

  return (
    <section className="fin">
      <div className="fin-head">
        <div>
          <h1>Finanzas</h1>
          <p className="muted">Tu contabilidad clara: qué entró, qué salió y cuánto te queda.</p>
        </div>
        <div className="seg no-print" role="tablist" aria-label="Período">
          {PERIODOS.map((x) => (
            <a
              key={x.id}
              href={`/admin/reportes?p=${x.id}`}
              className={`seg__item ${periodo === x.id ? "is-on" : ""}`}
              aria-selected={periodo === x.id}
            >
              {x.label}
            </a>
          ))}
        </div>
      </div>

      {/* HERO · Utilidad (P&L) */}
      <div className="fin-hero">
        <div className="fin-hero__main">
          <span className="fin-hero__k">Utilidad · {label}</span>
          <b className={`fin-hero__big ${utilTeorica >= 0 ? "is-pos" : "is-neg"}`}>
            {formatCOP(utilTeorica)}
          </b>
          <span className="fin-hero__sub">
            Margen bruto <b>{margenPct}%</b> · {pedPer.length} pedidos · ticket {formatCOP(ticket)}
          </span>
          {sinFicha > 0 && (
            <span className="fin-hero__aviso">
              ⚠️ {sinFicha} de {pedPer.length} pedidos sin ficha técnica: su costo cuenta
              como $0 y este margen sale más alto de lo real.{" "}
              <a href="/admin/recetas">Completar recetas →</a>
            </span>
          )}
        </div>
        <div className="fin-hero__break">
          <div className="fin-hero__line">
            <span>Ventas</span><b>{formatCOP(ventas)}</b>
          </div>
          <div className="fin-hero__line is-minus">
            <span>Costo de lo vendido</span><b>−{formatCOP(cogs)}</b>
          </div>
          <div className="fin-hero__line is-minus">
            <span>Gastos operativos</span><b>−{formatCOP(gastosOperativos)}</b>
          </div>
        </div>
      </div>

      {/* Flujo de caja (secundario, informativo) */}
      <div className="fin-flow">
        <div className="fin-flow__item"><span>Entró en caja</span><b>{formatCOP(cobrado)}</b></div>
        <div className="fin-flow__item"><span>Salió (compras + gastos)</span><b>{formatCOP(salidas)}</b></div>
        <div className="fin-flow__item"><span>Compras de insumos</span><b>{formatCOP(totalCompras)}</b></div>
        <div className="fin-flow__item is-pend"><span>Pendiente por cobrar</span><b>{formatCOP(porCobrar)}</b></div>
      </div>

      {/* PLATA DE TERCEROS: entra a la caja pero NO es del negocio. Antes se sumaba a
          "Ventas" y a la "Utilidad", que quedaban infladas con dinero ajeno. */}
      {(impuestoRecaudado > 0 || propinas > 0 || domicilios > 0) && (
        <div className="fin-flow">
          <div className="fin-flow__item">
            <span>Impuesto recaudado (de la DIAN)</span><b>{formatCOP(impuestoRecaudado)}</b>
          </div>
          <div className="fin-flow__item">
            <span>Propinas (del personal)</span><b>{formatCOP(propinas)}</b>
          </div>
          <div className="fin-flow__item">
            <span>Domicilios cobrados</span><b>{formatCOP(domicilios)}</b>
          </div>
        </div>
      )}

      <p className="fin-hint">
        La <b>utilidad</b> es Ventas − Costo de lo vendido − Gastos. <b>Ventas</b> no incluye el
        impuesto ni la propina: esa plata pasa por tu caja pero es de la DIAN y del personal. El
        costo sale de la receta de cada plato × el costo de sus insumos. Las <b>compras</b>
        (reponer despensa) son flujo de caja, no pérdida: se vuelven costo cuando vendes.
      </p>

      {/* ¿Por dónde entra la venta? El canal se guardaba en cada pedido desde siempre
          y no aparecía en ningún reporte: era imposible saber si el QR de la mesa vende. */}
      <h2 className="fin-sech">📲 Por dónde entran los pedidos</h2>
      <div className="fin-flow">
        {porCanal.map((c) => (
          <div key={c.c} className="fin-flow__item">
            <span>
              {c.c === "qr" ? "QR en mesa" : c.c === "salon" ? "Mostrador / teléfono" : "Sitio web"}{" "}
              · {c.n}
            </span>
            <b>{formatCOP(c.total)}</b>
          </div>
        ))}
      </div>

      {/* Despensa: hay vs falta */}
      <h2 className="fin-sech">📦 Despensa · lo que hay vs. lo que se necesita</h2>
      <p className="fin-sec-cap">Registro diario de existencias. Lo que está por debajo del estándar, a reponer.</p>
      <article className="card">
        {necesita.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todo con buen nivel. 🎉</p>
        ) : (
          <table className="md-table md-table--zebra">
            <thead><tr><th>Insumo</th><th>Hay</th><th>Estándar</th><th>Falta</th></tr></thead>
            <tbody>
              {necesita.map((i) => (
                <tr key={i.id}>
                  <td>{i.emoji} {i.nombre}</td>
                  <td className={insumoBajo(i) ? "is-low" : ""}>{formatCantidad(i.stock, i.unidad)}</td>
                  <td>{i.parStock} {unidadCorta[i.unidad]}</td>
                  <td><b>{i.falta} {unidadCorta[i.unidad]}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="card__actions">
          <a href="/admin/inventario" className="btn btn--ghost btnmini"><span>Ir a abastecer →</span></a>
        </div>
      </article>

      {/* Dónde se va la plata */}
      <h2 className="fin-sech">💸 En qué se fue la plata</h2>
      <p className="fin-sec-cap">Lo comprado de cada insumo y los gastos operativos del período.</p>
      <div className="fin-cols">
        <article className="card">
          <div className="card__h"><h2>Compras por insumo</h2></div>
          {comprasRank.length === 0 ? (
            <p className="muted">Sin compras. Al abastecer un insumo con costo, se registra aquí solo.</p>
          ) : (
            <table className="md-table md-table--zebra">
              <thead><tr><th>Insumo</th><th>Cantidad</th><th>Gastado</th></tr></thead>
              <tbody>
                {comprasRank.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.unidad ? formatCantidad(c.cant, c.unidad) : c.cant}</td>
                    <td><b>{formatCOP(c.monto)}</b></td>
                  </tr>
                ))}
                <tr className="pnl__total"><td>Total</td><td /><td><b>{formatCOP(totalCompras)}</b></td></tr>
              </tbody>
            </table>
          )}
        </article>

        <article className="card">
          <div className="card__h"><h2>Gastos operativos</h2></div>
          {gastoPorCat.length > 0 ? (
            <table className="md-table md-table--zebra">
              <tbody>
                {gastoPorCat.map((g) => (
                  <tr key={g.cat}>
                    <td>{gastoCatEmoji[g.cat]} {gastoCatLabel[g.cat]}</td>
                    <td><b>{formatCOP(g.total)}</b></td>
                  </tr>
                ))}
                <tr className="pnl__total"><td>Total</td><td><b>{formatCOP(totalGastos)}</b></td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">Aún sin gastos registrados en este período.</p>
          )}
          <form action={crearGastoAction} className="gasto-form">
            <strong className="gasto-form__t">➕ Registrar gasto</strong>
            <div className="gasto-form__grid">
              <input className="admin-input" name="concepto" placeholder="Concepto (ej: recibo de luz)" required />
              <input className="admin-input" type="number" name="monto" placeholder="Monto COP" min={0} step={500} required />
              <select className="admin-input" name="categoria" defaultValue="otro">
                {GASTO_CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{gastoCatLabel[c]}</option>
                ))}
              </select>
              <input className="admin-input" type="date" name="fecha" aria-label="Fecha" />
            </div>
            <button className="btn btn--primary btnmini" type="submit"><span>Registrar gasto</span></button>
          </form>
        </article>
      </div>

      {/* Desempeño */}
      <h2 className="fin-sech">📈 Desempeño</h2>
      <p className="fin-sec-cap">Cómo se mueve el negocio y qué se vende más.</p>
      <div className="fin-cols">
        <article className="card">
          <div className="card__h"><h2>Ventas · últimos 7 días</h2></div>
          <div className="chart">
            {porDia.map((d, i) => (
              <div className="chart__col" key={i}>
                <div className="chart__barwrap">
                  <div className="chart__bar" style={{ "--h": `${(d.total / maxDia) * 100}%` } as CSSVars} title={formatCOP(d.total)} />
                </div>
                <span className="chart__lbl">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="fin-metrics">
            <span>Pedidos <b>{pedPer.length}</b></span>
            <span>Ticket promedio <b>{formatCOP(ticket)}</b></span>
            <span>Cobrado <b>{formatCOP(cobrado)}</b></span>
          </div>
        </article>

        <article className="card">
          <div className="card__h"><h2>Lo más pedido</h2></div>
          <h3 className="rank__h">Bases</h3>
          <RankList data={rank((p) => p.base)} />
          <h3 className="rank__h">Proteínas</h3>
          <RankList data={rank((p) => p.proteina)} />
          <div className="fin-two">
            <div>
              <h3 className="rank__h">Cobros por método</h3>
              <ul className="rank">
                {porMetodo.map(({ m, total }) => (
                  <li key={m} style={{ gridTemplateColumns: "1fr auto" }}>
                    <span className="rank__name">{metodoLabel[m]}</span>
                    <span className="rank__n">{formatCOP(total)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="rank__h">Por servicio</h3>
              <ul className="rank">
                {porTipo.map(({ t, n }) => (
                  <li key={t} style={{ gridTemplateColumns: "1fr auto" }}>
                    <span className="rank__name">{tipoIcon[t]} {tipoLabel[t]}</span>
                    <span className="rank__n">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </div>

      {/* Movimientos */}
      <h2 className="fin-sech">🧾 Movimientos</h2>
      <p className="fin-sec-cap">Cada compra y gasto registrado, del más reciente al más antiguo.</p>
      <article className="card">
        {movPer.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Sin compras ni gastos en este período.</p>
        ) : (
          <ul className="ledger">
            {movPer.slice(0, 50).map((m) => (
              <li key={m.id} className="ledger__row">
                <span className="ledger__tipo">{m.tipo === "compra" ? "🧺" : gastoCatEmoji[m.categoria]}</span>
                <span className="ledger__concepto">
                  {m.concepto}
                  <time suppressHydrationWarning>
                    {new Date(m.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                    {" · "}
                    {m.tipo === "compra" ? "compra" : gastoCatLabel[m.categoria]}
                  </time>
                </span>
                <span className="ledger__monto">−{formatCOP(m.monto)}</span>
                <form action={eliminarMovimientoAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="linkbtn linkbtn--danger" type="submit" aria-label="Eliminar">✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}

function RankList({ data }: { data: [string, number][] }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  if (data.length === 0) return <p className="muted">Sin datos.</p>;
  return (
    <ul className="rank">
      {data.map(([nombre, n]) => (
        <li key={nombre}>
          <span className="rank__name">{nombre}</span>
          <span className="rank__bar">
            <span className="rank__fill" style={{ "--w": `${(n / max) * 100}%` } as CSSVars} />
          </span>
          <span className="rank__n">{n}</span>
        </li>
      ))}
    </ul>
  );
}
