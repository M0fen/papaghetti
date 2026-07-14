"use client";

import { useMemo, useState } from "react";
import {
  UNIDADES,
  unidadCorta,
  unidadLabel,
  INSUMO_CATEGORIAS,
  insumoCatLabel,
  insumoCatEmoji,
  insumoMinimo,
  insumoBajo,
  formatCantidad,
  formatCOP,
  type Insumo,
  type UnidadInsumo,
} from "@/lib/menu";
import {
  abastecerAction,
  abastecerAParAction,
  abastecerTodoAParAction,
  saveInsumoAction,
  crearInsumoAction,
  eliminarInsumoAction,
} from "@/app/admin/actions";

const PRESETS: Record<UnidadInsumo, number[]> = {
  lb: [1, 5],
  kg: [1, 5],
  g: [100, 500],
  l: [1, 5],
  ml: [100, 500],
  und: [1, 6],
  paquete: [1, 6],
  porcion: [5, 10],
  manojo: [1, 3],
};

export default function InsumosTable({ insumos }: { insumos: Insumo[] }) {
  const [nuevo, setNuevo] = useState(false);
  const valor = useMemo(
    () => insumos.reduce((s, i) => s + i.stock * (i.costo ?? 0), 0),
    [insumos]
  );
  const bajos = useMemo(() => insumos.filter(insumoBajo).length, [insumos]);

  // Agrupa por categoría en el orden canónico; ordena bajos primero.
  const grupos = useMemo(() => {
    return INSUMO_CATEGORIAS.map((cat) => ({
      cat,
      items: insumos
        .filter((i) => (i.categoria ?? "otro") === cat)
        .sort((a, b) => Number(insumoBajo(b)) - Number(insumoBajo(a))),
    })).filter((g) => g.items.length > 0);
  }, [insumos]);

  return (
    <>
      <div className="ins-topbar">
        <div className="ins-stat">
          <span className="ins-stat__k">Valor en despensa</span>
          <b className="ins-stat__v">{formatCOP(valor)}</b>
        </div>
        <div className="ins-stat">
          <span className="ins-stat__k">Por reponer</span>
          <b className={`ins-stat__v ${bajos ? "is-warn" : ""}`}>{bajos}</b>
        </div>
        <div className="ins-topbar__spacer" />
        <form action={abastecerTodoAParAction}>
          <button className="btn btn--gold btnmini" type="submit" title="Apertura: deja todo en su nivel estándar">
            <span>🌅 Abastecer todo</span>
          </button>
        </form>
        <button className="btn btn--primary btnmini" type="button" onClick={() => setNuevo((v) => !v)}>
          <span>{nuevo ? "Cerrar" : "＋ Nuevo insumo"}</span>
        </button>
      </div>

      {nuevo && <NuevoInsumo onDone={() => setNuevo(false)} />}

      {grupos.map((g) => (
        <section className="ins-cat" key={g.cat}>
          <h2 className="ins-cat__title">
            <span aria-hidden>{insumoCatEmoji[g.cat]}</span> {insumoCatLabel[g.cat]}
            <span className="ins-cat__count">{g.items.length}</span>
          </h2>
          <div className="ins-grid">
            {g.items.map((i) => (
              <InsumoCard key={i.id} ins={i} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function InsumoCard({ ins }: { ins: Insumo }) {
  const [editar, setEditar] = useState(false);
  const min = insumoMinimo(ins);
  const bajo = insumoBajo(ins);
  const agotado = ins.stock <= 0;
  const pct = ins.parStock > 0 ? Math.min(100, Math.round((ins.stock / ins.parStock) * 100)) : 0;
  const falta = Math.max(0, Number((ins.parStock - ins.stock).toFixed(3)));
  const estado = agotado
    ? { txt: "Agotado", cls: "is-danger" }
    : bajo
    ? { txt: "Reponer", cls: "is-warn" }
    : { txt: "OK", cls: "is-ok" };
  const presets = PRESETS[ins.unidad] ?? [1, 5];

  return (
    <article className={`inscard ${bajo ? "is-low" : ""}`}>
      <header className="inscard__head">
        <span className="inscard__emoji" aria-hidden>{ins.emoji ?? "📦"}</span>
        <b className="inscard__name">{ins.nombre}</b>
        <button
          type="button"
          className="iconbtn"
          onClick={() => setEditar((v) => !v)}
          aria-label={`Editar ${ins.nombre}`}
          title="Editar insumo"
        >
          {editar ? "✕" : "✏️"}
        </button>
      </header>

      <div className="inscard__now">
        <span className={`inscard__qty ${estado.cls}`}>
          {formatCantidad(ins.stock, ins.unidad)}
        </span>
        <span className={`pill pill--${estado.cls.replace("is-", "")}`}>{estado.txt}</span>
      </div>
      <div className="inscard__gauge" title={`${pct}% del estándar`}>
        <div className={`inscard__bar ${bajo ? "is-low" : ""}`} style={{ width: `${pct}%` }} />
        <span className="inscard__min" style={{ left: `${ins.parStock > 0 ? Math.min(100, (min / ins.parStock) * 100) : 0}%` }} />
      </div>
      <div className="inscard__sub">
        Estándar {ins.parStock} {unidadCorta[ins.unidad]}
        {falta > 0 ? ` · faltan ${falta} ${unidadCorta[ins.unidad]}` : ""}
        {ins.costo ? ` · ${formatCOP(ins.costo)}/${unidadCorta[ins.unidad]}` : ""}
      </div>

      {!editar && (
        <div className="inscard__stock">
          <span className="inscard__stock-lbl">Abastecer</span>
          <div className="inscard__stock-btns">
            {presets.map((n) => (
              <form action={abastecerAction} key={n}>
                <input type="hidden" name="id" value={ins.id} />
                <input type="hidden" name="cantidad" value={n} />
                <button className="chipbtn" type="submit">+{n}</button>
              </form>
            ))}
            <form action={abastecerAParAction}>
              <input type="hidden" name="id" value={ins.id} />
              <button className="chipbtn chipbtn--par" type="submit" title="Llenar hasta el estándar">
                ⤴ estándar
              </button>
            </form>
            <AbastecerCustom id={ins.id} unidad={ins.unidad} />
          </div>
        </div>
      )}

      {editar && (
        <form action={saveInsumoAction} className="inscard__edit">
          <input type="hidden" name="id" value={ins.id} />
          <label className="field field--full">
            <span>Nombre</span>
            <input className="admin-input" name="nombre" defaultValue={ins.nombre} />
          </label>
          <label className="field">
            <span>Categoría</span>
            <select className="admin-input" name="categoria" defaultValue={ins.categoria ?? "otro"}>
              {INSUMO_CATEGORIAS.map((c) => (
                <option key={c} value={c}>{insumoCatLabel[c]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Unidad</span>
            <select className="admin-input" name="unidad" defaultValue={ins.unidad}>
              {UNIDADES.map((u) => (
                <option key={u} value={u}>{unidadLabel[u]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Stock actual</span>
            <input className="admin-input" type="number" name="stock" min={0} step="any" defaultValue={ins.stock} />
          </label>
          <label className="field">
            <span>Nivel estándar</span>
            <input className="admin-input" type="number" name="parStock" min={0} step="any" defaultValue={ins.parStock} />
          </label>
          <label className="field">
            <span>Costo por {unidadCorta[ins.unidad]} (COP)</span>
            <input className="admin-input" type="number" name="costo" min={0} step={1} defaultValue={ins.costo ?? ""} placeholder="0" />
          </label>
          <label className="admin-check">
            <input type="checkbox" name="activo" value="on" defaultChecked={ins.activo !== false} /> activo
          </label>
          <div className="inscard__edit-acts">
            <button className="btn btn--primary btnmini" type="submit"><span>Guardar</span></button>
            <button className="linkbtn linkbtn--danger" type="submit" formAction={eliminarInsumoAction} title="Eliminar insumo">
              eliminar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function AbastecerCustom({ id, unidad }: { id: string; unidad: UnidadInsumo }) {
  return (
    <form action={abastecerAction} className="inscard__custom">
      <input type="hidden" name="id" value={id} />
      <input
        className="admin-input inscard__custominput"
        type="number"
        name="cantidad"
        min={0}
        step="any"
        placeholder={unidadCorta[unidad]}
        aria-label="cantidad a abastecer"
      />
      <button className="chipbtn chipbtn--add" type="submit">＋</button>
    </form>
  );
}

function NuevoInsumo({ onDone }: { onDone: () => void }) {
  return (
    <form action={crearInsumoAction} className="ins-form" onSubmit={onDone}>
      <div className="ins-form__grid">
        <label className="field field--xs">
          <span>Emoji</span>
          <input className="admin-input admin-input--emoji" name="emoji" defaultValue="📦" maxLength={3} />
        </label>
        <label className="field field--grow">
          <span>Nombre del insumo</span>
          <input className="admin-input" name="nombre" placeholder="p. ej. Queso mozzarella" required />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select className="admin-input" name="categoria" defaultValue="otro">
            {INSUMO_CATEGORIAS.map((c) => (
              <option key={c} value={c}>{insumoCatLabel[c]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Unidad</span>
          <select className="admin-input" name="unidad" defaultValue="lb">
            {UNIDADES.map((u) => (
              <option key={u} value={u}>{unidadLabel[u]}</option>
            ))}
          </select>
        </label>
        <label className="field field--xs">
          <span>Stock</span>
          <input className="admin-input" type="number" name="stock" min={0} step="any" defaultValue={0} />
        </label>
        <label className="field field--xs">
          <span>Estándar</span>
          <input className="admin-input" type="number" name="parStock" min={0} step="any" defaultValue={0} />
        </label>
        <label className="field field--xs">
          <span>Costo/unidad</span>
          <input className="admin-input" type="number" name="costo" min={0} step={1} placeholder="COP" />
        </label>
      </div>
      <button className="btn btn--primary btnmini" type="submit"><span>Agregar insumo</span></button>
    </form>
  );
}
