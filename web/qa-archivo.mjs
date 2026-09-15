/**
 * EL ARCHIVO DE COMPROBANTES: nada se pierde al pasar del tope.
 *
 * Contra el cerebro REAL con el backend de archivo local (data/catalog.json), con
 * copia de seguridad y restauración pase lo que pase. Se siembran 2.375 pedidos
 * sintéticos (2.350 cerrados de mayo a agosto, 5 deudas vivas de mayo, 20 cerrados
 * de septiembre), se provoca un commit y se comprueba que:
 *   · el cerebro baja al tope (2.000) y las deudas vivas viejas se quedan,
 *   · lo que salió está en data/comprobantes-YYYY-MM.json y el cerebro lo apunta,
 *   · buscarPedido / pedidosArchivados / comprobantesEntre lo encuentran sin repetir,
 *   · un segundo commit no vuelve a archivar nada,
 *   · ponerACero borra también el archivo.
 *
 *   node --import ./qa-ts.mjs qa-archivo.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const FILE = path.join(DATA, "catalog.json");
const RESPALDO = FILE + ".qa-archivo";
const MESES = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const archivoDe = (m) => path.join(DATA, `comprobantes-${m}.json`);
const limpiarArchivos = () => { for (const m of MESES) if (fs.existsSync(archivoDe(m))) fs.unlinkSync(archivoDe(m)); };

if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);
limpiarArchivos();

let ok = 0, mal = 0;
const si = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? " · " + d : ""}`); };
const eq = (n, a, b) => si(n, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b) ? "" : `dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)}`);

const METODOS = ["efectivo", "nequi", "daviplata", "breb", "tarjeta", "transferencia"];
let n = 0;
function pedido(msUtc, { abierto = false } = {}) {
  n++;
  const cancelado = !abierto && n % 17 === 0;
  const total = 20000 + (n % 9) * 1500;
  return {
    id: `A${String(n).padStart(6, "0")}X`,
    consecutivo: n,
    creadoEn: new Date(msUtc).toISOString(),
    canal: ["web", "qr", "salon"][n % 3],
    tipo: ["mesa", "llevar", "domicilio"][n % 3],
    cliente: `ARCH ${n}`,
    referencia: n % 5 === 0 ? "ventanal" : undefined,
    estado: abierto ? "listo" : cancelado ? "cancelado" : "entregado",
    motivoCancelacion: cancelado ? "prueba" : undefined,
    pago: abierto || cancelado ? "pendiente" : "pagado",
    metodoPago: abierto || cancelado ? undefined : METODOS[n % 6],
    items: [{ nombre: `Plato ${n % 7}`, cantidad: 1, precio: total }],
    base: `Plato ${n % 7}`, proteina: "—", toppings: [],
    subtotal: total, impuesto: 0, propina: 0, descuento: 0, total,
  };
}

const MAYO1 = Date.UTC(2026, 4, 1, 17, 0, 0);       // 12:00 de Pereira
const AGO31 = Date.UTC(2026, 7, 31, 23, 0, 0);      // 18:00 de Pereira
const paso = Math.floor((AGO31 - MAYO1) / 2350);
const cerradosViejos = Array.from({ length: 2350 }, (_, i) => pedido(MAYO1 + i * paso));
const deudasVivas = Array.from({ length: 5 }, (_, i) => pedido(Date.UTC(2026, 4, 2, 18 + i, 0, 0), { abierto: true }));
const recientes = Array.from({ length: 20 }, (_, i) => pedido(Date.UTC(2026, 8, 10, 15 + (i % 8), i, 0)));
const todos = [...cerradosViejos, ...deudasVivas, ...recientes].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

const original = JSON.parse(fs.readFileSync(FILE, "utf8"));
fs.writeFileSync(FILE, JSON.stringify({ ...original, pedidos: todos, undo: [], redo: [], historial: [], archivoMeses: [] }), "utf8");

const idsMayoCerrados = new Set(cerradosViejos.filter((p) => p.creadoEn < "2026-06-01T05:00:00.000Z").map((p) => p.id));
const enMayo = (p) => p.creadoEn >= "2026-05-01T05:00:00.000Z" && p.creadoEn < "2026-06-01T05:00:00.000Z";

try {
  const cat = await import("./lib/catalog.ts");

  console.log("\n═══ LA FUNCIÓN PURA ═══");
  const mini = [
    { id: "a", creadoEn: "2026-01-05T12:00:00Z", pago: "pagado", estado: "entregado" },
    { id: "b", creadoEn: "2026-01-04T12:00:00Z", pago: "pendiente", estado: "listo" },
    { id: "c", creadoEn: "2026-01-03T12:00:00Z", pago: "pagado", estado: "entregado" },
    { id: "d", creadoEn: "2026-01-02T12:00:00Z", pago: "pendiente", estado: "cancelado" },
    { id: "e", creadoEn: "2026-01-01T12:00:00Z", pago: "pendiente", estado: "recibido" },
  ];
  const r = cat.recortarPedidos(mini, 3);
  eq("con tope 3: se quedan las 2 deudas vivas + el cerrado más nuevo", r.quedan.map((p) => p.id), ["a", "b", "e"]);
  eq("salen los cerrados más viejos (pagado y cancelado)", r.salen.map((p) => p.id), ["c", "d"]);
  eq("por debajo del tope no toca nada", cat.recortarPedidos(mini, 5).salen.length, 0);
  eq("mesNegocio va en hora de Pereira: 03:30Z del 1 de octubre es 30 de septiembre", cat.mesNegocio("2026-10-01T03:30:00.000Z"), "2026-09");
  eq("el tope sigue en 2.000", cat.PEDIDOS_CAP, 2000);

  console.log("\n═══ ANTES DEL COMMIT: 2.375 pedidos en el cerebro ═══");
  const antes = await cat.getCatalog();
  eq("el cerebro trae los 2.375", antes.pedidos.length, 2375);
  eq("sin meses archivados", antes.archivoMeses, []);

  console.log("\n═══ UN COMMIT CUALQUIERA DISPARA EL ARCHIVADO ═══");
  await cat.updateAjustes({});
  const cat2 = await import(`./lib/catalog.ts?fresco=${Date.now()}`);
  const despues = await cat2.getCatalog();
  eq("el cerebro baja exactamente al tope", despues.pedidos.length, 2000);
  eq("apunta el mes archivado", despues.archivoMeses, ["2026-05"]);
  si("las 5 deudas vivas de mayo SIGUEN en el cerebro", deudasVivas.every((d) => despues.pedidos.some((p) => p.id === d.id)));
  si("los 20 recientes siguen", recientes.every((d) => despues.pedidos.some((p) => p.id === d.id)));
  const salieron = todos.filter((p) => !despues.pedidos.some((q) => q.id === p.id));
  eq("salieron 375", salieron.length, 375);
  si("todos los que salieron son de mayo y estaban cerrados", salieron.every((p) => idsMayoCerrados.has(p.id)));
  const masViejoQueSalio = salieron.map((p) => p.creadoEn).sort().at(-1);
  const masViejoCerradoQueQueda = despues.pedidos.filter((p) => p.pago === "pagado" || p.estado === "cancelado").map((p) => p.creadoEn).sort()[0];
  si("y son los MÁS VIEJOS: ningún cerrado que quedó es anterior a uno que salió", masViejoCerradoQueQueda > masViejoQueSalio, `${masViejoQueSalio} < ${masViejoCerradoQueQueda}`);
  si("existe data/comprobantes-2026-05.json", fs.existsSync(archivoDe("2026-05")));
  const doc = JSON.parse(fs.readFileSync(archivoDe("2026-05"), "utf8"));
  eq("con el mes y los 375 pedidos", [doc.mes, doc.pedidos.length], ["2026-05", 375]);
  si("ordenados del más nuevo al más viejo", doc.pedidos.every((p, i, a) => i === 0 || a[i - 1].creadoEn >= p.creadoEn));
  si("y sin ids repetidos", new Set(doc.pedidos.map((p) => p.id)).size === 375);

  console.log("\n═══ LEER LO ARCHIVADO ═══");
  const idArch = salieron[0].id, idVivo = recientes[0].id;
  eq("buscarPedido encuentra uno archivado", (await cat2.buscarPedido(idArch))?.id, idArch);
  eq("y uno vivo", (await cat2.buscarPedido(idVivo))?.id, idVivo);
  eq("y devuelve undefined si no existe", await cat2.buscarPedido("NOEXISTE"), undefined);
  eq("pedidosArchivados de mayo: 375", (await cat2.pedidosArchivados("2026-05-01", "2026-05-31")).length, 375);
  eq("pedidosArchivados de junio: 0 (junio no se archivó)", (await cat2.pedidosArchivados("2026-06-01", "2026-06-30")).length, 0);
  eq("sin rango: todo el archivo", (await cat2.pedidosArchivados()).length, 375);
  const mayo = await cat2.comprobantesEntre("2026-05-01", "2026-05-31");
  const esperadosMayo = todos.filter(enMayo).length;
  eq(`comprobantesEntre(mayo) une cerebro + archivo: ${esperadosMayo}`, mayo.length, esperadosMayo);
  si("sin repetidos", new Set(mayo.map((p) => p.id)).size === mayo.length);
  si("y del más nuevo al más viejo", mayo.every((p, i, a) => i === 0 || a[i - 1].creadoEn >= p.creadoEn));
  si("incluye las 5 deudas vivas de mayo", deudasVivas.every((d) => mayo.some((p) => p.id === d.id)));
  eq("comprobantesEntre(septiembre): los 20 recientes, sin tocar el archivo", (await cat2.comprobantesEntre("2026-09-01", "2026-09-30")).length, 20);
  eq("comprobantesEntre(un día de mayo) recorta al día", (await cat2.comprobantesEntre("2026-05-02", "2026-05-02")).length, todos.filter((p) => p.creadoEn >= "2026-05-02T05:00:00.000Z" && p.creadoEn < "2026-05-03T05:00:00.000Z").length);
  eq("mesesArchivados", await cat2.mesesArchivados(), ["2026-05"]);

  console.log("\n═══ IDEMPOTENTE: otro commit no vuelve a archivar ═══");
  await cat2.updateAjustes({});
  const cat3 = await import(`./lib/catalog.ts?fresco=${Date.now()}b`);
  const tercero = await cat3.getCatalog();
  eq("el cerebro sigue en 2.000", tercero.pedidos.length, 2000);
  eq("el archivo sigue con 375", JSON.parse(fs.readFileSync(archivoDe("2026-05"), "utf8")).pedidos.length, 375);

  console.log("\n═══ UN PEDIDO NUEVO NO DISPARA NADA HASTA PASAR EL MARGEN ═══");
  {
    const previo = await cat3.getCatalog();
    for (const i of previo.insumos) await cat3.abastecerInsumo(i.id, 500);
    const doc3 = await cat3.getCatalog();
    const plato = doc3.enredos.find((e) => !e.baseId && !e.proteinaId && e.activo !== false);
    const nuevo = await cat3.crearComanda({ lineas: [{ enredoId: plato.id, cantidad: 1 }], canal: "salon", tipo: "llevar", cliente: "ARCH nuevo" });
    const cat4 = await import(`./lib/catalog.ts?fresco=${Date.now()}c`);
    const conNuevo = await cat4.getCatalog();
    eq("el cerebro tiene 2.001 (tope + 1, dentro del margen)", conNuevo.pedidos.length, 2001);
    si("y el nuevo está arriba del todo", conNuevo.pedidos[0].id === nuevo.id);
    si("con consecutivo siguiente al máximo", nuevo.consecutivo === 2376, `#${nuevo.consecutivo}`);
  }

  console.log("\n═══ LA FRONTERA DEL ARCHIVO LA DECIDE EL ÍNDICE, NO EL CEREBRO ═══");
  {
    /* Un mes archivado (junio) y, en el cerebro, lo reciente más UNA DEUDA VIEJA de
       mayo. Cobrarla la convierte en el pedido cerrado más antiguo del cerebro: si la
       frontera se calculara con eso, junio dejaría de leerse y el mes entero
       desaparecería de la pantalla. */
    const base = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const sept = pedido(Date.UTC(2026, 8, 10, 18, 0, 0));
    const deudaMayo = pedido(Date.UTC(2026, 4, 3, 18, 0, 0), { abierto: true });
    const junio = pedido(Date.UTC(2026, 5, 15, 18, 0, 0));
    fs.writeFileSync(archivoDe("2026-06"), JSON.stringify({ mes: "2026-06", pedidos: [junio] }), "utf8");
    fs.writeFileSync(
      FILE,
      JSON.stringify({ ...base, pedidos: [sept, deudaMayo], archivoMeses: ["2026-05", "2026-06"], undo: [], redo: [] }),
      "utf8",
    );
    const c1 = await import(`./lib/catalog.ts?fresco=${Date.now()}f`);
    eq("junio se lee del archivo", (await c1.comprobantesEntre("2026-06-01", "2026-06-30")).map((p) => p.id), [junio.id]);
    eq("hoy no toca el archivo", (await c1.comprobantesEntre("2026-09-10", "2026-09-10")).map((p) => p.id), [sept.id]);
    await c1.cobrarPedido(deudaMayo.id, "efectivo", 0, 0); // la deuda vieja pasa a cerrada
    const c2 = await import(`./lib/catalog.ts?fresco=${Date.now()}g`);
    eq("y junio SIGUE leyéndose después de cobrar la deuda de mayo", (await c2.comprobantesEntre("2026-06-01", "2026-06-30")).map((p) => p.id), [junio.id]);
    const desdeJunio = await c2.comprobantesEntre("2026-06-01", "2026-12-31");
    eq("junio + septiembre, sin repetidos", desdeJunio.map((p) => p.id).sort(), [junio.id, sept.id].sort());
    si("y la deuda de mayo quedó cobrada", (await c2.getCatalog()).pedidos.find((p) => p.id === deudaMayo.id)?.pago === "pagado");
    fs.unlinkSync(archivoDe("2026-06"));
  }

  console.log("\n═══ PONER A CERO BORRA TAMBIÉN EL ARCHIVO ═══");
  const cat5 = await import(`./lib/catalog.ts?fresco=${Date.now()}d`);
  await cat5.ponerACero();
  const cat6 = await import(`./lib/catalog.ts?fresco=${Date.now()}e`);
  const cero = await cat6.getCatalog();
  eq("cero pedidos", cero.pedidos.length, 0);
  eq("cero meses", cero.archivoMeses, []);
  si("y el documento del mes desapareció", !fs.existsSync(archivoDe("2026-05")));
} catch (e) {
  mal++;
  console.log("  ❌ reventó:", e?.stack ?? e);
} finally {
  if (fs.existsSync(RESPALDO)) {
    fs.copyFileSync(RESPALDO, FILE);
    fs.unlinkSync(RESPALDO);
  }
  limpiarArchivos();
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
