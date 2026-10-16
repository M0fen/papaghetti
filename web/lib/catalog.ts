import fs from "node:fs/promises";
import path from "node:path";
import {
  supabaseEnabled,
  supabaseAdmin,
  CATALOG_TABLE,
  CATALOG_ID,
} from "./supabase";
import {
  faltaParaMinimo,
  totalDe,
  diaNegocio,
  ZONA_NEGOCIO,
  cobroToppings,
  cuentaIncluida,
  brutoDe,
  sinImpuesto,
  precioBases,
  basesElegidas,
  nombreBases,
  modoBasesTexto,
} from "./precios";
import { CARPETA_FOTOS, direccionFoto, formatoFoto, rutaFoto } from "./fotos";
import {
  SEED_CATALOG,
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
  type ItemPedido,
  type Arqueo,
  esVenta,
  type Lead,
  type EstadoLead,
  type TipoServicio,
  type MetodoPago,
  type Ajustes,
  type AdicionalConfig,
  type AdicionalNuevo,
  type Categoria,
  costoReceta,
  formatCOP,
  lineasDe,
  findIn,
  type Insumo,
  type InsumoCategoria,
  type RecetaItem,
  type Promo,
  type UnidadInsumo,
  type Movimiento,
  type GastoCategoria,
  type HistItem,
  type VivoTras,
  normalizarAjustes,
  basesMaxDe,
  cobroBasesDe,
} from "./menu";
import { USUARIOS, usuariosDe } from "./usuarios";

const GRUPO: Record<Categoria, "bases" | "proteinas" | "toppings"> = {
  base: "bases",
  proteina: "proteinas",
  topping: "toppings",
  // Las salsas viven con los toppings, pero valen $0: se filtran al cobrar.
  salsa: "toppings",
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
  // ajustes: defaults para los campos nuevos y FORMA garantizada en las secciones anidadas
  cat.ajustes = normalizarAjustes(cat.ajustes);
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
  if (!Array.isArray(cat.archivoMeses)) cat.archivoMeses = [];
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
 *
 * Y vale con CUALQUIERA de las dos credenciales (ver `almacenBlob`). Antes solo contaba
 * el token: al conectar el almacén a un proyecto, o al trasladarlo a otra cuenta, Vercel
 * pone `BLOB_STORE_ID` y puede no dejar token, y entonces el sitio caía EN SILENCIO al
 * disco temporal (/tmp), donde cada reinicio se lleva el turno.
 */
const blobEnabled = (): boolean =>
  almacenBlob() !== null && Boolean(process.env.VERCEL || process.env.PG_BLOB);

/** Con qué almacén habla la app y cómo entra (lo muestra Ajustes → Dónde se guarda todo). */
export interface AlmacenBlob {
  /**
   * "store_…", como lo muestra Vercel en Storage → el almacén → Settings. NO es secreto:
   * es el subdominio de las direcciones del almacén. El token sí lo es, y no sale de aquí.
   */
  id: string;
  /** La conexión del proyecto (`BLOB_STORE_ID` + OIDC, la renueva Vercel) o el token fijo. */
  credencial: "oidc" | "token";
  /** Si la conexión y el token apuntan a almacenes DISTINTOS: el del token. */
  otro?: string;
}

/**
 * LAS CREDENCIALES DEL ALMACÉN, LEÍDAS COMO LAS LEE EL SDK (@vercel/blob 2.x): una variable
 * vacía o con solo espacios es como si no estuviera, el almacén del token es el cuarto
 * pedazo de `vercel_blob_rw_<almacén>_<secreto>`, y si están las dos gana la conexión
 * (el SDK la prefiere siempre que Vercel le entregue su credencial). Recibe el entorno por
 * parámetro para poder probarla sin tocar el de verdad.
 *
 * La conexión solo cuenta DENTRO de Vercel, que es donde existe su credencial. En un
 * computador el SDK iría a pedirla con la sesión de la herramienta de Vercel del
 * desarrollador y entraría al almacén REAL del restaurante; además, el seguro que impide
 * correr las pruebas contra producción (qa-ts.mjs) reconoce el token, no la conexión.
 */
export function almacenBlob(env: Record<string, string | undefined> = process.env): AlmacenBlob | null {
  const leer = (k: string) => (env[k] ?? "").trim();
  const conPrefijo = (s: string) => (s ? `store_${s.replace(/^store_/, "")}` : "");
  const token = leer("BLOB_READ_WRITE_TOKEN");
  const delToken = conPrefijo(token.split("_")[3] ?? "");
  const conexion = env.VERCEL ? conPrefijo(leer("BLOB_STORE_ID")) : "";
  if (conexion) {
    // Mayúsculas o minúsculas da igual: el almacén es un subdominio.
    const otro = delToken && delToken.toLowerCase() !== conexion.toLowerCase() ? delToken : "";
    return otro ? { id: conexion, credencial: "oidc", otro } : { id: conexion, credencial: "oidc" };
  }
  return token ? { id: delToken, credencial: "token" } : null;
}
/**
 * CADA ENTORNO, SU CEREBRO. `blobEnabled` solo exige estar en Vercel, y eso es cierto
 * también en los despliegues de PRUEBA de una rama: con una sola ruta constante,
 * cualquier preview leía y escribía el documento del restaurante. Nadie puede entrar
 * al panel de un preview (ahí no está la contraseña), pero la página pública sí crea
 * pedidos y consume despensa de verdad. Producción conserva la ruta de siempre para no
 * migrar nada; lo demás escribe en su propio cajón.
 */
const entornoBlob = (): string => {
  const e = process.env.VERCEL_ENV; // "production" | "preview" | "development"
  if (!e || e === "production") return "";
  const rama = (process.env.VERCEL_GIT_COMMIT_REF || e).replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40);
  return `pruebas/${rama}/`;
};
const RUTA_BLOB = `cerebro/${entornoBlob()}catalog.json`;

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

/**
 * Snapshot del estado tal como se leyó, por cada copia entregada. Sirve para saber
 * QUÉ cambió el que llama y poder aplicarlo sobre lo que otra instancia haya escrito
 * mientras tanto (ver fusionar). WeakMap: se libera solo con la copia.
 */
const origen = new WeakMap<Catalog, Catalog>();

async function read(): Promise<Catalog> {
  const base =
    memo && memo.hasta > Date.now()
      ? memo.cat
      : supabaseEnabled()
        ? await readSupabase()
        : blobEnabled()
          ? await readBlob()
          : await readFile();
  if (!memo || memo.hasta <= Date.now()) memo = { cat: base, hasta: Date.now() + MEMO_MS };
  /* COPIA, nunca la referencia. El memo se entregaba tal cual y los llamadores lo
     MUTAN (crearPedido descuenta despensa sobre el objeto que recibe): dos pedidos
     simultáneos dentro de los mismos 2 s compartían el mismo objeto y descontaban la
     despensa UNA sola vez, y un pedido rechazado dejaba el memo ya mordido. */
  const copia = structuredClone(base);
  origen.set(copia, base);
  return copia;
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
    await put(`cerebro/${entornoBlob()}respaldo-${dia}.json`, cuerpo, {
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
  /* En WINDOWS el rename falla (EPERM/EBUSY) si en ese instante alguien tiene el archivo
     abierto para leer — otra petición del mismo proceso, el antivirus, el indexador. Es
     momentáneo: se reintenta unos milisegundos en vez de perder la escritura. (Solo
     aplica al archivo local; en producción el cerebro vive en el almacén.) */
  for (let intento = 0; ; intento++) {
    try {
      await fs.rename(tmp, FILE);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (intento >= 12 || !(code === "EPERM" || code === "EBUSY" || code === "EACCES")) throw e;
      await new Promise((r) => setTimeout(r, 15 * (intento + 1)));
    }
  }
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

/* ══════════════════════════════════════════════════════════════════════════
   DOCUMENTOS AUXILIARES

   El cerebro es UN documento, pero no todo cabe en él para siempre: los
   comprobantes viejos se mudan a un documento por mes (ver ARCHIVO DE
   COMPROBANTES). Estas tres funciones leen, escriben y borran un documento
   auxiliar con el MISMO backend que el cerebro: fila propia en Supabase, blob
   propio en Vercel, archivo propio en data/. En Blob la escritura es condicional
   (compare-and-swap) sobre la última lectura de ESA clave.
   ══════════════════════════════════════════════════════════════════════════ */
const etagsAux = new Map<string, string>();
const rutaBlobAux = (clave: string) => `cerebro/${entornoBlob()}${clave}.json`;
const rutaFileAux = (clave: string) => path.join(DATA_DIR, `${clave}.json`);

async function leerDoc<T>(clave: string): Promise<T | null> {
  if (supabaseEnabled()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from(CATALOG_TABLE).select("data").eq("id", clave).maybeSingle();
    if (error) throw new Error(`Supabase no respondió (${clave}): ${error.message}`);
    return (data?.data as T | undefined) ?? null;
  }
  if (blobEnabled()) {
    const { get } = await import("@vercel/blob");
    try {
      const b = await conReintento(() => get(rutaBlobAux(clave), { access: "private", useCache: false }));
      if (!b || b.statusCode !== 200 || !b.stream) return null;
      etagsAux.set(clave, (b.blob?.etag ?? "").replace(/^W\//, ""));
      return JSON.parse(await new Response(b.stream).text()) as T;
    } catch (e) {
      if ((e as Error)?.name === "BlobNotFoundError") return null;
      throw e;
    }
  }
  try {
    return JSON.parse(await fs.readFile(rutaFileAux(clave), "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw e;
  }
}

async function escribirDoc<T>(clave: string, doc: T): Promise<void> {
  if (supabaseEnabled()) {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from(CATALOG_TABLE)
      .upsert({ id: clave, data: doc, updated_at: new Date().toISOString() });
    if (error) throw new Error(`No se pudo guardar ${clave} en Supabase: ${error.message}`);
    return;
  }
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const etag = etagsAux.get(clave);
    const r = await conReintento(() =>
      put(rutaBlobAux(clave), JSON.stringify(doc), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        ...(etag ? { ifMatch: etag } : {}),
      }),
    );
    etagsAux.set(clave, (r.etag ?? "").replace(/^W\//, ""));
    return;
  }
  const ruta = rutaFileAux(clave);
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc), "utf8");
  await fs.rename(tmp, ruta);
}

/**
 * UNA FOTO NO PUEDE VIVIR DENTRO DEL CEREBRO.
 *
 * El navegador comprime la imagen y la manda como texto (`data:image/...;base64,...`),
 * y eso se guardaba tal cual dentro del mismo documento que la carta, los pedidos y la
 * caja. Una sola foto ya ocupaba el 85% del documento de producción, y cada pantalla lo
 * lee entero cada pocos segundos. Con la carta fotografiada, cada «Listo» de la cocina
 * subiría megabytes.
 *
 * Así que la imagen se sube como ARCHIVO aparte y en el documento queda su dirección.
 *
 * EN PRIVADO, como el cerebro. El almacén se creó privado (ahí están los pedidos y la
 * caja) y se le pedía una foto "pública": eso no se puede, así que TODA subida fallaba,
 * la foto se quedaba como texto sin que nadie se enterara y la portada pública cargaba
 * varias fotos incrustadas en su HTML. Lo que se guarda ahora es la dirección de la
 * puerta propia del sitio (`/foto/fotos/…`, ver lib/fotos.ts y app/foto): no lleva el
 * nombre del almacén ni el dominio, así que sigue sirviendo tras un traslado de cuenta.
 *
 * En local no hay almacén: ahí se queda el texto, que es inofensivo porque el archivo de
 * desarrollo no lo lee nadie más. Lo que ya esté guardado como texto sigue funcionando:
 * solo se convierte al volver a subirlo.
 */
export async function guardarFoto(valor: string | undefined, id: string): Promise<string | undefined> {
  if (!valor || !valor.startsWith("data:")) return valor; // ya es una dirección, o no hay foto
  if (!blobEnabled()) return valor; // desarrollo: sin almacén, se queda como está
  const m = valor.match(/^data:image\/([a-z+]+);base64,(.+)$/i);
  if (!m) return undefined;
  // Solo lo que la puerta sabe servir: un SVG, por ejemplo, puede llevar código.
  const formato = formatoFoto(m[1]);
  if (!formato) return undefined;
  const bytes = Buffer.from(m[2], "base64");
  try {
    const { put } = await import("@vercel/blob");
    // Igual que writeBlob (privado, con reintento), salvo el nombre: aquí uno nuevo por subida.
    const r = await conReintento(() =>
      put(`${CARPETA_FOTOS}${entornoBlob()}${slugify(id)}.${formato.ext}`, bytes, {
        access: "private",
        contentType: formato.tipo,
        addRandomSuffix: true, // nombre nuevo por subida: ninguna caché sirve la foto vieja
        cacheControlMaxAge: 31_536_000,
      }),
    );
    // Lo guardado tiene que pasar por la puerta. Un nombre que no esperábamos sería una
    // foto rota para siempre: mejor quedarse con el texto, como si la subida fallara.
    if (!rutaFoto(r.pathname)) {
      console.warn("[papaghetti] el almacén devolvió un nombre de foto inesperado:", r.pathname);
      return valor;
    }
    return direccionFoto(r.pathname);
  } catch (e) {
    // Si el almacén falla, mejor guardar el texto que perder la foto del operario.
    console.warn("[papaghetti] no se pudo subir la foto:", (e as Error)?.message ?? e);
    return valor;
  }
}

async function borrarDoc(clave: string): Promise<void> {
  etagsAux.delete(clave);
  if (supabaseEnabled()) {
    const sb = supabaseAdmin();
    const { error } = await sb.from(CATALOG_TABLE).delete().eq("id", clave);
    if (error) throw new Error(`No se pudo borrar ${clave} en Supabase: ${error.message}`);
    return;
  }
  if (blobEnabled()) {
    const { del } = await import("@vercel/blob");
    try {
      await del(rutaBlobAux(clave));
    } catch (e) {
      if ((e as Error)?.name !== "BlobNotFoundError") throw e;
    }
    return;
  }
  try {
    await fs.unlink(rutaFileAux(clave));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE SALE DEL ALMACÉN SIN TOCARLO

   Dos lecturas que no escriben nada: la foto que el sitio pide por su puerta propia
   (/foto/…, sin sesión) y la copia completa del negocio que el dueño descarga desde
   Ajustes (con sesión).
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Una foto del almacén para la puerta /foto/…: su contenido, o `null` si no hay (no
 * existe, o no hay almacén: en local las fotos viven como texto dentro del cerebro).
 * LANZA si el almacén no responde, para que la puerta no lo confunda con "no existe".
 *
 * Vuelve a validar la ruta aunque la puerta ya lo haya hecho: es la única lectura del
 * almacén que pide alguien SIN sesión, y por ningún camino puede llegar a cerebro/. Con
 * la caché del almacén encendida (al revés que el cerebro): cada foto tiene nombre
 * único y no cambia nunca.
 */
export async function leerFoto(pathname: string): Promise<ReadableStream<Uint8Array> | null> {
  if (!rutaFoto(pathname)) return null;
  if (!blobEnabled()) return null;
  const { get } = await import("@vercel/blob");
  try {
    const b = await conReintento(() => get(pathname, { access: "private" }));
    return b && b.statusCode === 200 && b.stream ? b.stream : null;
  } catch (e) {
    if ((e as Error)?.name === "BlobNotFoundError") return null;
    throw e;
  }
}

/** Una foto que vive FUERA del documento: dónde se usa y su dirección. */
export interface FotoEnlazada {
  /** "bases/pollo", "enredos/la-clasica", "ajustes/sitio/portada/foto"… */
  donde: string;
  url: string;
}

/** El archivo de Ajustes → Descargar copia completa. */
export interface CopiaCompleta {
  formato: "papaghetti/copia-completa";
  version: 1;
  generadoEn: string;
  /** El día en Pereira ("AAAA-MM-DD"). */
  diaNegocio: string;
  origen: { backend: "supabase" | "blob" | "archivo"; entorno: string; almacen?: string };
  conteos: {
    pedidos: number;
    pedidosArchivados: number;
    /** Pedidos de cada mes archivado. */
    porMes: Record<string, number>;
    /** Meses que el índice apunta pero cuyo documento no apareció: no van en `archivo`. */
    mesesSinDocumento: string[];
    movimientos: number;
    leads: number;
    arqueos: number;
    historial: number;
    /** Fotos que viven como archivo aparte (van en `fotos`, como dirección). */
    fotosEnlazadas: number;
    /** Fotos guardadas como texto: ya van dentro de `cerebro`. */
    fotosDentro: number;
  };
  /** El documento principal tal cual, salvo las pilas de deshacer y rehacer. */
  cerebro: Catalog;
  /** Cada mes archivado, exactamente como está guardado ("AAAA-MM" → su documento). */
  archivo: Record<string, ArchivoMes>;
  fotos: FotoEnlazada[];
  /** SIEMPRE la última clave: si el archivo llegó cortado, no está. */
  completo: true;
}

/** Las fotos del documento: las que son un archivo aparte se listan; las de texto se cuentan. */
function fotosDe(cat: Catalog): { enlazadas: FotoEnlazada[]; dentro: number } {
  const enlazadas: FotoEnlazada[] = [];
  let dentro = 0;
  const anotar = (donde: string, v: unknown) => {
    // Las de la carta son texto; las del sitio, { url, ancho, alto }.
    const url =
      typeof v === "string" ? v : typeof (v as { url?: unknown } | null)?.url === "string" ? (v as { url: string }).url : "";
    if (!url) return;
    if (url.startsWith("data:")) dentro++;
    else enlazadas.push({ donde, url });
  };
  for (const g of ["bases", "proteinas", "toppings", "enredos"] as const) {
    for (const x of cat[g] ?? []) anotar(`${g}/${x.id}`, x.foto);
  }
  for (const r of RUTAS_IMAGEN_AJUSTES) anotar(`ajustes/${r.join("/")}`, leerRuta(cat.ajustes, r));
  return { enlazadas, dentro };
}

/**
 * LA COPIA COMPLETA DEL DUEÑO: todo el negocio, listo para guardar fuera de Vercel.
 *
 * El respaldo diario vive en el MISMO almacén que los datos y solo lleva el documento
 * principal; si se pierde el almacén (un traslado de cuenta mal hecho, una variable
 * equivocada), se pierde con él. Esta copia la descarga el dueño y la guarda donde quiera.
 *
 * · El documento principal se lee FRESCO (sin el memo de 2 s) y ya migrado. Sin las pilas
 *   de deshacer y rehacer: son copias viejas de la carta, no registros del negocio, y al
 *   restaurar dejarían que un "Deshacer" saltara hacia atrás por encima de la restauración.
 *   El historial sí va: dice quién hizo qué.
 * · DESPUÉS, cada mes archivado, uno por uno y tal como está guardado. El orden importa:
 *   archivar muda pedidos del principal a su mes, así que leyendo primero el principal un
 *   pedido puede salir repetido (inofensivo: se une por id), pero nunca perdido. Al revés
 *   sí podría perderse.
 * · Las fotos que son archivo aparte van como lista de direcciones (copiar los archivos
 *   es tarea del desarrollador); las guardadas como texto ya van dentro del documento.
 *
 * NO ESCRIBE NADA: ni historial, ni pila de deshacer, ni respaldo. (La única escritura
 * posible es la de siempre al leer: si el almacén está VACÍO, `read` siembra la carta de
 * fábrica, igual que lo haría cualquier pantalla.) Si una lectura falla, lanza y no hay
 * copia a medias: la ruta lo convierte en un error limpio.
 */
export async function copiaCompleta(ahora: Date = new Date()): Promise<CopiaCompleta> {
  const backend = supabaseEnabled() ? "supabase" : blobEnabled() ? "blob" : "archivo";
  olvidar();
  const cat = await read();
  const archivo: Record<string, ArchivoMes> = {};
  const porMes: Record<string, number> = {};
  const mesesSinDocumento: string[] = [];
  for (const mes of [...new Set(cat.archivoMeses ?? [])].sort()) {
    // El índice lo escribe la app, pero se valida igual: con él se arma el nombre del documento.
    const doc = /^\d{4}-\d{2}$/.test(mes) ? await leerDoc<ArchivoMes>(claveMes(mes)) : null;
    if (!doc) {
      mesesSinDocumento.push(mes);
      continue;
    }
    archivo[mes] = doc;
    porMes[mes] = Array.isArray(doc.pedidos) ? doc.pedidos.length : 0;
  }
  const { enlazadas, dentro } = fotosDe(cat);
  const almacen = backend === "blob" ? almacenBlob()?.id : undefined;
  return {
    formato: "papaghetti/copia-completa",
    version: 1,
    generadoEn: ahora.toISOString(),
    diaNegocio: diaNegocio(ahora),
    origen: { backend, entorno: process.env.VERCEL_ENV || "local", ...(almacen ? { almacen } : {}) },
    conteos: {
      pedidos: cat.pedidos.length,
      pedidosArchivados: Object.values(porMes).reduce((s, n) => s + n, 0),
      porMes,
      mesesSinDocumento,
      movimientos: cat.movimientos.length,
      leads: cat.leads.length,
      arqueos: (cat.arqueos ?? []).length,
      historial: (cat.historial ?? []).length,
      fotosEnlazadas: enlazadas.length,
      fotosDentro: dentro,
    },
    cerebro: { ...cat, undo: [], redo: [] },
    archivo,
    fotos: enlazadas,
    completo: true,
  };
}

const fmtHoraMinuto = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_NEGOCIO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23", // "00:05", nunca "24:05"
});
/** "papaghetti-copia-AAAA-MM-DD-HHMM.json", con el día y la hora de Pereira (no los del servidor). */
export function nombreCopia(fecha: Date = new Date()): string {
  return `papaghetti-copia-${diaNegocio(fecha)}-${fmtHoraMinuto.format(fecha).replace(":", "")}.json`;
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
 *
 * Con el almacén de Vercel dice además CUÁL almacén y cómo entra. Después de un traslado
 * de cuenta, la prueba de que el negocio sigue siendo el mismo es que el identificador
 * no cambió: con la variable de OTRO almacén, el sitio arranca con la carta de fábrica y
 * cero pedidos, y eso se ve igual que "se borró todo".
 */
export async function estadoPersistencia(): Promise<{
  backend: "supabase" | "blob" | "archivo";
  nombre: string;
  durable: boolean;
  ok: boolean;
  detalle: string;
  pedidos?: number;
  peso?: string;
  /** Solo con el almacén de Vercel. */
  almacen?: {
    id: string;
    credencial: AlmacenBlob["credencial"];
    /** La credencial, dicha para el dueño. */
    como: string;
    /** Hay dos almacenes configurados: cuál sobra y qué hacer. */
    aviso?: string;
  };
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
  const a = backend === "blob" ? almacenBlob() : null;
  const almacen = a
    ? {
        id: a.id,
        credencial: a.credencial,
        como: a.credencial === "oidc" ? "la conexión del proyecto (OIDC)" : "el token del almacén",
        ...(a.otro
          ? {
              aviso:
                `También hay un token de OTRO almacén (${a.otro}). Hoy se usa ${a.id}, el de la ` +
                "conexión; si la conexión fallara, el sistema pasaría al otro sin avisar. Deja una " +
                "sola: en Vercel, borra la variable que sobre y vuelve a desplegar.",
            }
          : {}),
      }
    : undefined;
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
      ...(almacen ? { almacen } : {}),
    };
  } catch (e) {
    return {
      backend,
      nombre,
      durable,
      ok: false,
      detalle: `No se pudo leer: ${(e as Error)?.message ?? e}`,
      // Justo cuando no se puede leer es cuando más importa saber a qué almacén se le preguntó.
      ...(almacen ? { almacen } : {}),
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
/* Profundidad de deshacer/rehacer. Cada nivel es una copia de la carta entera, así
   que 12 niveles multiplicaban por 12 el peso del documento (y de cada escritura).
   Seis pasos atrás es más de lo que nadie deshace en un turno. */
const UNDO_CAP = 6;
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
  /* Y FUERA LAS FOTOS. Las que ya están guardadas como texto (antes de que las fotos se
     subieran como archivo aparte) se copiaban ENTERAS en cada uno de los seis
     snapshots: una foto de 90 KB pesaba 630 KB en la pila. `conLoVivo` las devuelve al
     restaurar, así que deshacer no las pierde — simplemente no las revierte, igual que
     no revierte los pedidos. */
  const sinFotos = <T extends { foto?: string }>(xs: T[] | undefined): T[] =>
    (xs ?? []).map((x) => (x.foto ? { ...x, foto: undefined } : x));
  return {
    ...cat,
    undo: undefined,
    redo: undefined,
    historial: undefined,
    etiqueta: undefined,
    vivoTras: undefined,
    pedidos: [],
    movimientos: [],
    leads: [],
    arqueos: [],
    bases: sinFotos(cat.bases),
    proteinas: sinFotos(cat.proteinas),
    toppings: sinFotos(cat.toppings),
    enredos: sinFotos(cat.enredos),
    // El logo del papel y las fotos del sitio tampoco viajan en la pila (ver RUTAS_IMAGEN_AJUSTES).
    ajustes: sinImagenesAjustes(cat.ajustes),
  };
}

/**
 * LAS IMÁGENES QUE VIVEN DENTRO DE AJUSTES (el logo del comprobante, las fotos del
 * sitio). Igual que las de la carta: fuera de las fotos de la pila, y al deshacer se
 * conservan las de ahora. Una sección nueva con imagen se anota aquí.
 */
const RUTAS_IMAGEN_AJUSTES: string[][] = [
  ["comprobante", "logo"],
  ["sitio", "portada", "foto"],
  ["sitio", "seo", "fotoCompartir"],
];
function leerRuta(o: unknown, ruta: string[]): unknown {
  let x: unknown = o;
  for (const k of ruta) {
    if (!x || typeof x !== "object") return undefined;
    x = (x as Record<string, unknown>)[k];
  }
  return x;
}
/** Pone (o quita, con `undefined`) un valor en una ruta, copiando cada nivel: no muta el original. */
function conRuta<T>(o: T, ruta: string[], valor: unknown): T {
  const [k, ...resto] = ruta;
  const base = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  if (!resto.length) {
    const copia = { ...base };
    if (valor === undefined) delete copia[k];
    else copia[k] = valor;
    return copia as T;
  }
  const hijo = base[k];
  if (valor === undefined && (hijo === undefined || hijo === null)) return o; // nada que quitar
  return { ...base, [k]: conRuta(hijo, resto, valor) } as T;
}
function sinImagenesAjustes(a: Ajustes): Ajustes {
  let out = a;
  for (const r of RUTAS_IMAGEN_AJUSTES) if (leerRuta(out, r) !== undefined) out = conRuta(out, r, undefined);
  return out;
}
function conImagenesAjustes(delSnap: Ajustes, delVivo: Ajustes | undefined): Ajustes {
  let out = delSnap;
  for (const r of RUTAS_IMAGEN_AJUSTES) {
    const v = leerRuta(delVivo, r);
    if (v !== undefined || leerRuta(out, r) !== undefined) out = conRuta(out, r, v);
  }
  return out;
}

const GRUPOS_ING = ["bases", "proteinas", "toppings"] as const;
const redondear3 = (n: number) => Math.max(0, Number(n.toFixed(3)));

/** Lo que mueven los pedidos (stock de la despensa, stock suelto, agotados), por id. */
function vivoDe(cat: Catalog): VivoTras {
  const insumos: Record<string, number> = {};
  for (const i of cat.insumos ?? []) insumos[i.id] = i.stock;
  const stock: Record<string, number> = {};
  const agotado: Record<string, boolean> = {};
  for (const g of GRUPOS_ING) {
    for (const it of cat[g] ?? []) {
      if (typeof it.stock === "number") stock[it.id] = it.stock;
      agotado[it.id] = Boolean(it.agotado);
    }
  }
  return { insumos, stock, agotado };
}

/**
 * La foto que entra a una pila: el estado ANTES de la acción, qué acción fue y cómo
 * quedó lo vivo justo DESPUÉS (ver `conLoVivo`).
 */
function fotoDe(antes: Catalog, despues: Catalog, etiqueta?: string): Catalog {
  return { ...stripSnap(antes), etiqueta: etiqueta || undefined, vivoTras: vivoDe(despues) };
}

/** Devuelve el snapshot con lo TRANSACCIONAL de hoy re-inyectado (nunca se revierte). */
function conLoVivo(snap: Catalog, vivo: Catalog): Catalog {
  /* Las fotos se quitaron del snapshot para que no pesara siete veces; se devuelven
     desde lo vivo, por id. Deshacer no revierte una foto: la conserva. */
  const conFotos = <T extends { id: string; foto?: string }>(delSnap: T[] | undefined, delVivo: T[] | undefined): T[] => {
    const fotos = new Map((delVivo ?? []).map((x) => [x.id, x.foto]));
    return (delSnap ?? []).map((x) => (fotos.get(x.id) ? { ...x, foto: fotos.get(x.id) } : x));
  };
  /* LO QUE MUEVEN LOS PEDIDOS NO SE DESHACE. Antes la foto devolvía la despensa entera a
     como estaba ANTES de la acción: se cambiaba un precio, entraban tres pedidos, se
     deshacía el precio… y la papa de esos tres pedidos volvía a aparecer en el
     inventario, con los pedidos ahí. Ahora se aplica solo lo que la acción deshecha
     cambió (foto − justo después) sobre lo que hay AHORA. Una foto sin `vivoTras` (de
     antes de esto) conserva lo de ahora tal cual: es lo menos dañino. */
  const tras = snap.vivoTras;
  const insVivo = new Map((vivo.insumos ?? []).map((i) => [i.id, i]));
  const insumos = (snap.insumos ?? []).map((i) => {
    const v = insVivo.get(i.id);
    if (!v) return i;
    const t = tras?.insumos[i.id];
    return { ...i, stock: t === undefined ? v.stock : redondear3(v.stock + (i.stock - t)) };
  });
  const ingVivo = new Map(GRUPOS_ING.flatMap((g) => vivo[g] ?? []).map((x) => [x.id, x]));
  const conStockVivo = (xs: Ingrediente[] | undefined): Ingrediente[] =>
    (xs ?? []).map((x) => {
      const v = ingVivo.get(x.id);
      if (!v) return x;
      const out = { ...x };
      if (typeof x.stock === "number" && typeof v.stock === "number") {
        const t = tras?.stock[x.id];
        out.stock = t === undefined ? v.stock : redondear3(v.stock + (x.stock - t));
      }
      // El agotado de AHORA, salvo que la acción deshecha lo haya cambiado ella misma.
      const t = tras?.agotado[x.id];
      out.agotado = t !== undefined && Boolean(x.agotado) !== t ? x.agotado : v.agotado;
      return out;
    });
  const { etiqueta, vivoTras, ...resto } = snap;
  void etiqueta;
  void vivoTras;
  return {
    ...resto,
    pedidos: vivo.pedidos ?? [],
    movimientos: vivo.movimientos ?? [],
    leads: vivo.leads ?? [],
    // El índice del archivo tampoco se "deshace": los meses archivados existen.
    archivoMeses: vivo.archivoMeses ?? [],
    arqueos: vivo.arqueos ?? [],
    insumos,
    bases: conFotos(conStockVivo(snap.bases), vivo.bases),
    proteinas: conFotos(conStockVivo(snap.proteinas), vivo.proteinas),
    toppings: conFotos(conStockVivo(snap.toppings), vivo.toppings),
    enredos: conFotos(snap.enredos, vivo.enredos),
    ajustes: conImagenesAjustes(snap.ajustes, vivo.ajustes),
  };
}

/**
 * Quién está haciendo la acción, si hay una petición con sesión detrás.
 *
 * Se lee de forma perezosa y tolerante: los scripts de QA y las tareas de fondo
 * llaman a las mismas funciones sin contexto de petición, y ahí simplemente no hay
 * nombre. Sin esto, el historial decía "Canceló #A1B2" y no había a quién preguntarle.
 */
async function quien(): Promise<string> {
  try {
    const { usuarioSesion } = await import("./sesion");
    return (await usuarioSesion()) ?? "";
  } catch {
    return "";
  }
}

function nuevaEntrada(texto: string, meta = false, usuario = ""): HistItem {
  return {
    id: crypto.randomUUID().slice(0, 6),
    fecha: new Date().toISOString(),
    texto: usuario ? `${texto} · ${usuario}` : texto,
    meta,
  };
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
  /* LA DESPENSA SE FUSIONA POR DELTA, no por "gana el último".
     Si otra instancia vendió un plato mientras yo cambiaba un precio, tomar mi copia
     entera devolvía su descuento al inventario: el pedido quedaba registrado y la
     materia prima no. Aplicando MI cambio (mio - base) sobre lo que hay AHORA, los
     dos movimientos sobreviven. */
  const base = origen.get(mio);
  const insumos = base
    ? (mio.insumos ?? []).map((m) => {
        const b = base.insumos?.find((x) => x.id === m.id);
        const a = actual.insumos?.find((x) => x.id === m.id);
        if (!b || !a) return m; // insumo nuevo o borrado: manda mi versión
        const delta = m.stock - b.stock;
        return delta === 0 ? { ...m, stock: a.stock } : { ...m, stock: Math.max(0, Number((a.stock + delta).toFixed(3))) };
      })
    : mio.insumos;
  /* SOLO LO QUE YO CAMBIÉ. De mi copia viajan los pedidos NUEVOS y los que YO toqué;
     los que traigo igual que como los leí se dejan como estén AHORA.
     Son dos fallos en uno:
     · Un pedido que yo no toqué y que traigo con su valor viejo PISABA el cambio que
       otra instancia acababa de escribir. El cajero cobraba, entraba un pedido por
       QR en ese medio segundo, y el cobro desaparecía: el papel decía pagado y la
       caja seguía debiendo. Igual con cancelar, devolver y avanzar de estado.
     · Y al revés: un pedido que otra instancia sacó a propósito (lo archivó, o puso
       el negocio en cero) volvía por el mero hecho de venir en mi copia, así que el
       cerebro nunca bajaba del tope y los archivados reaparecían.
     Los dos desaparecen con la misma regla: mando sobre lo que cambié, y sobre nada
     más. Si yo cambié un pedido que el otro archivó, mi cambio manda y el archivo se
     pone al día en el siguiente lote. */
  const enBase = new Map((base?.pedidos ?? []).map((p) => [p.id, JSON.stringify(p)]));
  const misPedidos = (mio.pedidos ?? []).filter(
    (p) => !base || !enBase.has(p.id) || enBase.get(p.id) !== JSON.stringify(p),
  );
  /* El índice del archivo, con el mismo criterio: los meses que YO archivé se suman a
     lo que haya ahora. Con una unión a secas, un "Listo" de la cocina con una copia
     abierta resucitaba en el índice los meses que `ponerACero` acababa de borrar, y
     el archivo quedaba apuntando a documentos que ya no existen. */
  const misMeses = (mio.archivoMeses ?? []).filter((m) => !base || !(base.archivoMeses ?? []).includes(m));
  return {
    ...mio,
    insumos,
    pedidos: recientes(unir(actual.pedidos ?? [], misPedidos), (p) => p.creadoEn),
    movimientos: recientes(unir(actual.movimientos ?? [], mio.movimientos ?? []), (m) => m.fecha),
    leads: recientes(unir(actual.leads ?? [], mio.leads ?? []), (l) => l.creadoEn),
    /* LOS ARQUEOS TAMBIÉN. Era la única colección transaccional que quedaba fuera: con
       dos aparatos abiertos, el celular abría la caja a las 18:00 y otro cobraba medio
       segundo después con una copia anterior — el cobro se fusionaba bien y la apertura
       de caja desaparecía. Con el cierre es peor: un cierre firmado se podía borrar. */
    arqueos: recientes(unir(actual.arqueos ?? [], mio.arqueos ?? []), (a) => a.abiertoEn),
    archivoMeses: [...new Set([...(actual.archivoMeses ?? []), ...misMeses])].sort(),
  };
}

/**
 * Persiste `cat` como una acción: guarda un snapshot del estado ANTERIOR en la
 * pila de deshacer, limpia rehacer y agrega la entrada al historial.
 * Reemplaza a write() en todas las mutaciones del operador.
 *
 * `autoritativo` = mi documento manda tal cual, sin unir (lo usa el borrado
 * explícito de un movimiento: unir lo resucitaría).
 *
 * `transaccional` = la acción es algo que PASÓ (un pedido, un cobro, la caja, un gasto,
 * mercancía que entró): queda en el historial pero no ocupa la pila de deshacer ni
 * borra lo que había para rehacer. Antes cada pedido por QR, cada toque de la cocina y
 * cada cobro empujaba su foto: en pleno servicio el botón Deshacer revertía el último
 * paso de un pedido en vez del cambio de precio, y la foto del precio se caía de la
 * pila a los pocos minutos. Ahora Deshacer es "deshacer mi último cambio de carta o
 * de ajustes", que es lo que el dueño espera.
 */
async function commit(
  cat: Catalog,
  texto?: string,
  opciones?: { autoritativo?: boolean; sinDeshacer?: boolean; transaccional?: boolean },
): Promise<void> {
  return enFila(async () => {
    for (let intento = 0; intento < 3; intento++) {
      const actual = await readFresco(); // fija el etag para la escritura condicional
      const doc = opciones?.autoritativo ? { ...cat } : fusionar(actual, cat);
      // Con el documento ya fusionado y dentro del candado: aquí y solo aquí se
      // decide qué número de comprobante lleva cada pedido.
      asegurarConsecutivos(doc.pedidos ?? []);
      /* Y aquí, con el documento definitivo, se mudan al archivo los comprobantes
         que ya no caben. Si el archivo falla, el documento se queda entero. */
      await archivarYRecortar(doc);
      /* `sinDeshacer` es para el borrón y cuenta nueva. El resto del tiempo guardar
         la foto anterior es lo correcto, pero al poner el negocio en cero esa foto
         contiene justo lo que se quiso borrar: un "Deshacer" devolvería la despensa
         inventada. No hay nada que deshacer en el punto de partida. */
      if (opciones?.sinDeshacer) {
        doc.undo = [];
        doc.redo = [];
      } else if (opciones?.transaccional) {
        // Las pilas como están AHORA (las de mi copia pueden venir de hace dos segundos).
        doc.undo = actual.undo ?? [];
        doc.redo = actual.redo ?? [];
      } else {
        doc.undo = [...(actual.undo ?? []), fotoDe(actual, doc, texto)].slice(-UNDO_CAP);
        doc.redo = [];
      }
      if (texto) {
        const previo = opciones?.sinDeshacer ? [] : (actual.historial ?? []);
        doc.historial = [nuevaEntrada(texto, false, await quien()), ...previo].slice(0, HIST_CAP);
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
        if (esConflicto(e) && intento < 2) {
          etagActual = null;
          continue;
        }
        throw e;
      }
    }
  });
}

/** ¿El almacén rechazó la escritura porque otra instancia escribió primero? */
const esConflicto = (e: unknown): boolean =>
  (e as Error)?.name === "BlobPreconditionFailedError" ||
  /precondition|ifMatch|412/i.test((e as Error)?.message ?? "");

/** Deshace el último cambio de carta o ajustes (ver `commit`, opción `transaccional`). */
export async function deshacer(): Promise<Catalog> {
  return moverEnPila("deshacer");
}

/** Rehace el cambio deshecho. */
export async function rehacer(): Promise<Catalog> {
  return moverEnPila("rehacer");
}

/**
 * DESHACER Y REHACER, por la misma puerta que el resto de las escrituras.
 *
 * Antes leían con el memo (una copia de hasta dos segundos), fuera de la fila de
 * escritura y sin reintento: si otra instancia guardaba un pedido en ese instante, el
 * botón fallaba con un error técnico. Ahora leen fresco dentro de la fila y, si el
 * almacén dice que alguien escribió primero, lo vuelven a intentar sobre lo nuevo.
 * Nunca escriben "a la fuerza": deshacer no puede pisar un pedido que acaba de entrar,
 * así que si a la tercera sigue habiendo choque se le pide al operario repetirlo.
 */
async function moverEnPila(sentido: "deshacer" | "rehacer"): Promise<Catalog> {
  return enFila(async () => {
    for (let intento = 0; intento < 3; intento++) {
      const cat = await readFresco();
      const pila = (sentido === "deshacer" ? cat.undo : cat.redo) ?? [];
      if (!pila.length) return cat;
      const snap = pila[pila.length - 1];
      // Pedidos, caja, leads y lo que gastaron los pedidos sobreviven (ver conLoVivo).
      const restaurado = conLoVivo(snap, cat);
      // La foto contraria: lo de AHORA, para poder volver con el otro botón.
      const contraria = fotoDe(cat, restaurado, snap.etiqueta);
      if (sentido === "deshacer") {
        restaurado.undo = pila.slice(0, -1);
        restaurado.redo = [...(cat.redo ?? []), contraria].slice(-UNDO_CAP);
      } else {
        restaurado.redo = pila.slice(0, -1);
        restaurado.undo = [...(cat.undo ?? []), contraria].slice(-UNDO_CAP);
      }
      const que = snap.etiqueta ? `: ${snap.etiqueta}` : "";
      restaurado.historial = [
        nuevaEntrada(`${sentido === "deshacer" ? "↩︎ Deshizo" : "↪︎ Rehízo"}${que}`, true, await quien()),
        ...(cat.historial ?? []),
      ].slice(0, HIST_CAP);
      try {
        await write(restaurado);
        return restaurado;
      } catch (e) {
        if (esConflicto(e) && intento < 2) {
          etagActual = null;
          continue;
        }
        if (esConflicto(e)) {
          throw new Error("Justo ahora se estaba guardando otra cosa. Vuelve a tocar el botón.");
        }
        throw e;
      }
    }
    throw new Error("Justo ahora se estaba guardando otra cosa. Vuelve a tocar el botón.");
  });
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
  | "basesMax"
  | "cobroBases"
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
      // El armador, el juego y el QR cobran con estas dos: tienen que verlas.
      basesMax: basesMaxDe(a),
      cobroBases: cobroBasesDe(a),
    },
  };
}

/**
 * LOS NOMBRES DE LA PANTALLA DE ENTRADA. Se leen antes de que haya sesión, así que un
 * parpadeo del almacén no puede cerrar la puerta: si falla, el respaldo de siempre.
 */
export async function usuariosDelPanel(): Promise<string[]> {
  try {
    return usuariosDe((await read()).ajustes);
  } catch {
    return USUARIOS;
  }
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
  /* La CARTA vuelve de fábrica; la DESPENSA y los AJUSTES no. El botón dice
     "restaurar la carta" y antes se llevaba por delante el inventario contado a mano
     y la configuración del negocio (WhatsApp, horarios, domicilio, promos). */
  seed.insumos = vivo.insumos;
  seed.ajustes = vivo.ajustes;
  await commit(seed, "Restauró la carta de fábrica (pedidos, caja, despensa y ajustes intactos)");
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

/** Un renglón de la comanda: o un plato de carta (enredoId) o una caja armada. */
export interface LineaComanda {
  /** Plato de precio cerrado. Manda sobre lo que venga armado. */
  enredoId?: string;
  /** Una base (el campo de siempre). */
  baseId?: string;
  /** Una o dos bases (Ajustes → Cobro y servicio). Si viene, manda sobre `baseId`. */
  baseIds?: string[];
  proteinaIds?: string[];
  toppingIds?: string[];
  /** Cuántas porciones de ESTE renglón (1 por defecto). */
  cantidad?: number;
}

/** Lo que pide una mesa: N renglones, un solo pedido, un solo cobro. */
export interface NuevaComanda {
  lineas: LineaComanda[];
  /**
   * Conceptos que no son platos de la carta: "Limonada de coco", "Almuerzos". SOLO los
   * manda la caja (con sesión): `crearPedido`, el camino público, nunca los pasa.
   */
  adicionales?: AdicionalNuevo[];
  canal?: Pedido["canal"];
  tipo?: TipoServicio;
  cliente?: string;
  telefono?: string;
  direccion?: string;
  referencia?: string;
  notas?: string;
  idemKey?: string;
}

export interface NuevoPedido {
  /** Una base (el campo de siempre; los clientes viejos solo mandan este). */
  baseId?: string;
  /** Una o dos bases. Si viene, manda sobre `baseId`. */
  baseIds?: string[];
  /** Opcional: un plato sin proteína también se vende. */
  proteinaId?: string;
  proteinaId2?: string; // 2ª proteína (retro-compat con el flujo de 2)
  /** N proteínas, sin tope (0 vale). Si viene, manda sobre proteinaId/proteinaId2. */
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
  /** Dónde encontrar al cliente en el local, en palabras (no un número de mesa). */
  referencia?: string;
  /** Nota del cliente para la cocina: "sin cebolla", alergias. */
  notas?: string;
  /**
   * Clave de idempotencia generada por el cliente AL ARMAR la caja (no al enviar) y
   * reusada en los reintentos. Sin ella, un doble toque con red lenta creaba dos
   * pedidos y descontaba la despensa dos veces.
   */
  idemKey?: string;
}

/**
 * Número de comprobante PROVISIONAL. El definitivo lo pone `asegurarConsecutivos`
 * dentro del candado: aquí todavía no lo es.
 */
function siguienteConsecutivo(cat: Catalog): number {
  return (cat.pedidos ?? []).reduce((m, p) => Math.max(m, p.consecutivo ?? 0), 0) + 1;
}

/**
 * NUMERACIÓN ÚNICA, decidida dentro del candado.
 *
 * `crearPedido` lee el catálogo ANTES de entrar en la cola de escritura, así que dos
 * pedidos casi simultáneos leían el mismo estado y ambos se adjudicaban el mismo
 * consecutivo: dos clientes con el mismo número de comprobante, y una numeración con
 * saltos imposible de auditar. Aquí, ya con el documento fusionado y en exclusiva, se
 * reparan los repetidos y los que falten — en orden de creación, que es el que un
 * consecutivo debe respetar.
 *
 * Muta los objetos en su sitio a propósito: el pedido que se devolvió al cliente es el
 * MISMO objeto, así que la pantalla de confirmación y el comprobante ven el número bueno.
 */
function asegurarConsecutivos(pedidos: Pedido[]): void {
  const usados = new Set<number>();
  const porFecha = [...pedidos].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  let siguiente = 1;
  for (const p of porFecha) {
    const n = p.consecutivo;
    if (typeof n === "number" && n > 0 && !usados.has(n)) {
      usados.add(n);
      if (n >= siguiente) siguiente = n + 1;
      continue;
    }
    while (usados.has(siguiente)) siguiente++;
    p.consecutivo = siguiente;
    usados.add(siguiente);
    siguiente++;
  }
}

/** Índice de insumos por id (referencias vivas dentro del catálogo). */
const insumosPorId = (cat: Catalog): Map<string, Insumo> =>
  new Map(cat.insumos.map((i) => [i.id, i]));

/**
 * ¿Manda la despensa sobre lo que se puede vender?
 *
 * Cuando está apagado, la carta no se agota sola: se sigue descontando el inventario
 * (para que el día que se encienda los números tengan sentido) pero nada se bloquea.
 * Es lo que permite abrir el negocio antes de haber contado la despensa.
 */
export const controlaStock = (cat: Catalog): boolean => cat.ajustes.controlarStock !== false;

/**
 * Lo que gasta de un insumo UNA porción a factor `f` (1 = entera, 0.5 = la media de un
 * "mitad y mitad"), a 3 decimales, que es como se guarda la despensa. Es el MISMO número
 * al validar, al descontar y al devolver: si cada camino redondeara por su lado, cancelar
 * un plato de dos bases dejaría milésimas de más o de menos, pedido tras pedido.
 */
const enPorcion = (cantidad: number, f: number): number => Number((cantidad * f).toFixed(3));

/** Lo que una comanda pide de UN componente: unidades en porción entera y a media porción. */
type Pide = { enteras: number; medias: number };
/** Cuánto gasta de un insumo lo que se pide de un componente, sumado como lo descuenta la venta. */
const gastoDe = (cantidad: number, n: Pide): number =>
  Number((n.enteras * enPorcion(cantidad, 1) + n.medias * enPorcion(cantidad, 0.5)).toFixed(3));

/**
 * ¿Alcanza la despensa para preparar una porción ENTERA de este componente? Eso es lo que
 * significa "agotado", también con dos bases: con media porción en la despensa, la base
 * sale agotada hasta que se abastezca (se pierde menos de una porción, y la carta nunca
 * ofrece lo que no puede servir entero).
 */
function puedePreparar(ing: Ingrediente, byId: Map<string, Insumo>): boolean {
  // Stock suelto (sin receta): una porción entera es 1. Con "> 0", la media que deja un
  // "mitad y mitad" nunca agotaba el componente y las enteras fallaban al cobrar.
  if (!ing.receta || ing.receta.length === 0) return (ing.stock ?? 0) >= 1;
  return ing.receta.every((r) => {
    const ins = byId.get(r.insumoId);
    // FAIL-CLOSED: un insumo que la receta nombra y que ya no existe significa que no
    // sabemos si se puede preparar. Antes devolvía true ("no bloquea") y el sistema
    // vendía alegremente lo que no tenía con qué hacer.
    return ins ? ins.stock >= r.cantidad : false;
  });
}

/** ¿Alcanza para todo lo que la comanda pide de este componente, enteras y medias? */
function alcanzaPara(ing: Ingrediente, byId: Map<string, Insumo>, n: Pide): boolean {
  if (!ing.receta || ing.receta.length === 0) return (ing.stock ?? 0) >= n.enteras + n.medias / 2;
  return ing.receta.every((r) => {
    const ins = byId.get(r.insumoId);
    return ins ? ins.stock >= gastoDe(r.cantidad, n) : false;
  });
}

/** Máximos que la propia interfaz permite; el servidor no acepta más. Las PROTEÍNAS
 *  no tienen tope propio: se pueden llevar todas las de la carta (ver crearComanda). */
const MAX_TOPPINGS = 12;
/* Topes de cordura de una comanda. Una mesa larga cabe de sobra en 20 renglones y
   nadie pide 30 veces el mismo plato: por encima de eso es un error de tecleo o
   alguien probando el formulario, y el coste lo paga la despensa real. */
const MAX_LINEAS = 20;
const MAX_POR_LINEA = 30;
/** Un adicional de más de esto es, casi seguro, un cero de más. */
const MAX_PRECIO_ADICIONAL = 5_000_000;

/**
 * UN ADICIONAL, VALIDADO. Lo escribe alguien con prisa en el mostrador: el nombre se
 * limpia de espacios, el valor tiene que ser un número positivo y con tope, y la
 * cantidad tiene los mismos límites que un plato. El valor es el que paga el cliente
 * (con el impuesto dentro), igual que el resto de la carta.
 */
function itemAdicional(a: AdicionalNuevo, impuestoPct: number): ItemPedido {
  const nombre = String(a?.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!nombre) throw new Error("Al adicional le falta el concepto: ¿qué se está cobrando?");
  const precio = Math.round(Number(a?.precio));
  if (!Number.isFinite(precio) || precio <= 0) {
    throw new Error(`"${nombre}" necesita un valor mayor que cero.`);
  }
  if (precio > MAX_PRECIO_ADICIONAL) {
    throw new Error(`${formatCOP(precio)} para "${nombre}" parece un cero de más. Revísalo.`);
  }
  const cantidad = Math.max(1, Math.min(MAX_POR_LINEA, Math.round(Number(a?.cantidad ?? 1)) || 1));
  return {
    nombre,
    cantidad,
    precio: sinImpuesto(precio, impuestoPct),
    precioFinal: precio,
    adicional: true,
    cocina: a?.cocina ? true : undefined,
    componentes: [],
    costo: 0,
  };
}

/**
 * Un pedido de ANTES de "precio visto = precio pagado" que todavía no se cobra y al
 * que la caja le toca los renglones: se pasa al esquema nuevo para que su papel
 * imprima todo igual (cada renglón a precio de carta). La diferencia, si la hay, es
 * de un peso de redondeo; lo que ya se cobró no se toca nunca.
 */
function aPreciosFinales(p: Pedido, impuestoPct: number): void {
  if (!p.items?.length) p.items = lineasDe(p).map((l) => ({ ...l }));
  if (p.impuestoIncluido) return;
  const f = 1 + impuestoPct / 100;
  for (const l of p.items) {
    if (l.precioFinal === undefined) l.precioFinal = Math.round(l.precio * f);
  }
  p.descuentoFinal = Math.round((p.descuento ?? 0) * f);
  p.impuestoIncluido = true;
}

/** Rehace la cuenta de un pedido pendiente después de tocar sus renglones. */
function recalcularPendiente(p: Pedido, impuestoPct: number): void {
  const c = cuentaIncluida({
    bruto: brutoDe(p),
    impuestoPct,
    descuentoFinal: p.descuentoFinal ?? 0,
    domicilio: p.domicilio ?? 0,
  });
  p.bruto = c.bruto;
  p.subtotal = c.subtotal;
  p.descuento = c.descuento;
  p.descuentoFinal = c.descuentoFinal;
  p.impuesto = c.impuesto;
  p.impuestoPct = impuestoPct;
  p.total = totalDe(p);
}

/* ══════════════════════════════════════════════════════════════════════════
   EL ARCHIVO DE COMPROBANTES

   El cerebro guarda como mucho 2.000 pedidos. Antes era 200 a secas y el corte se
   hacía sin mirar el estado: el pedido 201 expulsaba al más viejo aunque estuviera
   SIN COBRAR. Luego se conservaron 2.000 y solo caían los CERRADOS — pero caían:
   el comprobante dejaba de existir, y a los dos meses el historial ya no tenía lo
   que el contador pide a fin de mes.

   Ahora lo que sale del cerebro SE MUDA a un documento por mes del mismo almacén
   (`comprobantes-YYYY-MM`), y el cerebro solo apunta qué meses existen
   (`archivoMeses`). Un comprobante no se pierde nunca; cambia de cajón.

   Reglas:
   · Por LOTES: al pasar de 2.300 se baja a 2.000. Una escritura al archivo cada
     varios cientos de pedidos, no una por pedido.
   · Solo salen los CERRADOS (pagados o cancelados), los más antiguos primero. Una
     deuda viva no se archiva nunca, tenga la edad que tenga.
   · Primero se ESCRIBE en el archivo, se RELEE para comprobar que llegó, y solo
     entonces se saca del cerebro. Si el archivo falla, el cerebro se queda entero y
     se reintenta en el siguiente commit. Perder un pedido por ahorrarse una lectura, no.
   · El archivo se une POR ID: repetir un archivado es inocuo, y la versión más
     nueva (la que viene del cerebro) manda sobre la que ya estaba.

   Sigue siendo un puente mientras el cerebro sea un documento único; el arreglo de
   fondo es sacar `pedidos` a su propia tabla en Supabase.
   ══════════════════════════════════════════════════════════════════════════ */
export const PEDIDOS_CAP = 2000;
const MARGEN_RECORTE = 300;
export interface ArchivoMes {
  mes: string;
  pedidos: Pedido[];
}
/** El mes de negocio ("YYYY-MM", hora de Pereira) de una fecha ISO. */
export const mesNegocio = (iso: string): string => diaNegocio(iso).slice(0, 7);
const claveMes = (mes: string) => `comprobantes-${mes}`;
const cerrado = (p: Pedido) => p.pago === "pagado" || p.estado === "cancelado";
const masNuevoPrimero = (a: Pedido, b: Pedido) => b.creadoEn.localeCompare(a.creadoEn);

/**
 * Separa lo que se queda en el cerebro de lo que se va al archivo. PURA: los vivos
 * se quedan siempre; del resto, los más nuevos hasta llenar el tope.
 */
export function recortarPedidos(lista: Pedido[], cap = PEDIDOS_CAP): { quedan: Pedido[]; salen: Pedido[] } {
  if (lista.length <= cap) return { quedan: lista, salen: [] };
  const porFecha = [...lista].sort(masNuevoPrimero);
  const vivos = porFecha.filter((p) => !cerrado(p));
  const cerrados = porFecha.filter(cerrado);
  const sitio = Math.max(0, cap - vivos.length);
  return {
    quedan: [...vivos, ...cerrados.slice(0, sitio)].sort(masNuevoPrimero),
    salen: cerrados.slice(sitio),
  };
}

/** Une pedidos por id (`nuevos` manda), más nuevo primero. */
const unirPedidos = (previos: Pedido[], nuevos: Pedido[]): Pedido[] =>
  unir(previos, nuevos).sort(masNuevoPrimero);

/** Escribe un lote en el documento de su mes y comprueba releyendo que llegó entero. */
async function archivarMes(mes: string, lote: Pedido[]): Promise<boolean> {
  const clave = claveMes(mes);
  for (let intento = 0; intento < 3; intento++) {
    try {
      const previo = (await leerDoc<ArchivoMes>(clave))?.pedidos ?? [];
      await escribirDoc<ArchivoMes>(clave, { mes, pedidos: unirPedidos(previo, lote) });
      const releido = new Set(((await leerDoc<ArchivoMes>(clave))?.pedidos ?? []).map((p) => p.id));
      if (lote.every((p) => releido.has(p.id))) return true;
    } catch (e) {
      const conflicto =
        (e as Error)?.name === "BlobPreconditionFailedError" ||
        /precondition|ifMatch|412/i.test((e as Error)?.message ?? "");
      if (!conflicto) {
        console.warn(`[papaghetti] no se pudo archivar ${mes}:`, (e as Error)?.message ?? e);
        return false;
      }
      etagsAux.delete(clave); // otra instancia escribió ese mes: se relee y se repite
    }
  }
  return false;
}

/**
 * Dentro del candado de commit y sobre el documento ya fusionado: si sobran
 * pedidos, los archiva por mes y deja en el cerebro solo los que caben. Si algún
 * mes no se pudo archivar, el cerebro se queda como estaba.
 */
async function archivarYRecortar(doc: Catalog): Promise<void> {
  const lista = doc.pedidos ?? [];
  if (lista.length <= PEDIDOS_CAP + MARGEN_RECORTE) return;
  const { quedan, salen } = recortarPedidos(lista);
  if (!salen.length) return;
  const porMes = new Map<string, Pedido[]>();
  for (const p of salen) {
    const m = mesNegocio(p.creadoEn);
    porMes.set(m, [...(porMes.get(m) ?? []), p]);
  }
  const meses = new Set(doc.archivoMeses ?? []);
  let todoBien = true;
  for (const [mes, lote] of porMes) {
    if (await archivarMes(mes, lote)) meses.add(mes);
    else todoBien = false;
  }
  doc.archivoMeses = [...meses].sort();
  if (todoBien) doc.pedidos = quedan;
}

/** Los meses que tienen comprobantes archivados, del más antiguo al más nuevo. */
export async function mesesArchivados(): Promise<string[]> {
  return [...((await read()).archivoMeses ?? [])].sort();
}

/** Los comprobantes archivados cuyo MES cae dentro del rango de días (inclusive). */
export async function pedidosArchivados(desdeDia?: string, hastaDia?: string): Promise<Pedido[]> {
  const meses = ((await read()).archivoMeses ?? []).filter(
    (m) => (!desdeDia || m >= desdeDia.slice(0, 7)) && (!hastaDia || m <= hastaDia.slice(0, 7)),
  );
  const docs = await Promise.all(meses.map((m) => leerDoc<ArchivoMes>(claveMes(m))));
  return docs.flatMap((d) => d?.pedidos ?? []);
}

/**
 * TODOS los comprobantes entre dos días de negocio (inclusive): los del cerebro y
 * los del archivo, sin repetidos (si uno está en los dos sitios, manda el del
 * cerebro, que es el más reciente).
 *
 * El archivo solo se toca si el rango puede alcanzarlo, y esa frontera la decide EL
 * ÍNDICE (`archivoMeses`), no lo que haya en el cerebro. Antes se comparaba contra
 * el cerrado más antiguo que seguía vivo, y eso se movía solo: bastaba cobrar una
 * deuda de hace tres meses —que nunca se archiva mientras está viva— para que la
 * frontera saltara hacia atrás y las vistas de los meses archivados de en medio
 * salieran vacías, como si esos comprobantes no existieran.
 */
export async function comprobantesEntre(desdeDia: string, hastaDia: string): Promise<Pedido[]> {
  const cat = await read();
  const enRango = (p: Pedido) => {
    const d = diaNegocio(p.creadoEn);
    return d >= desdeDia && d <= hastaDia;
  };
  const vivos = cat.pedidos.filter(enRango);
  const meses = cat.archivoMeses ?? [];
  if (!meses.length) return vivos.sort(masNuevoPrimero);
  // Nada archivado puede caer en el rango si el rango empieza después del último mes.
  const ultimoMes = [...meses].sort()[meses.length - 1];
  if (desdeDia.slice(0, 7) > ultimoMes) return vivos.sort(masNuevoPrimero);
  // `pedidosArchivados` ya lee solo los meses que tocan el rango.
  const archivados = (await pedidosArchivados(desdeDia, hastaDia)).filter(enRango);
  return unirPedidos(archivados, vivos);
}

/** Un pedido por id: primero el cerebro, luego el archivo del mes más nuevo al más viejo. */
export async function buscarPedido(id: string): Promise<Pedido | undefined> {
  const cat = await read();
  const vivo = cat.pedidos.find((p) => p.id === id);
  if (vivo) return vivo;
  for (const mes of [...(cat.archivoMeses ?? [])].sort().reverse()) {
    const p = (await leerDoc<ArchivoMes>(claveMes(mes)))?.pedidos.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

/**
 * Descuenta de la despensa los insumos de la receta de un componente: una porción entera
 * (`f = 1`) o media (`f = 0.5`, cada base de un "mitad y mitad").
 */
function consumirReceta(ing: Ingrediente, byId: Map<string, Insumo>, f = 1): void {
  for (const r of ing.receta ?? []) {
    const ins = byId.get(r.insumoId);
    if (ins) ins.stock = Math.max(0, Number((ins.stock - enPorcion(r.cantidad, f)).toFixed(3)));
  }
}

/**
 * Lo que ya no alcanza para una porción ENTERA sale de la carta al instante, se haya
 * vendido o no: si las dos bases de un plato gastaron el último aceite, la cebolla crispy
 * —que también lo lleva— tampoco se puede preparar, y la carta no puede seguir
 * ofreciéndola hasta que el cobro la rechace. Solo AGOTA: devolver algo a la carta es
 * cosa de `reactivarPreparables`.
 */
function agotarLoQueNoAlcanza(cat: Catalog, byId: Map<string, Insumo>, insumos: ReadonlySet<string>): void {
  for (const g of GRUPOS_ING) {
    for (const it of cat[g]) {
      if (it.agotado || !it.receta?.some((r) => insumos.has(r.insumoId))) continue;
      if (!puedePreparar(it, byId)) it.agotado = true;
    }
  }
}

/**
 * Las bases que trae un renglón armado: `baseIds` si viene con algo, si no el `baseId` de
 * siempre (los clientes viejos solo mandan ese). Lo que llega no tiene tipos —el QR es
 * público—, así que solo cuentan los textos no vacíos.
 */
function basesPedidas(l: LineaComanda): string[] {
  const crudas: unknown[] = Array.isArray(l.baseIds) && l.baseIds.length ? l.baseIds : [l.baseId];
  return crudas.filter((x): x is string => typeof x === "string" && x !== "");
}

/**
 * LAS BASES DE UN RENGLÓN, validadas contra lo GUARDADO (el tope sale de Ajustes, nunca
 * del cliente). Devuelve las de la carta en el ORDEN DE LA CARTA, no en el de los toques:
 * el mismo plato se llama igual lo pida quien lo pida.
 */
function resolverBases(cat: Catalog, ids: string[], max: 1 | 2): Ingrediente[] {
  if (!ids.length) throw new Error("Falta la base del enredo.");
  if (new Set(ids).size < ids.length) throw new Error("Elegiste la misma base dos veces.");
  if (ids.length > max) {
    throw new Error(max === 1 ? "Este plato lleva máximo una base." : "Este plato lleva máximo dos bases.");
  }
  for (const id of ids) {
    if (cat.bases.some((b) => b.id === id)) continue;
    /* La base se buscaba en los tres grupos, así que una proteína mandada como base
       entraba: se cobraba a su precio y salía para la cocina como si lo fuera. */
    const otro = [...cat.proteinas, ...cat.toppings].find((x) => x.id === id);
    throw new Error(
      otro
        ? `"${otro.nombre}" no es una base. Elige la base entre las de la carta.`
        : "Uno de los ingredientes ya no existe. Recarga la carta y vuelve a armarlo.",
    );
  }
  return basesElegidas(ids, cat.bases);
}

/**
 * UNA COMANDA: lo que pide una mesa, en un solo pedido.
 *
 * Antes un pedido era exactamente UN plato. Una mesa de cuatro eran cuatro pedidos,
 * cuatro comandas para la cocina, cuatro cobros y cuatro papeles — y si el mesero
 * escribía la referencia distinta ("mesa ventanal" vs "Mesa del ventanal"), ni
 * siquiera se podían cobrar juntos. Ahora una comanda lleva N renglones.
 *
 * `crearPedido` (el camino del QR y de la web, que usan los clientes) es EL CASO DE
 * UN RENGLÓN de esta misma función. Una sola verdad: si cambia la regla de precios o
 * de despensa, cambia aquí y se entera todo el negocio a la vez.
 *
 * ORDEN SAGRADO, igual que antes: resolver TODO → VALIDAR TODO → recién entonces
 * consumir. Con varios renglones importa más: si el tercer plato no alcanza, los dos
 * primeros no pueden haber descontado ya la despensa.
 *
 * DOS BASES POR PLATO (Ajustes → Cobro y servicio). En "mitad y mitad" el plato se cobra
 * a la base más cara y cada base gasta MEDIA porción (va a `mitades`); en "suma" se
 * cobran las dos y cada una gasta su porción entera (va a `componentes`, como siempre).
 * Con una sola base todo sale exactamente como antes.
 */
export async function crearComanda(input: NuevaComanda): Promise<Pedido> {
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

  const lineas = (input.lineas ?? []).slice(0, MAX_LINEAS);
  const adicionales = (input.adicionales ?? []).slice(0, MAX_LINEAS);
  if (!lineas.length && !adicionales.length) throw new Error("La comanda está vacía.");

  const buscar = (id: string): Ingrediente | undefined => {
    for (const grupo of ["bases", "proteinas", "toppings"] as const) {
      const it = cat[grupo].find((x) => x.id === id);
      if (it) return it;
    }
    return undefined;
  };

  const impuestoPct = cat.ajustes.impuestoPct ?? 0;
  /* DOS BASES: cuántas caben y cómo se cobran salen de lo GUARDADO, nunca de lo que
     mande el cliente (`enviarPedido` es pública). */
  const maxBases = basesMaxDe(cat.ajustes);
  const modoBases = cobroBasesDe(cat.ajustes);

  /* — 2. RESOLVER cada renglón. Todavía no se toca nada: solo se averigua qué es
         cada uno, cuánto vale una unidad y qué componentes consume. */
  type Resuelto = {
    item: ItemPedido;
    /** Ids que CADA unidad gasta en porción entera (vacío en los platos de cocina). */
    enteras: string[];
    /** Ids que CADA unidad gasta a MEDIA porción: las dos bases de un "mitad y mitad". */
    medias: string[];
    /** Lo resuelto, para el resumen de siempre (p.proteina / p.toppings). */
    prots: Ingrediente[];
    tops: Ingrediente[];
  };
  const resueltos: Resuelto[] = [];

  for (const l of lineas) {
    // `|| 1`: una cantidad que no es número (la caja manda los renglones en JSON) no
    // puede volverse NaN y colarse en la cuenta y en la despensa.
    const cantidad = Math.max(1, Math.min(MAX_POR_LINEA, Math.round(Number(l.cantidad ?? 1)) || 1));

    const insignia = l.enredoId ? cat.enredos.find((e) => e.id === l.enredoId) : undefined;
    if (l.enredoId && !insignia) throw new Error("Ese plato ya no está en la carta.");
    if (insignia && insignia.activo === false) {
      throw new Error(`Hoy no tenemos "${insignia.nombre}".`);
    }
    /* Un plato de la carta trae SU base y manda sobre lo armado. Con dos bases encima,
       la segunda ni se cocinaba ni se cobraba: se dice, en vez de tragársela. */
    const pedidas = basesPedidas(l);
    if (insignia && pedidas.length > 1) {
      throw new Error(`"${insignia.nombre}" ya trae su base. Para combinar dos bases, arma el plato por partes.`);
    }

    /* PLATO DE COCINA (ensaladas, a la carta, especiales): precio cerrado y SIN
       componentes. No se arma por partes, así que no hay nada que resolver ni que
       descontar — se cobra tal cual. Sin este camino, media carta sería invendible. */
    if (insignia && !insignia.baseId && !insignia.proteinaId) {
      resueltos.push({
        item: {
          nombre: insignia.nombre,
          detalle: insignia.gancho || undefined,
          cantidad,
          precio: sinImpuesto(insignia.precio, impuestoPct),
          precioFinal: insignia.precio,
          componentes: [],
          enredoId: insignia.id,
          costo: 0,
        },
        enteras: [],
        medias: [],
        prots: [],
        tops: [],
      });
      continue;
    }

    /* PROTEÍNAS: CERO, UNA O TODAS. El dueño lo pidió así: varias sin límite, y un
       plato sin proteína también se vende. Antes el servidor cortaba en 4 sin avisar
       (EMPLATA dejaba elegir 5 y cobraba 4) y rechazaba la caja sin proteína. Cada
       una va UNA vez —en todas las pantallas el botón prende y apaga, no suma—, así
       que el techo natural es la carta misma, y un envío hostil con mil ids no pasa
       de ahí. */
    const protIdsCrudos = insignia
      ? [insignia.proteinaId]
      : Array.isArray(l.proteinaIds)
        ? l.proteinaIds
        : [];
    const protIds = [...new Set(protIdsCrudos.filter(Boolean))].slice(0, cat.proteinas.length);
    /* Los toppings NO se deduplican (pedir doble aguacate es legítimo y se cobra
       doble), pero sí se topan: sin límite, un pedido con 5.000 toppings vaciaba la
       despensa real. */
    const topIdsCrudos = insignia ? insignia.toppingIds : l.toppingIds;
    const topIds = (Array.isArray(topIdsCrudos) ? topIdsCrudos : []).slice(0, MAX_TOPPINGS);

    /* Fallos distintos que el operario vive distinto: "no elegiste base" es un
       formulario a medio llenar, "la base ya no existe" es que el catálogo cambió
       debajo mientras armaba, y el resto (dos veces la misma, más de las que permite
       Ajustes, algo que no es una base) es un envío que la pantalla no debió dejar
       salir. El mensaje tiene que decir cuál de todos es. */
    const bases = resolverBases(cat, insignia ? (insignia.baseId ? [insignia.baseId] : []) : pedidas, maxBases);
    // Dos bases en "mitad y mitad": cada una a media porción. En "suma", enteras.
    const mitad = bases.length > 1 && modoBases === "mitad";
    const fBase = mitad ? 0.5 : 1;
    const prots: Ingrediente[] = [];
    const tops: Ingrediente[] = [];
    for (const id of protIds) {
      const ing = buscar(id);
      if (!ing) throw new Error("Uno de los ingredientes ya no existe. Recarga la carta y vuelve a armarlo.");
      prots.push(ing);
    }
    for (const id of topIds) {
      const ing = buscar(id);
      if (!ing) throw new Error("Uno de los ingredientes ya no existe. Recarga la carta y vuelve a armarlo.");
      tops.push(ing);
    }

    /* El precio: un insignia CON componentes tiene precio de carta cerrado; un armado
       a mano vale lo que suman sus piezas. Las dos cifras son precio de carta, con el
       impuesto dentro. Las SALSAS valen $0: fuera del conteo de lo que se cobra. */
    const cobrables = tops.filter((t) => t.categoria !== "salsa");
    const armado =
      // Una base: su precio. Dos: la más cara ("mitad") o las dos ("suma"). La MISMA
      // función que usan las pantallas: no pueden decir un precio y cobrar otro.
      precioBases(bases, modoBases) +
      prots.reduce((s, p) => s + p.precio, 0) + // todas las proteínas a precio completo
      /* MISMA función que usa el cliente (lib/precios.ts). Hoy TOPPINGS_INCLUIDOS es
         0, o sea que suma todos; sigue pasando por aquí para que, si alguna vez hay
         promo, el total de la pantalla no pueda separarse del que se cobra. */
      cobroToppings(cobrables, TOPPINGS_INCLUIDOS);
    const precioFinal = insignia ? insignia.precio : armado;

    const idsBases = bases.map((b) => b.id);
    const enteras = [...(mitad ? [] : idsBases), ...protIds, ...topIds];
    const medias = mitad ? idsBases : [];
    resueltos.push({
      item: {
        /* Con dos, "Spaghetti / Papa criolla" y el modo AL FRENTE del detalle, que es lo
           primero que la cocina tiene que saber. Nada de " · " en el nombre (Mesas une
           los platos con ese separador) ni de "½" (el tiquete de texto lo borra). */
        nombre: insignia ? insignia.nombre : nombreBases(bases),
        detalle: insignia
          ? insignia.gancho || undefined
          : [
              bases.length > 1 ? modoBasesTexto(modoBases) : "",
              prots.length ? `con ${prots.map((p) => p.nombre).join(" + ")}` : "",
              tops.length ? `+ ${tops.map((t) => t.nombre).join(", ")}` : "",
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
        cantidad,
        precio: sinImpuesto(precioFinal, impuestoPct),
        precioFinal,
        componentes: enteras,
        ...(medias.length ? { mitades: medias } : {}),
        enredoId: insignia?.id,
        // Media receta de cada base en "mitad": cuesta lo que de verdad gasta.
        costo: Math.round(
          bases.reduce((s, b) => s + costoReceta(b.receta, byId) * fBase, 0) +
            prots.reduce((s, p) => s + costoReceta(p.receta, byId), 0) +
            tops.reduce((s, t) => s + costoReceta(t.receta, byId), 0),
        ),
      },
      enteras,
      medias,
      prots,
      tops,
    });
  }

  /* — 2b. LOS ADICIONALES: conceptos que no son platos. No consumen despensa ni se
         validan contra la carta; solo se revisa que tengan nombre y valor de verdad. */
  for (const a of adicionales) {
    resueltos.push({ item: itemAdicional(a, impuestoPct), enteras: [], medias: [], prots: [], tops: [] });
  }

  /* — 3. DISPONIBILIDAD, sumando TODA la comanda. Aquí está la diferencia con el
         pedido de un plato: dos renglones que llevan aguacate piden dos aguacates, y
         hay que saberlo ANTES de descontar el primero. Si no, la mesa se quedaba a
         medias con la despensa ya tocada. Las medias porciones cuentan como medias:
         dos "mitad y mitad" con la misma base piden UNA porción de ella, no dos. */
  const pide = new Map<string, Pide>();
  const sumar = (id: string, campo: keyof Pide, n: number) => {
    const x = pide.get(id) ?? { enteras: 0, medias: 0 };
    x[campo] += n;
    pide.set(id, x);
  };
  for (const r of resueltos) {
    for (const id of r.enteras) sumar(id, "enteras", r.item.cantidad);
    for (const id of r.medias) sumar(id, "medias", r.item.cantidad);
  }
  for (const id of pide.keys()) {
    const ing = buscar(id)!;
    /* Lo que se decidió A MANO bloquea SIEMPRE, se controle la despensa o no: sacar
       algo de la carta, o marcar "se acabó el pollo", es la acción más frecuente de
       un servicio y no puede depender de un ajuste. Lo único que el interruptor
       desactiva es la ARITMÉTICA de la despensa. */
    if (ing.activo === false) throw new Error(`"${ing.nombre}" ya no está en la carta.`);
    if (ing.agotado) throw new Error(`Se nos acabó "${ing.nombre}". Quítalo y vuelve a intentar.`);
  }
  const controla = controlaStock(cat);
  if (controla) {
    // Cada componente con lo suyo: el mensaje nombra lo que hay que quitar.
    for (const [id, n] of pide) {
      const ing = buscar(id)!;
      if (alcanzaPara(ing, byId, n)) continue;
      const veces = n.enteras + n.medias / 2;
      // Nada de "para 1.5 de…": nadie pide porciones con decimales.
      throw new Error(
        veces <= 1
          ? `Se nos acabó "${ing.nombre}". Quítalo y vuelve a intentar.`
          : Number.isInteger(veces)
            ? `No nos alcanza para ${veces} de "${ing.nombre}".`
            : `No nos alcanza "${ing.nombre}" para toda la comanda.`,
      );
    }
    /* Y cada INSUMO, sumando todo lo que lo usa. Las dos bases de un plato comparten el
       aceite: mirando componente por componente cada una cabía sola, la comanda pasaba
       y la segunda se descontaba de un aceite que ya no estaba. */
    const total = new Map<string, number>();
    for (const [id, n] of pide) {
      for (const r of buscar(id)!.receta ?? []) {
        total.set(r.insumoId, (total.get(r.insumoId) ?? 0) + gastoDe(r.cantidad, n));
      }
    }
    for (const [insumoId, cuanto] of total) {
      const ins = byId.get(insumoId);
      if (!ins || ins.stock < Number(cuanto.toFixed(3))) {
        throw new Error(`No nos alcanza "${ins?.nombre ?? insumoId}" para toda la comanda.`);
      }
    }
  }

  /* — 4. Servicio. El default NO puede ser el que cobra: si nadie dice el tipo, un
         pedido con referencia es de mesa y el resto es para llevar. Antes caía en
         "domicilio" y le sumaba $5.000 a alguien que estaba sentado en el local. */
  const tipo = input.tipo ?? (input.referencia ? "mesa" : "llevar");
  const direccion = input.direccion?.trim().slice(0, 140) || undefined;
  if (tipo === "domicilio" && !direccion) {
    throw new Error("Necesitamos la dirección de entrega para llevártelo.");
  }

  // — 5. Precio de la comanda, y el mínimo a domicilio ANTES de tocar la despensa.
  //       Precio visto = precio pagado: se suma la carta y DESPUÉS se separa el impuesto.
  const bruto = resueltos.reduce((s, r) => s + (r.item.precioFinal ?? 0) * r.item.cantidad, 0);
  const domicilio = tipo === "domicilio" ? cat.ajustes.costoDomicilio ?? 0 : 0;
  const cuenta = cuentaIncluida({ bruto, impuestoPct, domicilio });
  const falta = faltaParaMinimo(bruto, tipo, cat.ajustes.pedidoMinimo);
  if (falta > 0) {
    throw new Error(
      `El pedido mínimo a domicilio es ${formatCOP(cat.ajustes.pedidoMinimo)}. Te faltan ${formatCOP(falta)}.`,
    );
  }

  // — 6. Ya validado TODO: ahora sí se consume la despensa, unidad por unidad.
  const tocados = new Set<string>(); // los insumos que se movieron
  const consumir = (id: string, f: number) => {
    const it = buscar(id)!;
    if (it.receta && it.receta.length > 0) {
      consumirReceta(it, byId, f); // ← descuenta despensa real
      for (const r of it.receta) tocados.add(r.insumoId);
    } else if (typeof it.stock === "number") {
      it.stock = Math.max(0, Number((it.stock - f).toFixed(3))); // legado: unidades abstractas
      if (controla) it.agotado = !puedePreparar(it, byId);
    }
  };
  /* Las mismas listas que se guardan, una entrada por unidad vendida: son lo que cancelar
     y devolver ponen de vuelta en la despensa, ni más ni menos. */
  const componentes: string[] = [];
  const mitades: string[] = [];
  for (const r of resueltos) {
    for (let n = 0; n < r.item.cantidad; n++) {
      for (const id of r.enteras) {
        consumir(id, 1);
        componentes.push(id);
      }
      for (const id of r.medias) {
        consumir(id, 0.5);
        mitades.push(id);
      }
    }
  }
  // Solo se auto-agota si la despensa manda; si no, el inventario baja y ya.
  if (controla) agotarLoQueNoAlcanza(cat, byId, tocados);

  const items = resueltos.map((r) => r.item);
  const costo = Math.round(items.reduce((s, i) => s + (i.costo ?? 0) * i.cantidad, 0));

  /* El RESUMEN de siempre (base/proteina/toppings). No es decorativo: hay pedidos
     guardados desde antes de que existieran los renglones, y hay pantallas y textos
     de WhatsApp que leen estos campos. Con un solo renglón dicen exactamente lo de
     antes; con varios, dicen cuántos platos van. */
  const unoR = resueltos.length === 1 && resueltos[0].item.cantidad === 1 ? resueltos[0] : null;
  const uno = unoR?.item ?? null;
  const platos = items.filter((i) => !i.adicional).reduce((s, i) => s + i.cantidad, 0);
  /* Una cuenta hecha SOLO de adicionales que no se cocinan ("Almuerzos $50.000") no
     tiene nada que hacer en la pantalla de cocina: entra ya entregada y espera el cobro.
     Si no, el cocinero veía una tarjeta vacía que tenía que "avanzar" tres veces. */
  const nadaQueCocinar = items.every((i) => i.adicional && !i.cocina);
  const ahora = new Date().toISOString();

  const pedido: Pedido = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    consecutivo: siguienteConsecutivo(cat),
    creadoEn: ahora,
    canal: input.canal ?? "web",
    tipo,
    mesa: undefined,
    /* TODO lo que escribe el cliente va recortado. `referencia` y `notas` ya lo
       estaban; el nombre, el teléfono y la dirección no, y `enviarPedido` es pública
       (sin sesión). Un nombre de 900 KB entraba entero al cerebro, se quedaba ahí
       para siempre —ahora también en el archivo— y salía en el CSV del contador. */
    referencia: input.referencia?.trim().slice(0, 60) || undefined,
    cliente: input.cliente?.trim().slice(0, 60) || undefined,
    telefono: input.telefono?.trim().slice(0, 20) || undefined,
    direccion,
    notas: input.notas?.trim().slice(0, 200) || undefined,
    estado: nadaQueCocinar ? "entregado" : "recibido",
    entregadoEn: nadaQueCocinar ? ahora : undefined,
    pago: "pendiente",
    items,
    base: uno ? uno.nombre : platos ? `${platos} platos` : items.map((i) => i.nombre).join(", ").slice(0, 60),
    /* De lo resuelto, no releyendo el detalle con una expresión regular: con varias
       proteínas la de los acompañantes se tragaba media frase ("Pollo · + Parmesano"),
       y con dos bases el detalle ya no empieza por "con". */
    proteina: unoR?.prots.length ? unoR.prots.map((p) => p.nombre).join(" + ") : "—",
    toppings: unoR ? unoR.tops.map((t) => t.nombre) : [],
    componentes,
    ...(mitades.length ? { mitades } : {}),
    subtotal: cuenta.subtotal,
    impuesto: cuenta.impuesto,
    impuestoPct,
    impuestoIncluido: true,
    bruto: cuenta.bruto,
    descuentoFinal: 0,
    domicilio,
    propina: 0,
    descuento: 0,
    total: cuenta.total,
    costo,
    enredoId: uno?.enredoId,
    idemKey,
  };

  // El recorte (y el archivado) lo hace commit(), sobre el documento ya fusionado.
  cat.pedidos = [pedido, ...cat.pedidos];
  await commit(
    cat,
    `Nuevo pedido #${pedido.id}${platos > 1 ? ` · ${platos} platos` : ""} (${formatCOP(pedido.total)})`,
    { transaccional: true },
  );
  return pedido;
}

/**
 * Crea un pedido de UN plato. Es la firma que usan el QR, la web y el juego desde
 * siempre; por dentro es una comanda de un renglón, para que no haya dos motores de
 * precios ni dos formas de descontar la despensa.
 *
 * Es la ÚNICA función pública que muta el cerebro sin pedir sesión (a propósito: la
 * usan los clientes). Por eso valida como si el que llama fuera hostil.
 */
export async function crearPedido(input: NuevoPedido): Promise<Pedido> {
  const proteinaIds =
    input.proteinaIds && input.proteinaIds.length
      ? input.proteinaIds
      : ([input.proteinaId, input.proteinaId2].filter(Boolean) as string[]);
  return crearComanda({
    lineas: [
      {
        enredoId: input.enredoId,
        baseId: input.baseId,
        /* Sin esta línea la segunda base del QR y de la web se perdía aquí, en silencio:
           el renglón se rearmaba solo con `baseId`. Se pasa tal cual llega; quien la
           valida es crearComanda (cuántas, cuáles, que sean bases de verdad). */
        baseIds: input.baseIds,
        proteinaIds,
        toppingIds: input.toppingIds,
        cantidad: 1,
      },
    ],
    canal: input.canal,
    tipo: input.tipo,
    cliente: input.cliente,
    telefono: input.telefono,
    direccion: input.direccion,
    referencia: input.referencia,
    notas: input.notas,
    idemKey: input.idemKey,
  });
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
  sellarEstado(p);
  await commit(cat, `Avanzó #${id} a ${p.estado}`, { transaccional: true });
  return cat.pedidos;
}

/**
 * La hora de cada paso, escrita al pasar por él. Solo la PRIMERA vez: si la cocina se
 * pasa de paso y retrocede, el sello original es el bueno — lo que interesa medir es
 * cuándo salió el plato, no cuántas veces se tocó el botón.
 */
function sellarEstado(p: Pedido): void {
  const ahora = new Date().toISOString();
  if (p.estado === "cocina" && !p.cocinaEn) p.cocinaEn = ahora;
  if (p.estado === "listo" && !p.listoEn) p.listoEn = ahora;
  if (p.estado === "entregado" && !p.entregadoEn) p.entregadoEn = ahora;
}

/** Retrocede un pedido un paso (el KDS necesita corregir un toque de más). */
export async function retrocederPedido(id: string): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  if (p.estado === "cancelado") throw new Error("Ese pedido está cancelado.");
  const i = ESTADOS.indexOf(p.estado);
  if (i > 0) p.estado = ESTADOS[i - 1];
  await commit(cat, `Devolvió #${id} a ${p.estado}`, { transaccional: true });
  return cat;
}

/** Marca un pedido como pagado con su método, propina y descuento. */
export async function cobrarPedido(
  id: string,
  metodo: MetodoPago,
  propina = 0,
  descuento = 0,
  /** Rehace un cobro ya hecho: método, propina o descuento mal tecleados. */
  corregir = false,
  /** Por qué se rebajó, obligatorio si hay descuento. */
  motivoDescuento?: string,
): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  // Cobrar dos veces pisaba propina, descuento y método: la propina del mesero
  // desaparecía y el arqueo por método dejaba de cuadrar con el datáfono.
  if (p.pago === "pagado" && !corregir) {
    throw new Error(`El pedido #${id} ya estaba cobrado. Usa "Corregir cobro" si te equivocaste.`);
  }
  if (p.estado === "cancelado") throw new Error("No se puede cobrar un pedido cancelado.");
  const pct = cat.ajustes.impuestoPct ?? 0;
  /* EL DESCUENTO SE TECLEA EN LO QUE DEJA DE PAGAR EL CLIENTE. En un pedido de precios
     finales, "3.000 de descuento" son 3.000 menos en el total; en uno de antes se
     aplicaba sobre la base sin impuesto, y así se respeta al corregirlo. */
  const tope = p.impuestoIncluido ? (p.bruto ?? brutoDe(p)) : p.subtotal;
  const desc = Math.max(0, Math.min(tope, Math.round(descuento)));
  /* UN DESCUENTO SIN MOTIVO NO ENTRA. Era la única salida de dinero del sistema que no
     dejaba una palabra escrita: anular pide motivo, devolver pide motivo, y regalar el
     plato entero con un descuento del 100% no pedía nada. */
  const motivo = motivoDescuento?.trim().slice(0, 60);
  if (desc > 0 && !motivo) {
    throw new Error("Un descuento necesita motivo: elige por qué se rebaja.");
  }
  p.pago = "pagado";
  p.metodoPago = metodo;
  /* LA HORA DEL COBRO, que no es la de creación. Es lo que le faltaba al arqueo para
     cuadrar cuando se cobra en efectivo una deuda de otro día. Al corregir un cobro NO
     se mueve: el dinero entró cuando entró, no cuando se arregló el tecleo. */
  if (!p.pagadoEn) p.pagadoEn = new Date().toISOString();
  p.cobradoPor = (await quien()) || p.cobradoPor;
  // Topes de cordura: un cero de más en la propina era irreversible, y un descuento
  // mayor que el plato dejaba totales imposibles.
  p.propina = Math.max(0, Math.min(500_000, Math.round(propina)));
  p.motivoDescuento = desc > 0 ? motivo : undefined;
  if (p.impuestoIncluido) {
    /* Se resta el descuento a lo que vio el cliente y DESPUÉS se separa el impuesto:
       el total cuadra al peso con la carta y la base gravable baja con la rebaja. */
    const c = cuentaIncluida({ bruto: tope, impuestoPct: pct, descuentoFinal: desc, domicilio: p.domicilio ?? 0 });
    p.bruto = c.bruto;
    p.subtotal = c.subtotal;
    p.descuento = c.descuento;
    p.descuentoFinal = c.descuentoFinal;
    p.impuesto = c.impuesto;
  } else {
    /* El descuento BAJA LA BASE GRAVABLE. Antes se restaba después del impuesto, así
       que una cortesía total dejaba el impoconsumo entero cobrándose sobre plata que
       nadie facturó, y era imposible dejar un pedido en $0. */
    p.descuento = desc;
    p.impuesto = Math.round(((p.subtotal - p.descuento) * pct) / 100);
  }
  /* La TARIFA se congela con el monto. Sin esto, el día que alguien mueva el porcentaje
     en Ajustes, cada reimpresión de un comprobante archivado diría un porcentaje que no
     corresponde a su monto. */
  p.impuestoPct = pct;
  p.total = totalDe(p); // ← con el domicilio incluido. Ver lib/precios.ts
  await commit(
    cat,
    `${corregir ? "Corrigió el cobro de" : "Cobró"} #${id} (${metodo} · ${formatCOP(p.total)})` +
      (desc > 0 ? ` · descuento ${formatCOP(desc)}: ${motivo}` : ""),
    { transaccional: true },
  );
  return cat;
}

/**
 * AGREGAR UN ADICIONAL A UNA CUENTA ABIERTA.
 *
 * Lo normal es que lo extra aparezca al final: la mesa ya pidió por QR y a la hora de
 * pagar suma "dos limonadas de coco", o el grupo trae "$50.000 de almuerzos" que se
 * cobran aparte. Antes no había dónde ponerlo y se cobraba por fuera del sistema, que
 * es como se descuadra una caja. Solo en cuentas que no se han cobrado.
 */
export async function agregarAdicional(id: string, a: AdicionalNuevo): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  if (p.estado === "cancelado") throw new Error("Ese pedido está cancelado.");
  if (p.pago !== "pendiente") {
    throw new Error(`El pedido #${id} ya se cobró: lo que falte va en una comanda nueva.`);
  }
  const pct = cat.ajustes.impuestoPct ?? 0;
  const it = itemAdicional(a, pct);
  aPreciosFinales(p, pct);
  const lineas = p.items!;
  if (lineas.length >= MAX_LINEAS * 2) throw new Error("Esta cuenta ya tiene demasiados renglones.");
  /* El mismo concepto al mismo precio SUMA cantidad: tres toques en "Limonada de coco"
     son "3× Limonada de coco", no tres renglones iguales en el papel. */
  const igual = lineas.find(
    (l) =>
      l.adicional &&
      l.nombre.toLowerCase() === it.nombre.toLowerCase() &&
      (l.precioFinal ?? l.precio) === it.precioFinal &&
      Boolean(l.cocina) === Boolean(it.cocina),
  );
  if (igual) igual.cantidad = Math.min(MAX_POR_LINEA, igual.cantidad + it.cantidad);
  else lineas.push(it);
  recalcularPendiente(p, pct);
  await commit(
    cat,
    `Agregó ${it.cantidad > 1 ? `${it.cantidad}× ` : ""}"${it.nombre}" (${formatCOP((it.precioFinal ?? 0) * it.cantidad)}) a #${id}`,
    { transaccional: true },
  );
  return cat;
}

/**
 * QUITAR UN ADICIONAL de una cuenta abierta. Solo adicionales: un plato que ya entró a
 * cocina se saca cancelando, que es lo que deja el motivo escrito y devuelve despensa.
 * Se identifica por posición Y nombre: la caja se repinta cada 10 s, y si entretanto
 * cambió la cuenta, la posición sola podía borrar el renglón equivocado.
 */
export async function quitarAdicional(id: string, indice: number, nombre: string): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  if (p.estado === "cancelado" || p.pago !== "pendiente") {
    throw new Error("Solo se quitan adicionales de una cuenta que no se ha cobrado.");
  }
  const lineas = p.items ?? [];
  let i = lineas[indice]?.adicional && lineas[indice].nombre === nombre ? indice : -1;
  if (i < 0) i = lineas.findIndex((l) => l.adicional && l.nombre === nombre);
  if (i < 0) throw new Error(`"${nombre}" ya no está en la cuenta.`);
  if (lineas.length === 1) {
    throw new Error("Es lo único que tiene la cuenta: si no va, cancela el pedido.");
  }
  const [fuera] = lineas.splice(i, 1);
  const pct = cat.ajustes.impuestoPct ?? 0;
  aPreciosFinales(p, pct);
  recalcularPendiente(p, pct);
  await commit(cat, `Quitó "${fuera.nombre}" de #${id}`, { transaccional: true });
  return cat;
}

/**
 * LOS ADICIONALES DE UN TOQUE, configurados en Precios. Viven en `ajustes`: los edita
 * una sola persona y la fusión de escrituras los trata como el resto de la carta.
 */
export async function guardarAdicionalConfig(input: {
  id?: string;
  nombre: string;
  precio: number;
  cocina?: boolean;
  activo?: boolean;
}): Promise<Catalog> {
  const cat = await read();
  const it = itemAdicional({ nombre: input.nombre, precio: input.precio }, 0);
  const lista = (cat.ajustes.adicionales ??= []);
  const existente = input.id ? lista.find((a) => a.id === input.id) : undefined;
  if (input.id && !existente) throw new Error("Ese adicional ya no existe. Recarga la página.");
  const repetido = lista.find(
    (a) => a.id !== existente?.id && a.nombre.toLowerCase() === it.nombre.toLowerCase(),
  );
  if (repetido) throw new Error(`Ya existe "${repetido.nombre}". Edita ese en vez de crear otro.`);
  const precio = it.precioFinal ?? 0;
  if (existente) {
    existente.nombre = it.nombre;
    existente.precio = precio;
    existente.cocina = input.cocina ? true : undefined;
    existente.activo = input.activo === false ? false : undefined;
  } else {
    if (lista.length >= 60) throw new Error("Ya hay 60 adicionales: borra los que no uses.");
    const nuevo: AdicionalConfig = {
      id: `ad-${slugify(it.nombre).slice(0, 30)}-${Date.now().toString(36)}`,
      nombre: it.nombre,
      precio,
      cocina: input.cocina ? true : undefined,
    };
    lista.push(nuevo);
  }
  await commit(
    cat,
    `${existente ? "Editó" : "Creó"} el adicional "${it.nombre}" (${formatCOP(precio)})`,
  );
  return cat;
}

export async function borrarAdicionalConfig(id: string): Promise<Catalog> {
  const cat = await read();
  const lista = cat.ajustes.adicionales ?? [];
  const a = lista.find((x) => x.id === id);
  if (!a) throw new Error("Ese adicional ya no existe.");
  cat.ajustes.adicionales = lista.filter((x) => x.id !== id);
  await commit(cat, `Borró el adicional "${a.nombre}"`);
  return cat;
}

/**
 * LO QUE GASTÓ UN PEDIDO QUE NUNCA SE COCINÓ, DE VUELTA A LA DESPENSA. Una sola función
 * para cancelar y para devolver: cada porción entera de `componentes` y cada media de
 * `mitades`, con el MISMO redondeo con que la venta las descontó. Antes cada una tenía
 * su copia y las dos devolvían una receta ENTERA por id: con las medias porciones de un
 * "mitad y mitad", cancelar habría fabricado despensa que nunca existió.
 *
 * Y vuelve a la carta solo lo que esta despensa devuelta deja preparar. Devolver
 * des-agotaba a ciegas todo lo del pedido, también el "se acabó" que alguien marcó a mano.
 */
function devolverDespensa(cat: Catalog, p: Pedido): void {
  const byId = insumosPorId(cat);
  const controla = controlaStock(cat);
  const tocados = new Set<string>();
  const mover = (id: string, f: number) => {
    const it = findIn(cat, id);
    if (!it) return; // se borró de la carta después: no hay a qué devolverle
    if (it.receta?.length) {
      for (const r of it.receta) {
        const ins = byId.get(r.insumoId);
        if (!ins) continue;
        ins.stock = Number((ins.stock + enPorcion(r.cantidad, f)).toFixed(3));
        tocados.add(ins.id);
      }
    } else if (typeof it.stock === "number") {
      it.stock = Number((it.stock + f).toFixed(3));
      if (controla && it.agotado && puedePreparar(it, byId)) it.agotado = false;
    }
  };
  for (const id of p.componentes ?? []) mover(id, 1);
  for (const id of p.mitades ?? []) mover(id, 0.5);
  if (tocados.size) reactivarPreparables(cat, tocados);
}

/**
 * DEVOLVER EL DINERO DE UN PEDIDO YA COBRADO. La salida que no existía.
 *
 * `cancelarPedido` se niega a tocar un pedido pagado —y hace bien: borrarlo sin más
 * dejaría el efectivo en la caja sin rastro— pero remitía a "registrar la devolución
 * del dinero", una función que no estaba escrita. El operario se quedaba encerrado:
 * plato mal salido, cobro duplicado o cliente que se arrepiente después de pagar, y
 * ninguna forma de deshacerlo. Se acababa arreglando por fuera del sistema, que es
 * como se pierde el cuadre.
 *
 * Qué hace exactamente:
 *  · deja constancia de CUÁNTO salió, POR QUÉ y CUÁNDO (la fecha es propia: devolver
 *    al día siguiente descuadra la caja de hoy, y hay que poder explicarlo);
 *  · marca el pedido como cancelado, así que `esVenta` lo saca de los reportes y la
 *    venta desaparece igual que desapareció el dinero;
 *  · devuelve la despensa solo si el plato nunca entró a cocina. Si ya se cocinó, el
 *    insumo se gastó de verdad y fingir que volvió sería mentirle al inventario.
 */
export async function devolverPedido(id: string, motivo: string): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  if (p.pago !== "pagado") {
    throw new Error(`El pedido #${id} no está cobrado: para anularlo usa "Cancelar".`);
  }
  const razon = motivo.trim();
  if (!razon) throw new Error("Escribe por qué se devuelve el dinero.");

  const seCocino = p.estado !== "recibido";
  if (!seCocino) devolverDespensa(cat, p);

  p.devolucion = { monto: p.total, motivo: razon.slice(0, 200), fecha: new Date().toISOString() };
  p.pago = "devuelto";
  p.estado = "cancelado";
  p.motivoCancelacion = `Devolución: ${razon.slice(0, 160)}`;
  await commit(cat, `Devolvió #${id} (${formatCOP(p.devolucion.monto)}) · ${razon.slice(0, 60)}`, { transaccional: true });
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
  p.canceladoPor = (await quien()) || undefined;
  if (p.pago === "pagado") {
    throw new Error(
      `El pedido #${id} ya está cobrado (${formatCOP(p.total)}). Para anularlo hay que registrar la devolución del dinero.`,
    );
  }
  // Si aún no entró a cocina, la comida no se tocó: la despensa vuelve.
  if (p.estado === "recibido") devolverDespensa(cat, p);
  p.estado = "cancelado";
  p.motivoCancelacion = motivo?.trim().slice(0, 140) || undefined;
  await commit(cat, `Canceló #${id}${motivo ? ` — ${motivo.trim().slice(0, 60)}` : ""}`, { transaccional: true });
  return cat;
}

/**
 * Anota DÓNDE está el cliente, en palabras ("mesa del ventanal", "barra, gorra roja").
 * Sustituye a la asignación de mesa: aquí las mesas no se reparten, pero el mesero
 * necesita igual saber a quién le lleva el plato.
 */
export async function asignarReferencia(id: string, referencia: string): Promise<Catalog> {
  const cat = await read();
  const p = cat.pedidos.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el pedido #${id}.`);
  const texto = referencia.trim().slice(0, 60);
  if (!texto) throw new Error("Escribe dónde está el cliente.");
  p.referencia = texto;
  p.tipo = "mesa";
  // Pasar un domicilio a mesa dejaba los $5.000 del envío dentro del total: un
  // estado internamente contradictorio ("come aquí, pero paga el domiciliario").
  p.domicilio = 0;
  if (p.pago !== "pagado") p.total = totalDe(p);
  await commit(cat, `#${id} está en "${texto}"`, { transaccional: true });
  return cat;
}

/**
 * Ajustes del negocio (los lee el sitio y el panel).
 *
 * Cada sección del panel manda SOLO sus campos. Las secciones anidadas (`comprobante`,
 * `sitio`) se mezclan un nivel más adentro: guardar el mensaje de cierre no puede borrar
 * el logo, ni guardar la portada borrar la historia. `texto` es lo que dice el historial
 * y el botón Deshacer ("Cambió el comprobante"), en vez de un genérico.
 */
export async function updateAjustes(patch: Partial<Ajustes>, texto = "Actualizó los ajustes"): Promise<Catalog> {
  const cat = await read();
  const antes = controlaStock(cat);
  const a = cat.ajustes;
  cat.ajustes = normalizarAjustes({
    ...a,
    ...patch,
    ...(patch.comprobante ? { comprobante: { ...(a.comprobante ?? {}), ...patch.comprobante } } : {}),
    ...(patch.sitio ? { sitio: { ...(a.sitio ?? {}), ...patch.sitio } } : {}),
  });
  /* Encender o apagar el control de despensa tiene que notarse EN EL ACTO: si no se
     recalcula aquí, el operario apaga el control para poder vender y la carta sigue
     apareciendo agotada hasta que algo más la toque. */
  if (controlaStock(cat) !== antes) {
    // Al APAGARLO se limpia lo que agotó la despensa; al encenderlo se recalcula.
    recalcularDisponibilidad(cat, !controlaStock(cat));
  }
  await commit(cat, texto);
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
      it.stock = Math.max(0, Number(((it.stock ?? 0) + cantidad).toFixed(3)));
      // "Hay" es que alcance para una porción ENTERA (ver puedePreparar): con la media
      // que deja un "mitad y mitad" no vuelve a la carta.
      if (it.stock >= 1) it.agotado = false;
      break;
    }
  }
  await commit(cat, `Repuso stock (+${cantidad})`);
  return cat;
}

/* ------------------------------------------------------------------ */
/* INSUMOS + RECETAS (despensa real / ficha técnica)                  */
/* ------------------------------------------------------------------ */

/**
 * Reactiva componentes cuya despensa volvió a alcanzar (tras abastecer, cancelar o
 * devolver). Con `insumos`, solo los que usan alguno de ellos: lo demás no cambió.
 *
 * Con el control APAGADO no hace nada. Ahí nada se agota solo, así que todo `agotado`
 * que haya lo marcó una persona ("se acabó el pollo") y tiene que sobrevivir a una
 * compra o a una cancelación — es lo que promete `recalcularDisponibilidad`. Antes
 * corría igual y lo borraba.
 */
function reactivarPreparables(cat: Catalog, insumos?: string | ReadonlySet<string>): void {
  if (!controlaStock(cat)) return;
  const byId = insumosPorId(cat);
  const usa = (insumoId: string) =>
    insumos === undefined || (typeof insumos === "string" ? insumoId === insumos : insumos.has(insumoId));
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    for (const it of cat[g]) {
      if (!it.receta || it.receta.length === 0) continue;
      if (!it.receta.some((r) => usa(r.insumoId))) continue;
      if (it.agotado && puedePreparar(it, byId)) it.agotado = false;
    }
  }
}

/**
 * Pone al día la disponibilidad de TODA la carta según la despensa, en los dos
 * sentidos: agota lo que ya no alcanza y reactiva lo que volvió a haber.
 *
 * "Se acabó el pollo" se marca poniendo el insumo en 0, y eso tiene que sacar el
 * plato de la carta al instante — antes solo existía el camino de reactivar, así que
 * bajar un insumo a mano no agotaba nada y el sitio seguía vendiéndolo.
 */
function recalcularDisponibilidad(cat: Catalog, limpiarAuto = false): void {
  const byId = insumosPorId(cat);
  const controla = controlaStock(cat);
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    for (const it of cat[g]) {
      if (!it.receta || it.receta.length === 0) continue;
      if (controla) {
        it.agotado = !puedePreparar(it, byId);
      } else if (limpiarAuto) {
        /* SOLO al apagar el interruptor. Es el único momento en que se puede borrar
           el agotado sin pensar, porque todo lo que hay marcado en ese instante lo
           puso la aritmética de la despensa. Después NO se vuelve a tocar: con el
           control apagado nada agota solo, así que cualquier `agotado` que aparezca
           lo marcó una persona diciendo "se acabó" — y eso tiene que sobrevivir. */
        it.agotado = false;
      }
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
  // Recalcula EN LOS DOS SENTIDOS. Antes solo reactivaba: poner un insumo en cero a
  // mano (que es como se marca "se acabó el pollo") dejaba el plato vendiéndose.
  recalcularDisponibilidad(cat);
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
    { transaccional: true },
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
  await commit(cat, `Abasteció "${it?.nombre ?? id}" a estándar`, { transaccional: true });
  return cat;
}

/** Apertura de turno: deja TODA la despensa en su nivel estándar (registra compras). */
export async function abastecerTodoAPar(): Promise<{ repuestos: number; total: number }> {
  const cat = await read();
  let repuestos = 0;
  cat.insumos.forEach((i) => {
    const antes = i.stock;
    i.stock = Math.max(i.stock, i.parStock); // llenar nunca puede significar vaciar
    if (i.stock > antes) repuestos++;
    registrarCompra(cat, i, i.stock - antes);
  });
  recalcularDisponibilidad(cat);
  /* Devuelve CUÁNTO cambió. El botón parecía roto: como la despensa arranca ya en su
     nivel estándar, Math.max no movía nada y la pantalla se quedaba igual sin decir
     por qué. Una acción que no hace nada tiene que decir que no hizo nada. */
  await commit(
    cat,
    repuestos > 0
      ? `Repuso ${repuestos} insumo(s) a su nivel estándar`
      : "Revisó la despensa: ya estaba toda en su nivel estándar",
    { transaccional: true },
  );
  return { repuestos, total: cat.insumos.length };
}

/* ------- Contabilidad: gastos y movimientos ------- */

export interface NuevoGasto {
  concepto: string;
  monto: number;
  categoria: GastoCategoria;
  fecha?: string; // ISO; por defecto ahora
}

/**
 * DEJAR EL NEGOCIO EN CERO PARA ABRIR DE VERDAD.
 *
 * Todo lo transaccional que hay guardado antes de abrir es de desarrollo: pedidos de
 * prueba, los movimientos que nacieron de ellos y una despensa con cantidades
 * inventadas para poder probar el flujo. Salir a operar con eso encima significa que
 * el primer reporte real viene contaminado y que el inventario jura tener cosas que
 * no existen — que es justo el error que hace que nadie vuelva a confiar en el número.
 *
 * BORRA lo transaccional y PONE EN CERO la despensa. NO toca la carta, las recetas,
 * las fichas de insumo (su unidad, su par, su costo) ni los ajustes: eso es trabajo
 * real que costó escribir. Los leads del Club tampoco, que pueden ser gente de verdad.
 *
 * Deja la carta marcada como agotada, que es la verdad: sin despensa no hay nada que
 * preparar. Al cargar el inventario, `reactivarPreparables` la enciende sola.
 */
export async function ponerACero(): Promise<Catalog> {
  const cat = await read();
  cat.pedidos = [];
  cat.movimientos = [];
  cat.arqueos = [];
  cat.historial = [];
  /* Las pilas de deshacer guardan documentos ENTEROS: si se dejan, un "deshacer"
     resucitaría los pedidos de prueba que acabamos de borrar. */
  cat.undo = [];
  cat.redo = [];
  /* El archivo de comprobantes también: son pedidos de prueba mudados de cajón. */
  for (const mes of cat.archivoMeses ?? []) await borrarDoc(claveMes(mes));
  cat.archivoMeses = [];
  for (const i of cat.insumos) i.stock = 0;
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    for (const it of cat[g]) {
      // El stock de LEGADO (unidades abstractas, sin receta) también arranca vacío.
      if (typeof it.stock === "number") it.stock = 0;
    }
  }
  recalcularDisponibilidad(cat);
  // Lo que no tiene receta se agota por su propio stock, que acabamos de vaciar.
  for (const g of ["bases", "proteinas", "toppings"] as const) {
    for (const it of cat[g]) {
      if (!it.receta?.length) it.agotado = (it.stock ?? 0) <= 0;
    }
  }
  /* AUTORITATIVO. `fusionar` une pedidos, movimientos y leads con lo que ya hay —está
     para que un pedido que entró mientras alguien editaba un precio no se pierda— así
     que un commit normal RESUCITA justo lo que se acaba de borrar. Un vaciado
     deliberado es el único caso en que mi documento tiene que mandar tal cual. */
  await commit(cat, "Puso el negocio en cero para abrir", {
    autoritativo: true,
    sinDeshacer: true,
  });
  return cat;
}

/* ------------------------------------------------------------------ */
/* ARQUEO DE CAJA                                                     */
/* ------------------------------------------------------------------ */

/**
 * LO QUE DEBERÍA HABER EN EL CAJÓN, y de dónde sale cada peso.
 *
 * Solo EFECTIVO: lo que entró por datáfono o transferencia no está en el cajón y
 * meterlo aquí haría que el arqueo nunca cuadre.
 *
 * La resta de devoluciones tiene una trampa que conviene dejar escrita: una
 * devolución del MISMO día ya se descuenta sola, porque al devolver el pedido deja
 * de estar "pagado". La que hay que restar a mano es la de un pedido de OTRO día:
 * el dinero sale del cajón de hoy aunque la venta fuera de ayer.
 */
export function esperadoEnCaja(cat: Catalog, dia: string, base: number, salidas = 0) {
  const enEfectivo = (p: Pedido) => (p.metodoPago ?? "efectivo") === "efectivo";
  /* POR LA FECHA DEL COBRO, no la del pedido. Se contaba por `creadoEn`, así que cobrar
     en efectivo el lunes una deuda del martes metía esa plata en el día equivocado: el
     cajón de hoy tenía un sobrante que el arqueo no esperaba, y el descuadre —que es
     justo lo que el conteo a ciegas existe para sacar a la luz— se volvía ruido. Los
     pedidos anteriores a `pagadoEn` caen atrás a `creadoEn` y siguen contando igual. */
  const ventas = cat.pedidos.filter(
    (p) =>
      diaNegocio(p.pagadoEn ?? p.creadoEn) === dia && p.pago === "pagado" && enEfectivo(p) && esVenta(p),
  );
  const cobrado = ventas.reduce((s, p) => s + p.total, 0);
  const devueltoDeOtrosDias = cat.pedidos
    .filter(
      (p) =>
        p.pago === "devuelto" &&
        enEfectivo(p) &&
        p.devolucion &&
        diaNegocio(p.devolucion.fecha) === dia &&
        diaNegocio(p.creadoEn) !== dia,
    )
    .reduce((s, p) => s + (p.devolucion?.monto ?? 0), 0);
  return {
    base,
    cobrado,
    devoluciones: devueltoDeOtrosDias,
    salidas,
    total: base + cobrado - devueltoDeOtrosDias - salidas,
    pedidos: ventas.length,
  };
}

/** El arqueo abierto de hoy, si lo hay. */
export function arqueoAbierto(cat: Catalog, dia = diaNegocio()): Arqueo | undefined {
  return (cat.arqueos ?? []).find((a) => a.dia === dia && !a.cerradoEn);
}

export async function abrirCaja(base: number, usuario?: string): Promise<Catalog> {
  const cat = await read();
  const dia = diaNegocio();
  cat.arqueos = cat.arqueos ?? [];
  if (arqueoAbierto(cat, dia)) throw new Error("La caja de hoy ya está abierta.");
  const arqueo: Arqueo = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    dia,
    abiertoEn: new Date().toISOString(),
    base: Math.max(0, Math.round(base)),
    usuarioAbre: usuario,
  };
  cat.arqueos = [arqueo, ...cat.arqueos].slice(0, 400);
  await commit(cat, `Abrió caja con ${formatCOP(arqueo.base)}`, { transaccional: true });
  return cat;
}

/**
 * Cierra la caja con lo CONTADO. El esperado se calcula aquí, en el servidor, y se
 * congela en el arqueo: si se calculara al leer, un cobro tardío cambiaría mañana la
 * diferencia de un turno que ya se cerró y firmó.
 */
export async function cerrarCaja(input: {
  contado: number;
  salidas?: number;
  notas?: string;
  usuario?: string;
}): Promise<Catalog> {
  const cat = await read();
  const dia = diaNegocio();
  const arqueo = arqueoAbierto(cat, dia);
  if (!arqueo) throw new Error("No hay una caja abierta hoy. Ábrela primero con su base.");
  const salidas = Math.max(0, Math.round(input.salidas ?? 0));
  const contado = Math.max(0, Math.round(input.contado));
  const { total } = esperadoEnCaja(cat, dia, arqueo.base, salidas);
  arqueo.cerradoEn = new Date().toISOString();
  arqueo.contado = contado;
  arqueo.salidas = salidas;
  arqueo.esperado = total;
  arqueo.diferencia = contado - total;
  arqueo.notas = input.notas?.trim().slice(0, 300) || undefined;
  arqueo.usuarioCierra = input.usuario;
  const señal =
    arqueo.diferencia === 0
      ? "cuadró"
      : arqueo.diferencia > 0
        ? `sobran ${formatCOP(arqueo.diferencia)}`
        : `faltan ${formatCOP(-arqueo.diferencia)}`;
  await commit(cat, `Cerró caja: contó ${formatCOP(contado)} · ${señal}`, { transaccional: true });
  return cat;
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
  await commit(cat, `Gasto: ${mov.concepto} ${formatCOP(mov.monto)}`, { transaccional: true });
  return cat;
}

export async function deleteMovimiento(id: string): Promise<Catalog> {
  const cat = await read();
  cat.movimientos = (cat.movimientos ?? []).filter((m) => m.id !== id);
  await commit(cat, "Eliminó un movimiento", { autoritativo: true, transaccional: true });
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
  await commit(cat, `Nuevo lead: ${lead.nombre}`, { transaccional: true });
  return lead;
}

export async function updateLead(
  id: string,
  patch: Partial<Pick<Lead, "estado" | "nombre" | "telefono" | "email">>
): Promise<Catalog> {
  const cat = await read();
  const idx = cat.leads.findIndex((l) => l.id === id);
  if (idx >= 0) cat.leads[idx] = { ...cat.leads[idx], ...patch };
  await commit(cat, "Actualizó un lead", { transaccional: true });
  return cat;
}

export type { EstadoLead };
