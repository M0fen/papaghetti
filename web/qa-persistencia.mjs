/**
 * PRUEBA DE PERSISTENCIA DURABLE (Vercel Blob).
 *
 * Comprueba lo único que de verdad importa para abrir mañana: que un pedido creado
 * siga existiendo cuando el proceso se reinicia, y que dos escrituras simultáneas no
 * se pierdan la una a la otra.
 *
 * Escribe en el almacén REAL (es el mismo que usa producción), así que crea un pedido
 * de prueba y lo deja marcado como cancelado con motivo "PRUEBA".
 *
 *   PG_BLOB=1 node --import ./qa-ts.mjs qa-persistencia.mjs
 */
import fs from "node:fs";

// Carga .env.local a mano (node no lo hace; Next sí).
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)="?([^"\r]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}
process.env.PG_BLOB = "1";

let ok = 0,
  mal = 0;
const check = (n, c, d = "") => {
  c ? ok++ : mal++;
  console.log(`  ${c ? "✅" : "❌"} ${n}${d ? " · " + d : ""}`);
};

console.log("\n═══ EL CEREBRO VIVE EN UN ALMACÉN DURABLE ═══");
check("hay token de Blob", !!process.env.BLOB_READ_WRITE_TOKEN);

const cat = await import("./lib/catalog.ts");
const antes = await cat.getCatalog();
check("lee el catálogo", Array.isArray(antes.bases) && antes.bases.length > 0, `${antes.bases.length} bases, ${antes.pedidos.length} pedidos`);

const baseId = antes.bases[0].id;
const protId = antes.proteinas[0].id;

console.log("\n═══ UN PEDIDO SOBREVIVE AL REINICIO DEL PROCESO ═══");
const p = await cat.crearPedido({
  baseId,
  proteinaId: protId,
  toppingIds: [],
  tipo: "llevar",
  cliente: "PRUEBA persistencia",
  notas: "pedido de prueba automática",
});
check("pedido creado", !!p.id, `#${p.id}`);

// Simula un proceso nuevo: módulo fresco, sin memoria ni memo.
const cat2 = await import(`./lib/catalog.ts?fresco=${Date.now()}`);
const releido = await cat2.getCatalog();
const encontrado = releido.pedidos.find((x) => x.id === p.id);
check("el pedido SIGUE ahí tras releer desde cero", !!encontrado, encontrado ? `#${encontrado.id} · ${encontrado.cliente}` : "PERDIDO");
check("conserva los números", encontrado?.total === p.total, `$${encontrado?.total}`);

console.log("\n═══ DOS ESCRITURAS A LA VEZ NO SE PIERDEN ═══");
const [a, b] = await Promise.all([
  cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "llevar", cliente: "PRUEBA simultanea A" }),
  cat.crearPedido({ baseId, proteinaId: protId, toppingIds: [], tipo: "llevar", cliente: "PRUEBA simultanea B" }),
]);
const cat3 = await import(`./lib/catalog.ts?fresco=${Date.now()}b`);
const final = await cat3.getCatalog();
check("sobrevive el pedido A", !!final.pedidos.find((x) => x.id === a.id), `#${a.id}`);
check("sobrevive el pedido B", !!final.pedidos.find((x) => x.id === b.id), `#${b.id}`);
check("y siguen siendo dos distintos", a.id !== b.id);

console.log("\n═══ LIMPIEZA: los pedidos de prueba quedan cancelados ═══");
for (const id of [p.id, a.id, b.id]) {
  try {
    await cat.cancelarPedido(id, "PRUEBA automática");
  } catch (e) {
    console.log("   (no se pudo cancelar", id, "—", e.message.slice(0, 50) + ")");
  }
}
const cat4 = await import(`./lib/catalog.ts?fresco=${Date.now()}c`);
const limpio = await cat4.getCatalog();
const vivos = [p.id, a.id, b.id].filter(
  (id) => limpio.pedidos.find((x) => x.id === id)?.estado !== "cancelado",
);
check("los 3 de prueba quedaron cancelados", vivos.length === 0, vivos.join(", "));

console.log("\n═══ RESPALDO DEL DÍA ═══");
const { list } = await import("@vercel/blob");
const l = await list({ prefix: "cerebro/" });
const respaldos = l.blobs.filter((x) => x.pathname.includes("respaldo-"));
check("existe el respaldo de hoy", respaldos.length > 0, respaldos.map((r) => r.pathname.replace("cerebro/", "")).join(", "));
const doc = l.blobs.find((x) => x.pathname === "cerebro/catalog.json");
check("el documento principal está en el almacén", !!doc, doc ? `${Math.round(doc.size / 1024)}KB` : "");

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══\n`);
process.exit(mal > 0 ? 1 : 0);
