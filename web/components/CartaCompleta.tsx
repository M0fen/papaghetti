"use client";

/**
 * LA CARTA, PARA LEERLA.
 *
 * Faltaba lo más básico de un restaurante: poder VER la carta. Los 16 ingredientes con su
 * precio solo existían dentro del juego o del armador — el cliente que quiere mirar antes
 * de decidir no tenía dónde, y Google tampoco (esta sección alimenta el JSON-LD del menú).
 *
 * Cada línea trae su nota sensorial y su textura: la carta habla el mismo idioma que el
 * termómetro del antojo del juego.
 */

import { formatCOP, TOPPINGS_INCLUIDOS, type Ingrediente } from "@/lib/menu";
import { notaDe } from "@/lib/copy";
import { EJES, saborDe } from "@/lib/sabor";
import Reveal from "./Reveal";
import IngImg from "./IngImg";
import { useJuegoOpcional } from "./JuegoProvider";

/* Código de COLOR por grupo — el mismo que los pasos del hero y el juego */
const GRUPOS = [
  { k: "base" as const, titulo: "Las bases", nota: "elige 1", tono: "oro" },
  { k: "proteina" as const, titulo: "Las proteínas", nota: "hasta 2", tono: "pomodoro" },
  { k: "topping" as const, titulo: "Los toppings", nota: `${TOPPINGS_INCLUIDOS} de cortesía`, tono: "perejil" },
];

/* La hebrita que se DIBUJA bajo el título de cada grupo al entrar en viewport
   (reusa .hebra-draw-path: el CSS de Reveal ya sabe dibujarla) */
function HiloTitulo() {
  return (
    <svg className="carta__hilo" viewBox="0 0 130 12" aria-hidden preserveAspectRatio="none">
      <path
        className="hebra-path hebra-draw-path"
        pathLength={1}
        stroke="currentColor"
        strokeWidth={3}
        d="M3 6 Q 20 0 36 6 T 68 6 T 100 6 T 127 6"
      />
    </svg>
  );
}

export default function CartaCompleta({
  bases,
  proteinas,
  toppings,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
}) {
  const juego = useJuegoOpcional();
  const porGrupo = { base: bases, proteina: proteinas, topping: toppings };

  return (
    <section className="section" id="carta">
      <div className="container">
        <Reveal>
          <p className="eyebrow">La carta completa</p>
          <h2>
            Todo lo que puede entrar en tu caja
          </h2>
          <p className="lead">
            Precios por ingrediente. Las salsas van incluidas y los{" "}
            {TOPPINGS_INCLUIDOS} acompañantes más caros van por cuenta
            de la casa, siempre.
          </p>
        </Reveal>

        {GRUPOS.map((g) => {
          const items = porGrupo[g.k].filter((i) => i.activo);
          if (!items.length) return null;
          const esTopping = g.k === "topping";
          return (
            <Reveal key={g.k}>
              <div className="carta__grupo">
                <h3 className={`carta__h carta__h--${g.tono}`}>
                  <span className="carta__htxt">
                    {g.titulo}
                    <HiloTitulo />
                  </span>
                  <span className="badge badge--nota">{g.nota}</span>
                </h3>
                {esTopping ? (
                  /* TOPPINGS COMPACTOS: la nota sensorial vive en el juego/armador; aquí la
                     carta respira — chips densos, el sprite hace su twirl al tocarlo */
                  <ul className="carta__chips">
                    {items.map((ing) => (
                      <li
                        className={`carta__chip ${ing.agotado ? "is-agotado" : ""}`}
                        key={ing.id}
                      >
                        <IngImg ing={ing} className="carta__chipart" />
                        <b>{ing.nombre}</b>
                        <span className="carta__chipprecio">
                          {ing.agotado ? "agotado" : ing.precio === 0 ? "gratis" : `+${formatCOP(ing.precio)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="carta__lista">
                    {items.map((ing) => {
                      const s = saborDe(ing);
                      const eje = EJES.reduce((a, b) => (s[b.k] > s[a.k] ? b : a), EJES[0]);
                      return (
                        <li className={`carta__item ${ing.agotado ? "is-agotado" : ""}`} key={ing.id}>
                          <IngImg ing={ing} className="carta__art" />
                          <div className="carta__txt">
                            <b>
                              {ing.nombre}
                              <i
                                className="carta__dot"
                                style={{ background: eje.color }}
                                title={eje.label}
                                aria-label={eje.label}
                              />
                            </b>
                            <span className="carta__nota">{notaDe(ing)}</span>
                          </div>
                          <span className="carta__precio">
                            {ing.agotado
                              ? "agotado hoy"
                              : ing.precio === 0
                                ? "gratis"
                                : g.k === "base"
                                  ? formatCOP(ing.precio)
                                  : `+${formatCOP(ing.precio)}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Reveal>
          );
        })}

        {juego && (
          <Reveal>
            <div className="carta__cta">
              <button type="button" className="btn btn--primary" onClick={() => juego.abrir()}>
                <span>Enredar la mía</span>
              </button>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
