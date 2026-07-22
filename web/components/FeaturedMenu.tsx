"use client";

import { useEffect, useState } from "react";
import {
  findIn,
  formatCOP,
  waLink,
  whatsappValido,
  type Catalog,
  type EnredoInsignia,
} from "@/lib/menu";
import { calcularTotales } from "@/lib/precios";
import Reveal from "./Reveal";
import Bowl from "./Bowl";
import IngImg from "./IngImg";
import PedirInsignia from "./PedirInsignia";
import { useJuegoOpcional } from "./JuegoProvider";

export default function FeaturedMenu({ catalog }: { catalog: Catalog }) {
  const byId = (id: string) => findIn(catalog, id)!;
  const [sel, setSel] = useState<EnredoInsignia | null>(null);
  const juego = useJuegoOpcional();
  // "Enredarlo a mi gusto" abre el MISMO juego con este plato ya servido en la caja.
  const onEnredar = juego
    ? (e: EnredoInsignia) =>
        juego.abrir({ baseId: e.baseId, proteinaId: e.proteinaId, toppingIds: e.toppingIds })
    : undefined;

  return (
    <section className="section section--dark" id="menu">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Menú destacado</p>
          <h2 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", marginTop: 10 }}>
            Los enredos insignia
          </h2>
          <p className="lead" style={{ marginTop: 12 }}>
            ¿Sin ganas de decidir? Estos ya vienen armados… tócalos para ver el
            detalle.
          </p>
        </Reveal>

        <div className="menu-grid">
          {catalog.enredos.map((e, i) => {
            const base = byId(e.baseId);
            const proteina = byId(e.proteinaId);
            const toppings = e.toppingIds.map(byId);
            // ¿Sale mejor que armarlo tú mismo? Solo lo decimos cuando es verdad.
            const suelto = calcularTotales({
              base,
              proteinas: [proteina],
              toppings,
              impuestoPct: catalog.ajustes.impuestoPct ?? 0,
            }).total;
            const ahorro = suelto - e.precio;
            return (
              <Reveal key={e.id} delay={i * 120}>
                <article
                  className="plato"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSel(e)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSel(e);
                    }
                  }}
                >
                  <div className="plato__art">
                    {e.destacado && <span className="plato__tag">El favorito</span>}
                    {ahorro > 0 && (
                      <span className="plato__ahorro">Ahorras {formatCOP(ahorro)}</span>
                    )}
                    {e.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="plato__foto" src={e.foto} alt={e.nombre} />
                    ) : (
                      <Bowl base={base} proteina={proteina} toppings={toppings} mini />
                    )}
                  </div>
                  <div className="plato__body">
                    <h3>{e.nombre}</h3>
                    <p className="plato__gancho">{e.gancho}</p>
                    <div className="plato__row">
                      <span className="plato__precio">
                        {formatCOP(e.precio)}
                        <small className="plato__incluido">todo incluido</small>
                      </span>
                      <span className="plato__ver">Ver detalle →</span>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>

      {sel && (
        <EnredoModal
          enredo={sel}
          catalog={catalog}
          onClose={() => setSel(null)}
          onEnredar={onEnredar}
        />
      )}
    </section>
  );
}

function EnredoModal({
  enredo,
  catalog,
  onClose,
  onEnredar,
}: {
  enredo: EnredoInsignia;
  catalog: Catalog;
  onClose: () => void;
  onEnredar?: (e: EnredoInsignia) => void;
}) {
  const byId = (id: string) => findIn(catalog, id)!;
  const base = byId(enredo.baseId);
  const proteina = byId(enredo.proteinaId);
  const toppings = enredo.toppingIds.map(byId);
  const { ajustes } = catalog;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const hayWa = whatsappValido(ajustes.whatsapp);
  const wa = () =>
    waLink(
      ajustes.whatsapp,
      `¡Hola Papaghetti! 🍝 Quiero "${enredo.nombre}": ${base.nombre} + ${proteina.nombre}` +
        ` + ${toppings.map((t) => t.nombre).join(", ")}. Total ${formatCOP(enredo.precio)}.`
    );

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal__card"
        role="dialog"
        aria-modal="true"
        aria-label={enredo.nombre}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <div className="modal__art">
          {enredo.destacado && <span className="plato__tag">El favorito</span>}
          {enredo.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="plato__foto plato__foto--big" src={enredo.foto} alt={enredo.nombre} />
          ) : (
            <Bowl base={base} proteina={proteina} toppings={toppings} />
          )}
        </div>
        <div className="modal__body">
          <h3>{enredo.nombre}</h3>
          <p className="plato__gancho">{enredo.gancho}</p>
          <ul className="modal__list">
            <li>
              <span>
                <IngImg ing={base} className="modal__ing" /> {base.nombre}
              </span>
              <em>base</em>
            </li>
            <li>
              <span>
                <IngImg ing={proteina} className="modal__ing" /> {proteina.nombre}
              </span>
              <em>proteína</em>
            </li>
            {toppings.map((t) => (
              <li key={t.id}>
                <span>
                  <IngImg ing={t} className="modal__ing" /> {t.nombre}
                </span>
                <em>topping</em>
              </li>
            ))}
          </ul>

          <PedirInsignia
            enredo={enredo}
            numMesas={ajustes.numMesas}
            impuestoPct={ajustes.impuestoPct ?? 0}
            costoDomicilio={ajustes.costoDomicilio}
            pedidoMinimo={ajustes.pedidoMinimo}
          />

          <div className="modal__otros">
            {onEnredar && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  onClose();
                  onEnredar(enredo);
                }}
              >
                <span>Enredarlo a mi gusto</span>
              </button>
            )}
            {hayWa && (
              <a href={wa()} target="_blank" rel="noopener noreferrer" className="modal__wa">
                o pedirlo por WhatsApp →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
