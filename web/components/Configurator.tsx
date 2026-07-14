"use client";

import { useState, useTransition } from "react";
import {
  TOPPINGS_INCLUIDOS,
  TIPOS,
  tipoLabel,
  tipoIcon,
  formatCOP,
  type Ingrediente,
  type TipoServicio,
} from "@/lib/menu";
import { enviarPedido } from "@/app/pedido-actions";
import Reveal from "./Reveal";
import Bowl from "./Bowl";

const primeraDisponible = (list: Ingrediente[], n = 1) =>
  list.filter((i) => i.activo && !i.agotado).slice(0, n);

export default function Configurator({
  bases,
  proteinas,
  toppings: toppingsCat,
  whatsapp,
  numMesas,
  impuestoPct,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  whatsapp: string;
  numMesas: number;
  impuestoPct: number;
}) {
  const all = [...bases, ...proteinas, ...toppingsCat];
  const find = (id: string) => all.find((i) => i.id === id);

  const [baseId, setBaseId] = useState(
    () => primeraDisponible(bases)[0]?.id ?? bases[0]?.id
  );
  const [proteinaId, setProteinaId] = useState(
    () => primeraDisponible(proteinas)[0]?.id ?? proteinas[0]?.id
  );
  const [toppingIds, setToppingIds] = useState<string[]>(() =>
    primeraDisponible(toppingsCat, 2).map((t) => t.id)
  );
  const [tipo, setTipo] = useState<TipoServicio>("domicilio");
  const [mesa, setMesa] = useState(1);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");

  const base = find(baseId)!;
  const proteina = find(proteinaId)!;
  const toppings = toppingIds.map((id) => find(id)).filter(Boolean) as Ingrediente[];

  const toggleTopping = (id: string) =>
    setToppingIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );

  const sorprendeme = () => {
    const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const dispB = primeraDisponible(bases, bases.length);
    const dispP = primeraDisponible(proteinas, proteinas.length);
    const dispT = primeraDisponible(toppingsCat, toppingsCat.length);
    setBaseId(rnd(dispB).id);
    setProteinaId(rnd(dispP).id);
    const shuffled = [...dispT].sort(() => Math.random() - 0.5);
    setToppingIds(shuffled.slice(0, 2 + Math.floor(Math.random() * 2)).map((t) => t.id));
  };

  // Ticket: base + proteína + toppings (los primeros N son cortesía)
  const lineas: { label: string; valor: number; gratis?: boolean }[] = [
    { label: base.nombre, valor: base.precio },
    { label: proteina.nombre, valor: proteina.precio },
    ...toppings.map((t, i) => {
      const gratis = i < TOPPINGS_INCLUIDOS;
      return { label: t.nombre, valor: gratis ? 0 : t.precio, gratis };
    }),
  ];
  const subtotal = lineas.reduce((s, l) => s + l.valor, 0);
  const impuesto = Math.round((subtotal * impuestoPct) / 100);
  const total = subtotal + impuesto;

  const [pending, startPedido] = useTransition();
  const [ok, setOk] = useState<{ id: string; total: number } | null>(null);
  const pedir = () =>
    startPedido(async () => {
      const r = await enviarPedido({
        baseId,
        proteinaId,
        toppingIds,
        canal: "web",
        tipo,
        mesa: tipo === "mesa" ? mesa : undefined,
        cliente: tipo !== "mesa" ? cliente : undefined,
        telefono: tipo === "domicilio" ? telefono : undefined,
      });
      setOk({ id: r.id, total: r.total });
    });

  const waLink = () => {
    const servicio =
      tipo === "mesa" ? `Mesa ${mesa}` : tipoLabel[tipo];
    const txt = encodeURIComponent(
      `¡Hola Papaghetti! 🍝 Quiero armar mi enredo (${servicio}):\n` +
        `• Base: ${base.nombre}\n` +
        `• Proteína: ${proteina.nombre}\n` +
        `• Toppings: ${toppings.map((t) => t.nombre).join(", ") || "sin toppings"}\n` +
        `Total aprox: ${formatCOP(total)}`
    );
    return `https://wa.me/${whatsapp}?text=${txt}`;
  };

  return (
    <section className="section" id="arma">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Arma tu enredo</p>
          <h2 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", margin: "10px 0 6px" }}>
            Tú mandas en el enredo
          </h2>
          <p className="lead">
            Elige base, proteína y toppings. Los primeros {TOPPINGS_INCLUIDOS}{" "}
            toppings van por cuenta de la casa.
          </p>
        </Reveal>

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

            <Group titulo="2 · La proteína" nota="elige 1">
              {proteinas.map((p) => (
                <Chip
                  key={p.id}
                  ing={p}
                  selected={proteinaId === p.id}
                  onClick={() => setProteinaId(p.id)}
                  showExtra
                />
              ))}
            </Group>

            <Group titulo="3 · Los toppings" nota={`${TOPPINGS_INCLUIDOS} de cortesía`}>
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
              <span>🎲 Sorpréndeme</span>
            </button>
          </div>

          {/* ------- Bowl + ticket ------- */}
          <div className="bowl-panel">
            <Bowl base={base} proteina={proteina} toppings={toppings} />

            <div className="ticket">
              {lineas.map((l, i) => (
                <div className="ticket__row" key={i}>
                  <span>{l.label}</span>
                  <span>{l.gratis ? "cortesía" : formatCOP(l.valor)}</span>
                </div>
              ))}
              {impuestoPct > 0 && (
                <>
                  <div className="ticket__row" style={{ marginTop: 6 }}>
                    <span>Subtotal</span>
                    <span>{formatCOP(subtotal)}</span>
                  </div>
                  <div className="ticket__row">
                    <span>Impuesto ({impuestoPct}%)</span>
                    <span>{formatCOP(impuesto)}</span>
                  </div>
                </>
              )}
              <div className="ticket__total">
                <span>Tu enredo</span>
                <b>{formatCOP(total)}</b>
              </div>
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
                    )}
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
                  onClick={() => setOk(null)}
                  type="button"
                >
                  <span>Armar otro</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  className="btn btn--primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
                  onClick={pedir}
                  disabled={pending}
                  type="button"
                >
                  <span>{pending ? "Enviando…" : "Pedir aquí"}</span>
                </button>
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
                <p style={{ opacity: 0.55, fontSize: "0.75rem", textAlign: "center", marginTop: 10 }}>
                  Precios de referencia · el local confirma disponibilidad
                </p>
              </>
            )}
          </div>
        </div>
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
      {ing.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="chip__foto" src={ing.foto} alt="" aria-hidden />
      ) : (
        <span className="emoji" aria-hidden>
          {ing.emoji}
        </span>
      )}
      {ing.nombre}
      {showPrice && <span className="extra">{formatCOP(ing.precio)}</span>}
      {showExtra && (
        <span className="extra">
          {ing.precio === 0 ? "gratis" : `+${formatCOP(ing.precio)}`}
        </span>
      )}
    </button>
  );
}
