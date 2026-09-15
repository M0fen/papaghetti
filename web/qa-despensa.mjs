/**
 * SIN DESPENSA, ¿SE PUEDE VENDER?
 *
 * El caso que reportó el mesero: con el inventario en cero, "Nueva comanda" solo
 * dejaba elegir platos de carta y no decía por qué. Aquí se comprueban las dos
 * salidas —cargar la despensa o apagar el control— y que el aviso exista.
 *
 *   node --import ./qa-ts.mjs qa-despensa.mjs
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-despensa";
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);

const cat = await import("./lib/catalog.ts");
let ok = 0, mal = 0;
const si = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? " · " + d : ""}`); };
const rechaza = async (n, fn, frag) => {
  try { await fn(); mal++; console.log(`  ❌ ${n} · no rechazó`); }
  catch (e) {
    const bien = e.message.toLowerCase().includes(frag.toLowerCase());
    bien ? ok++ : mal++;
    console.log(`  ${bien ? "✅" : "❌"} ${n} · ${e.message}`);
  }
};
const disponibles = async () => {
  const d = await cat.getCatalog();
  return [...d.bases, ...d.proteinas, ...d.toppings].filter((i) => !i.agotado && i.activo !== false).length;
};

// Punto de partida: negocio recién abierto, despensa sin contar.
await cat.ponerACero();
const d0 = await cat.getCatalog();
const baseId = d0.bases[0].id;
const protId = d0.proteinas[0].id;
const platoCocina = d0.enredos.find((e) => !e.baseId && !e.proteinaId && e.activo !== false);

console.log("\n═══ DESPENSA EN CERO, CONTROL ENCENDIDO ═══");
si("no queda NADA disponible para armar", (await disponibles()) === 0);
await rechaza(
  "armar una caja se rechaza",
  () => cat.crearComanda({ lineas: [{ baseId, proteinaIds: [protId], cantidad: 1 }], tipo: "llevar" }),
  "se nos acabó",
);
const suelto = await cat.crearComanda({ lineas: [{ enredoId: platoCocina.id, cantidad: 1 }], tipo: "llevar" });
si("pero un plato de cocina SÍ se vende", Boolean(suelto.id), platoCocina.nombre);

console.log("\n═══ SALIDA 1 · APAGAR EL CONTROL DE INVENTARIO ═══");
await cat.updateAjustes({ controlarStock: false });
si("la carta entera vuelve a estar disponible", (await disponibles()) === 24, `${await disponibles()} de 24`);
const armada = await cat.crearComanda({
  lineas: [{ baseId, proteinaIds: [protId], cantidad: 2 }],
  tipo: "llevar",
});
si("ya se puede armar una caja", Boolean(armada.id));
si("y con cantidad", armada.items[0].cantidad === 2);
const trasVenta = await cat.getCatalog();
si("la carta NO se agota sola", trasVenta.bases.find((b) => b.id === baseId).agotado === false);
const insumoBase = trasVenta.insumos.find((i) =>
  (trasVenta.bases.find((b) => b.id === baseId).receta ?? []).some((r) => r.insumoId === i.id),
);
si(
  "pero el inventario SÍ se descuenta (para cuando se encienda)",
  insumoBase !== undefined,
  insumoBase ? `${insumoBase.nombre}: ${insumoBase.stock}` : "",
);

console.log("\n═══ SALIDA 2 · CARGAR LA DESPENSA ═══");
await cat.updateAjustes({ controlarStock: true });
si("al reencender, vuelve a agotarse lo que no alcanza", (await disponibles()) === 0);
/* 5000 y no 100: las recetas van en GRAMOS y piden 130g de pasta o 160g de
   churrasco por porción, así que con 100 la carta se queda —correctamente— agotada.
   Vale la pena dejarlo escrito: cargar "100" de todo no es cargar la despensa. */
const d1 = await cat.getCatalog();
for (const i of d1.insumos) await cat.abastecerInsumo(i.id, 5000);
si("con despensa cargada, la carta se enciende sola", (await disponibles()) === 24, `${await disponibles()} de 24`);
const armada2 = await cat.crearComanda({ lineas: [{ baseId, proteinaIds: [protId], cantidad: 1 }], tipo: "llevar" });
si("y se puede armar con el control encendido", Boolean(armada2.id));

console.log("\n═══ CON EL CONTROL APAGADO, LO DE A MANO SIGUE MANDANDO ═══");
await cat.updateAjustes({ controlarStock: false });
/* "Se acabó el pollo" es la acción más frecuente de un servicio. Si el interruptor la
   desactivara, apagarlo para poder vender dejaría al mesero sin forma de sacar algo
   de la carta en caliente — y vendería lo que no hay, que es peor que el problema que
   el interruptor venía a resolver. */
await cat.updateIngrediente(protId, { agotado: true });
await rechaza(
  "una proteína marcada 'se acabó' se respeta",
  () => cat.crearComanda({ lineas: [{ baseId, proteinaIds: [protId], cantidad: 1 }], tipo: "llevar" }),
  "se nos acabó",
);
const trasMarca = await cat.getCatalog();
si("y la marca NO se borra sola", trasMarca.proteinas.find((x) => x.id === protId).agotado === true);
await cat.updateIngrediente(protId, { agotado: false });
si(
  "al desmarcarla vuelve a venderse",
  Boolean((await cat.crearComanda({ lineas: [{ baseId, proteinaIds: [protId], cantidad: 1 }], tipo: "llevar" })).id),
);

console.log("\n═══ EL CONTROL NO ABRE LA PUERTA A VENDER LO RETIRADO ═══");
await cat.updateIngrediente(baseId, { activo: false });
await rechaza(
  "una base sacada de la carta sigue bloqueada",
  () => cat.crearComanda({ lineas: [{ baseId, proteinaIds: [protId], cantidad: 1 }], tipo: "llevar" }),
  "ya no está en la carta",
);

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
if (fs.existsSync(RESPALDO)) {
  fs.copyFileSync(RESPALDO, FILE);
  fs.unlinkSync(RESPALDO);
  console.log("(catálogo restaurado a su estado original)");
}
process.exit(mal ? 1 : 0);
