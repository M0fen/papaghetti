"use client";

/**
 * TOMAR UN PEDIDO DESDE EL PANEL.
 *
 * El hueco funcional más grande del POS: `enviarPedido` no se importaba desde ningún
 * archivo de /admin, así que el panel solo sabía avanzar, cobrar, cancelar y asignar
 * mesa. Sonaba el teléfono —"un Criollazo para llevar"— y el operario no tenía botón:
 * o escaneaba el QR de una mesa haciéndose pasar por cliente, o lo apuntaba en papel.
 * Todo el canal de mostrador y teléfono quedaba fuera del cerebro: ventas sin reportar
 * e insumos sin descontar.
 *
 * El tipo ya soportaba `canal: "salon"` desde el principio y nadie lo producía.
 */

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  TIPOS,
  tipoLabel,
  tipoIcon,
  formatCOP,
  TOPPINGS_INCLUIDOS,
  type Ingrediente,
  type TipoServicio,
} from "@/lib/menu";
import { calcularTotales } from "@/lib/precios";
import { crearPedidoPanelAction } from "@/app/pedido-actions";
import IngImg from "@/components/IngImg";
import { nuevaClave } from "@/lib/idem";

/** El botón se bloquea mientras se envía: sin esto, el segundo toque son dos platos. */
function Mandar({ listo }: { listo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--primary" type="submit" disabled={!listo || pending}>
      <span>{pending ? "Mandando…" : "Mandar a cocina →"}</span>
    </button>
  );
}

export default function NuevoPedido({
  bases,
  proteinas,
  toppings,
  impuestoPct,
  costoDomicilio = 0,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  impuestoPct: number;
  costoDomicilio?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  /* Clave de idempotencia: era el ÚNICO canal sin ella. Un doble toque en el
     mostrador creaba dos platos y descontaba la despensa dos veces. Va en ESTADO,
     no en una ref: se pinta en el formulario y React 19 prohíbe leer refs durante
     el render. Se renueva al limpiar, para que el pedido siguiente sí sea otro. */
  const [idem, setIdem] = useState(nuevaClave);
  const [tipo, setTipo] = useState<TipoServicio>("llevar");
  const [baseId, setBaseId] = useState("");
  const [protIds, setProtIds] = useState<string[]>([]);
  const [topIds, setTopIds] = useState<string[]>([]);

  /** Solo lo que de verdad se puede preparar: el operario no debe poder vender humo. */
  const dispo = (l: Ingrediente[]) => l.filter((i) => i.activo !== false && !i.agotado);
  const basesD = dispo(bases);
  const protsD = dispo(proteinas);
  const topsD = dispo(toppings);

  const find = (id: string) =>
    [...bases, ...proteinas, ...toppings].find((i) => i.id === id);

  const totales = useMemo(
    () =>
      calcularTotales({
        base: find(baseId),
        proteinas: protIds.map(find),
        toppings: topIds.map(find).filter(Boolean) as Ingrediente[],
        impuestoPct,
        tipo,
        costoDomicilio,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseId, protIds, topIds, tipo, impuestoPct, costoDomicilio],
  );

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  if (!abierto) {
    return (
      <button className="btn btn--primary" type="button" onClick={() => setAbierto(true)}>
        <span>+ Nuevo pedido (mostrador / teléfono)</span>
      </button>
    );
  }

  return (
    <form
      action={crearPedidoPanelAction}
      className="npedido card"
      onSubmit={() => {
        // Deja el formulario listo para el pedido siguiente, sin arrastrar la selección.
        setTimeout(() => {
          setBaseId("");
          setProtIds([]);
          setTopIds([]);
          setIdem(nuevaClave());
        }, 400);
      }}
    >
      <input type="hidden" name="idemKey" value={idem} />
      <div className="card__h">
        <h2>Nuevo pedido</h2>
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

      <fieldset className="npedido__grupo">
        <legend>Base</legend>
        <div className="npedido__chips">
          {basesD.map((b) => (
            <label key={b.id} className={`chipbtn ${baseId === b.id ? "is-on" : ""}`}>
              <input
                type="radio"
                name="baseId"
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
          {protsD.map((p) => (
            <label key={p.id} className={`chipbtn ${protIds.includes(p.id) ? "is-on" : ""}`}>
              <input
                type="checkbox"
                name="proteinaId"
                value={p.id}
                checked={protIds.includes(p.id)}
                onChange={() => alternar(protIds, setProtIds, p.id)}
                className="visually-hidden"
              />
              <IngImg ing={p} className="chipbtn__img" /> {p.nombre} · {formatCOP(p.precio)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="npedido__grupo">
        <legend>Acompañantes · los {TOPPINGS_INCLUIDOS} más caros van por cuenta de la casa · las salsas son gratis</legend>
        <div className="npedido__chips">
          {topsD.map((t) => (
            <label key={t.id} className={`chipbtn ${topIds.includes(t.id) ? "is-on" : ""}`}>
              <input
                type="checkbox"
                name="toppingId"
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
          Subtotal {formatCOP(totales.subtotal)} · imp. {formatCOP(totales.impuesto)}
          {totales.domicilio > 0 ? ` · envío ${formatCOP(totales.domicilio)}` : ""}
          <b> = {formatCOP(totales.total)}</b>
        </span>
        <Mandar listo={Boolean(baseId) && protIds.length > 0} />
      </div>
    </form>
  );
}
