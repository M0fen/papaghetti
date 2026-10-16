import { getCatalog, estadoPersistencia } from "@/lib/catalog";
import { basesMaxDe, cobroBasesDe } from "@/lib/menu";
import { usuariosDe } from "@/lib/usuarios";
import { saveAjustes, toggleAbiertoAction } from "../actions";
import PromosEditor from "@/components/admin/PromosEditor";
import AjustesComprobante from "@/components/admin/AjustesComprobante";
import AjustesSitio from "@/components/admin/AjustesSitio";
import AjustesUsuarios from "@/components/admin/AjustesUsuarios";
import BotonGuardar from "@/components/admin/BotonGuardar";
import { haySesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * AJUSTES: TODO LO DEL NEGOCIO, SIN TOCAR CÓDIGO.
 *
 * Lo del día a día arriba (abrir/cerrar, promos, cobro), lo que casi nunca cambia abajo.
 * Cada sección es su PROPIO formulario y guarda solo sus campos: antes un único
 * formulario reescribía todo lo que conocía, incluso campos sin casilla, y así la
 * propina sugerida volvía a 0 en cada "Guardar".
 */
export default async function AjustesPage() {
  // Sin sesión no se arma nada: el login del layout no basta (ver haySesion en lib/sesion.ts).
  if (!(await haySesion())) return null;
  const { ajustes } = await getCatalog();
  const persistencia = await estadoPersistencia();
  const abierto = ajustes.abierto !== false;

  return (
    <section className="ajustes">
      <div className="adminx__pageh">
        <h1>Ajustes</h1>
        <p>Lo del día a día arriba; lo que casi nunca cambia, abajo.</p>
      </div>

      {/* Índice: con siete secciones, nadie baja a buscar a ciegas. */}
      <nav className="ajustes__indice" aria-label="Secciones de Ajustes">
        <a href="#promos">Promociones</a>
        <a href="#cobro">Cobro y servicio</a>
        <a href="#comprobante">Comprobante</a>
        <a href="#sitio">Sitio web</a>
        <a href="#usuarios">Usuarios</a>
        <a href="#copia">Copia de seguridad</a>
      </nav>

      {/* 1 · Estado del negocio — la acción más frecuente, de un clic */}
      <div className={`estado ${abierto ? "is-open" : "is-closed"}`}>
        <div className="estado__info">
          <span className="estado__dot" aria-hidden />
          <div>
            <b>{abierto ? "Abierto ahora" : "Cerrado"}</b>
            <span>{abierto ? "El sitio recibe pedidos con normalidad." : "El sitio muestra “Cerrado ahora”."}</span>
          </div>
        </div>
        <form action={toggleAbiertoAction}>
          <button className={`btn ${abierto ? "btn--ghost" : "btn--primary"}`} type="submit">
            <span>{abierto ? "Cerrar el negocio" : "Abrir el negocio"}</span>
          </button>
        </form>
      </div>

      {/* 2 · Promociones del sitio */}
      <section id="promos" className="ajustes__sec">
        <div className="adminx__pageh">
          <h2 className="ins-cat__title">📣 Promociones del sitio</h2>
          <p>Enciende, apaga o edita promos. Las marcadas “barra superior” salen como anuncio en la web.</p>
        </div>
        <PromosEditor promos={ajustes.promos ?? []} />
      </section>

      {/* 3 · Cobro y servicio */}
      <form id="cobro" action={saveAjustes} className="settings settings--wide ajustes__sec">
        <fieldset className="setgroup">
          <legend>💵 Cobro y servicio</legend>
          <div className="setgrid setgrid--nums">
            <label className="field">
              {/* Se dice aquí porque es donde alguien lo cambiaría pensando que se suma:
                  los precios de la carta YA lo traen y el comprobante solo lo informa. */}
              <span>Impuesto % (impoconsumo · ya va incluido en los precios)</span>
              <input className="admin-input" type="number" name="impuestoPct" min={0} max={30} step="any" defaultValue={ajustes.impuestoPct} />
            </label>
            {/* EL INTERRUPTOR QUE DESBLOQUEA EL PRIMER DÍA. Con la despensa sin
                contar, todo sale agotado y el armador aparece vacío: el mesero solo
                puede pedir platos de carta y no sabe por qué. */}
            <label className="field field--check">
              <span>Controlar el inventario</span>
              <span className="admin-check">
                <input
                  type="checkbox"
                  name="controlarStock"
                  defaultChecked={ajustes.controlarStock !== false}
                />
                <em>
                  Encendido, un plato se agota solo cuando su receta ya no alcanza.
                  Apágalo para poder vender mientras cuentas la despensa.
                </em>
              </span>
            </label>
            <label className="field">
              <span>Número de mesas</span>
              <input className="admin-input" type="number" name="numMesas" min={0} max={60} defaultValue={ajustes.numMesas} />
            </label>
            <label className="field">
              <span>Costo domicilio (COP)</span>
              <input className="admin-input" type="number" name="costoDomicilio" min={0} step="any" defaultValue={ajustes.costoDomicilio} />
            </label>
            {/* step "any": con step={1000} el navegador rechazaba en silencio un mínimo
                de $25.500 y el formulario no se enviaba. */}
            <label className="field">
              <span>Pedido mínimo (COP)</span>
              <input className="admin-input" type="number" name="pedidoMinimo" min={0} step="any" defaultValue={ajustes.pedidoMinimo} />
            </label>
          </div>

          {/* DOS BASES EN UN PLATO. Se dice cómo se cobra en la misma opción, porque es
              una decisión de plata: "mitad y mitad" es el mismo plato repartido; "las
              dos" es un plato doble. */}
          <div className="setgrid ajustes__bases">
            <label className="field">
              <span>Bases por plato</span>
              <select className="admin-input" name="basesMax" defaultValue={String(basesMaxDe(ajustes))}>
                <option value="1">Una base</option>
                <option value="2">Hasta dos bases</option>
              </select>
            </label>
            <label className="field">
              <span>Con dos bases se cobra</span>
              <select className="admin-input" name="cobroBases" defaultValue={cobroBasesDe(ajustes)}>
                <option value="mitad">Mitad y mitad</option>
                <option value="suma">Las dos completas</option>
              </select>
              <small className="field__nota">
                <b>Mitad y mitad:</b> se cobra la base más cara y cada una gasta media porción.{" "}
                <b>Las dos completas:</b> cada base a su precio y en porción entera. Solo cuenta
                cuando el cliente elige dos bases.
              </small>
            </label>
          </div>
        </fieldset>
        <BotonGuardar>Guardar cobro y servicio</BotonGuardar>
      </form>

      {/* 4 · El papel que se entrega al cliente */}
      <section id="comprobante" className="ajustes__sec">
        <AjustesComprobante ajustes={ajustes} />
      </section>

      {/* 5 · El sitio público */}
      <section id="sitio" className="ajustes__sec">
        <AjustesSitio ajustes={ajustes} />
      </section>

      {/* 6 · Quién entra al panel */}
      <section id="usuarios" className="ajustes__sec">
        <AjustesUsuarios usuarios={usuariosDe(ajustes)} propios={Boolean(ajustes.usuarios?.length)} />
      </section>

      {/* DÓNDE SE GUARDA. "¿Esto está guardando bien?" no puede ser una pregunta que
          el dueño tenga que adivinar: si el POS pierde el turno se entera al día
          siguiente, y ya es tarde. */}
      <section id="copia" className={`persis ajustes__sec ${persistencia.durable && persistencia.ok ? "is-ok" : "is-mal"}`}>
        <div className="persis__head">
          <span className="persis__dot" aria-hidden />
          <h2>Dónde se guarda todo</h2>
          <b>{persistencia.nombre}</b>
        </div>
        <p className="persis__txt">{persistencia.detalle}</p>
        {persistencia.ok && (
          <p className="persis__meta">
            {persistencia.pedidos} pedidos guardados · {persistencia.peso}
            {persistencia.backend === "blob" && " · copia de seguridad diaria automática"}
          </p>
        )}
        {/* CUÁL almacén. Tras un traslado de cuenta, la prueba de que el negocio es el
            mismo es este identificador: otro almacén arranca con la carta de fábrica y
            cero pedidos, y eso se ve igual que "se borró todo". */}
        {persistencia.almacen && (
          <>
            <p className="persis__txt">
              Almacén <code>{persistencia.almacen.id || "sin identificar"}</code> · entra con{" "}
              {persistencia.almacen.como}
            </p>
            <p className="persis__meta">
              Anota ese identificador. Si algún día se traslada la cuenta de Vercel, aquí tiene
              que salir el mismo; si sale otro, no operes y avisa a quien te instaló el sistema.
            </p>
            {persistencia.almacen.aviso && (
              <p className="persis__txt field__alerta" role="alert">
                ⚠️ {persistencia.almacen.aviso}
              </p>
            )}
          </>
        )}
        {/* LA COPIA DEL DUEÑO. Un enlace normal (no <Link>): es una descarga, nadie debe
            "precargarla". La ruta exige sesión. */}
        <div className="persis__copia">
          <a className="btn btn--ghost btnmini" href="/admin/ajustes/copia" download>
            <span>⬇ Descargar copia completa</span>
          </a>
          <small className="field__nota">
            Un archivo con todo el negocio: carta, despensa, pedidos y comprobantes archivados,
            caja, gastos y ajustes. Lleva nombres y teléfonos de clientes: guárdalo en un lugar
            privado. Las fotos van como enlaces, no como imágenes.
          </small>
        </div>
      </section>
    </section>
  );
}
