"use server";

import { ajustarPrecios } from "@/lib/catalog";
import { esGrupoAjuste, leerPct, textoListo, PCT_MAX_AJUSTE, type EstadoAjuste } from "@/lib/precios";
import { guard, avisar, intentar, reflejarSitio } from "./_guardia";

/**
 * Precios → Subir o bajar precios. Una sola acción y un solo commit para todo el lote:
 * las acciones de un mismo navegador corren de a una, y un lote de cuarenta guardados
 * habría llenado la pila de deshacer con cuarenta fotos.
 *
 * La pantalla la usa con `useActionState`, así que devuelve un estado pequeño (nunca el
 * catálogo): con él sabe si salió bien —y entonces se vacía— o qué decir junto al botón.
 * El aviso de arriba del panel se pone igual, por si se mira desde otro lado.
 */
export async function ajustarPreciosAction(prev: EstadoAjuste, formData: FormData): Promise<EstadoAjuste> {
  const vez = Number.isFinite(prev?.vez) ? prev.vez : 0;
  const marca = String(formData.get("marca") ?? "").slice(0, 20);
  if (!(await guard())) return { vez, marca, error: "La sesión se cerró. Vuelve a entrar al panel." };

  /* Todo lo que llega se valida aquí: los tipos de TypeScript no existen en el
     navegador, y un formulario se puede mandar a mano. */
  const falla = async (error: string): Promise<EstadoAjuste> => {
    await avisar(error);
    return { vez, marca, error };
  };
  const sentido = String(formData.get("sentido") ?? "");
  if (sentido !== "subir" && sentido !== "bajar") return falla("Elige si los precios suben o bajan.");
  const magnitud = leerPct(formData.get("pct"));
  if (!Number.isFinite(magnitud)) return falla("Escribe el porcentaje: por ejemplo, 5.");
  if (magnitud <= 0) return falla("El porcentaje tiene que ser mayor que cero.");
  if (magnitud > PCT_MAX_AJUSTE) {
    return falla(`De a ${PCT_MAX_AJUSTE} % como mucho: más que eso casi siempre es un cero de más.`);
  }
  const grupos = [...new Set(formData.getAll("grupo").map(String).filter(esGrupoAjuste))];
  if (!grupos.length) return falla("Elige al menos un grupo de precios.");
  const firma = String(formData.get("firma") ?? "");
  if (!/^\d{1,4}-[0-9a-f]{8}$/.test(firma)) return falla("Mira la vista previa antes de aplicar.");

  const pct = sentido === "bajar" ? -magnitud : magnitud;
  let n = 0;
  let error = "";
  const ok = await intentar(async () => {
    try {
      n = (await ajustarPrecios({ pct, grupos, firma })).n;
    } catch (e) {
      error = e instanceof Error ? e.message : "";
      throw e; // `intentar` lo convierte en el aviso de arriba
    }
  });
  if (!ok) return { vez, marca, error: error || "No se pudieron ajustar los precios." };
  const listo = textoListo(n, pct);
  await avisar(listo, "ok");
  // Cambian la portada, el QR, la caja y la hoja de precios: todo se vuelve a armar.
  reflejarSitio();
  return { vez: vez + 1, listo };
}
