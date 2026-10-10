/**
 * COMANDA DE VARIOS PLATOS · DEVOLUCIÓN DE DINERO · ARQUEO DE CAJA.
 *
 * Contra el cerebro directamente (sin navegador): lo que importa aquí es que los
 * números y la despensa cuadren, no cómo se pintan.
 *
 *   node --import ./qa-ts.mjs qa-comanda.mjs
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-comanda";
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);

const cat = await import("./lib/catalog.ts");
const menu = await import("./lib/menu.ts");
const precios = await import("./lib/precios.ts");

let ok = 0, mal = 0;
const eq = (n, a, b) => {
  const bien = JSON.stringify(a) === JSON.stringify(b);
  bien ? ok++ : mal++;
  console.log(`  ${bien ? "✅" : "❌"} ${n}${bien ? "" : `  (dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)})`}`);
};
const si = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? " · " + d : ""}`); };
const rechaza = async (n, fn, frag) => {
  try {
    await fn();
    mal++;
    console.log(`  ❌ ${n} · no rechazó`);
  } catch (e) {
    const bien = e.message.toLowerCase().includes(frag.toLowerCase());
    bien ? ok++ : mal++;
    console.log(`  ${bien ? "✅" : "❌"} ${n} · ${e.message}`);
  }
};

/* La prueba CARGA SU PROPIA DESPENSA. Antes daba por hecho que el catálogo traía
   stock, así que el día que el negocio se puso en cero para abrir de verdad, la suite
   se cayó entera con un "cannot read properties of undefined". Una prueba no puede
   depender de que haya inventario: se lo pone ella. */
{
  const previo = await cat.getCatalog();
  for (const i of previo.insumos) await cat.abastecerInsumo(i.id, 500);
}

const doc = await cat.getCatalog();
const baseId = doc.bases[0].id;
const protId = doc.proteinas[0].id;
const topId = doc.toppings.find((t) => t.categoria !== "salsa" && !t.agotado).id;
const plato = doc.enredos.find((e) => !e.baseId && !e.proteinaId && e.activo !== false);
const pct = doc.ajustes.impuestoPct ?? 0;

console.log("\n═══ UNA COMANDA CON VARIOS PLATOS ═══");
const b = doc.bases[0], pr = doc.proteinas[0], tp = doc.toppings.find((t) => t.id === topId);
/* PRECIO VISTO = PRECIO PAGADO: la caja vale lo que suman sus piezas en la carta y el
   plato lo que dice la carta; el impuesto va dentro y se separa al final. */
const precioCaja = b.precio + pr.precio + tp.precio;
const precioPlato = plato.precio;
const bruto = precioCaja * 2 + precioPlato;
const base = (v) => Math.round(v / (1 + pct / 100));

const comanda = await cat.crearComanda({
  lineas: [
    { baseId, proteinaIds: [protId], toppingIds: [topId], cantidad: 2 },
    { enredoId: plato.id, cantidad: 1 },
  ],
  canal: "salon",
  tipo: "mesa",
  referencia: "Mesa de prueba",
});
si("la comanda se creó", Boolean(comanda.id));
eq("lleva dos renglones", comanda.items.length, 2);
eq("el primero va por 2", comanda.items[0].cantidad, 2);
eq("lo que vio el cliente = 2 cajas + 1 plato, a precio de carta", comanda.bruto, bruto);
eq("y es EXACTAMENTE el total (sin envío): nada se suma encima", comanda.total, bruto);
eq("el impuesto va dentro", comanda.impuesto, bruto - base(bruto));
eq("subtotal = la base sin impuesto", comanda.subtotal, base(bruto));
eq("y la contabilidad cuadra: subtotal + impuesto = total", comanda.subtotal + comanda.impuesto, comanda.total);
eq("cada renglón guarda su precio de carta", comanda.items.map((i) => i.precioFinal), [precioCaja, precioPlato]);
si("y queda marcado como pedido de precio final", comanda.impuestoIncluido === true);
eq("cuenta 3 platos", menu.platosDe(comanda), 3);
eq("los componentes se repiten por porción", comanda.componentes.filter((c) => c === baseId).length, 2);
si("el resumen dice cuántos platos van", comanda.base === "3 platos", comanda.base);

console.log("\n═══ EL PEDIDO DE UN PLATO SIGUE SIENDO EL DE SIEMPRE ═══");
const uno = await cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [topId], tipo: "llevar" });
eq("una caja cuesta lo que suma la carta", uno.total, precioCaja);
eq("el resumen conserva el nombre de la base", uno.base, b.nombre);
eq("y un solo renglón", uno.items.length, 1);
si("lineasDe() de un pedido viejo (sin items) sintetiza uno", (() => {
  const viejo = { ...uno, items: undefined };
  const l = menu.lineasDe(viejo);
  return l.length === 1 && l[0].nombre === b.nombre && l[0].precio === uno.subtotal;
})());

console.log("\n═══ LA DESPENSA SE VALIDA SUMANDO TODA LA COMANDA ═══");
/* La prueba precisa del conteo agregado: se deja la despensa con EXACTAMENTE lo justo
   para 3 porciones de la base y se piden 4, repartidas en dos renglones de 2. Cada
   renglón cabe por separado; juntos no. Es el fallo que se quería evitar: validando
   renglón a renglón, la comanda pasaba y la mesa se quedaba a medias con la despensa
   ya descontada. */
const receta = (await cat.getCatalog()).bases.find((b) => b.id === baseId).receta ?? [];
for (const r of receta) {
  const doc2 = await cat.getCatalog();
  const ins = doc2.insumos.find((i) => i.id === r.insumoId);
  await cat.updateInsumo(ins.id, { stock: Number((r.cantidad * 3).toFixed(3)) });
}
const alcanzaPara3 = await cat.crearComanda({
  lineas: [{ baseId, proteinaIds: [protId], toppingIds: [], cantidad: 1 }],
  tipo: "llevar",
});
si("una porción sí cabe cuando hay para 3", Boolean(alcanzaPara3.id));

const antes = (await cat.getCatalog()).insumos.map((i) => ({ id: i.id, s: i.stock }));
await rechaza(
  "dos renglones de 2 cuando solo quedan 2 porciones",
  () =>
    cat.crearComanda({
      lineas: [
        { baseId, proteinaIds: [protId], toppingIds: [], cantidad: 2 },
        { baseId, proteinaIds: [protId], toppingIds: [], cantidad: 2 },
      ],
      tipo: "llevar",
    }),
  "no nos alcanza para 4",
);
const despues = (await cat.getCatalog()).insumos.map((i) => ({ id: i.id, s: i.stock }));
si("y NO tocó la despensa al rechazarla", JSON.stringify(antes) === JSON.stringify(despues));

console.log("\n═══ DEVOLVER EL DINERO DE UN COBRO ═══");
await cat.cobrarPedido(uno.id, "efectivo", 0, 0);
await rechaza("devolver sin motivo", () => cat.devolverPedido(uno.id, "   "), "por qué");
const trasDev = await cat.devolverPedido(uno.id, "El plato salió frío");
const dev = trasDev.pedidos.find((p) => p.id === uno.id);
eq("queda marcado como devuelto", dev.pago, "devuelto");
eq("y cancelado, para salir de los reportes", dev.estado, "cancelado");
eq("guarda cuánto salió", dev.devolucion.monto, uno.total);
si("guarda el motivo", dev.devolucion.motivo === "El plato salió frío");
si("guarda la fecha de la devolución", Boolean(dev.devolucion.fecha));
si("deja de contar como venta", menu.esVenta(dev) === false);
await rechaza("devolver dos veces", () => cat.devolverPedido(uno.id, "otra vez"), "no está cobrado");
await rechaza(
  "devolver uno que nunca se cobró",
  () => cat.devolverPedido(comanda.id, "nada"),
  "no está cobrado",
);

console.log("\n═══ ARQUEO DE CAJA ═══");
await cat.cobrarPedido(comanda.id, "efectivo", 0, 0);
const c1 = await cat.abrirCaja(50000, "Usuario 1");
si("la caja queda abierta", Boolean(cat.arqueoAbierto(c1)));
await rechaza("abrir dos veces el mismo día", () => cat.abrirCaja(10000), "ya está abierta");

const hoy = precios.diaNegocio();
const esp = cat.esperadoEnCaja(await cat.getCatalog(), hoy, 50000, 0);
si("lo esperado incluye la base", esp.base === 50000);
si("y el efectivo cobrado hoy", esp.cobrado >= comanda.total, `cobrado=${esp.cobrado}`);
si("el pedido devuelto NO suma", esp.cobrado === comanda.total, `cobrado=${esp.cobrado} vs comanda=${comanda.total}`);
eq("total esperado = base + cobrado", esp.total, 50000 + esp.cobrado);

const cerrado = await cat.cerrarCaja({ contado: esp.total - 3000, salidas: 0, notas: "prueba", usuario: "Usuario 1" });
const arq = (cerrado.arqueos ?? [])[0];
eq("congela lo esperado", arq.esperado, esp.total);
eq("y calcula el faltante", arq.diferencia, -3000);
si("queda cerrado", Boolean(arq.cerradoEn));
await rechaza("cerrar sin caja abierta", () => cat.cerrarCaja({ contado: 1 }), "no hay una caja abierta");

console.log("\n=== CORREGIR UN COBRO MAL TECLEADO ===");
{
  const pd = await cat.crearComanda({ lineas: [{ enredoId: plato.id, cantidad: 1 }], canal: "salon", tipo: "llevar", cliente: "CORRIGE" });
  await cat.cobrarPedido(pd.id, "nequi", 0, 0);
  const antes = (await cat.getCatalog()).pedidos.find((x) => x.id === pd.id);
  si("al cobrar se guarda la hora del cobro", Boolean(antes.pagadoEn), antes.pagadoEn);
  eq("y la tarifa de impuesto con la que se calculo", antes.impuestoPct, pct);
  await rechaza("cobrar dos veces sin corregir", () => cat.cobrarPedido(pd.id, "efectivo", 0, 0), "Corregir cobro");
  await cat.cobrarPedido(pd.id, "efectivo", 0, 0, true);
  const luego = (await cat.getCatalog()).pedidos.find((x) => x.id === pd.id);
  eq("corrigiendo si cambia el metodo", luego.metodoPago, "efectivo");
  eq("y la hora del cobro NO se mueve: el dinero entro cuando entro", luego.pagadoEn, antes.pagadoEn);
  si("sigue siendo una venta, no una anulacion", luego.estado !== "cancelado" && luego.pago === "pagado");
}

console.log("\n=== UN DESCUENTO SIN MOTIVO NO ENTRA ===");
{
  const pd = await cat.crearComanda({ lineas: [{ enredoId: plato.id, cantidad: 1 }], canal: "salon", tipo: "llevar", cliente: "DESCUENTO" });
  await rechaza("rebajar sin decir por que", () => cat.cobrarPedido(pd.id, "efectivo", 0, 2000), "motivo");
  si("y el pedido sigue sin cobrar", (await cat.getCatalog()).pedidos.find((x) => x.id === pd.id).pago === "pendiente");
  await cat.cobrarPedido(pd.id, "efectivo", 0, 2000, false, "Plato mal salido");
  const d = (await cat.getCatalog()).pedidos.find((x) => x.id === pd.id);
  eq("con motivo si, y queda guardado", [d.descuentoFinal, d.motivoDescuento], [2000, "Plato mal salido"]);
  eq("el descuento son 2.000 menos de lo que dice la carta", d.total, plato.precio - 2000);
  eq("y su parte sin impuesto baja la base", d.subtotal - d.descuento, base(plato.precio - 2000));
  await cat.cobrarPedido(pd.id, "efectivo", 0, 0, true);
  eq("al quitar el descuento se va tambien el motivo", (await cat.getCatalog()).pedidos.find((x) => x.id === pd.id).motivoDescuento, undefined);
}

console.log("\n=== EL ARQUEO CUENTA POR LA FECHA DEL COBRO ===");
{
  const hoyStr = precios.diaNegocio();
  const antesCobrado = cat.esperadoEnCaja(await cat.getCatalog(), hoyStr, 0, 0).cobrado;
  const viejo = await cat.crearComanda({ lineas: [{ enredoId: plato.id, cantidad: 1 }], canal: "salon", tipo: "llevar", cliente: "DEUDA VIEJA" });
  const d2 = JSON.parse(fs.readFileSync(FILE, "utf8"));
  d2.pedidos.find((q) => q.id === viejo.id).creadoEn = new Date(Date.now() - 3 * 86400000).toISOString();
  fs.writeFileSync(FILE, JSON.stringify(d2, null, 2), "utf8");
  const fresco = await import(`./lib/catalog.ts?fresco=${Date.now()}caja`);
  await fresco.cobrarPedido(viejo.id, "efectivo", 0, 0);
  const doc2 = await fresco.getCatalog();
  const p2 = doc2.pedidos.find((x) => x.id === viejo.id);
  si("el pedido es de otro dia", precios.diaNegocio(p2.creadoEn) !== hoyStr, precios.diaNegocio(p2.creadoEn));
  eq("pero se cobro hoy", precios.diaNegocio(p2.pagadoEn), hoyStr);
  eq("y el cajon de HOY espera ese efectivo", fresco.esperadoEnCaja(doc2, hoyStr, 0, 0).cobrado - antesCobrado, p2.total);
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
if (fs.existsSync(RESPALDO)) {
  fs.copyFileSync(RESPALDO, FILE);
  fs.unlinkSync(RESPALDO);
  console.log("(catálogo restaurado a su estado original)");
}
process.exit(mal ? 1 : 0);
