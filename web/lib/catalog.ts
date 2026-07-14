import fs from "node:fs/promises";
import path from "node:path";
import {
  supabaseEnabled,
  supabaseAdmin,
  CATALOG_TABLE,
  CATALOG_ID,
} from "./supabase";
import {
  SEED_CATALOG,
  SEED_AJUSTES,
  SEED_INSUMOS,
  SEED_RECETAS,
  TOPPINGS_INCLUIDOS,
  nextEstado,
  type Catalog,
  type Ingrediente,
  type EnredoInsignia,
  type Pedido,
  type Lead,
  type EstadoLead,
  type TipoServicio,
  type MetodoPago,
  type Ajustes,
  type Categoria,
  costoReceta,
  formatCOP,
  type Insumo,
  type InsumoCategoria,
  type RecetaItem,
  type Promo,
  type UnidadInsumo,
  type Movimiento,
  type GastoCategoria,
  type HistItem,
} from "./menu";

const GRUPO: Record<Categoria, "bases" | "proteinas" | "toppings"> = {
  base: "bases",
  proteina: "proteinas",
  topping: "toppings",
};
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24) || "item";

/**
 * EL CEREBRO — capa de acceso a datos del catálogo (single source of truth).
 *
 * Hoy persiste en un JSON local (data/catalog.json) para operar ya, en el local.
 * Para producción/multi-canal, activar Supabase: setear SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE y reemplazar read()/write() por el adaptador
 * (esquema SQL en PLAN-MAESTRO.md §5.2 / README). La interfaz pública
 * (getCatalog / updateIngrediente / updateEnredo) NO cambia.
 */

// En Vercel serverless el FS del proyecto es de solo lectura → usamos /tmp
// (efímero) para no romper. En local, data/ persiste de verdad.
// Persistencia real en producción = Supabase (se activa solo con las env vars).
const DATA_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "catalog.json");

/**
 * Migración/relleno forward-compatible: aplica defaults de campos nuevos sobre
 * un catálogo leído (archivo o Supabase). Idempotente.
 */
function migrate(cat: Catalog): Catalog {
  cat.pedidos ??= []; // Fase 3
  cat.movimientos ??= []; // Fase 4 · contabilidad
  cat.leads ??= []; //   Fase 3.5
  cat.historial ??= []; // Fase 4.5 · auditoría
  cat.undo ??= [];
  cat.redo ??= [];
  // insumos (despensa real): si el catálogo es previo, siembra la despensa
  if (!Array.isArray(cat.insumos) || cat.insumos.length === 0) {
    cat.insumos = structuredClone(SEED_INSUMOS);
  } else {
    // backfill de categoría para insumos previos (agrupación del inventario)
    const seedCat = new Map(SEED_INSUMOS.map((i) => [i.id, i.categoria]));
    cat.insumos.forEach((i) => {
      if (!i.categoria) i.categoria = seedCat.get(i.id) ?? "otro";
    });
  }
  // ajustes: mezcla defaults para que campos nuevos (promos/banner/…) existan
  cat.ajustes = { ...structuredClone(SEED_AJUSTES), ...(cat.ajustes ?? {}) };
  if (!Array.isArray(cat.ajustes.promos)) cat.ajustes.promos = structuredClone(SEED_AJUSTES.promos);
  // ingredientes previos: parStock por defecto y receta sembrada si falta
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    cat[g].forEach((i) => {
      if (typeof i.parStock !== "number") i.parStock = i.stock ?? 20;
      if (!Array.isArray(i.receta)) i.receta = structuredClone(SEED_RECETAS[i.id] ?? []);
    });
  }
  // pedidos previos → valores por defecto (mutación in situ)
  cat.pedidos.forEach((p) => {
    const q = p as unknown as Record<string, unknown>;
    if (!q.tipo) q.tipo = "domicilio";
    if (!q.pago) q.pago = "pendiente";
    if (typeof q.subtotal !== "number") q.subtotal = (q.total as number) ?? 0;
    if (typeof q.impuesto !== "number") q.impuesto = 0;
    if (typeof q.propina !== "number") q.propina = 0;
    if (typeof q.descuento !== "number") q.descuento = 0;
  });
  return cat;
}

async function read(): Promise<Catalog> {
  return supabaseEnabled() ? readSupabase() : readFile();
}

async function write(cat: Catalog): Promise<void> {
  return supabaseEnabled() ? writeSupabase(cat) : writeFile(cat);
}

/* --- Backend: archivo local / /tmp (dev y fallback) --- */
async function readFile(): Promise<Catalog> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return migrate(JSON.parse(raw) as Catalog);
  } catch {
    // Primer arranque: aún no hay archivo → arrancamos desde la semilla.
    return structuredClone(SEED_CATALOG);
  }
}

async function writeFile(cat: Catalog): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(cat, null, 2), "utf8");
  } catch (e) {
    // FS de solo lectura (p. ej. Vercel) → no rompemos la request.
    console.error("catalog write falló:", e);
  }
}

/* --- Backend: Supabase (persistencia real). El cerebro es 1 documento jsonb --- */
async function readSupabase(): Promise<Catalog> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from(CATALOG_TABLE)
      .select("data")
      .eq("id", CATALOG_ID)
      .maybeSingle();
    if (error) throw error;
    if (data?.data) return migrate(data.data as Catalog);
    // Primera vez: siembra el documento y devuélvelo.
    const seed = structuredClone(SEED_CATALOG);
    await writeSupabase(seed);
    return seed;
  } catch (e) {
    console.error("supabase read falló, uso semilla:", (e as Error)?.message ?? e);
    return structuredClone(SEED_CATALOG);
  }
}

async function writeSupabase(cat: Catalog): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from(CATALOG_TABLE)
      .upsert({ id: CATALOG_ID, data: cat, updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch (e) {
    console.error("supabase write falló:", (e as Error)?.message ?? e);
  }
}

/* ------- Historial + deshacer/rehacer (snapshots) ------- */
const UNDO_CAP = 12; // profundidad de deshacer/rehacer
const HIST_CAP = 120; // entradas visibles del historial

/** Copia del catálogo SIN sus propias pilas ni historial (evita recursión/peso). */
function stripSnap(cat: Catalog): Catalog {
  return { ...cat, undo: undefined, redo: undefined, historial: undefined };
}

function nuevaEntrada(texto: string, meta = false): HistItem {
  return { id: crypto.randomUUID().slice(0, 6), fecha: new Date().toISOString(), texto, meta };
}

/**
 * Persiste `cat` como una acción: guarda un snapshot del estado ANTERIOR en la
 * pila de deshacer, limpia rehacer y agrega la entrada al historial.
 * Reemplaza a write() en todas las mutaciones del operador.
 */
async function commit(cat: Catalog, texto?: string): Promise<void> {
  const prev = await read(); // estado persistido (pre-mutación)
  cat.undo = [...(prev.undo ?? []), stripSnap(prev)].slice(-UNDO_CAP);
  cat.redo = [];
  if (texto) cat.historial = [nuevaEntrada(texto), ...(cat.historial ?? [])].slice(0, HIST_CAP);
  await write(cat);
}

/** Deshace la última acción (restaura el snapshot anterior). */
export async function deshacer(): Promise<Catalog> {
  const cat = await read();
  const undo = cat.undo ?? [];
  if (undo.length === 0) return cat;
  const snap = undo[undo.length - 1];
  const restored: Catalog = {
    ...snap,
    undo: undo.slice(0, -1),
    redo: [...(cat.redo ?? []), stripSnap(cat)].slice(-UNDO_CAP),
    historial: [nuevaEntrada("↩︎ Deshacer", true), ...(cat.historial ?? [])].slice(0, HIST_CAP),
  };
  await write(restored);
  return restored;
}

/** Rehace la acción deshecha. */
export async function rehacer(): Promise<Catalog> {
  const cat = await read();
  const redo = cat.redo ?? [];
  if (redo.length === 0) return cat;
  const snap = redo[redo.length - 1];
  const restored: Catalog = {
    ...snap,
    redo: redo.slice(0, -1),
    undo: [...(cat.undo ?? []), stripSnap(cat)].slice(-UNDO_CAP),
    historial: [nuevaEntrada("↪︎ Rehacer", true), ...(cat.historial ?? [])].slice(0, HIST_CAP),
  };
  await write(restored);
  return restored;
}

export async function getCatalog(): Promise<Catalog> {
  return read();
}

export async function updateIngrediente(
  id: string,
  patch: Partial<Ingrediente>
): Promise<Catalog> {
  const cat = await read();
  let nombre = id;
  for (const grupo of ["bases", "proteinas", "toppings"] as const) {
    const idx = cat[grupo].findIndex((x) => x.id === id);
    if (idx >= 0) {
      cat[grupo][idx] = { ...cat[grupo][idx], ...patch };
      nombre = cat[grupo][idx].nombre;
      break;
    }
  }
  await commit(cat, `Editó "${nombre}"`);
  return cat;
}

export async function updateEnredo(
  id: string,
  patch: Partial<EnredoInsignia>
): Promise<Catalog> {
  const cat = await read();
  const idx = cat.enredos.findIndex((e) => e.id === id);
  if (idx >= 0) cat.enredos[idx] = { ...cat.enredos[idx], ...patch };
  await commit(cat, `Editó plato "${idx >= 0 ? cat.enredos[idx].nombre : id}"`);
  return cat;
}

/** Restaura el catálogo a la semilla (útil para demos). */
export async function resetCatalog(): Promise<Catalog> {
  const seed = structuredClone(SEED_CATALOG);
  await commit(seed, "Restauró el catálogo a la semilla");
  return seed;
}

/* ------- CRUD de catálogo (control del operador) ------- */

export interface NuevoIngrediente {
  categoria: Categoria;
  nombre: string;
  precio: number;
  emoji?: string;
  color?: string;
  foto?: string;
}

export async function createIngrediente(input: NuevoIngrediente): Promise<Catalog> {
  const cat = await read();
  const grupo = GRUPO[input.categoria];
  const existentes = new Set(
    [...cat.bases, ...cat.proteinas, ...cat.toppings].map((i) => i.id)
  );
  let id = slugify(input.nombre);
  while (existentes.has(id)) id = `${slugify(input.nombre)}-${Math.random().toString(36).slice(2, 5)}`;
  cat[grupo].push({
    id,
    nombre: input.nombre.trim() || "Nuevo",
    categoria: input.categoria,
    precio: Math.max(0, Math.round(input.precio)),
    emoji: input.emoji?.trim() || "🍽️",
    foto: input.foto?.trim() || undefined,
    color: input.color?.trim() || "#F2A516",
    stock: 20,
    parStock: 20,
    activo: true,
  });
  await commit(cat, `Creó "${input.nombre.trim() || "Nuevo"}"`);
  return cat;
}

export async function deleteIngrediente(id: string): Promise<Catalog> {
  const cat = await read();
  const nombre =
    [...cat.bases, ...cat.proteinas, ...cat.toppings].find((i) => i.id === id)?.nombre ?? id;
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    cat[g] = cat[g].filter((i) => i.id !== id);
  }
  // limpia enredos que referencian el ingrediente borrado
  cat.enredos = cat.enredos.filter(
    (e) => e.baseId !== id && e.proteinaId !== id && !e.toppingIds.includes(id)
  );
  await commit(cat, `Eliminó "${nombre}"`);
  return cat;
}

export interface NuevoEnredo {
  nombre: string;
  gancho: string;
  baseId: string;
  proteinaId: string;
  toppingIds: string[];
  precio: number;
  foto?: string;
}

export async function createEnredo(input: NuevoEnredo): Promise<Catalog> {
  const cat = await read();
  const ids = new Set(cat.enredos.map((e) => e.id));
  let id = slugify(input.nombre);
  while (ids.has(id)) id = `${slugify(input.nombre)}-${Math.random().toString(36).slice(2, 5)}`;
  cat.enredos.push({
    id,
    nombre: input.nombre.trim() || "Nuevo enredo",
    gancho: input.gancho.trim(),
    baseId: input.baseId,
    proteinaId: input.proteinaId,
    toppingIds: input.toppingIds,
    precio: Math.max(0, Math.round(input.precio)),
    foto: input.foto?.trim() || undefined,
  });
  await commit(cat, `Creó plato "${input.nombre.trim() || "Nuevo enredo"}"`);
  return cat;
}

export async function deleteEnredo(id: string): Promise<Catalog> {
  const cat = await read();
  const nombre = cat.enredos.find((e) => e.id === id)?.nombre ?? id;
  cat.enredos = cat.enredos.filter((e) => e.id !== id);
  await commit(cat, `Eliminó plato "${nombre}"`);
  return cat;
}

/* ------------------------------------------------------------------ */
/* PEDIDOS + INVENTARIO (Fase 3)                                      */
/* ------------------------------------------------------------------ */

export interface NuevoPedido {
  baseId: string;
  proteinaId: string;
  toppingIds: string[];
  canal?: Pedido["canal"];
  tipo?: TipoServicio;
  mesa?: number;
  cliente?: string;
  telefono?: string;
}

/** Índice de insumos por id (referencias vivas dentro del catálogo). */
const insumosPorId = (cat: Catalog): Map<string, Insumo> =>
  new Map(cat.insumos.map((i) => [i.id, i]));

/** ¿Alcanza la despensa para preparar una porción de este componente? */
function puedePreparar(ing: Ingrediente, byId: Map<string, Insumo>): boolean {
  if (!ing.receta || ing.receta.length === 0) return (ing.stock ?? 0) > 0;
  return ing.receta.every((r) => {
    const ins = byId.get(r.insumoId);
    return ins ? ins.stock >= r.cantidad : true; // insumo inexistente → no bloquea
  });
}

/** Descuenta de la despensa los insumos de la receta de un componente. */
function consumirReceta(ing: Ingrediente, byId: Map<string, Insumo>): void {
  for (const r of ing.receta ?? []) {
    const ins = byId.get(r.insumoId);
    if (ins) ins.stock = Math.max(0, Number((ins.stock - r.cantidad).toFixed(3)));
  }
}

/** Crea un pedido, descuenta insumos por receta y auto-agota lo que ya no alcanza. */
export async function crearPedido(input: NuevoPedido): Promise<Pedido> {
  const cat = await read();
  const byId = insumosPorId(cat);

  const consumir = (id: string): Ingrediente | undefined => {
    for (const grupo of ["bases", "proteinas", "toppings"] as const) {
      const it = cat[grupo].find((x) => x.id === id);
      if (it) {
        if (it.receta && it.receta.length > 0) {
          consumirReceta(it, byId); // ← descuenta despensa real
          it.agotado = !puedePreparar(it, byId); // agota si ya no da para otra
        } else if (typeof it.stock === "number") {
          it.stock = Math.max(0, it.stock - 1); // legado: unidades abstractas
          if (it.stock === 0) it.agotado = true;
        }
        return it;
      }
    }
    return undefined;
  };

  const base = consumir(input.baseId);
  const proteina = consumir(input.proteinaId);
  const tops = input.toppingIds
    .map(consumir)
    .filter(Boolean) as Ingrediente[];

  const subtotal =
    (base?.precio ?? 0) +
    (proteina?.precio ?? 0) +
    tops.reduce((s, t, i) => s + (i < TOPPINGS_INCLUIDOS ? 0 : t.precio), 0);
  const impuesto = Math.round((subtotal * (cat.ajustes.impuestoPct ?? 0)) / 100);
  // Costo de insumos (COGS) congelado según receta y costos actuales.
  const costo = Math.round(
    costoReceta(base?.receta, byId) +
      costoReceta(proteina?.receta, byId) +
      tops.reduce((s, t) => s + costoReceta(t.receta, byId), 0)
  );

  const pedido: Pedido = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    creadoEn: new Date().toISOString(),
    canal: input.canal ?? "web",
    tipo: input.tipo ?? "domicilio",
    mesa: input.tipo === "mesa" ? input.mesa : undefined,
    cliente: input.cliente?.trim() || undefined,
    telefono: input.telefono?.trim() || undefined,
    estado: "recibido",
    pago: "pendiente",
    base: base?.nombre ?? "—",
    proteina: proteina?.nombre ?? "—",
    toppings: tops.map((t) => t.nombre),
    subtotal,
    impuesto,
    propina: 0,
    descuento: 0,
    total: subtotal + impuesto,
    costo,
  };

  cat.pedidos = [pedido, ...cat.pedidos].slice(0, 200);
  await commit(cat, `Nuevo pedido #${pedido.id} (${formatCOP(pedido.total)})`);
  return pedido;
}

/** Avanza un pedido al siguiente estado (recibido→cocina→listo→entregado). */
export async function avanzarPedido(id: string): Promise<Pedido[]> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (p && p.estado !== "cancelado") p.estado = nextEstado(p.estado);
  await commit(cat, `Avanzó #${id}${p ? ` a ${p.estado}` : ""}`);
  return cat.pedidos;
}

/** Marca un pedido como pagado con su método, propina y descuento. */
export async function cobrarPedido(
  id: string,
  metodo: MetodoPago,
  propina = 0,
  descuento = 0
): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (p) {
    p.pago = "pagado";
    p.metodoPago = metodo;
    p.propina = Math.max(0, Math.round(propina));
    p.descuento = Math.max(0, Math.round(descuento));
    p.total = Math.max(0, p.subtotal + p.impuesto + p.propina - p.descuento);
  }
  await commit(cat, `Cobró #${id} (${metodo}${p ? ` · ${formatCOP(p.total)}` : ""})`);
  return cat;
}

/** Cancela un pedido (estado terminal). */
export async function cancelarPedido(id: string): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (p) p.estado = "cancelado";
  await commit(cat, `Canceló pedido #${id}`);
  return cat;
}

/** Asigna (o cambia) la mesa de un pedido; lo marca como servicio en mesa. */
export async function asignarMesa(id: string, mesa: number): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (p) {
    p.mesa = mesa;
    p.tipo = "mesa";
  }
  await commit(cat, `Asignó #${id} a mesa ${mesa}`);
  return cat;
}

/** Ajustes del negocio (los lee el sitio y el panel). */
export async function updateAjustes(patch: Partial<Ajustes>): Promise<Catalog> {
  const cat = await read();
  cat.ajustes = { ...cat.ajustes, ...patch };
  await commit(cat, "Actualizó los ajustes");
  return cat;
}

/** Abre/cierra el negocio (el sitio muestra el estado). Acción de un clic. */
export async function toggleAbierto(): Promise<Catalog> {
  const cat = await read();
  cat.ajustes.abierto = !(cat.ajustes.abierto ?? true);
  await commit(cat, cat.ajustes.abierto ? "Abrió el negocio" : "Cerró el negocio");
  return cat;
}

/** Repone stock de un ingrediente y lo saca de "agotado" si vuelve a haber. */
export async function restock(id: string, cantidad: number): Promise<Catalog> {
  const cat = await read();
  for (const grupo of ["bases", "proteinas", "toppings"] as const) {
    const it = cat[grupo].find((x) => x.id === id);
    if (it) {
      it.stock = Math.max(0, (it.stock ?? 0) + cantidad);
      if (it.stock > 0) it.agotado = false;
      break;
    }
  }
  await commit(cat, `Repuso stock (+${cantidad})`);
  return cat;
}

/* ------------------------------------------------------------------ */
/* INSUMOS + RECETAS (despensa real / ficha técnica)                  */
/* ------------------------------------------------------------------ */

/** Reactiva componentes cuya despensa volvió a alcanzar (tras abastecer). */
function reactivarPreparables(cat: Catalog, insumoId?: string): void {
  const byId = insumosPorId(cat);
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    for (const it of cat[g]) {
      if (!it.receta || it.receta.length === 0) continue;
      if (insumoId && !it.receta.some((r) => r.insumoId === insumoId)) continue;
      if (it.agotado && puedePreparar(it, byId)) it.agotado = false;
    }
  }
}

export interface NuevoInsumo {
  nombre: string;
  categoria?: InsumoCategoria;
  unidad: UnidadInsumo;
  stock: number;
  parStock: number;
  costo?: number;
  emoji?: string;
}

export async function createInsumo(input: NuevoInsumo): Promise<Catalog> {
  const cat = await read();
  const ids = new Set(cat.insumos.map((i) => i.id));
  let id = slugify(input.nombre);
  while (ids.has(id)) id = `${slugify(input.nombre)}-${Math.random().toString(36).slice(2, 5)}`;
  cat.insumos.push({
    id,
    nombre: input.nombre.trim() || "Insumo",
    categoria: input.categoria ?? "otro",
    unidad: input.unidad,
    stock: Math.max(0, input.stock),
    parStock: Math.max(0, input.parStock),
    costo: input.costo != null ? Math.max(0, Math.round(input.costo)) : undefined,
    emoji: input.emoji?.trim() || "📦",
    activo: true,
  });
  await commit(cat, `Creó insumo "${input.nombre.trim() || "Insumo"}"`);
  return cat;
}

export async function updateInsumo(id: string, patch: Partial<Insumo>): Promise<Catalog> {
  const cat = await read();
  const it = cat.insumos.find((x) => x.id === id);
  if (it) Object.assign(it, patch);
  reactivarPreparables(cat, id);
  await commit(cat, `Editó insumo "${it?.nombre ?? id}"`);
  return cat;
}

export async function deleteInsumo(id: string): Promise<Catalog> {
  const cat = await read();
  const nombre = cat.insumos.find((i) => i.id === id)?.nombre ?? id;
  cat.insumos = cat.insumos.filter((i) => i.id !== id);
  for (const g of ["bases", "proteinas", "toppings"] as const)
    cat[g].forEach((it) => {
      if (it.receta) it.receta = it.receta.filter((r) => r.insumoId !== id);
    });
  await commit(cat, `Eliminó insumo "${nombre}"`);
  return cat;
}

/** Registra una compra (salida de caja) por la cantidad abastecida × costo. */
function registrarCompra(cat: Catalog, insumo: Insumo, delta: number): void {
  if (delta <= 0 || !insumo.costo) return;
  const mov: Movimiento = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    fecha: new Date().toISOString(),
    tipo: "compra",
    concepto: `Abastecer ${insumo.nombre}`,
    monto: Math.round(delta * insumo.costo),
    categoria: "insumos",
    insumoId: insumo.id,
    cantidad: Number(delta.toFixed(3)),
  };
  cat.movimientos = [mov, ...(cat.movimientos ?? [])].slice(0, 2000);
}

/** Suma cantidad al stock de un insumo → "Abastecer" (registra la compra). */
export async function abastecerInsumo(id: string, cantidad: number): Promise<Catalog> {
  const cat = await read();
  const it = cat.insumos.find((x) => x.id === id);
  if (it) {
    const antes = it.stock;
    it.stock = Math.max(0, Number((it.stock + cantidad).toFixed(3)));
    registrarCompra(cat, it, it.stock - antes);
  }
  reactivarPreparables(cat, id);
  const ins = cat.insumos.find((x) => x.id === id);
  await commit(cat, `Abasteció ${cantidad} ${ins?.unidad ?? ""} de ${ins?.nombre ?? id}`.trim());
  return cat;
}

/** Deja un insumo en su nivel estándar (par) y registra la compra. */
export async function abastecerAPar(id: string): Promise<Catalog> {
  const cat = await read();
  const it = cat.insumos.find((x) => x.id === id);
  if (it) {
    const antes = it.stock;
    it.stock = it.parStock;
    registrarCompra(cat, it, it.stock - antes);
  }
  reactivarPreparables(cat, id);
  await commit(cat, `Abasteció "${it?.nombre ?? id}" a estándar`);
  return cat;
}

/** Apertura de turno: deja TODA la despensa en su nivel estándar (registra compras). */
export async function abastecerTodoAPar(): Promise<Catalog> {
  const cat = await read();
  cat.insumos.forEach((i) => {
    const antes = i.stock;
    i.stock = i.parStock;
    registrarCompra(cat, i, i.stock - antes);
  });
  reactivarPreparables(cat);
  await commit(cat, "Abasteció toda la despensa a estándar");
  return cat;
}

/* ------- Contabilidad: gastos y movimientos ------- */

export interface NuevoGasto {
  concepto: string;
  monto: number;
  categoria: GastoCategoria;
  fecha?: string; // ISO; por defecto ahora
}

export async function crearGasto(input: NuevoGasto): Promise<Catalog> {
  const cat = await read();
  const mov: Movimiento = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    fecha: input.fecha ? new Date(input.fecha).toISOString() : new Date().toISOString(),
    tipo: "gasto",
    concepto: input.concepto.trim() || "Gasto",
    monto: Math.max(0, Math.round(input.monto)),
    categoria: input.categoria,
  };
  cat.movimientos = [mov, ...(cat.movimientos ?? [])].slice(0, 2000);
  await commit(cat, `Gasto: ${mov.concepto} ${formatCOP(mov.monto)}`);
  return cat;
}

export async function deleteMovimiento(id: string): Promise<Catalog> {
  const cat = await read();
  cat.movimientos = (cat.movimientos ?? []).filter((m) => m.id !== id);
  await commit(cat, "Eliminó un movimiento");
  return cat;
}

/** Define la receta (ficha técnica) de un componente y recalcula disponibilidad. */
export async function setReceta(
  ingredienteId: string,
  receta: RecetaItem[]
): Promise<Catalog> {
  const cat = await read();
  const byId = insumosPorId(cat);
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    const it = cat[g].find((x) => x.id === ingredienteId);
    if (it) {
      it.receta = receta.filter((r) => r.insumoId && r.cantidad > 0);
      it.agotado = it.receta.length > 0 ? !puedePreparar(it, byId) : it.agotado;
      break;
    }
  }
  await commit(cat, "Editó una receta");
  return cat;
}

/* ------- Promociones (visibles en el sitio) ------- */

export async function upsertPromo(promo: Promo): Promise<Catalog> {
  const cat = await read();
  const list = cat.ajustes.promos ?? [];
  if (!promo.id) {
    const ids = new Set(list.map((p) => p.id));
    let id = slugify(promo.texto) || "promo";
    while (ids.has(id)) id = `${slugify(promo.texto)}-${Math.random().toString(36).slice(2, 5)}`;
    promo.id = id;
  }
  const idx = list.findIndex((p) => p.id === promo.id);
  if (idx >= 0) list[idx] = promo;
  else list.push(promo);
  cat.ajustes.promos = list;
  await commit(cat, `Guardó promoción "${promo.texto.slice(0, 30)}"`);
  return cat;
}

export async function deletePromo(id: string): Promise<Catalog> {
  const cat = await read();
  cat.ajustes.promos = (cat.ajustes.promos ?? []).filter((p) => p.id !== id);
  await commit(cat, "Eliminó una promoción");
  return cat;
}

export async function togglePromo(id: string): Promise<Catalog> {
  const cat = await read();
  const p = (cat.ajustes.promos ?? []).find((x) => x.id === id);
  if (p) p.activo = !p.activo;
  await commit(cat, p ? (p.activo ? "Activó una promoción" : "Pausó una promoción") : "Promoción");
  return cat;
}

/* ------------------------------------------------------------------ */
/* LEADS / CRM (Fase 3.5)                                             */
/* ------------------------------------------------------------------ */

export interface NuevoLead {
  nombre: string;
  telefono?: string;
  email?: string;
  canal?: Lead["canal"];
  mensaje?: string;
}

export async function crearLead(input: NuevoLead): Promise<Lead> {
  const cat = await read();
  const lead: Lead = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    nombre: input.nombre.trim(),
    telefono: input.telefono?.trim() || undefined,
    email: input.email?.trim() || undefined,
    canal: input.canal ?? "web",
    mensaje: input.mensaje?.trim() || undefined,
    estado: "nuevo",
    creadoEn: new Date().toISOString(),
  };
  cat.leads = [lead, ...cat.leads].slice(0, 500);
  await commit(cat, `Nuevo lead: ${lead.nombre}`);
  return lead;
}

export async function updateLead(
  id: string,
  patch: Partial<Pick<Lead, "estado" | "nombre" | "telefono" | "email">>
): Promise<Catalog> {
  const cat = await read();
  const idx = cat.leads.findIndex((l) => l.id === id);
  if (idx >= 0) cat.leads[idx] = { ...cat.leads[idx], ...patch };
  await commit(cat, "Actualizó un lead");
  return cat;
}

export type { EstadoLead };
