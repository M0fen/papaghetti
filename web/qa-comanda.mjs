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

/* La suite entera va dentro de un try/finally: si algo revienta a media prueba (un
   import, un `abrirCaja` con la caja de hoy ya abierta en los datos de desarrollo), el
   catálogo se restaura igual. Antes la restauración estaba al final, y un error la
   saltaba y dejaba data/catalog.json lleno de pedidos de prueba. */
try {
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

  console.log("\n═══ DOS BASES EN UN PLATO ═══");
  {
    /* Instancia propia: el bloque de arriba escribió el archivo por debajo, y la primera
       instancia tiene un memo de 2 s. Todo se paga con Nequi: el arqueo de arriba cuenta
       el efectivo de hoy y no puede moverse. */
    const F = await import(`./lib/catalog.ts?f1=${Date.now()}`);
    const escpos = await import("./lib/tiquete-escpos.ts");
    const comprobantes = await import("./lib/comprobantes.ts");
    const tag = Date.now().toString(36);
    // Arriba la despensa de la base quedó al ras a propósito; aquí vuelve a su estándar.
    await F.abastecerTodoAPar();
    await F.updateAjustes({ abierto: true, controlarStock: true, basesMax: 2, cobroBases: "mitad" });
    const d0 = await F.getCatalog();
    const [bA, bB, bC] = d0.bases.filter((x) => x.activo !== false);
    const libres = d0.proteinas.filter((x) => x.activo !== false && !x.agotado);
    const [prot, prot2] = libres;
    const top = d0.toppings.find((t) => t.categoria !== "salsa" && t.activo !== false && !t.agotado);
    const insignia = d0.enredos.find((e) => e.baseId && e.activo !== false);

    /* Precios y recetas PROPIOS, para no depender de la carta del día: A y B con su insumo
       y un aceite que COMPARTEN, en una cantidad que no se parte limpia en dos (0,035 →
       0,018 por media porción): así se prueba que vender y devolver redondean igual. */
    await F.updateIngrediente(bA.id, { precio: 15900, activo: true, agotado: false });
    await F.updateIngrediente(bB.id, { precio: 16900, activo: true, agotado: false });
    for (const [n, unidad, costo] of [["A", "g", 20], ["B", "g", 30], ["aceite", "l", 10000]]) {
      await F.createInsumo({ nombre: `QA mitad ${n} ${tag}`, unidad, stock: 1000, parStock: 1000, costo });
    }
    const idDe = async (n) => (await F.getCatalog()).insumos.find((i) => i.nombre === `QA mitad ${n} ${tag}`).id;
    const insA = await idDe("A"), insB = await idDe("B"), insC = await idDe("aceite");
    await F.setReceta(bA.id, [{ insumoId: insA, cantidad: 100 }, { insumoId: insC, cantidad: 0.035 }]);
    await F.setReceta(bB.id, [{ insumoId: insB, cantidad: 60 }, { insumoId: insC, cantidad: 0.035 }]);
    if (bC) await F.setReceta(bC.id, [{ insumoId: insC, cantidad: 0.035 }]); // también lleva ese aceite

    const qa = async () => {
      const d = await F.getCatalog();
      return [insA, insB, insC].map((id) => d.insumos.find((i) => i.id === id).stock);
    };
    const stock = async (id) => (await F.getCatalog()).insumos.find((i) => i.id === id).stock;
    const agotada = async (id) => (await F.getCatalog()).bases.find((b) => b.id === id).agotado === true;
    // La despensa ENTERA, para ver que nada se mueve de más ni de menos.
    const despensa = async () => Object.fromEntries((await F.getCatalog()).insumos.map((i) => [i.id, i.stock]));
    const cambios = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} → ${b[k]}`);
    const caja = (baseIds, cantidad = 1) =>
      F.crearComanda({ lineas: [{ baseIds, proteinaIds: [], toppingIds: [], cantidad }], canal: "salon", tipo: "llevar" });
    const gasto = async (fn) => {
      const antes = await qa();
      const r = await fn();
      const despues = await qa();
      return { r, gastado: antes.map((x, i) => Number((x - despues[i]).toFixed(3))) };
    };
    const mensaje = async (fn) => {
      try { await fn(); return null; } catch (e) { return e.message; }
    };
    const nombreDos = `${bA.nombre} / ${bB.nombre}`;

    console.log("  · el precio y lo que se gasta");
    const g1 = await gasto(() => caja([bA.id]));
    eq("una base: su precio de carta", g1.r.total, 15900);
    eq("una base: su porción entera (A, B, aceite)", g1.gastado, [100, 0, 0.035]);
    eq("una base: se llama y se lee como siempre", [g1.r.items[0].nombre, g1.r.items[0].detalle, g1.r.mitades], [bA.nombre, undefined, undefined]);
    const gm = await gasto(() => caja([bA.id, bB.id]));
    eq("mitad: se cobra la base MÁS CARA", gm.r.total, 16900);
    eq("mitad: el impuesto va dentro", gm.r.impuesto, 16900 - base(16900));
    eq("mitad: media porción de cada una; el aceite de las dos, redondeado como se vende", gm.gastado, [50, 30, 0.036]);
    eq("mitad: un renglón que nombra las dos, en el orden de la carta", gm.r.items[0].nombre, nombreDos);
    eq("mitad: el detalle arranca con el modo, que es lo que la cocina tiene que leer", gm.r.items[0].detalle, "mitad y mitad");
    si("ni « · » ni «½» en el nombre (Mesas y el tiquete de texto los rompen)", !/ · |½/.test(gm.r.items[0].nombre));
    eq(
      "mitad: las bases van a MEDIA porción, nunca a componentes",
      [gm.r.items[0].componentes, gm.r.items[0].mitades, gm.r.componentes, gm.r.mitades],
      [[], [bA.id, bB.id], [], [bA.id, bB.id]],
    );
    eq("y sigue siendo UN plato", menu.platosDe(gm.r), 1);
    const alReves = await caja([bB.id, bA.id]);
    eq("el orden de los toques no cambia ni el precio ni el nombre", [alReves.total, alReves.items[0].nombre, alReves.mitades], [16900, nombreDos, [bA.id, bB.id]]);
    await F.updateAjustes({ cobroBases: "suma" });
    const gs = await gasto(() => caja([bA.id, bB.id]));
    eq("suma: se cobran las dos", gs.r.total, 15900 + 16900);
    eq("suma: porción entera de cada una (y el aceite de las dos)", gs.gastado, [100, 60, 0.07]);
    eq("suma: mismo nombre, y el detalle lo dice", [gs.r.items[0].nombre, gs.r.items[0].detalle], [nombreDos, "dos bases completas"]);
    eq("suma: las dos en componentes, nada a media", [gs.r.componentes, gs.r.mitades], [[bA.id, bB.id], undefined]);
    // A: 100 g × $20 + 0,035 l × $10.000 = $2.350; B: 60 × $30 + $350 = $2.150.
    eq("costo: la receta entera con una base, media de cada una en mitad, las dos en suma", [g1.r.costo, gm.r.costo, gs.r.costo], [2350, 2250, 4500]);
    await F.updateAjustes({ cobroBases: "mitad" });

    console.log("  · lo que alcanza");
    await F.updateInsumo(insA, { stock: 150 }); // porción y media de A
    await rechaza("con porción y media de A, dos enteras no entran", () => caja([bA.id], 2), "no nos alcanza para 2");
    const tres = await gasto(() => caja([bA.id, bB.id], 3));
    si("pero tres mitades sí: piden porción y media justa", Boolean(tres.r.id));
    eq("y gastan exactamente eso", tres.gastado[0], 150);
    si("sin despensa para una entera, A queda agotada", await agotada(bA.id));
    await rechaza("…y entonces tampoco sale en mitad", () => caja([bA.id, bB.id]), "se nos acabó");
    await F.updateInsumo(insA, { stock: 100 }); // una porción justa: A vuelve a la carta
    si("con una porción entera vuelve a la carta", !(await agotada(bA.id)));
    const antesR = await despensa();
    const raro = await mensaje(() =>
      F.crearComanda({ lineas: [{ baseIds: [bA.id], cantidad: 1 }, { baseIds: [bA.id, bB.id], cantidad: 1 }], tipo: "llevar" }),
    );
    si("una entera + una mitad con UNA porción no entran", Boolean(raro && /para toda la comanda/.test(raro)), raro ?? "no rechazó");
    si("y el mensaje no habla de «1.5» porciones", Boolean(raro) && !/1[.,]5/.test(raro), raro ?? "");
    si("y NO tocó la despensa al rechazarla", cambios(antesR, await despensa()).length === 0);
    si("2 mitades = 1 porción: entran con una porción justa", Boolean((await caja([bA.id, bB.id], 2)).id));

    console.log("  · el aceite que comparten las dos bases");
    await F.updateInsumo(insA, { stock: 1000 });
    await F.updateInsumo(insC, { stock: 0.035 }); // una porción de cualquiera de las dos
    si("con 0,035 l, cada base sola sale entera", !(await agotada(bA.id)) && !(await agotada(bB.id)));
    const antesC = await despensa();
    const juntas = await mensaje(() => caja([bA.id, bB.id]));
    si("pero las dos medias juntas piden 0,036 y no entran", Boolean(juntas && /para toda la comanda/.test(juntas)), juntas ?? "no rechazó");
    si("el mensaje nombra el insumo que falta", Boolean(juntas?.includes(`QA mitad aceite ${tag}`)), juntas ?? "");
    si("y NO tocó la despensa", cambios(antesC, await despensa()).length === 0);
    await F.updateInsumo(insC, { stock: 0.036 });
    si("con 0,036 justos, sí", Boolean((await caja([bA.id, bB.id])).id));
    eq("y no queda aceite", await stock(insC), 0);
    if (bC) si("lo que también lleva ese aceite se agota solo, aunque no se haya vendido", await agotada(bC.id));
    await F.updateInsumo(insC, { stock: 1000 });

    console.log("  · «se acabó», a mano");
    await F.updateIngrediente(bB.id, { agotado: true }); // a mano, justo antes de probar
    await rechaza("una base marcada «se acabó» bloquea la mitad", () => caja([bA.id, bB.id]), "se nos acabó");
    await F.updateIngrediente(bB.id, { agotado: false });
    await F.updateAjustes({ controlarStock: false }); // apagar BORRA los agotados del momento…
    await F.updateIngrediente(bB.id, { agotado: true }); // …por eso se marca DESPUÉS
    await rechaza("…y también con el control apagado", () => caja([bA.id, bB.id]), "se nos acabó");
    const deA = await caja([bA.id]); // comparte el aceite con B
    await F.cancelarPedido(deA.id, "QA");
    si("con el control apagado, cancelar no le borra a nadie el «se acabó»", await agotada(bB.id));
    await F.updateIngrediente(bB.id, { agotado: false });
    const deB = await caja([bB.id]);
    await F.cobrarPedido(deB.id, "nequi", 0, 0);
    await F.updateIngrediente(bB.id, { agotado: true }); // se acabó DESPUÉS de venderla
    await F.devolverPedido(deB.id, "QA");
    si("devolver un plato sin cocinar tampoco le borra el «se acabó» a su base", await agotada(bB.id));
    await F.updateIngrediente(bB.id, { agotado: false });
    await F.updateAjustes({ controlarStock: true });

    console.log("  · lo que no puede entrar");
    await F.updateAjustes({ basesMax: 1 });
    await rechaza("basesMax = 1: dos bases no entran", () => caja([bA.id, bB.id]), "máximo una base");
    si("basesMax = 1: una sí", Boolean((await caja([bA.id])).id));
    await F.updateAjustes({ basesMax: 2 });
    await rechaza("sin ninguna base", () => caja([]), "falta la base");
    await rechaza("la misma base dos veces", () => caja([bA.id, bA.id]), "dos veces");
    if (bC) await rechaza("tres bases", () => caja([bA.id, bB.id, bC.id]), "máximo dos bases");
    await rechaza("una proteína no es una base", () => caja([bA.id, prot.id]), "no es una base");
    await rechaza("una base que no existe", () => caja([bA.id, "no-existe-xyz"]), "ya no existe");
    await rechaza("bases que no vienen en lista no se cuelan", () => F.crearComanda({ lineas: [{ baseIds: bA.id, cantidad: 1 }], tipo: "llevar" }), "falta la base");
    if (insignia) {
      await rechaza(
        "un plato de la carta con dos bases encima",
        () => F.crearComanda({ lineas: [{ enredoId: insignia.id, baseIds: [bA.id, bB.id], cantidad: 1 }], tipo: "llevar" }),
        "ya trae su base",
      );
    }

    console.log("  · lo de antes, igual");
    const viejo = await F.crearComanda({ lineas: [{ baseId: bA.id, proteinaIds: [prot.id], toppingIds: [top.id], cantidad: 1 }], tipo: "llevar" });
    const nuevo = await F.crearComanda({ lineas: [{ baseIds: [bA.id], proteinaIds: [prot.id], toppingIds: [top.id], cantidad: 1 }], tipo: "llevar" });
    const cara = (p) => [p.items[0].nombre, p.items[0].detalle, p.items[0].precioFinal, p.componentes, p.mitades, p.base, p.proteina, p.toppings];
    eq("baseId de siempre = baseIds de una sola", cara(viejo), cara(nuevo));
    eq(
      "y se lee como siempre",
      [viejo.items[0].nombre, viejo.items[0].detalle, viejo.componentes, viejo.proteina, viejo.toppings],
      [bA.nombre, `con ${prot.nombre} · + ${top.nombre}`, [bA.id, prot.id, top.id], prot.nombre, [top.nombre]],
    );
    const ambos = await F.crearComanda({ lineas: [{ baseId: bA.id, baseIds: [bA.id, bB.id], cantidad: 1 }], tipo: "llevar" });
    eq("con baseId y baseIds a la vez, manda baseIds", [ambos.total, ambos.items[0].nombre], [16900, nombreDos]);
    if (prot2) {
      const dos = await F.crearComanda({ lineas: [{ baseIds: [bA.id], proteinaIds: [prot.id, prot2.id], toppingIds: [top.id], cantidad: 1 }], tipo: "llevar" });
      eq("dos proteínas: el resumen ya no se traga media frase", [dos.proteina, dos.toppings], [`${prot.nombre} + ${prot2.nombre}`, [top.nombre]]);
    }
    const antesK = await despensa();
    const clave = `QA-F1-${tag}`;
    const k1 = await F.crearComanda({ lineas: [{ baseIds: [bA.id, bB.id], cantidad: 1 }], tipo: "llevar", idemKey: clave });
    const trasK1 = await despensa();
    const k2 = await F.crearComanda({ lineas: [{ baseIds: [bA.id, bB.id], cantidad: 1 }], tipo: "llevar", idemKey: clave });
    eq("el doble envío de un mitad y mitad es UN pedido", k2.id, k1.id);
    si("y la despensa se tocó una sola vez", cambios(antesK, trasK1).length > 0 && cambios(trasK1, await despensa()).length === 0);

    console.log("  · cancelar y devolver: ni más ni menos");
    for (const modo of ["mitad", "suma"]) {
      await F.updateAjustes({ cobroBases: modo });
      const antes = await despensa();
      const p = await F.crearComanda({
        lineas: [{ baseIds: [bA.id, bB.id], proteinaIds: [prot.id], toppingIds: [top.id], cantidad: 3 }],
        tipo: "llevar",
      });
      si(`${modo}: la venta gastó despensa`, cambios(antes, await despensa()).length > 0);
      await F.cancelarPedido(p.id, "QA");
      const quedo = cambios(antes, await despensa());
      si(`${modo}: cancelar devuelve EXACTAMENTE lo gastado`, quedo.length === 0, quedo.join("; "));
    }
    await F.updateAjustes({ cobroBases: "mitad" });
    const antesSolo = await despensa();
    const solo = await caja([bA.id, bB.id]); // sin proteína ni acompañantes: todo va en `mitades`
    await F.cancelarPedido(solo.id, "QA");
    const quedoSolo = cambios(antesSolo, await despensa());
    si("un mitad y mitad sin nada más (solo medias) también vuelve entero", quedoSolo.length === 0, quedoSolo.join("; "));
    const antesDev = await despensa();
    const pv = await caja([bA.id, bB.id], 2);
    await F.cobrarPedido(pv.id, "nequi", 0, 0);
    await F.devolverPedido(pv.id, "QA mitad");
    const quedoDev = cambios(antesDev, await despensa());
    si("devolver unos mitad y mitad sin cocinar devuelve justo sus medias", quedoDev.length === 0, quedoDev.join("; "));

    console.log("  · el papel");
    const pc = await F.crearComanda({ lineas: [{ baseIds: [bA.id, bB.id], proteinaIds: [prot.id], cantidad: 1 }], tipo: "llevar" });
    const papel = precios.cuentaImpresa(pc);
    eq(
      "un renglón, con las dos bases y el modo, a la más cara (más la proteína)",
      [papel.lineas.length, papel.lineas[0].nombre, papel.lineas[0].detalle, papel.lineas[0].importe],
      [1, nombreDos, `mitad y mitad · con ${prot.nombre}`, 16900 + prot.precio],
    );
    const aj = (await F.getCatalog()).ajustes;
    si("el tiquete de texto a 32 columnas sale en ASCII puro", [...escpos.tiqueteEscPos(pc, aj, { cols: 32 })].every((b) => b < 0x80));
    const txt = escpos.armarTiquete(pc, aj, 32).map((r) => r.texto).join(" ").replace(/\s+/g, " ");
    si(
      "y dice las dos bases y el modo (el «·» pasa a «-»)",
      txt.includes(escpos.ascii(nombreDos)) && txt.includes(escpos.ascii(`mitad y mitad · con ${prot.nombre}`)),
      escpos.ascii(nombreDos),
    );
    const wa = comprobantes.textoComprobante(pc, aj);
    si("el WhatsApp también", wa.includes(nombreDos) && wa.includes(`_mitad y mitad · con ${prot.nombre}_`));
    eq("con proteína, el resumen de siempre se sigue leyendo", [pc.base, pc.proteina, pc.toppings], [nombreDos, prot.nombre, []]);
  }
} catch (e) {
  mal++;
  console.log("  ❌ reventó:", e?.stack ?? e);
} finally {
  console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
  if (fs.existsSync(RESPALDO)) {
    fs.copyFileSync(RESPALDO, FILE);
    fs.unlinkSync(RESPALDO);
    console.log("(catálogo restaurado a su estado original)");
  }
}
process.exit(mal ? 1 : 0);
