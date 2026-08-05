"use client";

import { useEffect, useState } from "react";
import {
  formatCOP,
  waLink,
  whatsappValido,
  type EnredoInsignia,
  type Ingrediente,
} from "@/lib/menu";
import type { CatalogoPublico } from "@/lib/catalog";
import { calcularTotales } from "@/lib/precios";
import Reveal from "./Reveal";
import CajaMini from "./CajaMini";
import Termometro from "./Termometro";
import IngImg from "./IngImg";
import PedirInsignia from "./PedirInsignia";
import { useJuegoOpcional } from "./JuegoProvider";

/** Índice de ingredientes del catálogo público (bases + proteínas + toppings). */
function indice(catalog: CatalogoPublico): Map<string, Ingrediente> {
  return new Map(
    [...catalog.bases, ...catalog.proteinas, ...catalog.toppings].map((i) => [i.id, i]),
  );
}

/**
 * ¿Se puede preparar hoy este enredo? Basta con que UNO de sus componentes esté
 * agotado o fuera de carta. Este componente no conocía la palabra "agotado", así que
 * "El Antojado" ($30.900) se seguía ofreciendo y pidiendo con la tocineta agotada —
 * mientras la carta completa, tres secciones más abajo, sí la marcaba. La misma
 * página se contradecía sola.
 */
function faltante(e: EnredoInsignia, ix: Map<string, Ingrediente>): Ingrediente | null {
  for (const id of [e.baseId, e.proteinaId, ...e.toppingIds]) {
    const ing = ix.get(id);
    if (!ing || ing.agotado || ing.activo === false) return ing ?? null;
  }
  return null;
}

export default function FeaturedMenu({ catalog }: { catalog: CatalogoPublico }) {
  const ix = indice(catalog);
  const byId = (id: string) => ix.get(id)!;
  const [sel, setSel] = useState<EnredoInsignia | null>(null);
  const juego = useJuegoOpcional();
  // "Enredarlo a mi gusto" abre el MISMO juego con este plato ya servido en la caja,
  // conservando su identidad para que el precio de carta no cambie por abrirlo.
  const onEnredar = juego
    ? (e: EnredoInsignia) =>
        juego.abrir({
          baseId: e.baseId,
          proteinaId: e.proteinaId,
          toppingIds: e.toppingIds,
          enredoId: e.id,
        })
    : undefined;

  return (
    <section className="section section--dark" id="menu">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Menú destacado</p>
          <h2>
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
            const falta = faltante(e, ix);
            return (
              <Reveal key={e.id} delay={i * 120}>
                <article
                  className={`plato${falta ? " plato--agotado" : ""}`}
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
                    {falta ? (
                      <span className="plato__tag plato__tag--agotado">Hoy no disponible</span>
                    ) : (
                      e.destacado && <span className="plato__tag">El favorito</span>
                    )}
                    {ahorro > 0 && !falta && (
                      <span className="plato__ahorro">Ahorras {formatCOP(ahorro)}</span>
                    )}
                    {e.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="plato__foto" src={e.foto} alt={e.nombre} />
                    ) : (
                      <CajaMini base={base} proteina={proteina} toppings={toppings} />
                    )}
                  </div>
                  <div className="plato__body">
                    <h3>{e.nombre}</h3>
                    <p className="plato__gancho">{e.gancho}</p>
                    <Termometro ings={[base, proteina, ...toppings]} />
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
          falta={faltante(sel, ix)}
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
  falta,
  onClose,
  onEnredar,
}: {
  enredo: EnredoInsignia;
  catalog: CatalogoPublico;
  falta: Ingrediente | null;
  onClose: () => void;
  onEnredar?: (e: EnredoInsignia) => void;
}) {
  const ix = indice(catalog);
  const byId = (id: string) => ix.get(id)!;
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
            <CajaMini base={base} proteina={proteina} toppings={toppings} size="grande" />
          )}
        </div>
        <div className="modal__body">
          <h3>{enredo.nombre}</h3>
          <p className="plato__gancho">{enredo.gancho}</p>
          <Termometro ings={[base, proteina, ...toppings]} />
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

          {falta ? (
            <p className="modal__agotado">
              Hoy no lo podemos preparar: se nos acabó{" "}
              <b>{falta.nombre ?? "un ingrediente"}</b>. Ármate uno a tu gusto y te lo
              hacemos igual de rico.
            </p>
          ) : (
            <PedirInsignia
              enredo={enredo}
              abierto={ajustes.abierto !== false}
              numMesas={ajustes.numMesas}
              impuestoPct={ajustes.impuestoPct ?? 0}
              costoDomicilio={ajustes.costoDomicilio}
              pedidoMinimo={ajustes.pedidoMinimo}
            />
          )}

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
