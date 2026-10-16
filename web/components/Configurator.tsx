"use client";

import { useRef, useState, useTransition } from "react";
import {
  TIPOS,
  tipoLabel,
  tipoIcon,
  formatCOP,
  waLink as waHref,
  whatsappValido,
  type CobroBases,
  type Ingrediente,
  type TipoServicio,
} from "@/lib/menu";
import { calcularTotales, faltaParaMinimo } from "@/lib/precios";
import { nuevaClave } from "@/lib/idem";
import { enviarPedido } from "@/app/pedido-actions";
import Reveal from "./Reveal";
import Bowl from "./Bowl";
import IngImg from "./IngImg";

const primeraDisponible = (list: Ingrediente[], n = 1) =>
  list.filter((i) => i.activo && !i.agotado).slice(0, n);

export default function Configurator({
  bases,
  proteinas,
  toppings: toppingsCat,
  whatsapp,
  numMesas,
  impuestoPct,
  costoDomicilio = 0,
  pedidoMinimo = 0,
  abierto = true,
  embebido,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  whatsapp: string;
  numMesas: number;
  impuestoPct: number;
  costoDomicilio?: number;
  pedidoMinimo?: number;
  /** El negocio cerrado no acepta pedidos (el servidor tambien los rechaza). */
  abierto?: boolean;
  /** true = lo monta EnredaTuPlato dentro de su sección: no repite <section> ni encabezado. */
  embebido?: boolean;
  /** Dos bases en un plato (Ajustes → Cobro y servicio). Sin esto: hasta 2, mitad y mitad. */
  basesMax?: 1 | 2;
  cobroBases?: CobroBases;
}) {
  const all = [...bases, ...proteinas, ...toppingsCat];
  const find = (id: string) => all.find((i) => i.id === id);

  const [baseId, setBaseId] = useState(
    () => primeraDisponible(bases)[0]?.id ?? bases[0]?.id
  );
  /* PROTEÍNAS: las que quiera, o ninguna (lo pidió el dueño). Arranca con la primera
     disponible para que el plato no se vea vacío, pero se puede quitar. */
  const [proteinaIds, setProteinaIds] = useState<string[]>(() =>
    primeraDisponible(proteinas).map((p) => p.id)
  );
  const [toppingIds, setToppingIds] = useState<string[]>(() =>
    primeraDisponible(toppingsCat, 2).map((t) => t.id)
  );
  const [tipo, setTipo] = useState<TipoServicio>("domicilio");
  const [mesa, setMesa] = useState(1);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas] = useState("");
  // Idempotencia: se rellena al ENVIAR, no en el render. Ver lib/idem.ts.
  const idem = useRef("");

  const base = find(baseId)!;
  const prots = proteinaIds.map((id) => find(id)).filter(Boolean) as Ingrediente[];
  const toppings = toppingIds.map((id) => find(id)).filter(Boolean) as Ingrediente[];

  const toggleTopping = (id: string) =>
    setToppingIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  const toggleProteina = (id: string) =>
    setProteinaIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const sorprendeme = () => {
    const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const dispB = primeraDisponible(bases, bases.length);
    const dispP = primeraDisponible(proteinas, proteinas.length);
    const dispT = primeraDisponible(toppingsCat, toppingsCat.length);
    if (dispB.length) setBaseId(rnd(dispB).id);
    setProteinaIds(dispP.length ? [rnd(dispP).id] : []);
    const shuffled = [...dispT].sort(() => Math.random() - 0.5);
    setToppingIds(shuffled.slice(0, 2 + Math.floor(Math.random() * 2)).map((t) => t.id));
  };

  /* Ticket: base + proteína + acompañantes, cada uno a su precio. `gratis` solo se marca
     cuando el ingrediente de verdad vale $0 en la carta (las salsas), no por cortesía. */
  const lineas: { label: string; valor: number; gratis?: boolean }[] = [
    { label: base.nombre, valor: base.precio },
    ...prots.map((p) => ({ label: p.nombre, valor: p.precio })),
    ...toppings.map((t) => ({ label: t.nombre, valor: t.precio, gratis: t.precio === 0 })),
  ];
  // Un solo cálculo para todo el sitio (espejo de crearPedido) — lib/precios.ts
  const { subtotal, impuesto, domicilio, total } = calcularTotales({
    base,
    proteinas: prots,
    toppings,
    impuestoPct,
    tipo,
    costoDomicilio,
  });
  const falta = faltaParaMinimo(subtotal, tipo, pedidoMinimo);

  const [pending, startPedido] = useTransition();
  const [ok, setOk] = useState<{ id: string; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pedir = () =>
    startPedido(async () => {
      setError(null);
      if (!idem.current) idem.current = nuevaClave();
      const r = await enviarPedido({
        baseId,
        proteinaIds,
        toppingIds,
        canal: "web",
        tipo,
        mesa: tipo === "mesa" ? mesa : undefined,
        cliente: tipo !== "mesa" ? cliente : undefined,
        telefono: tipo === "domicilio" ? telefono : undefined,
        direccion: tipo === "domicilio" ? direccion.trim() || undefined : undefined,
        notas: notas.trim() || undefined,
        idemKey: idem.current,
      });
      if (!r.ok) return setError(r.error);
      setOk({ id: r.id, total: r.total });
    });

  const hayWa = whatsappValido(whatsapp);
  const waLink = () => {
    const servicio = tipo === "mesa" ? `Mesa ${mesa}` : tipoLabel[tipo];
    return waHref(
      whatsapp,
      `¡Hola Papaghetti! 🍝 Quiero armar mi enredo (${servicio}):\n` +
        `• Base: ${base.nombre}\n` +
        `• Proteína: ${prots.map((p) => p.nombre).join(" + ") || "sin proteína"}\n` +
        `• Toppings: ${toppings.map((t) => t.nombre).join(", ") || "sin toppings"}\n` +
        `Total aprox: ${formatCOP(total)}`
    );
  };

  const cuerpo = (
    <div className="config">
          {/* ------- Selección ------- */}
          <div className="config__steps">
            <Group titulo="1 · La base" nota="elige 1">
              {bases.map((b) => (
                <Chip
                  key={b.id}
                  ing={b}
                  selected={baseId === b.id}
                  onClick={() => setBaseId(b.id)}
                  showPrice
                />
              ))}
            </Group>

            <Group titulo="2 · Las proteínas" nota="las que quieras, o ninguna">
              {proteinas.map((p) => (
                <Chip
                  key={p.id}
                  ing={p}
                  selected={proteinaIds.includes(p.id)}
                  onClick={() => toggleProteina(p.id)}
                  showExtra
                />
              ))}
            </Group>

            <Group titulo="3 · Los acompañantes" nota="cada uno con su precio">
              {toppingsCat.map((t) => (
                <Chip
                  key={t.id}
                  ing={t}
                  selected={toppingIds.includes(t.id)}
                  onClick={() => toggleTopping(t.id)}
                  showExtra
                />
              ))}
            </Group>

            <button className="btn btn--ghost" onClick={sorprendeme} style={{ alignSelf: "flex-start" }}>
              <span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: -3, marginRight: 6 }}>
                  <rect x="3" y="3" width="18" height="18" rx="4" />
                  <path d="M8.5 8.5v.01M15.5 8.5v.01M8.5 15.5v.01M15.5 15.5v.01M12 12v.01" />
                </svg>
                Sorpréndeme
              </span>
            </button>
          </div>

          {/* ------- Bowl + ticket ------- */}
          <div className="bowl-panel">
            <Bowl base={base} proteinas={prots} toppings={toppings} />

            <div className="ticket">
              {lineas.map((l, i) => (
                <div className="ticket__row" key={i}>
                  <span>{l.label}</span>
                  <span>{l.gratis ? "incluido" : formatCOP(l.valor)}</span>
                </div>
              ))}
              {domicilio > 0 && (
                <div className="ticket__row" style={{ marginTop: 6 }}>
                  <span>Domicilio</span>
                  <span>{formatCOP(domicilio)}</span>
                </div>
              )}
              <div className="ticket__total">
                <span>Tu enredo</span>
                <b>{formatCOP(total)}</b>
              </div>
              {/* Precio visto = precio pagado: los renglones de arriba YA suman el total.
                  El impuesto se dice como incluido, no como una línea más que sumar. */}
              {impuestoPct > 0 && impuesto > 0 && (
                <p className="ticket__incluye">
                  Incluye impuesto al consumo ({impuestoPct}%): {formatCOP(impuesto)}
                </p>
              )}
            </div>

            {!ok && (
              <div className="svc">
                <span className="svc__label">¿Cómo lo quieres?</span>
                <div className="svc__opts" role="group" aria-label="Tipo de servicio">
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
                {tipo === "mesa" && (
                  <label className="svc__mesa">
                    Mesa
                    <select
                      value={mesa}
                      onChange={(e) => setMesa(Number(e.target.value))}
                      aria-label="Número de mesa"
                    >
                      {Array.from({ length: Math.max(1, numMesas) }, (_, i) => i + 1).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                )}
                {tipo !== "mesa" && (
                  <div className="svc__ref">
                    <label className="svc__field">
                      <span>Tu nombre</span>
                      <input
                        type="text"
                        value={cliente}
                        onChange={(e) => setCliente(e.target.value)}
                        placeholder="¿A nombre de quién?"
                        aria-label="Tu nombre"
                      />
                    </label>
                    {tipo === "domicilio" && (
                      <>
                        <label className="svc__field">
                          <span>WhatsApp / teléfono</span>
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={telefono}
                            onChange={(e) => setTelefono(e.target.value)}
                            placeholder="Para confirmar el domicilio"
                            aria-label="Teléfono"
                          />
                        </label>
                        {/* El domiciliario no tenía a dónde ir: el pedido no guardaba
                            dirección en ninguna parte del sistema. */}
                        <label className="svc__field">
                          <span>Dirección</span>
                          <input
                            type="text"
                            value={direccion}
                            onChange={(e) => setDireccion(e.target.value)}
                            placeholder="Calle, barrio y punto de referencia"
                            aria-label="Dirección de entrega"
                          />
                        </label>
                      </>
                    )}
                    <label className="svc__field">
                      <span>Algo que debamos saber</span>
                      <input
                        type="text"
                        value={notas}
                        maxLength={140}
                        onChange={(e) => setNotas(e.target.value)}
                        placeholder="Sin cebolla, alergias… (opcional)"
                        aria-label="Notas para la cocina"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {ok ? (
              <div className="pedido-ok">
                <p className="pedido-ok__big">¡Enredo pedido! 🍝</p>
                <p className="pedido-ok__id">#{ok.id}</p>
                <p style={{ opacity: 0.85, fontSize: "0.9rem", margin: "4px 0 0" }}>
                  Lo estamos preparando · {formatCOP(ok.total)}
                </p>
                <button
                  className="btn btn--gold"
                  style={{ marginTop: 14 }}
                  /* CLAVE NUEVA para el pedido nuevo. Con la vieja, el servidor creía que
                     era un reintento y devolvía el primer pedido: el segundo plato nunca
                     llegaba a la cocina y el cliente no tenía cómo saberlo. */
                  onClick={() => {
                    idem.current = "";
                    setOk(null);
                  }}
                  type="button"
                >
                  <span>Armar otro</span>
                </button>
              </div>
            ) : (
              <>
                {falta > 0 && (
                  <p className="ticket__aviso">
                    Pedido mínimo a domicilio {formatCOP(pedidoMinimo)} · te faltan{" "}
                    <b>{formatCOP(falta)}</b>
                  </p>
                )}
                {error && <p className="ticket__error">{error}</p>}
                <button
                  className="btn btn--primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
                  onClick={pedir}
                  disabled={pending || falta > 0 || !abierto}
                  type="button"
                >
                  <span>{pending ? "Enviando…" : "Pedir aquí"}</span>
                </button>
                {hayWa && (
                  <a
                    href={waLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      textAlign: "center",
                      marginTop: 12,
                      color: "var(--pg-oro)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                    }}
                  >
                    o pedir por WhatsApp →
                  </a>
                )}
                <p style={{ opacity: 0.55, fontSize: "0.75rem", textAlign: "center", marginTop: 10 }}>
                  Precios de referencia · el local confirma disponibilidad
                </p>
              </>
            )}
      </div>
    </div>
  );

  // Embebido dentro de EnredaTuPlato: la sección y el encabezado ya los pone el host.
  if (embebido) return cuerpo;

  return (
    <section className="section" id="arma">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Arma tu enredo</p>
          <h2>
            Tú mandas en el enredo
          </h2>
          <p className="lead">
            Elige la base, las proteínas que quieras (o ninguna) y los acompañantes. Cada
            cosa vale lo que dice la carta y las salsas van con el plato.
          </p>
        </Reveal>
        {cuerpo}
      </div>
    </section>
  );
}

function Group({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota: string;
  children: React.ReactNode;
}) {
  return (
    <div className="config__group">
      <h3>
        {titulo} <span className="badge">{nota}</span>
      </h3>
      <div className="chips">{children}</div>
    </div>
  );
}

function Chip({
  ing,
  selected,
  onClick,
  showPrice,
  showExtra,
}: {
  ing: Ingrediente;
  selected: boolean;
  onClick: () => void;
  showPrice?: boolean;
  showExtra?: boolean;
}) {
  const agotado = ing.agotado || !ing.activo;
  return (
    <button
      className={`chip ${selected ? "is-selected" : ""} ${agotado ? "is-agotado" : ""}`}
      onClick={onClick}
      disabled={agotado}
      type="button"
    >
      <IngImg ing={ing} className="chip__ing" />
      {ing.nombre}
      {showPrice && <span className="extra">{formatCOP(ing.precio)}</span>}
      {showExtra && (
        <span className="extra">
          {ing.precio === 0 ? "incluido" : `+${formatCOP(ing.precio)}`}
        </span>
      )}
    </button>
  );
}
