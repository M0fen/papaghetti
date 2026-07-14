"use client";

import { useMemo, useState } from "react";
import {
  unidadCorta,
  formatCOP,
  type Ingrediente,
  type Insumo,
  type RecetaItem,
} from "@/lib/menu";
import { guardarRecetaAction, setDisponibilidadAction } from "@/app/admin/actions";

export default function RecetasEditor({
  bases,
  proteinas,
  toppings,
  insumos,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  insumos: Insumo[];
}) {
  const byId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  return (
    <>
      <p className="rec-hint">
        La receta define <b>cuánta despensa consume una porción</b> de cada componente.
        Cada venta la descuenta sola y te muestra el <b>costo y el margen</b>.
      </p>
      <Grupo titulo="🥔 Bases" items={bases} insumos={insumos} byId={byId} />
      <Grupo titulo="🍗 Proteínas" items={proteinas} insumos={insumos} byId={byId} />
      <Grupo titulo="🌽 Toppings" items={toppings} insumos={insumos} byId={byId} />
    </>
  );
}

function Grupo({
  titulo,
  items,
  insumos,
  byId,
}: {
  titulo: string;
  items: Ingrediente[];
  insumos: Insumo[];
  byId: Map<string, Insumo>;
}) {
  return (
    <section className="rec-group">
      <h2 className="ins-cat__title">{titulo}<span className="ins-cat__count">{items.length}</span></h2>
      <div className="rec-grid">
        {items.map((i) => (
          <RecetaCard key={i.id} ing={i} insumos={insumos} byId={byId} />
        ))}
      </div>
    </section>
  );
}

function RecetaCard({
  ing,
  insumos,
  byId,
}: {
  ing: Ingrediente;
  insumos: Insumo[];
  byId: Map<string, Insumo>;
}) {
  const [rows, setRows] = useState<RecetaItem[]>(
    ing.receta && ing.receta.length ? ing.receta : []
  );

  const costo = rows.reduce(
    (s, r) => s + (byId.get(r.insumoId)?.costo ?? 0) * (r.cantidad || 0),
    0
  );
  const margen = ing.precio - costo;
  const margenPct = ing.precio > 0 ? Math.round((margen / ing.precio) * 100) : 0;

  const add = () =>
    setRows((r) => [...r, { insumoId: insumos[0]?.id ?? "", cantidad: 0 }]);
  const del = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));
  const upd = (idx: number, patch: Partial<RecetaItem>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  return (
    <article className={`reccard ${ing.agotado ? "is-agotado" : ""}`}>
      <header className="reccard__head">
        <span className="reccard__emoji" aria-hidden>{ing.emoji}</span>
        <div className="reccard__id">
          <b className="reccard__name">{ing.nombre}</b>
          <span className="reccard__precio">Se vende en {formatCOP(ing.precio)}</span>
        </div>
        <span className={`pill ${ing.agotado ? "pill--danger" : "pill--ok"}`}>
          {ing.agotado ? "Agotado" : "Disponible"}
        </span>
      </header>

      <form action={guardarRecetaAction} className="reccard__form">
        <input type="hidden" name="ingredienteId" value={ing.id} />
        <span className="reccard__label">Para 1 porción se usa:</span>
        {rows.length === 0 && (
          <p className="reccard__empty">Todavía sin receta. Agrega los insumos que consume.</p>
        )}
        {rows.map((row, idx) => {
          const ins = byId.get(row.insumoId);
          return (
            <div className="recrow" key={idx}>
              <input
                className="recrow__qty admin-input"
                type="number"
                name="cantidad"
                min={0}
                step="any"
                value={row.cantidad}
                onChange={(e) => upd(idx, { cantidad: Number(e.target.value) })}
                aria-label="cantidad"
              />
              <span className="recrow__u">{ins ? unidadCorta[ins.unidad] : ""}</span>
              <span className="recrow__de">de</span>
              <select
                className="admin-input recrow__sel"
                name="insumoId"
                value={row.insumoId}
                onChange={(e) => upd(idx, { insumoId: e.target.value })}
              >
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.emoji ? `${i.emoji} ` : ""}{i.nombre}
                  </option>
                ))}
              </select>
              <button type="button" className="recrow__x" onClick={() => del(idx)} aria-label="quitar">
                ✕
              </button>
            </div>
          );
        })}

        <button type="button" className="chipbtn reccard__add" onClick={add}>＋ Agregar insumo</button>

        <div className="reccard__cost">
          <span className="reccard__chip">Costo <b>{formatCOP(Math.round(costo))}</b></span>
          <span className={`reccard__chip ${margen < 0 ? "is-neg" : "is-pos"}`}>
            Margen <b>{formatCOP(Math.round(margen))}</b> · {margenPct}%
          </span>
          <button type="submit" className="btn btn--primary btnmini reccard__save"><span>Guardar receta</span></button>
        </div>
      </form>

      <form action={setDisponibilidadAction} className="reccard__disp">
        <input type="hidden" name="id" value={ing.id} />
        <span className="reccard__disp-lbl">Disponibilidad en el menú:</span>
        <label className="admin-check">
          <input type="checkbox" name="activo" value="on" defaultChecked={ing.activo} /> en carta
        </label>
        <label className="admin-check">
          <input type="checkbox" name="agotado" value="on" defaultChecked={ing.agotado} /> agotado
        </label>
        <button type="submit" className="linkbtn">aplicar</button>
      </form>
    </article>
  );
}
