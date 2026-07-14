/**
 * CATÁLOGO — semilla del "cerebro" (single source of truth).
 * En la Fase 2 esto se migra a Supabase; por ahora la web y el configurador
 * ya leen de aquí, así que el modelo de datos nace correcto.
 * Ver PLAN-MAESTRO.md §5.2.
 */

export type Categoria = "base" | "proteina" | "topping";
export type Tag = "veggie" | "picante" | "premium" | "clasico";

export interface Ingrediente {
  id: string;
  nombre: string;
  categoria: Categoria;
  /** Aporte al precio del bowl, en COP. Las bases traen precio de arranque. */
  precio: number;
  emoji: string;
  /** Foto propia (URL o data URL). Si existe, manda sobre el emoji. */
  foto?: string;
  /** Color de la "blob" en el bowl (paleta Papaghetti). */
  color: string;
  descripcion?: string;
  tags?: Tag[];
  activo: boolean;
  /** Unidades disponibles. Si llega a 0, el cerebro marca agotado (Fase 3). */
  stock?: number;
  /** Nivel estándar (par): objetivo de inventario para comparar/reponer. */
  parStock?: number;
  agotado?: boolean;
  /**
   * Receta / ficha técnica (BOM): qué insumos reales consume una porción de
   * este componente. Si tiene receta, cada venta descuenta insumos (no unidades
   * abstractas) y el cerebro auto-agota cuando falta insumo. Ver §Insumos.
   */
  receta?: RecetaItem[];
}

/* ------- Insumos (materia prima real) + Recetas (BOM) ------- */

/** Unidades reales con las que el operador compra/mide su despensa. */
export type UnidadInsumo =
  | "lb"
  | "kg"
  | "g"
  | "l"
  | "ml"
  | "und"
  | "paquete"
  | "porcion"
  | "manojo";
export const UNIDADES: UnidadInsumo[] = [
  "lb",
  "kg",
  "g",
  "l",
  "ml",
  "und",
  "paquete",
  "porcion",
  "manojo",
];
export const unidadLabel: Record<UnidadInsumo, string> = {
  lb: "Libras (lb)",
  kg: "Kilos (kg)",
  g: "Gramos (g)",
  l: "Litros (l)",
  ml: "Mililitros (ml)",
  und: "Unidades",
  paquete: "Paquetes",
  porcion: "Porciones",
  manojo: "Manojos",
};
/** Etiqueta corta para mostrar cantidades: "0.5 lb", "1 paq". */
export const unidadCorta: Record<UnidadInsumo, string> = {
  lb: "lb",
  kg: "kg",
  g: "g",
  l: "l",
  ml: "ml",
  und: "und",
  paquete: "paq",
  porcion: "porc",
  manojo: "manojo",
};

/** Categorías para ordenar la despensa visualmente. */
export type InsumoCategoria =
  | "proteina"
  | "carbo"
  | "vegetal"
  | "lacteo"
  | "salsa"
  | "empaque"
  | "otro";
export const INSUMO_CATEGORIAS: InsumoCategoria[] = [
  "proteina",
  "carbo",
  "vegetal",
  "lacteo",
  "salsa",
  "empaque",
  "otro",
];
export const insumoCatLabel: Record<InsumoCategoria, string> = {
  proteina: "Proteínas",
  carbo: "Carbohidratos",
  vegetal: "Vegetales y frutas",
  lacteo: "Lácteos",
  salsa: "Salsas y aliños",
  empaque: "Empaque e insumos",
  otro: "Otros",
};
export const insumoCatEmoji: Record<InsumoCategoria, string> = {
  proteina: "🥩",
  carbo: "🥔",
  vegetal: "🥬",
  lacteo: "🧀",
  salsa: "🥫",
  empaque: "📦",
  otro: "🧂",
};

/** Materia prima real de la despensa (lo que de verdad se agota). */
export interface Insumo {
  id: string;
  nombre: string;
  categoria?: InsumoCategoria;
  unidad: UnidadInsumo;
  /** Cantidad actual disponible (en la unidad del insumo). */
  stock: number;
  /** Nivel estándar (par): cuánto debería haber al abrir. */
  parStock: number;
  /** Punto de reorden: por debajo de esto se alerta (default = 25% del par). */
  minimo?: number;
  /** Costo por unidad en COP → valor de inventario y costeo de platos. */
  costo?: number;
  emoji?: string;
  activo?: boolean;
}

/** Un renglón de receta: "0.5 lb de papa criolla". */
export interface RecetaItem {
  insumoId: string;
  cantidad: number;
}

/** Formatea una cantidad con su unidad corta: 0.5 → "0.5 lb". */
export const formatCantidad = (cantidad: number, unidad: UnidadInsumo) =>
  `${Number(cantidad.toFixed(3)).toLocaleString("es-CO", {
    maximumFractionDigits: 3,
  })} ${unidadCorta[unidad]}`;

export const BASES: Ingrediente[] = [
  {
    id: "papa-criolla",
    nombre: "Papa criolla dorada",
    categoria: "base",
    precio: 18900,
    emoji: "🥔",
    color: "#F2A516",
    descripcion: "La joya del Eje: dorada, cremosa por dentro.",
    tags: ["clasico"],
    activo: true,
  },
  {
    id: "papa-francesa",
    nombre: "Papa a la francesa",
    categoria: "base",
    precio: 17900,
    emoji: "🍟",
    color: "#E9C46A",
    descripcion: "Crocante afuera, tierna adentro.",
    activo: true,
  },
  {
    id: "spaghetti",
    nombre: "Spaghetti",
    categoria: "base",
    precio: 18900,
    emoji: "🍝",
    color: "#EABF6B",
    descripcion: "La hebra hecha base. Al dente, siempre.",
    tags: ["clasico"],
    activo: true,
  },
];

export const PROTEINAS: Ingrediente[] = [
  {
    id: "chicharron",
    nombre: "Chicharrón carnudo",
    categoria: "proteina",
    precio: 9000,
    emoji: "🥓",
    color: "#7A1F12",
    descripcion: "Orgullo paisa, punto crocante.",
    activo: true,
  },
  {
    id: "bolonesa",
    nombre: "Boloñesa de res",
    categoria: "proteina",
    precio: 11000,
    emoji: "🍖",
    color: "#C8321E",
    descripcion: "Cocción lenta, tomate reducido.",
    tags: ["clasico"],
    activo: true,
  },
  {
    id: "pollo-crispy",
    nombre: "Pollo crispy",
    categoria: "proteina",
    precio: 9000,
    emoji: "🍗",
    color: "#D98324",
    descripcion: "Apanado de la casa, súper crocante.",
    activo: true,
  },
  {
    id: "mixta",
    nombre: "Mixta (res + cerdo)",
    categoria: "proteina",
    precio: 13000,
    emoji: "🍔",
    color: "#8C2A16",
    descripcion: "Para el que quiere todo.",
    tags: ["premium"],
    activo: true,
  },
  {
    id: "champinon",
    nombre: "Champiñón salteado",
    categoria: "proteina",
    precio: 8000,
    emoji: "🍄",
    color: "#4C9A5A",
    descripcion: "Opción veggie, bien sabrosa.",
    tags: ["veggie"],
    activo: true,
  },
];

export const TOPPINGS: Ingrediente[] = [
  {
    id: "maicitos",
    nombre: "Maicitos con queso",
    categoria: "topping",
    precio: 3500,
    emoji: "🌽",
    color: "#F2A516",
    activo: true,
  },
  {
    id: "nuggets-pina",
    nombre: "Nuggets calados en piña",
    categoria: "topping",
    precio: 5000,
    emoji: "🍍",
    color: "#E9B44C",
    tags: ["premium"],
    activo: true,
  },
  {
    id: "tocineta",
    nombre: "Tocineta crocante",
    categoria: "topping",
    precio: 4000,
    emoji: "🥓",
    color: "#8C2A16",
    activo: true,
  },
  {
    id: "hogao",
    nombre: "Hogao de la casa",
    categoria: "topping",
    precio: 2000,
    emoji: "🍅",
    color: "#C8321E",
    activo: true,
  },
  {
    id: "parmesano",
    nombre: "Parmesano",
    categoria: "topping",
    precio: 3000,
    emoji: "🧀",
    color: "#FBF1DE",
    activo: true,
  },
  {
    id: "aguacate",
    nombre: "Aguacate",
    categoria: "topping",
    precio: 4500,
    emoji: "🥑",
    color: "#4C9A5A",
    tags: ["veggie"],
    activo: true,
  },
  {
    id: "perejil",
    nombre: "Perejil fresco",
    categoria: "topping",
    precio: 0,
    emoji: "🌿",
    color: "#4C9A5A",
    tags: ["veggie"],
    activo: true,
  },
  {
    id: "chicharron-crocante",
    nombre: "Chicharrón crocante",
    categoria: "topping",
    precio: 4000,
    emoji: "🍘",
    color: "#7A1F12",
    activo: true,
  },
];

/** Toppings de cortesía incluidos antes de empezar a cobrar extra. */
export const TOPPINGS_INCLUIDOS = 2;

export interface EnredoInsignia {
  id: string;
  nombre: string;
  gancho: string;
  baseId: string;
  proteinaId: string;
  toppingIds: string[];
  precio: number;
  destacado?: boolean;
  /** Foto propia del plato (URL o data URL). */
  foto?: string;
}

export const ENREDOS_INSIGNIA: EnredoInsignia[] = [
  {
    id: "el-criollazo",
    nombre: "El Criollazo",
    gancho: "El Eje Cafetero en un bowl.",
    baseId: "papa-criolla",
    proteinaId: "chicharron",
    toppingIds: ["maicitos", "hogao", "perejil"],
    precio: 28900,
    destacado: true,
  },
  {
    id: "el-enredo-clasico",
    nombre: "El Enredo Clásico",
    gancho: "Spaghetti como Dios manda.",
    baseId: "spaghetti",
    proteinaId: "bolonesa",
    toppingIds: ["parmesano", "perejil"],
    precio: 32900,
  },
  {
    id: "el-antojado",
    nombre: "El Antojado",
    gancho: "Dulce, salado y crocante.",
    baseId: "papa-francesa",
    proteinaId: "pollo-crispy",
    toppingIds: ["nuggets-pina", "tocineta"],
    precio: 30900,
  },
];

/** ------- Pedidos (Fase 3 / POS) ------- */
export type EstadoPedido =
  | "recibido"
  | "cocina"
  | "listo"
  | "entregado"
  | "cancelado";
/** Flujo lineal de cocina (cancelado va aparte). */
export const ESTADOS: EstadoPedido[] = ["recibido", "cocina", "listo", "entregado"];
export const estadoLabel: Record<EstadoPedido, string> = {
  recibido: "Recibido",
  cocina: "En cocina",
  listo: "Listo 🔔",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
export const nextEstado = (e: EstadoPedido): EstadoPedido =>
  ESTADOS[Math.min(ESTADOS.length - 1, Math.max(0, ESTADOS.indexOf(e)) + 1)];

export type TipoServicio = "mesa" | "llevar" | "domicilio";
export const TIPOS: TipoServicio[] = ["mesa", "llevar", "domicilio"];
export const tipoLabel: Record<TipoServicio, string> = {
  mesa: "Mesa",
  llevar: "Para llevar",
  domicilio: "Domicilio",
};
export const tipoIcon: Record<TipoServicio, string> = {
  mesa: "🍽️",
  llevar: "🥡",
  domicilio: "🛵",
};

export type EstadoPago = "pendiente" | "pagado";
export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";
export const METODOS: MetodoPago[] = ["efectivo", "tarjeta", "transferencia"];
export const metodoLabel: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export interface Pedido {
  id: string;
  creadoEn: string; // ISO
  canal: "web" | "qr" | "salon";
  tipo: TipoServicio;
  mesa?: number;
  /** Referencia de quién pide: nombre y/o teléfono (WhatsApp). */
  cliente?: string;
  telefono?: string;
  estado: EstadoPedido;
  pago: EstadoPago;
  metodoPago?: MetodoPago;
  base: string;
  proteina: string;
  toppings: string[];
  subtotal: number;
  impuesto: number;
  propina: number;
  descuento: number;
  total: number; // subtotal + impuesto + propina − descuento
  /** Costo de insumos (COGS) según receta, congelado al crear el pedido. */
  costo?: number;
}

/* ------- Contabilidad: movimientos (compras + gastos) ------- */
/** Las ventas viven en `pedidos`; aquí van las SALIDAS de dinero. */
export type TipoMovimiento = "compra" | "gasto";
export type GastoCategoria =
  | "insumos"
  | "arriendo"
  | "nomina"
  | "servicios"
  | "domicilios"
  | "equipos"
  | "marketing"
  | "otro";
export const GASTO_CATEGORIAS: GastoCategoria[] = [
  "insumos",
  "arriendo",
  "nomina",
  "servicios",
  "domicilios",
  "equipos",
  "marketing",
  "otro",
];
export const gastoCatLabel: Record<GastoCategoria, string> = {
  insumos: "Insumos / mercado",
  arriendo: "Arriendo",
  nomina: "Nómina / personal",
  servicios: "Servicios (luz, agua, gas, internet)",
  domicilios: "Domicilios / plataformas",
  equipos: "Equipos y menaje",
  marketing: "Marketing",
  otro: "Otro",
};
export const gastoCatEmoji: Record<GastoCategoria, string> = {
  insumos: "🧺",
  arriendo: "🏠",
  nomina: "👥",
  servicios: "💡",
  domicilios: "🛵",
  equipos: "🍳",
  marketing: "📣",
  otro: "🧾",
};

export interface Movimiento {
  id: string;
  fecha: string; // ISO
  tipo: TipoMovimiento;
  concepto: string;
  monto: number; // COP (positivo = dinero que salió)
  categoria: GastoCategoria;
  /** Solo para compras de despensa. */
  insumoId?: string;
  cantidad?: number;
}

/* ------- Períodos para reportes/contabilidad ------- */
export type Periodo = "hoy" | "semana" | "mes" | "anio";
export const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "anio", label: "Año" },
];
export const periodoNombre: Record<Periodo, string> = {
  hoy: "hoy",
  semana: "esta semana",
  mes: "este mes",
  anio: "este año",
};
/** Inicio del período (semana arranca el lunes). */
export function inicioDe(periodo: Periodo, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (periodo === "hoy") return d;
  if (periodo === "semana") {
    const dow = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - dow);
    return d;
  }
  if (periodo === "mes") {
    d.setDate(1);
    return d;
  }
  // año
  return new Date(d.getFullYear(), 0, 1);
}
export const enPeriodo = (iso: string, periodo: Periodo, now: Date = new Date()): boolean =>
  new Date(iso) >= inicioDe(periodo, now);

/** ------- Leads / CRM (Fase 3.5) ------- */
export type EstadoLead = "nuevo" | "contactado" | "cliente" | "descartado";
export const LEAD_ESTADOS: EstadoLead[] = [
  "nuevo",
  "contactado",
  "cliente",
  "descartado",
];
export const leadEstadoLabel: Record<EstadoLead, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  cliente: "Cliente",
  descartado: "Descartado",
};

export interface Lead {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  canal: "web" | "qr" | "manual";
  mensaje?: string;
  estado: EstadoLead;
  creadoEn: string;
}

/** ------- Promociones configurables por el operador (se ven en el sitio) ------- */
export type PromoTono = "oro" | "pomodoro" | "perejil";
export const PROMO_TONOS: PromoTono[] = ["oro", "pomodoro", "perejil"];
export interface Promo {
  id: string;
  texto: string;
  emoji?: string;
  /** Color de acento de la tarjeta/banner. */
  tono: PromoTono;
  /** Si true, aparece en la barra superior del sitio (anuncio). */
  banner: boolean;
  activo: boolean;
}

/** ------- Ajustes del negocio (una sola fuente para sitio + panel) ------- */
export interface Ajustes {
  negocio: string;
  whatsapp: string; // formato 57...
  direccion: string;
  horarios: string;
  numMesas: number;
  impuestoPct: number; // p. ej. 8 (impoconsumo Colombia)
  propinaSugeridaPct: number; // propina sugerida (voluntaria)
  /** El operador puede cerrar el negocio (el sitio muestra "cerrado"). */
  abierto: boolean;
  instagram: string; // handle sin @
  costoDomicilio: number; // COP
  pedidoMinimo: number; // COP
  /** Promos que el operador enciende/apaga; se reflejan en el sitio. */
  promos: Promo[];
}
export const SEED_PROMOS: Promo[] = [
  {
    id: "promo-2x1-martes",
    texto: "Martes de enredo: 2x1 en toppings premium",
    emoji: "🔥",
    tono: "pomodoro",
    banner: true,
    activo: true,
  },
  {
    id: "promo-combo-estudiante",
    texto: "Combo estudiante: bowl + gaseosa desde $24.900",
    emoji: "🎓",
    tono: "oro",
    banner: false,
    activo: true,
  },
];
export const SEED_AJUSTES: Ajustes = {
  negocio: "Papaghetti",
  whatsapp: "573001112233",
  direccion: "Zona Circunvalar, Pereira, Risaralda",
  horarios: "Lun a Dom · 12:00 m – 10:00 pm",
  numMesas: 10,
  impuestoPct: 8,
  propinaSugeridaPct: 10,
  abierto: true,
  instagram: "papaghetti.pereira",
  costoDomicilio: 5000,
  pedidoMinimo: 20000,
  promos: SEED_PROMOS,
};

/** ------- Despensa: insumos reales de la semilla ------- */
export const SEED_INSUMOS: Insumo[] = [
  { id: "papa-criolla-lb", nombre: "Papa criolla", categoria: "carbo", unidad: "lb", stock: 40, parStock: 40, costo: 3500, emoji: "🥔", activo: true },
  { id: "papa-francesa-lb", nombre: "Papa para francesa", categoria: "carbo", unidad: "lb", stock: 35, parStock: 35, costo: 2800, emoji: "🍟", activo: true },
  { id: "spaghetti-paq", nombre: "Spaghetti (paq 500g)", categoria: "carbo", unidad: "paquete", stock: 4, parStock: 12, costo: 4500, emoji: "🍝", activo: true },
  { id: "carne-res-lb", nombre: "Carne de res molida", categoria: "proteina", unidad: "lb", stock: 18, parStock: 20, costo: 14000, emoji: "🥩", activo: true },
  { id: "cerdo-lb", nombre: "Cerdo (chicharrón)", categoria: "proteina", unidad: "lb", stock: 16, parStock: 18, costo: 12000, emoji: "🥓", activo: true },
  { id: "pollo-lb", nombre: "Pollo pechuga", categoria: "proteina", unidad: "lb", stock: 20, parStock: 22, costo: 9000, emoji: "🍗", activo: true },
  { id: "tocineta-paq", nombre: "Tocineta (paq)", categoria: "proteina", unidad: "paquete", stock: 2, parStock: 6, costo: 8000, emoji: "🥓", activo: true },
  { id: "champinon-lb", nombre: "Champiñón", categoria: "vegetal", unidad: "lb", stock: 8, parStock: 10, costo: 11000, emoji: "🍄", activo: true },
  { id: "maiz-lata", nombre: "Maíz dulce (lata)", categoria: "vegetal", unidad: "und", stock: 12, parStock: 15, costo: 4000, emoji: "🌽", activo: true },
  { id: "pina-und", nombre: "Piña", categoria: "vegetal", unidad: "und", stock: 6, parStock: 8, costo: 3000, emoji: "🍍", activo: true },
  { id: "tomate-lb", nombre: "Tomate", categoria: "vegetal", unidad: "lb", stock: 22, parStock: 24, costo: 3000, emoji: "🍅", activo: true },
  { id: "cebolla-lb", nombre: "Cebolla", categoria: "vegetal", unidad: "lb", stock: 20, parStock: 20, costo: 2500, emoji: "🧅", activo: true },
  { id: "aguacate-und", nombre: "Aguacate", categoria: "vegetal", unidad: "und", stock: 14, parStock: 16, costo: 2000, emoji: "🥑", activo: true },
  { id: "perejil-manojo", nombre: "Perejil", categoria: "vegetal", unidad: "manojo", stock: 5, parStock: 6, costo: 1500, emoji: "🌿", activo: true },
  { id: "parmesano-g", nombre: "Queso parmesano", categoria: "lacteo", unidad: "g", stock: 1800, parStock: 2000, costo: 60, emoji: "🧀", activo: true },
  { id: "aceite-l", nombre: "Aceite", categoria: "otro", unidad: "l", stock: 10, parStock: 12, costo: 12000, emoji: "🫗", activo: true },
];

/**
 * Recetas semilla (BOM): cuánto insumo consume UNA porción de cada componente.
 * Es la "ficha técnica" que estandariza el plato y descuenta la despensa real.
 */
export const SEED_RECETAS: Record<string, RecetaItem[]> = {
  // Bases
  "papa-criolla": [{ insumoId: "papa-criolla-lb", cantidad: 0.5 }, { insumoId: "aceite-l", cantidad: 0.05 }],
  "papa-francesa": [{ insumoId: "papa-francesa-lb", cantidad: 0.5 }, { insumoId: "aceite-l", cantidad: 0.05 }],
  "spaghetti": [{ insumoId: "spaghetti-paq", cantidad: 0.2 }, { insumoId: "aceite-l", cantidad: 0.02 }],
  // Proteínas
  "chicharron": [{ insumoId: "cerdo-lb", cantidad: 0.35 }],
  "bolonesa": [{ insumoId: "carne-res-lb", cantidad: 0.3 }, { insumoId: "tomate-lb", cantidad: 0.15 }, { insumoId: "cebolla-lb", cantidad: 0.05 }],
  "pollo-crispy": [{ insumoId: "pollo-lb", cantidad: 0.35 }],
  "mixta": [{ insumoId: "carne-res-lb", cantidad: 0.2 }, { insumoId: "cerdo-lb", cantidad: 0.2 }],
  "champinon": [{ insumoId: "champinon-lb", cantidad: 0.3 }],
  // Toppings
  "maicitos": [{ insumoId: "maiz-lata", cantidad: 0.25 }, { insumoId: "parmesano-g", cantidad: 15 }],
  "nuggets-pina": [{ insumoId: "pina-und", cantidad: 0.15 }],
  "tocineta": [{ insumoId: "tocineta-paq", cantidad: 0.1 }],
  "hogao": [{ insumoId: "tomate-lb", cantidad: 0.1 }, { insumoId: "cebolla-lb", cantidad: 0.05 }],
  "parmesano": [{ insumoId: "parmesano-g", cantidad: 20 }],
  "aguacate": [{ insumoId: "aguacate-und", cantidad: 0.5 }],
  "perejil": [{ insumoId: "perejil-manojo", cantidad: 0.1 }],
  "chicharron-crocante": [{ insumoId: "cerdo-lb", cantidad: 0.1 }],
};

/** ------- Historial de cambios (auditoría) + deshacer/rehacer ------- */
export interface HistItem {
  id: string;
  fecha: string; // ISO
  texto: string;
  /** true si la entrada fue un deshacer/rehacer (para estilizar). */
  meta?: boolean;
}

/** Forma del catálogo completo (lo que vive en el "cerebro"). */
export interface Catalog {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  insumos: Insumo[];
  enredos: EnredoInsignia[];
  pedidos: Pedido[];
  movimientos: Movimiento[];
  leads: Lead[];
  ajustes: Ajustes;
  /** Bitácora de acciones (más reciente primero). */
  historial?: HistItem[];
  /** Pilas de snapshots para deshacer/rehacer (sin sus propias pilas). */
  undo?: Catalog[];
  redo?: Catalog[];
}

const prep = (list: Ingrediente[], s: number): Ingrediente[] =>
  list.map((i) => ({
    ...i,
    stock: i.stock ?? s,
    parStock: i.parStock ?? s,
    receta: i.receta ?? SEED_RECETAS[i.id] ?? [],
  }));

/** Semilla: estado inicial del catálogo. Se persiste y edita en Fase 2/3. */
export const SEED_CATALOG: Catalog = {
  bases: prep(BASES, 40),
  proteinas: prep(PROTEINAS, 30),
  toppings: prep(TOPPINGS, 24),
  insumos: SEED_INSUMOS,
  enredos: ENREDOS_INSIGNIA,
  pedidos: [],
  movimientos: [],
  leads: [],
  ajustes: SEED_AJUSTES,
};

/** Umbral para alertar "poco stock" en inventario (unidades abstractas). */
export const STOCK_BAJO = 8;

/** Punto de reorden efectivo de un insumo (mínimo explícito o 25% del par). */
export const insumoMinimo = (i: Insumo): number =>
  typeof i.minimo === "number" ? i.minimo : Math.round(i.parStock * 0.25);
export const insumoBajo = (i: Insumo): boolean => i.stock <= insumoMinimo(i);

/** Costo de una receta (ficha técnica) dado el mapa de insumos por id. */
export const costoReceta = (
  receta: RecetaItem[] | undefined,
  insumosById: Map<string, Insumo>
): number =>
  (receta ?? []).reduce((s, r) => {
    const ins = insumosById.get(r.insumoId);
    return s + (ins?.costo ?? 0) * r.cantidad;
  }, 0);

/** Helpers */
export const TODOS: Ingrediente[] = [...BASES, ...PROTEINAS, ...TOPPINGS];
export const byId = (id: string) => TODOS.find((i) => i.id === id);

/** Busca un ingrediente por id dentro de un catálogo dado (versión "en vivo"). */
export const findIn = (catalog: Catalog, id: string): Ingrediente | undefined =>
  [...catalog.bases, ...catalog.proteinas, ...catalog.toppings].find(
    (i) => i.id === id
  );

export const formatCOP = (valor: number) =>
  "$" + valor.toLocaleString("es-CO", { maximumFractionDigits: 0 });
