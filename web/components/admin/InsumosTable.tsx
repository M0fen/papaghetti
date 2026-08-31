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
  abastecerTodoAParAction,
  saveInsumoAction,
  crearInsumoAction,
  eliminarInsumoAction,
} from "@/app/admin/actions";

/** Lo que suele entrar de una vez, para no teclear en el caso común. */
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
    <article className={`inscard ${agotado ? "is-out" : bajo ? "is-low" : ""}`}>
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
        {/* El estado normal ya lo dice la franja lateral: la pastilla solo aparece
            cuando hay algo que hacer, así la rejilla no grita toda a la vez. */}
        {estado.txt !== "OK" && (
          <span className={`pill pill--${estado.cls.replace("is-", "")}`}>{estado.txt}</span>
        )}
      </div>
      <div className="inscard__gauge" title={`${pct}% del estándar`}>
        <div className={`inscard__bar ${bajo ? "is-low" : ""}`} style={{ width: `${pct}%` }} />
        <span className="inscard__min" style={{ left: `${ins.parStock > 0 ? Math.min(100, (min / ins.parStock) * 100) : 0}%` }} />
      </div>
      {/* Una sola línea: el estándar, lo que falta y a cuánto sale. Antes eran tres
          datos con etiquetas largas que envolvían a dos renglones y descuadraban
          la altura de cada tarjeta de la fila. */}
      <div className="inscard__sub">
        <span>
          est. {ins.parStock} {unidadCorta[ins.unidad]}
        </span>
        {falta > 0 && <span className="inscard__falta">−{falta}</span>}
        {ins.costo ? (
          <span className="inscard__costo">
            {formatCOP(ins.costo)}/{unidadCorta[ins.unidad]}
          </span>
        ) : (
          <span className="inscard__costo inscard__costo--falta" title="Sin costo, el margen de sus platos sale inflado">
            sin costo
          </span>
        )}
      </div>

      {!editar && <Entrada ins={ins} presets={presets} falta={falta} />}

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

/**
 * LA ENTRADA DE MERCANCÍA — un solo gesto.
 *
 * Antes había cuatro controles compitiendo por lo mismo (+1, +5, ⤴ estándar y un
 * input suelto) y NINGUNO permitía decir cuánto se pagó: el costo unitario vivía
 * enterrado en el formulario de edición, así que se quedaba viejo y el margen de
 * cada plato mentía.
 *
 * Ahora: cantidad + (opcional) lo que costó. Si pones el dinero, el costo unitario
 * se recalcula solo y el gasto entra a Finanzas por el monto exacto del recibo.
 */
function Entrada({
  ins,
  presets,
  falta,
}: {
  ins: Insumo;
  presets: number[];
  falta: number;
}) {
  const [cant, setCant] = useState("");
  const [monto, setMonto] = useState("");
  const n = Number(cant) || 0;
  const m = Number(monto) || 0;
  // Lo que va a quedar registrado, dicho antes de pulsar: sin sorpresas.
  const unitario = n > 0 && m > 0 ? Math.round(m / n) : null;

  return (
    <form action={abastecerAction} className="entrada">
      <input type="hidden" name="id" value={ins.id} />
      <div className="entrada__fila">
        <label className="entrada__campo">
          <input
            className="entrada__inp"
            type="number"
            name="cantidad"
            min={0}
            step="any"
            value={cant}
            onChange={(e) => setCant(e.target.value)}
            placeholder="0"
            aria-label={`Cantidad de ${ins.nombre} en ${unidadCorta[ins.unidad]}`}
          />
          <span className="entrada__uni">{unidadCorta[ins.unidad]}</span>
        </label>
        <label className="entrada__campo entrada__campo--money">
          <span className="entrada__cop">$</span>
          <input
            className="entrada__inp"
            type="number"
            name="monto"
            min={0}
            step={100}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="pagado"
            aria-label={`Cuánto pagaste por ${ins.nombre} (opcional)`}
          />
        </label>
        <button className="entrada__ok" type="submit" disabled={n <= 0} title="Registrar entrada">
          ↵
        </button>
      </div>

      <div className="entrada__atajos">
        {presets.map((x) => (
          <button
            key={x}
            type="button"
            className="entrada__at"
            onClick={() => setCant(String(x))}
            title={`${x} ${unidadCorta[ins.unidad]}`}
          >
            +{x}
          </button>
        ))}
        {falta > 0 && (
          <button
            type="button"
            className="entrada__at"
            onClick={() => setCant(String(falta))}
            title={`Lo que falta para el estándar: ${falta} ${unidadCorta[ins.unidad]}`}
          >
            ⤴ {falta}
          </button>
        )}
        {unitario !== null && (
          <span className="entrada__calc" aria-live="polite">
            = {formatCOP(unitario)}/{unidadCorta[ins.unidad]}
          </span>
        )}
      </div>
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
