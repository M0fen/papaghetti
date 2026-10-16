import { Fragment } from "react";
import type { Ingrediente } from "@/lib/menu";
import type { CSSVars } from "@/lib/cssVars";
import IngImg from "./IngImg";

/**
 * Bowl que se va "armando": un nido de noodles con el color de la base y,
 * encima, la proteína y los toppings que caen y se apilan (golden-angle scatter),
 * cada uno con micro-rebote al añadirse.
 */
export default function Bowl({
  bases,
  proteinas,
  toppings,
  mini = false,
}: {
  /**
   * Una o dos (Ajustes → Cobro y servicio), en el orden de la carta. Vacía solo si la
   * carta no trae ninguna: antes recibía UNA base obligatoria y, sin ella, reventaba.
   */
  bases: Ingrediente[];
  /** Cero, una o varias: el plato sin proteína también existe. */
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  mini?: boolean;
}) {
  // proteínas primero (centro), luego toppings hacia afuera
  const bits = [...proteinas, ...toppings];
  /* Con dos bases las hebras se alternan entre sus colores: el "mitad y mitad" se VE en
     el bol. Con una, todas llevan el suyo, exactamente como siempre. */
  const hebra = (k: number) => bases[k % bases.length].color;

  return (
    <div className={`bowl3 ${mini ? "bowl3--mini" : ""}`} aria-hidden>
      <div className="bowl3__vessel">
        {/* Nido de noodles — su color ES la base elegida */}
        {bases.length > 0 && (
          <svg className="bowl3__noodles" viewBox="0 0 200 200" fill="none">
            <g strokeWidth={7} strokeLinecap="round">
              <path stroke={hebra(0)} d="M40 120 C 30 80, 90 70, 100 100 S 170 90, 160 130 S 90 160, 100 120 S 40 150, 55 110" opacity="0.9" />
              <path stroke={hebra(1)} d="M55 100 C 70 70, 140 80, 130 110 S 60 130, 80 95" opacity="0.7" />
              <path stroke={hebra(2)} d="M45 135 C 80 160, 150 150, 150 115 S 95 95, 115 135" opacity="0.8" />
              <path stroke={hebra(3)} d="M70 90 C 110 75, 150 100, 135 130" opacity="0.55" />
            </g>
          </svg>
        )}

        {/* Proteína + toppings apilados */}
        <div className="bowl3__pile">
          {bits.map((ing, i) => {
            const ang = i * 137.5 * (Math.PI / 180);
            const r = Math.min(34, i === 0 ? 0 : 10 + i * 4.5);
            const left = 50 + Math.cos(ang) * r;
            const top = 46 + Math.sin(ang) * r;
            return (
              <span
                key={ing.id}
                className="bowl3__bit"
                style={{ left: `${left}%`, top: `${top}%`, "--i": i } as CSSVars}
                title={ing.nombre}
              >
                <IngImg ing={ing} className="bowl3__img" claseEmoji="bowl3__emoji" />
              </span>
            );
          })}
        </div>

        <div className="bowl3__shine" />
      </div>
      {bases.length > 0 && (
        <p className="bowl3__base">
          {bases.map((b, i) => (
            <Fragment key={b.id}>
              {i > 0 && " / "}
              <IngImg ing={b} className="bowl3__baseimg" claseEmoji="bowl3__emoji" /> {b.nombre}
            </Fragment>
          ))}
        </p>
      )}
    </div>
  );
}
