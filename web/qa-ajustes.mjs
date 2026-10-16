/**
 * LA BASE DE LA ENTREGA: ajustes sanos, ayudantes de dos bases, usuarios y un Deshacer
 * que no devuelve la despensa que gastaron los pedidos.
 *
 *   node --import ./qa-ts.mjs qa-ajustes.mjs
 *
 * Escribe en data/catalog.json (el cerebro LOCAL) y lo deja como estaba al final, pase
 * lo que pase. qa-ts.mjs se niega a correr si el almacén de producción está a la vista.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-ajustes";
if (fs.existsSync(RESPALDO)) {
  console.error(`Hay un respaldo viejo (${RESPALDO}): restáuralo o bórralo antes de correr esta suite.`);
  process.exit(1);
}
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);

let ok = 0;
let mal = 0;
const si = (n, c, d = "") => {
  c ? ok++ : mal++;
  console.log(`  ${c ? "✅" : "❌"} ${n}${d && !c ? " · " + d : ""}`);
};
const eq = (n, a, b) => si(n, JSON.stringify(a) === JSON.stringify(b), `dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)}`);
const rechaza = async (n, fn, frag) => {
  try {
    await fn();
    si(n, false, "no lanzó");
  } catch (e) {
    const m = String(e?.message ?? e);
    si(n, !frag || m.toLowerCase().includes(frag.toLowerCase()), m);
  }
};

try {
  const menu = await import("./lib/menu.ts");
  const precios = await import("./lib/precios.ts");
  const usuarios = await import("./lib/usuarios.ts");

  console.log("\n═══ AJUSTES SANOS (normalizarAjustes) ═══");
  const n0 = menu.normalizarAjustes(undefined);
  eq("sin nada: los de fábrica, con hasta 2 bases y mitad y mitad", [n0.negocio, n0.basesMax, n0.cobroBases], ["Papaghetti", 2, "mitad"]);
  eq("es idempotente", JSON.stringify(menu.normalizarAjustes(n0)), JSON.stringify(n0));
  const raro = menu.normalizarAjustes({ negocio: "X", basesMax: 7, cobroBases: "otro", comprobante: null, sitio: "texto", promos: "no", usuarios: ["Ana", "ana", "Sra. Luz", "", "  "] });
  eq("valores raros vuelven a lo de fábrica", [raro.basesMax, raro.cobroBases, Array.isArray(raro.promos)], [2, "mitad", true]);
  eq("una sección que no es objeto desaparece (en vez de reventar)", ["comprobante" in raro, "sitio" in raro], [false, false]);
  eq("usuarios limpios: sin repetidos ni puntos", raro.usuarios, ["Ana", "Sra Luz"]);
  eq("basesMax 1 se respeta", menu.normalizarAjustes({ basesMax: 1, cobroBases: "suma" }).basesMax, 1);
  eq("un campo desconocido sobrevive (versiones distintas conviven)", menu.normalizarAjustes({ campoFuturo: 3 }).campoFuturo, 3);
  eq("basesMaxDe / cobroBasesDe con nada", [menu.basesMaxDe(undefined), menu.cobroBasesDe(null)], [2, "mitad"]);

  console.log("\n═══ USUARIOS DEL PANEL ═══");
  eq("sin puntos ni símbolos", usuarios.nombreUsuario("  Sra.  Luz! <b> "), "Sra Luz b");
  eq("tope de 24", usuarios.nombreUsuario("x".repeat(40)).length, 24);
  eq("sin repetidos (sin importar mayúsculas) y con tope de 8", usuarios.limpiarUsuarios(["A", "a", ..."BCDEFGHIJ".split("")]).length, 8);
  eq("sin nombres propios: el respaldo", usuarios.usuariosDe({ usuarios: [] }), usuarios.USUARIOS);
  eq("con nombres propios: esos", usuarios.usuariosDe({ usuarios: ["Carlos", "Ana"] }), ["Carlos", "Ana"]);

  console.log("\n═══ DOS BASES: EL PRECIO, UNA SOLA VEZ ═══");
  const A = { id: "a", nombre: "Spaghetti", precio: 15900, categoria: "base" };
  const B = { id: "b", nombre: "Papa criolla", precio: 16900, categoria: "base" };
  eq("una base: su precio (en los dos modos)", [precios.precioBases([A], "mitad"), precios.precioBases([A], "suma")], [15900, 15900]);
  eq("mitad: la más cara", precios.precioBases([A, B], "mitad"), 16900);
  eq("suma: las dos", precios.precioBases([A, B], "suma"), 32800);
  eq("el orden de los toques no cambia el precio", precios.precioBases([B, A], "mitad"), 16900);
  eq("sin base: 0", precios.precioBases([], "mitad"), 0);
  eq("las elegidas, en el orden de la carta", precios.basesElegidas(["b", "a"], [A, B]).map((x) => x.id), ["a", "b"]);
  eq("el nombre del plato", precios.nombreBases([A, B]), "Spaghetti / Papa criolla");
  eq("mitad: UN renglón a la más cara", precios.renglonesBases([A, B], "mitad"), [{ nombre: "Spaghetti / Papa criolla · mitad y mitad", precio: 16900 }]);
  eq("suma: dos renglones, cada uno a su precio", precios.renglonesBases([A, B], "suma").map((r) => r.precio), [15900, 16900]);
  eq("la suma de los renglones ES lo que se cobra", precios.renglonesBases([A, B], "mitad").reduce((s, r) => s + r.precio, 0), precios.precioBases([A, B], "mitad"));
  eq("calcularTotales con dos bases (mitad)", precios.calcularTotales({ bases: [A, B], cobroBases: "mitad", impuestoPct: 8 }).subtotal, 16900);
  eq("calcularTotales con dos bases (suma)", precios.calcularTotales({ bases: [A, B], cobroBases: "suma", impuestoPct: 8 }).subtotal, 32800);
  eq("calcularTotales con `base` de siempre", precios.calcularTotales({ base: A, impuestoPct: 8 }).subtotal, 15900);

  console.log("\n═══ TOCAR UNA BASE (alternarBase) ═══");
  eq("máx 1: tocar otra la reemplaza", precios.alternarBase(["a"], "b", 1), ["b"]);
  eq("máx 1: tocar la elegida no hace nada", precios.alternarBase(["a"], "a", 1), ["a"]);
  eq("máx 2: tocar otra la agrega", precios.alternarBase(["a"], "b", 2), ["a", "b"]);
  eq("máx 2: con dos, tocar una la quita", precios.alternarBase(["a", "b"], "a", 2), ["b"]);
  eq("máx 2: la única elegida no se suelta", precios.alternarBase(["a"], "a", 2), ["a"]);
  eq("máx 2: lleno, la última cede su sitio", precios.alternarBase(["a", "b"], "c", 2), ["a", "c"]);

  // ─────────────────────────── con el cerebro local ───────────────────────────
  const cat = await import("./lib/catalog.ts");
  const leer = () => JSON.parse(fs.readFileSync(FILE, "utf8"));
  const original = leer();
  // Punto de partida conocido: sin pilas ni pedidos, abierto y con control de despensa.
  fs.writeFileSync(
    FILE,
    JSON.stringify({ ...original, pedidos: [], movimientos: [], historial: [], undo: [], redo: [], archivoMeses: [] }, null, 2),
  );
  await new Promise((r) => setTimeout(r, 2100)); // que caduque el memo de 2 s
  await cat.updateAjustes({ abierto: true, controlarStock: true });

  console.log("\n═══ GUARDAR UNA SECCIÓN NO BORRA LAS DEMÁS ═══");
  const LOGO = "data:image/png;base64," + "A".repeat(4000);
  await cat.updateAjustes({ comprobante: { mensajeCierre: "Vuelve pronto", logo: LOGO } }, "Cambió el comprobante");
  await cat.updateAjustes({ comprobante: { mensajeCierre: "¡Hasta mañana!" } }, "Cambió el comprobante");
  let d = leer();
  eq("guardar el mensaje NO borra el logo", [d.ajustes.comprobante.mensajeCierre, d.ajustes.comprobante.logo === LOGO], ["¡Hasta mañana!", true]);
  await cat.updateAjustes({ sitio: { portada: { antetitulo: "Hola" }, historia: { titulo: "Nuestra historia" } } }, "Cambió el sitio");
  await cat.updateAjustes({ sitio: { portada: { antetitulo: "Hola de nuevo" } } }, "Cambió el sitio");
  d = leer();
  eq("guardar la portada NO borra la historia", [d.ajustes.sitio.portada.antetitulo, d.ajustes.sitio.historia?.titulo], ["Hola de nuevo", "Nuestra historia"]);
  eq("el historial dice qué se cambió", d.historial[0].texto.startsWith("Cambió el sitio"), true);
  eq("el logo NO viaja en las fotos de deshacer", (d.undo ?? []).some((s) => JSON.stringify(s).includes("A".repeat(200))), false);
  await cat.updateAjustes({ usuarios: ["Carlos", "carlos", "Sra. Luz"] }, "Cambió los usuarios del panel");
  eq("usuarios guardados limpios", leer().ajustes.usuarios, ["Carlos", "Sra Luz"]);
  eq("la pantalla de entrada los ofrece", await cat.usuariosDelPanel(), ["Carlos", "Sra Luz"]);
  const pub = await cat.getCatalogPublico();
  eq("lo público trae las dos opciones de bases", [pub.ajustes.basesMax, pub.ajustes.cobroBases], [2, "mitad"]);
  eq("y NO los usuarios ni el comprobante", ["usuarios" in pub.ajustes, "comprobante" in pub.ajustes], [false, false]);

  console.log("\n═══ LO QUE PASÓ NO OCUPA LA PILA DE DESHACER ═══");
  // Una base con receta propia (una porción = 10 g de un insumo de prueba).
  const base = leer().bases.find((b) => b.activo !== false);
  await cat.updateIngrediente(base.id, { agotado: false, activo: true });
  await cat.createInsumo({ nombre: "QA ajustes insumo", unidad: "g", stock: 100, parStock: 100 });
  const insId = leer().insumos.find((i) => i.nombre === "QA ajustes insumo").id;
  await cat.setReceta(base.id, [{ insumoId: insId, cantidad: 10 }]);
  const stock = () => leer().insumos.find((i) => i.id === insId).stock;
  const pila = () => (leer().undo ?? []).length;
  const pilaAntes = pila();
  const p1 = await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" });
  eq("un pedido no empuja una foto a la pila", pila(), pilaAntes);
  await cat.avanzarPedido(p1.id);
  await cat.cobrarPedido(p1.id, "nequi", 0, 0);
  eq("ni avanzarlo ni cobrarlo", pila(), pilaAntes);
  eq("pero sí quedan en el historial", leer().historial.some((h) => h.texto.startsWith("Cobró")), true);

  console.log("\n═══ DESHACER UN PRECIO NO DEVUELVE LA DESPENSA GASTADA ═══");
  const precioAntes = leer().bases.find((b) => b.id === base.id).precio;
  await cat.updateIngrediente(base.id, { precio: 77777 });
  eq("la foto lleva la etiqueta de la acción", leer().undo.at(-1).etiqueta, `Editó "${base.nombre}"`);
  const antesPedidos = stock();
  await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" });
  await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" });
  const trasPedidos = stock();
  si("los dos pedidos gastaron despensa", Math.abs(antesPedidos - trasPedidos - 20) < 0.001, `${antesPedidos} → ${trasPedidos}`);
  await cat.deshacer();
  d = leer();
  eq("el precio volvió", d.bases.find((b) => b.id === base.id).precio, precioAntes);
  eq("la despensa gastada NO volvió", stock(), trasPedidos);
  eq("los pedidos siguen ahí", d.pedidos.length, 3);
  eq("el historial dice qué se deshizo", d.historial[0].texto.startsWith(`↩︎ Deshizo: Editó "${base.nombre}"`), true);
  eq("Rehacer quedó con la misma etiqueta", d.redo.at(-1).etiqueta, `Editó "${base.nombre}"`);
  await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" });
  eq("un pedido no borra lo que había para rehacer", (leer().redo ?? []).length, 1);
  const trasOtro = stock();
  await cat.rehacer();
  eq("Rehacer vuelve a poner el precio", leer().bases.find((b) => b.id === base.id).precio, 77777);
  eq("y tampoco toca la despensa", stock(), trasOtro);

  console.log("\n═══ DESHACER UN CONTEO DE DESPENSA SOLO REVIERTE EL CONTEO ═══");
  const x0 = stock();
  await cat.updateInsumo(insId, { stock: 500 }); // "conté 500"
  await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" }); // gasta 10
  await cat.deshacer(); // deshace el conteo, no el pedido
  eq("vuelve a lo de antes del conteo, menos lo que gastó el pedido", stock(), Number((x0 - 10).toFixed(3)));
  await cat.rehacer();
  eq("rehacer el conteo: 500 menos lo gastado", stock(), 490);

  console.log("\n═══ EL AGOTADO: el de ahora, salvo que la acción deshecha lo haya cambiado ═══");
  await cat.updateInsumo(insId, { stock: 15 }); // alcanza para 1 porción
  await cat.updateIngrediente(base.id, { precio: 66666 }); // la acción que se va a deshacer
  await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" }); // quedan 5 → se agota solo
  eq("el pedido lo dejó agotado", leer().bases.find((b) => b.id === base.id).agotado, true);
  await cat.deshacer();
  eq("deshacer el precio NO lo des-agota", leer().bases.find((b) => b.id === base.id).agotado, true);
  await cat.updateInsumo(insId, { stock: 200 });
  await cat.updateIngrediente(base.id, { agotado: true }); // «se acabó», a mano
  await cat.deshacer();
  eq("deshacer el «se acabó» sí lo quita", leer().bases.find((b) => b.id === base.id).agotado, false);

  console.log("\n═══ FOTOS VIEJAS (sin vivoTras) ═══");
  {
    const doc = leer();
    const vieja = { ...doc, undo: undefined, redo: undefined, historial: undefined, pedidos: [], movimientos: [], leads: [], arqueos: [] };
    vieja.insumos = doc.insumos.map((i) => (i.id === insId ? { ...i, stock: 9999 } : i));
    delete vieja.vivoTras;
    fs.writeFileSync(FILE, JSON.stringify({ ...doc, undo: [vieja], redo: [] }, null, 2));
    await new Promise((r) => setTimeout(r, 2100));
    const vivo = stock();
    await cat.deshacer();
    eq("una foto de antes conserva el stock de ahora (no resucita 9999)", stock(), vivo);
  }

  console.log("\n═══ EL LOGO SOBREVIVE A DESHACER ═══");
  await cat.updateAjustes({ comprobante: { logo: LOGO } }, "Cambió el comprobante");
  await cat.updateAjustes({ comprobante: { mensajeCierre: "Otra cosa" } }, "Cambió el comprobante");
  await cat.deshacer();
  d = leer();
  eq("deshacer el mensaje deja el logo", [d.ajustes.comprobante.mensajeCierre, d.ajustes.comprobante.logo === LOGO], ["¡Hasta mañana!", true]);
  await rechaza("no hay nada raro que deshacer en una pila vacía", async () => {
    fs.writeFileSync(FILE, JSON.stringify({ ...leer(), undo: [], redo: [] }, null, 2));
    await new Promise((r) => setTimeout(r, 2100));
    const r = await cat.deshacer();
    if (!r || !Array.isArray(r.pedidos)) throw new Error("no devolvió el catálogo");
    throw new Error("ok: devolvió el catálogo sin tocar");
  }, "ok:");
} catch (e) {
  mal++;
  console.log("  ❌ reventó:", e?.stack ?? e);
} finally {
  if (fs.existsSync(RESPALDO)) {
    fs.copyFileSync(RESPALDO, FILE);
    fs.unlinkSync(RESPALDO);
  }
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
