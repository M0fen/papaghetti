/**
 * RESTAURAR UNA COPIA COMPLETA (la que baja Ajustes → Descargar copia completa).
 * Herramienta del desarrollador: el panel no tiene botón de restaurar a propósito.
 *
 *   node --import ./qa-ts.mjs restaurar-copia.mjs <copia.json>              → solo simula
 *   node --import ./qa-ts.mjs restaurar-copia.mjs <copia.json> --de-verdad  → escribe
 *
 * Sin variables de producción, restaura el cerebro LOCAL (web/data/). Para producción,
 * con el negocio CERRADO y todas las pantallas cerradas: PG_BLOB=1, el
 * BLOB_READ_WRITE_TOKEN del almacén y PG_PERMITIR_PRODUCCION=1 (qa-ts.mjs se niega sin
 * esta última). Después, volver a desplegar. Antes de escribir guarda el estado actual
 * como respaldo-antes-de-restaurar-<fecha>.
 */
import fs from "node:fs";

const [ruta, bandera] = process.argv.slice(2);
if (!ruta || (bandera && bandera !== "--de-verdad")) {
  console.error("Uso: node --import ./qa-ts.mjs restaurar-copia.mjs <copia.json> [--de-verdad]");
  process.exit(1);
}
const deVerdad = bandera === "--de-verdad";

let copia;
try {
  copia = JSON.parse(fs.readFileSync(ruta, "utf8"));
} catch (e) {
  console.error(`No se pudo leer ${ruta}: ${e?.message ?? e}`);
  process.exit(1);
}

const { restaurarCopia } = await import("./lib/catalog.ts");
try {
  const plan = await restaurarCopia(copia, { deVerdad });
  console.log(deVerdad ? "\n✅ RESTAURADO" : "\n(simulación: no se escribió nada)");
  console.log(`  copia del:   ${plan.generadoEn}`);
  console.log(`  destino:     ${plan.destino.backend} · ${plan.destino.entorno}`);
  console.log(`  pedidos:     ${plan.pedidos} en el cerebro + ${plan.pedidosArchivados} archivados`);
  console.log(`  meses:       ${plan.meses.join(", ") || "ninguno"}`);
  if (plan.respaldo) console.log(`  lo de antes: ${plan.respaldo}`);
  if (!deVerdad) console.log("\nPara escribir de verdad, repite con --de-verdad.");
} catch (e) {
  console.error(`\n✋ ${e?.message ?? e}`);
  process.exit(1);
}
