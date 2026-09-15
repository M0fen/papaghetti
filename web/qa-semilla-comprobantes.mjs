/**
 * SEMILLA para probar el historial de comprobantes con datos que parezcan de verdad.
 *
 * Crea comandas por el cerebro REAL (con su despensa, sus números y sus cobros) y
 * después les corre la fecha en data/catalog.json para repartirlas entre hoy, ayer,
 * esta semana, el mes pasado y hace tres meses. Cobra por varios métodos, anula dos,
 * devuelve el dinero de una y deja dos por pagar.
 *
 *   node --import ./qa-ts.mjs qa-semilla-comprobantes.mjs sembrar     → copia de seguridad + siembra
 *   node --import ./qa-ts.mjs qa-semilla-comprobantes.mjs restaurar   → vuelve a dejar el catálogo como estaba
 *
 * Todo lo sembrado lleva el cliente "SEM …", para reconocerlo a simple vista.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-semilla";
const orden = process.argv[2] ?? "sembrar";

if (orden === "restaurar") {
  if (fs.existsSync(RESPALDO)) {
    fs.copyFileSync(RESPALDO, FILE);
    fs.unlinkSync(RESPALDO);
    console.log("catálogo restaurado");
  } else {
    console.log("no había copia de seguridad: nada que restaurar");
  }
  process.exit(0);
}

if (fs.existsSync(RESPALDO)) {
  console.log("ya hay una semilla puesta (existe la copia de seguridad): restaura primero");
  process.exit(1);
}
fs.copyFileSync(FILE, RESPALDO);

const cat = await import("./lib/catalog.ts");
const previo = await cat.getCatalog();
for (const i of previo.insumos) await cat.abastecerInsumo(i.id, 500);
const doc = await cat.getCatalog();
const platos = doc.enredos.filter((e) => !e.baseId && !e.proteinaId && e.activo !== false);
const plato = (i) => platos[i % platos.length];

/** [cliente, telefono, tipo, referencia, lineas, cobro: método | "pendiente" | "anular" | "devolver", desplazamiento en días, hora local] */
const PLAN = [
  ["SEM Ana Ríos", "300 111 2233", "mesa", "ventanal", [[0, 1]], "efectivo", 0, 12],
  ["SEM Bruno", "", "llevar", "", [[1, 2]], "nequi", 0, 13],
  ["SEM Carla Ñáñez", "311 222 3344", "domicilio", "Cra 7 # 20-15", [[2, 1], [0, 1]], "daviplata", 0, 14],
  ["SEM Diego", "", "mesa", "barra", [[3, 1]], "pendiente", 0, 15],
  ["SEM Elena", "", "mesa", "mesa del fondo", [[1, 1]], "anular", 0, 16],
  ["SEM Fabio", "320 333 4455", "llevar", "", [[2, 2]], "tarjeta", -1, 12],
  ["SEM Gloria", "", "mesa", "ventanal", [[0, 1]], "efectivo", -1, 13],
  ["SEM Hugo", "", "domicilio", "Calle 20 # 5-10", [[3, 1]], "devolver", -1, 19],
  ["SEM Inés", "", "mesa", "", [[1, 1]], "breb", -3, 12],
  ["SEM Jorge", "301 444 5566", "llevar", "", [[2, 1]], "transferencia", -5, 13],
  ["SEM Karen", "", "mesa", "barra", [[0, 3]], "efectivo", -6, 20],
  ["SEM Luis", "", "mesa", "", [[3, 1]], "pendiente", -20, 12],
  ["SEM Marta", "", "llevar", "", [[1, 1]], "nequi", -35, 13],
  ["SEM Nora", "", "mesa", "ventanal", [[2, 1]], "efectivo", -40, 14],
  ["SEM Óscar", "", "domicilio", "Av. 30 de Agosto # 40-20", [[0, 1]], "anular", -95, 12],
  ["SEM Paula", "", "mesa", "", [[3, 2]], "tarjeta", -100, 13],
];

const creados = [];
for (const [cliente, telefono, tipo, referencia, lineas, cobro] of PLAN) {
  const p = await cat.crearComanda({
    lineas: lineas.map(([i, cantidad]) => ({ enredoId: plato(i).id, cantidad })),
    canal: "salon",
    tipo,
    cliente,
    telefono: telefono || undefined,
    referencia: tipo !== "domicilio" ? referencia || undefined : undefined,
    direccion: tipo === "domicilio" ? referencia : undefined,
  });
  if (cobro === "anular") await cat.cancelarPedido(p.id, "prueba: cliente se fue");
  else if (cobro === "devolver") {
    await cat.cobrarPedido(p.id, "efectivo", 0, 0);
    await cat.devolverPedido(p.id, "prueba: plato frío");
  } else if (cobro !== "pendiente") await cat.cobrarPedido(p.id, cobro, 0, 0);
  creados.push({ id: p.id, cobro });
}

/* Correr las fechas directamente en el documento (el cerebro pone "ahora" y aquí
   hacen falta días distintos).
   EL DÍA DE PARTIDA ES EL DE PEREIRA, no el del reloj UTC de la máquina. Después de
   las 7 de la tarde de Pereira ya es el día siguiente en UTC, así que tomando el día
   UTC la semilla fechaba "hoy" en el futuro: el panel no mostraba nada de hoy y las
   pruebas fallaban solo de noche. Es la misma trampa que `diaNegocio` resuelve en el
   producto. Pereira es UTC−5 fijo, así que la hora local `h` se escribe como h+5 UTC. */
const json = JSON.parse(fs.readFileSync(FILE, "utf8"));
const [Y, M, D] = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
  .format(new Date())
  .split("-")
  .map(Number);
const enPereira = (dias, hora) => {
  const base = new Date(Date.UTC(Y, M - 1, D + dias));
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hora + 5, 7 + (Math.abs(dias) % 50), 0),
  ).toISOString();
};
PLAN.forEach(([, , , , , cobro, dias, hora], k) => {
  const p = json.pedidos.find((x) => x.id === creados[k].id);
  if (!p) return;
  p.creadoEn = enPereira(dias, hora);
  if (cobro === "devolver" && p.devolucion) p.devolucion.fecha = enPereira(0, 10); // devuelto HOY, pedido de ayer
});
/* Los consecutivos se reasignan en orden de fecha en el siguiente commit; aquí se
   dejan ya coherentes para que la lista se lea bien desde el primer momento. */
const porFecha = [...json.pedidos].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
porFecha.forEach((p, i) => (p.consecutivo = i + 1));
json.pedidos.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
fs.writeFileSync(FILE, JSON.stringify(json, null, 2), "utf8");

const semilla = json.pedidos.filter((p) => p.cliente?.startsWith("SEM "));
console.log(JSON.stringify({ sembrados: semilla.length, ids: semilla.map((p) => `${p.consecutivo}:${p.id}:${p.cliente}:${p.pago}/${p.estado}:${p.creadoEn.slice(0, 10)}`) }, null, 1));
