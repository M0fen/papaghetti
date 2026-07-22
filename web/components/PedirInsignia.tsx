"use client";

/**
 * Pedir un ENREDO INSIGNIA por el mismo flujo que todo lo demás.
 *
 * Antes el único camino era WhatsApp (con un número placeholder): los platos curados
 * —los de mejor margen y los que anclan el precio— eran los únicos que no entraban al
 * cerebro. Ahora entran con `enredoId`, y el precio de carta manda: `crearPedido` lo
 * desglosa hacia atrás para que subtotal/impuesto sigan siendo comparables.
 */

import { useState, useTransition } from "react";
import {
  TIPOS,
  tipoLabel,
  tipoIcon,
  formatCOP,
  type EnredoInsignia,
  type TipoServicio,
} from "@/lib/menu";
import { faltaParaMinimo } from "@/lib/precios";
import { enviarPedido } from "@/app/pedido-actions";

export default function PedirInsignia({
  enredo,
  numMesas,
  impuestoPct,
  costoDomicilio = 0,
  pedidoMinimo = 0,
  onListo,
}: {
  enredo: EnredoInsignia;
  numMesas: number;
  impuestoPct: number;
  costoDomicilio?: number;
  pedidoMinimo?: number;
  onListo?: () => void;
}) {
  const [tipo, setTipo] = useState<TipoServicio>("domicilio");
  const [mesa, setMesa] = useState(1);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pending, start] = useTransition();
  const [ok, setOk] = useState<{ id: string; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El precio de carta es CERRADO (todo incluido); el domicilio va aparte.
  const subtotal = Math.round(enredo.precio / (1 + impuestoPct / 100));
  const domicilio = tipo === "domicilio" ? costoDomicilio : 0;
  const total = enredo.precio + domicilio;
  const falta = faltaParaMinimo(subtotal, tipo, pedidoMinimo);

  const pedir = () =>
    start(async () => {
      setError(null);
      const r = await enviarPedido({
        enredoId: enredo.id,
        // el cerebro toma los componentes del insignia; estos van por compatibilidad
        baseId: enredo.baseId,
        proteinaId: enredo.proteinaId,
        toppingIds: enredo.toppingIds,
        canal: "web",
        tipo,
        mesa: tipo === "mesa" ? mesa : undefined,
        cliente: tipo !== "mesa" ? cliente.trim() || undefined : undefined,
        telefono: tipo === "domicilio" ? telefono.trim() || undefined : undefined,
      });
      if (!r.ok) return setError(r.error);
      setOk({ id: r.id, total: r.total });
      onListo?.();
    });

  if (ok)
    return (
      <div className="insig-ok">
        <p className="insig-ok__big">¡{enredo.nombre} pedido!</p>
        <p className="insig-ok__id">#{ok.id}</p>
        <p className="insig-ok__sub">La cocina ya lo tiene · {formatCOP(ok.total)}</p>
      </div>
    );

  return (
    <div className="insig-pedir">
      <div className="insig-pedir__tipos" role="group" aria-label="Tipo de servicio">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            className={`svc__opt ${tipo === t ? "is-on" : ""}`}
            aria-pressed={tipo === t}
            onClick={() => setTipo(t)}
          >
            <span aria-hidden>{tipoIcon[t]}</span> {tipoLabel[t]}
          </button>
        ))}
      </div>

      {tipo === "mesa" ? (
        <label className="svc__field">
          <span>Mesa</span>
          <select value={mesa} onChange={(e) => setMesa(Number(e.target.value))} aria-label="Número de mesa">
            {Array.from({ length: Math.max(1, numMesas) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="svc__field">
            <span>Tu nombre</span>
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="¿A nombre de quién?"
            />
          </label>
          {tipo === "domicilio" && (
            <label className="svc__field">
              <span>WhatsApp / teléfono</span>
              <input
                type="tel"
                inputMode="numeric"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Para confirmar el domicilio"
              />
            </label>
          )}
        </>
      )}

      <div className="insig-pedir__cuentas">
        <div>
          <span>{enredo.nombre}</span>
          <span>{formatCOP(enredo.precio)}</span>
        </div>
        {domicilio > 0 && (
          <div>
            <span>Domicilio</span>
            <span>{formatCOP(domicilio)}</span>
          </div>
        )}
        <div className="insig-pedir__total">
          <span>Total</span>
          <b>{formatCOP(total)}</b>
        </div>
      </div>

      {falta > 0 && (
        <p className="ticket__aviso">
          Pedido mínimo a domicilio {formatCOP(pedidoMinimo)} · te faltan <b>{formatCOP(falta)}</b>
        </p>
      )}
      {error && <p className="ticket__error">{error}</p>}

      <button
        className="btn btn--primary"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={pedir}
        disabled={pending || falta > 0}
        type="button"
      >
        <span>{pending ? "Enviando…" : "Pedir este enredo"}</span>
      </button>
    </div>
  );
}
