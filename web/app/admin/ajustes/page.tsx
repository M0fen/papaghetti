import { getCatalog } from "@/lib/catalog";
import { saveAjustes, toggleAbiertoAction } from "../actions";
import PromosEditor from "@/components/admin/PromosEditor";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const { ajustes } = await getCatalog();
  const abierto = ajustes.abierto !== false;

  return (
    <section>
      <div className="adminx__pageh">
        <h1>Ajustes</h1>
        <p>Lo del día a día arriba; lo que casi nunca cambia, abajo.</p>
      </div>

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
      <div className="adminx__pageh" style={{ marginTop: 28 }}>
        <h2 className="ins-cat__title">📣 Promociones del sitio</h2>
        <p>Enciende, apaga o edita promos. Las marcadas “barra superior” salen como anuncio en la web.</p>
      </div>
      <PromosEditor promos={ajustes.promos ?? []} />

      {/* 3 · Cobro + identidad, en un solo formulario */}
      <form action={saveAjustes} className="settings settings--wide" style={{ marginTop: 28 }}>
        <fieldset className="setgroup">
          <legend>💵 Cobro y servicio</legend>
          <div className="setgrid setgrid--nums">
            <label className="field">
              <span>Impuesto % (impoconsumo)</span>
              <input className="admin-input" type="number" name="impuestoPct" min={0} max={30} defaultValue={ajustes.impuestoPct} />
            </label>
            <label className="field">
              <span>Propina sugerida %</span>
              <input className="admin-input" type="number" name="propinaSugeridaPct" min={0} max={30} defaultValue={ajustes.propinaSugeridaPct} />
            </label>
            <label className="field">
              <span>Número de mesas</span>
              <input className="admin-input" type="number" name="numMesas" min={0} max={60} defaultValue={ajustes.numMesas} />
            </label>
            <label className="field">
              <span>Costo domicilio (COP)</span>
              <input className="admin-input" type="number" name="costoDomicilio" min={0} step={500} defaultValue={ajustes.costoDomicilio} />
            </label>
            <label className="field">
              <span>Pedido mínimo (COP)</span>
              <input className="admin-input" type="number" name="pedidoMinimo" min={0} step={1000} defaultValue={ajustes.pedidoMinimo} />
            </label>
          </div>
        </fieldset>

        <details className="setgroup setgroup--details">
          <summary>🏪 Datos del negocio (rara vez cambian)</summary>
          <div className="setgrid" style={{ marginTop: 14 }}>
            <label className="field">
              <span>Nombre del negocio</span>
              <input className="admin-input" name="negocio" defaultValue={ajustes.negocio} />
            </label>
            <label className="field">
              <span>WhatsApp (formato 57…)</span>
              <input className="admin-input" name="whatsapp" defaultValue={ajustes.whatsapp} inputMode="numeric" placeholder="573001112233" />
            </label>
            <label className="field">
              <span>Instagram (sin @)</span>
              <input className="admin-input" name="instagram" defaultValue={ajustes.instagram} placeholder="papaghetti.pereira" />
            </label>
            <label className="field">
              <span>Dirección</span>
              <input className="admin-input" name="direccion" defaultValue={ajustes.direccion} />
            </label>
            <label className="field field--full">
              <span>Horarios</span>
              <input className="admin-input" name="horarios" defaultValue={ajustes.horarios} />
            </label>
          </div>
        </details>

        <button className="btn btn--primary" type="submit"><span>Guardar cambios</span></button>
      </form>
    </section>
  );
}
