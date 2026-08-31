/**
 * PRUEBAS DEL CICLO DE PEDIDO contra el cerebro REAL.
 *
 * Trabaja sobre data/catalog.json de verdad (es la única forma de probar el camino
 * completo: leer → validar → consumir despensa → persistir), así que hace copia de
 * seguridad al empezar y la restaura pase lo que pase.
 *
 *   node --import ./qa-ts.mjs qa-pedidos.mjs
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const BACKUP = FILE + ".qa-backup";
fs.copyFileSync(FILE, BACKUP);

let ok = 0,
  mal = 0;
const check = (nombre, cond, detalle = "") => {
  cond ? ok++ : mal++;
  console.log(`  ${cond ? "✅" : "❌"} ${nombre}${detalle ? " · " + detalle : ""}`);
};
/** Espera que la promesa REVIENTE, y que el mensaje diga lo correcto. */
const rechaza = async (nombre, fn, fragmento) => {
  try {
    await fn();
    check(nombre, false, "no rechazó (debería)");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    check(nombre, fragmento ? m.toLowerCase().includes(fragmento.toLowerCase()) : true, m.slice(0, 80));
  }
};

try {
  const cat = await import("./lib/catalog.ts");
  const original = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const baseId = original.bases[0].id;
  const protId = original.proteinas[0].id;
  const topOk = original.toppings.find((t) => !t.agotado && t.activo !== false).id;
  const topAgotado = original.toppings.find((t) => t.agotado)?.id;

  console.log("\n═══ RECHAZA LO QUE NO PUEDE CUMPLIR ═══");
  await rechaza(
    "un ingrediente que no existe",
    () => cat.crearPedido({ baseId: "no-existe-xyz", proteinaId: protId, toppingIds: [], tipo: "llevar" }),
    "ya no existe",
  );
  if (topAgotado) {
    await rechaza(
      `un topping AGOTADO (${topAgotado})`,
      () => cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [topAgotado], tipo: "llevar" }),
      "se nos acabó",
    );
  }
  await rechaza(
    "un pedido sin proteína",
    () => cat.crearPedido({ baseId, proteinaId: "", toppingIds: [], tipo: "llevar" }),
    "proteína",
  );
  await rechaza(
    "un domicilio SIN dirección",
    () => cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "domicilio", direccion: "" }),
    "dirección",
  );
  await rechaza(
    "una mesa que no existe (999)",
    () => cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "mesa", mesa: 999 }),
    "mesa",
  );

  console.log("\n═══ EL NEGOCIO CERRADO NO VENDE ═══");
  await cat.updateAjustes({ abierto: false });
  await rechaza(
    "con el local cerrado",
    () => cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "llevar" }),
    "cerrados",
  );
  await cat.updateAjustes({ abierto: true });

  console.log("\n═══ EL PEDIDO BUENO SÍ ENTRA, Y CON LOS NÚMEROS BIEN ═══");
  const antes = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const insumoDeLaBase = antes.bases.find((b) => b.id === baseId)?.receta?.[0];
  const stockAntes = insumoDeLaBase
    ? antes.insumos.find((i) => i.id === insumoDeLaBase.insumoId).stock
    : null;

  const p1 = await cat.crearPedido({
    baseId,
    proteinaId: protId,
    toppingIds: [topOk],
    tipo: "domicilio",
    direccion: "Cra 1 #2-3, Pereira",
    notas: "sin cebolla",
    idemKey: "QA-CLAVE-1",
  });
  check("el pedido se creó", !!p1.id);
  check("guarda la dirección", p1.direccion === "Cra 1 #2-3, Pereira");
  check("guarda la nota de cocina", p1.notas === "sin cebolla");
  check("guarda los ids de los componentes", (p1.componentes ?? []).length === 3, JSON.stringify(p1.componentes));
  check(
    "TOTAL = subtotal + impuesto + domicilio",
    p1.total === p1.subtotal + p1.impuesto + (p1.domicilio ?? 0),
    `${p1.subtotal}+${p1.impuesto}+${p1.domicilio} = ${p1.total}`,
  );
  check("cobra el domicilio", (p1.domicilio ?? 0) > 0, `$${p1.domicilio}`);

  if (insumoDeLaBase) {
    const desp = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const ahora = desp.insumos.find((i) => i.id === insumoDeLaBase.insumoId).stock;
    check(
      "descontó la despensa real",
      Math.abs(stockAntes - ahora - insumoDeLaBase.cantidad) < 0.001,
      `${stockAntes} → ${ahora} (−${insumoDeLaBase.cantidad})`,
    );
  }

  console.log("\n═══ IDEMPOTENCIA: el doble envío es UN pedido ═══");
  const p2 = await cat.crearPedido({
    baseId,
    proteinaId: protId,
    toppingIds: [topOk],
    tipo: "domicilio",
    direccion: "Cra 1 #2-3, Pereira",
    idemKey: "QA-CLAVE-1",
  });
  check("devuelve el MISMO pedido", p2.id === p1.id, `${p1.id} vs ${p2.id}`);
  const trasIdem = JSON.parse(fs.readFileSync(FILE, "utf8"));
  check(
    "no descontó la despensa dos veces",
    trasIdem.pedidos.filter((x) => x.idemKey === "QA-CLAVE-1").length === 1,
  );

  console.log("\n═══ COBRAR: con el domicilio, y una sola vez ═══");
  await cat.cobrarPedido(p1.id, "efectivo", 2000, 0);
  const trasCobro = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const cobrado = trasCobro.pedidos.find((x) => x.id === p1.id);
  check(
    "el total CONSERVA el domicilio al cobrar",
    cobrado.total === cobrado.subtotal + cobrado.impuesto + cobrado.domicilio + cobrado.propina,
    `$${cobrado.total} (envío $${cobrado.domicilio} dentro)`,
  );
  await rechaza("cobrar dos veces", () => cat.cobrarPedido(p1.id, "tarjeta", 0, 0), "ya estaba cobrado");
  await rechaza("cancelar un pedido ya cobrado", () => cat.cancelarPedido(p1.id, "prueba"), "ya está cobrado");

  console.log("\n═══ CANCELAR devuelve la despensa si no se cocinó ═══");
  const p3 = await cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "llevar" });
  const antesCancel = insumoDeLaBase
    ? JSON.parse(fs.readFileSync(FILE, "utf8")).insumos.find((i) => i.id === insumoDeLaBase.insumoId).stock
    : null;
  await cat.cancelarPedido(p3.id, "el cliente se arrepintió");
  const trasCancel = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const cancelado = trasCancel.pedidos.find((x) => x.id === p3.id);
  check("queda cancelado", cancelado.estado === "cancelado");
  check("guarda el motivo", cancelado.motivoCancelacion === "el cliente se arrepintió");
  if (insumoDeLaBase) {
    const ahora = trasCancel.insumos.find((i) => i.id === insumoDeLaBase.insumoId).stock;
    check(
      "el insumo VOLVIÓ a la despensa",
      Math.abs(ahora - antesCancel - insumoDeLaBase.cantidad) < 0.001,
      `${antesCancel} → ${ahora} (+${insumoDeLaBase.cantidad})`,
    );
  }

  console.log("\n═══ DESHACER ya no se lleva los pedidos por delante ═══");
  const p4 = await cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "llevar" });
  await cat.updateIngrediente(baseId, { precio: 99999 }); // una edición cualquiera
  await cat.deshacer();
  const trasUndo = JSON.parse(fs.readFileSync(FILE, "utf8"));
  check("el pedido SOBREVIVE al deshacer", !!trasUndo.pedidos.find((x) => x.id === p4.id));
  check("y la edición sí se revirtió", trasUndo.bases.find((b) => b.id === baseId).precio !== 99999);
  // El invariante que importa: ningún snapshot lleva datos transaccionales dentro.
  // (Que las 12 copias del catálogo pesen es inherente a un undo por snapshots; que
  // lleven pedidos dentro es lo que hacía que Deshacer borrara el turno.)
  const conPedidos = [...(trasUndo.undo ?? []), ...(trasUndo.redo ?? [])].filter(
    (s) => s.pedidos?.length || s.movimientos?.length || s.leads?.length,
  ).length;
  check("ningún snapshot guarda pedidos ni caja", conPedidos === 0, `${conPedidos} sucios`);
  const pesoOriginal = fs.statSync(BACKUP).size;
  const pesoAhora = fs.statSync(FILE).size;
  check(
    "el documento encogió",
    pesoAhora < pesoOriginal,
    `${Math.round(pesoOriginal / 1024)}KB → ${Math.round(pesoAhora / 1024)}KB`,
  );

  console.log("\n═══ ENTRADA DE MERCANCÍA CON DINERO REAL ═══");
  {
    const ins0 = JSON.parse(fs.readFileSync(FILE, "utf8")).insumos[0];
    const stockAntes = ins0.stock;
    // Compré 10 unidades y pagué $70.000 → el costo unitario debe quedar en $7.000
    await cat.abastecerInsumo(ins0.id, 10, 70000);
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const ins1 = d.insumos.find((i) => i.id === ins0.id);
    check("suma la cantidad", Math.abs(ins1.stock - stockAntes - 10) < 0.001, `${stockAntes} → ${ins1.stock}`);
    check("recalcula el costo unitario", ins1.costo === 7000, `$${ins1.costo}/${ins1.unidad} (antes $${ins0.costo})`);
    const mov = (d.movimientos ?? [])[0];
    check("registra el gasto por el monto REAL del recibo", mov?.monto === 70000, `$${mov?.monto}`);
    check("el movimiento es una compra de insumos", mov?.tipo === "compra" && mov?.categoria === "insumos");

    // Sin monto: usa el costo que ya conocía.
    await cat.abastecerInsumo(ins0.id, 2);
    const d2 = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const ins2 = d2.insumos.find((i) => i.id === ins0.id);
    check("sin monto, el costo NO cambia", ins2.costo === 7000, `$${ins2.costo}`);
    check("y estima el gasto con ese costo", d2.movimientos[0].monto === 14000, `$${d2.movimientos[0].monto}`);
    await rechaza("abastecer sin cantidad", () => cat.abastecerInsumo(ins0.id, 0), "cuánto entró");
  }

  console.log("\n═══ NO SE PUEDE BORRAR UN INSUMO QUE ALGUNA RECETA USA ═══");
  if (insumoDeLaBase) {
    await rechaza(
      "eliminar un insumo en uso",
      () => cat.deleteInsumo(insumoDeLaBase.insumoId),
      "no se puede eliminar",
    );
  }

  console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══\n`);
} finally {
  fs.copyFileSync(BACKUP, FILE);
  fs.unlinkSync(BACKUP);
  console.log("(catálogo restaurado a su estado original)");
}
process.exit(mal > 0 ? 1 : 0);
