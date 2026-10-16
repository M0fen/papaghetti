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
  // La despensa tiene que estar cargada o TODO sale agotado (que es lo correcto, pero
  // no es lo que estas pruebas miden).
  await cat.abastecerTodoAPar();
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
  /* SIN PROTEÍNA TAMBIÉN SE VENDE (lo pidió el dueño): una base sola es un plato.
     Antes esto se rechazaba con "Falta la proteína del enredo". */
  {
    const p = await cat.crearPedido({ baseId, proteinaId: "", toppingIds: [], tipo: "llevar" });
    const precioBase = original.bases[0].precio;
    check("un pedido SIN proteína sí entra", Boolean(p.id));
    check("y cobra solo lo que lleva (la base)", p.total === precioBase, `${p.total} vs ${precioBase}`);
    check(
      "sin inventarse un 'con …' en el renglón",
      !/^con /.test(p.items?.[0]?.detalle ?? ""),
      p.items?.[0]?.detalle ?? "(sin detalle)",
    );
    await cat.cancelarPedido(p.id, "QA");
  }
  /* Y VARIAS SIN TOPE: antes el servidor cortaba en 4 sin avisar (EMPLATA dejaba
     elegir 5 y cobraba 4). La misma dos veces cuenta una: los botones prenden y apagan. */
  {
    const prots = original.proteinas.filter((x) => x.activo !== false && !x.agotado).map((x) => x.id);
    const p = await cat.crearPedido({ baseId, proteinaIds: [...prots, prots[0]], toppingIds: [], tipo: "llevar" });
    const esperado =
      original.bases[0].precio + prots.reduce((s, id) => s + original.proteinas.find((x) => x.id === id).precio, 0);
    check(`TODAS las proteínas (${prots.length}) se cobran`, p.total === esperado, `${p.total} vs ${esperado}`);
    check("la repetida cuenta una sola vez", (p.componentes ?? []).filter((c) => c === prots[0]).length === 1);
    check("y la cocina las ve todas", prots.every((id) => (p.items?.[0]?.detalle ?? "").includes(original.proteinas.find((x) => x.id === id).nombre)));
    await cat.cancelarPedido(p.id, "QA");
  }
  await rechaza(
    "un domicilio SIN dirección",
    () => cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "domicilio", direccion: "" }),
    "dirección",
  );
  // Aqui NO se asignan mesas: el "donde" es texto libre, asi que no hay numero que validar.
  {
    const p = await cat.crearPedido({
      baseId, proteinaId: protId, toppingIds: [], tipo: "mesa",
      referencia: "mesa del ventanal",
    });
    check("un pedido en el local guarda DONDE esta el cliente", p.referencia === "mesa del ventanal", p.referencia);
    check("y no inventa un numero de mesa", p.mesa === undefined);
    await cat.cancelarPedido(p.id, "QA");
  }

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
  const snaps = [...(trasUndo.undo ?? []), ...(trasUndo.redo ?? [])];
  check(
    "ningún snapshot arrastra pedidos ni movimientos",
    snaps.every((x) => !(x.pedidos?.length || x.movimientos?.length)),
    `${snaps.length} snapshots`,
  );
  check(
    "el documento se mantiene manejable",
    fs.statSync(FILE).size < 700_000,
    `${Math.round(fs.statSync(FILE).size / 1024)}KB`,
  );

  console.log("\n═══ CADA COMPROBANTE CON SU NÚMERO, AUNQUE ENTREN A LA VEZ ═══");
  {
    // crearPedido lee ANTES de entrar en la cola de escritura: dos pedidos casi
    // simultáneos leían el mismo estado y se adjudicaban el mismo consecutivo.
    const lote = await Promise.all(
      [1, 2, 3, 4].map(() =>
        cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "llevar" }),
      ),
    );
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const nums = lote.map((p) => d.pedidos.find((x) => x.id === p.id)?.consecutivo);
    check("4 pedidos simultáneos = 4 números distintos", new Set(nums).size === 4, nums.join(", "));
    check("ninguno se queda sin número", nums.every((n) => typeof n === "number" && n > 0));
    const todos = d.pedidos.map((p) => p.consecutivo).filter((n) => typeof n === "number");
    check("no hay repetidos en TODO el documento", new Set(todos).size === todos.length, `${todos.length} pedidos`);
    for (const p of lote) await cat.cancelarPedido(p.id, "QA");
  }

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

  /* El camino que usan los CLIENTES (QR, web, el juego): `crearPedido`, sin sesión. Antes
     rearmaba el renglón solo con `baseId`, así que la segunda base se perdía aquí mismo. */
  console.log("\n═══ DOS BASES POR EL CAMINO PÚBLICO (QR / web) ═══");
  try {
    await cat.updateAjustes({ abierto: true, controlarStock: true, basesMax: 2, cobroBases: "mitad" });
    const [b0, b1, b2] = original.bases.filter((b) => b.activo !== false);
    const fotoIns = () => Object.fromEntries(JSON.parse(fs.readFileSync(FILE, "utf8")).insumos.map((i) => [i.id, i.stock]));
    const f0 = fotoIns();
    // Tocadas al revés: el nombre y el precio salen en el orden de la carta igual.
    const pm = await cat.crearPedido({ baseIds: [b1.id, b0.id], proteinaId: "", toppingIds: [], tipo: "llevar", canal: "qr" });
    const f1 = fotoIns();
    check("entra un plato de dos bases", Boolean(pm.id));
    check("mitad: cobra la más cara", pm.total === Math.max(b0.precio, b1.precio), `${pm.total}`);
    check("se llama con las dos, en el orden de la carta", pm.items?.[0]?.nombre === `${b0.nombre} / ${b1.nombre}`, pm.items?.[0]?.nombre);
    check("y la cocina lee primero el modo", pm.items?.[0]?.detalle === "mitad y mitad", pm.items?.[0]?.detalle);
    const esperado = {}; // media receta de cada base; si comparten insumo, se suma
    for (const b of [b0, b1]) for (const r of b.receta ?? []) esperado[r.insumoId] = (esperado[r.insumoId] ?? 0) + r.cantidad / 2;
    const fuera = Object.keys(f0).filter((k) => Math.abs(f0[k] - f1[k] - (esperado[k] ?? 0)) > 0.0015);
    check("gastó media receta de cada base, y nada más", fuera.length === 0, fuera.join(", ") || JSON.stringify(esperado));
    await cat.cancelarPedido(pm.id, "QA");
    const f2 = fotoIns();
    const noVolvio = Object.keys(f0).filter((k) => f2[k] !== f0[k]);
    check("cancelar devuelve exactamente lo gastado", noVolvio.length === 0, noVolvio.map((k) => `${k}: ${f0[k]} → ${f2[k]}`).join(", "));
    await rechaza("sin ninguna base", () => cat.crearPedido({ baseIds: [], toppingIds: [], tipo: "llevar" }), "falta la base");
    await rechaza("la misma base dos veces", () => cat.crearPedido({ baseIds: [b0.id, b0.id], toppingIds: [], tipo: "llevar" }), "dos veces");
    if (b2) {
      await rechaza("tres bases", () => cat.crearPedido({ baseIds: [b0.id, b1.id, b2.id], toppingIds: [], tipo: "llevar" }), "máximo dos bases");
    }
    await rechaza("una base que no existe", () => cat.crearPedido({ baseIds: [b0.id, "no-existe-xyz"], toppingIds: [], tipo: "llevar" }), "ya no existe");
    await rechaza("una proteína disfrazada de base", () => cat.crearPedido({ baseIds: [b0.id, protId], toppingIds: [], tipo: "llevar" }), "no es una base");
    await cat.updateAjustes({ basesMax: 1 });
    await rechaza("basesMax = 1: el QR tampoco cuela dos", () => cat.crearPedido({ baseIds: [b0.id, b1.id], toppingIds: [], tipo: "llevar" }), "máximo una base");
    await cat.updateAjustes({ basesMax: 2, cobroBases: "suma" });
    const ps = await cat.crearPedido({ baseIds: [b0.id, b1.id], toppingIds: [], tipo: "llevar" });
    check("suma: cobra las dos", ps.total === b0.precio + b1.precio, `${ps.total}`);
    await cat.updateAjustes({ cobroBases: "mitad" });
    const legado = await cat.crearPedido({ baseId: b0.id, toppingIds: [], tipo: "llevar" });
    check("el baseId de siempre sigue entrando, a su precio y con su nombre", legado.total === b0.precio && legado.base === b0.nombre, `${legado.total} · ${legado.base}`);
    const ambos = await cat.crearPedido({ baseId: b0.id, baseIds: [b0.id, b1.id], toppingIds: [], tipo: "llevar" });
    check("con baseId y baseIds a la vez, manda baseIds", ambos.total === Math.max(b0.precio, b1.precio), `${ambos.total}`);
    const k1 = await cat.crearPedido({ baseIds: [b0.id, b1.id], toppingIds: [], tipo: "llevar", idemKey: "QA-F1" });
    const k2 = await cat.crearPedido({ baseIds: [b0.id, b1.id], toppingIds: [], tipo: "llevar", idemKey: "QA-F1" });
    check("el doble envío de dos bases es UN pedido", k1.id === k2.id, `${k1.id} vs ${k2.id}`);
    for (const p of [ps, legado, ambos, k1]) await cat.cancelarPedido(p.id, "QA");
  } catch (e) {
    check("el bloque de dos bases no revienta", false, String(e?.message ?? e).slice(0, 160));
  }

  console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══\n`);
} finally {
  fs.copyFileSync(BACKUP, FILE);
  fs.unlinkSync(BACKUP);
  console.log("(catálogo restaurado a su estado original)");
}
process.exit(mal > 0 ? 1 : 0);
