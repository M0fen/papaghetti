"use server";

import { revalidatePath } from "next/cache";
import { updateAjustes } from "@/lib/catalog";
import { formularioComprobante, logoPngValido, validarComprobante } from "@/lib/papel";
import { guard, avisar, intentar, reflejarSitio } from "./_guardia";

/**
 * AJUSTES → COMPROBANTE. Tres acciones finas: los textos, poner un logo y quitarlo. La
 * validación vive en lib/papel.ts (la misma que corre el editor mientras se escribe):
 * aquí solo se abre la puerta, se valida lo que llegó y se guarda.
 *
 * El logo va aparte a propósito: viaja como imagen (hasta ~60 KB) y no tiene por qué
 * subir cada vez que se corrige una tilde del mensaje de cierre, ni bajar si los textos
 * no pasan la validación.
 */

/** Los datos del negocio en el papel, el mensaje de cierre, las líneas al pie y los datos del cliente. */
export async function guardarComprobanteAction(formData: FormData) {
  if (!(await guard())) return;
  const v = validarComprobante(formularioComprobante(formData));
  if (!v.ok) {
    await avisar(v.error);
    return;
  }
  /* Nombre, razón social, NIT, dirección y teléfono son los campos DE SIEMPRE (los lee
     también el sitio); lo propio del papel va en `comprobante`, que se mezcla con lo
     guardado: el logo no se toca desde aquí. */
  await intentar(
    () => updateAjustes({ ...v.datos, comprobante: v.comprobante }, "Cambió el comprobante"),
    v.avisos.length ? `Comprobante guardado. ${v.avisos.join(" ")}` : "Comprobante guardado",
  );
  // El nombre, la dirección y el teléfono también salen en la portada, que es estática.
  reflejarSitio();
}

/** El logo propio del papel: un PNG en blanco y negro, preparado en el navegador. */
export async function guardarLogoComprobanteAction(formData: FormData) {
  if (!(await guard())) return;
  const v = logoPngValido(formData.get("logo"));
  if (!v.ok) {
    await avisar(v.error);
    return;
  }
  /* Dentro de Ajustes y NUNCA por guardarFoto: en producción esa función lo subiría al
     almacén público como archivo de otro dominio, y una imagen de otro dominio "ensucia"
     el lienzo del tiquete (ni se descarga ni se imprime). Como data URL pequeña se dibuja
     igual en todas partes, y Deshacer no lo copia en sus fotos (RUTAS_IMAGEN_AJUSTES). */
  await intentar(
    () => updateAjustes({ comprobante: { logo: v.logo } }, "Cambió el logo del comprobante"),
    "Logo guardado: ya sale en el comprobante",
  );
  revalidatePath("/admin", "layout");
}

/** Vuelve el logo de la casa. */
export async function quitarLogoComprobanteAction() {
  if (!(await guard())) return;
  await intentar(
    () => updateAjustes({ comprobante: { logo: undefined } }, "Volvió el logo de la casa al comprobante"),
    "Listo: el comprobante vuelve a llevar el logo de la casa",
  );
  revalidatePath("/admin", "layout");
}
