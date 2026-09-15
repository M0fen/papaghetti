/**
 * DOS PETICIONES A LA VEZ: que ninguna pise el trabajo de la otra.
 *
 * El cerebro se lee FUERA del candado de escritura y se escribe DENTRO. Entre esas
 * dos cosas, otra instancia (otro pedido por QR, la cocina, el propio cajero en otra
 * pantalla) pudo escribir. `fusionar` decide qué sobrevive, y ahí es donde se pierde
 * o se resucita el trabajo ajeno.
 *
 * La carrera se hace DETERMINISTA sin hilos ni suerte: se ceba el memo de 2 s con
 * una lectura, se escribe el archivo POR DEBAJO (eso es "la otra instancia"), y se
 * lanza una mutación cualquiera. Esa mutación trae una copia vieja; lo que pase con
 * el cambio ajeno es exactamente lo que pasaría en producción.
 *
 *   node --import ./qa-ts.mjs qa-fusion.mjs
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-fusion";
const ARCHIVO_MAYO = path.join(process.cwd(), "data", "comprobantes-2026-05.json");
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);

let ok = 0, mal = 0;
const si = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? " · " + d : ""}`); };
const eq = (n, a, b) => si(n, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b) ? "" : `dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)}`);

const leerDisco = () => JSON.parse(fs.readFileSync(FILE, "utf8"));
const escribirDisco = (doc) => fs.writeFileSync(FILE, JSON.stringify(doc, null, 2), "utf8");

const pedido = (id, extra = {}) => ({
  id,
  consecutivo: Number(id.replace(/\D/g, "")) || 1,
  creadoEn: "2026-09-10T18:00:00.000Z",
  canal: "salon",
  tipo: "mesa",
  cliente: `FUSION ${id}`,
  estado: "recibido",
  pago: "pendiente",
  items: [{ nombre: "Plato", cantidad: 1, precio: 20000 }],
  base: "Plato", proteina: "—", toppings: [],
  subtotal: 20000, impuesto: 0, propina: 0, descuento: 0, total: 20000,
  ...extra,
});

try {
  const cat = await import("./lib/catalog.ts");
  const original = leerDisco();
  /** Deja el cerebro en un estado conocido, sin memo y sin pilas. */
  const sembrar = (pedidos, extra = {}) => {
    escribirDisco({ ...original, pedidos, movimientos: [], historial: [], undo: [], redo: [], archivoMeses: [], ...extra });
  };
  /**
   * La carrera, en tres pasos:
   *  1. alguien LEE (se ceba el memo con esa foto),
   *  2. OTRA instancia escribe el archivo por debajo,
   *  3. el primero termina su trabajo y hace commit con su copia vieja.
   */
  const carrera = async (pedidosIniciales, loQueEscribeElOtro, miMutacion, extra = {}) => {
    sembrar(pedidosIniciales, extra);
    await cat.getCatalog(); // (1) el memo queda con la foto vieja
    const doc = leerDisco();
    escribirDisco(loQueEscribeElOtro(doc)); // (2) la otra instancia
    await miMutacion(); // (3) mi commit, con la copia vieja en la mano
    return leerDisco();
  };

  console.log("\n═══ UN COBRO AJENO NO SE PIERDE ═══");
  {
    const final = await carrera(
      [pedido("AAA1")],
      (d) => ({ ...d, pedidos: [{ ...d.pedidos[0], pago: "pagado", metodoPago: "nequi", estado: "entregado" }] }),
      () => cat.toggleAbierto(), // una acción que NO toca ese pedido
    );
    const p = final.pedidos.find((x) => x.id === "AAA1");
    eq("el pedido sigue pagado por Nequi", [p?.pago, p?.metodoPago], ["pagado", "nequi"]);
    eq("y con el estado que le puso el otro", p?.estado, "entregado");
  }
  {
    // El caso de verdad: cobrar mientras entra un pedido por QR.
    sembrar([pedido("BBB2")]);
    await cat.getCatalog();
    const doc = leerDisco();
    escribirDisco({ ...doc, pedidos: [pedido("NUEVO9", { creadoEn: "2026-09-10T19:00:00.000Z", consecutivo: 9 }), ...doc.pedidos] });
    await cat.cobrarPedido("BBB2", "efectivo", 0, 0);
    const final = leerDisco();
    eq("mi cobro se guarda", final.pedidos.find((x) => x.id === "BBB2")?.pago, "pagado");
    si("y el pedido que entró mientras tanto no se pierde", final.pedidos.some((x) => x.id === "NUEVO9"));
  }

  console.log("\n═══ LO QUE OTRA INSTANCIA SACÓ NO RESUCITA ═══");
  {
    const final = await carrera(
      [pedido("CCC3"), pedido("DDD4", { pago: "pagado", estado: "entregado" })],
      (d) => ({ ...d, pedidos: d.pedidos.filter((p) => p.id !== "DDD4"), archivoMeses: ["2026-09"] }), // lo archivó
      () => cat.toggleAbierto(),
    );
    si("el archivado no vuelve al cerebro", !final.pedidos.some((x) => x.id === "DDD4"));
    si("el otro sigue ahí", final.pedidos.some((x) => x.id === "CCC3"));
    eq("y el índice del archivo se conserva", final.archivoMeses, ["2026-09"]);
  }
  {
    const final = await carrera(
      [pedido("EEE5", { pago: "pagado", estado: "entregado" })],
      (d) => ({ ...d, pedidos: [], archivoMeses: ["2026-09"] }),
      () => cat.devolverPedido("EEE5", "prueba"), // pero YO sí lo cambié
    );
    const p = final.pedidos.find((x) => x.id === "EEE5");
    eq("si YO lo cambié, mi cambio manda y vuelve", [p?.pago, p?.estado], ["devuelto", "cancelado"]);
  }

  console.log("\n═══ EL ÍNDICE DEL ARCHIVO NO RESUCITA TRAS PONER A CERO ═══");
  {
    fs.writeFileSync(ARCHIVO_MAYO, JSON.stringify({ mes: "2026-05", pedidos: [] }), "utf8");
    const final = await carrera(
      [pedido("FFF6")],
      (d) => ({ ...d, pedidos: [], archivoMeses: [] }), // otra instancia puso el negocio en cero
      () => cat.toggleAbierto(),
      { archivoMeses: ["2026-05"] },
    );
    eq("el mes borrado no vuelve al índice", final.archivoMeses, []);
  }
  {
    const final = await carrera(
      [pedido("GGG7")],
      (d) => ({ ...d, archivoMeses: ["2026-05"] }), // otra instancia archivó mayo
      () => cat.toggleAbierto(),
    );
    eq("un mes que archivó el otro SÍ se conserva", final.archivoMeses, ["2026-05"]);
  }

  console.log("\n=== UN CIERRE DE CAJA AJENO NO SE PIERDE ===");
  {
    sembrar([]);
    await cat.getCatalog();
    const doc = leerDisco();
    // La otra instancia abre la caja mientras yo tengo una copia sin arqueos.
    escribirDisco({ ...doc, arqueos: [{ id: "ARQ1", dia: "2026-09-14", abiertoEn: "2026-09-14T13:00:00.000Z", base: 50000 }] });
    await cat.toggleAbierto();
    eq("la apertura de caja sobrevive", (leerDisco().arqueos ?? []).map((a) => a.id), ["ARQ1"]);
  }

  console.log("\n=== LAS FOTOS NO SE COPIAN EN CADA DESHACER ===");
  {
    const fotaza = "data:image/webp;base64," + "A".repeat(40000);
    sembrar([]);
    {
      const d = leerDisco();
      d.bases[0].foto = fotaza;
      escribirDisco(d);
    }
    const idFoto = leerDisco().bases[0].id;
    await cat.getCatalog();
    await cat.toggleAbierto();
    await cat.toggleAbierto();
    await cat.toggleAbierto();
    const con = leerDisco();
    si("la pila de deshacer no lleva la foto dentro", !JSON.stringify(con.undo ?? []).includes(fotaza.slice(0, 200)));
    si("la foto sigue en la carta", con.bases.find((b) => b.id === idFoto).foto === fotaza);
    const f = await import(`./lib/catalog.ts?fresco=${Date.now()}foto`);
    await f.deshacer();
    si("y deshacer no la borra", leerDisco().bases.find((b) => b.id === idFoto).foto === fotaza);
  }

  console.log("\n═══ LA DESPENSA SIGUE FUSIONÁNDOSE POR DELTA ═══");
  {
    const previo = await cat.getCatalog();
    const ins = previo.insumos[0].id;
    sembrar([]);
    await cat.abastecerInsumo(ins, 100);
    const antes = leerDisco().insumos.find((i) => i.id === ins).stock;
    await cat.getCatalog();
    const doc = leerDisco();
    escribirDisco({ ...doc, insumos: doc.insumos.map((i) => (i.id === ins ? { ...i, stock: i.stock - 10 } : i)) });
    await cat.abastecerInsumo(ins, 5);
    const final = leerDisco().insumos.find((i) => i.id === ins).stock;
    eq("los dos movimientos sobreviven (−10 del otro, +5 mío)", final, antes - 10 + 5);
  }
} catch (e) {
  mal++;
  console.log("  ❌ reventó:", e?.stack ?? e);
} finally {
  if (fs.existsSync(RESPALDO)) {
    fs.copyFileSync(RESPALDO, FILE);
    fs.unlinkSync(RESPALDO);
  }
  if (fs.existsSync(ARCHIVO_MAYO)) fs.unlinkSync(ARCHIVO_MAYO);
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
