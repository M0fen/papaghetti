"use client";

/**
 * EL SALÓN — quién está comiendo y quién debe.
 *
 * Antes era una cuadrícula de mesas numeradas. Aquí las mesas NO se asignan: el
 * número era una ficción que nadie mantenía. Lo que de verdad hace falta es ver los
 * pedidos que están en el local AHORA, agrupados por dónde está la gente ("mesa del
 * ventanal", "barra", "Juan"), y poder cobrarlos de un gesto.
 *
 * Una cuenta sigue abierta hasta que se COBRA, aunque el plato ya se haya entregado.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  estadoLabel,
  formatCOP,
  METODOS,
  metodoLabel,
  metodoEmoji,
  type Pedido,
} from "@/lib/menu";
import { cobrarMesaAction, asignarReferenciaAction } from "@/app/pedido-actions";

const SIN = "Sin ubicar";

export default function TablesBoard({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [router]);

  /* En el local y sin cerrar: la cuenta sigue viva hasta que se cobra, aunque el
     plato ya se haya entregado (si no, la mesa se "liberaba" con el cliente sentado). */
  const enLocal = pedidos.filter(
    (p) =>
      p.tipo === "mesa" &&
      p.estado !== "cancelado" &&
      (p.estado !== "entregado" || p.pago === "pendiente"),
  );

  // Agrupado por dónde está la gente, con los que nadie ubicó al final.
  const grupos = new Map<string, Pedido[]>();
  for (const p of enLocal) {
    const k = p.referencia?.trim() || SIN;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  const lista = [...grupos.entries()].sort((a, b) =>
    a[0] === SIN ? 1 : b[0] === SIN ? -1 : a[0].localeCompare(b[0]),
  );

  const consumo = enLocal.reduce((s, p) => s + p.total, 0);
  const porCobrarTotal = enLocal
    .filter((p) => p.pago === "pendiente")
    .reduce((s, p) => s + p.total, 0);

  return (
    <>
      <div className="salon-kpis">
        <div className="salon-kpi">
          <b>{lista.length}</b>
          <span>Cuentas abiertas</span>
        </div>
        <div className="salon-kpi">
          <b>{enLocal.length}</b>
          <span>Platos en el salón</span>
        </div>
        <div className="salon-kpi salon-kpi--accent">
          <b>{formatCOP(consumo)}</b>
          <span>Consumo en salón</span>
        </div>
        <div className={`salon-kpi ${porCobrarTotal > 0 ? "salon-kpi--warn" : ""}`}>
          <b>{formatCOP(porCobrarTotal)}</b>
          <span>Por cobrar</span>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="card salon-vacio">
          <p>
            <b>El salón está vacío.</b>
          </p>
          <p className="muted">
            Los pedidos para comer aquí aparecen agrupados por dónde está el cliente. La
            ubicación se escribe al tomar el pedido, o aquí mismo con “¿Dónde está?”.
          </p>
          <a href="/admin/pedidos" className="btn btn--primary btnmini">
            <span>Tomar un pedido →</span>
          </a>
        </div>
      ) : (
        <div className="salon">
          {lista.map(([donde, ps]) => {
            const total = ps.reduce((s, p) => s + p.total, 0);
            const debe = ps.filter((p) => p.pago === "pendiente").reduce((s, p) => s + p.total, 0);
            const desde = ps
              .map((p) => p.creadoEn)
              .sort()[0];
            const hayListo = ps.some((p) => p.estado === "listo");
            return (
              <article
                key={donde}
                className={`cuenta ${hayListo ? "is-listo" : ""} ${donde === SIN ? "is-sin" : ""}`}
              >
                <header className="cuenta__h">
                  <b className="cuenta__donde">{donde}</b>
                  <span className="cuenta__time" suppressHydrationWarning>
                    ⏱ {hace(desde)}
                  </span>
                </header>

                <ul className="cuenta__lista">
                  {ps.map((p) => (
                    <li key={p.id}>
                      <span className={`dot dot--${p.estado}`} aria-hidden />
                      <span className="cuenta__plato">
                        <b>#{p.consecutivo ?? p.id}</b> {p.base}
                        {p.proteina && p.proteina !== "—" ? ` · ${p.proteina}` : ""}
                      </span>
                      <span className={`badge badge--${p.estado}`}>{estadoLabel[p.estado]}</span>
                    </li>
                  ))}
                </ul>

                {/* Ubicar un pedido que entró sin referencia (típico del QR). */}
                {donde === SIN && (
                  <form action={asignarReferenciaAction} className="cuenta__ubicar">
                    <input type="hidden" name="id" value={ps[0].id} />
                    <input
                      type="text"
                      name="referencia"
                      maxLength={60}
                      placeholder={`¿Dónde está el #${ps[0].consecutivo ?? ps[0].id}?`}
                      aria-label="Dónde está el cliente"
                      required
                    />
                    <button className="btn btn--ghost btnmini" type="submit">
                      <span>Ubicar</span>
                    </button>
                  </form>
                )}

                <div className="cuenta__pie">
                  <span>
                    Consumo <b>{formatCOP(total)}</b>
                  </span>
                  <span className={`badge ${debe > 0 ? "badge--warn" : "badge--ok"}`}>
                    {debe > 0 ? `Debe ${formatCOP(debe)}` : "Todo pagado"}
                  </span>
                </div>

                {debe > 0 && donde !== SIN && (
                  <form action={cobrarMesaAction} className="tbl__cobrar-form">
                    <input type="hidden" name="referencia" value={donde} />
                    <select name="metodo" aria-label={`Método de pago de ${donde}`}>
                      {METODOS.map((m) => (
                        <option key={m} value={m}>
                          {metodoEmoji[m]} {metodoLabel[m]}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn--primary tbl__cobrar" type="submit">
                      <span>Cobrar todo · {formatCOP(debe)}</span>
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="muted salon-note">
        Se actualiza solo cada 15 s. Una cuenta sigue abierta hasta que se cobra, aunque
        el plato ya se haya entregado.
      </p>
    </>
  );
}

function hace(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
