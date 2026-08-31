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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCOP, estadoLabel, type EnredoInsignia, type EstadoPedido, type Ingrediente } from "@/lib/menu";
import PlatosCarta from "@/components/PlatosCarta";
import { calcularTotales, idsGratis } from "@/lib/precios";
import { enviarPedido, estadoPedido } from "@/app/pedido-actions";
import { nuevaClave } from "@/lib/idem";
import { useSonido } from "./sonido";

type Modo = "emplata" | "rapido";

type Drop = { key: number; emoji: string; foto?: string };

/* Iconos SVG propios — CERO emoji de sistema (mandato de marca, mismo lenguaje que el shell del
   juego: stroke=currentColor, trazo 1.7). El emoji de INGREDIENTE (i.emoji) se queda: es contenido
   del catálogo y solo aparece como fallback cuando falta la foto. */
const ico = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IcoSonido = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);
const IcoMute = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="m17 9 5 6" />
    <path d="m22 9-5 6" />
  </svg>
);
const IcoRayo = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);
const IcoCaja = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M3 8l9-5 9 5-9 5-9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);
const IcoLuna = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const IcoTicket = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M5 3h14v18l-2.4-1.6L14.2 21l-2.2-1.6L9.8 21l-2.4-1.6L5 21V3z" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
  </svg>
);
const IcoLlama = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M12 22c4 0 7-2.7 7-6.6 0-3.2-2-5.5-3.8-7.4C13.7 6.4 13 4.6 13 2c-3 2-4.2 4.4-4 6.8.1 1.4-.8 1.9-1.7 1-.5-.5-.8-1.2-.8-2C4.6 9.4 4 11.5 4 13.6 4 19.3 8 22 12 22z" />
  </svg>
);
const IcoCampana = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);
const IcoChispas = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...ico} aria-hidden>
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="M3 12h4" />
    <path d="M17 12h4" />
    <path d="m5.6 5.6 2.8 2.8" />
    <path d="m15.6 15.6 2.8 2.8" />
    <path d="m18.4 5.6-2.8 2.8" />
    <path d="m8.4 15.6-2.8 2.8" />
  </svg>
);

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
  platos = [],
}: {
  mesa: number;
  negocio: string;
  abierto: boolean;
  impuestoPct: number;
  incluidos: number;
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  platos?: EnredoInsignia[];
}) {
  const disponibles = (l: Ingrediente[]) => l.filter((i) => !i.agotado);
  const [modo, setModo] = useState<Modo>("emplata");
  const [baseId, setBaseId] = useState<string>(() => disponibles(bases)[0]?.id ?? "");
  const [proteinaId, setProteinaId] = useState<string>(() => disponibles(proteinas)[0]?.id ?? "");
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [cerrando, setCerrando] = useState(false); // animación de cierre origami
  const [pedido, setPedido] = useState<{ id: string; total: number } | null>(null);
  /** El "no" del servidor tiene que verse: antes se perdía en un catch inalcanzable. */
  const [error, setError] = useState<string | null>(null);
  /* Dónde está el cliente y qué debemos saber. Por QR NADIE podía decirlo: el pedido
     llegaba anónimo y sin forma de avisar de una alergia. */
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [verCarta, setVerCarta] = useState(false);
  /** Idempotencia: se rellena al enviar, no en el render. Ver lib/idem.ts. */
  const idem = useRef("");
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
  const tops = useMemo(() => toppingIds.map(find).filter(Boolean) as Ingrediente[], [toppingIds, find]);

  /* PRECIO — la MISMA función que usa el servidor. Aquí vivía el último cálculo a
     mano del repo: regalaba "los primeros" por orden de toque y contaba las salsas
     como si costaran, así que la pantalla podía mostrar hasta $11.000 de más que lo
     que cobraba la caja. */
  const { subtotal, impuesto, total } = calcularTotales({
    base,
    proteinas: [proteina],
    toppings: tops,
    impuestoPct,
    incluidos,
  });
  /** Quiénes van de cortesía, para que la etiqueta diga lo mismo que el total. */
  const gratis = useMemo(() => idsGratis(tops, incluidos), [tops, incluidos]);

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
    if (!idem.current) idem.current = nuevaClave();
    try {
      const r = await enviarPedido({
        baseId,
        proteinaId,
        toppingIds,
        canal: "qr",
        tipo: "mesa",
        // Sin número de mesa: aquí no se asignan. La referencia dice dónde está.
        referencia: referencia.trim() || undefined,
        notas: notas.trim() || undefined,
        idemKey: idem.current,
      });
      /* El servidor puede decir que no (se acabó un ingrediente, cerramos, mesa
         inválida) y `enviarPedido` NUNCA lanza: devuelve {ok:false, error}. Sin esta
         guarda se pintaba la pantalla de "¡pedido recibido!" con id vacío mientras la
         cocina no había recibido nada — el peor fallo posible, porque el cliente se
         queda esperando un plato que no existe. */
      if (!r.ok) {
        setCerrando(false);
        setError(r.error);
        setEnviando(false);
        return;
      }
      setError(null);
      setPedido({ id: r.id, total: r.total });
      setEstado(r.estado as EstadoPedido);
    } catch {
      setCerrando(false);
      setError("No pudimos enviar el pedido. Intenta otra vez.");
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
    setError(null);
    /* LA CLAVE NUEVA ES OBLIGATORIA. La de idempotencia se generaba una sola vez por
       montaje, y este botón no la limpiaba: la SEGUNDA ronda de la misma mesa llegaba
       al servidor con la clave de la primera, el cerebro la reconocía como un reintento
       y devolvía el pedido viejo. El cliente veía "¡a la cocina!" con el id anterior y
       la cocina no recibía nada. Cada segunda vuelta se perdía en silencio. */
    idem.current = "";
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
          {referencia && <span>· {referencia.toUpperCase()}</span>}
        </div>
        <div className="emp-top__actions">
          {platos.length > 0 && (
            <button type="button" className="emp-mini emp-mini--carta" onClick={() => setVerCarta(true)}>
              Platos listos
            </button>
          )}
          <button
            type="button"
            className="emp-mini"
            onClick={s.toggleMute}
            aria-label={s.mute ? "Activar sonido" : "Silenciar"}
          >
            {s.mute ? <IcoMute /> : <IcoSonido />}
          </button>
          <button
            type="button"
            className={`emp-mini emp-modo ${modo === "rapido" ? "is-on" : ""}`}
            onClick={() => setModo(modo === "rapido" ? "emplata" : "rapido")}
          >
            {modo === "rapido" ? <><IcoCaja /> EMPLATAR</> : <><IcoRayo /> PEDIR YA</>}
          </button>
        </div>
      </header>

      {!abierto && (
        <div className="emp-cerrado" role="status">
          <IcoLuna /> Estamos cerrados ahora — vuelve en horario de servicio.
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
            Pedido <b>#{pedido.id}</b>{referencia ? ` · ${referencia}` : ""} · {formatCOP(pedido.total)}
          </p>
          <ol className="emp-estado" aria-label="Estado del pedido">
            {(["recibido", "cocina", "listo"] as EstadoPedido[]).map((e, k) => {
              const orden: EstadoPedido[] = ["recibido", "cocina", "listo", "entregado"];
              const done = orden.indexOf(estado) >= k;
              const activo = orden.indexOf(estado) === k;
              return (
                <li key={e} className={`${done ? "done" : ""} ${activo ? "activo" : ""}`}>
                  <i>{k === 0 ? <IcoTicket /> : k === 1 ? <IcoLlama /> : <IcoCampana />}</i>
                  {estadoLabel[e]}
                </li>
              );
            })}
          </ol>
          {estado === "listo" && <p className="emp-listo"><IcoChispas /> ¡Tu caja está lista!</p>}
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

          {/* Dónde está y qué debemos saber: sin esto el pedido llega anónimo. */}
          <section className="emp-donde">
            <label>
              <span>¿Dónde te encontramos?</span>
              <input
                type="text"
                value={referencia}
                maxLength={60}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Mesa del ventanal, barra…"
              />
            </label>
            <label>
              <span>Algo que debamos saber</span>
              <input
                type="text"
                value={notas}
                maxLength={140}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Sin cebolla, alergias… (opcional)"
              />
            </label>
          </section>

          {/* -------- barra fija de pulgar: total + confirmar -------- */}
          <footer className="emp-bar">
            {/* El "no" del servidor, visible. Se nos acabó algo, cerramos, la mesa no
                existe: todo eso llegaba antes como un éxito falso. */}
            {error && (
              <p className="emp-bar__error" role="alert">
                {error}
              </p>
            )}
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
      {verCarta && (
        <PlatosCarta
          platos={platos}
          ingredientes={[...bases, ...proteinas, ...toppings]}
          abierto={abierto}
          referenciaInicial={referencia}
          onCerrar={() => setVerCarta(false)}
          onPedido={(id, total) => {
            setVerCarta(false);
            setPedido({ id, total });
            setEstado("recibido");
          }}
        />
      )}
    </div>
  );
}
