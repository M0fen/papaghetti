/**
 * IMPRESIÓN DIRECTA (puerto COM / Bluetooth BLE) y la página de la impresora.
 *
 * Sin hardware: se inyectan un `navigator.serial` y un `navigator.bluetooth` falsos
 * que CAPTURAN los bytes escritos, se pulsan los botones reales, y se comprueba que
 * lo que habría llegado a la impresora es un trabajo ESC/POS bien formado:
 *
 *   · en modo TEXTO (el defecto): ESC @, el tiquete en ASCII con el cliente y el
 *     TOTAL, avance y corte; ~1 KB.
 *   · en modo IMAGEN: ESC @, raster GS v 0 de 72 bytes por fila, avance y corte.
 *
 *   node qa-directa.mjs     (servidor en :3112 con despensa cargada)
 */
import { chromium } from "playwright";
const B = process.env.PG_URL || "http://127.0.0.1:3112";
const CLAVE = process.env.PG_CLAVE || "pruebalocal123";
let ok = 0, mal = 0;
const check = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "OK " : "MAL"} ${n}${d ? " · " + d : ""}`); };
const hex = (a) => a.map((b) => b.toString(16).padStart(2, "0")).join(" ");
const texto = (a) => a.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b === 0x0a ? "\n" : "")).join("");

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });

/* Los falsos, instalados ANTES de que cargue la página (así el componente los ve). */
await ctx.addInitScript(() => {
  window.__serie = [];
  window.__ble = [];
  window.__bleEscrituras = [];
  const puerto = {
    open: async () => {},
    close: async () => {},
    writable: new WritableStream({ write(chunk) { window.__serie.push(...chunk); } }),
  };
  Object.defineProperty(navigator, "serial", {
    configurable: true,
    value: { requestPort: async () => puerto, getPorts: async () => [] },
  });
  const caracteristica = {
    properties: { writeWithoutResponse: true },
    writeValueWithoutResponse: async (v) => {
      const u = new Uint8Array(v.buffer ?? v);
      window.__bleEscrituras.push(u.length);
      window.__ble.push(...u);
    },
    writeValue: async (v) => { window.__ble.push(...new Uint8Array(v.buffer ?? v)); },
  };
  const gatt = {
    connected: false,
    connect: async () => { gatt.connected = true; return gatt; },
    disconnect: () => {},
    getPrimaryService: async (uuid) => {
      if (uuid !== "0000ff00-0000-1000-8000-00805f9b34fb") throw new Error("no such service");
      return { getCharacteristics: async () => [caracteristica] };
    },
  };
  Object.defineProperty(navigator, "bluetooth", {
    configurable: true,
    value: { requestDevice: async () => ({ name: "POS-80 falsa", gatt }) },
  });
});

const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  !! pageerror:", e.message));
await p.goto(`${B}/admin`, { waitUntil: "networkidle" });
await p.fill('input[type="password"]', CLAVE);
await p.click('button[type="submit"]');
await p.waitForSelector(".adminx__topbar", { timeout: 20000 }).catch(() => {});

// Un pedido para tener comprobante
await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Nueva comanda/i }).click();
await p.getByRole("button", { name: /Plato de la carta/i }).click();
await p.waitForTimeout(300);
await p.locator(".comanda__plato").first().click();
await p.fill('input[name="cliente"]', "DIRECTA");
await p.getByRole("button", { name: /Mandar a cocina/i }).click();
await p.waitForTimeout(2500);
await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
const href = await p.locator(".ocard").filter({ hasText: "DIRECTA" }).first().locator('a[href^="/admin/tiquete/"]').first().getAttribute("href");
await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen", { timeout: 20000 });

const COM = /Por puerto COM/i;
const BLE = /Por Bluetooth/i;
const modo = (cual) => p.locator(".idirecta__modo button", { hasText: cual }).click();
const vaciar = () => p.evaluate(() => { window.__serie = []; window.__ble = []; window.__bleEscrituras = []; });

const analizarImagen = (nombre, bytes) => {
  console.log(`  ${nombre}: ${bytes.length} bytes · empieza ${hex(bytes.slice(0, 2))} · raster en ${bytes.indexOf(0x1d)}`);
  check(`${nombre} · arranca con ESC @`, hex(bytes.slice(0, 2)) === "1b 40");
  const i = bytes.findIndex((v, k) => v === 0x1d && bytes[k + 1] === 0x76 && bytes[k + 2] === 0x30);
  check(`${nombre} · lleva raster GS v 0`, i > 0);
  check(`${nombre} · de 72 bytes por fila (576 puntos)`, i > 0 && bytes[i + 4] === 0x48 && bytes[i + 5] === 0x00);
  check(`${nombre} · termina con avance y corte`, hex(bytes.slice(-4)) === "1d 56 42 00");
  const negros = bytes.slice(i + 8).filter((v) => v !== 0).length;
  check(`${nombre} · el bitmap tiene tinta (no está vacío)`, negros > 2000, `${negros} bytes con puntos`);
};
const analizarTexto = (nombre, bytes) => {
  const t = texto(bytes);
  console.log(`  ${nombre}: ${bytes.length} bytes`);
  check(`${nombre} · arranca con ESC @`, hex(bytes.slice(0, 2)) === "1b 40");
  check(`${nombre} · es pequeño (menos de 3 KB)`, bytes.length > 300 && bytes.length < 3000, `${bytes.length} bytes`);
  check(`${nombre} · solo ASCII`, bytes.every((v) => v < 0x80));
  check(`${nombre} · lleva el nombre del cliente`, /Cliente: DIRECTA/.test(t));
  check(`${nombre} · lleva el TOTAL y el aviso de que no es factura`, /TOTAL\s+\$[\d.]+/.test(t) && /No es factura/.test(t));
  check(`${nombre} · sin raster GS v 0`, !bytes.some((v, k) => v === 0x1d && bytes[k + 1] === 0x76));
  check(`${nombre} · termina con avance y corte`, hex(bytes.slice(-4)) === "1d 56 42 00");
};

console.log("\n=== EN EL COMPROBANTE · modo TEXTO (el defecto) ===");
check("aparece 'Imprimir directo'", await p.locator(".idirecta").isVisible());
check("el selector Texto/Imagen está y arranca en Texto", /is-on/.test(await p.locator(".idirecta__modo button", { hasText: "Texto" }).getAttribute("class")));
check("el botón dice puerto COM (USB o Bluetooth emparejado)", (await p.getByRole("button", { name: COM }).count()) === 1);
await p.getByRole("button", { name: COM }).click();
await p.waitForTimeout(1200);
const serieTexto = await p.evaluate(() => window.__serie);
analizarTexto("COM/texto", serieTexto);
check("y lo dice en pantalla, con los baudios", /Enviado por el puerto COM a 9600 baudios/.test(await p.locator(".idirecta__msg").innerText()));

await p.getByRole("button", { name: BLE }).click();
await p.locator(".idirecta__msg", { hasText: /Enviado a/ }).waitFor({ timeout: 20000 });
const bleTexto = await p.evaluate(() => window.__ble);
analizarTexto("BLE/texto", bleTexto);
check("los dos canales mandan EXACTAMENTE el mismo trabajo", serieTexto.length === bleTexto.length && serieTexto.every((v, k) => v === bleTexto[k]));
const escrituras = await p.evaluate(() => window.__bleEscrituras);
check("por BLE va en escrituras de como mucho 100 bytes", escrituras.length > 5 && escrituras.every((n) => n <= 100), `${escrituras.length} escrituras, máx ${Math.max(...escrituras)}`);

console.log("\n=== EN EL COMPROBANTE · modo IMAGEN ===");
await modo("Imagen");
await vaciar();
await p.getByRole("button", { name: COM }).click();
await p.locator(".idirecta__msg", { hasText: /Enviado por el puerto COM/ }).waitFor({ timeout: 20000 });
const serieImg = await p.evaluate(() => window.__serie);
analizarImagen("COM/imagen", serieImg);
await p.getByRole("button", { name: BLE }).click();
/* Por BLE se manda a 100 bytes por escritura con una pausa, así que 66 KB tardan unos
   segundos: se espera al "Enviado", no a un reloj fijo. */
await p.locator(".idirecta__msg", { hasText: /Enviado a/ }).waitFor({ timeout: 60000 });
const bleImg = await p.evaluate(() => window.__ble);
analizarImagen("BLE/imagen", bleImg);
check("los dos canales mandan EXACTAMENTE la misma imagen", serieImg.length === bleImg.length && serieImg.every((v, k) => v === bleImg[k]));
check("la imagen pesa más de 20 veces el texto", serieImg.length > 20 * serieTexto.length, `${serieImg.length} vs ${serieTexto.length}`);
check("el modo elegido se recuerda", await p.evaluate(() => localStorage.getItem("pg_modo_directo")) === "imagen");
await modo("Texto");

console.log("\n=== LA PÁGINA DE LA IMPRESORA ===");
check("está en el menú lateral", (await p.locator('.adminx__nav a[href="/admin/impresora"]').count()) === 1);
await p.goto(`${B}/admin/impresora`, { waitUntil: "networkidle" });
await p.waitForTimeout(600);
const pasos = await p.locator(".impresora__paso h2").allInnerTexts();
check("cuatro pasos: Windows → Chrome → COM/Bluetooth → sin diálogo", pasos.length === 4 && /Windows/.test(pasos[0]) && /Chrome/.test(pasos[1]) && /COM/.test(pasos[2]) && /no pregunte/.test(pasos[3]), pasos.join(" | "));
const todo = await p.locator(".impresora").innerText();
check("dice qué hacer si la página de prueba de Windows no sale", /no sale/.test(await p.locator(".impresora__clave").innerText()));
check("nombra la cola en pausa / sin conexión y el servicio de impresión", /Pausar impresión/.test(todo) && /Administrador de trabajos de impresión/.test(todo));
check("avisa del driver 'Generic / Text Only'", /Generic \/ Text Only/.test(todo));
check("avisa del destino 'Guardar como PDF' y de 'Ver más'", /Guardar como PDF/.test(todo) && /Ver más/.test(todo));
check("explica el puerto COM y el Bluetooth clásico emparejado", /Puertos \(COM y LPT\)/.test(todo) && /Bluetooth clásico/.test(todo));
check("da el orden de baudios", /9600 → 38400 → 115200 → 19200/.test(todo));
check("muestra el patrón dibujado", await p.locator(".impresora__vista img").isVisible());
check("y ofrece descargarlo", (await p.locator('a[download="patron-de-prueba.png"]').count()) === 1);
await vaciar();
await p.locator(".impresora").getByRole("button", { name: COM }).click();
await p.waitForTimeout(1200);
const prueba = await p.evaluate(() => window.__serie);
check("la prueba de canal en texto: pequeña, con PAPAGHETTI y la regla de columnas", prueba.length > 100 && prueba.length < 1000 && /PAPAGHETTI/.test(texto(prueba)) && /0123456789/.test(texto(prueba)), `${prueba.length} bytes`);
await p.locator(".impresora .idirecta__modo button", { hasText: "Imagen" }).click();
await vaciar();
await p.locator(".impresora").getByRole("button", { name: COM }).click();
await p.locator(".impresora .idirecta__msg", { hasText: /Enviado por el puerto COM/ }).waitFor({ timeout: 20000 });
const patron = await p.evaluate(() => window.__serie);
check("el patrón también sale por el camino directo", patron.length > 1000 && hex(patron.slice(0, 2)) === "1b 40" && hex(patron.slice(-4)) === "1d 56 42 00", `${patron.length} bytes`);
await p.locator(".impresora .idirecta__modo button", { hasText: "Texto" }).click();

// Limpieza
await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
p.once("dialog", (d) => d.accept("prueba"));
await p.locator(".ocard").filter({ hasText: "DIRECTA" }).first().getByRole("button", { name: /^Cancelar$/ }).click().catch(() => {});
await p.waitForTimeout(1500);

console.log(`\n=== ${ok} OK · ${mal} MAL ===`);
await b.close();
process.exit(mal ? 1 : 0);
