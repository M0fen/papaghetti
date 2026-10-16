import { haySesion } from "@/lib/sesion";
import { copiaCompleta, nombreCopia } from "@/lib/catalog";

export const dynamic = "force-dynamic";
/* Leer el cerebro y luego cada mes archivado, uno detrás de otro, toma segundos. Esto es
   solo el techo: con el límite corto de algunos planes de Vercel (10 s), un año de meses
   archivados podía quedar cortado a la mitad. */
export const maxDuration = 60;

/** Se manda en trozos de 64 KB (ver abajo por qué en trozos). */
const TROZO = 64 * 1024;

/**
 * LA COPIA COMPLETA DEL DUEÑO: todo el negocio en un archivo JSON, desde Ajustes.
 *
 * Un route handler no pasa por el layout que muestra el Login: la puerta va aquí. Sin
 * sesión, 401: el archivo lleva nombres, teléfonos y direcciones de clientes.
 *
 * TODO O NADA. Primero se lee TODO (el cerebro y después cada mes archivado) y se arma el
 * archivo entero en memoria; si una lectura falla, la respuesta es un error y no se
 * descarga nada. Solo entonces se manda, y en trozos, por tamaño: un pedido pesa cerca de
 * 1,2 KB, así que el cerebro (hasta 2.300 pedidos) llega a unos 3 MB y cada mes archivado
 * suma otros 3 o 4, y Vercel corta en 4,5 MB las respuestas que salen de una sola vez; las
 * que salen en trozos no tienen ese tope. Como ya se leyó todo, el almacén no puede dejar
 * un archivo a medias; si lo que se corta es la conexión, al archivo le falta su última
 * clave (`"completo": true`), que es justo la señal de que esa copia no sirve.
 *
 * GET sin escrituras. En Ajustes es un enlace normal con `download` (no <Link>), así que
 * nadie la precarga.
 */
export async function GET() {
  if (!(await haySesion())) {
    return new Response("No autorizado.", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const ahora = new Date();
  let bytes: Uint8Array;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(await copiaCompleta(ahora)));
  } catch (e) {
    const causa = (e as Error)?.message ?? String(e);
    console.warn("[papaghetti] no se pudo armar la copia completa:", causa);
    return new Response(
      `No se pudo armar la copia. No se descargó nada: vuelve a intentarlo en un momento.\n\n(${causa})`,
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  // Los trozos se cortan sobre los BYTES, no sobre el texto: cortar el texto podía partir
  // en dos un emoji de la carta (🍝 son dos unidades de texto) y dañarlo en el archivo.
  let desde = 0;
  const cuerpo = new ReadableStream<Uint8Array>({
    pull(salida) {
      if (desde >= bytes.length) {
        salida.close();
        return;
      }
      salida.enqueue(bytes.subarray(desde, desde + TROZO));
      desde += TROZO;
    },
  });
  return new Response(cuerpo, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreCopia(ahora)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
