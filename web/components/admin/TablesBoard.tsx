"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { estadoLabel, formatCOP, type Pedido } from "@/lib/menu";

export default function TablesBoard({
  pedidos,
  numMesas,
}: {
  pedidos: Pedido[];
  numMesas: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [router]);

  const activos = pedidos.filter(
    (p) => p.estado !== "entregado" && p.estado !== "cancelado"
  );
  const mesas = Array.from({ length: Math.max(1, numMesas) }, (_, i) => i + 1);
  const enMesa = (n: number) => activos.filter((p) => p.tipo === "mesa" && p.mesa === n);

  const ocupadas = mesas.filter((n) => enMesa(n).length > 0);
  const consumoSalon = activos
    .filter((p) => p.tipo === "mesa")
    .reduce((s, p) => s + p.total, 0);
  const porCobrarSalon = activos
    .filter((p) => p.tipo === "mesa" && p.pago === "pendiente")
    .reduce((s, p) => s + p.total, 0);

  return (
    <>
      <div className="salon-kpis">
        <div className="salon-kpi">
          <b>{ocupadas.length}<span>/{mesas.length}</span></b>
          <span>Mesas ocupadas</span>
        </div>
        <div className="salon-kpi">
          <b>{mesas.length - ocupadas.length}</b>
          <span>Libres</span>
        </div>
        <div className="salon-kpi salon-kpi--accent">
          <b>{formatCOP(consumoSalon)}</b>
          <span>Consumo en salón</span>
        </div>
        <div className={`salon-kpi ${porCobrarSalon > 0 ? "salon-kpi--warn" : ""}`}>
          <b>{formatCOP(porCobrarSalon)}</b>
          <span>Por cobrar</span>
        </div>
      </div>

      <div className="tables">
        {mesas.map((n) => {
          const ped = enMesa(n).sort(
            (a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime()
          );
          const busy = ped.length > 0;
          const consumo = ped.reduce((s, p) => s + p.total, 0);
          const porCobrar = ped.filter((p) => p.pago === "pendiente").reduce((s, p) => s + p.total, 0);
          const desde = busy ? ped[0].creadoEn : null;
          const hayListo = ped.some((p) => p.estado === "listo");

          return (
            <div key={n} className={`mesa ${busy ? "is-busy" : "is-free"} ${hayListo ? "is-listo" : ""}`}>
              <div className="mesa__head">
                <span className="mesa__n">Mesa {n}</span>
                {busy ? (
                  <span className="mesa__time" suppressHydrationWarning>⏱ {hace(desde!)}</span>
                ) : (
                  <span className="mesa__libre">Libre</span>
                )}
              </div>

              {busy && (
                <>
                  <ul className="mesa__pedidos">
                    {ped.map((p) => (
                      <li key={p.id}>
                        <span className={`dot dot--${p.estado}`} aria-hidden />
                        <span className="mesa__dish">
                          <b>#{p.id}</b> {p.base} · {p.proteina}
                          {p.toppings.length ? <em> +{p.toppings.length}</em> : null}
                        </span>
                        <span className={`badge badge--${p.estado}`}>{estadoLabel[p.estado]}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mesa__foot">
                    <div className="mesa__consumo">
                      <span>Consumo</span>
                      <b>{formatCOP(consumo)}</b>
                    </div>
                    <span className={`badge ${porCobrar > 0 ? "badge--warn" : "badge--ok"}`}>
                      {porCobrar > 0 ? `Por cobrar ${formatCOP(porCobrar)}` : "Todo pagado"}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted salon-note">Se actualiza solo cada 15 s. La mesa se asigna al crear el pedido.</p>
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
