/**
 * EL ROLLO DE LA TÉRMICA: 58 u 80 mm, y lo que eso significa para el cabezal.
 *
 * Todo el camino de impresión se escribió para una de 80 mm (576 puntos, 48
 * columnas). La del local resultó ser una Star POS TP586 de 58 mm: su cabezal quema
 * 384 puntos en 48 mm útiles (8 puntos/mm a 203 dpi) y la letra A de ESC/POS (12
 * puntos de ancho) da 32 columnas. Un tiquete de 576 px en ese cabezal sale
 * recortado o encogido por el driver; uno de 48 columnas parte cada renglón en dos.
 *
 * El rollo es cosa del APARATO, no del negocio: se guarda por equipo (localStorage),
 * y el valor de fábrica es el del local. Módulo puro, sin DOM: lo usan las pruebas.
 */

export type Rollo = 58 | 80;

export interface DatosRollo {
  /** Ancho útil que quema el cabezal, en mm. */
  mm: number;
  /** Puntos por línea (mm × 8 a 203 dpi). */
  puntos: number;
  /** Columnas con la letra A de ESC/POS (12 puntos). */
  cols: number;
  /** El papel que hay que elegir en las preferencias del driver de Windows. */
  papelDriver: string;
}

export const ROLLOS: Record<Rollo, DatosRollo> = {
  58: { mm: 48, puntos: 384, cols: 32, papelDriver: "58 × 3276 mm (o 58 × 210)" },
  80: { mm: 72, puntos: 576, cols: 48, papelDriver: "80 × 3276 mm (o 80 × 297)" },
};

/** La térmica del local: Star POS TP586, 58 mm. */
export const ROLLO_POR_DEFECTO: Rollo = 58;
export const CLAVE_ROLLO = "pg_rollo";

export function rolloValido(v: unknown): Rollo {
  return v === "80" || v === 80 ? 80 : v === "58" || v === 58 ? 58 : ROLLO_POR_DEFECTO;
}
