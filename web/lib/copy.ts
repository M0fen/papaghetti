/**
 * LA NOTA DE CADA INGREDIENTE.
 *
 * "Chicharrón carnudo" es una etiqueta, no un antojo. La investigación de menús es
 * consistente en esto: el lenguaje sensorial es lo que traduce un precio en valor. Cada
 * ingrediente merece una línea que se pueda oír y morder.
 *
 * Vive en código (no en el catálogo) a propósito: no exige migrar la data del dueño y
 * cae a una nota por categoría si él agrega algo nuevo desde el panel.
 */

import type { Ingrediente } from "./menu";

const NOTAS: Record<string, string> = {
  "papa-criolla": "Doradita por fuera, mantequilla por dentro. La papa del Eje.",
  "papa-francesa": "Corte grueso, fritura alta: cruje y no se rinde.",
  spaghetti: "Al dente, enredado a mano, listo para cargar salsa.",
  chicharron: "Carnudo, con su capa que truena. Nada de puro cuero.",
  bolonesa: "Res guisada lento con tomate de la casa. Espesa, no aguada.",
  "pollo-crispy": "Pechuga apanada del día, costra con cráteres.",
  mixta: "Res y cerdo en la misma caja, para los que no saben decidir.",
  champinon: "Salteado en mantequilla hasta que suelta lo suyo.",
  maicitos: "Maíz dulce tibio bajo una capa de queso que se estira.",
  "nuggets-pina": "El dulce que nadie pidió y todo el mundo repite.",
  tocineta: "Crocante hasta el borde, quebradiza al tacto.",
  hogao: "Tomate y cebolla larga sofritos despacio. La base de todo.",
  parmesano: "Rallado grueso encima, que se derrita solo con el vapor.",
  aguacate: "En láminas frías, el contrapeso cremoso de lo frito.",
  perejil: "Picado fresco al final. Levanta la caja entera.",
  "chicharron-crocante": "Puro trueno: el que se come primero, sin querer.",
};

const POR_CATEGORIA: Record<string, string> = {
  base: "La cama de tu caja.",
  proteina: "Lo que la vuelve comida de verdad.",
  topping: "El detalle que la termina.",
  salsa: "Incluida, elige la que quieras.",
};

/**
 * La nota que acompaña a cada ingrediente en la carta.
 *
 * ORDEN: primero lo que dice el CATÁLOGO (la descripción real que escribió el dueño,
 * con sus gramajes), luego la nota de autor, y solo al final el relleno por categoría.
 * Estaba al revés: "400 gr de tu elección favorita" perdía contra "La cama de tu caja",
 * así que la carta enseñaba un texto genérico teniendo el bueno a mano.
 */
export function notaDe(ing: Ingrediente): string {
  const propia = ing.descripcion?.trim();
  if (propia) return ing.gramaje && !propia.includes(ing.gramaje) ? `${ing.gramaje} · ${propia}` : propia;
  if (ing.gramaje) return `${ing.gramaje}. ${NOTAS[ing.id] ?? POR_CATEGORIA[ing.categoria] ?? ""}`.trim();
  return NOTAS[ing.id] ?? POR_CATEGORIA[ing.categoria] ?? "";
}
