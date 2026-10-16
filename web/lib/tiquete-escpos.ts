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
 * EL CONTENIDO NO SE DECIDE AQUÍ: sale de `papelDe` (lib/papel.ts), el mismo que
 * dibujan la imagen, la pantalla y el WhatsApp. Aquí solo se compone en columnas.
 *
 * Es un módulo PURO: recibe el pedido, devuelve bytes. Nada de DOM, nada de React:
 * se prueba en Node con un pedido de mentira.
 */

import { formatCOP, type Pedido } from "./menu";
import { papelDe, type AjustesPapel, type Papel } from "./papel";

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

/**
 * A ASCII puro. Primero los símbolos que tienen traducción sensata, luego se
 * descomponen las letras acentuadas (NFD) y se tira el acento, y lo que aún no
 * quepa en 0x20–0x7E se elimina en vez de convertirse en un byte que la impresora
 * pintaría como cualquier cosa.
 *
 * Los ordinales van antes que nada: "Cra 7 Nº 20-15, 2º piso" salía "Cra 7 N 20-15, 2
 * piso" (solo se traducía el signo de grado, no el ordinal, que es el que se teclea en
 * una dirección). Y un tabulador es un espacio: borrarlo pegaba las palabras.
 *
 * Los espacios de DENTRO no se tocan: el relleno de las columnas (`fila`) ya viene
 * calculado y colapsarlo descuadraría los precios.
 */
export function ascii(s: string): string {
  return s
    .replace(/([Nn])\.?[°º]/g, "$1o.")
    .replace(/[°º]/g, "o")
    .replace(/ª/g, "a")
    .replace(/×/g, "x")
    .replace(/[·•]/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/¡/g, "")
    .replace(/¿/g, "")
    .replace(/[\t\u{A0}\u{2007}\u{202F}]/gu, " ")
    .normalize("NFD")
    .replace(/[\u{300}-\u{36F}]/gu, "")
    .replace(/[^\x20-\x7e\n]/g, "")
    .replace(/\s+$/g, "");
}

/**
 * Cómo sale en la impresora de texto un renglón centrado: en ASCII, sin espacios de
 * más y sin espacio al principio. Quitar un emoji dejaba "  Hecho con amor" y la
 * impresora centraba también ese espacio, así que la línea se veía corrida.
 */
export const comoSaleEnTexto = (s: string): string =>
  ascii(s)
    .replace(/ {2,}/g, " ")
    .trim();

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

/**
 * El comprobante, renglón a renglón, con la misma información y el mismo orden que
 * la imagen y la pantalla: el sello de anulado (si lo hay) antes que nada, cabecera,
 * título y número, datos del servicio, líneas, sumas, total, pago y el pie con el
 * aviso de que este papel no es un documento fiscal. Sin propina, como en todo el
 * sistema.
 */
export function renglonesDePapel(papel: Papel, cols: number = COLUMNAS_80MM): Renglon[] {
  const R: Renglon[] = [];
  const sep = () => R.push({ texto: "-".repeat(cols) });
  const centro = (texto: string, estilo: Omit<Renglon, "texto" | "alinear"> = {}) =>
    R.push({ texto, alinear: "centro", ...estilo });

  /* UN PEDIDO CANCELADO NO PUEDE SALIR COMO UN CONSUMO VÁLIDO: el aviso va arriba,
     en letra doble, antes que cualquier número (y antes que el nombre, como en la
     imagen y en la pantalla). */
  if (papel.sello) {
    /* Con los asteriscos no cabe en las 16 columnas de letra doble de la TP586 y se
       partía en "*** PEDIDO" / "ANULADO ***": ahí va sin ellos, en una sola línea. */
    const marcado = `*** ${papel.sello.titulo} ***`;
    centro(marcado.length <= Math.floor(cols / 2) ? marcado : papel.sello.titulo, { negrita: true, tamano: 2 });
    centro(papel.sello.detalle);
    R.push({ texto: "" });
  }

  centro(papel.cabecera.nombre.toUpperCase(), { negrita: true, tamano: 2 });
  for (const d of papel.cabecera.datos) centro(d);

  sep();
  centro(papel.titulo, { negrita: true });
  centro(papel.numero, { negrita: true, tamano: "alto" });
  sep();
  R.push({ texto: `Fecha: ${papel.fecha}` });
  R.push({ texto: `Servicio: ${papel.servicio}` });
  for (const d of papel.cliente) R.push({ texto: `${d.k}: ${d.v}` });
  sep();

  /* Las filas con precio se componen YA en ASCII: "…" pasa a "..." y "×" a "x", y el
     relleno hasta la columna del precio se tiene que contar sobre lo que se imprime. */
  for (const l of papel.cuenta.lineas) {
    const nombre = `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`;
    for (const t of fila(ascii(nombre), formatCOP(l.importe), cols)) R.push({ texto: t });
    if (l.detalle) for (const t of partir(ascii(l.detalle), cols - 3)) R.push({ texto: `   ${t}` });
  }
  if (papel.nota) {
    R.push({ texto: "" });
    for (const t of partir(ascii(`Nota: ${papel.nota}`), cols)) R.push({ texto: t });
  }
  sep();

  for (const [k, v] of papel.cuenta.sumas) for (const t of fila(ascii(k), formatCOP(v), cols)) R.push({ texto: t });
  /* El total en letra doble ocupa el doble: se compone a la mitad de columnas. */
  for (const t of fila("TOTAL", formatCOP(papel.cuenta.total), Math.floor(cols / 2))) {
    R.push({ texto: t, negrita: true, tamano: 2 });
  }
  if (papel.cuenta.nota) centro(papel.cuenta.nota);
  R.push({ texto: `Pago: ${papel.pago}`, negrita: true });
  sep();
  centro(papel.pie.legal);
  for (const e of papel.pie.extra) centro(e);
  centro(papel.pie.cierre, { negrita: true });
  return R;
}

/** El tiquete de un pedido, renglón a renglón (ver `renglonesDePapel`). */
export function armarTiquete(p: Pedido, a: AjustesPapel = {}, cols: number = COLUMNAS_80MM): Renglon[] {
  return renglonesDePapel(papelDe(p, a), cols);
}

/** Una línea tal como la recibe la impresora: ya en ASCII y a lo ancho que cabe. */
export interface LineaImpresa {
  texto: string;
  alinear: NonNullable<Renglon["alinear"]>;
  negrita: boolean;
  tamano: NonNullable<Renglon["tamano"]>;
}

/**
 * De renglones a las líneas que de verdad salen: en ASCII, partidas al ancho
 * efectivo de su tamaño (la mitad de columnas en letra doble). Los renglones que ya
 * vienen compuestos a medida pasan intactos (partir() los reharía y se comería el
 * relleno de las columnas). Lo usan los bytes y la vista previa de Ajustes, así que lo
 * que se ve allá es exactamente lo que imprime la impresora.
 */
export function lineasImpresas(renglones: Renglon[], cols: number = COLUMNAS_80MM): LineaImpresa[] {
  const out: LineaImpresa[] = [];
  for (const r of renglones) {
    const alinear = r.alinear ?? "izq";
    const tamano = r.tamano ?? 1;
    const efectivas = tamano === 2 ? Math.floor(cols / 2) : cols;
    /* Un salto de línea suelto no se manda crudo: la impresora lo obedecería, pero el
       ancho de la línea ya se habría medido sin él. Cada trozo es su propia línea. */
    for (const trozo of ascii(r.texto).split("\n")) {
      const texto = alinear === "centro" ? comoSaleEnTexto(trozo) : trozo;
      const lineas = texto.length > efectivas ? partir(texto, efectivas) : [texto];
      for (const l of lineas) out.push({ texto: l, alinear, negrita: Boolean(r.negrita), tamano });
    }
  }
  return out;
}

/**
 * De renglones a bytes. Solo se emite un comando cuando el estilo CAMBIA respecto
 * a la línea anterior (menos bytes, menos que pueda malinterpretar un firmware), y
 * al final se deja la impresora como estaba: alineación izquierda, sin negrita,
 * tamaño normal.
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
  let alinear: LineaImpresa["alinear"] = "izq";
  let negrita = false;
  let tamano: LineaImpresa["tamano"] = 1;
  for (const l of lineasImpresas(renglones, cols)) {
    if (l.alinear !== alinear) {
      out.push(ESC, 0x61, l.alinear === "izq" ? 0 : l.alinear === "centro" ? 1 : 2);
      alinear = l.alinear;
    }
    if (l.negrita !== negrita) {
      out.push(ESC, 0x45, l.negrita ? 1 : 0);
      negrita = l.negrita;
    }
    if (l.tamano !== tamano) {
      out.push(GS, 0x21, l.tamano === 2 ? 0x11 : l.tamano === "alto" ? 0x01 : 0x00);
      tamano = l.tamano;
    }
    for (let i = 0; i < l.texto.length; i++) out.push(l.texto.charCodeAt(i));
    out.push(LF);
  }
  out.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0);
  out.push(ESC, 0x64, Math.max(0, Math.min(20, opts.avance ?? 4)));
  if (opts.cortar !== false) out.push(GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(out);
}

/**
 * El tiquete de un pedido, listo para mandar. Las 48 columnas por defecto son las de
 * siempre (quien lo llama con el rollo del equipo pasa `cols`: 32 en la TP586).
 */
export function tiqueteEscPos(
  p: Pedido,
  a: AjustesPapel = {},
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
