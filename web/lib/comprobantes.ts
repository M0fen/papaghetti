/**
 * EL HISTORIAL DE COMPROBANTES: lo que se calcula sobre una lista de pedidos.
 *
 * Buscar, filtrar, resumir, agrupar por día, detectar huecos en la numeración y
 * exportar a Excel. Es un módulo PURO —recibe pedidos, devuelve datos— para que la
 * página sea solo pintura y todo esto se pruebe en Node con pedidos de mentira.
 *
 * Vocabulario que se usa en pantalla (y que NO es fiscal): el papel se llama
 * COMPROBANTE DE CONSUMO. Aquí nunca aparece la palabra "factura".
 *
 * Las fechas se piensan siempre en DÍAS DE NEGOCIO ("YYYY-MM-DD" en hora de
 * Pereira, ver `diaNegocio`): comparables con `===` y `<`, sin sorpresas de zona
 * horaria entre el servidor (UTC en Vercel) y el mostrador.
 */

import {
  esVenta,
  formatCOP,
  lineasDe,
  metodoLabel,
  tipoLabel,
  estadoLabel,
  inicioDe,
  METODOS,
  type Ajustes,
  type MetodoPago,
  type Pedido,
  type TipoServicio,
} from "./menu";
import { cuentaImpresa, diaNegocio, ZONA_NEGOCIO } from "./precios";

/* ───────────────────────── Situación: qué pasó con el comprobante ───────────────────────── */

/**
 * Un pedido tiene dos ejes (estado de cocina y estado de pago) y el cajero
 * pregunta por UNO: "¿qué pasó con este?". Cuatro respuestas, excluyentes:
 * pagado, por pagar, dinero devuelto, anulado (cancelado sin haberse cobrado).
 */
export type Situacion = "pagado" | "pendiente" | "devuelto" | "anulado";
export const SITUACIONES: Situacion[] = ["pagado", "pendiente", "devuelto", "anulado"];
export const situacionLabel: Record<Situacion, string> = {
  pagado: "Pagado",
  pendiente: "Por pagar",
  devuelto: "Dinero devuelto",
  anulado: "Anulado",
};
export function situacionDe(p: Pedido): Situacion {
  if (p.pago === "devuelto") return "devuelto";
  if (p.estado === "cancelado") return "anulado";
  return p.pago === "pagado" ? "pagado" : "pendiente";
}

/* ───────────────────────── Búsqueda y filtros ───────────────────────── */

/** Minúsculas y sin tildes: "Ñandú Pérez" y "nandu perez" son la misma persona. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * ¿Este pedido responde a lo que se tecleó?
 *  · Solo dígitos: el NÚMERO exacto del comprobante, un trozo del teléfono o del id.
 *    ("12" encuentra el #12 y el teléfono 3001234567, no el #112.)
 *  · "#12", "n 12", "no. 12": el número exacto.
 *  · Texto: cliente, referencia, dirección, notas, id o el nombre de un plato.
 */
export function coincide(p: Pedido, q: string): boolean {
  const qn = normalizar(q);
  if (!qn) return true;
  const num = qn.match(/^(?:#|n[°o]?\.?|no\.?)\s*(\d+)$/)?.[1];
  if (num) return String(p.consecutivo ?? "") === num;
  if (/^\d+$/.test(qn)) {
    if (String(p.consecutivo ?? "") === qn) return true;
    /* Con menos de 4 dígitos solo cuenta el número del comprobante: "1" está dentro
       de casi cualquier teléfono y de la mitad de los códigos. */
    if (qn.length < 4) return false;
    if ((p.telefono ?? "").replace(/\D/g, "").includes(qn)) return true;
    return p.id.toLowerCase().includes(qn);
  }
  const texto = normalizar(
    [p.id, p.cliente, p.referencia, p.direccion, p.notas, ...lineasDe(p).map((l) => l.nombre)]
      .filter(Boolean)
      .join(" · "),
  );
  return texto.includes(qn);
}

export interface FiltroComprobantes {
  q?: string;
  situacion?: Situacion | "todos";
  metodo?: MetodoPago | "todos";
  tipo?: TipoServicio | "todos";
  canal?: Pedido["canal"] | "todos";
}

export function filtrarComprobantes(pedidos: Pedido[], f: FiltroComprobantes = {}): Pedido[] {
  return pedidos.filter(
    (p) =>
      (!f.situacion || f.situacion === "todos" || situacionDe(p) === f.situacion) &&
      (!f.metodo || f.metodo === "todos" || p.metodoPago === f.metodo) &&
      (!f.tipo || f.tipo === "todos" || p.tipo === f.tipo) &&
      (!f.canal || f.canal === "todos" || p.canal === f.canal) &&
      coincide(p, f.q ?? ""),
  );
}

/* ───────────────────────── Resumen del conjunto ───────────────────────── */

export interface ResumenComprobantes {
  cantidad: number;
  /** Lo que entró: pedidos PAGADOS que no están cancelados, por método. `p.total` (con impuesto y domicilio). */
  cobrado: { n: number; total: number; porMetodo: { metodo: MetodoPago; n: number; total: number }[] };
  pendiente: { n: number; total: number };
  devuelto: { n: number; monto: number };
  anulados: number;
  ticketPromedio: number;
}

export function resumirComprobantes(pedidos: Pedido[]): ResumenComprobantes {
  const pagados = pedidos.filter((p) => p.pago === "pagado" && esVenta(p));
  const pendientes = pedidos.filter((p) => p.pago === "pendiente" && esVenta(p));
  const devueltos = pedidos.filter((p) => p.pago === "devuelto");
  const anulados = pedidos.filter((p) => p.estado === "cancelado" && p.pago !== "devuelto");
  const suma = (xs: Pedido[], f: (p: Pedido) => number) => xs.reduce((s, p) => s + f(p), 0);
  const totalCobrado = suma(pagados, (p) => p.total);
  return {
    cantidad: pedidos.length,
    cobrado: {
      n: pagados.length,
      total: totalCobrado,
      porMetodo: METODOS.map((metodo) => {
        const xs = pagados.filter((p) => (p.metodoPago ?? "efectivo") === metodo);
        return { metodo, n: xs.length, total: suma(xs, (p) => p.total) };
      }).filter((m) => m.n > 0),
    },
    pendiente: { n: pendientes.length, total: suma(pendientes, (p) => p.total) },
    devuelto: { n: devueltos.length, monto: suma(devueltos, (p) => p.devolucion?.monto ?? p.total) },
    anulados: anulados.length,
    ticketPromedio: pagados.length ? Math.round(totalCobrado / pagados.length) : 0,
  };
}

/* ───────────────────────── Integridad de la numeración ───────────────────────── */

/**
 * Huecos y repetidos en el consecutivo del conjunto. Como los números se asignan
 * en orden de creación, dentro de un rango de fechas un número que falta entre el
 * menor y el mayor es un comprobante que ya no está: eso es lo que hay que poder
 * explicar. Los pedidos sin número son los anteriores a la numeración.
 */
export function huecosDeConsecutivo(
  pedidos: Pedido[],
  maxSalto = 30,
): {
  faltan: number[];
  saltos: [number, number][];
  repetidos: number[];
  sinNumero: number;
  desde?: number;
  hasta?: number;
} {
  const nums = pedidos.map((p) => p.consecutivo).filter((n): n is number => typeof n === "number" && n > 0);
  const sinNumero = pedidos.length - nums.length;
  if (!nums.length) return { faltan: [], saltos: [], repetidos: [], sinNumero };
  const vistos = new Map<number, number>();
  for (const n of nums) vistos.set(n, (vistos.get(n) ?? 0) + 1);
  const unicos = [...vistos.keys()].sort((a, b) => a - b);
  const faltan: number[] = [];
  const saltos: [number, number][] = [];
  /* Entre dos números seguidos del conjunto: un hueco pequeño se enumera (son
     comprobantes que faltan); un salto grande no es un hueco, es otra cosa (una
     deuda vieja que sigue viva junto a los de hoy, un rango que cruza meses) y se
     dice como salto, sin listar miles de números. */
  for (let i = 1; i < unicos.length; i++) {
    const de = unicos[i - 1];
    const a = unicos[i];
    if (a - de <= 1) continue;
    if (a - de - 1 <= maxSalto) for (let n = de + 1; n < a; n++) faltan.push(n);
    else saltos.push([de, a]);
  }
  const repetidos = [...vistos.entries()].filter(([, c]) => c > 1).map(([n]) => n).sort((a, b) => a - b);
  return { faltan, saltos, repetidos, sinNumero, desde: unicos[0], hasta: unicos[unicos.length - 1] };
}

/* ───────────────────────── Por día ───────────────────────── */

export interface DiaComprobantes {
  dia: string;
  pedidos: Pedido[];
  resumen: ResumenComprobantes;
}

/** Agrupa por día de negocio, el día más reciente primero y dentro del día el más reciente primero. */
export function agruparPorDia(pedidos: Pedido[]): DiaComprobantes[] {
  const m = new Map<string, Pedido[]>();
  for (const p of pedidos) {
    const d = diaNegocio(p.creadoEn);
    m.set(d, [...(m.get(d) ?? []), p]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dia, xs]) => {
      const ordenados = [...xs].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
      return { dia, pedidos: ordenados, resumen: resumirComprobantes(ordenados) };
    });
}

/* ───────────────────────── Rangos de fecha ───────────────────────── */

export type PresetRango = "hoy" | "ayer" | "semana" | "mes" | "anio" | "todo" | "rango";
/** Los atajos que se ofrecen en pantalla ("anio" sigue existiendo, pero "Todo" y el rango libre lo cubren). */
export const PRESETS: { id: PresetRango; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "todo", label: "Todo" },
  { id: "rango", label: "Fechas…" },
];
/** Desde cuándo es "todo": antes de que existiera el negocio. */
export const DIA_CERO = "2000-01-01";
export interface Rango {
  desde: string;
  hasta: string;
}

export const esDia = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Suma días a un "YYYY-MM-DD" (aritmética de calendario, sin zona horaria de por medio). */
export function diaMas(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/**
 * El rango de días de un atajo. "Semana", "Mes" y "Año" usan el MISMO arranque que
 * Finanzas (`inicioDe`), para que las dos pantallas cuenten lo mismo. Un rango libre
 * se normaliza: si vienen al revés, se dan la vuelta; si falta el final, es un día.
 */
export function rangoDe(preset: PresetRango, now: Date = new Date(), desde?: string, hasta?: string): Rango {
  const hoy = diaNegocio(now);
  switch (preset) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const a = diaMas(hoy, -1);
      return { desde: a, hasta: a };
    }
    case "semana":
    case "mes":
    case "anio":
      return { desde: diaNegocio(inicioDe(preset, now)), hasta: hoy };
    case "todo":
      return { desde: DIA_CERO, hasta: hoy };
    default: {
      const d = esDia(desde) ? desde : hoy;
      const h = esDia(hasta) ? hasta : d;
      return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
    }
  }
}

/* ───────────────────────── El estado de la pantalla vive en la URL ───────────────────────── */

/**
 * Todo lo que la página necesita saber cabe en la URL: así una vista se comparte
 * ("mándame lo de Nequi de agosto" es un enlace), el botón Atrás funciona y el CSV
 * exporta EXACTAMENTE lo que se ve, porque lee los mismos parámetros.
 *
 *   p      hoy | ayer | semana | mes | todo | rango      (atajo de fechas)
 *   desde / hasta  YYYY-MM-DD                            (solo con p=rango; implican rango)
 *   q      texto de búsqueda
 *   s      situación   · m  método de pago · t  tipo de servicio · c  canal
 *   pag    página (≥ 1)
 *
 * Regla de alcance: si se BUSCA algo y no se eligió atajo, se busca en TODO: el
 * número de un comprobante es único en toda la historia y nadie sabe de qué día era
 * el papel arrugado. Sin búsqueda, el defecto es Hoy.
 */
export interface Filtros {
  p: PresetRango;
  desde?: string;
  hasta?: string;
  q: string;
  s: Situacion | "todos";
  m: MetodoPago | "todos";
  t: TipoServicio | "todos";
  c: Pedido["canal"] | "todos";
  pag: number;
}
export type ParamsCrudos = Record<string, string | string[] | undefined>;

const uno = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
const entre = <T extends string>(v: string, validos: readonly T[]): T | undefined =>
  (validos as readonly string[]).includes(v) ? (v as T) : undefined;

const PRESET_IDS: PresetRango[] = ["hoy", "ayer", "semana", "mes", "anio", "todo", "rango"];
const CANALES: Pedido["canal"][] = ["web", "qr", "salon"];
const TIPOS_ID: TipoServicio[] = ["mesa", "llevar", "domicilio"];

export function presetPorDefecto(q: string): PresetRango {
  return q ? "todo" : "hoy";
}

/** Primer y último día de un mes "YYYY-MM". */
export function rangoDelMes(mes: string): Rango {
  const [y, m] = mes.split("-").map(Number);
  const siguiente = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { desde: `${mes}-01`, hasta: diaMas(siguiente, -1) };
}
/** Si el rango es exactamente un mes entero, ese mes ("YYYY-MM"); si no, "". */
export function mesDe(r: Rango): string {
  const mes = r.desde.slice(0, 7);
  const m = rangoDelMes(mes);
  return m.desde === r.desde && m.hasta === r.hasta ? mes : "";
}

export function leerFiltros(sp: ParamsCrudos): Filtros {
  const q = uno(sp.q).slice(0, 80);
  /* `mes=2026-08` es el enlace que el dueño le manda al contador: se expande al mes
     entero y manda sobre desde/hasta. */
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(uno(sp.mes)) ? rangoDelMes(uno(sp.mes)) : null;
  const desde = mes ? mes.desde : esDia(uno(sp.desde)) ? uno(sp.desde) : undefined;
  const hasta = mes ? mes.hasta : esDia(uno(sp.hasta)) ? uno(sp.hasta) : undefined;
  const p = mes ? "rango" : (entre(uno(sp.p), PRESET_IDS) ?? (desde || hasta ? "rango" : presetPorDefecto(q)));
  const pag = Math.max(1, Math.floor(Number(uno(sp.pag)) || 1));
  return {
    p,
    desde: p === "rango" ? desde : undefined,
    hasta: p === "rango" ? hasta : undefined,
    q,
    s: entre(uno(sp.s), SITUACIONES) ?? "todos",
    m: entre(uno(sp.m), METODOS) ?? "todos",
    t: entre(uno(sp.t), TIPOS_ID) ?? "todos",
    c: entre(uno(sp.c), CANALES) ?? "todos",
    pag,
  };
}

/**
 * La URL de una vista, sin los valores por defecto (para que /admin/comprobantes sea
 * siempre la forma canónica de "hoy, todo") y sin la página cuando cambia algo más.
 */
export function queryDe(f: Filtros, cambios: Partial<Filtros> = {}, base = "/admin/comprobantes"): string {
  const cambiaAlgoMasQueLaPagina = Object.keys(cambios).some((k) => k !== "pag");
  const g: Filtros = { ...f, ...cambios, pag: cambiaAlgoMasQueLaPagina ? 1 : (cambios.pag ?? f.pag) };
  const sp = new URLSearchParams();
  if (g.q) sp.set("q", g.q);
  if (g.p !== presetPorDefecto(g.q)) sp.set("p", g.p);
  if (g.p === "rango") {
    if (g.desde) sp.set("desde", g.desde);
    if (g.hasta) sp.set("hasta", g.hasta);
  }
  if (g.s !== "todos") sp.set("s", g.s);
  if (g.m !== "todos") sp.set("m", g.m);
  if (g.t !== "todos") sp.set("t", g.t);
  if (g.c !== "todos") sp.set("c", g.c);
  if (g.pag > 1) sp.set("pag", String(g.pag));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

const FMT_MES = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", month: "long", year: "numeric" });
/**
 * Los meses que tienen comprobantes, del más reciente al más antiguo: los que hay en
 * el cerebro más los archivados. Para el selector "Elegir mes…".
 */
export function mesesDisponibles(pedidos: Pedido[], archivados: string[] = []): { valor: string; etiqueta: string }[] {
  const meses = new Set<string>(archivados);
  for (const p of pedidos) meses.add(diaNegocio(p.creadoEn).slice(0, 7));
  return [...meses]
    .sort()
    .reverse()
    .map((valor) => {
      const [y, m] = valor.split("-").map(Number);
      const etiqueta = FMT_MES.format(new Date(Date.UTC(y, m - 1, 15)));
      return { valor, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) };
    });
}

/** ¿Hay algún filtro puesto además de las fechas? (para mostrar "Limpiar"). */
export const hayFiltros = (f: Filtros): boolean =>
  Boolean(f.q) || f.s !== "todos" || f.m !== "todos" || f.t !== "todos" || f.c !== "todos";

/* ───────────────────────── Paginación ───────────────────────── */

export const POR_PAGINA = 100;

export function paginar<T>(xs: T[], pag: number, porPagina = POR_PAGINA): { items: T[]; pag: number; paginas: number; total: number; desde: number; hasta: number } {
  const total = xs.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(Math.max(1, pag), paginas);
  const desde = (actual - 1) * porPagina;
  const items = xs.slice(desde, desde + porPagina);
  return { items, pag: actual, paginas, total, desde: total ? desde + 1 : 0, hasta: desde + items.length };
}

/* ───────────────────────── Texto corto de lo pedido ───────────────────────── */

/** "Nido Carbonara, 2× Churrasco y 1 más": lo justo para reconocer el papel de un vistazo. */
export function resumenLineas(p: Pedido, max = 2): string {
  const ls = lineasDe(p);
  const partes = ls.slice(0, max).map((l) => `${l.cantidad > 1 ? `${l.cantidad}× ` : ""}${l.nombre}`);
  const resto = ls.length - max;
  return resto > 0 ? `${partes.join(", ")} y ${resto} más` : partes.join(", ");
}

/* ───────────────────────── Fechas legibles (deterministas: Intl con zona fija) ───────────────────────── */

const FMT_DIA_LARGO = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const FMT_HORA = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_NEGOCIO, hour: "2-digit", minute: "2-digit", hour12: false });
const FMT_FECHA_CORTA = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_NEGOCIO, day: "2-digit", month: "2-digit", year: "numeric" });

/** "vie, 12 sept 2026" a partir de "2026-09-12". */
export function diaLegible(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return FMT_DIA_LARGO.format(new Date(Date.UTC(y, m - 1, d, 12))).replace(/\.$/, "");
}
/** "14:03" en hora de Pereira. */
export function horaLegible(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of FMT_HORA.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.hour}:${p.minute}`;
}
/** "12/09/2026" en hora de Pereira. */
export function fechaCorta(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of FMT_FECHA_CORTA.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.day}/${p.month}/${p.year}`;
}

/* ───────────────────────── Exportar a Excel (CSV) ───────────────────────── */

export const COLUMNAS_CSV = [
  "numero",
  "fecha",
  "hora",
  "id",
  "situacion",
  "metodo_pago",
  "total",
  "consumo",
  "descuento",
  "impuesto",
  "domicilio",
  "servicio",
  "canal",
  "cliente",
  "telefono",
  "referencia",
  "platos",
  "estado_cocina",
  "motivo",
  "monto_devuelto",
  "fecha_devolucion",
] as const;

const canalLabel: Record<Pedido["canal"], string> = { web: "Sitio web", qr: "QR en mesa", salon: "Mostrador" };

/**
 * Una celda CSV. Entre comillas si hace falta y, si es texto que empieza por = + - @,
 * con un apóstrofo delante: el nombre del cliente lo escribe el cliente desde el QR y
 * Excel ejecutaría "=…" como fórmula al abrir el archivo.
 */
export function celdaCsv(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return String(v);
  let s = String(v).replace(/[\r\n]+/g, " ");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV para Excel en español, pensado para SUMAR y para tablas dinámicas: BOM UTF-8
 * (para que las tildes salgan bien al abrirlo con doble clic), punto y coma como
 * separador (Excel es-CO usa coma decimal), cabeceras en minúscula y sin tildes,
 * números SIN formato ("$" y puntos de miles rompen las sumas), teléfono solo en
 * dígitos, y SIN fila de totales: una fila de totales al final es lo que rompe una
 * tabla dinámica. Los totales los da la pantalla. Una fila por comprobante, del más
 * reciente al más antiguo.
 */
export function csvComprobantes(pedidos: Pedido[]): string {
  const filas = pedidos.map((p) => {
    const sit = situacionDe(p);
    return [
      p.consecutivo ?? "",
      fechaCorta(p.creadoEn),
      horaLegible(p.creadoEn),
      p.id,
      situacionLabel[sit],
      p.metodoPago ? metodoLabel[p.metodoPago] : "",
      p.total,
      p.subtotal - (p.descuento ?? 0),
      p.descuento ?? 0,
      p.impuesto ?? 0,
      p.domicilio ?? 0,
      tipoLabel[p.tipo],
      canalLabel[p.canal] ?? p.canal,
      p.cliente ?? "",
      (p.telefono ?? "").replace(/\D/g, ""),
      p.referencia ?? p.direccion ?? "",
      lineasDe(p)
        .map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}${l.detalle ? ` (${l.detalle})` : ""}`)
        .join(" | "),
      estadoLabel[p.estado],
      p.devolucion?.motivo ?? p.motivoCancelacion ?? "",
      p.pago === "devuelto" ? (p.devolucion?.monto ?? p.total) : "",
      p.devolucion?.fecha ? fechaCorta(p.devolucion.fecha) : "",
    ].map(celdaCsv);
  });
  return "\ufeff" + [COLUMNAS_CSV.join(";"), ...filas.map((f) => f.join(";"))].join("\r\n");
}

/** Nombre de archivo para la exportación: comprobantes-2026-09-01_2026-09-30.csv */
export const nombreCsv = (r: Rango) =>
  `comprobantes-${r.desde}${r.hasta !== r.desde ? `_${r.hasta}` : ""}.csv`;

/* ───────────────────────── El comprobante en texto (WhatsApp, portapapeles) ───────────────────────── */

/**
 * EL MISMO TEXTO EN TODAS PARTES. Vivía dos veces: en el comprobante (con los avisos
 * de ANULADO / DINERO DEVUELTO) y en la caja (sin ellos): desde Pedidos se podía
 * mandar por WhatsApp un pedido anulado como si fuera un consumo válido. Una sola
 * función, la completa, y las dos pantallas la llaman.
 */
export function textoComprobante(p: Pedido, a: Partial<Pick<Ajustes, "negocio" | "impuestoPct">> = {}): string {
  const cuenta = cuentaImpresa(p, a.impuestoPct);
  const anulado = p.estado === "cancelado";
  const devuelto = p.pago === "devuelto";
  return [
    `*${a.negocio || "Papaghetti"}*`,
    `Comprobante N° ${p.consecutivo ?? p.id} · ${fechaCorta(p.creadoEn)} · ${horaLegible(p.creadoEn)}`,
    devuelto
      ? `*** DINERO DEVUELTO (${formatCOP(p.devolucion?.monto ?? p.total)}) ***`
      : anulado
        ? "*** PEDIDO ANULADO — NO ES UN CONSUMO ***"
        : "",
    "",
    ...cuenta.lineas.flatMap((l) => [
      `${l.cantidad > 1 ? `${l.cantidad}× ` : ""}${l.nombre}   ${formatCOP(l.importe)}`,
      l.detalle ? `   _${l.detalle}_` : "",
    ]),
    "",
    ...cuenta.sumas.map(([k, v]) => `${k}: ${formatCOP(v)}`),
    `*TOTAL: ${formatCOP(cuenta.total)}*`,
    cuenta.nota ?? "",
    "",
    `Pago: ${devuelto ? "devuelto" : p.pago === "pagado" ? (p.metodoPago ? metodoLabel[p.metodoPago] : "pagado") : "PENDIENTE"}`,
    "",
    "Comprobante interno de control. No es factura electrónica de venta ni documento equivalente P.O.S.",
    "¡Gracias por venir!",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Un teléfono tal como se teclea → el número que entiende wa.me (10 dígitos = celular colombiano → 57…). */
export function telefonoWa(tel: string): string {
  const d = tel.replace(/\D/g, "");
  return d.length === 10 ? `57${d}` : d;
}

export const waHref = (tel: string, texto: string): string =>
  `https://wa.me/${telefonoWa(tel)}?text=${encodeURIComponent(texto)}`;

/** El enlace de WhatsApp del comprobante al teléfono que dejó el cliente, o null si no dejó ninguno. */
export function waComprobanteHref(p: Pedido, a?: Partial<Pick<Ajustes, "negocio" | "impuestoPct">>): string | null {
  if (!p.telefono || p.telefono.replace(/\D/g, "").length < 7) return null;
  return waHref(p.telefono, textoComprobante(p, a));
}
