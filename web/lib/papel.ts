/**
 * EL PAPEL DEL COMPROBANTE, UNA SOLA VEZ.
 *
 * Lo que el dueño personaliza desde Ajustes → Comprobante. Lo que se puede cambiar vive
 * aquí; lo que NO (el título "COMPROBANTE DE CONSUMO" y la nota legal) también vive
 * aquí, como constantes, para que ningún dato guardado pueda pisarlo.
 *
 * Módulo PURO (sin DOM, sin React, sin next/*): lo importan la imagen de la térmica, el
 * texto ESC/POS, el WhatsApp y la pantalla, y lo prueban las suites de Node.
 */

import type { Ajustes } from "./menu";

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
