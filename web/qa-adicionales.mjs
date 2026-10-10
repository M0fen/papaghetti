/**
 * ADICIONALES · PRECIO VISTO = PRECIO PAGADO.
 *
 * Contra el cerebro directamente (sin navegador). Lo que se prueba es lo que un cajero
 * vive: "$50.000 de almuerzos" sube la cuenta exactamente $50.000, una limonada de coco
 * sale en cocina y unos almuerzos no, y el papel dice lo mismo que la carta.
 *
 *   node --import ./qa-ts.mjs qa-adicionales.mjs
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-adicionales";
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);

const cat = await import("./lib/catalog.ts");
const menu = await import("./lib/menu.ts");
const precios = await import("./lib/precios.ts");
const comprobantes = await import("./lib/comprobantes.ts");
const escpos = await import("./lib/tiquete-escpos.ts");

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
const buscar = async (id) => (await cat.getCatalog()).pedidos.find((x) => x.id === id);

// La prueba carga su propia despensa: no depende de que el catálogo traiga stock.
{
  const previo = await cat.getCatalog();
  for (const i of previo.insumos) await cat.abastecerInsumo(i.id, 500);
}
const doc = await cat.getCatalog();
const pct = doc.ajustes.impuestoPct ?? 0;
const plato = doc.enredos.find((e) => !e.baseId && !e.proteinaId && e.activo !== false);
const base = (v) => Math.round(v / (1 + pct / 100));

console.log("\n═══ UNA CUENTA HECHA SOLO DE ADICIONALES ═══");
const almuerzos = await cat.crearComanda({
  lineas: [],
  adicionales: [{ nombre: "  Almuerzos   ejecutivos ", precio: 50000 }],
  canal: "salon",
  tipo: "mesa",
  referencia: "Grupo empresa",
});
eq("el total es EXACTAMENTE lo que se tecleó", almuerzos.total, 50000);
eq("el nombre llega limpio", almuerzos.items[0].nombre, "Almuerzos ejecutivos");
si("queda marcado como adicional", almuerzos.items[0].adicional === true);
eq("no gasta despensa", almuerzos.componentes.length, 0);
eq("no es un plato para la cocina", menu.platosDe(almuerzos), 0);
eq("ni sale en la pantalla de cocina", menu.lineasCocina(almuerzos).length, 0);
eq("entra ya entregado: la cocina no tiene nada que hacer", almuerzos.estado, "entregado");
eq("pero queda por cobrar", almuerzos.pago, "pendiente");
eq("el impuesto va dentro", [almuerzos.subtotal + almuerzos.impuesto, almuerzos.impuesto], [50000, 50000 - base(50000)]);

console.log("\n═══ PLATO + ADICIONALES, UNO A COCINA Y OTRO NO ═══");
const mixta = await cat.crearComanda({
  lineas: [{ enredoId: plato.id, cantidad: 1 }],
  adicionales: [
    { nombre: "Limonada de coco", precio: 9000, cantidad: 2, cocina: true },
    { nombre: "Empaque", precio: 1500 },
  ],
  canal: "salon",
  tipo: "llevar",
});
eq("total = plato + 2 limonadas + empaque, a precio de carta", mixta.total, plato.precio + 18000 + 1500);
eq("la cocina ve el plato y las limonadas, no el empaque", menu.lineasCocina(mixta).map((l) => l.nombre), [plato.nombre, "Limonada de coco"]);
eq("y cuenta un solo plato", menu.platosDe(mixta), 1);
eq("va a la cocina como siempre", mixta.estado, "recibido");

console.log("\n═══ LO QUE ESCRIBE UN HUMANO CON PRISA ═══");
await rechaza("sin concepto", () => cat.crearComanda({ lineas: [], adicionales: [{ nombre: "  ", precio: 5000 }], canal: "salon", tipo: "llevar" }), "concepto");
await rechaza("valor en cero", () => cat.crearComanda({ lineas: [], adicionales: [{ nombre: "Agua", precio: 0 }], canal: "salon", tipo: "llevar" }), "mayor que cero");
await rechaza("un cero de más", () => cat.crearComanda({ lineas: [], adicionales: [{ nombre: "Agua", precio: 50000000 }], canal: "salon", tipo: "llevar" }), "cero de más");
await rechaza("comanda vacía", () => cat.crearComanda({ lineas: [], adicionales: [], canal: "salon", tipo: "llevar" }), "vacía");
{
  /* El camino PÚBLICO (QR, web) no puede colar adicionales: crearPedido arma la comanda
     con sus propios campos y no reenvía lo que sobre. */
  const b = doc.bases[0].id, pr = doc.proteinas[0].id;
  const pub = await cat.crearPedido({ baseId: b, proteinaId: pr, toppingIds: [], tipo: "llevar", adicionales: [{ nombre: "Gratis", precio: 1 }] });
  si("el QR no puede meter adicionales", !pub.items.some((l) => l.adicional));
}

console.log("\n═══ SUMAR A UNA CUENTA ABIERTA ═══");
{
  const pd = await cat.crearComanda({ lineas: [{ enredoId: plato.id, cantidad: 1 }], canal: "qr", tipo: "mesa", referencia: "Mesa 4" });
  await cat.agregarAdicional(pd.id, { nombre: "Limonada de coco", precio: 9000 });
  let p = await buscar(pd.id);
  eq("sube exactamente lo del adicional", p.total, pd.total + 9000);
  await cat.agregarAdicional(pd.id, { nombre: "limonada de coco", precio: 9000 });
  p = await buscar(pd.id);
  eq("el mismo concepto suma cantidad, no otro renglón", [p.items.length, p.items[1].cantidad], [2, 2]);
  eq("y el total sigue cuadrando al peso", p.total, plato.precio + 18000);
  await cat.agregarAdicional(pd.id, { nombre: "Almuerzos", precio: 50000 });
  p = await buscar(pd.id);
  eq("$50.000 de almuerzos son $50.000 más", p.total, plato.precio + 18000 + 50000);
  eq("contabilidad: subtotal − descuento + impuesto = total", p.subtotal - p.descuento + p.impuesto, p.total);

  console.log("\n═══ QUITAR ═══");
  await rechaza("un plato no se quita: se cancela", () => cat.quitarAdicional(pd.id, 0, plato.nombre), "no está");
  await cat.quitarAdicional(pd.id, 2, "Almuerzos");
  p = await buscar(pd.id);
  eq("quitar los almuerzos los saca de la cuenta", [p.items.length, p.total], [2, plato.precio + 18000]);
  await cat.quitarAdicional(pd.id, 99, "Limonada de coco"); // posición vieja: lo encuentra por nombre
  p = await buscar(pd.id);
  eq("aunque la posición haya cambiado, quita el correcto", p.items.map((l) => l.nombre), [plato.nombre]);

  console.log("\n═══ COBRAR CON DESCUENTO ═══");
  await cat.agregarAdicional(pd.id, { nombre: "Almuerzos", precio: 50000 });
  await cat.cobrarPedido(pd.id, "efectivo", 0, 5000, false, "Acuerdo con el cliente");
  p = await buscar(pd.id);
  eq("5.000 de descuento son 5.000 menos en el total", p.total, plato.precio + 50000 - 5000);
  eq("y se guarda como se tecleó", p.descuentoFinal, 5000);
  eq("la contabilidad sigue cuadrando", p.subtotal - p.descuento + p.impuesto, p.total);
  await rechaza("una cuenta cobrada ya no se toca", () => cat.agregarAdicional(pd.id, { nombre: "Agua", precio: 3000 }), "ya se cobró");

  console.log("\n═══ EL PAPEL DICE LO MISMO QUE LA CARTA ═══");
  const c = precios.cuentaImpresa(p);
  eq("cada renglón a precio de carta", c.lineas.map((l) => l.importe), [plato.precio, 50000]);
  eq("sumas: subtotal y descuento", c.sumas, [["Subtotal", plato.precio + 50000], ["Descuento", -5000]]);
  eq("total del papel = total cobrado", c.total, p.total);
  si("el impuesto se dice incluido", Boolean(c.nota && c.nota.includes("Incluye") && c.nota.includes(menu.formatCOP(p.impuesto))), c.nota);
  const wa = comprobantes.textoComprobante(p);
  si("el WhatsApp trae los almuerzos con su valor", wa.includes("Almuerzos") && wa.includes(menu.formatCOP(50000)));
  si("y el total cobrado", wa.includes(`*TOTAL: ${menu.formatCOP(p.total)}*`));
  const txt = escpos.armarTiquete(p, doc.ajustes, 32).map((r) => r.texto).join("\n");
  si("el tiquete de texto también", txt.includes("Almuerzos") && txt.includes(menu.formatCOP(50000)), "");
}

console.log("\n═══ UNA CUENTA DE ANTES (impuesto sumado encima) ═══");
{
  const pd = await cat.crearComanda({ lineas: [{ enredoId: plato.id, cantidad: 1 }], canal: "salon", tipo: "llevar", cliente: "VIEJO" });
  // Se la deja como la habría guardado la versión anterior.
  const d = await cat.getCatalog();
  const v = d.pedidos.find((x) => x.id === pd.id);
  delete v.impuestoIncluido;
  delete v.bruto;
  delete v.descuentoFinal;
  for (const l of v.items) delete l.precioFinal;
  v.subtotal = base(plato.precio);
  v.impuesto = Math.round((v.subtotal * pct) / 100);
  v.total = v.subtotal + v.impuesto;
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
  await new Promise((r) => setTimeout(r, 2200)); // el cerebro guarda 2 s de memo
  const antes = await buscar(pd.id);
  const papelViejo = precios.cuentaImpresa(antes);
  eq("su papel sigue siendo el de siempre", papelViejo.sumas[0][0], "Consumo");
  await cat.agregarAdicional(pd.id, { nombre: "Gaseosa", precio: 4000 });
  const tras = await buscar(pd.id);
  si("al tocarla pasa a precios finales", tras.impuestoIncluido === true);
  si("y sube lo de la gaseosa (± 1 peso de redondeo)", Math.abs(tras.total - (antes.total + 4000)) <= 1, `${antes.total} → ${tras.total}`);
}

console.log("\n═══ LOS ADICIONALES DE UN TOQUE (Precios) ═══");
{
  await cat.guardarAdicionalConfig({ nombre: "Limonada de coco", precio: 9000, cocina: true });
  let lista = (await cat.getCatalog()).ajustes.adicionales;
  eq("se crea con su precio y su cocina", lista.map((a) => [a.nombre, a.precio, a.cocina]), [["Limonada de coco", 9000, true]]);
  await rechaza("el mismo nombre dos veces", () => cat.guardarAdicionalConfig({ nombre: "LIMONADA DE COCO", precio: 8000 }), "ya existe");
  const id = lista[0].id;
  await cat.guardarAdicionalConfig({ id, nombre: "Limonada de coco", precio: 9500, cocina: true, activo: false });
  lista = (await cat.getCatalog()).ajustes.adicionales;
  eq("se edita el precio y se puede apagar", [lista[0].precio, lista[0].activo], [9500, false]);
  await cat.borrarAdicionalConfig(id);
  eq("y se borra", (await cat.getCatalog()).ajustes.adicionales.length, 0);
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
if (fs.existsSync(RESPALDO)) {
  fs.copyFileSync(RESPALDO, FILE);
  fs.unlinkSync(RESPALDO);
  console.log("(catálogo restaurado a su estado original)");
}
process.exit(mal ? 1 : 0);
