/**
 * EL PAPEL DEL COMPROBANTE, UNA SOLA VEZ.
 *
 * El comprobante sale por cuatro caminos —la pantalla, la imagen de la térmica, el
 * texto ESC/POS de la impresión directa y el WhatsApp— y cada uno armaba su propio
 * papel. Se notaba: el WhatsApp no traía el título ni los datos del negocio, decía
 * "Comprobante interno…" donde los otros decían "Documento interno…", y tres de los
 * cuatro imprimían el número de EJEMPLO del WhatsApp como si fuera el teléfono del local.
 * Ahora el contenido se decide aquí, una vez (`papelDe`), y las cuatro salidas solo lo
 * dibujan: lo que dice una lo dicen todas.
 *
 * Lo que el dueño personaliza (Ajustes → Comprobante) también vive aquí, con sus
 * valores de fábrica, y lo que NO se puede cambiar —el título y la nota legal— son
 * constantes: ningún dato guardado puede pisarlas.
 *
 * Módulo PURO (sin DOM, sin React, sin next/*): lo importan las cuatro salidas, el
 * editor de Ajustes y la acción que guarda, y lo prueban las suites de Node.
 */

import {
  formatCOP,
  metodoLabel,
  soloDigitos,
  tipoLabel,
  whatsappValido,
  WHATSAPP_PLACEHOLDER,
  type Ajustes,
  type Pedido,
} from "./menu";
import { cuentaImpresa, sinImpuesto, type CuentaImpresa } from "./precios";

/** Qué datos del cliente salen en el papel. Lo ausente = como hoy. */
export interface DatosClientePapel {
  /** El nombre de quien pide. */
  cliente?: boolean;
  /** Dónde está en el local ("mesa del ventanal"). */
  ubicacion?: boolean;
  /** Su teléfono. */
  telefono?: boolean;
  /** La dirección de entrega (solo existe en domicilios). */
  direccion?: boolean;
  /** La nota para la cocina ("sin cebolla"). */
  notas?: boolean;
}

/** Lo que el dueño puede personalizar del comprobante (Ajustes.comprobante). */
export interface AjustesComprobante {
  /**
   * Logo propio para el papel: una imagen PNG en blanco y negro, como data URL pequeña.
   * Vacío = el logo de la casa (/logo-papaghetti-bn.png).
   */
  logo?: string;
  /** La línea final. Vacío = "¡Gracias por venir!". */
  mensajeCierre?: string;
  /** Hasta 3 líneas extra al pie: Wi-Fi, Instagram, web. */
  lineasPie?: string[];
  /** Qué datos del cliente se muestran. */
  datosCliente?: DatosClientePapel;
}

/** Lo que el papel necesita de Ajustes. Nombre, razón social, NIT, dirección y teléfono son los de siempre. */
export type AjustesPapel = Partial<
  Pick<Ajustes, "negocio" | "razonSocial" | "nit" | "direccion" | "telefonoLocal" | "whatsapp" | "impuestoPct" | "comprobante">
>;

/**
 * Lo que el papel necesita, sacado de Ajustes. SIN el logo por defecto: la caja lo
 * manda a cada fila de la lista de pedidos y se refresca cada 10 s; el logo solo hace
 * falta donde se dibuja la imagen.
 */
export function ajustesPapelDe(a: Ajustes, conLogo = false): AjustesPapel {
  const comprobante = a.comprobante ? { ...a.comprobante } : undefined;
  if (comprobante && !conLogo) delete comprobante.logo;
  return {
    negocio: a.negocio,
    razonSocial: a.razonSocial,
    nit: a.nit,
    direccion: a.direccion,
    telefonoLocal: a.telefonoLocal,
    whatsapp: a.whatsapp,
    impuestoPct: a.impuestoPct,
    comprobante,
  };
}

/* ───────────────────────── Lo fijo ───────────────────────── */

/**
 * EL TÍTULO Y LA NOTA LEGAL NO SE CONFIGURAN. Papaghetti no emite documentos de la
 * DIAN: este papel es un control interno, y así lo dice a quien lo recibe. Si el título
 * o la nota se pudieran editar, bastaría un cambio de texto para que el comprobante
 * pareciera lo que no es. Por eso son constantes y `papelDe` las pone siempre, venga lo
 * que venga en el cerebro.
 */
export const TITULO = "COMPROBANTE DE CONSUMO";
/** La misma redacción en las cuatro salidas (el WhatsApp decía "Comprobante interno…"). */
export const AVISO_LEGAL =
  "Documento interno de control. No es factura electrónica de venta ni documento equivalente P.O.S.";
export const CIERRE_POR_DEFECTO = "¡Gracias por venir!";
/** El logo de la casa, ya en blanco y negro (lo genera qa-logo-bn.mjs). */
export const LOGO_DE_LA_CASA = "/logo-papaghetti-bn.png";

/** Hasta cuántas líneas extra lleva el pie. Más ya no es un pie: es un volante. */
export const MAX_LINEAS_PIE = 3;

/**
 * Topes de largo, en caracteres. Los pone el formulario (maxLength) y los vuelve a
 * poner el servidor y el papel: lo que llega de un cerebro viejo o de una petición a
 * mano no puede convertir el tiquete en un rollo de medio metro.
 */
export const LARGO = {
  negocio: 60,
  razonSocial: 80,
  nit: 24,
  direccion: 140,
  telefonoLocal: 24,
  cierre: 60,
  lineaPie: 64,
} as const;

/**
 * El logo propio: un PNG en blanco y negro como data URL, de ~60 KB como mucho (80.000
 * caracteres en base64). Vive DENTRO del cerebro, que se lee y escribe entero en cada
 * acción: un logo de 1 MB haría lento todo el panel. Un logo bien preparado (umbral,
 * recorte, encaje) pesa entre 5 y 20 KB.
 */
export const LOGO_MAX_CARACTERES = 80_000;

/**
 * La caja donde cabe el logo en el tiquete, en unidades lógicas del dibujo (las de
 * 80 mm; en 58 mm se escalan a 0,8). El logo de la casa mide 640×274 y entra a lo ancho;
 * un logo cuadrado entra a lo alto, en vez de salir de 33 mm de alto como antes.
 */
export const CAJA_LOGO = { ancho: 330, alto: 140 } as const;

/** Los datos del cliente que salen de fábrica: el papel de siempre. */
export const DATOS_CLIENTE_DE_FABRICA: Required<DatosClientePapel> = {
  cliente: true,
  ubicacion: true,
  telefono: false,
  direccion: false,
  notas: true,
};

/** Los datos del cliente, en el orden en que salen, con el nombre que se les da en Ajustes. */
export const CAMPOS_CLIENTE: { id: keyof DatosClientePapel; label: string }[] = [
  { id: "ubicacion", label: "Ubicación (mesa o lugar)" },
  { id: "cliente", label: "Nombre del cliente" },
  { id: "telefono", label: "Teléfono del cliente" },
  { id: "direccion", label: "Dirección de entrega (domicilios)" },
  { id: "notas", label: "Nota para la cocina" },
];

/* ───────────────────────── Saneo del texto libre ───────────────────────── */

/**
 * Los emojis se quitan del papel. La térmica no los tiene: en texto ESC/POS se borran y
 * en la imagen salen como una mancha negra después del blanco y negro. Si el WhatsApp los
 * conservara, el papel diría una cosa y el mensaje otra. Se miran los que se ven como
 * emoji (Emoji_Presentation, o cualquiera con el selector de emoji) y sus pegamentos;
 * ©, ® y ™ son letras para estos efectos y se quedan.
 */
const EMOJI =
  /\p{Emoji_Presentation}|\p{Extended_Pictographic}\u{FE0F}|[\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{200D}\u{FE0F}\u{20E3}]/gu;
/** ¿Trae algún emoji? (para avisarle al dueño antes de que lo busque en el papel). */
export const tieneEmoji = (s: string): boolean => new RegExp(EMOJI.source, "u").test(s);

/* Saltos, tabuladores y caracteres de control (y los invisibles de ancho cero): en el
   papel una línea es una línea. Un salto dentro de "Wi-Fi" partía el WhatsApp y en la
   térmica contaba como un renglón más que nadie había medido. */
const CONTROL = /[\u{0}-\u{1F}\u{7F}-\u{9F}\u{2028}\u{2029}\u{200B}\u{2060}\u{FEFF}]/gu;

/** Recorta por letras (no por unidades de UTF-16): nunca deja un carácter partido a la mitad. */
function recortar(s: string, max: number): string {
  const letras = Array.from(s);
  return letras.length > max ? letras.slice(0, max).join("").trim() : s;
}

/**
 * Una línea limpia, tal como la escribió el dueño: sin saltos ni tabuladores ni
 * caracteres de control, los espacios de más colapsados y con su tope de largo. Es lo
 * que se GUARDA. Lo que no es texto (un número viejo, un null) cuenta como vacío o como
 * su cifra.
 */
export function lineaLimpia(v: unknown, max = 200): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return recortar(String(v).replace(CONTROL, " ").replace(/\s+/g, " ").trim(), max);
}

/** Lo que se IMPRIME: la línea limpia y sin emojis. */
export function textoPapel(v: unknown, max = 200): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return lineaLimpia(String(v).replace(EMOJI, " "), max);
}

/** El NIT sin un "NIT" delante: el papel ya lo escribe ("NIT NIT 901…" salía en datos viejos). */
const nitSolo = (v: unknown): string => textoPapel(v, LARGO.nit).replace(/^nit\b[\s:.-]*/i, "");

/* ───────────────────────── Teléfonos ───────────────────────── */

/** El número de ejemplo de la semilla, con o sin el 57 delante. */
export function esNumeroDeEjemplo(t: string): boolean {
  const d = soloDigitos(t);
  return d === WHATSAPP_PLACEHOLDER || d === WHATSAPP_PLACEHOLDER.slice(2);
}

/**
 * Un teléfono escrito para LEERSE: "573001112244" → "300 111 2244", igual que un fijo
 * de 10 cifras ("606 333 4455"). Lo que no tenga la forma de un número colombiano queda
 * como se escribió.
 */
export function telefonoLegible(t: string): string {
  const d = soloDigitos(t);
  const diez = d.length === 12 && d.startsWith("57") ? d.slice(2) : d.length === 10 ? d : "";
  return diez ? `${diez.slice(0, 3)} ${diez.slice(3, 6)} ${diez.slice(6)}` : lineaLimpia(t, LARGO.telefonoLocal);
}

/**
 * EL TELÉFONO QUE SALE EN EL PAPEL. El del local si lo hay; si no, el WhatsApp del
 * negocio, pero SOLO si es real: el papel imprimía `Tel. 573001112233` (el número de
 * ejemplo de la semilla) a cualquier cliente que lo pidiera. Mejor sin teléfono que con
 * uno que no contesta nadie.
 */
export function telefonoNegocio(a: AjustesPapel = {}): string {
  const local = textoPapel(a.telefonoLocal, LARGO.telefonoLocal);
  if (local && !esNumeroDeEjemplo(local)) return telefonoLegible(local);
  const wa = typeof a.whatsapp === "string" ? a.whatsapp : "";
  if (whatsappValido(wa) && !esNumeroDeEjemplo(wa)) return telefonoLegible(wa);
  return "";
}

/* ───────────────────────── La configuración, con sus valores de fábrica ───────────────────────── */

export interface ComprobanteResuelto {
  /** Lo que se dibuja arriba: el logo propio o el de la casa. */
  logo: string;
  logoPropio: boolean;
  /** Nunca vacío: si no hay uno propio, el de fábrica. */
  mensajeCierre: string;
  /** De 0 a 3, limpias y sin vacías, en el orden en que se escribieron. */
  lineasPie: string[];
  datosCliente: Required<DatosClientePapel>;
}

/** ¿Es un logo propio que se puede dibujar? (la validación completa está en `logoPngValido`). */
const esLogoPropio = (v: unknown): v is string =>
  typeof v === "string" && v.startsWith("data:image/png;base64,") && v.length <= LOGO_MAX_CARACTERES;

/**
 * Lo que el dueño configuró, con lo de fábrica en lo que falte. Tolera cualquier cosa:
 * un cerebro viejo sin la sección, un archivo de hace meses, `{}` en las pruebas, o un
 * JSON tocado a mano con tipos que no son (un texto donde iba una lista).
 */
export function comprobanteDe(a?: AjustesPapel | null): ComprobanteResuelto {
  const c = (a?.comprobante && typeof a.comprobante === "object" ? a.comprobante : {}) as Record<string, unknown>;
  const dc = (c.datosCliente && typeof c.datosCliente === "object" ? c.datosCliente : {}) as Record<string, unknown>;
  const datosCliente = { ...DATOS_CLIENTE_DE_FABRICA };
  for (const k of Object.keys(DATOS_CLIENTE_DE_FABRICA) as (keyof DatosClientePapel)[]) {
    if (typeof dc[k] === "boolean") datosCliente[k] = dc[k] as boolean;
  }
  const lineasPie = (Array.isArray(c.lineasPie) ? c.lineasPie : [])
    .map((l) => textoPapel(l, LARGO.lineaPie))
    .filter(Boolean)
    .slice(0, MAX_LINEAS_PIE);
  const logoPropio = esLogoPropio(c.logo);
  return {
    logo: logoPropio ? (c.logo as string) : LOGO_DE_LA_CASA,
    logoPropio,
    mensajeCierre: textoPapel(c.mensajeCierre, LARGO.cierre) || CIERRE_POR_DEFECTO,
    lineasPie,
    datosCliente,
  };
}

/* ───────────────────────── El papel ───────────────────────── */

/** Un dato con su rótulo ("Cliente": "Ana"). */
export interface DatoPapel {
  k: string;
  v: string;
}

/** TODO lo que dice el comprobante, ya decidido. Las salidas solo lo dibujan. */
export interface Papel {
  /** Un pedido cancelado o devuelto NO puede salir como un consumo válido: va primero. */
  sello?: { titulo: "PEDIDO ANULADO" | "DINERO DEVUELTO"; detalle: string };
  cabecera: {
    nombre: string;
    /** El logo que se dibuja en la pantalla y la imagen (el ESC/POS y el WhatsApp escriben el nombre). */
    logo: string;
    logoPropio: boolean;
    /** Razón social, NIT, dirección y teléfono, ya escritos y sin los vacíos. */
    datos: string[];
  };
  titulo: typeof TITULO;
  /** "N° 12" (el consecutivo interno; los pedidos de antes de la numeración, su código). */
  numero: string;
  /** "12/09/2026 · 14:03", en hora de Pereira. */
  fecha: string;
  servicio: string;
  /** Ubicación, cliente, teléfono y dirección: solo los encendidos en Ajustes y que el pedido trae. */
  cliente: DatoPapel[];
  /** El dinero, de `cuentaImpresa`: la tarifa congelada en el pedido, como siempre. */
  cuenta: CuentaImpresa;
  /** La nota para la cocina, si se muestra. */
  nota?: string;
  /** "DEVUELTO" · el método ("Nequi") · "Pagado" · "PENDIENTE". */
  pago: string;
  anulado: boolean;
  devuelto: boolean;
  /** La nota legal, las líneas extra y el cierre (el cierre siempre al final, donde estaba el "¡Gracias…"). */
  pie: { legal: typeof AVISO_LEGAL; extra: string[]; cierre: string };
}

/**
 * LA FECHA, ARMADA A MANO a partir de las piezas. `toLocaleString` completo mete
 * literales que dependen de la versión de ICU (el servidor escribía "07:15 a. m." con un
 * espacio normal y el navegador con uno fino) y React rehacía la pantalla entera al
 * hidratar. Tomando solo los valores y poniendo los separadores aquí, servidor y
 * navegador escriben lo mismo. Era la cuarta copia de este formateador: ahora es una.
 */
const PARTES = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export function fechaPapel(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of PARTES.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.day}/${p.month}/${p.year} · ${p.hour}:${p.minute}`;
}

/** El estado del pago tal como se imprime (antes el WhatsApp lo decía en minúsculas). */
export function pagoPapel(p: Pedido): string {
  if (p.pago === "devuelto") return "DEVUELTO";
  if (p.pago === "pagado") return p.metodoPago ? metodoLabel[p.metodoPago] : "Pagado";
  return "PENDIENTE";
}

/** El comprobante de un pedido, con lo que el dueño configuró. */
export function papelDe(p: Pedido, a: AjustesPapel = {}): Papel {
  const conf = comprobanteDe(a);
  const anulado = p.estado === "cancelado" || p.pago === "devuelto";
  const devuelto = p.pago === "devuelto";

  const motivo = textoPapel(devuelto ? p.devolucion?.motivo : p.motivoCancelacion, 160);
  const sello: Papel["sello"] = anulado
    ? devuelto
      ? {
          titulo: "DINERO DEVUELTO",
          detalle: `Se devolvieron ${formatCOP(p.devolucion?.monto ?? p.total)}${motivo ? ` — ${motivo}` : ""}. Este pedido ya no es un consumo.`,
        }
      : {
          titulo: "PEDIDO ANULADO",
          detalle: `Este pedido se canceló${motivo ? `: ${motivo}` : ""}. No corresponde a un consumo y no debe cobrarse.`,
        }
    : undefined;

  const nit = nitSolo(a.nit);
  const tel = telefonoNegocio(a);
  const datos = [
    textoPapel(a.razonSocial, LARGO.razonSocial),
    nit ? `NIT ${nit}` : "",
    textoPapel(a.direccion, LARGO.direccion),
    tel ? `Tel. ${tel}` : "",
  ].filter(Boolean);

  /* Lo que escribió el cliente (o el mesero) también va limpio: una nota con un salto de
     línea partía el WhatsApp, y un emoji era una mancha en la térmica. */
  const dc = conf.datosCliente;
  const cliente: DatoPapel[] = [];
  const ubicacion = textoPapel(p.referencia);
  if (dc.ubicacion && ubicacion) cliente.push({ k: "Ubicación", v: ubicacion });
  const nombre = textoPapel(p.cliente);
  if (dc.cliente && nombre) cliente.push({ k: "Cliente", v: nombre });
  const telCliente = textoPapel(p.telefono);
  if (dc.telefono && telCliente) cliente.push({ k: "Teléfono", v: telefonoLegible(telCliente) });
  /* La dirección solo existe de verdad en un domicilio: un pedido de mesa que la traiga
     (un cambio de tipo a medias) no tiene por qué imprimir a dónde NO se llevó. */
  const direccion = textoPapel(p.direccion);
  if (dc.direccion && direccion && p.tipo === "domicilio") cliente.push({ k: "Dirección", v: direccion });

  const c = cuentaImpresa(p, a.impuestoPct);
  const cuenta: CuentaImpresa = {
    ...c,
    lineas: c.lineas.map((l) => ({ ...l, nombre: textoPapel(l.nombre), detalle: textoPapel(l.detalle) || undefined })),
  };
  const nota = dc.notas ? textoPapel(p.notas) : "";

  return {
    sello,
    cabecera: {
      nombre: textoPapel(a.negocio, LARGO.negocio) || "Papaghetti",
      logo: conf.logo,
      logoPropio: conf.logoPropio,
      datos,
    },
    titulo: TITULO,
    numero: `N° ${p.consecutivo ?? p.id}`,
    fecha: fechaPapel(p.creadoEn),
    servicio: tipoLabel[p.tipo] ?? String(p.tipo ?? ""),
    cliente,
    cuenta,
    nota: nota || undefined,
    pago: pagoPapel(p),
    anulado,
    devuelto,
    pie: { legal: AVISO_LEGAL, extra: conf.lineasPie, cierre: conf.mensajeCierre },
  };
}

/**
 * TODAS LAS CADENAS QUE SE IMPRIMEN, en orden. Es la vara con la que se mide que las
 * cuatro salidas digan lo mismo (las pruebas buscan cada pieza en cada una) y lo que
 * permite ver en Ajustes qué va a salir. Van los VALORES, no los rótulos: "CLIENTE",
 * "Cliente:" y "Cliente" son la misma idea escrita a la manera de cada salida.
 */
export function piezasPapel(papel: Papel): string[] {
  const c = papel.cuenta;
  return [
    ...(papel.sello ? [papel.sello.titulo, papel.sello.detalle] : []),
    papel.cabecera.nombre,
    ...papel.cabecera.datos,
    papel.titulo,
    papel.numero,
    papel.fecha,
    papel.servicio,
    ...papel.cliente.map((d) => d.v),
    ...c.lineas.flatMap((l) => [l.nombre, ...(l.detalle ? [l.detalle] : []), formatCOP(l.importe)]),
    ...(papel.nota ? [papel.nota] : []),
    ...c.sumas.flatMap(([k, v]) => [k, formatCOP(v)]),
    formatCOP(c.total),
    ...(c.nota ? [c.nota] : []),
    papel.pago,
    papel.pie.legal,
    ...papel.pie.extra,
    papel.pie.cierre,
  ];
}

/* ───────────────────────── El formulario de Ajustes → Comprobante ───────────────────────── */

/** Lo que llega del formulario, ya como texto (los tipos no existen en el navegador del otro lado). */
export interface FormularioComprobante {
  negocio: string;
  razonSocial: string;
  nit: string;
  direccion: string;
  telefonoLocal: string;
  mensajeCierre: string;
  lineasPie: string[];
  datosCliente: Required<DatosClientePapel>;
}

/**
 * El FormData del formulario, a texto. Los datos del cliente viajan como campos ocultos
 * "1"/"0" (`dc_cliente`, …): una casilla apagada no se envía, y así no se distingue
 * "apagada" de "no venía en el formulario". Lo que no venga queda como de fábrica.
 */
export function formularioComprobante(fd: FormData): FormularioComprobante {
  const txt = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const datosCliente = { ...DATOS_CLIENTE_DE_FABRICA };
  for (const k of Object.keys(DATOS_CLIENTE_DE_FABRICA) as (keyof DatosClientePapel)[]) {
    const v = fd.get(`dc_${k}`);
    if (v === "1" || v === "0") datosCliente[k] = v === "1";
  }
  return {
    negocio: txt("negocio"),
    razonSocial: txt("razonSocial"),
    nit: txt("nit"),
    direccion: txt("direccion"),
    telefonoLocal: txt("telefonoLocal"),
    mensajeCierre: txt("mensajeCierre"),
    lineasPie: fd.getAll("lineaPie").map((v) => (typeof v === "string" ? v : "")),
    datosCliente,
  };
}

/** Minúsculas y sin tildes, para buscar palabras sin importar cómo se escribieron. */
const plano = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u{300}-\u{36F}]/gu, "");

/**
 * ¿El texto imita un documento fiscal? Es la regla de la cabecera de Comprobante.tsx:
 * imitar un documento de la DIAN sin serlo es peor que no entregar nada. Se buscan las
 * palabras, no cualquier trozo: "Manufacturas Escudero S.A.S." es una razón social
 * honrada aunque contenga "factura" y "cude".
 */
export function pareceFiscal(s: string): boolean {
  const t = plano(s).replace(/manufactur/g, "");
  return /factur|\bdocumentos?\s+equivalentes?\b|\bcufe\b|\bcude\b|\bresolucion(es)?\b/.test(t);
}

/** Papaghetti no maneja propina: no se sugiere, no se cobra y no sale en el papel. */
const hablaDePropina = (s: string) => /\bpropina/.test(plano(s));

export type ResultadoComprobante =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Los campos de siempre (nivel de arriba de Ajustes): también los usa el sitio. */
      datos: { negocio: string; razonSocial: string; nit: string; direccion: string; telefonoLocal: string };
      /** Lo de Ajustes.comprobante, SIN el logo (tiene sus propias acciones). */
      comprobante: Required<Omit<AjustesComprobante, "logo">>;
      /** Lo que se guardó pero conviene saber (emojis que no se imprimen). */
      avisos: string[];
    };

/**
 * LA VALIDACIÓN DEL COMPROBANTE, una sola para el servidor y para el editor (que la
 * corre mientras se escribe y muestra el error antes de guardar). Los errores están
 * escritos para el dueño, no para un programador.
 */
export function validarComprobante(f: FormularioComprobante): ResultadoComprobante {
  const negocio = lineaLimpia(f.negocio, LARGO.negocio);
  const razonSocial = lineaLimpia(f.razonSocial, LARGO.razonSocial);
  const nit = lineaLimpia(f.nit, LARGO.nit).replace(/^nit\b[\s:.-]*/i, "");
  const direccion = lineaLimpia(f.direccion, LARGO.direccion);
  const telefonoLocal = lineaLimpia(f.telefonoLocal, LARGO.telefonoLocal);
  const mensajeCierre = lineaLimpia(f.mensajeCierre, LARGO.cierre);
  /* Cada línea con el número de SU casilla: si la 2 está vacía y la 3 tiene un problema,
     el aviso tiene que decir "la línea 3", que es la que el dueño está mirando. */
  const pieCrudo = (Array.isArray(f.lineasPie) ? f.lineasPie : []).map((l) => lineaLimpia(l, LARGO.lineaPie));
  const lineasPie = pieCrudo.filter(Boolean).slice(0, MAX_LINEAS_PIE);

  if (!negocio) return { ok: false, error: "Escribe el nombre comercial: es lo primero que sale en el papel." };
  if (nit && !/^\d[\d.\- ]*$/.test(nit)) {
    return { ok: false, error: "El NIT lleva solo números, puntos y guion. Ej.: 901.234.567-8" };
  }
  if (nit && soloDigitos(nit).length < 6) return { ok: false, error: "Al NIT le faltan números. Ej.: 901.234.567-8" };
  if (telefonoLocal && soloDigitos(telefonoLocal).length < 7) {
    return { ok: false, error: "El teléfono del local necesita al menos 7 números." };
  }
  if (telefonoLocal && esNumeroDeEjemplo(telefonoLocal)) {
    return { ok: false, error: "Ese es el número de ejemplo: escribe el teléfono real del local, o déjalo vacío." };
  }

  const textos: [string, string][] = [
    ["El nombre comercial", negocio],
    ["La razón social", razonSocial],
    ["La dirección", direccion],
    ["El mensaje de cierre", mensajeCierre],
    ...pieCrudo.map((l, i): [string, string] => [`La línea ${i + 1} al pie`, l]),
  ];
  for (const [campo, t] of textos) {
    if (pareceFiscal(t)) {
      return {
        ok: false,
        error: `${campo} usa una palabra de los documentos de la DIAN. Este papel es un comprobante interno: no puede parecerse a uno de ellos.`,
      };
    }
    if (hablaDePropina(t)) {
      return { ok: false, error: `${campo} habla de propina, y Papaghetti no la maneja: no puede salir en el comprobante.` };
    }
  }

  const datosCliente = { ...DATOS_CLIENTE_DE_FABRICA };
  for (const k of Object.keys(DATOS_CLIENTE_DE_FABRICA) as (keyof DatosClientePapel)[]) {
    const v = f.datosCliente?.[k];
    if (typeof v === "boolean") datosCliente[k] = v;
  }
  const avisos: string[] = [];
  if (textos.some(([, t]) => tieneEmoji(t))) avisos.push("Los emojis no se imprimen: el comprobante sale sin ellos.");
  return {
    ok: true,
    datos: { negocio, razonSocial, nit, direccion, telefonoLocal },
    comprobante: { mensajeCierre, lineasPie, datosCliente },
    avisos,
  };
}

/**
 * EL LOGO QUE LLEGA AL SERVIDOR. El navegador lo prepara (blanco y negro, recorte,
 * encaje), pero lo que llega lo manda quien sea: aquí se exige un PNG de verdad (la
 * firma del formato, no solo el "data:image/png" del principio), de un tamaño sensato y
 * por debajo del tope.
 */
export function logoPngValido(raw: unknown): { ok: true; logo: string; ancho: number; alto: number } | { ok: false; error: string } {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { ok: false, error: "No llegó ninguna imagen. Elige el logo otra vez." };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v)) {
    return { ok: false, error: "El logo tiene que llegar como imagen PNG. Vuelve a elegirlo." };
  }
  if (v.length > LOGO_MAX_CARACTERES) {
    return { ok: false, error: "El logo quedó muy pesado. Prueba con una imagen más sencilla o recortada." };
  }
  let cabeza = "";
  try {
    cabeza = atob(v.slice(v.indexOf(",") + 1, v.indexOf(",") + 1 + 44));
  } catch {
    return { ok: false, error: "La imagen llegó dañada. Vuelve a elegirla." };
  }
  const b = Array.from(cabeza, (ch) => ch.charCodeAt(0));
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || firma.some((x, i) => b[i] !== x) || cabeza.slice(12, 16) !== "IHDR") {
    return { ok: false, error: "Eso no es una imagen PNG. Vuelve a elegir el logo." };
  }
  const ancho = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
  const alto = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
  if (ancho < 8 || alto < 8 || ancho > 2000 || alto > 2000) {
    return { ok: false, error: "El logo tiene un tamaño raro. Vuelve a elegirlo desde el botón." };
  }
  return { ok: true, logo: v, ancho, alto };
}

/* ───────────────────────── El pedido de muestra (vista previa de Ajustes) ───────────────────────── */

/** Una fecha fija: la vista previa se arma igual en el servidor y en el navegador. */
export const FECHA_MUESTRA = "2026-10-16T00:30:00.000Z";

/**
 * Un pedido de mentira para la vista previa de Ajustes: trae TODO lo que el papel puede
 * mostrar (cliente, teléfono, nota, y en el domicilio la dirección), así cada casilla
 * se ve aparecer y desaparecer. Con precios finales, como los pedidos de hoy.
 */
export function pedidoDeMuestra(tipo: "local" | "domicilio" = "local", impuestoPct = 8): Pedido {
  const items = [
    { nombre: "Nido Carbonara", detalle: "con Pollo · + Papa criolla, Parmesano", cantidad: 1, precio: 0, precioFinal: 32000 },
    { nombre: "Limonada de coco", cantidad: 2, precio: 0, precioFinal: 9000 },
  ].map((l) => ({ ...l, precio: sinImpuesto(l.precioFinal, impuestoPct) }));
  const bruto = items.reduce((s, l) => s + l.precioFinal * l.cantidad, 0);
  const domicilio = tipo === "domicilio" ? 5000 : 0;
  const subtotal = sinImpuesto(bruto, impuestoPct);
  return {
    id: "MUESTRA1",
    consecutivo: 128,
    creadoEn: FECHA_MUESTRA,
    canal: "salon",
    tipo: tipo === "domicilio" ? "domicilio" : "mesa",
    cliente: "Ana María Ríos",
    telefono: "3001234567",
    ...(tipo === "domicilio" ? { direccion: "Calle 19 # 8-32, apto 501, Pereira" } : { referencia: "Mesa del ventanal" }),
    notas: "Sin cebolla, por favor",
    estado: "entregado",
    pago: "pagado",
    metodoPago: "nequi",
    items,
    base: "Nido Carbonara",
    proteina: "—",
    toppings: [],
    subtotal,
    impuesto: bruto - subtotal,
    impuestoPct,
    impuestoIncluido: true,
    bruto,
    descuentoFinal: 0,
    descuento: 0,
    domicilio,
    propina: 0,
    total: bruto + domicilio,
  };
}
