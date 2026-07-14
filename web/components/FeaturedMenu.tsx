"use client";

import { useEffect, useState } from "react";
import { findIn, formatCOP, type Catalog, type EnredoInsignia } from "@/lib/menu";
import Reveal from "./Reveal";
import Bowl from "./Bowl";

// Placeholder — reemplazar por el WhatsApp real del local (57...)
const WHATSAPP = "573001112233";

export default function FeaturedMenu({ catalog }: { catalog: Catalog }) {
  const byId = (id: string) => findIn(catalog, id)!;
  const [sel, setSel] = useState<EnredoInsignia | null>(null);

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
                      <span className="plato__precio">{formatCOP(e.precio)}</span>
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
        <EnredoModal enredo={sel} catalog={catalog} onClose={() => setSel(null)} />
      )}
    </section>
  );
}

function EnredoModal({
  enredo,
  catalog,
  onClose,
}: {
  enredo: EnredoInsignia;
  catalog: Catalog;
  onClose: () => void;
}) {
  const byId = (id: string) => findIn(catalog, id)!;
  const base = byId(enredo.baseId);
  const proteina = byId(enredo.proteinaId);
  const toppings = enredo.toppingIds.map(byId);

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

  const waLink = () => {
    const txt = encodeURIComponent(
      `¡Hola Papaghetti! 🍝 Quiero "${enredo.nombre}": ${base.nombre} + ${proteina.nombre}` +
        ` + ${toppings.map((t) => t.nombre).join(", ")}. Total ${formatCOP(enredo.precio)}.`
    );
    return `https://wa.me/${WHATSAPP}?text=${txt}`;
  };

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
              <span>{base.emoji} {base.nombre}</span>
              <em>base</em>
            </li>
            <li>
              <span>{proteina.emoji} {proteina.nombre}</span>
              <em>proteína</em>
            </li>
            {toppings.map((t) => (
              <li key={t.id}>
                <span>{t.emoji} {t.nombre}</span>
                <em>topping</em>
              </li>
            ))}
          </ul>
          <div className="modal__foot">
            <span className="plato__precio">{formatCOP(enredo.precio)}</span>
            <div className="modal__actions">
              <a href="#arma" className="btn btn--ghost" onClick={onClose}>
                <span>Armar el mío</span>
              </a>
              <a
                href={waLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary"
              >
                <span>Pedir por WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
