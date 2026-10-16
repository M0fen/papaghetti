"use server";

import type { Ajustes } from "@/lib/menu";
import { getCatalog, guardarSitio } from "@/lib/catalog";
import {
  camposDe,
  conCampos,
  conResena,
  sinResena,
  leerBuscadores,
  leerContacto,
  leerDomicilios,
  leerHistoria,
  leerPortada,
  leerRedes,
  leerResena,
  leerTextos,
  linea,
  sitioDe,
  LIMITE_FOTO_SITIO,
  TOPES,
  type AjustesSitio,
  type EstadoSitio,
  type FotoSitio,
} from "@/lib/sitio";
import { guard, avisar, intentar, reflejarSitio, fotoValida } from "./_guardia";

/**
 * AJUSTES → SITIO. Una acción por bloque del formulario, y cada una toca SOLO lo suyo
 * (ver `conCampos`): guardar los textos de la portada no puede borrar su foto, ni guardar
 * las redes tocar las reseñas.
 *
 * Todas devuelven un `EstadoSitio` que el formulario pinta junto a su botón: la sección
 * del sitio está al fondo de Ajustes y el aviso de la barra (que también se pone) queda
 * arriba, fuera de la vista de quien acaba de guardar. Validan todo lo que llega (los
 * tipos no existen cuando el navegador manda el formulario) y la regla de qué es válido
 * vive en lib/sitio.ts, donde las pruebas la alcanzan.
 */

const siguiente = (prev?: EstadoSitio) => (prev?.n ?? 0) + 1;

/** Lo escrito en el formulario, para devolverlo si se rechaza y que nadie lo pierda.
 *  Sin la foto: pesa demasiado para ir y volver en cada envío. */
function eco(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && !k.startsWith("$ACTION") && k !== "foto" && v.length <= 2_000) out[k] = v;
  }
  return out;
}

async function rechazar(prev: EstadoSitio, mensaje: string, fd?: FormData): Promise<EstadoSitio> {
  await avisar(mensaje);
  return { ok: false, mensaje, valores: fd ? eco(fd) : undefined, n: siguiente(prev) };
}

async function sinSesion(prev: EstadoSitio): Promise<EstadoSitio> {
  return { ok: false, mensaje: "La sesión se cerró. Vuelve a entrar y repite el cambio.", n: siguiente(prev) };
}

/**
 * Guarda con `intentar` (el aviso de la barra, como el resto del panel) y además deja el
 * resultado para el formulario. El sitio es estático: `reflejarSitio` lo manda a rehacer.
 */
async function guardar(
  prev: EstadoSitio,
  fd: FormData | null,
  cambio: (a: Ajustes) => Partial<Ajustes>,
  historial: string,
  exito: string,
  opciones?: { transaccional?: boolean },
): Promise<EstadoSitio> {
  let fallo = "";
  const ok = await intentar(async () => {
    try {
      await guardarSitio(cambio, historial, opciones);
    } catch (e) {
      fallo = e instanceof Error ? e.message : "";
      throw e;
    }
  }, exito);
  if (!ok) {
    return {
      ok: false,
      mensaje: fallo || "No se pudo guardar. Vuelve a intentarlo en un momento.",
      valores: fd ? eco(fd) : undefined,
      n: siguiente(prev),
    };
  }
  reflejarSitio();
  return { ok: true, mensaje: exito, n: siguiente(prev) };
}

const conAviso = (exito: string, aviso?: string) => (aviso ? `${exito} ${aviso}` : exito);
const restaurando = (fd: FormData) => fd.get("restaurar") === "1";

/* ───────────────────────────── los bloques de texto ───────────────────────────── */

export async function guardarContactoAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  const l = leerContacto(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const { deSiempre, contacto, ubicacion } = l.valor;
  return guardar(
    prev,
    fd,
    (a) => ({ ...deSiempre, sitio: conCampos(conCampos(a.sitio, "contacto", contacto), "ubicacion", ubicacion) }),
    "Cambió el sitio: contacto y horarios",
    conAviso("Contacto y horarios guardados.", l.aviso),
  );
}

export async function guardarDomiciliosAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  const l = leerDomicilios(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const { rappi, didi, mapa } = l.valor;
  return guardar(
    prev,
    fd,
    (a) => ({ rappi, sitio: conCampos(conCampos(a.sitio, "domicilios", { didi }), "ubicacion", { mapa }) }),
    "Cambió el sitio: domicilios y mapa",
    conAviso("Enlaces guardados.", l.aviso),
  );
}

export async function guardarRedesAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  const l = leerRedes(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const redes = l.valor;
  return guardar(prev, fd, (a) => ({ sitio: conCampos(a.sitio, "redes", redes) }), "Cambió el sitio: redes", "Redes guardadas.");
}

export async function guardarPortadaAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  if (restaurando(fd)) {
    return guardar(
      prev,
      null,
      // Solo los textos: la foto tiene su propio botón para volver a la original.
      (a) => ({ sitio: conCampos(a.sitio, "portada", { antetitulo: undefined, frase: undefined, pasos: undefined }) }),
      "Cambió el sitio: portada (texto original)",
      "Volvió el texto original de la portada.",
    );
  }
  const l = leerPortada(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const portada = l.valor;
  return guardar(prev, fd, (a) => ({ sitio: conCampos(a.sitio, "portada", portada) }), "Cambió el sitio: portada", "Portada guardada.");
}

export async function guardarHistoriaAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  if (restaurando(fd)) {
    return guardar(
      prev,
      null,
      (a) => ({ sitio: conCampos(a.sitio, "historia", { titulo: undefined, parrafos: undefined, cierre: undefined }) }),
      "Cambió el sitio: historia (texto original)",
      "Volvió el texto original de la historia.",
    );
  }
  const l = leerHistoria(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const historia = l.valor;
  return guardar(prev, fd, (a) => ({ sitio: conCampos(a.sitio, "historia", historia) }), "Cambió el sitio: historia", "Historia guardada.");
}

export async function guardarTextosAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  if (restaurando(fd)) {
    return guardar(
      prev,
      null,
      (a) => ({ sitio: conCampos(a.sitio, "textos", { domicilio: undefined, pie: undefined }) }),
      "Cambió el sitio: textos (texto original)",
      "Volvieron los textos originales.",
    );
  }
  const l = leerTextos(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const textos = l.valor;
  return guardar(prev, fd, (a) => ({ sitio: conCampos(a.sitio, "textos", textos) }), "Cambió el sitio: textos", "Textos guardados.");
}

export async function guardarBuscadoresAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  if (restaurando(fd)) {
    return guardar(
      prev,
      null,
      (a) => ({
        sitio: conCampos(a.sitio, "seo", {
          titulo: undefined,
          descripcion: undefined,
          descripcionCompartir: undefined,
          descripcionGoogle: undefined,
          horarioGoogle: undefined,
        }),
      }),
      "Cambió el sitio: buscadores (texto original)",
      "Volvieron los textos originales para Google y para compartir.",
    );
  }
  const l = leerBuscadores(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const seo = l.valor;
  return guardar(
    prev,
    fd,
    (a) => ({ sitio: conCampos(a.sitio, "seo", seo) }),
    "Cambió el sitio: buscadores y compartir",
    "Guardado. Google y WhatsApp tardan unos días en ver el cambio: guardan su propia copia.",
  );
}

/* ───────────────────────────────── las fotos ───────────────────────────────── */

const conFoto = (s: AjustesSitio | undefined, cual: "portada" | "compartir", foto: FotoSitio | undefined) =>
  cual === "portada" ? conCampos(s, "portada", { foto }) : conCampos(s, "seo", { fotoCompartir: foto });

/**
 * UNA FOTO POR ENVÍO: una acción de Next acepta hasta 1 MB y una foto de portada se lleva
 * casi todo. Solo se acepta una foto RECIÉN SUBIDA (la imagen en texto que arma el
 * navegador) o la que ya estaba (cuando solo cambia el texto de la foto): pegar aquí la
 * dirección de una imagen de otra página la pintaría en la portada sin que nadie la haya
 * revisado.
 */
async function guardarFotoSitio(prev: EstadoSitio, fd: FormData, cual: "portada" | "compartir"): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  const nombre = cual === "portada" ? "foto de portada" : "foto para compartir";
  const s = sitioDe((await getCatalog()).ajustes);
  const guardada = cual === "portada" ? s.portada.foto : s.seo.fotoCompartirPropia ? s.seo.fotoCompartir : null;
  const crudo = typeof fd.get("foto") === "string" ? String(fd.get("foto")).trim() : "";

  if (restaurando(fd) || !crudo) {
    if (!guardada) return { ok: true, mensaje: `Ya está la ${nombre} original.`, n: siguiente(prev) };
    return guardar(
      prev,
      null,
      (a) => ({ sitio: conFoto(a.sitio, cual, undefined) }),
      `Cambió el sitio: volvió la ${nombre} original`,
      `Volvió la ${nombre} original.`,
      { transaccional: true },
    );
  }

  const alt = linea(fd.get("alt"));
  if (Array.from(alt).length > TOPES.fotoAlt) {
    return rechazar(prev, `Qué se ve en la foto: máximo ${TOPES.fotoAlt} letras.`, fd);
  }
  let url: string;
  let medidas: { ancho?: number; alto?: number };
  if (guardada && crudo === guardada.url) {
    url = guardada.url; // la misma foto: solo cambia su texto
    medidas = { ancho: guardada.ancho, alto: guardada.alto };
  } else {
    if (!crudo.startsWith("data:image/")) return rechazar(prev, "Sube la foto desde tu teléfono o tu computador.", fd);
    const subida = await fotoValida(crudo, `sitio-${cual}`, LIMITE_FOTO_SITIO);
    if (!subida) return rechazar(prev, "La foto pesa demasiado o no es una imagen (JPG, PNG o WebP). Prueba con otra.", fd);
    /* En producción la foto se sube como archivo y aquí queda su dirección. Si el almacén
       falló, guardarFoto devuelve la imagen en texto: metida en la portada viajaría
       entera dentro del HTML de cada visita. Mejor decirlo y que se vuelva a intentar. */
    if (process.env.VERCEL && subida.startsWith("data:")) {
      return rechazar(prev, "No se pudo subir la foto al almacén de fotos. Vuelve a intentarlo en un momento.", fd);
    }
    url = subida;
    const medida = (k: string) => {
      const n = Number(fd.get(k));
      return Number.isInteger(n) && n > 0 && n <= 10_000 ? n : undefined;
    };
    medidas = { ancho: medida("fotoAncho"), alto: medida("fotoAlto") };
  }
  const foto: FotoSitio = {
    url,
    ...(medidas.ancho ? { ancho: medidas.ancho } : {}),
    ...(medidas.alto ? { alto: medidas.alto } : {}),
    ...(cual === "portada" && alt ? { alt } : {}),
  };
  return guardar(
    prev,
    fd,
    (a) => ({ sitio: conFoto(a.sitio, cual, foto) }),
    `Cambió el sitio: ${nombre}`,
    `${nombre[0].toUpperCase()}${nombre.slice(1)} guardada.`,
    { transaccional: true },
  );
}

export async function guardarFotoPortadaAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  return guardarFotoSitio(prev, fd, "portada");
}

export async function guardarFotoCompartirAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  return guardarFotoSitio(prev, fd, "compartir");
}

/* ───────────────────────────────── las reseñas ───────────────────────────────── */

export async function agregarResenaAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  const l = leerResena(camposDe(fd));
  if ("error" in l) return rechazar(prev, l.error, fd);
  const resena = l.valor;
  if (sitioDe((await getCatalog()).ajustes).resenas.lista.length >= TOPES.resenas) {
    return rechazar(prev, `Ya hay ${TOPES.resenas} reseñas: quita una para agregar otra.`, fd);
  }
  return guardar(
    prev,
    null,
    (a) => {
      const s = conResena(a.sitio, resena);
      if (!s) throw new Error(`Ya hay ${TOPES.resenas} reseñas: quita una para agregar otra.`);
      return { sitio: s };
    },
    `Cambió el sitio: agregó la reseña de ${resena.nombre}`,
    "Reseña agregada.",
  );
}

export async function quitarResenaAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  const indice = Number(fd.get("indice"));
  const nombre = typeof fd.get("nombre") === "string" ? String(fd.get("nombre")) : "";
  return guardar(
    prev,
    null,
    (a) => {
      const s = sinResena(a.sitio, indice, nombre);
      if (!s) throw new Error("Esa reseña ya no estaba. Recarga la página.");
      return { sitio: s };
    },
    `Cambió el sitio: quitó la reseña de ${linea(nombre) || "alguien"}`,
    "Reseña quitada.",
  );
}

export async function mostrarResenasAction(prev: EstadoSitio, fd: FormData): Promise<EstadoSitio> {
  if (!(await guard())) return sinSesion(prev);
  const mostrar = fd.get("mostrar") === "1";
  if (mostrar && !sitioDe((await getCatalog()).ajustes).resenas.lista.length) {
    return rechazar(prev, "Primero agrega al menos una reseña real.");
  }
  return guardar(
    prev,
    null,
    (a) => ({ sitio: conCampos(a.sitio, "resenas", { mostrar: mostrar || undefined }) }),
    mostrar ? "Cambió el sitio: mostró las reseñas" : "Cambió el sitio: escondió las reseñas",
    mostrar ? "Las reseñas ya se ven en el sitio." : "Las reseñas ya no se ven en el sitio.",
  );
}
