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

const GRUPOS = [
  { k: "base" as const, titulo: "Las bases", nota: "elige 1" },
  { k: "proteina" as const, titulo: "Las proteínas", nota: "hasta 2" },
  { k: "topping" as const, titulo: "Los toppings", nota: `${TOPPINGS_INCLUIDOS} de cortesía` },
];

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
          <h2 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", margin: "10px 0 6px" }}>
            Todo lo que puede entrar en tu caja
          </h2>
          <p className="lead">
            Precios por ingrediente. Los primeros {TOPPINGS_INCLUIDOS} toppings van por cuenta
            de la casa, siempre.
          </p>
        </Reveal>

        {GRUPOS.map((g) => {
          const items = porGrupo[g.k].filter((i) => i.activo);
          if (!items.length) return null;
          return (
            <Reveal key={g.k}>
              <div className="carta__grupo">
                <h3 className="carta__h">
                  {g.titulo} <span className="badge">{g.nota}</span>
                </h3>
                <ul className="carta__lista">
                  {items.map((ing) => {
                    const s = saborDe(ing);
                    const eje = EJES.reduce((a, b) => (s[b.k] > s[a.k] ? b : a), EJES[0]);
                    return (
                      <li className={`carta__item ${ing.agotado ? "is-agotado" : ""}`} key={ing.id}>
                        <IngImg ing={ing} className="carta__art" />
                        <div className="carta__txt">
                          <b>{ing.nombre}</b>
                          <span className="carta__nota">{notaDe(ing)}</span>
                          <span className="carta__eje" style={{ color: eje.color }}>
                            {eje.label}
                          </span>
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
