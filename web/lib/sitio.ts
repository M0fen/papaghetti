/**
 * EL SITIO PÚBLICO EN MANOS DEL DUEÑO.
 *
 * Textos, enlaces y fotos que son del NEGOCIO y vivían escritos en el código. El diseño
 * (tipografías, colores, distribución, animaciones, la hebra) se queda fijo.
 *
 * Módulo PURO: lo importan el sitio, el panel y las suites de Node.
 */

/**
 * LA DIRECCIÓN DEL SITIO. Estaba escrita a mano en cuatro sitios (metadatos, datos para
 * Google, la foto que se comparte desde el juego y el acceso directo de la caja). Al
 * conectar un dominio propio se pone NEXT_PUBLIC_SITIO_URL en Vercel y se vuelve a
 * desplegar; sin ella, la de siempre.
 */
export const SITIO_URL = (() => {
  const crudo = (process.env.NEXT_PUBLIC_SITIO_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(crudo) ? crudo : "https://papaghetti.vercel.app";
})();
/** La dirección sin "https://", para escribirla en un papel o una imagen. */
export const SITIO_DOMINIO = SITIO_URL.replace(/^https?:\/\//, "");

/** Una foto del sitio subida por el dueño. */
export interface FotoSitio {
  url: string;
  ancho?: number;
  alto?: number;
}

/** Una reseña REAL copiada de una fuente pública. Nunca se inventan. */
export interface ResenaSitio {
  nombre: string;
  texto: string;
  estrellas: 1 | 2 | 3 | 4 | 5;
  fuente: "google" | "instagram" | "otra";
  enlace?: string;
}

/**
 * Lo que el dueño cambia del sitio (Ajustes.sitio). Solo se guarda lo que cambió: lo
 * ausente sale del texto de fábrica al leer.
 */
export interface AjustesSitio {
  portada?: { antetitulo?: string; frase?: string; pasos?: string[]; foto?: FotoSitio; fotoAlt?: string };
  historia?: { titulo?: string; parrafos?: string[]; cierre?: string };
  textos?: { domicilio?: string; pie?: string };
  ubicacion?: { ciudad?: string; departamento?: string; mapa?: string };
  contacto?: { mostrarTelefono?: boolean; mostrarWhatsapp?: boolean };
  domicilios?: { didi?: string };
  redes?: { mostrar?: boolean; tiktok?: string; facebook?: string };
  seo?: {
    titulo?: string;
    descripcion?: string;
    descripcionCompartir?: string;
    descripcionGoogle?: string;
    horarioGoogle?: string;
    fotoCompartir?: FotoSitio;
  };
  resenas?: { mostrar?: boolean; lista?: ResenaSitio[] };
}
