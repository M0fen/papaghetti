/**
 * PRECIOS DESDE EL PANEL → MENÚ INTERACTIVO, de punta a punta.
 *
 * Se cambia un precio en /admin/precios y se comprueba que aparece en el QR
 * (/pedir, la carta de platos) y en la página pública, sin recargar nada a mano.
 *
 *   node qa-precios.mjs     (servidor en :3112)
 */
import { chromium } from "playwright";
const B = process.env.PG_URL || "http://127.0.0.1:3112";
const CLAVE = process.env.PG_CLAVE || "pruebalocal123";
let ok = 0, mal = 0;
const check = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "OK " : "MAL"} ${n}${d ? " · " + d : ""}`); };
const cop = (n) => "$" + n.toLocaleString("es-CO");

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
p.on("pageerror", (e) => console.log("  !! pageerror:", e.message));
await p.goto(`${B}/admin`, { waitUntil: "networkidle" });
await p.fill('input[type="password"]', CLAVE);
await p.click('button[type="submit"]');
await p.waitForSelector(".adminx__topbar", { timeout: 20000 }).catch(() => {});

console.log("\n=== LA PÁGINA DE PRECIOS ===");
check("está en el menú lateral", (await p.locator('.adminx__nav a[href="/admin/precios"]').count()) === 1);
await p.goto(`${B}/admin/precios`, { waitUntil: "networkidle" });
check("abre como página, sin fondo ni botón de cerrar", (await p.locator(".prq--inline").count()) === 1 && (await p.locator(".prq__x").count()) === 0);
const filas = await p.locator(".prq__fila").count();
check("lista toda la carta", filas >= 30, `${filas} productos`);

// ---- Un plato de precio cerrado: nuevo precio único para no confundirse con otro
const nuevoPlato = 53000 + Math.floor(Math.random() * 900);
await p.fill(".prq__buscar input", "churrasco");
await p.waitForTimeout(200);
const filaPlato = p.locator(".prq__fila").filter({ has: p.locator('input[name="tipo"][value="plato"]') }).first();
const nombrePlato = await filaPlato.locator(".prq__nombre").inputValue();
const antesPlato = Number(await filaPlato.locator('input[name="precio"]').inputValue());
await filaPlato.locator('input[name="precio"]').fill(String(nuevoPlato));
await filaPlato.locator(".prq__ok").click();
await p.waitForTimeout(2500);

// ---- Una base
const nuevaBase = 17000 + Math.floor(Math.random() * 900);
await p.goto(`${B}/admin/precios`, { waitUntil: "networkidle" });
await p.fill(".prq__buscar input", "papa criolla");
await p.waitForTimeout(200);
const filaBase = p.locator(".prq__fila").first();
const antesBase = Number(await filaBase.locator('input[name="precio"]').inputValue());
await filaBase.locator('input[name="precio"]').fill(String(nuevaBase));
await filaBase.locator(".prq__ok").click();
await p.waitForTimeout(2500);

console.log("\n=== EL MENÚ INTERACTIVO (QR) LO REFLEJA ===");
const q = await b.newPage({ viewport: { width: 390, height: 844 } });
await q.goto(`${B}/pedir`, { waitUntil: "networkidle" });
await q.waitForSelector(".emp-bar", { timeout: 30000 }).catch(() => {});
const abrir = q.getByRole("button", { name: /plato|listos|sin armar/i }).first();
if (await abrir.count()) { await abrir.click().catch(() => {}); await q.waitForTimeout(1200); }
const cartaQR = await q.locator(".pcarta__panel").innerText().catch(() => "");
check(`el plato "${nombrePlato}" sale con el precio nuevo en el QR`, cartaQR.includes(cop(nuevoPlato)), `${cop(antesPlato)} → ${cop(nuevoPlato)}`);
/* La barra del juego dice "desde $X" con la base MÁS BARATA, que no tiene por qué ser
   la que se cambió: se deja como dato, no como comprobación. */
console.log("  barra del juego:", (await q.locator(".emp-total small").innerText().catch(() => "")).trim());
await q.close();

console.log("\n=== LA WEB PÚBLICA LO REFLEJA ===");
const html = await (await fetch(`${B}/`)).text();
check("la carta pública muestra el precio nuevo de la base", html.includes(cop(nuevaBase)), cop(nuevaBase));
check("y el del plato", html.includes(cop(nuevoPlato)), cop(nuevoPlato));

// ---- Restaurar
await p.goto(`${B}/admin/precios`, { waitUntil: "networkidle" });
await p.fill(".prq__buscar input", "churrasco");
await p.waitForTimeout(200);
const fp = p.locator(".prq__fila").filter({ has: p.locator('input[name="tipo"][value="plato"]') }).first();
await fp.locator('input[name="precio"]').fill(String(antesPlato));
await fp.locator(".prq__ok").click();
await p.waitForTimeout(2000);
await p.goto(`${B}/admin/precios`, { waitUntil: "networkidle" });
await p.fill(".prq__buscar input", "papa criolla");
await p.waitForTimeout(200);
await p.locator(".prq__fila").first().locator('input[name="precio"]').fill(String(antesBase));
await p.locator(".prq__fila").first().locator(".prq__ok").click();
await p.waitForTimeout(2000);
console.log("  (precios restaurados)");

console.log(`\n=== ${ok} OK · ${mal} MAL ===`);
await b.close();
process.exit(mal ? 1 : 0);
