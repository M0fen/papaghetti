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

export default function NuevoPedido({
  bases,
  proteinas,
  toppings,
  numMesas,
  impuestoPct,
  costoDomicilio = 0,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  numMesas: number;
  impuestoPct: number;
  costoDomicilio?: number;
}) {
  const [abierto, setAbierto] = useState(false);
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
    <form action={crearPedidoPanelAction} className="npedido card">
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
        <label className="svc__field">
          <span>Mesa</span>
          <select name="mesa" defaultValue={1}>
            {Array.from({ length: Math.max(1, numMesas) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
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
              {b.emoji} {b.nombre} · {formatCOP(b.precio)}
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
              {p.emoji} {p.nombre} · {formatCOP(p.precio)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="npedido__grupo">
        <legend>Toppings · los primeros {TOPPINGS_INCLUIDOS} van por cuenta de la casa</legend>
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
              {t.emoji} {t.nombre}
              {t.precio > 0 ? ` · ${formatCOP(t.precio)}` : ""}
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
        <button
          className="btn btn--primary"
          type="submit"
          disabled={!baseId || protIds.length === 0}
        >
          <span>Mandar a cocina →</span>
        </button>
      </div>
    </form>
  );
}
