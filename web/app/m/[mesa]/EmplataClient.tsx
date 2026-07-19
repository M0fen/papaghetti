"use client";

/**
 * EMPLATA — cliente (mobile-first, vertical, una mano).
 *
 * Reusa el cerebro tal cual: precios espejo de crearPedido (base + proteína + toppings con los
 * primeros TOPPINGS_INCLUIDOS gratis POR ORDEN + impuesto), y envía por enviarPedido (canal "qr",
 * tipo "mesa"). La caja origami es 2D (CSS) con juice: caída con rebote, vapor, sonido diegético y
 * haptics. `prefers-reduced-motion` desactiva animaciones/sonido-auto. El slot 3D queda preparado
 * (#caja-3d-slot) para montar la caja R3F encima SIN tocar la lógica (fallback = esta 2D).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCOP, estadoLabel, type EstadoPedido, type Ingrediente } from "@/lib/menu";
import { enviarPedido, estadoPedido } from "@/app/pedido-actions";
import { useSonido } from "./sonido";

type Modo = "emplata" | "rapido";

type Drop = { key: number; emoji: string; foto?: string };

// ---------------------------------------------------------------------------
export default function EmplataClient({
  mesa,
  negocio,
  abierto,
  impuestoPct,
  incluidos,
  bases,
  proteinas,
  toppings,
}: {
  mesa: number;
  negocio: string;
  abierto: boolean;
  impuestoPct: number;
  incluidos: number;
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
}) {
  const disponibles = (l: Ingrediente[]) => l.filter((i) => !i.agotado);
  const [modo, setModo] = useState<Modo>("emplata");
  const [baseId, setBaseId] = useState<string>(() => disponibles(bases)[0]?.id ?? "");
  const [proteinaId, setProteinaId] = useState<string>(() => disponibles(proteinas)[0]?.id ?? "");
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [cerrando, setCerrando] = useState(false); // animación de cierre origami
  const [pedido, setPedido] = useState<{ id: string; total: number } | null>(null);
  const [estado, setEstado] = useState<EstadoPedido>("recibido");
  const [drops, setDrops] = useState<Drop[]>([]);
  const [vapor, setVapor] = useState(0); // puffs activos
  const reduce = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const s = useSonido();

  const all = useMemo(
    () => [...bases, ...proteinas, ...toppings],
    [bases, proteinas, toppings],
  );
  const find = useCallback((id: string) => all.find((i) => i.id === id), [all]);

  const base = find(baseId);
  const proteina = find(proteinaId);
  const tops = toppingIds.map(find).filter(Boolean) as Ingrediente[];

  // PRECIO — espejo exacto de crearPedido (los primeros `incluidos` toppings gratis POR ORDEN).
  const subtotal =
    (base?.precio ?? 0) +
    (proteina?.precio ?? 0) +
    tops.reduce((sum, t, i) => sum + (i < incluidos ? 0 : t.precio), 0);
  const impuesto = Math.round((subtotal * impuestoPct) / 100);
  const total = subtotal + impuesto;

  // ---- juice: caída + vapor + haptic ----
  const soltar = useCallback(
    (ing: Ingrediente) => {
      s.caida(ing);
      if (navigator.vibrate) navigator.vibrate(12);
      if (reduce) return;
      const key = performance.now() + Math.random(); // id efímero de la animación (sin refs)
      setDrops((d) => [...d.slice(-5), { key, emoji: ing.emoji, foto: ing.foto }]);
      setVapor((v) => v + 1);
      setTimeout(() => setDrops((d) => d.filter((x) => x.key !== key)), 700);
      setTimeout(() => setVapor((v) => Math.max(0, v - 1)), 1400);
    },
    [s, reduce],
  );

  const elegirBase = (i: Ingrediente) => {
    if (i.agotado) return;
    setBaseId(i.id);
    soltar(i);
  };
  const elegirProteina = (i: Ingrediente) => {
    if (i.agotado) return;
    setProteinaId(i.id);
    soltar(i);
  };
  const toggleTopping = (i: Ingrediente) => {
    if (i.agotado) return;
    setToppingIds((prev) => {
      if (prev.includes(i.id)) return prev.filter((t) => t !== i.id);
      soltar(i);
      return [...prev, i.id];
    });
  };

  // ---- confirmar → cierre origami → enviarPedido (flujo existente, canal "qr") ----
  const confirmar = useCallback(async () => {
    if (!abierto || enviando || !baseId || !proteinaId) return;
    setEnviando(true);
    s.confirmar();
    if (navigator.vibrate) navigator.vibrate([18, 40, 24]);
    if (!reduce) {
      setCerrando(true);
      await new Promise((r) => setTimeout(r, 900)); // la caja se pliega
    }
    try {
      const r = await enviarPedido({
        baseId,
        proteinaId,
        toppingIds,
        canal: "qr",
        tipo: "mesa",
        mesa,
      });
      setPedido({ id: r.id, total: r.total });
      setEstado(r.estado as EstadoPedido);
    } catch {
      setCerrando(false);
    }
    setEnviando(false);
  }, [abierto, enviando, baseId, proteinaId, toppingIds, mesa, reduce, s]);

  // ---- estado en vivo (polling suave del pedido existente) ----
  useEffect(() => {
    if (!pedido) return;
    const t = setInterval(async () => {
      const r = await estadoPedido(pedido.id);
      if (r?.estado) setEstado(r.estado as EstadoPedido);
    }, 5000);
    return () => clearInterval(t);
  }, [pedido]);

  const otraCaja = () => {
    setPedido(null);
    setCerrando(false);
    setToppingIds([]);
    setEstado("recibido");
  };

  // ---------------------------------------------------------------------------
  const chip = (
    i: Ingrediente,
    activo: boolean,
    onTap: (i: Ingrediente) => void,
    precioLabel?: string,
  ) => (
    <button
      key={i.id}
      type="button"
      className={`emp-chip ${activo ? "is-on" : ""} ${i.agotado ? "is-off" : ""}`}
      style={{ ["--chip" as string]: i.color || "#F2A516" }}
      onClick={() => onTap(i)}
      aria-pressed={activo}
      disabled={i.agotado}
    >
      <span className="emp-chip__icon" aria-hidden>
        {i.foto ? <img src={i.foto} alt="" /> : i.emoji}
      </span>
      <span className="emp-chip__name">{i.nombre}</span>
      <span className="emp-chip__price">{i.agotado ? "Agotado" : precioLabel ?? formatCOP(i.precio)}</span>
    </button>
  );

  const idxTop = (id: string) => toppingIds.indexOf(id);

  return (
    <div className="emp-root" onPointerDown={s.unlock}>
      {/* -------- header compacto -------- */}
      <header className="emp-top">
        <div className="emp-top__brand">
          <b>{negocio.toUpperCase()}</b>
          <span>· MESA {mesa}</span>
        </div>
        <div className="emp-top__actions">
          <button
            type="button"
            className="emp-mini"
            onClick={s.toggleMute}
            aria-label={s.mute ? "Activar sonido" : "Silenciar"}
          >
            {s.mute ? "🔇" : "🔊"}
          </button>
          <button
            type="button"
            className={`emp-mini emp-modo ${modo === "rapido" ? "is-on" : ""}`}
            onClick={() => setModo(modo === "rapido" ? "emplata" : "rapido")}
          >
            {modo === "rapido" ? "🥡 EMPLATAR" : "⚡ PEDIR YA"}
          </button>
        </div>
      </header>

      {!abierto && (
        <div className="emp-cerrado" role="status">
          😴 Estamos cerrados ahora — vuelve en horario de servicio.
        </div>
      )}

      {/* -------- éxito + estado en vivo -------- */}
      {pedido ? (
        <main className="emp-exito">
          <div className="emp-caja emp-caja--cerrada" aria-hidden>
            <div className="emp-caja__cuerpo">
              <span className="emp-caja__marca">PAPAGHETTI</span>
            </div>
            <i className="emp-caja__flap emp-caja__flap--a" />
            <i className="emp-caja__flap emp-caja__flap--b" />
          </div>
          <h1>¡A la cocina!</h1>
          <p className="emp-exito__id">
            Pedido <b>#{pedido.id}</b> · Mesa {mesa} · {formatCOP(pedido.total)}
          </p>
          <ol className="emp-estado" aria-label="Estado del pedido">
            {(["recibido", "cocina", "listo"] as EstadoPedido[]).map((e, k) => {
              const orden: EstadoPedido[] = ["recibido", "cocina", "listo", "entregado"];
              const done = orden.indexOf(estado) >= k;
              const activo = orden.indexOf(estado) === k;
              return (
                <li key={e} className={`${done ? "done" : ""} ${activo ? "activo" : ""}`}>
                  <i>{k === 0 ? "🧾" : k === 1 ? "🔥" : "🔔"}</i>
                  {estadoLabel[e]}
                </li>
              );
            })}
          </ol>
          {estado === "listo" && <p className="emp-listo">¡Tu caja está lista! 🎉</p>}
          <button type="button" className="emp-cta emp-cta--sec" onClick={otraCaja}>
            Pedir otra caja
          </button>
        </main>
      ) : (
        <>
          {/* -------- LA CAJA (2D con juice; #caja-3d-slot = punto de montaje del 3D).
               En modo PEDIR YA se oculta: lista rápida a pantalla completa (<15s). -------- */}
          {modo === "emplata" && (
          <section className="emp-caja-wrap" id="caja-3d-slot" aria-hidden>
            <div className={`emp-caja ${cerrando ? "emp-caja--plegando" : ""}`}>
              <i className="emp-caja__flap emp-caja__flap--a" />
              <i className="emp-caja__flap emp-caja__flap--b" />
              <div className="emp-caja__cuerpo">
                <span className="emp-caja__marca">PAPAGHETTI</span>
                <div className="emp-caja__contenido">
                  {base && (
                    <span className="emp-ing emp-ing--base" title={base.nombre}>
                      {base.foto ? <img src={base.foto} alt="" /> : base.emoji}
                    </span>
                  )}
                  {proteina && (
                    <span className="emp-ing emp-ing--prot" title={proteina.nombre}>
                      {proteina.foto ? <img src={proteina.foto} alt="" /> : proteina.emoji}
                    </span>
                  )}
                  {tops.map((t) => (
                    <span key={t.id} className="emp-ing" title={t.nombre}>
                      {t.foto ? <img src={t.foto} alt="" /> : t.emoji}
                    </span>
                  ))}
                </div>
              </div>
              {/* vapor */}
              {!reduce &&
                vapor > 0 && [0, 1, 2].map((k) => <i key={k} className={`emp-vapor emp-vapor--${k}`} />)}
              {/* caídas */}
              {drops.map((d) => (
                <span key={d.key} className="emp-drop" aria-hidden>
                  {d.foto ? <img src={d.foto} alt="" /> : d.emoji}
                </span>
              ))}
            </div>
          </section>
          )}

          {/* -------- pasos -------- */}
          <main className={`emp-main ${modo === "rapido" ? "emp-main--rapido" : ""}`}>
            <section className="emp-paso">
              <h2>
                <b>1</b> LA BASE
              </h2>
              <div className="emp-fila">
                {bases.map((i) => chip(i, baseId === i.id, elegirBase))}
              </div>
            </section>
            <section className="emp-paso">
              <h2>
                <b>2</b> LA PROTEÍNA
              </h2>
              <div className="emp-fila">
                {proteinas.map((i) => chip(i, proteinaId === i.id, elegirProteina))}
              </div>
            </section>
            <section className="emp-paso">
              <h2>
                <b>3</b> LOS TOPPINGS{" "}
                <small>
                  {incluidos} van por la casa
                </small>
              </h2>
              <div className="emp-grid">
                {toppings.map((i) => {
                  const k = idxTop(i.id);
                  const activo = k >= 0;
                  const gratis = activo && k < incluidos;
                  return chip(
                    i,
                    activo,
                    toggleTopping,
                    gratis ? "GRATIS" : undefined,
                  );
                })}
              </div>
            </section>
            <div className="emp-espaciador" />
          </main>

          {/* -------- barra fija de pulgar: total + confirmar -------- */}
          <footer className="emp-bar">
            <div className="emp-total">
              <small>
                {tops.length > incluidos
                  ? `${incluidos} gratis · ${tops.length - incluidos} con precio`
                  : `toppings gratis: ${tops.length}/${incluidos}`}
                {impuesto > 0 ? ` · imp. ${formatCOP(impuesto)}` : ""}
              </small>
              <b>{formatCOP(total)}</b>
            </div>
            <button
              type="button"
              className="emp-cta"
              onClick={confirmar}
              disabled={!abierto || enviando || !base || !proteina}
            >
              {enviando ? "Cerrando la caja…" : "EMPLATAR →"}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
