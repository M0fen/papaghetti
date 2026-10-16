/**
 * LAS FOTOS SUBIDAS: con qué nombre se guardan y cuáles se pueden servir.
 *
 * El almacén de Vercel donde vive el negocio es PRIVADO, y así debe ser: ahí está el
 * cerebro con los pedidos, los teléfonos de los clientes y la caja. Las fotos de la
 * carta, en cambio, son públicas por naturaleza. Se suben a ese mismo almacén, en
 * privado, y el sitio las entrega por una puerta propia (`app/foto/[...ruta]`), con la
 * misma dirección del sitio: `/foto/fotos/pollo-Xy7.jpg`.
 *
 * Esa puerta es pública a propósito, y por eso esta validación es estricta: si dejara
 * pasar cualquier ruta, `/foto/cerebro/catalog.json` le entregaría el negocio entero a
 * cualquiera que la escribiera en el navegador. Solo sale lo que está bajo `fotos/`,
 * con caracteres simples y una extensión de foto.
 *
 * Módulo PURO (sin next/*, sin red): lo usan la puerta, el cerebro y las suites de Node.
 */

/** La carpeta del almacén donde viven las fotos. Lo demás (cerebro/…) no sale nunca. */
export const CARPETA_FOTOS = "fotos/";
/** Cómo las pide el sitio: dirección propia, sin depender de qué almacén haya detrás. */
export const PREFIJO_FOTO = "/foto/";

/**
 * Los formatos que se sirven y el tipo con que se declaran. El tipo sale de AQUÍ, nunca
 * de lo que diga el almacén. Sin SVG ni GIF: un SVG puede llevar código, y servido desde
 * el mismo dominio del panel correría con la sesión del operario.
 */
const TIPOS = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
]);

/**
 * `fotos/` + carpetas opcionales (`pruebas/<rama>/` en los despliegues de prueba) + un
 * nombre con su extensión. Cada pedazo es solo letras, números, guion y guion bajo: así
 * no caben "..", ni barras dobles, ni "%", ni rutas absolutas, ni un segundo punto. El
 * sufijo al azar que pone el almacén (`-Xy7ZaB…`) cumple la misma regla.
 */
const RUTA_FOTO = /^fotos\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|avif)$/;
/** Ninguna foto propia pasa de unos 120 caracteres; esto solo frena abusos. */
const LARGO_MAX = 256;

/** Lo que la puerta lee del almacén y cómo lo declara. */
export interface RutaFoto {
  /** La ruta dentro del almacén ("fotos/…"). */
  pathname: string;
  /** El Content-Type con que se sirve. */
  tipo: string;
}

/**
 * LA PUERTA DE /foto/…: recibe lo que pidió el navegador (los pedazos de la ruta, o la
 * ruta entera) y devuelve qué leer del almacén y con qué tipo servirlo. `null` para todo
 * lo que no sea una foto: la puerta responde 404 sin preguntarle nada al almacén.
 */
export function rutaFoto(ruta: unknown): RutaFoto | null {
  const partes = Array.isArray(ruta) ? ruta : [ruta];
  if (!partes.length || !partes.every((p): p is string => typeof p === "string")) return null;
  const pathname = partes.join("/");
  if (pathname.length > LARGO_MAX) return null;
  const m = RUTA_FOTO.exec(pathname);
  const tipo = m ? TIPOS.get(m[1]) : undefined;
  return tipo ? { pathname, tipo } : null;
}

/**
 * Del tipo que trae una foto en texto (`data:image/<subtipo>;base64,…`) a la extensión y
 * el tipo con que se guarda. `null` si la puerta no la serviría.
 */
export function formatoFoto(subtipo: string): { ext: string; tipo: string } | null {
  const s = subtipo.toLowerCase();
  const ext = s === "jpeg" ? "jpg" : s;
  const tipo = TIPOS.get(ext);
  return tipo ? { ext, tipo } : null;
}

/** La dirección con que el sitio pide una foto del almacén. */
export const direccionFoto = (pathname: string): string => `${PREFIJO_FOTO}${pathname}`;
