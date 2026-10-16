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

  /* ═══ LA CARTA Y LOS AJUSTES, A TRES VÍAS ═══
     La misma carrera, pero el "otro" es OTRA INSTANCIA de verdad: un módulo fresco con su
     propio memo, que lee, cambia y escribe por su cuenta (lo que haría otra lambda). Yo
     llego después con la copia que leí un instante antes. */
  const precios = await import("./lib/precios.ts");
  const vendible = () => ({
    ajustes: { ...original.ajustes, abierto: true, controlarStock: false, adicionales: [{ id: "ad-a", nombre: "Limonada FUSION", precio: 9000 }] },
    bases: original.bases.map((b, i) => (i === 0 ? { ...b, activo: true, agotado: false } : b)),
  });
  let n = 0;
  const carreraConOtro = async (pedidosIniciales, otro, mia) => {
    sembrar(pedidosIniciales, vendible());
    await cat.getCatalog(); // (1) mi copia, en el memo
    await otro(await import(`./lib/catalog.ts?otra=${Date.now()}-${n++}`)); // (2) la otra instancia
    await mia(); // (3) yo, con la copia de hace un instante
    return leerDisco();
  };
  const base0 = original.bases[0];

  console.log("\n═══ UN AJUSTE DE PRECIOS NO SE PIERDE ENTRE DISPOSITIVOS ═══");
  {
    const final = await carreraConOtro(
      [],
      async (otra) => {
        const plan = precios.planAjuste(precios.listasAjusteDe(await otra.getCatalog()), 10, ["bases", "adicionales"]);
        await otra.ajustarPrecios({ pct: 10, grupos: ["bases", "adicionales"], firma: plan.firma });
      },
      () => cat.crearPedido({ baseId: base0.id, toppingIds: [], tipo: "llevar" }), // un pedido por QR
    );
    eq(
      "las bases nuevas sobreviven a un pedido que traía la copia vieja",
      final.bases.map((b) => b.precio),
      original.bases.map((b) => precios.precioAjustado(b.precio, 10)),
    );
    eq("y el adicional también", final.ajustes.adicionales.map((a) => a.precio), [9900]);
    eq("el pedido entró igual", final.pedidos.length, 1);
    si("y el ajuste sigue a mano para Deshacer", (final.undo ?? []).at(-1)?.etiqueta?.startsWith("Subió 10 %"));
  }
  {
    const final = await carreraConOtro(
      [pedido("TOQ1")],
      (otra) => otra.toggleAbierto(), // otra pantalla: «Cerrar el negocio»
      () => cat.avanzarPedido("TOQ1"), // la cocina, con su copia
    );
    eq("«Cerrar el negocio» sobrevive a un toque de la cocina", final.ajustes.abierto, false);
    eq("y el toque de la cocina también", final.pedidos.find((p) => p.id === "TOQ1")?.estado, "cocina");
  }
  {
    const prot = original.proteinas[0];
    const final = await carreraConOtro(
      [],
      (otra) => otra.updateIngrediente(prot.id, { agotado: true }), // «se acabó», en la cocina
      () => cat.crearPedido({ baseId: base0.id, toppingIds: [], tipo: "llevar" }),
    );
    eq("un «se acabó» de la cocina sobrevive a un pedido con la copia vieja", final.proteinas.find((p) => p.id === prot.id)?.agotado, true);
  }
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.updateAjustes({ comprobante: { mensajeCierre: "Del otro" } }, "Cambió el comprobante"),
      () => cat.updateAjustes({ costoDomicilio: 6500 }, "Cambió el cobro"),
    );
    eq("dos secciones de Ajustes guardadas a la vez: las dos quedan", [final.ajustes.costoDomicilio, final.ajustes.comprobante?.mensajeCierre], [6500, "Del otro"]);
  }

  console.log("\n═══ MI PROPIO CAMBIO SIGUE GANANDO ═══");
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.updateIngrediente(base0.id, { nombre: "Nombre del otro" }),
      () => cat.updateIngrediente(base0.id, { precio: 99900 }),
    );
    const b = final.bases.find((x) => x.id === base0.id);
    eq("lo que yo cambié manda, y lo que cambió el otro en la misma ficha también queda", [b?.precio, b?.nombre], [99900, "Nombre del otro"]);
  }
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.updateIngrediente(base0.id, { precio: 11100 }),
      () => cat.updateIngrediente(base0.id, { precio: 22200 }),
    );
    eq("los dos tocamos el mismo precio: gana el último que guarda (yo)", final.bases.find((x) => x.id === base0.id)?.precio, 22200);
  }

  console.log("\n═══ BORRAR FUNCIONA ═══");
  {
    const [t1, t2] = original.toppings.filter((t) => t.categoria !== "salsa");
    const final = await carreraConOtro(
      [],
      (otra) => otra.updateIngrediente(t1.id, { precio: 12300 }),
      () => cat.deleteIngrediente(t2.id),
    );
    si("lo que yo borré se va", !final.toppings.some((t) => t.id === t2.id));
    eq("y el cambio del otro en otra ficha se queda", final.toppings.find((t) => t.id === t1.id)?.precio, 12300);
  }
  {
    const [, , t3] = original.toppings.filter((t) => t.categoria !== "salsa");
    const final = await carreraConOtro(
      [pedido("TOQ2")],
      (otra) => otra.deleteIngrediente(t3.id),
      () => cat.avanzarPedido("TOQ2"),
    );
    si("lo que borró el otro NO resucita por venir en mi copia", !final.toppings.some((t) => t.id === t3.id));
  }
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.guardarAdicionalConfig({ nombre: "Jugo FUSION", precio: 7000 }),
      () => cat.borrarAdicionalConfig("ad-a"),
    );
    eq("borrar un adicional mientras otro crea uno: se va el mío, queda el suyo", final.ajustes.adicionales.map((a) => a.nombre), ["Jugo FUSION"]);
  }

  console.log("\n═══ DOS ALTAS A LA VEZ SOBREVIVEN ═══");
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.createIngrediente({ categoria: "topping", nombre: "FUSION del otro", precio: 1000 }),
      () => cat.createIngrediente({ categoria: "topping", nombre: "FUSION mio", precio: 2000 }),
    );
    const nombres = final.toppings.map((t) => t.nombre);
    si("los dos productos nuevos quedan", nombres.includes("FUSION del otro") && nombres.includes("FUSION mio"), nombres.join(", "));
    eq("y el orden es el mío, con lo ajeno al final", nombres.slice(-2), ["FUSION mio", "FUSION del otro"]);
  }
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.guardarAdicionalConfig({ nombre: "Jugo FUSION", precio: 7000 }),
      () => cat.guardarAdicionalConfig({ nombre: "Té FUSION", precio: 6000 }),
    );
    eq("dos adicionales creados a la vez", final.ajustes.adicionales.map((a) => a.nombre), ["Limonada FUSION", "Té FUSION", "Jugo FUSION"]);
  }
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.upsertPromo({ id: "", texto: "Promo FUSION del otro", tono: "oro", banner: false, activo: false }),
      () => cat.upsertPromo({ id: "", texto: "Promo FUSION mia", tono: "oro", banner: false, activo: false }),
    );
    const textos = final.ajustes.promos.map((p) => p.texto);
    si("dos promos creadas a la vez", textos.includes("Promo FUSION del otro") && textos.includes("Promo FUSION mia"), textos.join(" | "));
  }
  {
    const final = await carreraConOtro(
      [],
      (otra) => otra.createInsumo({ nombre: "Insumo FUSION", unidad: "g", stock: 50, parStock: 50 }),
      () => cat.abastecerInsumo(original.insumos[0].id, 3),
    );
    si("un insumo que creó el otro no desaparece por mi copia vieja", final.insumos.some((i) => i.nombre === "Insumo FUSION"));
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
