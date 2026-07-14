"use server";

import { revalidatePath } from "next/cache";
import { crearLead, type NuevoLead } from "@/lib/catalog";

/** Público: captura de lead desde el sitio (Club Papaghetti). */
export async function capturarLead(input: NuevoLead) {
  if (!input.nombre?.trim()) return { ok: false as const };
  const lead = await crearLead(input);
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  return { ok: true as const, id: lead.id };
}
