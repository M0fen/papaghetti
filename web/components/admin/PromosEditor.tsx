"use client";

import { PROMO_TONOS, type Promo } from "@/lib/menu";
import {
  guardarPromoAction,
  eliminarPromoAction,
  togglePromoAction,
} from "@/app/admin/actions";

const tonoLabel: Record<string, string> = {
  oro: "Oro",
  pomodoro: "Pomodoro",
  perejil: "Perejil",
};

export default function PromosEditor({ promos }: { promos: Promo[] }) {
  return (
    <div className="promos">
      <div className="promos__list">
        {promos.length === 0 && (
          <p className="muted">Aún no hay promociones. Crea la primera abajo.</p>
        )}
        {promos.map((p) => (
          <PromoRow key={p.id} promo={p} />
        ))}
      </div>

      <details className="ins-new">
        <summary>＋ Nueva promoción</summary>
        <form action={guardarPromoAction} className="promo-form">
          <input type="hidden" name="id" value="" />
          <label className="field field--xs">
            <span>Emoji</span>
            <input className="admin-input admin-input--emoji" name="emoji" defaultValue="🔥" maxLength={3} />
          </label>
          <label className="field field--grow">
            <span>Texto de la promo</span>
            <input className="admin-input" name="texto" placeholder="p. ej. 2x1 en toppings los martes" required />
          </label>
          <label className="field field--xs">
            <span>Color</span>
            <select className="admin-input" name="tono" defaultValue="oro">
              {PROMO_TONOS.map((t) => (
                <option key={t} value={t}>{tonoLabel[t]}</option>
              ))}
            </select>
          </label>
          <label className="admin-check">
            <input type="checkbox" name="banner" value="on" /> barra superior
          </label>
          <label className="admin-check">
            <input type="checkbox" name="activo" value="on" defaultChecked /> activa
          </label>
          <button className="btn btn--primary btnmini" type="submit"><span>Crear</span></button>
        </form>
      </details>
    </div>
  );
}

function PromoRow({ promo }: { promo: Promo }) {
  return (
    <div className={`promocard promocard--${promo.tono} ${promo.activo ? "" : "is-off"}`}>
      <form action={guardarPromoAction} className="promo-form">
        <input type="hidden" name="id" value={promo.id} />
        <label className="field field--xs">
          <span>Emoji</span>
          <input className="admin-input admin-input--emoji" name="emoji" defaultValue={promo.emoji ?? ""} maxLength={3} />
        </label>
        <label className="field field--grow">
          <span>Texto</span>
          <input className="admin-input" name="texto" defaultValue={promo.texto} required />
        </label>
        <label className="field field--xs">
          <span>Color</span>
          <select className="admin-input" name="tono" defaultValue={promo.tono}>
            {PROMO_TONOS.map((t) => (
              <option key={t} value={t}>{tonoLabel[t]}</option>
            ))}
          </select>
        </label>
        <label className="admin-check">
          <input type="checkbox" name="banner" value="on" defaultChecked={promo.banner} /> barra
        </label>
        <label className="admin-check">
          <input type="checkbox" name="activo" value="on" defaultChecked={promo.activo} /> activa
        </label>
        <button className="btn btn--primary btnmini" type="submit"><span>Guardar</span></button>
      </form>
      <div className="promocard__acts">
        <form action={togglePromoAction}>
          <input type="hidden" name="id" value={promo.id} />
          <button className="chipbtn" type="submit">{promo.activo ? "⏸ pausar" : "▶ activar"}</button>
        </form>
        <form action={eliminarPromoAction}>
          <input type="hidden" name="id" value={promo.id} />
          <button className="linkbtn linkbtn--danger" type="submit">eliminar</button>
        </form>
      </div>
    </div>
  );
}
