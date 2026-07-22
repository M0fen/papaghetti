"use client";

/**
 * LA CAJA, TAMBIÉN EN LA CARTA.
 *
 * Las fichas de los enredos insignia dibujaban un círculo negro con la comida flotando
 * (el <Bowl> viejo): no se parecía en nada a lo que el cliente ve en el juego ni a lo que
 * le llega a la mesa. Esta es la MISMA caja kraft —pared, solapas, banda con wordmark—
 * en CSS/SVG, con los mismos assets horneados adentro y la misma composición del nido:
 * la base hace de cama, la proteína monta encima y los toppings coronan en abanico.
 *
 * Determinista: mismo enredo → misma foto, siempre.
 */

import type { Ingrediente } from "@/lib/menu";
import IngImg from "./IngImg";

export default function CajaMini({
  base,
  proteina,
  toppings,
  size = "mini",
}: {
  base: Ingrediente;
  proteina: Ingrediente;
  toppings: Ingrediente[];
  size?: "mini" | "grande";
}) {
  // Abanico de toppings: ángulos fijos por índice (nada de Math.random → foto reproducible)
  const fan = [
    { x: 26, y: 34, s: 0.62 },
    { x: 72, y: 32, s: 0.62 },
    { x: 49, y: 24, s: 0.56 },
    { x: 12, y: 44, s: 0.5 },
    { x: 86, y: 42, s: 0.5 },
  ];

  return (
    <div className={`cajam ${size === "grande" ? "cajam--grande" : ""}`} aria-hidden>
      <div className="cajam__escena">
        {/* pared interior de la caja */}
        <div className="cajam__pared" />
        {/* solapas abiertas */}
        <div className="cajam__solapa cajam__solapa--izq" />
        <div className="cajam__solapa cajam__solapa--der" />

        {/* la comida, en el orden del nido: cama → héroe → corona */}
        <div className="cajam__nido">
          {toppings.slice(0, 5).map((t, i) => (
            <span
              key={t.id}
              className="cajam__top"
              style={{ left: `${fan[i].x}%`, top: `${fan[i].y}%`, ["--s" as string]: fan[i].s }}
            >
              <IngImg ing={t} />
            </span>
          ))}
          <span className="cajam__cama">
            <IngImg ing={base} />
          </span>
          <span className="cajam__heroe">
            <IngImg ing={proteina} />
          </span>
        </div>

        {/* banda frontal con el wordmark en relieve */}
        <div className="cajam__banda">
          <span>PAPAGHETTI</span>
        </div>
      </div>
      <div className="cajam__sombra" />
    </div>
  );
}
