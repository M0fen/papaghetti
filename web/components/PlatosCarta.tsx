"use client";

/**
 * LA CARTA DE PLATOS LISTOS, dentro del menú del QR.
 *
 * Por el QR solo se podía armar una caja: los 12 platos de precio cerrado —combos,
 * ensaladas, a la carta y especiales, entre $28.400 y $60.000, o sea los tickets más
 * altos del negocio— no existían para el cliente. Esta hoja los pone a un toque.
 *
 * No toca el canvas: es una capa DOM encima del juego. El pedido sale por el mismo
 * `enviarPedido` con `enredoId`, que el servidor ya sabe cobrar a precio cerrado.
 */

import { useMemo, useRef, useState } from "react";
import {
  formatCOP,
  grupoPlatoLabel,
  GRUPOS_PLATO,
  type EnredoInsignia,
  type GrupoPlato,
  type Ingrediente,
} from "@/lib/menu";
import { nuevaClave } from "@/lib/idem";
import { enviarPedido } from "@/app/pedido-actions";

export default function PlatosCarta({
  platos,
  ingredientes,
  abierto,
  referenciaInicial,
  onCerrar,
  onPedido,
}: {
  platos: EnredoInsignia[];
  ingredientes: Ingrediente[];
  abierto: boolean;
  referenciaInicial: string;
  onCerrar: () => void;
  onPedido: (id: string, total: number) => void;
}) {
  const [sel, setSel] = useState<EnredoInsignia | null>(null);
  const [referencia, setReferencia] = useState(referenciaInicial);
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idem = useRef("");

  const ix = useMemo(() => new Map(ingredientes.map((i) => [i.id, i])), [ingredientes]);
  /** Un combo con un ingrediente caído no se puede preparar; los platos de cocina sí. */
  const falta = (e: EnredoInsignia) =>
    [e.baseId, e.proteinaId, ...e.toppingIds]
      .filter(Boolean)
      .some((id) => {
        const g = ix.get(id);
        return !g || g.agotado || g.activo === false;
      });

  const porGrupo = GRUPOS_PLATO.map((g) => ({
    g,
    items: platos.filter((p) => (p.grupo ?? "combo") === g && p.activo !== false),
  })).filter((x) => x.items.length > 0);

  const pedir = async () => {
    if (!sel || enviando) return;
    setEnviando(true);
    setError(null);
    if (!idem.current) idem.current = nuevaClave();
    const r = await enviarPedido({
      enredoId: sel.id,
      baseId: sel.baseId,
      proteinaId: sel.proteinaId,
      toppingIds: sel.toppingIds,
      canal: "qr",
      tipo: "mesa",
      referencia: referencia.trim() || undefined,
      notas: notas.trim() || undefined,
      idemKey: idem.current,
    });
    if (!r.ok) {
      setError(r.error);
      setEnviando(false);
      return;
    }
    onPedido(r.id, r.total);
  };

  return (
    <div className="pcarta" role="dialog" aria-modal="true" aria-label="Platos listos">
      <div className="pcarta__panel">
        <header className="pcarta__h">
          <div>
            <p className="pcarta__k">SIN ARMAR NADA</p>
            <h2>Platos listos</h2>
          </div>
          <button type="button" className="pcarta__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        {!sel ? (
          <div className="pcarta__scroll">
            {porGrupo.map(({ g, items }) => (
              <section key={g} className="pcarta__grupo">
                <h3>{grupoPlatoLabel[g as GrupoPlato]}</h3>
                <ul>
                  {items.map((p) => {
                    const no = falta(p);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`pcarta__item ${no ? "is-no" : ""}`}
                          disabled={no}
                          onClick={() => setSel(p)}
                        >
                          <span className="pcarta__txt">
                            <b>{p.nombre}</b>
                            <em>{no ? "Hoy no disponible" : p.gancho}</em>
                          </span>
                          <span className="pcarta__precio">{formatCOP(p.precio)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="pcarta__conf">
            <button type="button" className="pcarta__volver" onClick={() => setSel(null)}>
              ← Ver todos
            </button>
            <h3 className="pcarta__nom">{sel.nombre}</h3>
            <p className="pcarta__gancho">{sel.gancho}</p>

            <label className="pcarta__campo">
              <span>¿Dónde te encontramos?</span>
              <input
                type="text"
                value={referencia}
                maxLength={60}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Mesa del ventanal, barra…"
              />
            </label>
            <label className="pcarta__campo">
              <span>Algo que debamos saber</span>
              <input
                type="text"
                value={notas}
                maxLength={140}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Sin cebolla, alergias… (opcional)"
              />
            </label>

            <div className="pcarta__total">
              <span>Total</span>
              <b>{formatCOP(sel.precio)}</b>
            </div>
            {error && (
              <p className="pcarta__error" role="alert">
                {error}
              </p>
            )}
            {!abierto && <p className="pcarta__error">Ahora mismo estamos cerrados.</p>}
            <button
              type="button"
              className="pcarta__cta"
              onClick={pedir}
              disabled={enviando || !abierto}
            >
              {enviando ? "Enviando…" : "Pedir a cocina →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
