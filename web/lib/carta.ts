/**
 * LA CARTA DE PAPAGHETTI — la de verdad, la que se imprime y se cobra.
 *
 * Vive aparte de menu.ts (que son los tipos y la maquinaria) porque esto es lo que
 * cambia: precios, platos, gramajes. Todo en un archivo que se puede leer de arriba
 * abajo y comparar con la carta impresa sin bucear en el código.
 *
 * ESTRUCTURA
 *  · BASES        — se elige una. Trae el precio de arranque del plato.
 *  · SALSAS       — se eligen libremente y NO se cobran. Van dentro del grupo
 *                   "toppings" del cerebro (para no partir el modelo de datos) pero
 *                   con `categoria: "salsa"`: no cuestan y NO gastan los dos
 *                   acompañantes de cortesía.
 *  · PROTEINAS    — se cobran completas, se pueden sumar varias.
 *  · ACOMPANANTES — los dos primeros van por cuenta de la casa (TOPPINGS_INCLUIDOS).
 *  · PLATOS       — combos, ensaladas, a la carta y especiales: precio CERRADO.
 *                   Los combos llevan componentes (descuentan despensa); los demás
 *                   son platos de cocina que todavía no tienen ficha técnica.
 */

import type { EnredoInsignia, Ingrediente, Insumo, RecetaItem } from "./menu";

/* ══════════════════════════════════════════════════════════════════════════
   BASES · se elige una
   ══════════════════════════════════════════════════════════════════════════ */
export const BASES: Ingrediente[] = [
  {
    id: "spaghetti-fetuccine",
    nombre: "Spaghetti o fettuccine",
    categoria: "base",
    precio: 15900,
    gramaje: "400 gr",
    emoji: "🍝",
    color: "#EABF6B",
    descripcion: "400 gr de tu elección favorita, bañada en la salsa que más se te antoje.",
    tags: ["clasico"],
    activo: true,
  },
  {
    id: "papa-al-horno",
    nombre: "Papa al horno",
    categoria: "base",
    precio: 17900,
    emoji: "🥔",
    color: "#D9A441",
    descripcion:
      "Cocinada con mantequilla y queso; se añaden tus toppings y se gratina con parmesano al horno 5 minutos.",
    activo: true,
  },
  {
    id: "papa-criolla",
    nombre: "Papa criolla",
    categoria: "base",
    precio: 16900,
    gramaje: "300 gr",
    emoji: "🟡",
    color: "#F2A516",
    descripcion: "300 gr de puro sabor.",
    tags: ["clasico"],
    activo: true,
  },
  {
    id: "papas-super-crunch",
    nombre: "Papas super crunch",
    categoria: "base",
    precio: 16900,
    emoji: "🍟",
    color: "#E9C46A",
    descripcion: "Porción de papas a la francesa previamente apanadas.",
    activo: true,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   SALSAS · incluidas, sin costo y sin gastar los acompañantes de cortesía
   ══════════════════════════════════════════════════════════════════════════ */
export const SALSAS: Ingrediente[] = [
  {
    id: "salsa-prometedora",
    nombre: "Salsa prometedora",
    categoria: "salsa",
    precio: 0,
    emoji: "🍅",
    color: "#C0392B",
    descripcion: "A base de tomate con hierbas finas.",
    activo: true,
  },
  {
    id: "salsa-campeones",
    nombre: "Salsa de campeones",
    categoria: "salsa",
    precio: 0,
    emoji: "🍄",
    color: "#8D6E52",
    descripcion: "Hecha con champiñones.",
    activo: true,
  },
  {
    id: "salsa-papaguetosa",
    nombre: "Salsa papaguetosa",
    categoria: "salsa",
    precio: 0,
    emoji: "🌿",
    color: "#4C9A5A",
    descripcion: "Todas las hierbas finas.",
    activo: true,
  },
  {
    id: "salsa-ne",
    nombre: "Salsa NE",
    categoria: "salsa",
    precio: 0,
    emoji: "🥄",
    color: "#A0522D",
    descripcion: "La salsa del chef.",
    activo: true,
  },
  {
    id: "salsa-guacamole",
    nombre: "Salsa de guacamole",
    categoria: "salsa",
    precio: 0,
    emoji: "🥑",
    color: "#6B8E23",
    activo: true,
  },
  {
    id: "salsa-chimichurri",
    nombre: "Chimichurri",
    categoria: "salsa",
    precio: 0,
    emoji: "🌱",
    color: "#3F7D3F",
    activo: true,
  },
  {
    id: "salsa-picante-casa",
    nombre: "Salsa picante de la casa",
    categoria: "salsa",
    precio: 0,
    emoji: "🌶️",
    color: "#B01E1E",
    tags: ["picante"],
    activo: true,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   PROTEÍNAS · se pueden sumar varias, todas a precio completo
   ══════════════════════════════════════════════════════════════════════════ */
export const PROTEINAS: Ingrediente[] = [
  {
    id: "carne-molida",
    nombre: "Carne molida",
    categoria: "proteina",
    precio: 8000,
    gramaje: "100 gr",
    emoji: "🥩",
    color: "#8B3A2E",
    activo: true,
  },
  {
    id: "pollo-verduras",
    nombre: "Pollo con verduras",
    categoria: "proteina",
    precio: 8000,
    gramaje: "90 gr",
    emoji: "🍗",
    color: "#D98E32",
    descripcion: "Pimentón, brócoli y champiñones.",
    activo: true,
  },
  {
    id: "chicharron",
    nombre: "Chicharrones crocantes",
    categoria: "proteina",
    precio: 9500,
    gramaje: "115 gr",
    emoji: "🥓",
    color: "#7A1F12",
    tags: ["clasico"],
    activo: true,
  },
  {
    id: "nugget-calado",
    nombre: "Nugget calado en coco o piña",
    categoria: "proteina",
    precio: 9500,
    gramaje: "90 gr",
    emoji: "🍤",
    color: "#E0A458",
    activo: true,
  },
  {
    id: "mix-mariscos",
    nombre: "Mix de mariscos",
    categoria: "proteina",
    precio: 14000,
    gramaje: "100 gr",
    emoji: "🦐",
    color: "#E07A5F",
    descripcion: "Camarones, palmitos, calamar, almejas y pescado blanco.",
    tags: ["premium"],
    activo: true,
  },
  {
    id: "trozos-churrasco",
    nombre: "Trozos de churrasco",
    categoria: "proteina",
    precio: 15900,
    gramaje: "160 gr",
    emoji: "🥩",
    color: "#6B2C20",
    tags: ["premium"],
    activo: true,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   ACOMPAÑANTES · los dos primeros van por cuenta de la casa
   ══════════════════════════════════════════════════════════════════════════ */
export const ACOMPANANTES: Ingrediente[] = [
  {
    id: "pepino-encurtido",
    nombre: "Pepino encurtido",
    categoria: "topping",
    precio: 3500,
    emoji: "🥒",
    color: "#6DA34D",
    descripcion: "1 porción.",
    tags: ["veggie"],
    activo: true,
  },
  {
    id: "jalapenos",
    nombre: "Jalapeños",
    categoria: "topping",
    precio: 3500,
    emoji: "🌶️",
    color: "#3F8F3F",
    tags: ["picante", "veggie"],
    activo: true,
  },
  {
    id: "cebolla-crispy",
    nombre: "Cebolla crispy",
    categoria: "topping",
    precio: 4000,
    emoji: "🧅",
    color: "#C98A45",
    descripcion: "Viene apanada.",
    tags: ["veggie"],
    activo: true,
  },
  {
    id: "pico-gallo",
    nombre: "Pico e' gallo",
    categoria: "topping",
    precio: 4000,
    emoji: "🍅",
    color: "#CE4B34",
    tags: ["veggie"],
    activo: true,
  },
  {
    id: "parmesano",
    nombre: "Parmesano",
    categoria: "topping",
    precio: 4500,
    gramaje: "15 gr",
    emoji: "🧀",
    color: "#EFD9A5",
    activo: true,
  },
  {
    id: "tocineta",
    nombre: "Tocineta",
    categoria: "topping",
    precio: 5000,
    emoji: "🥓",
    color: "#A8452F",
    descripcion: "Crocante, 1 porción.",
    activo: true,
  },
  {
    id: "maicitos-queso",
    nombre: "Maicitos con queso",
    categoria: "topping",
    precio: 6000,
    emoji: "🌽",
    color: "#F0C419",
    activo: true,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   PLATOS DE PRECIO CERRADO
   Los COMBOS llevan componentes (descuentan despensa). Ensaladas, a la carta y
   especiales son platos de cocina: se venden a su precio y todavía NO tienen
   ficha técnica — el panel lo avisa como tarea pendiente.
   ══════════════════════════════════════════════════════════════════════════ */
export const PLATOS: EnredoInsignia[] = [
  /* — Combos — */
  {
    id: "enredo-clasico",
    grupo: "combo",
    nombre: "El enredo clásico",
    gancho: "Spaghetti, carne molida, salsa prometedora y parmesano.",
    baseId: "spaghetti-fetuccine",
    proteinaId: "carne-molida",
    toppingIds: ["salsa-prometedora", "parmesano"],
    precio: 28400,
    destacado: true,
    activo: true,
  },
  {
    id: "don-crocante",
    grupo: "combo",
    nombre: "Don crocante",
    gancho: "Papas crunch, nuggets calados en coco, tocineta y pepinos encurtidos.",
    baseId: "papas-super-crunch",
    proteinaId: "nugget-calado",
    toppingIds: ["tocineta", "pepino-encurtido"],
    precio: 34900,
    activo: true,
  },
  {
    id: "la-premium",
    grupo: "combo",
    nombre: "La premium",
    gancho: "Trozos de churrasco, cebolla crispy y tocineta. Pico e' gallo opcional.",
    // Sin base fija: la carta impresa no dice cuál lleva. Se vende a precio cerrado y
    // NO descuenta despensa hasta que Carlos confirme la base (ver tareas del panel).
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 42000,
    activo: true,
  },

  /* — Ensaladas — */
  {
    id: "ensalada-napolitana",
    grupo: "ensalada",
    nombre: "Ensalada napolitana",
    gancho: "Jamón serrano, burrata, cherry confitados, durazno amarillo y rúcula.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 37500,
    activo: true,
  },
  {
    id: "ensalada-crunch",
    grupo: "ensalada",
    nombre: "Ensalada crunch",
    gancho:
      "Nuggets calados, pasta crocante, cherry, pepino, cebolla morada, aguacate, lechuga y salsa de la casa.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 35100,
    activo: true,
  },
  {
    id: "ensalaguetti",
    grupo: "ensalada",
    nombre: "Ensalaguetti",
    gancho: "Chicharrón, zanahoria, remolacha, cebollín, semillas de girasol y cilantro.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 35900,
    activo: true,
  },

  /* — A la carta (van con papa cocida, plátano y chimichurri) — */
  {
    id: "pollo-plancha",
    grupo: "carta",
    nombre: "Pollo a la plancha",
    gancho: "300 gr. Con papa cocida, plátano y chimichurri.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 45000,
    activo: true,
  },
  {
    id: "churrasco",
    grupo: "carta",
    nombre: "Churrasco",
    gancho: "400 gr. Con papa cocida, plátano y chimichurri.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 52000,
    activo: true,
  },
  {
    id: "punta-anca",
    grupo: "carta",
    nombre: "Punta de anca",
    gancho: "330 gr. Con papa cocida, plátano y chimichurri.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 52000,
    activo: true,
  },
  {
    id: "baby-beef",
    grupo: "carta",
    nombre: "Baby beef",
    gancho: "400 gr. Con papa cocida, plátano y chimichurri.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 60000,
    activo: true,
  },

  /* — Especiales — */
  {
    id: "ceviche-chicharron",
    grupo: "especial",
    nombre: "Ceviche de chicharrón",
    gancho:
      "Cebolla morada, limón, cilantro, mango, salsa de tomate y tajadas de plátano verde.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 35900,
    activo: true,
  },
  {
    id: "dedos-pollo",
    grupo: "especial",
    nombre: "Dedos de pollo",
    gancho: "Con salsa a elección.",
    baseId: "",
    proteinaId: "",
    toppingIds: [],
    precio: 40500,
    activo: true,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   LA DESPENSA · materia prima real
   Los costos van VACÍOS a propósito: nadie sabe hoy a cuánto compra Carlos. Se
   llenan solos la primera vez que se registra una entrada con el dinero pagado
   (Inventario → cantidad + $ pagado). Hasta entonces el panel lo pide como tarea.
   ══════════════════════════════════════════════════════════════════════════ */
export const INSUMOS: Insumo[] = [
  // Carbohidratos
  { id: "pasta-seca-g", nombre: "Pasta (spaghetti/fettuccine)", categoria: "carbo", unidad: "g", stock: 6000, parStock: 6000, emoji: "🍝", activo: true },
  { id: "papa-horno-und", nombre: "Papa para hornear", categoria: "carbo", unidad: "und", stock: 40, parStock: 40, emoji: "🥔", activo: true },
  { id: "papa-criolla-lb", nombre: "Papa criolla", categoria: "carbo", unidad: "lb", stock: 30, parStock: 30, emoji: "🟡", activo: true },
  { id: "papa-francesa-lb", nombre: "Papa para francesa", categoria: "carbo", unidad: "lb", stock: 25, parStock: 25, emoji: "🍟", activo: true },
  { id: "apanado-g", nombre: "Harina de apanar", categoria: "carbo", unidad: "g", stock: 3000, parStock: 3000, emoji: "🌾", activo: true },
  // Proteínas
  { id: "carne-molida-g", nombre: "Carne molida", categoria: "proteina", unidad: "g", stock: 4000, parStock: 4000, emoji: "🥩", activo: true },
  { id: "pollo-g", nombre: "Pechuga de pollo", categoria: "proteina", unidad: "g", stock: 4000, parStock: 4000, emoji: "🍗", activo: true },
  { id: "cerdo-g", nombre: "Cerdo para chicharrón", categoria: "proteina", unidad: "g", stock: 4000, parStock: 4000, emoji: "🥓", activo: true },
  { id: "nugget-und", nombre: "Nuggets", categoria: "proteina", unidad: "und", stock: 120, parStock: 120, emoji: "🍤", activo: true },
  { id: "mariscos-g", nombre: "Mix de mariscos", categoria: "proteina", unidad: "g", stock: 2500, parStock: 2500, emoji: "🦐", activo: true },
  { id: "churrasco-g", nombre: "Churrasco (res)", categoria: "proteina", unidad: "g", stock: 4000, parStock: 4000, emoji: "🥩", activo: true },
  { id: "tocineta-g", nombre: "Tocineta", categoria: "proteina", unidad: "g", stock: 1500, parStock: 1500, emoji: "🥓", activo: true },
  // Vegetales y frutas
  { id: "champinon-lb", nombre: "Champiñón", categoria: "vegetal", unidad: "lb", stock: 8, parStock: 8, emoji: "🍄", activo: true },
  { id: "pimenton-lb", nombre: "Pimentón", categoria: "vegetal", unidad: "lb", stock: 4, parStock: 4, emoji: "🫑", activo: true },
  { id: "brocoli-lb", nombre: "Brócoli", categoria: "vegetal", unidad: "lb", stock: 4, parStock: 4, emoji: "🥦", activo: true },
  { id: "cebolla-lb", nombre: "Cebolla", categoria: "vegetal", unidad: "lb", stock: 12, parStock: 12, emoji: "🧅", activo: true },
  { id: "cebolla-morada-lb", nombre: "Cebolla morada", categoria: "vegetal", unidad: "lb", stock: 6, parStock: 6, emoji: "🧅", activo: true },
  { id: "tomate-lb", nombre: "Tomate", categoria: "vegetal", unidad: "lb", stock: 12, parStock: 12, emoji: "🍅", activo: true },
  { id: "pepino-und", nombre: "Pepino", categoria: "vegetal", unidad: "und", stock: 20, parStock: 20, emoji: "🥒", activo: true },
  { id: "jalapeno-g", nombre: "Jalapeños", categoria: "vegetal", unidad: "g", stock: 1000, parStock: 1000, emoji: "🌶️", activo: true },
  { id: "maiz-lata", nombre: "Maíz dulce (lata)", categoria: "vegetal", unidad: "und", stock: 15, parStock: 15, emoji: "🌽", activo: true },
  { id: "aguacate-und", nombre: "Aguacate", categoria: "vegetal", unidad: "und", stock: 15, parStock: 15, emoji: "🥑", activo: true },
  { id: "limon-und", nombre: "Limón", categoria: "vegetal", unidad: "und", stock: 30, parStock: 30, emoji: "🍋", activo: true },
  { id: "cilantro-manojo", nombre: "Cilantro", categoria: "vegetal", unidad: "manojo", stock: 6, parStock: 6, emoji: "🌿", activo: true },
  { id: "pina-und", nombre: "Piña", categoria: "vegetal", unidad: "und", stock: 6, parStock: 6, emoji: "🍍", activo: true },
  { id: "coco-g", nombre: "Coco rallado", categoria: "vegetal", unidad: "g", stock: 1000, parStock: 1000, emoji: "🥥", activo: true },
  // Lácteos
  { id: "parmesano-g", nombre: "Queso parmesano", categoria: "lacteo", unidad: "g", stock: 2000, parStock: 2000, emoji: "🧀", activo: true },
  { id: "mozzarella-g", nombre: "Queso mozzarella", categoria: "lacteo", unidad: "g", stock: 2500, parStock: 2500, emoji: "🧀", activo: true },
  { id: "mantequilla-g", nombre: "Mantequilla", categoria: "lacteo", unidad: "g", stock: 1500, parStock: 1500, emoji: "🧈", activo: true },
  // Salsas y aliños
  { id: "salsa-tomate-l", nombre: "Salsa de tomate", categoria: "salsa", unidad: "l", stock: 5, parStock: 5, emoji: "🥫", activo: true },
  { id: "hierbas-finas-g", nombre: "Hierbas finas", categoria: "salsa", unidad: "g", stock: 600, parStock: 600, emoji: "🌿", activo: true },
  { id: "picante-ml", nombre: "Salsa picante (base)", categoria: "salsa", unidad: "ml", stock: 2000, parStock: 2000, emoji: "🌶️", activo: true },
  // Otros
  { id: "aceite-l", nombre: "Aceite", categoria: "otro", unidad: "l", stock: 12, parStock: 12, emoji: "🫗", activo: true },
];

/* ══════════════════════════════════════════════════════════════════════════
   RECETAS (ficha técnica) · qué gasta UNA porción de cada componente
   Es lo que hace que la carta se auto-agote cuando falta materia prima y lo que
   da el costo real de cada plato. Los gramajes salen de la carta.
   ══════════════════════════════════════════════════════════════════════════ */
export const RECETAS: Record<string, RecetaItem[]> = {
  // — Bases —
  "spaghetti-fetuccine": [
    { insumoId: "pasta-seca-g", cantidad: 130 },
    { insumoId: "aceite-l", cantidad: 0.02 },
  ],
  "papa-al-horno": [
    { insumoId: "papa-horno-und", cantidad: 1 },
    { insumoId: "mantequilla-g", cantidad: 20 },
    { insumoId: "mozzarella-g", cantidad: 40 },
    { insumoId: "parmesano-g", cantidad: 15 },
  ],
  "papa-criolla": [
    { insumoId: "papa-criolla-lb", cantidad: 0.7 },
    { insumoId: "aceite-l", cantidad: 0.05 },
  ],
  "papas-super-crunch": [
    { insumoId: "papa-francesa-lb", cantidad: 0.5 },
    { insumoId: "apanado-g", cantidad: 40 },
    { insumoId: "aceite-l", cantidad: 0.06 },
  ],

  // — Salsas (van incluidas, pero SÍ gastan despensa) —
  "salsa-prometedora": [
    { insumoId: "salsa-tomate-l", cantidad: 0.06 },
    { insumoId: "hierbas-finas-g", cantidad: 3 },
  ],
  "salsa-campeones": [
    { insumoId: "champinon-lb", cantidad: 0.12 },
    { insumoId: "aceite-l", cantidad: 0.01 },
  ],
  "salsa-papaguetosa": [
    { insumoId: "hierbas-finas-g", cantidad: 6 },
    { insumoId: "aceite-l", cantidad: 0.02 },
  ],
  "salsa-ne": [
    { insumoId: "salsa-tomate-l", cantidad: 0.04 },
    { insumoId: "hierbas-finas-g", cantidad: 4 },
  ],
  "salsa-guacamole": [
    { insumoId: "aguacate-und", cantidad: 0.4 },
    { insumoId: "limon-und", cantidad: 0.2 },
    { insumoId: "cilantro-manojo", cantidad: 0.05 },
  ],
  "salsa-chimichurri": [
    { insumoId: "hierbas-finas-g", cantidad: 8 },
    { insumoId: "aceite-l", cantidad: 0.03 },
    { insumoId: "cilantro-manojo", cantidad: 0.05 },
  ],
  "salsa-picante-casa": [{ insumoId: "picante-ml", cantidad: 20 }],

  // — Proteínas —
  "carne-molida": [
    { insumoId: "carne-molida-g", cantidad: 100 },
    { insumoId: "cebolla-lb", cantidad: 0.03 },
    { insumoId: "tomate-lb", cantidad: 0.05 },
  ],
  "pollo-verduras": [
    { insumoId: "pollo-g", cantidad: 90 },
    { insumoId: "pimenton-lb", cantidad: 0.05 },
    { insumoId: "brocoli-lb", cantidad: 0.05 },
    { insumoId: "champinon-lb", cantidad: 0.05 },
  ],
  chicharron: [{ insumoId: "cerdo-g", cantidad: 115 }],
  "nugget-calado": [
    { insumoId: "nugget-und", cantidad: 3 },
    { insumoId: "pina-und", cantidad: 0.1 },
    { insumoId: "coco-g", cantidad: 15 },
  ],
  "mix-mariscos": [{ insumoId: "mariscos-g", cantidad: 100 }],
  "trozos-churrasco": [{ insumoId: "churrasco-g", cantidad: 160 }],

  // — Acompañantes —
  "pepino-encurtido": [{ insumoId: "pepino-und", cantidad: 0.3 }],
  jalapenos: [{ insumoId: "jalapeno-g", cantidad: 25 }],
  "cebolla-crispy": [
    { insumoId: "cebolla-lb", cantidad: 0.15 },
    { insumoId: "apanado-g", cantidad: 25 },
    { insumoId: "aceite-l", cantidad: 0.02 },
  ],
  "pico-gallo": [
    { insumoId: "tomate-lb", cantidad: 0.1 },
    { insumoId: "cebolla-morada-lb", cantidad: 0.05 },
    { insumoId: "cilantro-manojo", cantidad: 0.05 },
    { insumoId: "limon-und", cantidad: 0.2 },
  ],
  parmesano: [{ insumoId: "parmesano-g", cantidad: 15 }],
  tocineta: [{ insumoId: "tocineta-g", cantidad: 40 }],
  "maicitos-queso": [
    { insumoId: "maiz-lata", cantidad: 0.25 },
    { insumoId: "mozzarella-g", cantidad: 30 },
  ],
};

/** Los "toppings" del cerebro = salsas (gratis) + acompañantes (con precio). */
export const TOPPINGS: Ingrediente[] = [...SALSAS, ...ACOMPANANTES];
