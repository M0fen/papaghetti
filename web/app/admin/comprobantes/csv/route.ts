import { haySesion } from "@/lib/sesion";
import { comprobantesEntre } from "@/lib/catalog";
import { leerFiltros, rangoDe, filtrarComprobantes, csvComprobantes, nombreCsv } from "@/lib/comprobantes";

export const dynamic = "force-dynamic";

/**
 * EL CSV PARA EL CONTADOR: lo que se ve en /admin/comprobantes, tal cual, en un
 * archivo que Excel abre con doble clic. Lee los MISMOS parámetros de la URL con la
 * MISMA función que la página, así "lo que ves es lo que exportas" por construcción.
 *
 * Un route handler no pasa por el layout que muestra el Login: la puerta va aquí.
 * Sin sesión, 401; los teléfonos de los clientes no salen sin llave.
 */
export async function GET(req: Request) {
  if (!(await haySesion())) return new Response("No autorizado.", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = leerFiltros(sp);
  const rango = rangoDe(f.p, new Date(), f.desde, f.hasta);
  const filas = filtrarComprobantes(await comprobantesEntre(rango.desde, rango.hasta), {
    q: f.q,
    situacion: f.s,
    metodo: f.m,
    tipo: f.t,
    canal: f.c,
  });
  return new Response(csvComprobantes(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreCsv(rango)}"`,
      "Cache-Control": "no-store",
    },
  });
}
