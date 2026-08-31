"use client";

/**
 * TOMAR UNA COMANDA DESDE EL PANEL.
 *
 * El hueco funcional más grande del POS: `enviarPedido` no se importaba desde ningún
 * archivo de /admin, así que el panel solo sabía avanzar, cobrar, cancelar y asignar
 * mesa. Sonaba el teléfono —"un Criollazo para llevar"— y el operario no tenía botón:
 * o escaneaba el QR de una mesa haciéndose pasar por cliente, o lo apuntaba en papel.
 *
 * Y cuando lo tuvo, seguían faltando dos cosas grandes:
 *
 *  · UN PEDIDO ERA UN PLATO. Una mesa de cuatro eran cuatro pedidos, cuatro comandas
 *    y cuatro papeles. Ahora se agregan renglones a una comanda y se manda una vez.
 *  · NO SE PODÍAN VENDER LOS PLATOS DE CARTA. El formulario solo sabía armar cajas,
 *    así que un churrasco de $52.000 —el ticket más alto del negocio— no se podía
 *    cobrar desde el mostrador ni por teléfono. Media carta era invendible.
 */

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  TIPOS,
  tipoLabel,
  tipoIcon,
  formatCOP,
  grupoPlatoLabel,
  GRUPOS_PLATO,
  type EnredoInsignia,
  type GrupoPlato,
  type Ingrediente,
  type TipoServicio,
} from "@/lib/menu";
import { desglosarPrecioFinal } from "@/lib/precios";
import { crearComandaPanelAction } from "@/app/pedido-actions";
import IngImg from "@/components/IngImg";
import PlatoImg from "@/components/PlatoImg";
import { nuevaClave } from "@/lib/idem";

/** Un renglón ya puesto en la comanda, con lo que hace falta para pintarlo. */
type Renglon = {
  key: string;
  enredoId?: string;
  baseId?: string;
  proteinaIds: string[];
  toppingIds: string[];
  cantidad: number;
  nombre: string;
  detalle: string;
  /** Precio unitario SIN impuesto — el mismo que calculará el servidor. */
  precio: number;
};

/** El botón se bloquea mientras se envía: sin esto, el segundo toque son dos comandas. */
function Mandar({ listo, platos }: { listo: boolean; platos: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--primary" type="submit" disabled={!listo || pending}>
      <span>
        {pending ? "Mandando…" : `Mandar a cocina${platos > 1 ? ` · ${platos} platos` : ""} →`}
      </span>
    </button>
  );
}

export default function NuevoPedido({
  bases,
  proteinas,
  toppings,
  platos,
  impuestoPct,
  costoDomicilio = 0,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  platos: EnredoInsignia[];
  impuestoPct: number;
  costoDomicilio?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  /* Clave de idempotencia: era el ÚNICO canal sin ella. Un doble toque en el
     mostrador creaba dos comandas y descontaba la despensa dos veces. Va en ESTADO,
     no en una ref: se pinta en el formulario y React 19 prohíbe leer refs durante
     el render. Se renueva al limpiar, para que la comanda siguiente sí sea otra. */
  const [idem, setIdem] = useState(nuevaClave);
  const [tipo, setTipo] = useState<TipoServicio>("llevar");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  // El armador de UN renglón, que se vacía cada vez que se agrega a la comanda.
  const [baseId, setBaseId] = useState("");
  const [protIds, setProtIds] = useState<string[]>([]);
  const [topIds, setTopIds] = useState<string[]>([]);
  const [verPlatos, setVerPlatos] = useState(false);

  /** Solo lo que de verdad se puede preparar: el operario no debe poder vender humo. */
  const dispo = (l: Ingrediente[]) => l.filter((i) => i.activo !== false && !i.agotado);
  const basesD = dispo(bases);
  const protsD = dispo(proteinas);
  const topsD = dispo(toppings);
  const platosD = platos.filter((e) => e.activo !== false);

  const todos = useMemo(() => [...bases, ...proteinas, ...toppings], [bases, proteinas, toppings]);
  const find = (id: string) => todos.find((i) => i.id === id);

  /* El precio unitario del renglón que se está armando. Es el MISMO cálculo del
     servidor (lib/precios): las salsas valen $0 y cada acompañante se cobra. */
  const precioArmado = (b: string, ps: string[], ts: string[]) =>
    (find(b)?.precio ?? 0) +
    ps.reduce((s, id) => s + (find(id)?.precio ?? 0), 0) +
    ts.reduce((s, id) => {
      const i = find(id);
      return s + (i && i.categoria !== "salsa" ? i.precio : 0);
    }, 0);

  const agregarArmado = () => {
    if (!baseId || protIds.length === 0) return;
    const b = find(baseId);
    const ps = protIds.map(find).filter(Boolean) as Ingrediente[];
    const ts = topIds.map(find).filter(Boolean) as Ingrediente[];
    setRenglones((r) => [
      ...r,
      {
        key: `${Date.now()}-${r.length}`,
        baseId,
        proteinaIds: protIds,
        toppingIds: topIds,
        cantidad: 1,
        nombre: b?.nombre ?? "—",
        detalle: [
          ps.length ? `con ${ps.map((p) => p.nombre).join(" + ")}` : "",
          ts.length ? `+ ${ts.map((t) => t.nombre).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        precio: precioArmado(baseId, protIds, topIds),
      },
    ]);
    setBaseId("");
    setProtIds([]);
    setTopIds([]);
  };

  const agregarPlato = (e: EnredoInsignia) => {
    /* El plato tiene precio de carta CERRADO (impuesto incluido). Se desglosa hacia
       atrás con la misma función del servidor para que el total que ve el operario
       mientras arma sea exactamente el que se va a cobrar. */
    const { subtotal } = desglosarPrecioFinal(e.precio, impuestoPct);
    setRenglones((r) => [
      ...r,
      {
        key: `${Date.now()}-${r.length}`,
        enredoId: e.id,
        proteinaIds: [],
        toppingIds: [],
        cantidad: 1,
        nombre: e.nombre,
        detalle: e.gancho ?? "",
        precio: subtotal,
      },
    ]);
    setVerPlatos(false);
  };

  const cambiarCantidad = (key: string, d: number) =>
    setRenglones((r) =>
      r
        .map((x) => (x.key === key ? { ...x, cantidad: Math.max(0, x.cantidad + d) } : x))
        .filter((x) => x.cantidad > 0),
    );

  const subtotal = renglones.reduce((s, r) => s + r.precio * r.cantidad, 0);
  const impuesto = Math.round((subtotal * impuestoPct) / 100);
  const domicilio = tipo === "domicilio" ? costoDomicilio : 0;
  const total = subtotal + impuesto + domicilio;
  const platosTotal = renglones.reduce((s, r) => s + r.cantidad, 0);

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const porGrupo = GRUPOS_PLATO.map((g) => ({
    g,
    items: platosD.filter((e) => (e.grupo ?? "combo") === g),
  })).filter((x) => x.items.length);

  if (!abierto) {
    return (
      <button className="btn btn--primary" type="button" onClick={() => setAbierto(true)}>
        <span>+ Nueva comanda (mostrador / teléfono)</span>
      </button>
    );
  }

  return (
    <form
      action={crearComandaPanelAction}
      className="npedido card"
      onSubmit={() => {
        // Deja el formulario listo para la comanda siguiente, sin arrastrar nada.
        setTimeout(() => {
          setRenglones([]);
          setBaseId("");
          setProtIds([]);
          setTopIds([]);
          setIdem(nuevaClave());
        }, 400);
      }}
    >
      <input type="hidden" name="idemKey" value={idem} />
      {/* Los renglones viajan como JSON: un renglón es una estructura (plato o caja
          con sus toppings) y repartirla en campos planos hacía imposible saber qué
          topping era de qué plato en cuanto había dos. */}
      <input
        type="hidden"
        name="lineas"
        value={JSON.stringify(
          renglones.map((r) => ({
            enredoId: r.enredoId,
            baseId: r.baseId,
            proteinaIds: r.proteinaIds,
            toppingIds: r.toppingIds,
            cantidad: r.cantidad,
          })),
        )}
      />
      <div className="card__h">
        <h2>Nueva comanda</h2>
        <button type="button" className="btnmini btn btn--ghost" onClick={() => setAbierto(false)}>
          <span>Cerrar</span>
        </button>
      </div>

      <div className="npedido__tipos" role="group" aria-label="Tipo de servicio">
        {/* Clase propia: `.svc__opt` pinta en crema porque vive en la sección oscura
            del sitio público — en el panel, que es claro, quedaba invisible. */}
        {TIPOS.map((t) => (
          <label key={t} className={`npedido__tipo ${tipo === t ? "is-on" : ""}`}>
            <input
              type="radio"
              name="tipo"
              value={t}
              checked={tipo === t}
              onChange={() => setTipo(t)}
              className="visually-hidden"
            />
            <span aria-hidden>{tipoIcon[t]}</span> {tipoLabel[t]}
          </label>
        ))}
      </div>

      {tipo === "mesa" && (
        /* Aquí las mesas NO se asignan: un número era una ficción que nadie mantenía.
           Lo que el mesero necesita es saber a quién llevarle el plato. */
        <label className="svc__field">
          <span>¿Dónde está el cliente?</span>
          <input
            type="text"
            name="referencia"
            maxLength={60}
            placeholder="Mesa del ventanal, barra, camisa azul…"
          />
        </label>
      )}

      {/* ---------- LA COMANDA: lo que ya lleva pedido ---------- */}
      <div className="comanda">
        <div className="comanda__h">
          <b>La comanda</b>
          <button type="button" className="comanda__add" onClick={() => setVerPlatos((v) => !v)}>
            {verPlatos ? "Cerrar la carta" : "+ Plato de la carta"}
          </button>
        </div>

        {verPlatos && (
          <div className="comanda__carta">
            {porGrupo.map(({ g, items }) => (
              <section key={g}>
                <h4>{grupoPlatoLabel[g as GrupoPlato]}</h4>
                <div className="comanda__platos">
                  {items.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      className="comanda__plato"
                      onClick={() => agregarPlato(e)}
                    >
                      <PlatoImg enredo={e} className="comanda__platoart" />
                      <span>
                        <b>{e.nombre}</b>
                        <em>{formatCOP(e.precio)}</em>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {renglones.length === 0 ? (
          <p className="comanda__vacia">
            Todavía no hay nada. Agrega un plato de la carta o arma una caja abajo.
          </p>
        ) : (
          <ul className="comanda__lista">
            {renglones.map((r) => (
              <li key={r.key} className="comanda__ren">
                <span className="comanda__cant">
                  <button type="button" onClick={() => cambiarCantidad(r.key, -1)} aria-label="Uno menos">
                    −
                  </button>
                  <b>{r.cantidad}</b>
                  <button type="button" onClick={() => cambiarCantidad(r.key, +1)} aria-label="Uno más">
                    +
                  </button>
                </span>
                <span className="comanda__txt">
                  <b>{r.nombre}</b>
                  {r.detalle && <em>{r.detalle}</em>}
                </span>
                <span className="comanda__precio">{formatCOP(r.precio * r.cantidad)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- EL ARMADOR de una caja, renglón a renglón ---------- */}
      <fieldset className="npedido__grupo">
        <legend>Base</legend>
        <div className="npedido__chips">
          {basesD.map((b) => (
            <label key={b.id} className={`chipbtn ${baseId === b.id ? "is-on" : ""}`}>
              <input
                type="radio"
                name="_baseId"
                value={b.id}
                checked={baseId === b.id}
                onChange={() => setBaseId(b.id)}
                className="visually-hidden"
              />
              <IngImg ing={b} className="chipbtn__img" /> {b.nombre} · {formatCOP(b.precio)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="npedido__grupo">
        <legend>Proteína (una o varias)</legend>
        <div className="npedido__chips">
          {protsD.map((pr) => (
            <label key={pr.id} className={`chipbtn ${protIds.includes(pr.id) ? "is-on" : ""}`}>
              <input
                type="checkbox"
                name="_proteinaId"
                value={pr.id}
                checked={protIds.includes(pr.id)}
                onChange={() => alternar(protIds, setProtIds, pr.id)}
                className="visually-hidden"
              />
              <IngImg ing={pr} className="chipbtn__img" /> {pr.nombre} · {formatCOP(pr.precio)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="npedido__grupo">
        <legend>Acompañantes · cada uno se cobra a su precio · las salsas van con el plato</legend>
        <div className="npedido__chips">
          {topsD.map((t) => (
            <label key={t.id} className={`chipbtn ${topIds.includes(t.id) ? "is-on" : ""}`}>
              <input
                type="checkbox"
                name="_toppingId"
                value={t.id}
                checked={topIds.includes(t.id)}
                onChange={() => alternar(topIds, setTopIds, t.id)}
                className="visually-hidden"
              />
              <IngImg ing={t} className="chipbtn__img" /> {t.nombre}
              {t.categoria === "salsa" ? " · incluida" : t.precio > 0 ? ` · ${formatCOP(t.precio)}` : ""}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        className="btn btn--gold comanda__sumar"
        onClick={agregarArmado}
        disabled={!baseId || protIds.length === 0}
      >
        <span>
          + Agregar esta caja a la comanda
          {baseId && protIds.length ? ` · ${formatCOP(precioArmado(baseId, protIds, topIds))}` : ""}
        </span>
      </button>

      <div className="npedido__datos">
        <label className="svc__field">
          <span>Nombre</span>
          <input type="text" name="cliente" placeholder="¿A nombre de quién?" />
        </label>
        <label className="svc__field">
          <span>Teléfono</span>
          <input type="tel" name="telefono" inputMode="numeric" placeholder="WhatsApp" />
        </label>
        {tipo === "domicilio" && (
          <label className="svc__field">
            <span>Dirección</span>
            <input type="text" name="direccion" placeholder="Calle, barrio y referencia" required />
          </label>
        )}
        <label className="svc__field">
          <span>Notas para la cocina</span>
          <input type="text" name="notas" maxLength={140} placeholder="Sin cebolla, alergias…" />
        </label>
      </div>

      <div className="npedido__pie">
        <span>
          Subtotal {formatCOP(subtotal)} · imp. {formatCOP(impuesto)}
          {domicilio > 0 ? ` · envío ${formatCOP(domicilio)}` : ""}
          <b> = {formatCOP(total)}</b>
        </span>
        <Mandar listo={renglones.length > 0} platos={platosTotal} />
      </div>
    </form>
  );
}
