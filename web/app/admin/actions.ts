"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
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
  usuariosDelPanel,
  guardarAdicionalConfig,
  borrarAdicionalConfig,
} from "@/lib/catalog";
import { guard, avisar, intentar, reflejar, reflejarSitio, fotoValida } from "./_guardia";
import type {
  EstadoLead,
  Categoria,
  UnidadInsumo,
  InsumoCategoria,
  PromoTono,
  RecetaItem,
  GastoCategoria,
} from "@/lib/menu";

/* La puerta, el aviso, el "intentar" y el saneo de fotos viven en ./_guardia.ts: un
   archivo "use server" solo puede exportar acciones, y cada sección nueva del panel
   tiene su propio archivo de acciones. */

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
  /* QUIÉN entra: solo un nombre de la lista (Ajustes → Usuarios del panel). Un nombre
     inventado en el formulario no puede firmar el historial. */
  const lista = await usuariosDelPanel();
  const pedido = String(formData.get("usuario") ?? "");
  await abrirSesion(lista.includes(pedido) ? pedido : lista[0]);
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

/**
 * "Cobro y servicio" en Ajustes: SOLO estos campos. Antes este formulario reescribía
 * también los datos del negocio y `propinaSugeridaPct`, que no tenía casilla: cada
 * "Guardar" la dejaba en 0. Ahora cada sección del panel guarda lo suyo y nada más
 * (comprobante y sitio tienen sus propias acciones).
 */
export async function saveAjustes(formData: FormData) {
  if (!(await guard())) return;
  const num = (k: string, min: number, max: number) => {
    const n = Number(String(formData.get(k) ?? "").replace(",", "."));
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
  };
  await intentar(
    () =>
      updateAjustes(
        {
          numMesas: Math.round(num("numMesas", 0, 60)),
          impuestoPct: num("impuestoPct", 0, 30),
          costoDomicilio: Math.round(num("costoDomicilio", 0, 1_000_000)),
          pedidoMinimo: Math.round(num("pedidoMinimo", 0, 10_000_000)),
          controlarStock: formData.get("controlarStock") === "on",
          basesMax: formData.get("basesMax") === "1" ? 1 : 2,
          cobroBases: formData.get("cobroBases") === "suma" ? "suma" : "mitad",
        },
        "Cambió el cobro y servicio",
      ),
    "Cobro y servicio guardados",
  );
  reflejarSitio(); // afecta sitio y panel
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
  // Si choca con otra escritura, el operario lo lee en vez de ver una pantalla de error.
  await intentar(() => deshacer());
  reflejarSitio(); // afecta sitio y todo el panel
}

export async function rehacerAction() {
  if (!(await guard())) return;
  await intentar(() => rehacer());
  reflejarSitio();
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
