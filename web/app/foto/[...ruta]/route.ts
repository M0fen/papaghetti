import { rutaFoto } from "@/lib/fotos";
import { leerFoto } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * LA PUERTA DE LAS FOTOS: /foto/fotos/pollo-Xy7.jpg → esa foto, del almacén privado.
 *
 * Pública a propósito: las fotos de la carta son del sitio, no del panel. Lo que la hace
 * segura es `rutaFoto` (lib/fotos.ts): solo sale lo que está bajo fotos/ y es una foto.
 * cerebro/ —pedidos, teléfonos, caja— no sale nunca, ni con "..", ni con la ruta
 * codificada, ni con otra extensión: todo eso es un 404 sin preguntarle al almacén.
 *
 * La foto se guarda un año en cada caché sin volver a preguntar: cada subida tiene un
 * nombre nuevo, así que una dirección nunca cambia de foto. El tipo lo fija la puerta
 * según la extensión, no lo que diga el almacén.
 */
export async function GET(_req: Request, ctx: RouteContext<"/foto/[...ruta]">) {
  const foto = rutaFoto((await ctx.params).ruta);
  if (!foto) return sinGuardar(404, "No existe.");
  let flujo: ReadableStream<Uint8Array> | null;
  try {
    flujo = await leerFoto(foto.pathname);
  } catch (e) {
    // Un tropiezo del almacén no es "no existe": se dice como lo que es, y sin quedarse en caché.
    console.warn("[papaghetti] el almacén no entregó la foto:", (e as Error)?.message ?? e);
    return sinGuardar(503, "El almacén no respondió. Intenta de nuevo.", { "Retry-After": "30" });
  }
  if (!flujo) return sinGuardar(404, "No existe.");
  return new Response(flujo, {
    headers: {
      "Content-Type": foto.tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Una respuesta que NINGUNA caché reutiliza. next.config.ts le pone un año de caché a
 * todo lo que termina en .jpg o .webp, y Next no deja que una ruta cambie una cabecera
 * que la configuración ya puso (comprobado: el 404 de un .jpg sale con `immutable`), así
 * que el `no-store` de aquí no alcanza. Sin lo demás, un tropiezo del almacén, o un
 * despliegue que todavía no tiene el almacén conectado, se quedaba como foto rota un
 * año: `Vary: *` hace que el navegador no la reutilice, y `CDN-Cache-Control`, que el
 * CDN lee antes que `Cache-Control`, que no la guarde.
 */
function sinGuardar(status: number, texto: string, extra: Record<string, string> = {}): Response {
  return new Response(texto, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      Vary: "*",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
