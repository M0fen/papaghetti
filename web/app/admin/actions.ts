"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  haySesion,
  usuarioSesion,
  abrirSesion,
  cerrarSesion,
  claveCorrecta,
  sesionConfigurada,
  loginBloqueado,
  registrarFallo,
  limpiarIntentos,
} from "@/lib/sesion";
import {
  updateIngrediente,
  updateEnredo,
  resetCatalog,
  abrirCaja,
  cerrarCaja,
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
  guardarFoto,
  guardarAdicionalConfig,
  borrarAdicionalConfig,
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

/**
 * Puerta única del panel. La sesión ahora va FIRMADA (ver lib/sesion.ts): antes esto
 * era `cookie === "1"`, así que cualquiera escribía esa cookie a mano y era dueño del
 * negocio. Y de paso RENUEVA el turno: la cookie de 8 h no se refrescaba nunca, así que
 * el operario se quedaba fuera a media tarde sin explicación.
 */
async function guard(): Promise<boolean> {
  const u = await usuarioSesion();
  if (!u) return false;
  await abrirSesion(u); // renueva el turno SIN cambiar de persona
  return true;
}

/**
 * Aviso efímero para el operario. Las 31 acciones hacían `return` mudo cuando algo
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

/**
 * Sanea la foto que llega de un formulario.
 *
 * `foto` se guardaba tal cual: cualquier cadena, de cualquier tamaño. La compresión a
 * 640px vive solo en el navegador (ImageUpload), o sea del lado de quien envía. Un data
 * URI de 5MB se replicaba en cada snapshot de undo y acababa dentro del HTML público.
 */
async function fotoValida(raw: FormData | string | null, id = "ficha"): Promise<string | undefined> {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return undefined;
  const esData = /^data:image\/(jpeg|png|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(v);
  const esUrl = /^https?:\/\/[^\s"'<>]+$/i.test(v) || /^\/[^\s"'<>]*$/.test(v);
  if (!esData && !esUrl) return undefined;
  if (v.length > 300_000) return undefined; // ~220KB de imagen: de sobra para una ficha
  /* La imagen se sube como archivo aparte y aquí solo queda su dirección: dentro del
     cerebro pesaba más que todo lo demás junto. */
  return guardarFoto(v, id);
}

/** Ejecuta una mutación del cerebro y convierte su error en un aviso visible. */
async function intentar(fn: () => Promise<unknown>, exito?: string): Promise<boolean> {
  try {
    await fn();
    if (exito) await avisar(exito, "ok");
    return true;
  } catch (e) {
    await avisar(e instanceof Error ? e.message : "No se pudo completar la acción.");
    return false;
  }
}

function reflejar() {
  // Un solo cambio → se refleja en la web pública y en el propio admin.
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function login(formData: FormData) {
  // Freno de fuerza bruta: antes se podían probar contraseñas sin límite ni castigo.
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  if (loginBloqueado(ip)) redirect("/admin?error=espera");
  if (!sesionConfigurada()) redirect("/admin?error=config");

  const pass = String(formData.get("password") ?? "").trim();
  if (!claveCorrecta(pass)) {
    registrarFallo(ip);
    redirect("/admin?error=1");
  }
  limpiarIntentos(ip);
  await abrirSesion(String(formData.get("usuario") ?? ""));
  redirect("/admin");
}

export async function logout() {
  await cerrarSesion();
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
    foto: await fotoValida(String(formData.get("foto") ?? ""), id),
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
    foto: await fotoValida(String(formData.get("foto") ?? ""), id),
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
    /* Los tres del comprobante. Se imprimían desde siempre y no se podían escribir. */
    razonSocial: String(formData.get("razonSocial") ?? "").trim().slice(0, 80),
    nit: String(formData.get("nit") ?? "").trim().slice(0, 24),
    telefonoLocal: String(formData.get("telefonoLocal") ?? "").trim().slice(0, 24),
    horarios: String(formData.get("horarios") ?? "").trim(),
    numMesas: Math.max(0, Math.min(60, Number(formData.get("numMesas") ?? 0))),
    impuestoPct: Math.max(0, Math.min(30, Number(formData.get("impuestoPct") ?? 0))),
    propinaSugeridaPct: Math.max(0, Math.min(30, Number(formData.get("propinaSugeridaPct") ?? 0))),
    instagram: String(formData.get("instagram") ?? "").trim().replace(/^@/, ""),
    rappi: String(formData.get("rappi") ?? "").trim(),
    costoDomicilio: Math.max(0, Number(formData.get("costoDomicilio") ?? 0)),
    pedidoMinimo: Math.max(0, Number(formData.get("pedidoMinimo") ?? 0)),
    controlarStock: formData.get("controlarStock") === "on",
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
  // `monto` = lo que se pagó de verdad. Si viene, actualiza el costo unitario solo.
  const monto = Number(formData.get("monto") ?? 0);
  await intentar(
    () => abastecerInsumo(id, cantidad, monto > 0 ? monto : undefined),
    monto > 0 ? `Entró mercancía por ${monto.toLocaleString("es-CO")} COP` : "Despensa actualizada",
  );
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
  try {
    const r = await abastecerTodoAPar();
    await avisar(
      r.repuestos > 0
        ? `Se repusieron ${r.repuestos} de ${r.total} insumos a su nivel estándar`
        : `Los ${r.total} insumos ya estaban en su nivel estándar: no hubo nada que reponer`,
      "ok",
    );
  } catch (e) {
    await avisar(e instanceof Error ? e.message : "No se pudo abastecer.");
  }
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
  // deleteInsumo ahora se NIEGA si alguna receta lo usa: ese "no" tiene que llegar
  // a la pantalla, no morir en un 500.
  await intentar(() => deleteInsumo(id), "Insumo eliminado");
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
    foto: await fotoValida(String(formData.get("foto") ?? ""), nombre),
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
    foto: await fotoValida(String(formData.get("foto") ?? ""), nombre),
  });
  reflejar();
  revalidatePath("/admin/menu");
}

/* ------- Arqueo de caja ------- */

export async function abrirCajaAction(formData: FormData) {
  if (!(await guard())) return;
  const base = Number(formData.get("base") ?? 0);
  if (!Number.isFinite(base) || base < 0) {
    await avisar("La base de caja tiene que ser un número.");
    return;
  }
  const quien = (await usuarioSesion()) ?? undefined;
  const ok = await intentar(
    () => abrirCaja(base, quien),
    "Caja abierta. Que sea un buen turno.",
  );
  if (ok) revalidatePath("/admin");
}

export async function cerrarCajaAction(formData: FormData) {
  if (!(await guard())) return;
  const quien = (await usuarioSesion()) ?? undefined;
  const contado = Number(formData.get("contado") ?? NaN);
  if (!Number.isFinite(contado) || contado < 0) {
    await avisar("Escribe cuánto contaste en el cajón.");
    return;
  }
  const ok = await intentar(
    () =>
      cerrarCaja({
        contado,
        salidas: Number(formData.get("salidas") ?? 0) || 0,
        notas: String(formData.get("notas") ?? ""),
        usuario: quien,
      }),
    "Caja cerrada.",
  );
  if (ok) revalidatePath("/admin");
}

/* ------- Precios al vuelo, desde la pantalla de Pedidos ------- */

/**
 * CAMBIAR NOMBRE Y PRECIO SIN SALIR DE PEDIDOS.
 *
 * Sube un ingrediente, corrige un nombre mal escrito, ajusta el plato del día: eso pasa
 * mientras se está tomando pedidos, no en un rato tranquilo en /admin/menu. Obligar a
 * cambiar de pantalla, buscar la ficha entre cuarenta y volver acababa en el precio
 * viejo cobrado toda la noche.
 *
 * Es a propósito MÁS ESTRECHA que `savePrecio`: esa lee emoji/foto/activo/agotado del
 * formulario, así que un formulario mínimo le borraría la foto y desactivaría la ficha.
 * Aquí solo se tocan los dos campos que el operario está mirando.
 */
export async function precioRapidoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  const esPlato = formData.get("tipo") === "plato";
  const nombre = String(formData.get("nombre") ?? "").trim();
  const precio = Math.max(0, Math.round(Number(formData.get("precio") ?? 0)));
  if (!id || !nombre || !Number.isFinite(precio)) {
    await avisar("Falta el nombre o el precio no es un número.");
    return;
  }
  const ok = await intentar(
    () =>
      esPlato ? updateEnredo(id, { nombre, precio }) : updateIngrediente(id, { nombre, precio }),
    `${nombre} · ${precio.toLocaleString("es-CO")}`,
  );
  if (!ok) return;
  reflejar();
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/menu");
  revalidatePath("/pedir");
}

/**
 * DAR DE ALTA UN PRODUCTO CON LO MÍNIMO: nombre, precio y en qué parte de la carta va.
 *
 * Un plato creado así no lleva componentes, o sea que no descuenta despensa — igual que
 * los platos de cocina que ya existen. Se vende bien y su ficha técnica se completa
 * después en /admin/recetas, sin bloquear la venta de hoy.
 */
export async function productoRapidoAction(formData: FormData) {
  if (!(await guard())) return;
  const nombre = String(formData.get("nombre") ?? "").trim();
  const precio = Math.max(0, Math.round(Number(formData.get("precio") ?? 0)));
  const donde = String(formData.get("donde") ?? "topping");
  if (!nombre) {
    await avisar("Ponle un nombre al producto.");
    return;
  }
  const ok = await intentar(
    () =>
      donde === "plato"
        ? createEnredo({
            nombre,
            gancho: "",
            baseId: "",
            proteinaId: "",
            toppingIds: [],
            precio,
          })
        : createIngrediente({
            categoria: donde as Categoria,
            nombre,
            precio,
            emoji: "",
          }),
    `Listo: ${nombre} ya se puede vender.`,
  );
  if (!ok) return;
  reflejar();
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/menu");
  revalidatePath("/admin/recetas");
  revalidatePath("/pedir");
}

export async function eliminarEnredoAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteEnredo(id);
  reflejar();
  revalidatePath("/admin/menu");
}

/* ------------------------------------------------------------------ */
/* ADICIONALES DE UN TOQUE (Precios)                                  */
/* ------------------------------------------------------------------ */

/**
 * Crea o edita un adicional guardado: nombre, precio final y si se prepara en cocina.
 * El precio se lee como lo escribe la gente ("9.000", "$9000"): solo cuentan los dígitos.
 */
export async function adicionalConfigAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "").trim() || undefined;
  const nombre = String(formData.get("nombre") ?? "");
  const precio = Number(String(formData.get("precio") ?? "").replace(/\D/g, ""));
  const cocina = formData.get("cocina") === "on" || formData.get("cocina") === "1";
  /* Una casilla desmarcada NO viaja en el formulario: sin esta marca no se distingue
     "lo apagaron" de "este formulario no tiene casilla" (el de crear, que nace activo). */
  const activo = formData.get("_edicion") ? formData.get("activo") === "on" : undefined;
  const ok = await intentar(
    () => guardarAdicionalConfig({ id, nombre, precio, cocina, activo }),
    id ? `Adicional guardado: ${nombre.trim()}` : `Nuevo adicional: ${nombre.trim()}`,
  );
  if (!ok) return;
  revalidatePath("/admin/precios");
  revalidatePath("/admin/pedidos");
}

export async function borrarAdicionalConfigAction(formData: FormData) {
  if (!(await guard())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const ok = await intentar(() => borrarAdicionalConfig(id), "Adicional borrado");
  if (!ok) return;
  revalidatePath("/admin/precios");
  revalidatePath("/admin/pedidos");
}
