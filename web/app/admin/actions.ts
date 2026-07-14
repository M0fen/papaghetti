"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  updateIngrediente,
  updateEnredo,
  resetCatalog,
  restock,
  updateLead,
  updateAjustes,
  toggleAbierto,
  createIngrediente,
  deleteIngrediente,
  createEnredo,
  deleteEnredo,
  createInsumo,
  updateInsumo,
  deleteInsumo,
  abastecerInsumo,
  abastecerAPar,
  abastecerTodoAPar,
  setReceta,
  upsertPromo,
  deletePromo,
  togglePromo,
  crearGasto,
  deleteMovimiento,
  deshacer,
  rehacer,
} from "@/lib/catalog";
import type {
  EstadoLead,
  Categoria,
  UnidadInsumo,
  InsumoCategoria,
  PromoTono,
  RecetaItem,
  GastoCategoria,
} from "@/lib/menu";

const COOKIE = "pg_admin";

async function guard(): Promise<boolean> {
  return (await cookies()).get(COOKIE)?.value === "1";
}

function reflejar() {
  // Un solo cambio → se refleja en la web pública y en el propio admin.
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function login(formData: FormData) {
  const pass = String(formData.get("password") ?? "").trim();
  // .trim() en el valor esperado por si la env var llegó con salto de línea/espacios.
  const expected = (process.env.ADMIN_PASSWORD ?? "papaghetti").trim();
  if (pass !== expected) redirect("/admin?error=1");
  (await cookies()).set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/admin");
}

/** Sección Menú: nombre + emoji + precio + disponibilidad (no toca stock). */
export async function savePrecio(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateIngrediente(id, {
    nombre: String(formData.get("nombre") ?? "").trim() || "—",
    emoji: String(formData.get("emoji") ?? "").trim() || "🍽️",
    foto: String(formData.get("foto") ?? "").trim() || undefined,
    precio: Math.max(0, Number(formData.get("precio") ?? 0)),
    activo: formData.get("activo") === "on",
    agotado: formData.get("agotado") === "on",
  });
  reflejar();
  revalidatePath("/admin/menu");
}

/** Sección Inventario: stock + disponibilidad (no toca precio). */
export async function saveStock(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateIngrediente(id, {
    stock: Math.max(0, Number(formData.get("stock") ?? 0)),
    parStock: Math.max(0, Number(formData.get("parStock") ?? 0)),
    activo: formData.get("activo") === "on",
    agotado: formData.get("agotado") === "on",
  });
  reflejar();
  revalidatePath("/admin/inventario");
}

export async function saveEnredo(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateEnredo(id, {
    nombre: String(formData.get("nombre") ?? ""),
    gancho: String(formData.get("gancho") ?? ""),
    precio: Math.max(0, Number(formData.get("precio") ?? 0)),
    foto: String(formData.get("foto") ?? "").trim() || undefined,
  });
  reflejar();
  revalidatePath("/admin/menu");
}

export async function resetTodo() {
  if (!(await guard())) return;
  await resetCatalog();
  reflejar();
}

export async function restockAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  const cantidad = Number(formData.get("cantidad") ?? 0);
  if (!id || !cantidad) return;
  await restock(id, cantidad);
  reflejar();
  revalidatePath("/admin/inventario");
}

export async function updateLeadEstado(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "") as EstadoLead;
  if (!id || !estado) return;
  await updateLead(id, { estado });
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}

export async function saveAjustes(formData: FormData) {
  if (!(await guard())) return;
  await updateAjustes({
    negocio: String(formData.get("negocio") ?? "").trim() || "Papaghetti",
    whatsapp: String(formData.get("whatsapp") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim(),
    horarios: String(formData.get("horarios") ?? "").trim(),
    numMesas: Math.max(0, Math.min(60, Number(formData.get("numMesas") ?? 0))),
    impuestoPct: Math.max(0, Math.min(30, Number(formData.get("impuestoPct") ?? 0))),
    propinaSugeridaPct: Math.max(0, Math.min(30, Number(formData.get("propinaSugeridaPct") ?? 0))),
    instagram: String(formData.get("instagram") ?? "").trim().replace(/^@/, ""),
    costoDomicilio: Math.max(0, Number(formData.get("costoDomicilio") ?? 0)),
    pedidoMinimo: Math.max(0, Number(formData.get("pedidoMinimo") ?? 0)),
  });
  revalidatePath("/", "layout"); // afecta sitio y panel
}

/** Abre/cierra el negocio con un clic (lo más usado a diario). */
export async function toggleAbiertoAction() {
  if (!(await guard())) return;
  await toggleAbierto();
  revalidatePath("/", "layout");
  revalidatePath("/admin/ajustes");
}

/* ------- Despensa: insumos + abastecer ------- */

function reflejarInv() {
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/recetas");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function abastecerAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  const cantidad = Number(formData.get("cantidad") ?? 0);
  if (!id || !cantidad) return;
  await abastecerInsumo(id, cantidad);
  reflejarInv();
}

export async function abastecerAParAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await abastecerAPar(id);
  reflejarInv();
}

export async function abastecerTodoAParAction() {
  if (!(await guard())) return;
  await abastecerTodoAPar();
  reflejarInv();
}

export async function saveInsumoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const costoRaw = formData.get("costo");
  await updateInsumo(id, {
    nombre: String(formData.get("nombre") ?? "").trim() || "Insumo",
    categoria: String(formData.get("categoria") ?? "otro") as InsumoCategoria,
    unidad: String(formData.get("unidad") ?? "und") as UnidadInsumo,
    stock: Math.max(0, Number(formData.get("stock") ?? 0)),
    parStock: Math.max(0, Number(formData.get("parStock") ?? 0)),
    costo: costoRaw != null && costoRaw !== "" ? Math.max(0, Number(costoRaw)) : undefined,
    activo: formData.get("activo") === "on",
  });
  reflejarInv();
}

export async function crearInsumoAction(formData: FormData) {
  if (!(await guard())) return;
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;
  const costoRaw = formData.get("costo");
  await createInsumo({
    nombre,
    categoria: String(formData.get("categoria") ?? "otro") as InsumoCategoria,
    unidad: String(formData.get("unidad") ?? "und") as UnidadInsumo,
    stock: Math.max(0, Number(formData.get("stock") ?? 0)),
    parStock: Math.max(0, Number(formData.get("parStock") ?? 0)),
    costo: costoRaw != null && costoRaw !== "" ? Math.max(0, Number(costoRaw)) : undefined,
    emoji: String(formData.get("emoji") ?? "").trim(),
  });
  reflejarInv();
}

export async function eliminarInsumoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteInsumo(id);
  reflejarInv();
}

/* ------- Recetas (ficha técnica) + disponibilidad de platos ------- */

export async function guardarRecetaAction(formData: FormData) {
  if (!(await guard())) return;
  const ingredienteId = String(formData.get("ingredienteId") ?? "");
  if (!ingredienteId) return;
  const insumoIds = formData.getAll("insumoId").map(String);
  const cantidades = formData.getAll("cantidad").map((c) => Number(c));
  const receta: RecetaItem[] = insumoIds
    .map((insumoId, i) => ({ insumoId, cantidad: cantidades[i] ?? 0 }))
    .filter((r) => r.insumoId && r.cantidad > 0);
  await setReceta(ingredienteId, receta);
  reflejarInv();
}

export async function setDisponibilidadAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateIngrediente(id, {
    activo: formData.get("activo") === "on",
    agotado: formData.get("agotado") === "on",
  });
  reflejarInv();
}

/* ------- Promociones ------- */

export async function guardarPromoAction(formData: FormData) {
  if (!(await guard())) return;
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return;
  await upsertPromo({
    id: String(formData.get("id") ?? "").trim(),
    texto,
    emoji: String(formData.get("emoji") ?? "").trim() || undefined,
    tono: String(formData.get("tono") ?? "oro") as PromoTono,
    banner: formData.get("banner") === "on",
    activo: formData.get("activo") === "on",
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/ajustes");
}

export async function eliminarPromoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deletePromo(id);
  revalidatePath("/", "layout");
  revalidatePath("/admin/ajustes");
}

export async function togglePromoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await togglePromo(id);
  revalidatePath("/", "layout");
  revalidatePath("/admin/ajustes");
}

/* ------- Contabilidad ------- */

export async function crearGastoAction(formData: FormData) {
  if (!(await guard())) return;
  const concepto = String(formData.get("concepto") ?? "").trim();
  const monto = Number(formData.get("monto") ?? 0);
  if (!concepto || !monto) return;
  const fechaRaw = String(formData.get("fecha") ?? "").trim();
  await crearGasto({
    concepto,
    monto,
    categoria: String(formData.get("categoria") ?? "otro") as GastoCategoria,
    fecha: fechaRaw || undefined,
  });
  revalidatePath("/admin/reportes");
  revalidatePath("/admin");
}

export async function eliminarMovimientoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteMovimiento(id);
  revalidatePath("/admin/reportes");
  revalidatePath("/admin");
}

/* ------- Historial · deshacer / rehacer ------- */

export async function deshacerAction() {
  if (!(await guard())) return;
  await deshacer();
  revalidatePath("/", "layout"); // afecta sitio y todo el panel
}

export async function rehacerAction() {
  if (!(await guard())) return;
  await rehacer();
  revalidatePath("/", "layout");
}

/* ------- CRUD (control del operador) ------- */

export async function crearIngredienteAction(formData: FormData) {
  if (!(await guard())) return;
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;
  await createIngrediente({
    categoria: String(formData.get("categoria") ?? "topping") as Categoria,
    nombre,
    precio: Number(formData.get("precio") ?? 0),
    emoji: String(formData.get("emoji") ?? "").trim(),
    foto: String(formData.get("foto") ?? "").trim() || undefined,
  });
  reflejar();
  revalidatePath("/admin/menu");
  revalidatePath("/admin/recetas");
}

export async function eliminarIngredienteAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteIngrediente(id);
  reflejar();
  revalidatePath("/admin/menu");
  revalidatePath("/admin/inventario");
}

export async function crearEnredoAction(formData: FormData) {
  if (!(await guard())) return;
  const nombre = String(formData.get("nombre") ?? "").trim();
  const baseId = String(formData.get("baseId") ?? "");
  const proteinaId = String(formData.get("proteinaId") ?? "");
  if (!nombre || !baseId || !proteinaId) return;
  await createEnredo({
    nombre,
    gancho: String(formData.get("gancho") ?? "").trim(),
    baseId,
    proteinaId,
    toppingIds: String(formData.get("toppingIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    precio: Number(formData.get("precio") ?? 0),
    foto: String(formData.get("foto") ?? "").trim() || undefined,
  });
  reflejar();
  revalidatePath("/admin/menu");
}

export async function eliminarEnredoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteEnredo(id);
  reflejar();
  revalidatePath("/admin/menu");
}
