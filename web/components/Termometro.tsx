"use client";

/**
 * El TERMÓMETRO DEL ANTOJO fuera del juego: describe un plato por TEXTURA
 * (crocante / cremoso / fresco / dulce) en vez de por lista de ingredientes.
 * Es la firma de la casa — no tenía sentido que solo existiera dentro del canvas.
 */

import type { Ingrediente } from "@/lib/menu";
import { EJES, perfilDe, tituloAntojo } from "@/lib/sabor";

export default function Termometro({ ings }: { ings: Ingrediente[] }) {
  if (!ings.length) return null;
  const p = perfilDe(ings);
  return (
    <div className="termo">
      <span className="termo__titulo">{tituloAntojo(p, ings.length)}</span>
      <div className="termo__barras" aria-hidden>
        {EJES.map((e) => (
          <span className="termo__eje" key={e.k} title={e.label}>
            <i
              style={{
                width: `${Math.max(8, Math.round(p[e.k] * 100))}%`,
                background: e.color,
              }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
