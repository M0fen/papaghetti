/**
 * EL TIQUETE EN TEXTO ESC/POS: el camino rápido, y el que menos puede fallar.
 *
 * El tiquete-imagen (576 puntos de ancho, ~800 filas) pesa unos 60 KB. Por un
 * puerto COM a 9600 baudios —la velocidad de fábrica de casi todas las térmicas—
 * eso es cerca de UN MINUTO de transmisión; por Bluetooth de baja energía, con los
 * 20 bytes por escritura que el estándar garantiza, más. Y un raster tan largo es
 * justo lo que algunos firmwares baratos digieren mal.
 *
 * En texto, el mismo tiquete son 1–3 KB: sale en un par de segundos por cualquier
 * canal, con la letra propia de la impresora (que es nítida por definición) y sin
 * depender de que el firmware sepa pintar imágenes grandes. No lleva logo; a
 * cambio, lleva el nombre en letra doble. Es el modo por defecto del camino
 * directo, y la imagen queda como opción para quien tenga un canal rápido.
 *
 * SOLO ASCII. Las térmicas salen de fábrica con una página de códigos que cambia
 * de marca en marca (CP437, CP850, CP858, WPC1252…), y cada una pone un glifo
 * distinto en el byte de la "ñ". Antes que apostar, se quitan tildes y eñes
 * ("Nandu", "Gracias por venir!"): se lee igual y nunca sale basura.
 *
 * Es un módulo PURO: recibe el pedido, devuelve bytes. Nada de DOM, nada de React:
 * se prueba en Node con un pedido de mentira.
 */

import { formatCOP, lineasDe, metodoLabel, tipoLabel, type Ajustes, type Pedido } from "./menu";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Letra A (12 puntos de ancho) sobre 576 puntos = 48 columnas; sobre 384 = 32. */
export const COLUMNAS_80MM = 48;
export const COLUMNAS_58MM = 32;

export interface Renglon {
  texto: string;
  alinear?: "izq" | "centro" | "der";
  negrita?: boolean;
  /** 1 = normal · 2 = doble alto y doble ancho (la mitad de columnas) · "alto" = solo doble alto. */
  tamano?: 1 | 2 | "alto";
}

const PARTES = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function fechaCorta(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of PARTES.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/**
 * A ASCII puro. Primero los símbolos que tienen traducción sensata, luego se
 * descomponen las letras acentuadas (NFD) y se tira el acento, y lo que aún no
 * quepa en 0x20–0x7E se elimina en vez de convertirse en un byte que la impresora
 * pintaría como cualquier cosa.
 */
export function ascii(s: string): string {
  return s
    .replace(/N°/g, "No.")
    .replace(/°/g, "o")
    .replace(/×/g, "x")
    .replace(/[·•]/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/¡/g, "")
    .replace(/¿/g, "")
    .replace(/[   ]/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "")
    .replace(/\s+$/g, "");
}

/** Parte un texto en líneas de como mucho `cols` caracteres, por palabras. */
export function partir(s: string, cols: number): string[] {
  const palabras = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let act = "";
  for (const w of palabras) {
    if (!act) act = w;
    else if (act.length + 1 + w.length <= cols) act += " " + w;
    else {
      out.push(act);
      act = w;
    }
    while (act.length > cols) {
      out.push(act.slice(0, cols));
      act = act.slice(cols);
    }
  }
  if (act || !out.length) out.push(act);
  return out;
}

/**
 * Una fila "concepto ......... valor": el valor pegado a la derecha. Si el
 * concepto no cabe en la línea, baja y el valor va al final de su última línea, o
 * en una línea propia si tampoco cabe ahí.
 */
export function fila(izq: string, der: string, cols: number): string[] {
  izq = izq.trimEnd();
  der = der.trim();
  if (!der) return partir(izq, cols);
  if (izq.length + 1 + der.length <= cols) return [izq + " ".repeat(cols - izq.length - der.length) + der];
  const lineas = partir(izq, cols);
  const ultima = lineas[lineas.length - 1];
  if (ultima.length + 1 + der.length <= cols) {
    lineas[lineas.length - 1] = ultima + " ".repeat(cols - ultima.length - der.length) + der;
  } else {
    lineas.push(" ".repeat(Math.max(0, cols - der.length)) + der);
  }
  return lineas;
}

function pagoTexto(p: Pedido): string {
  if (p.pago === "devuelto") return "DEVUELTO";
  if (p.pago === "pagado") return p.metodoPago ? metodoLabel[p.metodoPago] : "Pagado";
  return "PENDIENTE";
}

/**
 * El tiquete, renglón a renglón, con la misma información y el mismo orden que la
 * versión en imagen: cabecera, número, datos del servicio, líneas, sumas, total,
 * pago y el aviso de que NO es factura. Sin propina, como en todo el sistema.
 */
export function armarTiquete(p: Pedido, a: Ajustes, cols: number = COLUMNAS_80MM): Renglon[] {
  const R: Renglon[] = [];
  const sep = () => R.push({ texto: "-".repeat(cols) });
  const anulado = p.estado === "cancelado";
  const devuelto = p.pago === "devuelto";
  const consumo = p.subtotal - (p.descuento ?? 0);
  const total = consumo + (p.impuesto ?? 0) + (p.domicilio ?? 0);

  R.push({ texto: (a.negocio || "Papaghetti").toUpperCase(), alinear: "centro", negrita: true, tamano: 2 });
  const datos = [
    a.razonSocial,
    a.nit ? `NIT ${a.nit}` : "",
    a.direccion,
    a.telefonoLocal || a.whatsapp ? `Tel. ${a.telefonoLocal || a.whatsapp}` : "",
  ];
  for (const d of datos) if (d) R.push({ texto: d, alinear: "centro" });

  /* UN PEDIDO CANCELADO NO PUEDE SALIR COMO UN CONSUMO VÁLIDO: el aviso va arriba,
     en letra doble, antes que cualquier número. */
  if (anulado) {
    R.push({ texto: "" });
    R.push({ texto: devuelto ? "*** DINERO DEVUELTO ***" : "*** PEDIDO ANULADO ***", alinear: "centro", negrita: true, tamano: 2 });
    R.push({
      texto: devuelto
        ? `Se devolvieron ${formatCOP(p.devolucion?.monto ?? p.total)}${p.devolucion?.motivo ? ` - ${p.devolucion.motivo}` : ""}. Este pedido ya no es un consumo.`
        : `Este pedido se cancelo${p.motivoCancelacion ? `: ${p.motivoCancelacion}` : ""}. No corresponde a un consumo y no debe cobrarse.`,
      alinear: "centro",
    });
  }

  sep();
  R.push({ texto: "COMPROBANTE DE CONSUMO", alinear: "centro", negrita: true });
  R.push({ texto: `N° ${p.consecutivo ?? p.id}`, alinear: "centro", negrita: true, tamano: "alto" });
  sep();
  R.push({ texto: `Fecha: ${fechaCorta(p.creadoEn)}` });
  R.push({ texto: `Servicio: ${tipoLabel[p.tipo]}` });
  if (p.referencia) R.push({ texto: `Ubicacion: ${p.referencia}` });
  if (p.cliente) R.push({ texto: `Cliente: ${p.cliente}` });
  sep();

  for (const l of lineasDe(p)) {
    const nombre = `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`;
    for (const t of fila(ascii(nombre), formatCOP(l.precio * l.cantidad), cols)) R.push({ texto: t });
    if (l.detalle) for (const t of partir(ascii(l.detalle), cols - 3)) R.push({ texto: `   ${t}` });
  }
  if (p.notas) {
    R.push({ texto: "" });
    for (const t of partir(ascii(`Nota: ${p.notas}`), cols)) R.push({ texto: t });
  }
  sep();

  const sumas: [string, number][] = [
    ["Consumo", p.subtotal],
    ...(p.descuento ? ([["Descuento", -p.descuento]] as [string, number][]) : []),
    ...(p.impuesto ? ([[`Impuesto (${a.impuestoPct}%)`, p.impuesto]] as [string, number][]) : []),
    ...(p.domicilio ? ([["Domicilio", p.domicilio]] as [string, number][]) : []),
  ];
  for (const [k, v] of sumas) for (const t of fila(k, formatCOP(v), cols)) R.push({ texto: t });
  /* El total en letra doble ocupa el doble: se compone a la mitad de columnas. */
  for (const t of fila("TOTAL", formatCOP(total), Math.floor(cols / 2))) R.push({ texto: t, negrita: true, tamano: 2 });
  R.push({ texto: `Pago: ${pagoTexto(p)}`, negrita: true });
  sep();
  R.push({
    texto: "Documento interno de control. No es factura electronica de venta ni documento equivalente P.O.S.",
    alinear: "centro",
  });
  R.push({ texto: "Gracias por venir!", alinear: "centro", negrita: true });
  return R;
}

/**
 * De renglones a bytes. Solo se emite un comando cuando el estilo CAMBIA respecto
 * al renglón anterior (menos bytes, menos que pueda malinterpretar un firmware), y
 * al final se deja la impresora como estaba: alineación izquierda, sin negrita,
 * tamaño normal. Los renglones que no quepan se parten aquí, con el ancho efectivo
 * de su tamaño; los que ya vienen compuestos a medida pasan intactos (partir()
 * los reharía y se comería el relleno de las columnas).
 *
 *  · `ESC a n`  alineación (0 izq, 1 centro, 2 der)
 *  · `ESC E n`  negrita
 *  · `GS ! n`   tamaño (0x00 normal, 0x11 doble alto y ancho, 0x01 doble alto)
 *  · `ESC d n`  avance de líneas, para sacar el final de debajo de la cuchilla
 *  · `GS V 66 0` corte parcial con avance
 */
export function codificarRenglones(
  renglones: Renglon[],
  cols: number = COLUMNAS_80MM,
  opts: { cortar?: boolean; avance?: number } = {},
): Uint8Array {
  const out: number[] = [ESC, 0x40];
  let alinear: NonNullable<Renglon["alinear"]> = "izq";
  let negrita = false;
  let tamano: NonNullable<Renglon["tamano"]> = 1;
  for (const r of renglones) {
    const al = r.alinear ?? "izq";
    if (al !== alinear) {
      out.push(ESC, 0x61, al === "izq" ? 0 : al === "centro" ? 1 : 2);
      alinear = al;
    }
    const ng = Boolean(r.negrita);
    if (ng !== negrita) {
      out.push(ESC, 0x45, ng ? 1 : 0);
      negrita = ng;
    }
    const tm = r.tamano ?? 1;
    if (tm !== tamano) {
      out.push(GS, 0x21, tm === 2 ? 0x11 : tm === "alto" ? 0x01 : 0x00);
      tamano = tm;
    }
    const efectivas = tm === 2 ? Math.floor(cols / 2) : cols;
    const texto = ascii(r.texto);
    const lineas = texto.length > efectivas ? partir(texto, efectivas) : [texto];
    for (const l of lineas) {
      for (let i = 0; i < l.length; i++) out.push(l.charCodeAt(i));
      out.push(LF);
    }
  }
  out.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0);
  out.push(ESC, 0x64, Math.max(0, Math.min(20, opts.avance ?? 4)));
  if (opts.cortar !== false) out.push(GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(out);
}

/** El tiquete de un pedido, listo para mandar. */
export function tiqueteEscPos(
  p: Pedido,
  a: Ajustes,
  opts: { cols?: number; cortar?: boolean; avance?: number } = {},
): Uint8Array {
  const cols = opts.cols ?? COLUMNAS_80MM;
  return codificarRenglones(armarTiquete(p, a, cols), cols, opts);
}

/**
 * Una prueba de 200 bytes para saber si el CANAL funciona antes de mandar nada
 * más: si esto sale, la impresora recibe; si salen símbolos raros, es el baudio;
 * si no sale nada, es el puerto o el aparato. La regla de dígitos dice cuántas
 * columnas tiene el papel de verdad (48 en 80 mm, 32 en 58 mm).
 */
export function pruebaTextoEscPos(cols: number = COLUMNAS_80MM): Uint8Array {
  const regla = Array.from({ length: cols }, (_, i) => String(i % 10)).join("");
  return codificarRenglones(
    [
      { texto: "PAPAGHETTI", alinear: "centro", negrita: true, tamano: 2 },
      { texto: "Prueba de impresora", alinear: "centro" },
      { texto: "-".repeat(cols) },
      { texto: "Si lees esto, el camino directo funciona." },
      { texto: "Cada digito es una columna:" },
      { texto: regla },
      { texto: "Letra doble:", tamano: 2 },
      ...fila("TOTAL", formatCOP(12345), Math.floor(cols / 2)).map((t) => ({ texto: t, negrita: true, tamano: 2 as const })),
      { texto: "-".repeat(cols) },
      { texto: "Simbolos raros = baudio equivocado.", alinear: "centro" },
    ],
    cols,
  );
}
