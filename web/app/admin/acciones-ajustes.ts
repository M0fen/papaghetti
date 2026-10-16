"use server";

import { revalidatePath } from "next/cache";
import { updateAjustes } from "@/lib/catalog";
import { limpiarUsuarios, MAX_USUARIOS } from "@/lib/usuarios";
import { guard, avisar, intentar } from "./_guardia";

/**
 * Ajustes → Usuarios del panel. Los nombres que salen en la pantalla de entrada para
 * que el historial diga quién cobró, quién canceló y quién tocó la despensa. Antes
 * vivían en una variable de Vercel y cambiar uno exigía volver a desplegar.
 */
export async function guardarUsuariosAction(formData: FormData) {
  if (!(await guard())) return;
  const lista = limpiarUsuarios(formData.getAll("usuario").map(String));
  if (!lista.length) {
    await avisar("Deja al menos un nombre: sin nadie en la lista no hay cómo entrar.");
    return;
  }
  const sobran = formData.getAll("usuario").filter((x) => String(x).trim()).length > MAX_USUARIOS;
  await intentar(
    () => updateAjustes({ usuarios: lista }, "Cambió los usuarios del panel"),
    sobran ? `Guardados los primeros ${MAX_USUARIOS} nombres` : "Usuarios guardados",
  );
  revalidatePath("/admin", "layout");
}
