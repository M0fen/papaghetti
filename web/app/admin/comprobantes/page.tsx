import { getCatalog, comprobantesEntre, pedidosArchivados } from "@/lib/catalog";
import {
  coincide,
  leerFiltros,
  rangoDe,
  filtrarComprobantes,
  resumirComprobantes,
  agruparPorDia,
  paginar,
  queryDe,
  hayFiltros,
  huecosDeConsecutivo,
  mesesDisponibles,
  mesDe,
  diaLegible,
  horaLegible,
  fechaCorta,
  diaMas,
  resumenLineas,
  situacionDe,
  situacionLabel,
  SITUACIONES,
  PRESETS,
  DIA_CERO,
  waComprobanteHref,
  type Filtros,
  type Situacion,
  type ParamsCrudos,
} from "@/lib/comprobantes";
import { esVenta, formatCOP, METODOS, metodoLabel, metodoEmoji, TIPOS, tipoLabel, tipoIcon, type Pedido } from "@/lib/menu";
import { diaNegocio } from "@/lib/precios";
import { ajustesPapelDe } from "@/lib/papel";
import { cobrarAction } from "@/app/pedido-actions";
import { haySesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * EL ARCHIVO DE COMPROBANTES.
 *
 * Pedidos es la caja de HOY; esto es todo lo que ha salido de ella, de cualquier
 * día: se busca por número, nombre o teléfono, se reimprime, se manda por WhatsApp
 * y se exporta para el contador. Se llama COMPROBANTE porque eso es lo que es: un
 * comprobante de consumo interno, no una factura electrónica.
 *
 * Todo el estado vive en la URL y todo se resuelve en el servidor: cero JavaScript
 * propio, así que una vista se comparte tal cual ("mándame lo de Nequi de agosto"
 * es un enlace), el botón Atrás funciona, y el CSV exporta EXACTAMENTE lo que se
 * ve porque lee los mismos parámetros. Al navegador solo viaja el HTML de una
 * página (100 filas), nunca la lista de pedidos.
 *
 * Los datos salen de `comprobantesEntre`: el cerebro guarda ~2.000 pedidos y lo
 * anterior vive archivado por meses; esta pantalla no distingue de dónde viene cada
 * uno. Aquí NO se mueve dinero salvo cobrar lo que quedó por pagar (una deuda viva
 * nunca se archiva, así que siempre se encuentra); devolver o anular se hace en
 * Pedidos, que es la única pantalla donde la plata cambia.
 */

const BADGE: Record<Situacion, string> = {
  pagado: "badge--ok",
  pendiente: "badge--warn",
  devuelto: "badge--danger",
  anulado: "badge--entregado",
};
const CANAL: Record<Pedido["canal"], string> = { web: "Sitio web", qr: "QR en mesa", salon: "Mostrador" };

export default async function ComprobantesPage({ searchParams }: { searchParams: Promise<ParamsCrudos> }) {
  // Sin sesión no se arma nada: el login del layout no basta (ver haySesion en lib/sesion.ts).
  if (!(await haySesion())) return null;
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const ahora = new Date();
  const hoy = diaNegocio(ahora);
  const rango = rangoDe(f.p, ahora, f.desde, f.hasta);
  const cat = await getCatalog();
  const archivados = [...(cat.archivoMeses ?? [])].sort();
  /* Si se buscó algo sin elegir fechas, la búsqueda fue a TODO el archivo: se dice. */
  const busquedaGlobal = Boolean(f.q) && f.p === "todo" && !sp.p && !sp.mes;
  const leerTodoElArchivo = sp.archivo === "1";

  /* QUÉ SE LEE. El cerebro tiene los ~2.000 más recientes; el resto vive por meses.
     · Las deudas vivas nunca se archivan: "por pagar" se resuelve solo con el cerebro.
     · Una búsqueda sin fechas va ESCALONADA: primero el cerebro; si ahí no está, mes a
       mes del archivo del más nuevo al más viejo, y se para en el primero que responde
       (el número de un comprobante es único). ?archivo=1 fuerza leerlo todo.
     · Cualquier otro rango: comprobantesEntre, que une cerebro y archivo sin repetir. */
  let enRango: Pedido[];
  let alcance: "rango" | "recientes" | "mes-archivado" | "todo" = "rango";
  let mesEncontrado = "";
  const enDias = (p: Pedido) => {
    const d = diaNegocio(p.creadoEn);
    return d >= rango.desde && d <= rango.hasta;
  };
  if (f.s === "pendiente") {
    enRango = cat.pedidos.filter(enDias);
  } else if (busquedaGlobal && archivados.length && !leerTodoElArchivo) {
    if (cat.pedidos.some((p) => coincide(p, f.q))) {
      enRango = cat.pedidos;
      alcance = "recientes";
    } else {
      enRango = [];
      for (const mes of [...archivados].reverse()) {
        const delMes = (await pedidosArchivados(`${mes}-01`, `${mes}-01`)).filter((p) => coincide(p, f.q));
        if (delMes.length) {
          enRango = delMes;
          mesEncontrado = mes;
          alcance = "mes-archivado";
          break;
        }
      }
    }
  } else {
    enRango = await comprobantesEntre(rango.desde, rango.hasta);
    if (f.p === "todo" && archivados.length) alcance = "todo";
  }

  /* Los conteos de los chips de situación se calculan con TODO menos la situación,
     para que cada chip diga cuántos habría al tocarlo. */
  const sinSituacion = filtrarComprobantes(enRango, { q: f.q, metodo: f.m, tipo: f.t, canal: f.c });
  const conteo = (s: Situacion | "todos") =>
    s === "todos" ? sinSituacion.length : sinSituacion.filter((p) => situacionDe(p) === s).length;
  const filtrados = filtrarComprobantes(enRango, { q: f.q, situacion: f.s, metodo: f.m, tipo: f.t, canal: f.c });
  const resumen = resumirComprobantes(filtrados);
  const numeracion = huecosDeConsecutivo(filtrados);
  const pagina = paginar(filtrados, f.pag);
  const dias = agruparPorDia(pagina.items);
  /* El resumen de cada día se calcula sobre el día ENTERO, no sobre lo que cupo en
     esta página: un sábado partido en dos páginas enseñaba dos cifras distintas y
     ninguna era la del día. Cuando se parte, se dice cuántos se ven aquí. */
  const resumenDelDia = new Map(agruparPorDia(filtrados).map((d) => [d.dia, d.resumen]));
  const vieneDeAntes = (dia: string) =>
    pagina.desde > 1 && diaNegocio(filtrados[pagina.desde - 2].creadoEn) === dia;
  const sigueDespues = (dia: string) =>
    pagina.hasta < pagina.total && diaNegocio(filtrados[pagina.hasta].creadoEn) === dia;
  const meses = mesesDisponibles(cat.pedidos, archivados);
  const pendientesViejos = cat.pedidos.filter((p) => situacionDe(p) === "pendiente" && diaNegocio(p.creadoEn) < hoy);
  /* Pagados de antes de que se registrara el método: cuentan como efectivo (igual que
     el cuadre de caja), pero se dicen para que el dueño sepa que existen. */
  const sinMetodo = filtrados.filter((p) => p.pago === "pagado" && esVenta(p) && !p.metodoPago).length;
  const csvHref = queryDe(f, {}, "/admin/comprobantes/csv");
  const url = (cambios: Partial<Filtros>) => queryDe(f, cambios);
  /* El WhatsApp de cada fila dice lo mismo que el papel. Sin el logo: el texto no lo
     usa, y con 100 filas por página no tiene por qué viajar en ningún lado. */
  const ajustesPapel = ajustesPapelDe(cat.ajustes);
  const conArchivo = (u: string) => `${u}${u.includes("?") ? "&" : "?"}archivo=1`;
  const etiquetaMes = (mes: string) => meses.find((m) => m.valor === mes)?.etiqueta ?? mes;
  const etiquetaRango =
    f.p === "hoy" ? "hoy" : f.p === "ayer" ? "ayer" : f.p === "todo" ? "todas las fechas" : rango.desde === rango.hasta ? diaLegible(rango.desde) : `del ${diaLegible(rango.desde)} al ${diaLegible(rango.hasta)}`;
  /* La misma etiqueta, pero encajada dentro de una frase ("No hay comprobantes ___").
     Sin esto salía "No hay comprobantes todas las fechas". */
  const etiquetaEn =
    f.p === "todo"
      ? "en todo el archivo"
      : f.p === "hoy" || f.p === "ayer"
        ? etiquetaRango
        : rango.desde === rango.hasta
          ? `el ${diaLegible(rango.desde)}`
          : etiquetaRango;
  const hayAlgo = filtrados.length > 0;

  /* Los campos que un formulario GET tiene que arrastrar para no perder el resto. */
  const ocultos = (omitir: (keyof Filtros)[]) => (
    <>
      {!omitir.includes("q") && f.q && <input type="hidden" name="q" value={f.q} />}
      {!omitir.includes("p") && (sp.p || sp.mes) && f.p !== "rango" && <input type="hidden" name="p" value={f.p} />}
      {!omitir.includes("p") && f.p === "rango" && (
        <>
          <input type="hidden" name="p" value="rango" />
          {f.desde && <input type="hidden" name="desde" value={f.desde} />}
          {f.hasta && <input type="hidden" name="hasta" value={f.hasta} />}
        </>
      )}
      {!omitir.includes("s") && f.s !== "todos" && <input type="hidden" name="s" value={f.s} />}
      {!omitir.includes("m") && f.m !== "todos" && <input type="hidden" name="m" value={f.m} />}
      {!omitir.includes("t") && f.t !== "todos" && <input type="hidden" name="t" value={f.t} />}
      {!omitir.includes("c") && f.c !== "todos" && <input type="hidden" name="c" value={f.c} />}
    </>
  );

  return (
    <section className="cbtes">
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Comprobantes</h1>
          <p>
            El archivo de todo lo que ha salido de la caja: búscalo, reimprímelo, mándalo por
            WhatsApp o expórtalo para el contador. Son comprobantes de consumo internos, no
            factura electrónica.
          </p>
        </div>
        <a className="btn btn--ghost btnmini cbtes__csv" href={csvHref} title="Descarga lo que se ve, tal cual, para Excel">
          <span>⬇︎ Exportar a Excel</span>
        </a>
      </div>

      <article className="card cbtes__panel">
        {/* La búsqueda: lo que trae el cliente en la mano. Sin fechas elegidas busca en
            TODO el archivo, porque el número del papel es único en toda la historia. */}
        <form method="get" action="/admin/comprobantes" className="cbtes__buscar" role="search">
          {ocultos(["q"])}
          <input
            className="admin-input"
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="N° del comprobante, cliente, teléfono o código"
            aria-label="Buscar comprobante"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="btn btn--primary btnmini" type="submit">
            <span>Buscar</span>
          </button>
          {f.q && (
            <a className="linkbtn" href={url({ q: "" })}>
              ✕ Quitar búsqueda
            </a>
          )}
        </form>

        <div className="cbtes__seg">
          <div className="seg" role="tablist" aria-label="Fechas">
            {PRESETS.map((x) => (
              <a
                key={x.id}
                role="tab"
                aria-selected={f.p === x.id}
                className={`seg__item ${f.p === x.id ? "is-on" : ""}`}
                href={x.id === "rango" ? url({ p: "rango", desde: rango.desde, hasta: rango.hasta }) : url({ p: x.id, desde: undefined, hasta: undefined })}
              >
                {x.label}
              </a>
            ))}
          </div>
          <span className="cbtes__rango-txt">
            {f.p === "todo"
              ? `Todas las fechas${archivados.length ? " · incluye el archivo" : ""}`
              : rango.desde === rango.hasta
                ? diaLegible(rango.desde)
                : `${diaLegible(rango.desde)} → ${diaLegible(rango.hasta)}`}
          </span>
        </div>

        {f.p === "rango" && (
          <div className="cbtes__fechas">
            <form method="get" action="/admin/comprobantes">
              {ocultos(["p"])}
              <input type="hidden" name="p" value="rango" />
              <span>Del</span>
              <input className="admin-input" type="date" name="desde" defaultValue={rango.desde} aria-label="Desde" />
              <span>al</span>
              <input className="admin-input" type="date" name="hasta" defaultValue={rango.hasta} aria-label="Hasta" />
              <button className="btn btn--ghost btnmini" type="submit">
                <span>Ver</span>
              </button>
            </form>
            {meses.length > 0 && (
              <form method="get" action="/admin/comprobantes">
                {/* Con el rango entre los ocultos: pulsar "Ir" sin elegir mes deja las
                    fechas como estaban, en vez de mandarte de vuelta a Hoy. Si SÍ se
                    elige un mes, `mes` manda sobre desde/hasta. */}
                {ocultos([])}
                <span>o el mes entero</span>
                <select className="admin-input" name="mes" defaultValue={mesDe(rango)} aria-label="Mes entero">
                  <option value="">Elegir mes…</option>
                  {meses.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.etiqueta}
                    </option>
                  ))}
                </select>
                <button className="btn btn--ghost btnmini" type="submit">
                  <span>Ir</span>
                </button>
              </form>
            )}
          </div>
        )}

        <div className="cbtes__chips" aria-label="Situación">
          {(["todos", ...SITUACIONES] as (Situacion | "todos")[]).map((s) => (
            <a key={s} className={`fbtn ${f.s === s ? "is-on" : ""}`} href={url({ s })} aria-current={f.s === s ? "true" : undefined}>
              {s === "todos" ? "Todos" : situacionLabel[s]}
              <small>({conteo(s)})</small>
            </a>
          ))}
        </div>

        <div className="cbtes__chips cbtes__chips--metodos" aria-label="Método de pago">
          <a className={`fbtn ${f.m === "todos" ? "is-on" : ""}`} href={url({ m: "todos" })}>
            Cualquier método
          </a>
          {METODOS.map((m) => (
            <a key={m} className={`fbtn ${f.m === m ? "is-on" : ""}`} href={url({ m: f.m === m ? "todos" : m })} aria-current={f.m === m ? "true" : undefined}>
              {metodoEmoji[m]} {metodoLabel[m]}
            </a>
          ))}
        </div>

        <details className="cbtes__mas" open={f.t !== "todos" || f.c !== "todos"}>
          <summary>Más filtros {f.t !== "todos" || f.c !== "todos" ? "· activos" : "· servicio y canal"}</summary>
          <form method="get" action="/admin/comprobantes">
            {ocultos(["t", "c"])}
            <select className="admin-input" name="t" defaultValue={f.t} aria-label="Servicio">
              <option value="todos">Cualquier servicio</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {tipoIcon[t]} {tipoLabel[t]}
                </option>
              ))}
            </select>
            <select className="admin-input" name="c" defaultValue={f.c} aria-label="Canal">
              <option value="todos">Cualquier canal</option>
              {(Object.keys(CANAL) as Pedido["canal"][]).map((c) => (
                <option key={c} value={c}>
                  {CANAL[c]}
                </option>
              ))}
            </select>
            <button className="btn btn--ghost btnmini" type="submit">
              <span>Aplicar</span>
            </button>
            {hayFiltros(f) && (
              <a className="linkbtn" href={queryDe(f, { q: "", s: "todos", m: "todos", t: "todos", c: "todos" })}>
                Limpiar filtros
              </a>
            )}
          </form>
        </details>

        {busquedaGlobal && (
          <p className="cbtes__aviso" role="status">
            {alcance === "recientes" ? (
              <>
                Buscando «{f.q}» entre los <b>comprobantes recientes</b>.{" "}
                <a href={conArchivo(url({}))}>Buscar también en el archivo</a>
              </>
            ) : alcance === "mes-archivado" ? (
              <>
                «{f.q}» no está entre los recientes: esto viene del <b>archivo de {etiquetaMes(mesEncontrado)}</b>.{" "}
                <a href={conArchivo(url({}))}>Buscar en todo el archivo</a>
              </>
            ) : (
              <>
                Buscando «{f.q}» en <b>todas las fechas</b>
                {archivados.length ? ", archivo incluido" : ""}.
              </>
            )}{" "}
            · <a href={url({ p: "hoy" })}>Solo hoy</a> · <a href={url({ p: "mes" })}>Solo este mes</a>
          </p>
        )}
      </article>

      {/* LOS TOTALES DEL CONJUNTO FILTRADO (no de la página): el mismo criterio que
          Finanzas y el cuadre de caja, para que las tres pantallas digan lo mismo. */}
      <div className="fin-flow cbtes__totales">
        <div className="fin-flow__item">
          <span>Comprobantes · {etiquetaRango}</span>
          <b>
            {resumen.cantidad}
            {resumen.anulados > 0 && <small> · {resumen.anulados} anulado{resumen.anulados === 1 ? "" : "s"}</small>}
          </b>
        </div>
        <div className="fin-flow__item">
          <span>Cobrado · {resumen.cobrado.n}</span>
          <b>{formatCOP(resumen.cobrado.total)}</b>
        </div>
        <div className={`fin-flow__item ${resumen.pendiente.n ? "is-pend" : ""}`}>
          <span>Por pagar · {resumen.pendiente.n}</span>
          <b>{formatCOP(resumen.pendiente.total)}</b>
        </div>
        <div className="fin-flow__item">
          <span>Devuelto · {resumen.devuelto.n}</span>
          <b>{resumen.devuelto.n ? `−${formatCOP(resumen.devuelto.monto)}` : formatCOP(0)}</b>
        </div>
      </div>
      {resumen.cobrado.porMetodo.length > 0 && (
        <p className="cbtes__metodos" aria-label="Cobrado por método">
          {resumen.cobrado.porMetodo.map((m) => (
            <span key={m.metodo}>
              {metodoEmoji[m.metodo]} {metodoLabel[m.metodo]} <b>{formatCOP(m.total)}</b> <small>({m.n})</small>
            </span>
          ))}
          <span>
            ticket promedio <b>{formatCOP(resumen.ticketPromedio)}</b>
          </span>
          {sinMetodo > 0 && (
            <span>
              <small>
                {sinMetodo} pagado{sinMetodo === 1 ? "" : "s"} sin método registrado (cuenta{sinMetodo === 1 ? "" : "n"} como efectivo)
              </small>
            </span>
          )}
        </p>
      )}
      {/* Los huecos solo se miran en una vista SIN filtros: con un chip puesto, los
          números que faltan son simplemente los que el filtro dejó fuera. */}
      {hayAlgo && !hayFiltros(f) && numeracion.desde !== undefined && (
        <p className={`cbtes__control ${numeracion.faltan.length || numeracion.repetidos.length ? "is-alerta" : ""}`}>
          Numeración: del N° {numeracion.desde} al N° {numeracion.hasta}
          {numeracion.faltan.length === 0 && numeracion.repetidos.length === 0 && numeracion.saltos.length === 0
            ? ", sin saltos ni repetidos."
            : "."}
          {numeracion.faltan.length > 0 && (
            <>
              {" "}
              Faltan {numeracion.faltan.length}: {numeracion.faltan.slice(0, 12).join(", ")}
              {numeracion.faltan.length > 12 ? "…" : ""}.
            </>
          )}
          {numeracion.repetidos.length > 0 && <> Repetidos: {numeracion.repetidos.join(", ")}.</>}
          {numeracion.saltos.length > 0 && (
            <> Salto{numeracion.saltos.length > 1 ? "s" : ""} grande{numeracion.saltos.length > 1 ? "s" : ""}: {numeracion.saltos.map(([a, b]) => `${a}→${b}`).join(", ")} (mezcla de días o una deuda vieja).</>
          )}
          {numeracion.sinNumero > 0 && <> {numeracion.sinNumero} sin número (anteriores a la numeración).</>}
        </p>
      )}
      {pendientesViejos.length > 0 && f.s !== "pendiente" && (
        <p className="cbtes__control is-alerta">
          ⚠️ {pendientesViejos.length} por pagar de días anteriores ({formatCOP(pendientesViejos.reduce((s, p) => s + p.total, 0))}).{" "}
          {/* La alerta cuenta TODOS los pendientes viejos, así que el enlace tiene que
              soltar también los filtros de método, servicio y canal: si no, se llegaba
              a una lista vacía después de leer "hay 3". */}
          <a href={queryDe(f, { p: "rango", desde: DIA_CERO, hasta: diaMas(hoy, -1), s: "pendiente", q: "", m: "todos", t: "todos", c: "todos" })}>
            Verlos
          </a>
        </p>
      )}

      {!hayAlgo && (
        <article className="card cbtes__vacio">
          {f.q ? (
            <>
              <p>
                No encontramos nada con «{f.q}» {etiquetaEn}.
              </p>
              <div>
                {f.p !== "todo" && (
                  <a className="btn btn--primary btnmini" href={url({ p: "todo" })}>
                    <span>Buscar en todas las fechas</span>
                  </a>
                )}
                {f.p === "todo" && archivados.length > 0 && !leerTodoElArchivo && (
                  <a className="btn btn--primary btnmini" href={conArchivo(url({}))}>
                    <span>Revisar todo el archivo, mes a mes</span>
                  </a>
                )}
                {hayFiltros(f) && (
                  <a className="btn btn--ghost btnmini" href={queryDe(f, { q: "", s: "todos", m: "todos", t: "todos", c: "todos" })}>
                    <span>Quitar filtros</span>
                  </a>
                )}
              </div>
            </>
          ) : f.s !== "todos" || f.m !== "todos" || f.t !== "todos" || f.c !== "todos" ? (
            <>
              <p>Ningún comprobante con esos filtros {etiquetaEn}.</p>
              <div>
                <a className="btn btn--ghost btnmini" href={queryDe(f, { s: "todos", m: "todos", t: "todos", c: "todos" })}>
                  <span>Quitar filtros</span>
                </a>
              </div>
            </>
          ) : (
            <>
              <p>{f.p === "hoy" ? "Todavía no hay comprobantes hoy." : `No hay comprobantes ${etiquetaEn}.`}</p>
              <div>
                {f.p === "hoy" && (
                  <a className="btn btn--ghost btnmini" href={url({ p: "ayer" })}>
                    <span>Ver ayer</span>
                  </a>
                )}
                <a className="btn btn--ghost btnmini" href={url({ p: "mes" })}>
                  <span>Ver el mes</span>
                </a>
                <a className="btn btn--ghost btnmini" href="/admin/pedidos">
                  <span>Ir a la caja</span>
                </a>
              </div>
            </>
          )}
        </article>
      )}

      {dias.map((d) => {
        const rd = resumenDelDia.get(d.dia) ?? d.resumen;
        const partido = vieneDeAntes(d.dia) || sigueDespues(d.dia);
        return (
        <section key={d.dia} className="cbtes__dia">
          <div className="cbtes__dia-h">
            <h2>
              {diaLegible(d.dia)}
              {d.dia === hoy ? " · hoy" : d.dia === diaMas(hoy, -1) ? " · ayer" : ""}
            </h2>
            <span>
              {rd.cantidad} comprobante{rd.cantidad === 1 ? "" : "s"} · cobrado {formatCOP(rd.cobrado.total)}
              {rd.pendiente.n > 0 && ` · ${rd.pendiente.n} por pagar`}
              {rd.devuelto.n > 0 && ` · ${rd.devuelto.n} devuelto${rd.devuelto.n === 1 ? "" : "s"}`}
              {rd.anulados > 0 && ` · ${rd.anulados} anulado${rd.anulados === 1 ? "" : "s"}`}
              {/* El día completo manda en las cifras; si está partido entre páginas se
                  dice cuántos se ven aquí, para que nadie cuente filas y no cuadre. */}
              {partido && ` · aquí se ven ${d.pedidos.length}${vieneDeAntes(d.dia) ? ", viene de la página anterior" : ""}${sigueDespues(d.dia) ? ", sigue en la siguiente" : ""}`}
            </span>
          </div>
          <ul className="cbtes__lista">
            {d.pedidos.map((p) => {
              const sit = situacionDe(p);
              const wa = waComprobanteHref(p, ajustesPapel);
              const quien = p.cliente || p.referencia || p.direccion || tipoLabel[p.tipo];
              const devueltoOtroDia = p.devolucion?.fecha && diaNegocio(p.devolucion.fecha) !== d.dia;
              return (
                <li key={p.id} className={`cbte-fila is-${sit}`}>
                  <div className="cbte-fila__num">
                    <a href={`/admin/tiquete/${p.id}?de=comprobantes`} title={`Código ${p.id}`}>
                      {p.consecutivo ? `N° ${p.consecutivo}` : `#${p.id}`}
                    </a>
                    <small>{horaLegible(p.creadoEn)}</small>
                    {!p.consecutivo && <span className="badge badge--warn">sin número</span>}
                  </div>
                  <div className="cbte-fila__quien">
                    <b>
                      {tipoIcon[p.tipo]} {quien}
                      {p.telefono ? ` · 📱 ${p.telefono}` : ""}
                    </b>
                    <span>
                      {resumenLineas(p)} · {CANAL[p.canal] ?? p.canal}
                      {p.cliente && p.referencia ? ` · ${p.referencia}` : ""}
                    </span>
                  </div>
                  <div className="cbte-fila__estado">
                    <span className={`badge ${BADGE[sit]}`}>
                      {situacionLabel[sit]}
                      {sit === "pagado" && p.metodoPago ? ` · ${metodoLabel[p.metodoPago]}` : ""}
                    </span>
                    {sit === "devuelto" && (
                      <small>
                        {devueltoOtroDia && p.devolucion ? `devuelto el ${fechaCorta(p.devolucion.fecha)}` : ""}
                        {p.devolucion?.motivo ? `${devueltoOtroDia ? " · " : ""}${p.devolucion.motivo}` : ""}
                      </small>
                    )}
                    {sit === "anulado" && p.motivoCancelacion && <small>{p.motivoCancelacion}</small>}
                  </div>
                  <div className="cbte-fila__total">
                    {sit === "devuelto" ? "−" : ""}
                    {formatCOP(sit === "devuelto" ? (p.devolucion?.monto ?? p.total) : p.total)}
                  </div>
                  <div className="cbte-fila__acciones">
                    <a className="btn btn--primary btnmini" href={`/admin/tiquete/${p.id}?imprimir=1&de=comprobantes`} target="_blank" rel="noopener">
                      <span>🖨️ Imprimir</span>
                    </a>
                    {wa ? (
                      <a className="btn btn--gold btnmini" href={wa} target="_blank" rel="noopener noreferrer" title={`Al ${p.telefono}`}>
                        <span>📲 WhatsApp</span>
                      </a>
                    ) : (
                      <a className="btn btn--ghost btnmini" href={`/admin/tiquete/${p.id}?wa=1&de=comprobantes`} title="Pide el número al abrir">
                        <span>📲 WhatsApp</span>
                      </a>
                    )}
                    <a className="btn btn--ghost btnmini" href={`/admin/tiquete/${p.id}?de=comprobantes`}>
                      <span>Ver</span>
                    </a>
                    {sit === "pendiente" && (
                      <details className="cbte-fila__cobrar">
                        <summary className="btn btn--ghost btnmini">
                          <span>💵 Cobrar</span>
                        </summary>
                        <form action={cobrarAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="descuento" value="0" />
                          <span className="muted">Cobrar {formatCOP(p.total)} con:</span>
                          {METODOS.map((m) => (
                            <button key={m} className="chipbtn" name="metodo" value={m} type="submit">
                              {metodoEmoji[m]} {metodoLabel[m]}
                            </button>
                          ))}
                        </form>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        );
      })}

      {hayAlgo && (
        <div className="cbtes__pag">
          <span>
            Mostrando {pagina.desde}–{pagina.hasta} de {pagina.total}
          </span>
          {pagina.paginas > 1 && (
            <nav aria-label="Páginas">
              {pagina.pag > 1 && (
                <a className="btn btn--ghost btnmini" href={url({ pag: pagina.pag - 1 })}>
                  <span>← Más recientes</span>
                </a>
              )}
              <span className="muted">
                {pagina.pag} / {pagina.paginas}
              </span>
              {pagina.pag < pagina.paginas && (
                <a className="btn btn--ghost btnmini" href={url({ pag: pagina.pag + 1 })}>
                  <span>Más antiguos →</span>
                </a>
              )}
            </nav>
          )}
        </div>
      )}

      <p className="cbtes__pie">
        Aquí solo se <b>cobra lo que quedó por pagar</b>. Devolver dinero, anular o corregir un
        cobro se hace en <a href="/admin/pedidos">Pedidos</a>, que es la única pantalla donde la
        plata cambia. Las devoluciones cuentan aquí por el día del pedido; el cuadre de caja las
        resta el día en que se devolvió el dinero.
      </p>
    </section>
  );
}
