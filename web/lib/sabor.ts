/**
 * EL TERMÓMETRO DEL ANTOJO — una firma de Papaghetti que vivía escondida.
 *
 * El perfil de sabor (crocante / cremoso / fresco / dulce) se inventó dentro del juego y
 * solo se veía ahí. Es lenguaje de marca: ningún menú describe sus platos por textura.
 * Ahora vive aquí para que también lo hablen las fichas de los enredos insignia y la
 * carta completa. No hay picante en el catálogo → esos cuatro ejes son los que varían.
 */

import type { Ingrediente } from "./menu";

export type Sabor = { cro: number; cre: number; fre: number; dul: number };

export const EJES = [
  { k: "cro" as const, label: "Crocante", color: "#E8A21E" },
  { k: "cre" as const, label: "Cremoso", color: "#DDBE6A" },
  { k: "fre" as const, label: "Fresco", color: "#8CB856" },
  { k: "dul" as const, label: "Dulce", color: "#DE7A98" },
];

const SABOR_MAP: Record<string, Sabor> = {
  "papa-criolla": { cro: 0.35, cre: 0.8, fre: 0.1, dul: 0.25 },
  "papa-francesa": { cro: 0.95, cre: 0.2, fre: 0, dul: 0.1 },
  spaghetti: { cro: 0.1, cre: 0.75, fre: 0.15, dul: 0.1 },
  chicharron: { cro: 0.95, cre: 0.1, fre: 0, dul: 0 },
  bolonesa: { cro: 0.15, cre: 0.7, fre: 0.25, dul: 0.15 },
  "pollo-crispy": { cro: 0.9, cre: 0.25, fre: 0, dul: 0 },
  mixta: { cro: 0.55, cre: 0.5, fre: 0, dul: 0 },
  champinon: { cro: 0.2, cre: 0.45, fre: 0.75, dul: 0 },
  maicitos: { cro: 0.35, cre: 0.5, fre: 0.2, dul: 0.7 },
  "nuggets-pina": { cro: 0.6, cre: 0.1, fre: 0.35, dul: 0.95 },
  tocineta: { cro: 0.85, cre: 0.1, fre: 0, dul: 0.1 },
  hogao: { cro: 0, cre: 0.5, fre: 0.75, dul: 0.25 },
  parmesano: { cro: 0.25, cre: 0.75, fre: 0, dul: 0 },
  aguacate: { cro: 0, cre: 0.85, fre: 0.7, dul: 0.1 },
  perejil: { cro: 0, cre: 0, fre: 1, dul: 0 },
  "chicharron-crocante": { cro: 1, cre: 0, fre: 0, dul: 0 },
};

/** Perfil de un ingrediente (con defaults por categoría si es nuevo del admin). */
export function saborDe(ing: Ingrediente): Sabor {
  const s = SABOR_MAP[ing.id];
  if (s) return s;
  if (ing.categoria === "base") return { cro: 0.4, cre: 0.5, fre: 0.1, dul: 0.15 };
  if (ing.categoria === "proteina") return { cro: 0.6, cre: 0.3, fre: 0.1, dul: 0.05 };
  return { cro: 0.3, cre: 0.4, fre: 0.4, dul: 0.3 };
}

/** Rasgo dominante de un ingrediente → tema de la reacción en el juego. */
export function rasgoDominante(ing: Ingrediente): keyof Sabor {
  const s = saborDe(ing);
  let best: keyof Sabor = "cre";
  let bv = -1;
  (["cro", "cre", "fre", "dul"] as const).forEach((k) => {
    if (s[k] > bv) {
      bv = s[k];
      best = k;
    }
  });
  return best;
}

/**
 * Perfil de una caja entera, por DOMINANCIA (no promedio): el eje líder llega a 1 y las
 * barras CRECEN al construir. Promediar hacía lo contrario — más ingredientes, barras más
 * cortas — y el valor quedaba invertido.
 */
export function perfilDe(ings: Ingrediente[]): Sabor {
  const agg: Sabor = { cro: 0, cre: 0, fre: 0, dul: 0 };
  for (const i of ings) {
    const s = saborDe(i);
    agg.cro += s.cro;
    agg.cre += s.cre;
    agg.fre += s.fre;
    agg.dul += s.dul;
  }
  const max = Math.max(agg.cro, agg.cre, agg.fre, agg.dul, 0.0001);
  return { cro: agg.cro / max, cre: agg.cre / max, fre: agg.fre / max, dul: agg.dul / max };
}

/** Título evocador según el perfil agregado. */
export function tituloAntojo(p: Sabor, n: number): string {
  if (n === 0) return "TU ANTOJO";
  const orden = (["cro", "cre", "fre", "dul"] as const).slice().sort((a, b) => p[b] - p[a]);
  const top = orden[0];
  const label = { cro: "CROCANTE", cre: "CREMOSO", fre: "FRESCO", dul: "DULCE" }[top];
  const seg = orden[1];
  const equilibrado = p[top] - p[seg] < 0.12 && p[top] > 0.2;
  if (equilibrado) return "BIEN BALANCEADO";
  const seg2 = { cro: "y crocante", cre: "y cremoso", fre: "y fresco", dul: "y dulce" }[seg];
  return p[seg] > 0.35 ? `${label} ${seg2}` : label;
}
