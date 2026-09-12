/**
 * ESC/POS: el idioma que hablan las térmicas, sin driver en medio.
 *
 * Todo lo que ha fallado hasta ahora ha fallado ENTRE el navegador y el papel:
 * @media print, @page, el driver de Windows, la cola, el destino del diálogo. Este
 * módulo produce los bytes que la impresora entiende directamente, para mandarlos
 * por Bluetooth o por puerto serie desde el propio Chrome. Si la impresora recibe
 * estos bytes, imprime; no hay nadie más en la conversación.
 *
 * Solo se usa el comando de raster `GS v 0`: un bitmap de 1 bit por punto, 8 puntos
 * por byte, bit más alto = punto más a la izquierda, 1 = quemar. Es el comando que
 * entienden Epson, Xprinter, Goojprt, Bixolon y los clones desde hace veinte años.
 *
 * Es un módulo PURO: recibe píxeles, devuelve bytes. Nada de DOM, nada de React,
 * para poder probarlo en Node con un bitmap sintético.
 */

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, como ImageData.data. Se considera negro todo píxel con R < 128. */
  data: Uint8ClampedArray | Uint8Array;
}

const ESC = 0x1b;
const GS = 0x1d;

/** Filas por bloque `GS v 0`. Algunos firmwares se atragantan con bloques enormes. */
const FILAS_POR_BLOQUE = 200;

/**
 * Empaqueta el bitmap en bloques `GS v 0`. Cada bloque lleva su propia cabecera
 * (ancho en bytes, alto en filas) y sus filas, de arriba abajo.
 */
export function rasterEscPos(bmp: Bitmap): Uint8Array {
  const bytesPorFila = Math.ceil(bmp.width / 8);
  const partes: Uint8Array[] = [];
  for (let y0 = 0; y0 < bmp.height; y0 += FILAS_POR_BLOQUE) {
    const filas = Math.min(FILAS_POR_BLOQUE, bmp.height - y0);
    const bloque = new Uint8Array(8 + bytesPorFila * filas);
    bloque.set([GS, 0x76, 0x30, 0x00, bytesPorFila & 0xff, bytesPorFila >> 8, filas & 0xff, filas >> 8], 0);
    let k = 8;
    for (let y = y0; y < y0 + filas; y++) {
      for (let bx = 0; bx < bytesPorFila; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= bmp.width) break;
          const i = (y * bmp.width + x) * 4;
          if (bmp.data[i] < 128) byte |= 0x80 >> bit;
        }
        bloque[k++] = byte;
      }
    }
    partes.push(bloque);
  }
  return concat(partes);
}

/**
 * El trabajo completo: inicializar, el bitmap, avance y corte.
 *
 *  · `ESC @`      — reinicia la impresora al estado por defecto (limpia lo que
 *                   hubiera quedado a medias de un trabajo anterior).
 *  · `GS v 0`     — el tiquete, en bloques.
 *  · `ESC d n`    — avanza `n` líneas: saca el final del papel de debajo del cabezal
 *                   y de la cuchilla, que está unos milímetros más arriba.
 *  · `GS V 66 0`  — corte parcial con avance (el que entienden Epson y los clones;
 *                   el corte total `GS V 0` lo ignoran algunos).
 */
export function trabajoEscPos(bmp: Bitmap, opts: { cortar?: boolean; avance?: number } = {}): Uint8Array {
  const avance = Math.max(0, Math.min(20, opts.avance ?? 4));
  const partes: Uint8Array[] = [
    new Uint8Array([ESC, 0x40]),
    rasterEscPos(bmp),
    new Uint8Array([ESC, 0x64, avance]),
  ];
  if (opts.cortar !== false) partes.push(new Uint8Array([GS, 0x56, 0x42, 0x00]));
  return concat(partes);
}

/**
 * Trocea el trabajo en paquetes del tamaño que admite el canal (BLE: 20-512 bytes).
 * Cada trozo es una COPIA con su propio ArrayBuffer (`slice`, no `subarray`): las
 * APIs de Bluetooth y Serial exigen un BufferSource sobre ArrayBuffer, y una vista
 * sobre un buffer compartido no les vale al tipado.
 */
export function trocear(bytes: Uint8Array, tam: number): Uint8Array<ArrayBuffer>[] {
  const out: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < bytes.length; i += tam) out.push(bytes.slice(i, Math.min(i + tam, bytes.length)));
  return out;
}

function concat(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let k = 0;
  for (const p of partes) {
    out.set(p, k);
    k += p.length;
  }
  return out;
}
