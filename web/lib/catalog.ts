import fs from "node:fs/promises";
import path from "node:path";
import {
  supabaseEnabled,
  supabaseAdmin,
  CATALOG_TABLE,
  CATALOG_ID,
} from "./supabase";
import { desglosarPrecioFinal, faltaParaMinimo, totalDe, diaNegocio } from "./precios";
import {
  SEED_CATALOG,
  SEED_AJUSTES,
  SEED_INSUMOS,
  SEED_RECETAS,
  TOPPINGS_INCLUIDOS,
  ESTADOS,
  nextEstado,
  type EstadoPedido,
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
  /* Defensa mínima: si lo que llega no es un catálogo (documento vacío, truncado o de
     otra cosa), rellenamos las colecciones obligatorias en vez de reventar con un
     "Cannot read properties of undefined" que no le dice nada a nadie. Los grupos SÍ
     se siembran porque sin carta no hay POS. */
  if (!cat || typeof cat !== "object") cat = structuredClone(SEED_CATALOG);
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    if (!Array.isArray(cat[g]) || cat[g].length === 0) cat[g] = structuredClone(SEED_CATALOG[g]);
  }
  if (!Array.isArray(cat.enredos)) cat.enredos = structuredClone(SEED_CATALOG.enredos);
  cat.pedidos ??= []; // Fase 3
  cat.movimientos ??= []; // Fase 4 · contabilidad
  cat.leads ??= []; //   Fase 3.5
  cat.historial ??= []; // Fase 4.5 · auditoría
  cat.undo ??= [];
  cat.redo ??= [];
  /* Los snapshots creados ANTES de la auditoría llevan dentro pedidos, movimientos y
     leads (eran el 90% del peso del documento, y la razón de que un Deshacer pudiera
     borrar el turno). Se limpian al leer: es idempotente y encoge el cerebro de una vez
     sin necesitar migración aparte. */
  const limpiarPila = (pila: Catalog[] | undefined) =>
    (pila ?? []).map((s) =>
      s && (s.pedidos?.length || s.movimientos?.length || s.leads?.length)
        ? { ...s, pedidos: [], movimientos: [], leads: [] }
        : s,
    );
  cat.undo = limpiarPila(cat.undo);
  cat.redo = limpiarPila(cat.redo);
  // insumos (despensa real): si el catálogo es previo (campo AUSENTE), siembra la despensa.
  // Ojo: una lista VACÍA es una decisión del operador ("borré los 16 de demo para cargar
  // los míos"), no un catálogo viejo. Confundirlas resucitaba 40 lb de papa inexistente
  // en la siguiente recarga de la página.
  if (!Array.isArray(cat.insumos)) {
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

/* ══════════════════════════════════════════════════════════════════════════
   DÓNDE VIVE EL CEREBRO

   Tres backends, en orden de preferencia:
     1. SUPABASE  — si están las dos env vars (el destino final, relacional).
     2. VERCEL BLOB — almacén de objetos durable, privado, ligado al proyecto.
        Es lo que hace que el POS guarde de un día para otro HOY: /tmp es efímero
        y por instancia, así que un pedido creado en una lambda no existía para la
        pantalla de cocina en otra, y todo el turno se evaporaba al reciclar.
     3. ARCHIVO   — data/catalog.json en local (desarrollo).
   ══════════════════════════════════════════════════════════════════════════ */
/**
 * Blob se usa SOLO en Vercel. `vercel env pull` deja el token en .env.local, así que
 * sin esta condición `next dev` escribiría sobre los datos REALES del restaurante
 * mientras se programa. En local manda siempre el archivo.
 * (`PG_BLOB=1` fuerza el backend para poder probarlo a mano.)
 */
const blobEnabled = (): boolean =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN) &&
  Boolean(process.env.VERCEL || process.env.PG_BLOB);
const RUTA_BLOB = "cerebro/catalog.json";

/**
 * ETag de la última lectura. Blob soporta escritura condicional (`ifMatch`), o sea
 * COMPARE-AND-SWAP de verdad: si otra instancia escribió entre nuestra lectura y
 * nuestra escritura, el put falla en vez de pisarla en silencio.
 */
let etagActual: string | null = null;

/**
 * Memo cortísimo. Las pantallas del panel son `force-dynamic` y se auto-refrescan
 * (cocina 8s, caja 10s, mesas 15s): sin esto, cada refresco de cada dispositivo es
 * una lectura de red. 2 segundos no alcanzan a mostrar nada rancio y quitan la
 * mayoría de las lecturas.
 */
let memo: { cat: Catalog; hasta: number } | null = null;
const MEMO_MS = 2000;
const olvidar = () => {
  memo = null;
};

async function read(): Promise<Catalog> {
  if (memo && memo.hasta > Date.now()) return memo.cat;
  const cat = supabaseEnabled()
    ? await readSupabase()
    : blobEnabled()
      ? await readBlob()
      : await readFile();
  memo = { cat, hasta: Date.now() + MEMO_MS };
  return cat;
}

/** Lectura SIN memo: la que se usa dentro del candado, antes de escribir. */
async function readFresco(): Promise<Catalog> {
  olvidar();
  return read();
}

async function write(cat: Catalog, sinCondicion = false): Promise<void> {
  olvidar();
  if (supabaseEnabled()) return writeSupabase(cat);
  if (blobEnabled()) return writeBlob(cat, sinCondicion);
  return writeFile(cat);
}

/**
 * Reintenta una operación de red. Un parpadeo de conexión de 200ms no puede dejar
 * la pantalla de cocina en blanco a mitad del servicio; tres intentos con una
 * espera corta cubren de sobra los cortes transitorios.
 */
async function conReintento<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      // Un "no existe" o un conflicto de ETag no se arregla reintentando.
      const n = (e as Error)?.name ?? "";
      if (n === "BlobNotFoundError" || n === "BlobPreconditionFailedError") throw e;
      if (i < intentos - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw ultimo;
}

/* --- Backend: Vercel Blob (durable, privado, con escritura condicional) --- */
async function readBlob(): Promise<Catalog> {
  const { get } = await import("@vercel/blob");
  try {
    const b = await conReintento(() => get(RUTA_BLOB, { access: "private", useCache: false }));
    if (!b || b.statusCode !== 200 || !b.stream) {
      // Todavía no existe el documento: primer arranque legítimo → siembra.
      const seed = structuredClone(SEED_CATALOG);
      await writeBlob(seed);
      return seed;
    }
    // `get` devuelve el ETag en forma DÉBIL (W/"abc") y `put` compara contra la
    // fuerte ("abc"): sin normalizar, TODA escritura condicional fallaba.
    etagActual = (b.blob?.etag ?? "").replace(/^W\//, "") || null;
    const texto = await new Response(b.stream).text();
    return migrate(JSON.parse(texto) as Catalog);
  } catch (e) {
    // Un fallo de red NO puede devolver la semilla: la siguiente acción la
    // escribiría encima y borraría el turno. Fallar ruidosamente es lo correcto.
    if ((e as Error)?.name === "BlobNotFoundError") {
      const seed = structuredClone(SEED_CATALOG);
      await writeBlob(seed);
      return seed;
    }
    const causa = (e as { cause?: { message?: string } })?.cause?.message;
    throw new Error(
      `No se pudo leer el cerebro: ${(e as Error)?.message ?? e}${causa ? ` (${causa})` : ""}`,
      { cause: e },
    );
  }
}

async function writeBlob(cat: Catalog, sinCondicion = false): Promise<void> {
  const { put } = await import("@vercel/blob");
  const cuerpo = JSON.stringify(cat);
  // Reintento seguro: el put sube el documento COMPLETO, así que repetirlo es
  // idempotente. Si otra instancia escribió en medio, el ifMatch lo corta y de eso
  // se encarga el bucle de commit().
  const r = await conReintento(() =>
    put(RUTA_BLOB, cuerpo, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      // Compare-and-swap: solo escribe si nadie tocó el documento desde que lo leímos.
      ...(etagActual && !sinCondicion ? { ifMatch: etagActual } : {}),
    }),
  );
  etagActual = (r.etag ?? "").replace(/^W\//, "") || null;
  void respaldoDelDia(cuerpo);
}

/**
 * RESPALDO DIARIO. Una copia fechada por día, sin bloquear la escritura principal.
 * Si algo sale mal (un Deshacer desafortunado, un reset, una migración), se puede
 * volver al cierre de ayer en vez de perderlo todo. Cuesta centavos.
 */
let respaldoHecho = "";
async function respaldoDelDia(cuerpo: string): Promise<void> {
  const dia = diaNegocio();
  if (respaldoHecho === dia) return;
  respaldoHecho = dia;
  try {
    const { put } = await import("@vercel/blob");
    await put(`cerebro/respaldo-${dia}.json`, cuerpo, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
  } catch {
    // Un respaldo que falla no puede tumbar un pedido. Se reintenta mañana.
    respaldoHecho = "";
  }
}

/* --- Backend: archivo local / /tmp (dev y fallback) --- */
async function readFile(): Promise<Catalog> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return migrate(JSON.parse(raw) as Catalog);
  } catch (e) {
    // SOLO "el archivo todavía no existe" justifica arrancar desde la semilla.
    // El catch desnudo de antes trataba igual un JSON truncado por un corte de luz:
    // devolvía la semilla sin marcarla, y la siguiente acción del operador la
    // escribía encima — destruyendo el único respaldo que quedaba.
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      return structuredClone(SEED_CATALOG);
    }
    throw new Error(
      `No se pudo leer el catálogo (${(e as Error)?.message ?? e}). No se tocó nada.`,
    );
  }
}

async function writeFile(cat: Catalog): Promise<void> {
  // Escritura ATÓMICA: a un temporal y luego rename (operación atómica del FS).
  // Con writeFile directo, un corte a mitad de los ~300KB dejaba el JSON truncado
  // y el cerebro ilegible.
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cat, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

/* --- Backend: Supabase (persistencia real). El cerebro es 1 documento jsonb --- */
async function readSupabase(): Promise<Catalog> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from(CATALOG_TABLE)
    .select("data")
    .eq("id", CATALOG_ID)
    .maybeSingle();
  // NUNCA caer a la semilla ante un error de red o de la base: un timeout de 200ms
  // un sábado a las 8:30 p.m. devolvía el catálogo de fábrica, la cocina pulsaba
  // "Listo", y el upsert siguiente subía 0 pedidos y 0 movimientos encima del turno.
  // Fallar ruidosamente es infinitamente mejor que borrar la noche en silencio.
  if (error) throw new Error(`Supabase no respondió: ${error.message}`);
  if (data?.data) return migrate(data.data as Catalog);
  // Fila ausente CON consulta exitosa: es el primer arranque legítimo. Siembra.
  const seed = structuredClone(SEED_CATALOG);
  await writeSupabase(seed);
  return seed;
}

async function writeSupabase(cat: Catalog): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from(CATALOG_TABLE)
    .upsert({ id: CATALOG_ID, data: cat, updated_at: new Date().toISOString() });
  if (error) throw new Error(`No se pudo guardar en Supabase: ${error.message}`);
}

/**
 * ¿Estamos en Vercel SIN Supabase? Entonces el cerebro escribe en /tmp, que es
 * efímero y distinto por instancia de lambda: el pedido que entra por QR puede no
 * existir para la pantalla de cocina. No lanzamos (tumbaría el sitio público),
 * pero el panel muestra la alarma y aquí queda el rastro en los logs.
 */
export function persistenciaEnRiesgo(): boolean {
  return Boolean(process.env.VERCEL) && !supabaseEnabled() && !blobEnabled();
}

/**
 * DÓNDE SE ESTÁ GUARDANDO, dicho en voz alta.
 *
 * "¿Esto está guardando bien?" es la pregunta que un dueño no debería tener que
 * adivinar: si el POS pierde el turno, se entera al día siguiente y ya es tarde.
 * Esto hace una lectura REAL y reporta el backend, el peso del documento y cuántos
 * pedidos hay dentro.
 */
export async function estadoPersistencia(): Promise<{
  backend: "supabase" | "blob" | "archivo";
  nombre: string;
  durable: boolean;
  ok: boolean;
  detalle: string;
  pedidos?: number;
  peso?: string;
}> {
  const backend = supabaseEnabled() ? "supabase" : blobEnabled() ? "blob" : "archivo";
  const nombre =
    backend === "supabase"
      ? "Supabase"
      : backend === "blob"
        ? "Almacén de Vercel"
        : process.env.VERCEL
          ? "Disco temporal (/tmp)"
          : "Archivo local";
  const durable = backend !== "archivo" || !process.env.VERCEL;
  try {
    olvidar();
    const cat = await read();
    const peso = Math.round(JSON.stringify(cat).length / 1024);
    return {
      backend,
      nombre,
      durable,
      ok: true,
      detalle: durable
        ? "Los pedidos y la caja sobreviven a los reinicios."
        : "OJO: en Vercel esto es efímero. Lo de hoy se pierde al reiniciar.",
      pedidos: cat.pedidos.length,
      peso: `${peso} KB`,
    };
  } catch (e) {
    return {
      backend,
      nombre,
      durable,
      ok: false,
      detalle: `No se pudo leer: ${(e as Error)?.message ?? e}`,
    };
  }
}
if (persistenciaEnRiesgo()) {
  console.warn(
    "[papaghetti] AVISO: corriendo en Vercel sin Supabase. El catálogo se guarda en /tmp " +
      "(efímero y por instancia): los pedidos NO persisten. Define NEXT_PUBLIC_SUPABASE_URL " +
      "y SUPABASE_SERVICE_ROLE.",
  );
}

/* ------- Historial + deshacer/rehacer (snapshots) ------- */
const UNDO_CAP = 12; // profundidad de deshacer/rehacer
const HIST_CAP = 120; // entradas visibles del historial

/**
 * Copia del catálogo para la pila de deshacer.
 *
 * Fuera van, además de las propias pilas: PEDIDOS, MOVIMIENTOS y LEADS. Son datos
 * TRANSACCIONALES — cosas que pasaron — y "deshacer" no puede significar "que no
 * hayan pasado". Antes viajaban enteros dentro de cada snapshot, así que el dueño
 * corregía el precio del pollo, entraban cuatro pedidos por QR, se arrepentía del
 * precio, y los cuatro pedidos que la cocina estaba preparando desaparecían.
 *
 * Efecto lateral grande: los 12 snapshots eran el 90% del documento (254KB de 282KB).
 * Sin ellos el cerebro pesa una décima parte y cada acción escribe una décima parte.
 */
function stripSnap(cat: Catalog): Catalog {
  return {
    ...cat,
    undo: undefined,
    redo: undefined,
    historial: undefined,
    pedidos: [],
    movimientos: [],
    leads: [],
  };
}

/** Devuelve el snapshot con lo TRANSACCIONAL de hoy re-inyectado (nunca se revierte). */
function conLoVivo(snap: Catalog, vivo: Catalog): Catalog {
  return {
    ...snap,
    pedidos: vivo.pedidos ?? [],
    movimientos: vivo.movimientos ?? [],
    leads: vivo.leads ?? [],
  };
}

function nuevaEntrada(texto: string, meta = false): HistItem {
  return { id: crypto.randomUUID().slice(0, 6), fecha: new Date().toISOString(), texto, meta };
}

/**
 * CANDADO DE ESCRITURA (por instancia).
 *
 * Toda mutación es leer → modificar → escribir el documento entero. Sin serializar,
 * dos peticiones de la misma instancia se pisan: la segunda escribe encima de un
 * estado que ya no era el actual y se pierde lo que hizo la primera. La cola cuesta
 * nada y elimina esa carrera por completo dentro del proceso.
 */
let cola: Promise<unknown> = Promise.resolve();
function enFila<T>(fn: () => Promise<T>): Promise<T> {
  const r = cola.then(fn, fn);
  cola = r.then(
    () => undefined,
    () => undefined,
  );
  return r;
}

/** Índice por id, para unir dos listas sin perder ni duplicar. */
function unir<T extends { id: string }>(base: T[], mio: T[]): T[] {
  const m = new Map(base.map((x) => [x.id, x]));
  for (const x of mio) m.set(x.id, x); // mi versión manda sobre la del otro
  return [...m.values()];
}

/**
 * Une lo que YO cambié con lo que otra instancia escribió mientras tanto.
 *
 * Las tres colecciones transaccionales (pedidos, movimientos, leads) son
 * append-only en la práctica: si el cajero cobra el #A1 mientras entra el #B2 por
 * QR desde otra lambda, ninguno de los dos puede desaparecer. Para el resto del
 * catálogo (precios, recetas, ajustes) manda mi versión: lo edita una sola persona.
 */
function fusionar(actual: Catalog, mio: Catalog): Catalog {
  // Las tres listas se guardan MÁS NUEVO PRIMERO y las pantallas confían en ese
  // orden. `unir` respeta el orden del mapa (primero los de `actual`), así que sin
  // reordenar, lo recién creado aparecía al final: el movimiento que acababas de
  // registrar no salía arriba en Finanzas.
  const recientes = <T>(xs: T[], fecha: (x: T) => string) =>
    [...xs].sort((a, b) => fecha(b).localeCompare(fecha(a)));
  return {
    ...mio,
    pedidos: recientes(unir(actual.pedidos ?? [], mio.pedidos ?? []), (p) => p.creadoEn),
    movimientos: recientes(unir(actual.movimientos ?? [], mio.movimientos ?? []), (m) => m.fecha),
    leads: recientes(unir(actual.leads ?? [], mio.leads ?? []), (l) => l.creadoEn),
  };
}

/**
 * Persiste `cat` como una acción: guarda un snapshot del estado ANTERIOR en la
 * pila de deshacer, limpia rehacer y agrega la entrada al historial.
 * Reemplaza a write() en todas las mutaciones del operador.
 *
 * `autoritativo` = mi documento manda tal cual, sin unir (lo usa el borrado
 * explícito de un movimiento: unir lo resucitaría).
 */
async function commit(
  cat: Catalog,
  texto?: string,
  opciones?: { autoritativo?: boolean },
): Promise<void> {
  return enFila(async () => {
    for (let intento = 0; intento < 3; intento++) {
      const actual = await readFresco(); // fija el etag para la escritura condicional
      const doc = opciones?.autoritativo ? { ...cat } : fusionar(actual, cat);
      doc.undo = [...(actual.undo ?? []), stripSnap(actual)].slice(-UNDO_CAP);
      doc.redo = [];
      if (texto) {
        doc.historial = [nuevaEntrada(texto), ...(actual.historial ?? [])].slice(0, HIST_CAP);
      }
      try {
        // Último intento: se escribe SIN condición. Ya venimos de releer y fusionar,
        // así que no se pierde nada — y perder un pedido por un compare-and-swap
        // terco sería mucho peor que la carrera que intenta evitar.
        await write(doc, intento === 2);
        return;
      } catch (e) {
        // Otra instancia escribió entre nuestra lectura y nuestra escritura: el
        // compare-and-swap la protegió. Releemos y reintentamos sobre lo nuevo.
        const conflicto =
          (e as Error)?.name === "BlobPreconditionFailedError" ||
          /precondition|ifMatch|412/i.test((e as Error)?.message ?? "");
        if (conflicto && intento < 2) {
          etagActual = null;
          continue;
        }
        throw e;
      }
    }
  });
}

/** Deshace la última acción (restaura el snapshot anterior). */
export async function deshacer(): Promise<Catalog> {
  const cat = await read();
  const undo = cat.undo ?? [];
  if (undo.length === 0) return cat;
  const snap = undo[undo.length - 1];
  const restored: Catalog = {
    ...conLoVivo(snap, cat), // pedidos/movimientos/leads de HOY sobreviven al deshacer
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
    ...conLoVivo(snap, cat), // ídem: rehacer tampoco resucita ni borra pedidos
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

/**
 * EL CATÁLOGO QUE PUEDE VER UN DESCONOCIDO.
 *
 * `getCatalog()` devuelve el documento entero, y la página pública se lo pasaba a un
 * componente `"use client"`: Next serializa las props de los componentes cliente dentro
 * del HTML, así que en el código fuente del sitio —legible con Ctrl+U desde el CDN—
 * viajaban el costo de cada insumo, las recetas, el stock, los pedidos con teléfono
 * de cliente, la contabilidad y hasta 12 copias de todo eso en la pila de undo.
 *
 * REGLA PERMANENTE: ninguna ruta pública llama a `getCatalog()`. Esta es la puerta.
 */
export interface CatalogoPublico {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  enredos: EnredoInsignia[];
  ajustes: AjustesPublicos;
}
/** Ajustes que sí puede ver el cliente (los demás campos son de operación). */
export type AjustesPublicos = Pick<
  Ajustes,
  | "negocio"
  | "whatsapp"
  | "direccion"
  | "horarios"
  | "instagram"
  | "rappi"
  | "abierto"
  | "numMesas"
  | "impuestoPct"
  | "costoDomicilio"
  | "pedidoMinimo"
  | "promos"
>;

/** Un ingrediente sin su interior de negocio (receta, stock, costo). */
function limpiarIngrediente(i: Ingrediente): Ingrediente {
  const { receta, stock, parStock, ...publico } = i;
  void receta;
  void stock;
  void parStock;
  return publico as Ingrediente;
}

export async function getCatalogPublico(): Promise<CatalogoPublico> {
  const cat = await read();
  const a = cat.ajustes;
  return {
    bases: cat.bases.map(limpiarIngrediente),
    proteinas: cat.proteinas.map(limpiarIngrediente),
    toppings: cat.toppings.map(limpiarIngrediente),
    enredos: cat.enredos,
    ajustes: {
      negocio: a.negocio,
      whatsapp: a.whatsapp,
      direccion: a.direccion,
      horarios: a.horarios,
      instagram: a.instagram,
      rappi: a.rappi,
      abierto: a.abierto,
      numMesas: a.numMesas,
      impuestoPct: a.impuestoPct,
      costoDomicilio: a.costoDomicilio,
      pedidoMinimo: a.pedidoMinimo,
      promos: a.promos,
    },
  };
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

/**
 * Restaura la CARTA a la semilla (útil para demos).
 *
 * Conserva lo transaccional: la etiqueta del botón dice "catálogo" pero antes
 * reemplazaba el documento entero, o sea que borraba los pedidos del turno, la
 * contabilidad y los leads del Club. Un submit sin confirmación al final de
 * /admin/menu no puede tener el poder de borrar el negocio.
 */
export async function resetCatalog(): Promise<Catalog> {
  const vivo = await read();
  const seed = conLoVivo(structuredClone(SEED_CATALOG), vivo);
  await commit(seed, "Restauró la carta a la semilla (pedidos y caja intactos)");
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
  proteinaId2?: string; // 2ª proteína (retro-compat con el flujo de 2)
  /** N proteínas (EMPLATA ya no limita a 2). Si viene, manda sobre proteinaId/proteinaId2. */
  proteinaIds?: string[];
  toppingIds: string[];
  canal?: Pedido["canal"];
  tipo?: TipoServicio;
  mesa?: number;
  cliente?: string;
  telefono?: string;
  /**
   * Pedido de un ENREDO INSIGNIA: sus componentes y su precio de carta (cerrado, todo
   * incluido) mandan sobre lo que venga en base/proteina/toppings. Así el plato curado
   * entra por el mismo flujo que el armado a mano, sin una segunda contabilidad.
   */
  enredoId?: string;
  /** Dirección de entrega — obligatoria cuando el servicio es a domicilio. */
  direccion?: string;
  /** Nota del cliente para la cocina: "sin cebolla", alergias. */
  notas?: string;
  /**
   * Clave de idempotencia generada por el cliente AL ARMAR la caja (no al enviar) y
   * reusada en los reintentos. Sin ella, un doble toque con red lenta creaba dos
   * pedidos y descontaba la despensa dos veces.
   */
  idemKey?: string;
}

/** Índice de insumos por id (referencias vivas dentro del catálogo). */
const insumosPorId = (cat: Catalog): Map<string, Insumo> =>
  new Map(cat.insumos.map((i) => [i.id, i]));

/** ¿Alcanza la despensa para preparar una porción de este componente? */
function puedePreparar(ing: Ingrediente, byId: Map<string, Insumo>): boolean {
  if (!ing.receta || ing.receta.length === 0) return (ing.stock ?? 0) > 0;
  return ing.receta.every((r) => {
    const ins = byId.get(r.insumoId);
    // FAIL-CLOSED: un insumo que la receta nombra y que ya no existe significa que no
    // sabemos si se puede preparar. Antes devolvía true ("no bloquea") y el sistema
    // vendía alegremente lo que no tenía con qué hacer.
    return ins ? ins.stock >= r.cantidad : false;
  });
}

/** ¿Alcanza para N porciones del mismo componente en un solo pedido? */
function alcanzaPara(ing: Ingrediente, byId: Map<string, Insumo>, veces: number): boolean {
  if (!ing.receta || ing.receta.length === 0) return (ing.stock ?? 0) >= veces;
  return ing.receta.every((r) => {
    const ins = byId.get(r.insumoId);
    return ins ? ins.stock >= r.cantidad * veces : false;
  });
}

/** Máximos que la propia interfaz permite; el servidor no acepta más. */
const MAX_TOPPINGS = 12;
const MAX_PROTEINAS = 4;

/**
 * Tope de pedidos guardados. Antes era 200 a secas y el corte se hacía sin mirar el
 * estado: el pedido 201 expulsaba al más viejo aunque estuviera SIN COBRAR, y con él
 * desaparecía la única forma de cobrarlo. Ahora se conservan 2.000 y, si hay que
 * recortar, solo caen los CERRADOS (pagados o cancelados) — nunca una deuda viva.
 *
 * Esto es un puente mientras el cerebro sea un documento único; el arreglo real es
 * sacar `pedidos` a su propia tabla en Supabase.
 */
const PEDIDOS_CAP = 2000;
function recortarPedidos(lista: Pedido[]): Pedido[] {
  if (lista.length <= PEDIDOS_CAP) return lista;
  const cerrado = (p: Pedido) => p.pago === "pagado" || p.estado === "cancelado";
  const vivos = lista.filter((p) => !cerrado(p));
  const cerrados = lista.filter(cerrado);
  // Los vivos SIEMPRE se conservan; el recorte se lo comen los cerrados más antiguos.
  return [...vivos, ...cerrados.slice(0, Math.max(0, PEDIDOS_CAP - vivos.length))].sort((a, b) =>
    b.creadoEn.localeCompare(a.creadoEn),
  );
}

/** Descuenta de la despensa los insumos de la receta de un componente. */
function consumirReceta(ing: Ingrediente, byId: Map<string, Insumo>): void {
  for (const r of ing.receta ?? []) {
    const ins = byId.get(r.insumoId);
    if (ins) ins.stock = Math.max(0, Number((ins.stock - r.cantidad).toFixed(3)));
  }
}

/**
 * Crea un pedido, descuenta insumos por receta y auto-agota lo que ya no alcanza.
 *
 * ORDEN SAGRADO: resolver → VALIDAR TODO → recién entonces consumir. Antes se
 * consumía mientras se resolvía, así que un pedido que luego era rechazado (por el
 * mínimo a domicilio) ya había descontado la despensa, y un id inexistente producía
 * un ticket "Base: —" con subtotal 0 que la cocina recibía como pedido real.
 *
 * Es la ÚNICA función pública que muta el cerebro (`enviarPedido` no pide sesión,
 * a propósito: la usan los clientes). Por eso valida como si el que llama fuera hostil.
 */
export async function crearPedido(input: NuevoPedido): Promise<Pedido> {
  const cat = await read();
  const byId = insumosPorId(cat);

  // — 0. IDEMPOTENCIA: el mismo envío dos veces es un solo pedido.
  const idemKey = input.idemKey?.trim() || undefined;
  if (idemKey) {
    const previo = cat.pedidos.find((p) => p.idemKey === idemKey);
    if (previo) return previo; // reintento del cliente: devolvemos el que ya existe
  }

  // — 1. ¿Estamos abiertos?
  if (cat.ajustes.abierto === false) {
    throw new Error(
      `Ahora mismo estamos cerrados${cat.ajustes.horarios ? ` · ${cat.ajustes.horarios}` : ""}. ¡Te esperamos!`,
    );
  }

  const buscar = (id: string): Ingrediente | undefined => {
    for (const grupo of ["bases", "proteinas", "toppings"] as const) {
      const it = cat[grupo].find((x) => x.id === id);
      if (it) return it;
    }
    return undefined;
  };

  // Un enredo insignia manda sobre lo que venga: sus componentes son los suyos.
  const insignia = input.enredoId
    ? cat.enredos.find((e) => e.id === input.enredoId)
    : undefined;
  if (input.enredoId && !insignia) throw new Error("Ese plato ya no está en la carta.");

  // — 2. Topes y deduplicación. La UI nunca permite más; el servidor tampoco.
  const protIdsCrudos = insignia
    ? [insignia.proteinaId]
    : input.proteinaIds && input.proteinaIds.length
      ? input.proteinaIds
      : ([input.proteinaId, input.proteinaId2].filter(Boolean) as string[]);
  const protIds = protIdsCrudos.filter(Boolean).slice(0, MAX_PROTEINAS);
  // Los toppings NO se deduplican (pedir doble aguacate es legítimo y se cobra doble),
  // pero sí se topan: sin límite, un pedido con 5.000 toppings vaciaba la despensa real.
  const topIdsCrudos = insignia ? insignia.toppingIds : input.toppingIds;
  const topIds = (Array.isArray(topIdsCrudos) ? topIdsCrudos : []).slice(0, MAX_TOPPINGS);
  const baseId = insignia ? insignia.baseId : input.baseId;

  // — 3. Resolver TODOS los componentes; ninguno puede faltar.
  const pedidos: { id: string; ing: Ingrediente }[] = [];
  for (const id of [baseId, ...protIds, ...topIds]) {
    const ing = buscar(id);
    if (!ing) throw new Error("Uno de los ingredientes ya no existe. Recarga la carta y vuelve a armarlo.");
    pedidos.push({ id, ing });
  }
  if (!buscar(baseId)) throw new Error("Falta la base del enredo.");
  if (protIds.length === 0) throw new Error("Falta la proteína del enredo.");

  // — 4. DISPONIBILIDAD: nada agotado, nada fuera de carta, y que la despensa alcance
  //      para TODAS las porciones de este pedido (dos aguacates piden dos aguacates).
  const necesarias = new Map<string, number>();
  for (const { id } of pedidos) necesarias.set(id, (necesarias.get(id) ?? 0) + 1);
  for (const [id, veces] of necesarias) {
    const ing = buscar(id)!;
    if (ing.activo === false) throw new Error(`"${ing.nombre}" ya no está en la carta.`);
    if (ing.agotado) throw new Error(`Se nos acabó "${ing.nombre}". Quítalo y vuelve a intentar.`);
    if (!alcanzaPara(ing, byId, veces)) {
      throw new Error(
        veces > 1
          ? `No nos alcanza para ${veces} de "${ing.nombre}".`
          : `Se nos acabó "${ing.nombre}". Quítalo y vuelve a intentar.`,
      );
    }
  }

  // — 5. Servicio. El default NO puede ser el que cobra: si nadie dice el tipo,
  //      un pedido con mesa es de mesa y el resto es para llevar. Antes caía en
  //      "domicilio" y le sumaba $5.000 a alguien que estaba sentado en el local.
  const tipo = input.tipo ?? (input.mesa ? "mesa" : "llevar");
  if (tipo === "mesa") {
    const n = Number(input.mesa ?? 0);
    const max = cat.ajustes.numMesas ?? 0;
    if (!Number.isInteger(n) || n < 1 || (max > 0 && n > max)) {
      throw new Error("Esa mesa no existe.");
    }
  }
  const direccion = input.direccion?.trim() || undefined;
  if (tipo === "domicilio" && !direccion) {
    throw new Error("Necesitamos la dirección de entrega para llevártelo.");
  }

  // — 6. Ya validado todo: AHORA sí se consume la despensa.
  const consumir = (id: string): Ingrediente => {
    const it = buscar(id)!;
    if (it.receta && it.receta.length > 0) {
      consumirReceta(it, byId); // ← descuenta despensa real
      it.agotado = !puedePreparar(it, byId); // agota si ya no da para otra
    } else if (typeof it.stock === "number") {
      it.stock = Math.max(0, it.stock - 1); // legado: unidades abstractas
      if (it.stock === 0) it.agotado = true;
    }
    return it;
  };

  const base = consumir(baseId);
  const prots = protIds.map(consumir); // todas a precio completo
  const tops = topIds.map(consumir);

  const impuestoPct = cat.ajustes.impuestoPct ?? 0;
  // El insignia tiene precio de carta CERRADO (todo incluido) → se desglosa hacia atrás
  // para que subtotal/impuesto sigan siendo comparables con los pedidos armados a mano.
  const armado =
    (base?.precio ?? 0) +
    prots.reduce((s, p) => s + p.precio, 0) + // todas las proteínas a precio completo
    tops.reduce((s, t, i) => s + (i < TOPPINGS_INCLUIDOS ? 0 : t.precio), 0);
  const { subtotal, impuesto } = insignia
    ? desglosarPrecioFinal(insignia.precio, impuestoPct)
    : { subtotal: armado, impuesto: Math.round((armado * impuestoPct) / 100) };

  // Domicilio: solo cuando el servicio lo es, y con el mínimo que fijó el dueño.
  const domicilio = tipo === "domicilio" ? cat.ajustes.costoDomicilio ?? 0 : 0;
  const falta = faltaParaMinimo(subtotal, tipo, cat.ajustes.pedidoMinimo);
  if (falta > 0)
    throw new Error(
      `El pedido mínimo a domicilio es ${formatCOP(cat.ajustes.pedidoMinimo)}. Te faltan ${formatCOP(falta)}.`
    );
  // Costo de insumos (COGS) congelado según receta y costos actuales.
  const costo = Math.round(
    costoReceta(base?.receta, byId) +
      prots.reduce((s, p) => s + costoReceta(p.receta, byId), 0) +
      tops.reduce((s, t) => s + costoReceta(t.receta, byId), 0)
  );

  const pedido: Pedido = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    creadoEn: new Date().toISOString(),
    canal: input.canal ?? "web",
    tipo,
    mesa: tipo === "mesa" ? input.mesa : undefined,
    cliente: input.cliente?.trim() || undefined,
    telefono: input.telefono?.trim() || undefined,
    direccion,
    notas: input.notas?.trim().slice(0, 200) || undefined,
    estado: "recibido",
    pago: "pendiente",
    base: base.nombre,
    proteina: prots.map((p) => p.nombre).join(" + "),
    toppings: tops.map((t) => t.nombre),
    /** Los ids, para poder devolver la despensa si el pedido se cancela. */
    componentes: [baseId, ...protIds, ...topIds],
    subtotal,
    impuesto,
    domicilio,
    propina: 0,
    descuento: 0,
    total: totalDe({ subtotal, impuesto, domicilio }),
    costo,
    enredoId: insignia?.id,
    idemKey,
  };

  cat.pedidos = recortarPedidos([pedido, ...cat.pedidos]);
  await commit(cat, `Nuevo pedido #${pedido.id} (${formatCOP(pedido.total)})`);
  return pedido;
}

/**
 * Avanza un pedido al siguiente estado (recibido→cocina→listo→entregado).
 *
 * `desde` hace la operación IDEMPOTENTE: el botón del KDS no lleva useFormStatus, así
 * que con red lenta y manos ocupadas el cocinero tocaba dos veces y el pedido saltaba
 * de "recibido" a "listo" sin pasar por la plancha. Si el estado ya no es el que el
 * operario vio en pantalla, no se hace nada.
 */
export async function avanzarPedido(id: string, desde?: EstadoPedido): Promise<Pedido[]> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  if (p.estado === "cancelado") throw new Error("Ese pedido está cancelado.");
  if (desde && p.estado !== desde) return cat.pedidos; // otro ya lo avanzó: no duplicamos
  if (p.estado === "entregado") return cat.pedidos;
  p.estado = nextEstado(p.estado);
  await commit(cat, `Avanzó #${id} a ${p.estado}`);
  return cat.pedidos;
}

/** Retrocede un pedido un paso (el KDS necesita corregir un toque de más). */
export async function retrocederPedido(id: string): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  if (p.estado === "cancelado") throw new Error("Ese pedido está cancelado.");
  const i = ESTADOS.indexOf(p.estado);
  if (i > 0) p.estado = ESTADOS[i - 1];
  await commit(cat, `Devolvió #${id} a ${p.estado}`);
  return cat;
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
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  // Cobrar dos veces pisaba propina, descuento y método: la propina del mesero
  // desaparecía y el arqueo por método dejaba de cuadrar con el datáfono.
  if (p.pago === "pagado") throw new Error(`El pedido #${id} ya estaba cobrado.`);
  if (p.estado === "cancelado") throw new Error("No se puede cobrar un pedido cancelado.");
  p.pago = "pagado";
  p.metodoPago = metodo;
  p.propina = Math.max(0, Math.round(propina));
  p.descuento = Math.max(0, Math.min(p.subtotal, Math.round(descuento)));
  p.total = totalDe(p); // ← con el domicilio incluido. Ver lib/precios.ts
  await commit(cat, `Cobró #${id} (${metodo} · ${formatCOP(p.total)})`);
  return cat;
}

/**
 * Cancela un pedido y DEVUELVE la despensa si todavía no se había cocinado.
 *
 * Antes solo escribía `estado = "cancelado"`. Tres agujeros a la vez: se podía cancelar
 * un pedido ya cobrado (el ingreso salía de los reportes y el efectivo se quedaba en la
 * caja sin rastro), los insumos consumidos no volvían nunca (merma invisible que se
 * acumulaba día a día), y no quedaba constancia de por qué.
 */
export async function cancelarPedido(id: string, motivo?: string): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  if (p.estado === "cancelado") return cat;
  if (p.pago === "pagado") {
    throw new Error(
      `El pedido #${id} ya está cobrado (${formatCOP(p.total)}). Para anularlo hay que registrar la devolución del dinero.`,
    );
  }
  // Si aún no entró a cocina, la comida no se tocó: la despensa vuelve.
  if (p.estado === "recibido" && p.componentes?.length) {
    const byId = insumosPorId(cat);
    for (const compId of p.componentes) {
      for (const g of ["bases", "proteinas", "toppings"] as const) {
        const it = cat[g].find((x) => x.id === compId);
        if (!it) continue;
        if (it.receta?.length) {
          for (const r of it.receta) {
            const ins = byId.get(r.insumoId);
            if (ins) ins.stock = Number((ins.stock + r.cantidad).toFixed(3));
          }
        } else if (typeof it.stock === "number") {
          it.stock += 1;
        }
        break;
      }
    }
    reactivarPreparables(cat);
  }
  p.estado = "cancelado";
  p.motivoCancelacion = motivo?.trim().slice(0, 140) || undefined;
  await commit(cat, `Canceló #${id}${motivo ? ` — ${motivo.trim().slice(0, 60)}` : ""}`);
  return cat;
}

/** Asigna (o cambia) la mesa de un pedido; lo marca como servicio en mesa. */
export async function asignarMesa(id: string, mesa: number): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  const max = cat.ajustes.numMesas ?? 0;
  if (!Number.isInteger(mesa) || mesa < 1 || (max > 0 && mesa > max)) {
    throw new Error("Esa mesa no existe.");
  }
  p.mesa = mesa;
  p.tipo = "mesa";
  // Pasar un domicilio a mesa dejaba los $5.000 del envío dentro del total: un
  // estado internamente contradictorio ("come aquí, pero paga el domiciliario").
  p.domicilio = 0;
  if (p.pago !== "pagado") p.total = totalDe(p);
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

/**
 * Elimina un insumo — y se NIEGA si alguna receta lo usa.
 *
 * Antes lo borraba y de paso amputaba la línea en todas las recetas, en silencio. El
 * plato quedaba con receta vacía, así que `puedePreparar` caía a un contador abstracto
 * que nadie mantiene y `costoReceta([])` devolvía 0: el componente más caro pasaba a
 * costar cero en el P&L y se seguía vendiendo sin materia prima. Todo por un clic
 * pegado al botón Guardar.
 */
export async function deleteInsumo(id: string): Promise<Catalog> {
  const cat = await read();
  const nombre = cat.insumos.find((i) => i.id === id)?.nombre ?? id;
  const usan: string[] = [];
  for (const g of ["bases", "proteinas", "toppings"] as const)
    cat[g].forEach((it) => {
      if (it.receta?.some((r) => r.insumoId === id)) usan.push(it.nombre);
    });
  if (usan.length) {
    throw new Error(
      `No se puede eliminar "${nombre}": lo usan ${usan.length} receta(s) — ${usan.slice(0, 4).join(", ")}${usan.length > 4 ? "…" : ""}. Quítalo primero de esas fichas técnicas.`,
    );
  }
  cat.insumos = cat.insumos.filter((i) => i.id !== id);
  await commit(cat, `Eliminó insumo "${nombre}"`);
  return cat;
}

/**
 * Registra una compra (salida de caja).
 *
 * `montoReal` es lo que de verdad se pagó en la tienda. Si viene, manda sobre
 * `cantidad × costo`: es plata que salió de la caja y el reporte debe cuadrar con
 * el recibo, no con una estimación.
 */
function registrarCompra(
  cat: Catalog,
  insumo: Insumo,
  delta: number,
  montoReal?: number,
): void {
  if (delta <= 0) return;
  const monto = montoReal && montoReal > 0 ? Math.round(montoReal) : Math.round(delta * (insumo.costo ?? 0));
  if (monto <= 0) return; // sin costo conocido no hay salida de caja que registrar
  const mov: Movimiento = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    fecha: new Date().toISOString(),
    tipo: "compra",
    concepto: `Abastecer ${insumo.nombre}`,
    monto,
    categoria: "insumos",
    insumoId: insumo.id,
    cantidad: Number(delta.toFixed(3)),
  };
  cat.movimientos = [mov, ...(cat.movimientos ?? [])].slice(0, 2000);
}

/**
 * Suma cantidad al stock de un insumo → "Abastecer".
 *
 * `montoTotal` (opcional) es lo que se pagó por ESA compra. Cuando viene:
 *  · el movimiento de caja se registra por el monto exacto del recibo, y
 *  · el costo unitario del insumo se ACTUALIZA solo (monto ÷ cantidad).
 *
 * Antes solo se podía teclear la cantidad, y el costo unitario vivía escondido en
 * el formulario de edición: el operario compraba "$70.000 de papa" y el sistema
 * anotaba una cifra vieja. Ahora se registra lo que pasó de verdad y el margen de
 * cada plato se corrige solo cuando cambia el precio del proveedor.
 */
export async function abastecerInsumo(
  id: string,
  cantidad: number,
  montoTotal?: number,
): Promise<Catalog> {
  const cat = await read();
  const it = cat.insumos.find((x) => x.id === id);
  if (!it) throw new Error("Ese insumo ya no existe.");
  if (!(cantidad > 0)) throw new Error("¿Cuánto entró? Escribe una cantidad.");
  const antes = it.stock;
  it.stock = Math.max(0, Number((it.stock + cantidad).toFixed(3)));
  const delta = it.stock - antes;
  if (montoTotal && montoTotal > 0 && delta > 0) {
    it.costo = Math.max(0, Math.round(montoTotal / delta));
  }
  registrarCompra(cat, it, delta, montoTotal);
  reactivarPreparables(cat, id);
  await commit(
    cat,
    `Abasteció ${cantidad} ${it.unidad} de ${it.nombre}` +
      (montoTotal && montoTotal > 0 ? ` por ${formatCOP(montoTotal)}` : ""),
  );
  return cat;
}

/**
 * Deja un insumo AL MENOS en su nivel estándar (par) y registra la compra.
 *
 * Antes era `it.stock = it.parStock` a secas, así que con 60 lb de papa y un par de 40
 * el botón "Llenar hasta el estándar" BORRABA 20 lb del registro — y `registrarCompra`
 * ignora los deltas negativos, así que no quedaba rastro. No se evaporaba comida: se
 * evaporaba el inventario, y el operario volvía a comprar lo que ya tenía.
 */
export async function abastecerAPar(id: string): Promise<Catalog> {
  const cat = await read();
  const it = cat.insumos.find((x) => x.id === id);
  if (it) {
    const antes = it.stock;
    it.stock = Math.max(it.stock, it.parStock);
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
    i.stock = Math.max(i.stock, i.parStock); // llenar nunca puede significar vaciar
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
  await commit(cat, "Eliminó un movimiento", { autoritativo: true });
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
