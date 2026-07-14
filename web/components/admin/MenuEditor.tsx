"use client";

import { useState } from "react";
import {
  formatCOP,
  type Catalog,
  type Ingrediente,
  type EnredoInsignia,
} from "@/lib/menu";
import {
  savePrecio,
  saveEnredo,
  resetTodo,
  crearIngredienteAction,
  eliminarIngredienteAction,
  crearEnredoAction,
  eliminarEnredoAction,
} from "@/app/admin/actions";
import ImageUpload from "./ImageUpload";

export default function MenuEditor({ catalog }: { catalog: Catalog }) {
  const [nuevoIng, setNuevoIng] = useState(false);
  const [nuevoPlato, setNuevoPlato] = useState(false);

  return (
    <>
      <div className="menu-bar">
        <button className="btn btn--primary btnmini" type="button" onClick={() => setNuevoIng((v) => !v)}>
          <span>{nuevoIng ? "Cerrar" : "＋ Nuevo ingrediente / topping"}</span>
        </button>
        <button className="btn btn--gold btnmini" type="button" onClick={() => setNuevoPlato((v) => !v)}>
          <span>{nuevoPlato ? "Cerrar" : "🍝 Nuevo plato completo"}</span>
        </button>
      </div>

      {nuevoIng && <NuevoIngrediente onDone={() => setNuevoIng(false)} />}
      {nuevoPlato && <NuevoEnredo catalog={catalog} onDone={() => setNuevoPlato(false)} />}

      <Grupo titulo="🥔 Bases" items={catalog.bases} />
      <Grupo titulo="🍗 Proteínas" items={catalog.proteinas} />
      <Grupo titulo="🌽 Toppings" items={catalog.toppings} />

      <section className="rec-group">
        <h2 className="ins-cat__title">🍝 Platos insignia <span className="ins-cat__count">{catalog.enredos.length}</span></h2>
        <div className="mcard-grid">
          {catalog.enredos.map((e) => (
            <EnredoCard key={e.id} enredo={e} catalog={catalog} />
          ))}
        </div>
      </section>

      <form action={resetTodo} style={{ marginTop: 24, textAlign: "center" }}>
        <button className="btn btn--ghost" type="submit" style={{ padding: "10px 16px" }}>
          <span>↺ Restaurar catálogo a la semilla</span>
        </button>
      </form>
    </>
  );
}

function Grupo({ titulo, items }: { titulo: string; items: Ingrediente[] }) {
  return (
    <section className="rec-group">
      <h2 className="ins-cat__title">{titulo}<span className="ins-cat__count">{items.length}</span></h2>
      <div className="mcard-grid">
        {items.map((i) => (
          <IngCard key={i.id} ing={i} />
        ))}
      </div>
    </section>
  );
}

function IngCard({ ing }: { ing: Ingrediente }) {
  return (
    <article className={`mcard ${ing.agotado ? "is-agotado" : ""}`}>
      <form action={savePrecio} className="mcard__form">
        <input type="hidden" name="id" value={ing.id} />
        <div className="mcard__media">
          <ImageUpload name="foto" value={ing.foto ?? ""} emoji={ing.emoji} />
        </div>
        <div className="mcard__body">
          <div className="mcard__row">
            <input name="emoji" defaultValue={ing.emoji} className="admin-input admin-input--emoji" aria-label="Emoji" maxLength={4} />
            <input name="nombre" defaultValue={ing.nombre} className="admin-input" aria-label="Nombre" style={{ flex: 1, minWidth: 90 }} />
          </div>
          <label className="field field--price">
            <span>Precio</span>
            <input type="number" name="precio" defaultValue={ing.precio} min={0} step={500} className="admin-input" aria-label="Precio" />
          </label>
          <div className="mcard__checks">
            <label className="admin-check">
              <input type="checkbox" name="activo" defaultChecked={ing.activo} /> en carta
            </label>
            <label className="admin-check">
              <input type="checkbox" name="agotado" defaultChecked={ing.agotado} /> agotado
            </label>
          </div>
          <div className="mcard__acts">
            <button className="btn btn--primary btnmini" type="submit"><span>Guardar</span></button>
            <button className="linkbtn linkbtn--danger" type="submit" formAction={eliminarIngredienteAction} aria-label={`Eliminar ${ing.nombre}`}>
              eliminar
            </button>
          </div>
        </div>
      </form>
    </article>
  );
}

function EnredoCard({ enredo, catalog }: { enredo: EnredoInsignia; catalog: Catalog }) {
  const base = catalog.bases.find((b) => b.id === enredo.baseId)?.nombre ?? "—";
  const prot = catalog.proteinas.find((p) => p.id === enredo.proteinaId)?.nombre ?? "—";
  return (
    <article className="mcard mcard--enredo">
      <form action={saveEnredo} className="mcard__form">
        <input type="hidden" name="id" value={enredo.id} />
        <div className="mcard__media">
          <ImageUpload name="foto" value={enredo.foto ?? ""} emoji="🍝" />
        </div>
        <div className="mcard__body">
          <input name="nombre" defaultValue={enredo.nombre} className="admin-input" aria-label="Nombre" />
          <input name="gancho" defaultValue={enredo.gancho} className="admin-input" aria-label="Gancho" placeholder="Gancho" />
          <span className="mcard__recipe">{base} · {prot}</span>
          <label className="field field--price">
            <span>Precio</span>
            <input type="number" name="precio" defaultValue={enredo.precio} min={0} step={500} className="admin-input" aria-label="Precio" />
          </label>
          <div className="mcard__acts">
            <button className="btn btn--primary btnmini" type="submit"><span>Guardar</span></button>
            <span className="muted" style={{ fontSize: "0.8rem" }}>{formatCOP(enredo.precio)}</span>
            <button className="linkbtn linkbtn--danger" type="submit" formAction={eliminarEnredoAction} aria-label={`Eliminar ${enredo.nombre}`}>
              eliminar
            </button>
          </div>
        </div>
      </form>
    </article>
  );
}

function NuevoIngrediente({ onDone }: { onDone: () => void }) {
  return (
    <form action={crearIngredienteAction} className="mnew" onSubmit={onDone}>
      <strong className="mnew__t">➕ Nuevo ingrediente</strong>
      <div className="mnew__grid">
        <ImageUpload name="foto" emoji="🍽️" />
        <div className="mnew__fields">
          <div className="mcard__row">
            <select name="categoria" className="admin-input" aria-label="Categoría" defaultValue="topping" style={{ maxWidth: 140 }}>
              <option value="base">Base</option>
              <option value="proteina">Proteína</option>
              <option value="topping">Topping</option>
            </select>
            <input name="emoji" className="admin-input admin-input--emoji" placeholder="🍕" aria-label="Emoji" maxLength={4} />
            <input name="nombre" className="admin-input" placeholder="Nombre" aria-label="Nombre" required style={{ flex: 1, minWidth: 120 }} />
          </div>
          <label className="field field--price">
            <span>Precio</span>
            <input type="number" name="precio" className="admin-input" placeholder="0" min={0} step={500} aria-label="Precio" />
          </label>
          <button className="btn btn--primary btnmini" type="submit"><span>Crear ingrediente</span></button>
        </div>
      </div>
    </form>
  );
}

function NuevoEnredo({ catalog, onDone }: { catalog: Catalog; onDone: () => void }) {
  const [tops, setTops] = useState<string[]>([]);
  const toggle = (id: string) =>
    setTops((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form action={crearEnredoAction} className="mnew mnew--plato" onSubmit={onDone}>
      <strong className="mnew__t">🍝 Nuevo plato completo</strong>
      <input type="hidden" name="toppingIds" value={tops.join(",")} />
      <div className="mnew__grid">
        <ImageUpload name="foto" emoji="🍝" />
        <div className="mnew__fields">
          <div className="mcard__row">
            <input name="nombre" className="admin-input" placeholder="Nombre del plato" aria-label="Nombre" required style={{ flex: 1, minWidth: 140 }} />
            <label className="field field--price">
              <span>Precio</span>
              <input type="number" name="precio" className="admin-input" placeholder="0" min={0} step={500} aria-label="Precio" />
            </label>
          </div>
          <input name="gancho" className="admin-input" placeholder="Gancho (ej: El Eje Cafetero en un bowl)" aria-label="Gancho" />
          <div className="mcard__row">
            <select name="baseId" className="admin-input" aria-label="Base" required>
              <option value="">Base…</option>
              {catalog.bases.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
            <select name="proteinaId" className="admin-input" aria-label="Proteína" required>
              <option value="">Proteína…</option>
              {catalog.proteinas.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <span className="mnew__lbl">Toppings incluidos:</span>
          <div className="chips">
            {catalog.toppings.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`chipbtn ${tops.includes(t.id) ? "is-on" : ""}`}
                aria-pressed={tops.includes(t.id)}
                onClick={() => toggle(t.id)}
              >
                {t.emoji} {t.nombre}
              </button>
            ))}
          </div>
          <button className="btn btn--primary btnmini" type="submit" style={{ marginTop: 10 }}>
            <span>Crear plato</span>
          </button>
        </div>
      </div>
    </form>
  );
}
