/**
 * EL SITIO PÚBLICO EN MANOS DEL DUEÑO.
 *
 * Textos, enlaces y fotos que son del NEGOCIO y vivían escritos en el código. El diseño
 * (tipografías, colores, distribución, animaciones, la hebra) se queda fijo.
 *
 * Módulo PURO: lo importan el sitio, el panel y las suites de Node.
 *
 * Tres reglas sostienen todo lo de aquí:
 *  · Se guarda SOLO lo que el dueño cambió. Lo ausente sale de SITIO_FABRICA al leer, así
 *    que un texto corregido en el código le llega también a quien nunca tocó ese campo.
 *  · Un texto en blanco vuelve al de fábrica: el sitio nunca pinta un título vacío.
 *  · Un enlace que no sea https:// no existe. El de Rappi se guardaba tal cual y uno
 *    pegado sin protocolo («rappi.com.co/…») era un enlace RELATIVO: el cliente tocaba
 *    el botón y caía en una página 404 de nuestro propio sitio.
 */
import type { Ajustes } from "./menu";
import { soloDigitos, whatsappValido } from "./menu";

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

/* ══════════════════════════ LO QUE SE GUARDA (Ajustes.sitio) ══════════════════════════ */

/** Una foto del sitio subida por el dueño. */
export interface FotoSitio {
  url: string;
  ancho?: number;
  alto?: number;
  /**
   * Qué se ve en la foto (para Google y para quien navega con lector de pantalla). Va
   * DENTRO de la foto y no al lado: las fotos no viajan en la pila de Deshacer (ver
   * RUTAS_IMAGEN_AJUSTES en catalog.ts), y un texto suelto que sí se deshiciera acabaría
   * describiendo otra foto.
   */
  alt?: string;
}

/** De dónde se copió una reseña. Sin fuente no entra: así se ve que no es inventada. */
export type FuenteResena = "google" | "instagram" | "otra";
export const FUENTES_RESENA: FuenteResena[] = ["google", "instagram", "otra"];
export const fuenteResenaLabel: Record<FuenteResena, string> = {
  google: "Google",
  instagram: "Instagram",
  otra: "Reseña pública",
};

/** Una reseña REAL copiada de una fuente pública. Nunca se inventan. */
export interface ResenaSitio {
  nombre: string;
  texto: string;
  estrellas: 1 | 2 | 3 | 4 | 5;
  fuente: FuenteResena;
  enlace?: string;
}

/**
 * Lo que el dueño cambia del sitio (Ajustes.sitio). Solo se guarda lo que cambió: lo
 * ausente sale del texto de fábrica al leer. Los datos del negocio que también salen en
 * el comprobante (WhatsApp, dirección, horarios, teléfono, Instagram, Rappi) siguen
 * siendo los campos de siempre de Ajustes: una sola fuente para el sitio y el papel.
 */
export interface AjustesSitio {
  portada?: { antetitulo?: string; frase?: string; pasos?: string[]; foto?: FotoSitio };
  historia?: { titulo?: string; parrafos?: string[]; cierre?: string };
  textos?: { domicilio?: string; pie?: string };
  /** `mapa` vacío = el botón «Cómo llegar» busca la dirección en Google Maps, como siempre. */
  ubicacion?: { ciudad?: string; departamento?: string; mapa?: string };
  /** El teléfono es `Ajustes.telefonoLocal` (el del comprobante): aquí solo si se muestra. */
  contacto?: { mostrarTelefono?: boolean };
  domicilios?: { didi?: string };
  /** Instagram sigue en `Ajustes.instagram`; `mostrar` pone los enlaces en el pie. */
  redes?: { mostrar?: boolean; tiktok?: string; facebook?: string };
  seo?: {
    titulo?: string;
    descripcion?: string;
    descripcionCompartir?: string;
    descripcionGoogle?: string;
    /** Lo que escribió el dueño («Lun a Dom 12:00-22:00»); se traduce al leer. */
    horarioGoogle?: string;
    fotoCompartir?: FotoSitio;
  };
  resenas?: { mostrar?: boolean; lista?: ResenaSitio[] };
}

/* ══════════════════════════════════ DE FÁBRICA ══════════════════════════════════ */

/**
 * LOS TEXTOS DE HOY, LETRA POR LETRA. Con el sitio sin tocar, la página tiene que salir
 * idéntica a como estaba escrita en los componentes. Ojo con los caracteres que no se
 * ven: «·» es U+00B7, «—» U+2014, «…» U+2026, y la frase de portada lleva DOS espacios
 * de no separación (U+00A0) para que «así se arma» no se parta en dos renglones.
 */
export const SITIO_FABRICA = {
  portada: {
    antetitulo: "Pereira · Un delicioso enredo",
    frase: "Papa criolla, pasta y tu antojo: así se arma un enredo.",
    pasos: ["criolla · francesa · spaghetti", "chicharrón · res · pollo", "maicitos · piña · queso"],
    fotoAlt:
      "Enredo Papaghetti: nido de spaghetti con papa criolla dorada y chicharrón crocante, humeando en su caja kraft",
  },
  historia: {
    titulo: "Todo empezó por un enredo",
    parrafos: [
      "Una hebra de spaghetti no sabe de líneas rectas. Se enreda, se mezcla, se junta con lo que encuentra… y ahí está la gracia.",
      "Papaghetti nace en Pereira uniendo dos amores: la papa criolla dorada del Eje Cafetero y la pasta que a todos nos gusta. Comfort food premium, hecha para verse hermosa y para armarse a tu gusto.",
    ],
    cierre: "El enredo es la gracia.",
  },
  textos: {
    domicilio: "Arma tu enredo y te lo llevamos calientico.",
    pie: "Enrédate rico. Comfort food premium para armar a tu gusto, en Pereira.",
  },
  ubicacion: { ciudad: "Pereira", departamento: "Risaralda" },
  seo: {
    titulo: "Papaghetti — Un delicioso enredo",
    descripcion:
      "Arma tu enredo: papa criolla, papa francesa o spaghetti + proteína + toppings. Comfort food premium para armar a tu gusto, en Pereira.",
    descripcionCompartir: "Arma tu enredo. Papa + pasta + tu toque. Pereira.",
    descripcionGoogle: "Comfort food premium para armar a tu gusto: base, proteína y toppings en una caja.",
    fotoCompartir: { url: "/og.jpg", ancho: 1200, alto: 630 },
  },
} as const;

/**
 * TOPES DE LARGO. Caben todos los de fábrica con holgura y protegen el diseño: la portada
 * ocupa la pantalla entera del teléfono, y una frase de 300 letras la desbordaba. Las
 * descripciones siguen lo que Google y WhatsApp muestran antes de cortar.
 */
export const TOPES = {
  antetitulo: 40,
  frase: 90,
  paso: 32,
  fotoAlt: 160,
  titulo: 40,
  parrafo: 320,
  parrafos: 4,
  cierre: 40,
  domicilio: 80,
  pie: 120,
  ciudad: 40,
  departamento: 40,
  seoTitulo: 60,
  seoDescripcion: 160,
  seoCompartir: 110,
  seoGoogle: 200,
  horarioGoogle: 200,
  enlace: 500,
  horarios: 80,
  direccion: 120,
  telefono: 24,
  resenaNombre: 40,
  resenaTexto: 280,
  resenas: 6,
} as const;

/**
 * El tope de una foto del sitio, en caracteres del data URL que manda el navegador. Una
 * acción de Next acepta como mucho 1 MB por envío (formulario entero): con esto la foto,
 * su texto y el resto caben de sobra. El navegador la recomprime hasta quedar debajo.
 */
export const LIMITE_FOTO_SITIO = 700_000;
/** Hasta dónde la deja el navegador: deja aire para los demás campos del envío. */
export const META_FOTO_SITIO = 640_000;
/** Recortes de las fotos: la de portada es un retrato 4:5 (como la de fábrica, 928×1152)
 *  y la de compartir es el tamaño que piden WhatsApp, Facebook y X. */
export const RECORTE_PORTADA = { ancho: 960, alto: 1200 } as const;
export const RECORTE_COMPARTIR = { ancho: 1200, alto: 630 } as const;

/* ══════════════════════════════ LIMPIAR Y VALIDAR ══════════════════════════════ */

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Quita los caracteres de control (saltos, tabuladores y los invisibles de 0x00–0x1F). */
const sinControl = (s: string): string =>
  Array.from(s, (ch) => {
    const c = ch.charCodeAt(0);
    return c < 32 || c === 127 ? " " : ch;
  }).join("");

/**
 * Una línea de texto limpia: sin saltos ni caracteres de control y con espacios simples.
 * Los espacios de no separación (U+00A0) se RESPETAN: solo se juntan los espacios
 * normales, y la comparación con el texto de fábrica es exacta.
 */
export function linea(v: unknown): string {
  if (typeof v !== "string") return "";
  return sinControl(v).replace(/ {2,}/g, " ").trim();
}

/** Corta por letras (no por mitades de un emoji) al tope dado. */
const cortar = (s: string, tope: number): string => {
  const letras = Array.from(s);
  return letras.length > tope ? letras.slice(0, tope).join("").trimEnd() : s;
};

/** Al LEER: el texto guardado, limpio y dentro de su tope (red de seguridad). */
const textoDe = (v: unknown, tope: number): string => cortar(linea(v), tope);

/**
 * Los párrafos de un área de texto: se separan con una línea en blanco. Dentro de un
 * párrafo un salto simple vale un espacio, que es como lo pinta el navegador igual.
 */
export function parrafosDe(v: unknown): string[] {
  if (typeof v !== "string") return [];
  return v
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t ]*\n/)
    .map(linea)
    .filter(Boolean);
}

/** Un enlace que se puede poner en un botón del sitio: https y con dominio, o nada (""). */
export function enlaceHttps(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s || s.length > TOPES.enlace) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password) return "";
    if (!/\.[a-z0-9-]{2,}$/i.test(u.hostname)) return "";
    return u.href;
  } catch {
    return "";
  }
}

/**
 * Lo que el dueño pega en una casilla de enlace, convertido en https. Se perdona lo de
 * siempre: copiarlo sin «https://» o con «http://» (Rappi, DiDi y Google sirven todo por
 * https). `""` = casilla vacía; `null` = eso no es un enlace que sirva.
 */
export function leerEnlace(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  let c = s;
  if (/^http:\/\//i.test(c)) c = "https://" + c.slice(7);
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(c)) c = "https://" + c.replace(/^\/+/, "");
  return enlaceHttps(c) || null;
}

/** ¿El enlace es de la plataforma que dice la casilla? Solo para avisar, nunca para rechazar. */
export function pareceDe(url: string, de: "rappi" | "didi" | "mapa"): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (de === "rappi") return host.includes("rappi");
  if (de === "didi") return host.includes("didi");
  return /(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)goo\.gl$/.test(host);
}

const RESERVADAS_IG = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct"]);
/**
 * El usuario de Instagram, venga como «@usuario», «usuario» o el enlace del perfil. Antes
 * solo se le quitaba la @: un enlace pegado entero terminaba en los datos para Google
 * como «https://instagram.com/https://…». `""` = sin Instagram; `null` = no es un usuario.
 */
export function usuarioInstagram(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  let u = s;
  const enlace = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)/i);
  if (enlace) u = enlace[1];
  else if (/[/:]/.test(s)) return null; // un enlace de otra parte
  u = u.replace(/^@+/, "");
  if (RESERVADAS_IG.has(u.toLowerCase())) return null; // una publicación, no un perfil
  return /^[a-z0-9._]{1,30}$/i.test(u) ? u.toLowerCase() : null;
}

/** El perfil de TikTok como enlace («@usuario», «usuario» o el enlace, también los cortos). */
export function enlaceTiktok(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  const perfil = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\/@([a-z0-9._]{2,24})\/?(?:[?#].*)?$/i);
  if (perfil) return `https://www.tiktok.com/@${perfil[1].toLowerCase()}`;
  const usuario = s.match(/^@?([a-z0-9._]{2,24})$/i);
  if (usuario && !/\.(com|co|me|net)$/i.test(usuario[1])) return `https://www.tiktok.com/@${usuario[1].toLowerCase()}`;
  const url = leerEnlace(s);
  return url && /(^|\.)tiktok\.com$/i.test(new URL(url).hostname) && new URL(url).pathname.length > 1 ? url : null;
}

/** La página de Facebook como enlace («pagina» o el enlace de la página). */
export function enlaceFacebook(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  const usuario = s.match(/^@?([a-z0-9.]{5,50})$/i);
  if (usuario && !/\.(com|co|me|net)$/i.test(usuario[1])) return `https://www.facebook.com/${usuario[1]}`;
  const url = leerEnlace(s);
  if (!url) return null;
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const esFb = /(^|\.)facebook\.com$/.test(host) || host === "fb.com" || host === "fb.me";
  return esFb && (u.pathname.length > 1 || u.search) ? url : null;
}

/**
 * El WhatsApp como lo pide wa.me: solo dígitos y con indicativo. Un celular colombiano
 * escrito con sus 10 dígitos (3xx…) recibe el 57 delante: sin él, wa.me abría el chat de
 * un número de otro país.
 */
export function whatsappDe(v: unknown): string {
  const d = soloDigitos(typeof v === "string" ? v : "");
  return d.length === 10 && d.startsWith("3") ? `57${d}` : d;
}

/** El teléfono para un enlace «tel:». Un número colombiano de 10 dígitos lleva el +57. */
export function telHref(t: string): string {
  const d = soloDigitos(t);
  if (!d) return "";
  if (t.trim().startsWith("+")) return `tel:+${d}`;
  if (d.length === 10) return `tel:+57${d}`;
  if (d.length === 12 && d.startsWith("57")) return `tel:+${d}`;
  return `tel:${d}`;
}

/* ── Horario para Google: lo que escribe el dueño → la notación de schema.org ── */
const DIA: Record<string, string> = {
  lu: "Mo", lun: "Mo", lunes: "Mo", mo: "Mo", mon: "Mo",
  ma: "Tu", mar: "Tu", martes: "Tu", tu: "Tu", tue: "Tu",
  mi: "We", mie: "We", miercoles: "We", we: "We", wed: "We",
  ju: "Th", jue: "Th", jueves: "Th", th: "Th", thu: "Th",
  vi: "Fr", vie: "Fr", viernes: "Fr", fr: "Fr", fri: "Fr",
  sa: "Sa", sab: "Sa", sabado: "Sa", sat: "Sa",
  do: "Su", dom: "Su", domingo: "Su", su: "Su", sun: "Su",
};
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const dos = (n: number) => String(n).padStart(2, "0");

function diasDe(txt: string): string | null {
  const partes = txt.split(/\s*,\s*|\s+y\s+/).filter(Boolean);
  if (!partes.length) return null;
  const out: string[] = [];
  for (const p of partes) {
    const rango = p.match(/^([a-z]+)\.?\s*(?:-|–|a|al|hasta)\s*([a-z]+)\.?$/);
    if (rango && DIA[rango[1]] && DIA[rango[2]]) {
      out.push(`${DIA[rango[1]]}-${DIA[rango[2]]}`);
      continue;
    }
    const d = DIA[p.replace(/\.$/, "")];
    if (!d) return null;
    out.push(d);
  }
  return out.join(",");
}

function horaDe(h: string, m?: string): string | null {
  const hh = Number(h);
  const mm = m === undefined ? 0 : Number(m);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return null;
  return `${dos(hh)}:${dos(mm)}`;
}

/**
 * EL HORARIO QUE ENTIENDE GOOGLE. El horario del sitio es texto libre («Lun a Dom · 12:00 m
 * – 10:00 pm») y así se le mandaba a Google, que solo entiende «Mo-Su 12:00-22:00». Aquí
 * el dueño escribe en español, un renglón por horario, y sale la notación de schema.org.
 * Un renglón que no se entiende devuelve `error` diciendo cuál.
 */
export function horarioGoogleDe(v: unknown): { specs: string[]; error?: string } {
  const lineas = (typeof v === "string" ? v : "")
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length > 7) return { specs: [], error: "Horario para Google: máximo 7 renglones." };
  const specs: string[] = [];
  for (const l of lineas) {
    const m = sinTildes(l.toLowerCase()).match(
      /^(.+?)\s+(\d{1,2})(?:[:.h](\d{2}))?\s*(?:-|–|a|al|hasta)\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(?:h|hrs?)?$/,
    );
    const dias = m ? diasDe(m[1].trim()) : null;
    const abre = m ? horaDe(m[2], m[3]) : null;
    const cierra = m ? horaDe(m[4], m[5]) : null;
    if (!dias || !abre || !cierra) {
      return { specs: [], error: `Horario para Google: «${l}» no se entiende. Escríbelo así: Lun a Dom 12:00-22:00` };
    }
    specs.push(`${dias} ${abre}-${cierra}`);
  }
  return { specs };
}

/** Una foto guardada que se puede pintar, o null. Acepta lo que deja guardarFoto: una
 *  dirección https, una ruta propia (/…) o, en desarrollo, la imagen en texto. */
export function fotoDe(v: unknown): FotoSitio | null {
  if (!esObjeto(v) || typeof v.url !== "string") return null;
  const url = v.url.trim();
  const ok =
    /^data:image\/(jpeg|png|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(url) ||
    /^https:\/\/[^\s"'<>]+$/i.test(url) ||
    /^\/(?!\/)[^\s"'<>]*$/.test(url);
  if (!ok) return null;
  const medida = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 10_000 ? n : undefined);
  const alt = textoDe(v.alt, TOPES.fotoAlt);
  return {
    url,
    ...(medida(v.ancho) ? { ancho: medida(v.ancho) } : {}),
    ...(medida(v.alto) ? { alto: medida(v.alto) } : {}),
    ...(alt ? { alt } : {}),
  };
}

/** Una reseña guardada que se puede mostrar, o null si le falta algo. */
export function resenaDe(v: unknown): ResenaSitio | null {
  if (!esObjeto(v)) return null;
  const nombre = textoDe(v.nombre, TOPES.resenaNombre);
  const texto = textoDe(v.texto, TOPES.resenaTexto);
  const estrellas = Number(v.estrellas);
  const fuente = FUENTES_RESENA.find((f) => f === v.fuente);
  if (!nombre || !texto || !fuente || !Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return null;
  const enlace = enlaceHttps(v.enlace);
  return { nombre, texto, estrellas: estrellas as ResenaSitio["estrellas"], fuente, ...(enlace ? { enlace } : {}) };
}

/* ══════════════════════════════════ AL LEER ══════════════════════════════════ */

/** El sitio completo, sin huecos: lo guardado donde lo hay y lo de fábrica donde no. */
export interface SitioResuelto {
  portada: {
    antetitulo: string;
    frase: string;
    pasos: [string, string, string];
    /** null = la foto de fábrica (la caja con el enredo, import estático). */
    foto: FotoSitio | null;
    fotoAlt: string;
  };
  historia: { titulo: string; parrafos: string[]; cierre: string };
  textos: { domicilio: string; pie: string };
  /** `mapa` "" = se arma con la dirección. */
  ubicacion: { ciudad: string; departamento: string; mapa: string };
  contacto: { mostrarTelefono: boolean };
  domicilios: { didi: string };
  redes: { mostrar: boolean; tiktok: string; facebook: string };
  seo: {
    titulo: string;
    descripcion: string;
    descripcionCompartir: string;
    descripcionGoogle: string;
    /** En la notación de schema.org; [] = se manda el horario del sitio, como siempre. */
    horarioGoogle: string[];
    fotoCompartir: FotoSitio;
    /** ¿La foto para compartir es una subida por el dueño? */
    fotoCompartirPropia: boolean;
  };
  resenas: { mostrar: boolean; lista: ResenaSitio[] };
}

/**
 * EL LECTOR DEL SITIO. Recibe los ajustes (o cualquier cosa: un cerebro viejo, un
 * respaldo a medias) y devuelve el sitio entero. Blanco o basura = de fábrica; enlaces
 * solo https; todo dentro de su tope. Puro e idempotente.
 */
export function sitioDe(a?: { sitio?: unknown; negocio?: unknown } | null): SitioResuelto {
  const s = (esObjeto(a?.sitio) ? a.sitio : {}) as Record<string, unknown>;
  const grupo = (k: keyof AjustesSitio): Record<string, unknown> => (esObjeto(s[k]) ? s[k] : {});
  const F = SITIO_FABRICA;
  const negocio = linea(a?.negocio) || "Papaghetti";

  const portada = grupo("portada");
  const pasos = Array.isArray(portada.pasos) ? portada.pasos : [];
  const foto = fotoDe(portada.foto);

  const historia = grupo("historia");
  const parrafos = (Array.isArray(historia.parrafos) ? historia.parrafos : [])
    .map((p) => textoDe(p, TOPES.parrafo))
    .filter(Boolean)
    .slice(0, TOPES.parrafos);

  const textos = grupo("textos");
  const ubicacion = grupo("ubicacion");
  const redes = grupo("redes");
  const seo = grupo("seo");
  const fotoCompartir = fotoDe(seo.fotoCompartir);
  const resenas = grupo("resenas");

  return {
    portada: {
      antetitulo: textoDe(portada.antetitulo, TOPES.antetitulo) || F.portada.antetitulo,
      frase: textoDe(portada.frase, TOPES.frase) || F.portada.frase,
      pasos: [0, 1, 2].map((i) => textoDe(pasos[i], TOPES.paso) || F.portada.pasos[i]) as [string, string, string],
      foto,
      /* El texto de fábrica describe la foto de fábrica: con una foto propia, el del dueño
         o uno genérico que no mienta sobre lo que se ve. */
      fotoAlt: foto ? foto.alt || `Plato de ${negocio}` : F.portada.fotoAlt,
    },
    historia: {
      titulo: textoDe(historia.titulo, TOPES.titulo) || F.historia.titulo,
      parrafos: parrafos.length ? parrafos : [...F.historia.parrafos],
      cierre: textoDe(historia.cierre, TOPES.cierre) || F.historia.cierre,
    },
    textos: {
      domicilio: textoDe(textos.domicilio, TOPES.domicilio) || F.textos.domicilio,
      pie: textoDe(textos.pie, TOPES.pie) || F.textos.pie,
    },
    ubicacion: {
      ciudad: textoDe(ubicacion.ciudad, TOPES.ciudad) || F.ubicacion.ciudad,
      departamento: textoDe(ubicacion.departamento, TOPES.departamento) || F.ubicacion.departamento,
      mapa: enlaceHttps(ubicacion.mapa),
    },
    contacto: { mostrarTelefono: grupo("contacto").mostrarTelefono === true },
    domicilios: { didi: enlaceHttps(grupo("domicilios").didi) },
    redes: {
      mostrar: redes.mostrar === true,
      tiktok: enlaceHttps(redes.tiktok),
      facebook: enlaceHttps(redes.facebook),
    },
    seo: {
      titulo: textoDe(seo.titulo, TOPES.seoTitulo) || F.seo.titulo,
      descripcion: textoDe(seo.descripcion, TOPES.seoDescripcion) || F.seo.descripcion,
      descripcionCompartir: textoDe(seo.descripcionCompartir, TOPES.seoCompartir) || F.seo.descripcionCompartir,
      descripcionGoogle: textoDe(seo.descripcionGoogle, TOPES.seoGoogle) || F.seo.descripcionGoogle,
      horarioGoogle: horarioGoogleDe(seo.horarioGoogle).specs,
      fotoCompartir: fotoCompartir ?? { ...F.seo.fotoCompartir },
      fotoCompartirPropia: Boolean(fotoCompartir),
    },
    resenas: {
      mostrar: resenas.mostrar === true,
      lista: (Array.isArray(resenas.lista) ? resenas.lista : [])
        .map(resenaDe)
        .filter((r): r is ResenaSitio => r !== null)
        .slice(0, TOPES.resenas),
    },
  };
}

/* ══════════════════════════════ LO QUE VE EL CLIENTE ══════════════════════════════ */

/**
 * EL SITIO QUE PUEDE VER UN DESCONOCIDO. Ya resuelto: lo que el sitio no debe mostrar
 * llega vacío, no escondido. Nunca lleva los usuarios del panel ni el comprobante, y las
 * reseñas solo si el dueño las encendió (un borrador no puede viajar en el HTML: todo lo
 * que recibe la página queda legible en su código fuente).
 */
export interface SitioPublico {
  negocio: string;
  /** Solo dígitos; "" mientras sea el número de ejemplo (los botones se esconden). */
  whatsapp: string;
  direccion: string;
  horarios: string;
  /** "" salvo que el dueño haya encendido «mostrar el teléfono». */
  telefono: string;
  /** Usuario sin @, o "". */
  instagram: string;
  rappi: string;
  didi: string;
  /** El enlace de «Cómo llegar»: el propio o el que se arma con la dirección. */
  mapa: string;
  ciudad: string;
  departamento: string;
  /** Los enlaces visibles del pie; "" si las redes no se muestran. */
  redes: { instagram: string; tiktok: string; facebook: string };
  /** Los perfiles para Google (Instagram siempre, como antes; TikTok y Facebook si se muestran). */
  sameAs: string[];
  portada: SitioResuelto["portada"];
  historia: SitioResuelto["historia"];
  textos: SitioResuelto["textos"];
  seo: SitioResuelto["seo"];
  resenas: ResenaSitio[];
}

export function sitioPublicoDe(a: Ajustes): SitioPublico {
  const s = sitioDe(a);
  const instagram = usuarioInstagram(a.instagram) || "";
  const igUrl = instagram ? `https://instagram.com/${instagram}` : "";
  const direccion = linea(a.direccion);
  const redes = s.redes.mostrar
    ? { instagram: igUrl, tiktok: s.redes.tiktok, facebook: s.redes.facebook }
    : { instagram: "", tiktok: "", facebook: "" };
  return {
    negocio: linea(a.negocio) || "Papaghetti",
    whatsapp: whatsappValido(a.whatsapp) ? soloDigitos(a.whatsapp) : "",
    direccion,
    horarios: linea(a.horarios),
    telefono: s.contacto.mostrarTelefono ? cortar(linea(a.telefonoLocal), TOPES.telefono) : "",
    instagram,
    rappi: enlaceHttps(a.rappi),
    didi: s.domicilios.didi,
    mapa: s.ubicacion.mapa || `https://maps.google.com/?q=${encodeURIComponent(a.direccion ?? "")}`,
    ciudad: s.ubicacion.ciudad,
    departamento: s.ubicacion.departamento,
    redes,
    sameAs: [igUrl, redes.tiktok, redes.facebook].filter(Boolean),
    portada: s.portada,
    historia: s.historia,
    textos: s.textos,
    seo: s.seo,
    resenas: s.resenas.mostrar ? s.resenas.lista : [],
  };
}

/** La foto para compartir que sirve en una vista previa: un data URL no la ve nadie fuera
 *  de este navegador, así que ahí va la de fábrica. Una dirección propia (/og.jpg, o
 *  /foto/… la subida en producción) la completa con el dominio el `metadataBase` del
 *  layout: WhatsApp y Facebook solo aceptan la dirección entera. */
const fotoPublicable = (f: FotoSitio): FotoSitio =>
  f.url.startsWith("data:") ? { ...SITIO_FABRICA.seo.fotoCompartir } : f;

/**
 * Los metadatos de la página (título, descripción y la vista previa al compartir). Los
 * objetos `openGraph` y `twitter` van COMPLETOS: Next no los mezcla con los del layout,
 * los reemplaza enteros, y uno a medias dejaba el enlace compartido sin foto.
 * (Objetos simples: este módulo no importa nada de Next.)
 */
export function metadatosDe(m: {
  negocio: string;
  seo: Pick<SitioResuelto["seo"], "titulo" | "descripcion" | "descripcionCompartir" | "fotoCompartir">;
}) {
  const foto = fotoPublicable(m.seo.fotoCompartir);
  return {
    title: m.seo.titulo,
    description: m.seo.descripcion,
    openGraph: {
      title: m.seo.titulo,
      description: m.seo.descripcionCompartir,
      locale: "es_CO",
      type: "website" as const,
      siteName: m.negocio,
      images: [
        {
          url: foto.url,
          ...(foto.ancho ? { width: foto.ancho } : {}),
          ...(foto.alto ? { height: foto.alto } : {}),
          alt: m.negocio,
        },
      ],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: m.seo.titulo,
      description: m.seo.descripcionCompartir,
      images: [foto.url],
    },
  };
}

/**
 * JSON para un <script type="application/ld+json">. JSON.stringify no escapa «<», y el
 * bloque va dentro del HTML: un nombre de plato o una descripción escritos en el panel
 * con «</script>» cerraban la etiqueta y lo que siguiera se ejecutaba como código.
 */
export const jsonLdSeguro = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");

/* ══════════════════════════ AL GUARDAR (las acciones del panel) ══════════════════════════ */

/** Lo que vuelve de una acción del sitio y pinta el formulario junto a su botón. */
export interface EstadoSitio {
  ok: boolean;
  mensaje: string;
  /** Lo que se escribió, para no perderlo si la acción lo rechaza. */
  valores?: Record<string, string>;
  /** Sube con cada respuesta: el formulario se vuelve a armar con lo guardado. */
  n?: number;
}

/** Un formulario leído campo por campo (FormData en el panel, un objeto en las pruebas). */
export type Campos = (nombre: string) => string;
export const camposDe = (fd: { get(nombre: string): unknown }): Campos => (nombre) => {
  const v = fd.get(nombre);
  return typeof v === "string" ? v : "";
};

export type Lectura<T> = { error: string } | { valor: T; aviso?: string };

/** Acumula los errores de un formulario: se dicen todos juntos, no de uno en uno. */
function lector(c: Campos) {
  const errores: string[] = [];
  return {
    errores,
    /** Un texto de una línea. Igual al de fábrica o en blanco = no se guarda (undefined). */
    texto(nombre: string, etiqueta: string, tope: number, fabrica?: string): string | undefined {
      const v = linea(c(nombre));
      const largo = Array.from(v).length;
      if (largo > tope) {
        errores.push(`${etiqueta}: máximo ${tope} letras (tiene ${largo}).`);
        return undefined;
      }
      return v && v !== fabrica ? v : undefined;
    },
    error(m: string) {
      errores.push(m);
    },
  };
}

/** Contacto y horarios: los campos de siempre del negocio y lo que el sitio hace con ellos. */
export function leerContacto(c: Campos): Lectura<{
  /** Los campos de siempre de Ajustes (el comprobante lee los mismos). */
  deSiempre: Pick<Ajustes, "whatsapp" | "horarios" | "direccion" | "telefonoLocal" | "instagram">;
  contacto: { mostrarTelefono?: boolean };
  ubicacion: { ciudad?: string; departamento?: string };
}> {
  const l = lector(c);
  const largo = (s: string) => Array.from(s).length;
  const whatsapp = whatsappDe(c("whatsapp"));
  if (whatsapp && (whatsapp.length < 11 || whatsapp.length > 15)) {
    l.error("WhatsApp: escribe el número con el indicativo del país (57 y los 10 dígitos del celular).");
  }
  const horarios = linea(c("horarios"));
  if (!horarios) l.error("Horarios: escríbelos; salen en el sitio y en la barra de «Cerrado ahora».");
  else if (largo(horarios) > TOPES.horarios) l.error(`Horarios: máximo ${TOPES.horarios} letras.`);
  const direccion = linea(c("direccion"));
  if (!direccion) l.error("Dirección: escríbela; sin ella el botón «Cómo llegar» no lleva a ninguna parte.");
  else if (largo(direccion) > TOPES.direccion) l.error(`Dirección: máximo ${TOPES.direccion} letras.`);
  const telefonoLocal = linea(c("telefonoLocal"));
  const digitosTel = soloDigitos(telefonoLocal).length;
  if (telefonoLocal && (largo(telefonoLocal) > TOPES.telefono || !/^[+\d\s().-]+$/.test(telefonoLocal) || digitosTel < 7 || digitosTel > 15)) {
    l.error("Teléfono del local: solo números (de 7 a 15), con espacios o guiones si quieres.");
  }
  const instagram = usuarioInstagram(c("instagram"));
  if (instagram === null) l.error("Instagram: pega el enlace de tu PERFIL o escribe el usuario (sin espacios).");
  const mostrarTelefono = c("mostrarTelefono") === "on";
  const ciudad = l.texto("ciudad", "Ciudad", TOPES.ciudad, SITIO_FABRICA.ubicacion.ciudad);
  const departamento = l.texto("departamento", "Departamento", TOPES.departamento, SITIO_FABRICA.ubicacion.departamento);
  if (l.errores.length) return { error: l.errores.join(" ") };
  return {
    valor: {
      deSiempre: { whatsapp, horarios, direccion, telefonoLocal, instagram: instagram ?? "" },
      contacto: { mostrarTelefono: mostrarTelefono || undefined },
      ubicacion: { ciudad, departamento },
    },
    aviso:
      mostrarTelefono && !telefonoLocal
        ? "Marcaste mostrar el teléfono, pero no hay teléfono escrito: el sitio no muestra nada todavía."
        : !whatsappValido(whatsapp)
          ? "Sin un WhatsApp real, el sitio sigue escondiendo sus botones de WhatsApp."
          : undefined,
  };
}

/** Domicilios y mapa: Rappi (campo de siempre), DiDi y el enlace propio de Google Maps. */
export function leerDomicilios(c: Campos): Lectura<{ rappi: string; didi?: string; mapa?: string }> {
  const l = lector(c);
  const avisos: string[] = [];
  const enlace = (nombre: string, etiqueta: string, de: "rappi" | "didi" | "mapa"): string => {
    const url = leerEnlace(c(nombre));
    if (url === null) {
      l.error(`${etiqueta}: ese enlace no sirve. Cópialo completo desde el navegador (empieza por https://).`);
      return "";
    }
    if (url && !pareceDe(url, de)) avisos.push(`el enlace de ${etiqueta} no parece de ${etiqueta}: revísalo`);
    return url;
  };
  const rappi = enlace("rappi", "Rappi", "rappi");
  const didi = enlace("didi", "DiDi", "didi");
  const mapa = enlace("mapa", "Google Maps", "mapa");
  if (l.errores.length) return { error: l.errores.join(" ") };
  return {
    valor: { rappi, didi: didi || undefined, mapa: mapa || undefined },
    aviso: avisos.length ? `Ojo: ${avisos.join("; ")}.` : undefined,
  };
}

/** Redes: TikTok, Facebook y si se muestran en el pie (Instagram está en Contacto). */
export function leerRedes(c: Campos): Lectura<{ mostrar?: boolean; tiktok?: string; facebook?: string }> {
  const l = lector(c);
  const tiktok = enlaceTiktok(c("tiktok"));
  if (tiktok === null) l.error("TikTok: escribe el usuario (@…) o pega el enlace de tu perfil.");
  const facebook = enlaceFacebook(c("facebook"));
  if (facebook === null) l.error("Facebook: pega el enlace de tu página (facebook.com/…).");
  if (l.errores.length) return { error: l.errores.join(" ") };
  const mostrar = c("mostrarRedes") === "on";
  return { valor: { mostrar: mostrar || undefined, tiktok: tiktok || undefined, facebook: facebook || undefined } };
}

/** Portada: antetítulo, frase y las tres líneas de los pasos (la foto va aparte). */
export function leerPortada(c: Campos): Lectura<{ antetitulo?: string; frase?: string; pasos?: string[] }> {
  const l = lector(c);
  const F = SITIO_FABRICA.portada;
  const antetitulo = l.texto("antetitulo", "Antetítulo", TOPES.antetitulo, F.antetitulo);
  const frase = l.texto("frase", "Frase", TOPES.frase, F.frase);
  const pasos = [0, 1, 2].map((i) => l.texto(`paso${i + 1}`, `Paso ${i + 1}`, TOPES.paso, F.pasos[i]) ?? "");
  if (l.errores.length) return { error: l.errores.join(" ") };
  return { valor: { antetitulo, frase, pasos: pasos.some(Boolean) ? pasos : undefined } };
}

/** Historia: título, párrafos (separados por una línea en blanco) y la frase de cierre. */
export function leerHistoria(c: Campos): Lectura<{ titulo?: string; parrafos?: string[]; cierre?: string }> {
  const l = lector(c);
  const F = SITIO_FABRICA.historia;
  const titulo = l.texto("titulo", "Título", TOPES.titulo, F.titulo);
  const parrafos = parrafosDe(c("parrafos"));
  if (parrafos.length > TOPES.parrafos) {
    l.error(`Historia: máximo ${TOPES.parrafos} párrafos (hay ${parrafos.length}). Sepáralos con una línea en blanco.`);
  }
  parrafos.forEach((p, i) => {
    const largo = Array.from(p).length;
    if (largo > TOPES.parrafo) l.error(`Párrafo ${i + 1}: máximo ${TOPES.parrafo} letras (tiene ${largo}).`);
  });
  const cierre = l.texto("cierre", "Cierre", TOPES.cierre, F.cierre);
  if (l.errores.length) return { error: l.errores.join(" ") };
  const deFabrica = parrafos.length === F.parrafos.length && parrafos.every((p, i) => p === F.parrafos[i]);
  return { valor: { titulo, parrafos: parrafos.length && !deFabrica ? parrafos : undefined, cierre } };
}

/** Textos sueltos: la línea de domicilio y la del pie. */
export function leerTextos(c: Campos): Lectura<{ domicilio?: string; pie?: string }> {
  const l = lector(c);
  const F = SITIO_FABRICA.textos;
  const domicilio = l.texto("domicilio", "Texto de domicilio", TOPES.domicilio, F.domicilio);
  const pie = l.texto("pie", "Texto del pie", TOPES.pie, F.pie);
  if (l.errores.length) return { error: l.errores.join(" ") };
  return { valor: { domicilio, pie } };
}

/** Buscadores y compartir: lo que dicen Google y la vista previa de WhatsApp (la foto va aparte). */
export function leerBuscadores(c: Campos): Lectura<{
  titulo?: string;
  descripcion?: string;
  descripcionCompartir?: string;
  descripcionGoogle?: string;
  horarioGoogle?: string;
}> {
  const l = lector(c);
  const F = SITIO_FABRICA.seo;
  const titulo = l.texto("titulo", "Título", TOPES.seoTitulo, F.titulo);
  const descripcion = l.texto("descripcion", "Descripción", TOPES.seoDescripcion, F.descripcion);
  const descripcionCompartir = l.texto("descripcionCompartir", "Descripción al compartir", TOPES.seoCompartir, F.descripcionCompartir);
  const descripcionGoogle = l.texto("descripcionGoogle", "Descripción para Google", TOPES.seoGoogle, F.descripcionGoogle);
  const horarioCrudo = c("horarioGoogle")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(linea)
    .filter(Boolean)
    .join("\n");
  if (horarioCrudo.length > TOPES.horarioGoogle) l.error(`Horario para Google: máximo ${TOPES.horarioGoogle} letras.`);
  const horario = horarioGoogleDe(horarioCrudo);
  if (horario.error) l.error(horario.error);
  if (l.errores.length) return { error: l.errores.join(" ") };
  return { valor: { titulo, descripcion, descripcionCompartir, descripcionGoogle, horarioGoogle: horarioCrudo || undefined } };
}

/** Una reseña nueva. La casilla «la copié de una reseña pública real» es obligatoria. */
export function leerResena(c: Campos): Lectura<ResenaSitio> {
  const l = lector(c);
  if (c("real") !== "on") l.error("Marca la casilla: solo se publican reseñas reales, copiadas de una página pública.");
  const nombre = linea(c("nombre"));
  if (!nombre) l.error("Escribe el nombre de quien la escribió (como aparece en la reseña).");
  else if (Array.from(nombre).length > TOPES.resenaNombre) l.error(`Nombre: máximo ${TOPES.resenaNombre} letras.`);
  const texto = linea(c("texto"));
  if (!texto) l.error("Pega el texto de la reseña.");
  else if (Array.from(texto).length > TOPES.resenaTexto) l.error(`Reseña: máximo ${TOPES.resenaTexto} letras; acórtala sin cambiar lo que dice.`);
  const estrellas = Number(c("estrellas"));
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) l.error("Elige las estrellas que le dio (de 1 a 5).");
  const fuente = FUENTES_RESENA.find((f) => f === c("fuente"));
  if (!fuente) l.error("Elige de dónde la copiaste.");
  const enlace = leerEnlace(c("enlace"));
  if (enlace === null) l.error("Enlace: pega el enlace completo de la reseña (empieza por https://) o déjalo vacío.");
  if (l.errores.length || !fuente) return { error: l.errores.join(" ") };
  return {
    valor: { nombre, texto, estrellas: estrellas as ResenaSitio["estrellas"], fuente, ...(enlace ? { enlace } : {}) },
  };
}

/**
 * Cambia unos campos de UN grupo del sitio sin tocar los demás campos ni grupos.
 * `undefined` borra el campo (vuelve al de fábrica) y un grupo que se queda vacío
 * desaparece. Es la mezcla de dos niveles que necesita, por ejemplo, la portada: su
 * formulario de textos no trae la foto, y guardarlo no puede borrarla. Puro: no muta.
 */
export function conCampos<G extends keyof AjustesSitio>(
  s: AjustesSitio | undefined,
  grupo: G,
  campos: NonNullable<AjustesSitio[G]>,
): AjustesSitio {
  const base: AjustesSitio = esObjeto(s) ? { ...s } : {};
  const previo = esObjeto(base[grupo]) ? (base[grupo] as Record<string, unknown>) : {};
  const junto: Record<string, unknown> = { ...previo, ...(campos as Record<string, unknown>) };
  for (const k of Object.keys(junto)) if (junto[k] === undefined) delete junto[k];
  if (Object.keys(junto).length) base[grupo] = junto as AjustesSitio[G];
  else delete base[grupo];
  return base;
}

/** Las reseñas guardadas, tal cual (sin pasar por el lector, que descarta las rotas). */
const listaDe = (s: AjustesSitio | undefined): ResenaSitio[] =>
  Array.isArray(s?.resenas?.lista) ? s.resenas.lista : [];

/** Agrega una reseña al final. Con el tope lleno, `null`. */
export function conResena(s: AjustesSitio | undefined, r: ResenaSitio): AjustesSitio | null {
  const lista = listaDe(s);
  if (lista.length >= TOPES.resenas) return null;
  return conCampos(s, "resenas", { lista: [...lista, r] });
}

/**
 * Quita una reseña por su posición, pero solo si ahí sigue la misma persona: con dos
 * pestañas abiertas, la posición de la pantalla vieja podía apuntar ya a otra reseña.
 * `null` = no estaba.
 */
export function sinResena(s: AjustesSitio | undefined, indice: number, nombre: string): AjustesSitio | null {
  const lista = listaDe(s);
  if (!Number.isInteger(indice) || indice < 0 || indice >= lista.length || lista[indice]?.nombre !== nombre) return null;
  const quedan = lista.filter((_, i) => i !== indice);
  // Sin reseñas no hay nada que mostrar: el interruptor se apaga con la última.
  return conCampos(s, "resenas", quedan.length ? { lista: quedan } : { lista: undefined, mostrar: undefined });
}
