import { haySesion } from "@/lib/sesion";
import { kitImpresora, NOMBRE_KIT } from "@/lib/kit-impresora";

export const dynamic = "force-dynamic";

/**
 * EL KIT DEL PC DE LA CAJA, para descargar desde /admin/impresora.
 *
 * Un route handler no pasa por el layout que muestra el Login: la puerta va aquí. El
 * sitio se toma del propio pedido, así el acceso directo que crea el kit apunta al
 * mismo dominio desde el que se descargó (hoy el de Vercel; mañana el propio).
 */
export async function GET(req: Request) {
  if (!(await haySesion())) return new Response("No autorizado.", { status: 401 });
  const sitio = new URL(req.url).origin;
  return new Response(kitImpresora(sitio), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${NOMBRE_KIT}"`,
      "Cache-Control": "no-store",
    },
  });
}
