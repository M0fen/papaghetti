"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ESTADOS,
  estadoLabel,
  formatCOP,
  tipoLabel,
  tipoIcon,
  type Pedido,
  type EstadoPedido,
} from "@/lib/menu";
import { avanzarPedidoAction, retrocederPedidoAction } from "@/app/pedido-actions";

// Columnas visibles del tablero (los entregados se ocultan del flujo activo).
const COLUMNAS: EstadoPedido[] = ["recibido", "cocina", "listo"];

/** Umbrales del semáforo, en minutos desde que entró el pedido. */
const AMBAR = 8;
const ROJO = 15;

export default function KitchenBoard({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  /** Un reloj propio: los tickets tienen que envejecer en pantalla entre refrescos. */
  const [ahora, setAhora] = useState(() => Date.now());
  const [sonido, setSonido] = useState(false);
  const vistos = useRef<Set<string> | null>(null);

  // Auto-refresh suave: nuevos pedidos aparecen sin recargar a mano.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(id);
  }, [router]);

  // El cronómetro corre solo, sin pedirle nada al servidor.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /**
   * CAMPANA al entrar un pedido nuevo. En hora pico nadie mira la pantalla fija: sin
   * sonido, un pedido de EMPLATA podía esperar minutos a que alguien pasara por ahí.
   * El AudioContext arranca suspendido por política del navegador, así que hace falta
   * un gesto del usuario — de ahí el botón "Activar sonido" al abrir el turno.
   */
  useEffect(() => {
    const ids = new Set(pedidos.filter((p) => p.estado === "recibido").map((p) => p.id));
    if (vistos.current === null) {
      vistos.current = ids; // primer render: no suena por lo que ya estaba
      return;
    }
    const hayNuevo = [...ids].some((id) => !vistos.current!.has(id));
    vistos.current = ids;
    if (!hayNuevo || !sonido) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const golpe = (t: number, hz: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.36);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.4);
      };
      golpe(0, 880);
      golpe(0.16, 1320);
      setTimeout(() => ctx.close(), 1200);
    } catch {
      /* si el navegador no deja sonar, el tablero sigue funcionando igual */
    }
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
  }, [pedidos, sonido]);

  // El contador filtraba solo "entregado": decía "3 activos" con 2 tarjetas en pantalla
  // porque los cancelados seguían contando.
  const activos = pedidos.filter(
    (p) => p.estado !== "entregado" && p.estado !== "cancelado",
  );
  const entregadosHoy = pedidos.filter((p) => p.estado === "entregado").length;

  return (
    <section className="kds">
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Cocina</h1>
          <p>Los pedidos en vivo · se refresca solo cada 8s.</p>
        </div>
        <span className="muted">
          {activos.length} activos · {entregadosHoy} entregados
          <button
            type="button"
            className="kds__son"
            onClick={() => setSonido((v) => !v)}
            aria-pressed={sonido}
            title="Avisar con un sonido cuando entre un pedido nuevo"
          >
            {sonido ? "🔔 Sonido activo" : "🔕 Activar sonido"}
          </button>
        </span>
      </div>

      <div className="kitchen__cols">
        {COLUMNAS.map((estado) => {
          /* FIFO: primero el que lleva más esperando. `crearPedido` antepone el nuevo,
             así que sin ordenar el tablero mostraba el más RECIENTE arriba y el ticket
             de 14 minutos quedaba enterrado debajo de los cinco que entraron después. */
          const items = pedidos
            .filter((p) => p.estado === estado)
            .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
          return (
            <section key={estado} className={`kcol kcol--${estado}`}>
              <h2 className="kcol__title">
                {estadoLabel[estado]} <span>{items.length}</span>
              </h2>
              <div className="kcol__list">
                {items.length === 0 && <p className="kcol__empty">Sin pedidos</p>}
                {items.map((p) => {
                  const mins = Math.max(
                    0,
                    Math.floor((ahora - new Date(p.creadoEn).getTime()) / 60000),
                  );
                  const urgencia = mins >= ROJO ? "roja" : mins >= AMBAR ? "ambar" : "ok";
                  return (
                    <article key={p.id} className={`ticket-card ticket-card--${urgencia}`}>
                      <div className="ticket-card__top">
                        <b>#{p.id}</b>
                        <span className="ticket-card__tipo">
                          {tipoIcon[p.tipo]}{" "}
                          {p.tipo === "mesa" ? `Mesa ${p.mesa ?? "?"}` : tipoLabel[p.tipo]}
                        </span>
                        {/* El cronómetro: lo que de verdad mira un cocinero. */}
                        <time className="ticket-card__crono" dateTime={p.creadoEn}>
                          {mins}′
                        </time>
                      </div>
                      {(p.cliente || p.telefono) && (
                        <p className="ticket-card__ref">
                          👤 {p.cliente || "Cliente"}
                          {p.telefono ? ` · ${p.telefono}` : ""}
                        </p>
                      )}
                      <p className="ticket-card__line">
                        <b>{p.base}</b> · {p.proteina}
                      </p>
                      {p.toppings.length > 0 && (
                        <p className="ticket-card__tops">+ {p.toppings.join(", ")}</p>
                      )}
                      {/* La nota del cliente NO puede ir en gris pequeño: aquí viven
                          las alergias. */}
                      {p.notas && <p className="ticket-card__nota">📝 {p.notas}</p>}
                      {p.tipo === "domicilio" && p.direccion && (
                        <p className="ticket-card__dir">📍 {p.direccion}</p>
                      )}
                      {p.pago === "pendiente" && (
                        <span className="badge badge--warn" style={{ marginTop: 4 }}>
                          💵 Por pagar
                        </span>
                      )}
                      <div className="ticket-card__bottom">
                        <span>{formatCOP(p.total)}</span>
                        <div className="ticket-card__acts">
                          {estado !== "recibido" && (
                            <form action={retrocederPedidoAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <button
                                className="ticket-card__back"
                                type="submit"
                                title="Devolver al paso anterior"
                                aria-label={`Devolver el pedido ${p.id} al paso anterior`}
                              >
                                ←
                              </button>
                            </form>
                          )}
                          <form action={avanzarPedidoAction}>
                            <input type="hidden" name="id" value={p.id} />
                            {/* El estado que el cocinero TIENE EN PANTALLA. Si otro ya
                                lo avanzó, el segundo toque no salta un paso. */}
                            <input type="hidden" name="desde" value={p.estado} />
                            <button className="btn btn--primary ticket-card__btn" type="submit">
                              <span>{siguiente(p.estado)}</span>
                            </button>
                          </form>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function siguiente(e: EstadoPedido) {
  const i = ESTADOS.indexOf(e);
  const n = ESTADOS[i + 1];
  return n === "cocina" ? "A cocina →" : n === "listo" ? "Listo 🔔" : "Entregar ✓";
}
