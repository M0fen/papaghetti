/**
 * EL KIT DEL PC DE LA CAJA (lib/kit-impresora.ts): que el .bat sea ejecutable tal cual.
 *
 * Puro (Node). Si PG_KIT_SALIDA apunta a una carpeta, además deja ahí el .bat para
 * ejecutarlo en modo diagnóstico (PG_SOLO_DIAGNOSTICO=1) en un Windows de verdad.
 */
import fs from "node:fs";
import path from "node:path";

const { kitImpresora, MARCA_PS, NOMBRE_KIT } = await import("./lib/kit-impresora.ts");

let ok = 0;
let mal = 0;
const eq = (nombre, real, esperado, extra = "") => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (bien) ok++;
  else mal++;
  console.log(`  ${bien ? "✅" : "❌"} ${nombre}${bien ? "" : ` · real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)} ${extra}`}`);
};

console.log("\n═══ EL KIT DE LA IMPRESORA ═══");
const kit = kitImpresora("https://papaghetti.vercel.app");
const lineas = kit.split("\r\n");
eq("nombre .bat", NOMBRE_KIT.endsWith(".bat"), true);
eq("empieza por @echo off, sin BOM", kit.startsWith("@echo off"), true);
eq("todas las líneas terminan en CRLF (ningún LF suelto)", /[^\r]\n/.test(kit), false);
eq("la marca aparece UNA vez como línea propia", lineas.filter((l) => l === MARCA_PS).length, 1);
eq("y la línea del lanzador no la contiene literal", lineas.slice(0, lineas.indexOf(MARCA_PS)).some((l) => l.includes(MARCA_PS)), false);
eq("el cmd sale antes de la marca (exit /b)", lineas.slice(0, lineas.indexOf(MARCA_PS)).includes("exit /b"), true);
eq("pide administrador", /-Verb RunAs/.test(kit), true);
eq("lleva el sitio", kit.includes("$Sitio = 'https://papaghetti.vercel.app'"), true);
eq("acceso directo con --kiosk-printing a la caja", kit.includes("'--kiosk-printing \"' + $Sitio + '/admin/pedidos\"'"), true);
eq("sin comillas invertidas (el escape de PowerShell rompería el template)", kit.includes("`"), false);
eq("el here-string de C# cierra en la columna 0", lineas.includes('"@'), true);
eq("prueba directa en RAW", kit.includes('di.pDataType = "RAW"'), true);
eq("pregunta antes de tocar (ningún Set- sin Pregunta cerca)", kit.split("Pregunta ").length > 10, true);
eq("avisa del Generic / Text Only", kit.includes("Generic / Text Only"), true);
eq("habla de 58 mm, no de 80", /58 x 3276/.test(kit) && !/80 x 3276/.test(kit), true);
eq("un apóstrofe en el sitio se escapa para PowerShell", kitImpresora("https://o'hara.app").includes("'https://o''hara.app'"), true);
eq("regex con \\s y \\d llegan con una sola barra", kit.includes("'^\\s*[sSyY]'") && kit.includes("'^\\d+$'"), true);
eq("rutas de Windows con una sola barra", kit.includes("'Google\\Chrome\\Application\\chrome.exe'") && !kit.includes("\\\\Chrome"), true);

const salida = process.env.PG_KIT_SALIDA;
if (salida) {
  fs.writeFileSync(path.join(salida, NOMBRE_KIT), kit);
  console.log(`  (escrito en ${path.join(salida, NOMBRE_KIT)})`);
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
