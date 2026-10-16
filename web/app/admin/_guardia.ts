import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { usuarioSesion, abrirSesion } from "@/lib/sesion";
import { guardarFoto } from "@/lib/catalog";

/**
 * LO QUE COMPARTEN TODAS LAS ACCIONES DEL PANEL: la puerta, el aviso y el "intentar".
 *
 * Vivían dentro de app/admin/actions.ts. Un archivo "use server" solo puede exportar
 * acciones, y exportar estos ayudantes desde ahí los habría vuelto llamables desde el
 * navegador. Aquí son funciones normales del servidor, y cada sección del panel puede
 * tener su propio archivo de acciones (precios, comprobante, sitio) sin pelearse por
 * uno solo.
 */

/**
 * Puerta única del panel. La sesión va FIRMADA (ver lib/sesion.ts): antes era
 * `cookie === "1"`, así que cualquiera escribía esa cookie a mano y era dueño del
 * negocio. Y de paso RENUEVA el turno: la cookie de 8 h no se refrescaba nunca, así que
 * el operario se quedaba fuera a media tarde sin explicación.
 */
export async function guard(): Promise<boolean> {
  const u = await usuarioSesion();
  if (!u) return false;
  await abrirSesion(u); // renueva el turno SIN cambiar de persona
  return true;
}

/**
 * Aviso efímero para el operario. Las acciones hacían `return` mudo cuando algo
 * fallaba: "guardado" y "no pasó nada" se veían exactamente igual. Esto deja un
 * mensaje de 10 s que la barra del panel pinta en el siguiente render.
 */
export async function avisar(texto: string, tipo: "ok" | "error" = "error") {
  (await cookies()).set("pg_aviso", `${tipo}:${texto}`.slice(0, 300), {
    httpOnly: false,
    sameSite: "lax",
    path: "/admin",
    maxAge: 10,
  });
}

/** Ejecuta una mutación del cerebro y convierte su error en un aviso visible. */
export async function intentar(fn: () => Promise<unknown>, exito?: string): Promise<boolean> {
  try {
    await fn();
    if (exito) await avisar(exito, "ok");
    return true;
  } catch (e) {
    await avisar(e instanceof Error ? e.message : "No se pudo completar la acción.");
    return false;
  }
}

/** Un solo cambio → se refleja en la web pública y en el propio admin. */
export function reflejar() {
  revalidatePath("/");
  revalidatePath("/admin");
}

/**
 * Para todo lo que cambia lo que ve un cliente (ajustes, sitio, precios, comprobante):
 * la portada es estática y se regenera solo cuando se le avisa. "layout" invalida todas
 * las rutas y la caché del navegador del que guardó.
 */
export function reflejarSitio() {
  revalidatePath("/", "layout");
}

/**
 * Sanea la foto que llega de un formulario.
 *
 * `foto` se guardaba tal cual: cualquier cadena, de cualquier tamaño. La compresión
 * vive solo en el navegador (ImageUpload), o sea del lado de quien envía. Un data URI
 * de 5MB se replicaba en cada snapshot de undo y acababa dentro del HTML público.
 * `limite` (en caracteres) es por campo: una ficha de la carta no necesita lo que una
 * foto de portada.
 */
export async function fotoValida(
  raw: FormData | string | null,
  id = "ficha",
  limite = 300_000,
): Promise<string | undefined> {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return undefined;
  const esData = /^data:image\/(jpeg|png|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(v);
  const esUrl = /^https?:\/\/[^\s"'<>]+$/i.test(v) || /^\/[^\s"'<>]*$/.test(v);
  if (!esData && !esUrl) return undefined;
  if (v.length > limite) return undefined;
  /* La imagen se sube como archivo aparte y aquí solo queda su dirección: dentro del
     cerebro pesaba más que todo lo demás junto. */
  return guardarFoto(v, id);
}
