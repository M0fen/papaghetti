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
  type AdicionalConfig,
  type EnredoInsignia,
  type GrupoPlato,
  type Ingrediente,
  type TipoServicio,
} from "@/lib/menu";
import { sinImpuesto } from "@/lib/precios";
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
  /** Precio unitario tal como lo paga el cliente (impuesto incluido), igual que la carta. */
  precio: number;
  /** Un concepto que no es plato ("Limonada de coco", "Almuerzos"). */
  adicional?: boolean;
  /** Si el adicional se prepara en cocina. */
  cocina?: boolean;
};

const soloDigitos = (s: string) => s.replace(/\D/g, "");
/** "50000" → "50.000" mientras se escribe: un cero de más se ve antes de mandar. */
const conPuntos = (s: string) => {
  const d = soloDigitos(s).slice(0, 9);
  return d ? Number(d).toLocaleString("es-CO") : "";
};

/** El botón se bloquea mientras se envía: sin esto, el segundo toque son dos comandas. */
function Mandar({ listo, platos, aCocina }: { listo: boolean; platos: number; aCocina: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--primary" type="submit" disabled={!listo || pending}>
      <span>
        {pending
          ? "Mandando…"
          : aCocina
            ? `Mandar a cocina${platos > 1 ? ` · ${platos} platos` : ""} →`
            : "Registrar la cuenta →"}
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
  adicionales = [],
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  platos: EnredoInsignia[];
  impuestoPct: number;
  costoDomicilio?: number;
  /** Los adicionales de un toque, configurados en Precios. */
  adicionales?: AdicionalConfig[];
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
  const [verExtras, setVerExtras] = useState(false);
  // El adicional escrito a mano: "Almuerzos · 50.000".
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [aCocinaExtra, setACocinaExtra] = useState(false);

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
    // Solo la base es obligatoria: un plato sin proteína también se vende.
    if (!baseId) return;
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
    /* El plato tiene precio de carta CERRADO y la carta ya trae el impuesto: lo que
       dice el botón es lo que suma la comanda. */
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
        precio: e.precio,
      },
    ]);
    setVerPlatos(false);
  };

  /** Un adicional: el mismo concepto al mismo precio suma cantidad, no otro renglón. */
  const agregarAdicional = (nombre: string, precio: number, cocina: boolean) => {
    const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!limpio || !(precio > 0)) return;
    setRenglones((r) => {
      const igual = r.find(
        (x) =>
          x.adicional &&
          x.nombre.toLowerCase() === limpio.toLowerCase() &&
          x.precio === precio &&
          Boolean(x.cocina) === cocina,
      );
      if (igual) return r.map((x) => (x === igual ? { ...x, cantidad: x.cantidad + 1 } : x));
      return [
        ...r,
        {
          key: `${Date.now()}-${r.length}`,
          proteinaIds: [],
          toppingIds: [],
          cantidad: 1,
          nombre: limpio,
          detalle: "",
          precio,
          adicional: true,
          cocina: cocina || undefined,
        },
      ];
    });
  };

  const agregarEscrito = () => {
    agregarAdicional(concepto, Number(soloDigitos(valor)), aCocinaExtra);
    setConcepto("");
    setValor("");
    setACocinaExtra(false);
  };

  const cambiarCantidad = (key: string, d: number) =>
    setRenglones((r) =>
      r
        .map((x) => (x.key === key ? { ...x, cantidad: Math.max(0, x.cantidad + d) } : x))
        .filter((x) => x.cantidad > 0),
    );

  /* Precio visto = precio pagado: la comanda suma lo que dice la carta y el impuesto se
     informa como "incluido" (la misma cuenta que hará el servidor, lib/precios). */
  const bruto = renglones.reduce((s, r) => s + r.precio * r.cantidad, 0);
  const impuesto = bruto - sinImpuesto(bruto, impuestoPct);
  const domicilio = tipo === "domicilio" ? costoDomicilio : 0;
  const total = bruto + domicilio;
  const platosTotal = renglones.filter((r) => !r.adicional).reduce((s, r) => s + r.cantidad, 0);
  const aCocina = renglones.some((r) => !r.adicional || r.cocina);
  const extrasGuardados = adicionales.filter((a) => a.activo !== false);

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  /** Sin bases no se puede armar nada (sin proteínas sí: el plato puede ir sin). */
  const sinNada = basesD.length === 0;

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
          setConcepto("");
          setValor("");
          setVerExtras(false);
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
          renglones
            .filter((r) => !r.adicional)
            .map((r) => ({
              enredoId: r.enredoId,
              baseId: r.baseId,
              proteinaIds: r.proteinaIds,
              toppingIds: r.toppingIds,
              cantidad: r.cantidad,
            })),
        )}
      />
      <input
        type="hidden"
        name="adicionales"
        value={JSON.stringify(
          renglones
            .filter((r) => r.adicional)
            .map((r) => ({ nombre: r.nombre, precio: r.precio, cantidad: r.cantidad, cocina: r.cocina })),
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
          <span className="comanda__botones">
            <button type="button" className="comanda__add" onClick={() => setVerPlatos((v) => !v)}>
              {verPlatos ? "Cerrar la carta" : "+ Plato de la carta"}
            </button>
            <button type="button" className="comanda__add" onClick={() => setVerExtras((v) => !v)}>
              {verExtras ? "Cerrar adicionales" : "+ Adicional"}
            </button>
          </span>
        </div>

        {/* ADICIONALES: lo que se cobra y no es plato. Los guardados en Precios son un
            toque; lo demás se escribe con su valor ("Almuerzos · 50.000"). */}
        {verExtras && (
          <div className="comanda__extras">
            {extrasGuardados.length > 0 && (
              <div className="npedido__chips">
                {extrasGuardados.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className="chipbtn"
                    onClick={() => agregarAdicional(a.nombre, a.precio, Boolean(a.cocina))}
                  >
                    {a.nombre} · {formatCOP(a.precio)}
                  </button>
                ))}
              </div>
            )}
            <div className="adic__escrito">
              <input
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                maxLength={60}
                placeholder="Concepto · ej. Almuerzos"
                aria-label="Concepto del adicional"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    agregarEscrito();
                  }
                }}
              />
              <label className="prq__precio">
                <span aria-hidden>$</span>
                <input
                  inputMode="numeric"
                  value={valor}
                  onChange={(e) => setValor(conPuntos(e.target.value))}
                  placeholder="50.000"
                  aria-label="Valor del adicional"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      agregarEscrito();
                    }
                  }}
                />
              </label>
              <label className="adic__check">
                <input
                  type="checkbox"
                  checked={aCocinaExtra}
                  onChange={(e) => setACocinaExtra(e.target.checked)}
                />
                A cocina
              </label>
              <button
                type="button"
                className="btn btn--gold btnmini"
                onClick={agregarEscrito}
                disabled={!concepto.trim() || !(Number(soloDigitos(valor)) > 0)}
              >
                <span>+ Sumar</span>
              </button>
            </div>
            {extrasGuardados.length === 0 && (
              <p className="adic__vacio">
                Para tener botones de un toque, guárdalos en <a href="/admin/precios#adicionales">Precios</a>.
              </p>
            )}
          </div>
        )}

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
            Todavía no hay nada. Agrega un plato de la carta, un adicional o arma una caja abajo.
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
                  <b>
                    {r.nombre}
                    {r.adicional && <i className="adic__tag">adicional</i>}
                  </b>
                  {r.detalle && <em>{r.detalle}</em>}
                </span>
                <span className="comanda__precio">{formatCOP(r.precio * r.cantidad)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- EL ARMADOR de una caja, renglón a renglón ---------- */}
      {/* SIN DESPENSA NO HAY NADA QUE ELEGIR, y callárselo es peor que el problema:
          el mesero abría "Nueva comanda", veía tres títulos con cero opciones debajo
          y no tenía forma de saber por qué solo le dejaba pedir platos de carta.
          Aquí se dice qué pasa y las dos salidas que hay. */}
      {sinNada && (
        <div className="npedido__vacio" role="status">
          <b>No hay ingredientes disponibles para armar</b>
          <p>
            Todos los componentes están agotados porque la despensa está en cero. Los
            platos de carta sí se pueden pedir (tienen precio cerrado y no gastan
            despensa).
          </p>
          <p>
            <a href="/admin/inventario">Cargar la despensa →</a>
            {"  ·  "}
            <a href="/admin/ajustes">Vender sin controlar inventario →</a>
          </p>
        </div>
      )}
      <fieldset className="npedido__grupo">
        <legend>Base</legend>
        <div className="npedido__chips">
          {basesD.length === 0 && <em className="npedido__nada">Ninguna disponible hoy</em>}
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
        <legend>Proteínas · las que quieras, o ninguna</legend>
        <div className="npedido__chips">
          {protsD.length === 0 && <em className="npedido__nada">Ninguna disponible hoy</em>}
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
          {topsD.length === 0 && <em className="npedido__nada">Ninguno disponible hoy</em>}
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
        disabled={!baseId}
      >
        <span>
          + Agregar esta caja a la comanda
          {baseId ? ` · ${formatCOP(precioArmado(baseId, protIds, topIds))}` : ""}
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
          {domicilio > 0 ? `Comida ${formatCOP(bruto)} · envío ${formatCOP(domicilio)} · ` : ""}
          <b>Total {formatCOP(total)}</b>
          {impuesto > 0 && <small className="npedido__incl">incluye imp. {formatCOP(impuesto)}</small>}
        </span>
        <Mandar listo={renglones.length > 0} platos={platosTotal} aCocina={aCocina} />
      </div>
    </form>
  );
}
