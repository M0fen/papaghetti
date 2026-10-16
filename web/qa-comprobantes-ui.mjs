/**
 * EL ARCHIVO DE COMPROBANTES, en el navegador, con la semilla de datos reales.
 *
 *   (servidor de producción local en :3112 con ADMIN_PASSWORD=pruebalocal123)
 *   node qa-comprobantes-ui.mjs
 *
 * Siembra 16 comprobantes con qa-semilla-comprobantes.mjs (hoy, ayer, la semana, el
 * mes pasado, hace tres meses; varios métodos; anulados; una devolución; pendientes),
 * prueba la pantalla y el CSV, y restaura el catálogo al final pase lo que pase.
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
const B = process.env.PG_URL || "http://127.0.0.1:3112";
const CLAVE = process.env.PG_CLAVE || "pruebalocal123";
let ok = 0, mal = 0;
const check = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "OK " : "MAL"} ${n}${d ? " · " + d : ""}`); };
const semilla = (orden) => execSync(`node --import ./qa-ts.mjs qa-semilla-comprobantes.mjs ${orden}`, { stdio: ["ignore", "pipe", "pipe"] }).toString();

semilla("sembrar");
await new Promise((r) => setTimeout(r, 2600)); // el cerebro memoriza 2 s
const doc = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"));
const sem = (nombre) => doc.pedidos.find((p) => p.cliente === `SEM ${nombre}`);
const paula = sem("Paula"), ana = sem("Ana Ríos"), bruno = sem("Bruno"), luis = sem("Luis"), hugo = sem("Hugo");

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  !! pageerror:", e.message));
const texto = async () => (await p.locator(".cbtes").innerText()).replace(/\s+/g, " ");
const filas = () => p.locator(".cbte-fila");
const filaDe = (nombre) => filas().filter({ hasText: `SEM ${nombre}` });

try {
  await p.goto(`${B}/admin`, { waitUntil: "networkidle" });
  await p.fill('input[type="password"]', CLAVE);
  await p.click('button[type="submit"]');
  await p.waitForSelector(".adminx__topbar", { timeout: 20000 });

  console.log("\n=== LLEGAR ===");
  check("está en el menú lateral, debajo de Pedidos", (await p.locator('.adminx__nav a[href="/admin/comprobantes"]').count()) === 1 && /Comprobantes/.test(await p.locator(".adminx__nav").innerText()));
  await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
  check("Pedidos enlaza al archivo", (await p.locator('a[href="/admin/comprobantes"]').count()) >= 1);
  const enCaja = await p.locator(".ocard").allInnerTexts();
  check("la caja trae los de HOY", enCaja.some((t) => /SEM Ana Ríos/.test(t)) && enCaja.some((t) => /SEM Diego/.test(t)));
  check("y las deudas vivas de otros días (Luis, de hace 20 días)", enCaja.some((t) => /SEM Luis/.test(t)));
  check("pero NO lo ya cerrado de otros días (Marta, Nora, Paula)", !enCaja.some((t) => /SEM (Marta|Nora|Paula)/.test(t)));
  check("y lo dice en el subtítulo", /por cobrar/.test(await p.locator(".adminx__pageh p").innerText()));

  console.log("\n=== HOY (el defecto) ===");
  await p.goto(`${B}/admin/comprobantes`, { waitUntil: "networkidle" });
  let t = await texto();
  check("título y aviso de que no es factura", /Comprobantes/.test(t) && /no factura electrónica/i.test(t));
  check("Hoy está seleccionado", /is-on/.test(await p.locator(".cbtes__seg .seg__item", { hasText: "Hoy" }).getAttribute("class")));
  check("aparecen los de hoy: Ana, Bruno, Carla, Diego, Elena", (await filaDe("Ana Ríos").count()) === 1 && (await filaDe("Bruno").count()) === 1 && (await filaDe("Diego").count()) === 1 && (await filaDe("Elena").count()) === 1);
  check("y NO los de ayer ni los viejos", (await filaDe("Fabio").count()) === 0 && (await filaDe("Paula").count()) === 0);
  check("la fila trae número, hora, plato y badge", /N° \d+/.test(await filaDe("Ana Ríos").innerText()) && /\d\d:\d\d/.test(await filaDe("Ana Ríos").innerText()) && /Pagado · Efectivo/.test(await filaDe("Ana Ríos").innerText()));
  check("Elena sale anulada con su motivo", /Anulado/.test(await filaDe("Elena").innerText()) && /cliente se fue/.test(await filaDe("Elena").innerText()) && /is-anulado/.test(await filaDe("Elena").getAttribute("class")));
  check("Diego está por pagar y tiene Cobrar", /Por pagar/.test(await filaDe("Diego").innerText()) && (await filaDe("Diego").locator(".cbte-fila__cobrar").count()) === 1);
  check("los chips de situación traen conteos", /Todos \(\d+\)/.test(t) && /Por pagar \(\d+\)/.test(t) && /Anulado \(\d+\)/.test(t));
  check("totales: cobrado por método con Nequi y Daviplata", /Cobrado/.test(t) && /Nequi/.test(t) && /Daviplata/.test(t));
  check("avisa de los pendientes de días anteriores (Luis)", /por pagar de días anteriores/.test(t));
  {
    // El enlace de esa alerta tiene que soltar los filtros que no cuenta.
    await p.goto(`${B}/admin/comprobantes?m=nequi`, { waitUntil: "networkidle" });
    await p.locator(".cbtes__control a", { hasText: "Verlos" }).click();
    await p.waitForLoadState("networkidle");
    check("«Verlos» lleva a los pendientes viejos de verdad, sin arrastrar el método", !/m=nequi/.test(p.url()) && (await filaDe("Luis").count()) === 1);
    await p.goto(`${B}/admin/comprobantes`, { waitUntil: "networkidle" });
  }
  const imprimir = await filaDe("Ana Ríos").locator("a", { hasText: "Imprimir" }).getAttribute("href");
  check("Imprimir abre el tiquete con ?imprimir=1", imprimir === `/admin/tiquete/${ana.id}?imprimir=1&de=comprobantes`);
  const waAna = await filaDe("Ana Ríos").locator("a", { hasText: "WhatsApp" }).getAttribute("href");
  // El texto es el mismo papel que se imprime: con su título (antes decía "Comprobante N° …").
  check("WhatsApp de Ana va a su número con 57 y el texto", /^https:\/\/wa\.me\/573001112233\?text=/.test(waAna) && /COMPROBANTE DE CONSUMO/.test(decodeURIComponent(waAna)));
  const waBruno = await filaDe("Bruno").locator("a", { hasText: "WhatsApp" }).getAttribute("href");
  check("WhatsApp de Bruno (sin teléfono) abre el tiquete pidiendo el número", waBruno === `/admin/tiquete/${bruno.id}?wa=1&de=comprobantes`);

  console.log("\n=== AYER ===");
  await p.locator(".cbtes__seg .seg__item", { hasText: "Ayer" }).click();
  await p.waitForLoadState("networkidle");
  check("la URL lleva p=ayer", /p=ayer/.test(p.url()));
  check("Fabio, Gloria y Hugo", (await filaDe("Fabio").count()) === 1 && (await filaDe("Gloria").count()) === 1 && (await filaDe("Hugo").count()) === 1);
  const hugoTxt = await filaDe("Hugo").innerText();
  check("Hugo: dinero devuelto, con monto en negativo y 'devuelto el' (se devolvió hoy)", /Dinero devuelto/.test(hugoTxt) && /−\$/.test(hugoTxt) && /devuelto el/.test(hugoTxt) && /plato frío/.test(hugoTxt));
  check("el total del día resta el devuelto", /Devuelto · 1/.test(await texto()));

  console.log("\n=== BUSCAR (sin fechas = en todo el archivo) ===");
  await p.goto(`${B}/admin/comprobantes`, { waitUntil: "networkidle" });
  await p.fill('input[name="q"]', "SEM Paula");
  await p.locator(".cbtes__buscar button[type=submit]").click();
  await p.waitForLoadState("networkidle");
  check("encuentra a Paula, de hace tres meses", (await filaDe("Paula").count()) === 1);
  check("y avisa que buscó en todas las fechas", /todas las fechas/.test(await texto()));
  await p.goto(`${B}/admin/comprobantes?q=${paula.consecutivo}`, { waitUntil: "networkidle" });
  check(`por número exacto (${paula.consecutivo}): una sola fila`, (await filas().count()) === 1 && (await filaDe("Paula").count()) === 1);
  await p.goto(`${B}/admin/comprobantes?q=nanez`, { waitUntil: "networkidle" });
  check("sin tildes ni eñes: 'nanez' encuentra a Carla Ñáñez", (await filaDe("Carla").count()) === 1);
  await p.goto(`${B}/admin/comprobantes?q=1112233`, { waitUntil: "networkidle" });
  check("por trozo de teléfono", (await filaDe("Ana Ríos").count()) === 1);
  await p.goto(`${B}/admin/comprobantes?q=noexistenadie`, { waitUntil: "networkidle" });
  check("vacío con búsqueda: lo dice y no revienta", /No encontramos nada/.test(await texto()) && (await filas().count()) === 0);

  console.log("\n=== FILTROS Y RANGOS ===");
  await p.goto(`${B}/admin/comprobantes?p=todo&m=nequi`, { waitUntil: "networkidle" });
  check("Nequi en todo: Bruno y Marta, no Ana", (await filaDe("Bruno").count()) === 1 && (await filaDe("Marta").count()) === 1 && (await filaDe("Ana Ríos").count()) === 0);
  check("el chip de Nequi está encendido", /is-on/.test(await p.locator(".cbtes__chips--metodos .fbtn", { hasText: "Nequi" }).getAttribute("class")));
  await p.goto(`${B}/admin/comprobantes?p=todo&s=pendiente`, { waitUntil: "networkidle" });
  check("por pagar en todo: Diego y Luis", (await filaDe("Diego").count()) === 1 && (await filaDe("Luis").count()) === 1 && (await filaDe("Ana Ríos").count()) === 0);
  await p.goto(`${B}/admin/comprobantes?p=todo&t=domicilio`, { waitUntil: "networkidle" });
  check("domicilios en todo: Carla, Hugo, Óscar", (await filaDe("Carla").count()) === 1 && (await filaDe("Hugo").count()) === 1 && (await filaDe("Óscar").count()) === 1 && (await filaDe("Bruno").count()) === 0);
  const mesPaula = paula.creadoEn.slice(0, 7);
  await p.goto(`${B}/admin/comprobantes?mes=${mesPaula}`, { waitUntil: "networkidle" });
  check(`mes=${mesPaula} muestra a Paula y Óscar`, (await filaDe("Paula").count()) === 1 && (await filaDe("Óscar").count()) === 1 && (await filaDe("Ana Ríos").count()) === 0);
  check("y el selector de mes entero está en ese mes", (await p.locator('select[name="mes"]').inputValue()) === mesPaula);
  await p.goto(`${B}/admin/comprobantes?p=todo`, { waitUntil: "networkidle" });
  t = await texto();
  check("Todo: los 16 sembrados", (await filas().filter({ hasText: "SEM " }).count()) === 16);
  check("agrupado por día, cada día con su subtotal", (await p.locator(".cbtes__dia").count()) >= 8 && /comprobante.*cobrado \$/.test(t));
  check("control de numeración presente", /Numeración: del N° \d+ al N° \d+/.test(t));
  check("pie de página: dónde se mueve el dinero", /única pantalla donde la plata cambia/.test(t));
  check("Mostrando x–y de n", /Mostrando \d+–\d+ de \d+/.test(t));
  await p.goto(`${B}/admin/comprobantes?p=todo&pag=99`, { waitUntil: "networkidle" });
  check("una página inexistente se recorta, no revienta", (await filas().count()) > 0);
  await p.goto(`${B}/admin/comprobantes?p=todo&s=devuelto&m=tarjeta`, { waitUntil: "networkidle" });
  check("vacío con 'Todo' se lee bien ('en todo el archivo', no 'todas las fechas')", /con esos filtros en todo el archivo/.test(await texto()));
  await p.goto(`${B}/admin/comprobantes?p=rango&desde=2026-08-01&hasta=2026-08-15`, { waitUntil: "networkidle" });
  await p.locator(".cbtes__fechas").getByRole("button", { name: /^Ir$/ }).click();
  await p.waitForLoadState("networkidle");
  check("pulsar 'Ir' sin elegir mes conserva el rango (no vuelve a Hoy)", /desde=2026-08-01/.test(p.url()) && /hasta=2026-08-15/.test(p.url()), p.url().split("?")[1] ?? "");

  console.log("\n=== EL CSV ===");
  const r = await p.request.get(`${B}/admin/comprobantes/csv?p=todo&q=SEM`);
  const cuerpo = await r.text();
  const lineas = cuerpo.split("\r\n");
  check("200 y text/csv", r.status() === 200 && /text\/csv/.test(r.headers()["content-type"]));
  check("attachment con nombre por rango", /attachment; filename="comprobantes-2000-01-01_\d{4}-\d{2}-\d{2}\.csv"/.test(r.headers()["content-disposition"]));
  check("BOM + cabecera ascii", cuerpo.charCodeAt(0) === 0xfeff && lineas[0].slice(1).startsWith("numero;fecha;hora;id;situacion;metodo_pago;total"));
  check("16 filas (una por sembrado) y ninguna de totales", lineas.length === 17, `${lineas.length - 1} filas`);
  check("Hugo va como devuelto con motivo y monto", lineas.some((l) => /SEM Hugo/.test(l) && /Dinero devuelto/.test(l) && /plato frío/.test(l)));
  check("el teléfono de Ana va en dígitos", lineas.some((l) => /SEM Ana Ríos;3001112233;/.test(l)));
  const anon = await b.newContext();
  const r401 = await anon.request.get(`${B}/admin/comprobantes/csv?p=todo`);
  check("sin sesión, 401 y sin datos", r401.status() === 401 && !/SEM/.test(await r401.text()));
  await anon.close();

  console.log("\n=== COBRAR UN PENDIENTE VIEJO DESDE EL ARCHIVO ===");
  await p.goto(`${B}/admin/comprobantes?p=todo&s=pendiente`, { waitUntil: "networkidle" });
  await filaDe("Luis").locator("summary", { hasText: "Cobrar" }).click();
  await filaDe("Luis").locator("button.chipbtn", { hasText: "Nequi" }).click();
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(800);
  await p.goto(`${B}/admin/comprobantes?q=SEM Luis`, { waitUntil: "networkidle" });
  check("Luis quedó pagado por Nequi", /Pagado · Nequi/.test(await filaDe("Luis").innerText()));
  check("y no tiene devolver ni anular aquí", (await filaDe("Luis").locator("button, summary").filter({ hasText: /Devolver|Anular|Cancelar/ }).count()) === 0);

  console.log("\n=== EL TIQUETE DESDE EL ARCHIVO ===");
  await p.goto(`${B}/admin/tiquete/${bruno.id}?wa=1&de=comprobantes`, { waitUntil: "networkidle" });
  await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
  check("con ?wa=1 pide el número de WhatsApp de una vez", (await p.locator('.cbte-wa input[type="tel"]').count()) === 1);
  check("y 'Volver' devuelve al archivo", (await p.locator('a[href="/admin/comprobantes"]', { hasText: /Volver a comprobantes/ }).count()) === 1);
  await p.goto(`${B}/admin/tiquete/${hugo.id}?de=comprobantes`, { waitUntil: "networkidle" });
  await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
  check("el tiquete de un devuelto lo dice", /DINERO DEVUELTO/.test(await p.locator(".cbte").innerText()));

  console.log("\n=== EN UN CELULAR (400px) ===");
  const movil = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const m = await movil.newPage();
  await m.goto(`${B}/admin`, { waitUntil: "networkidle" });
  await m.fill('input[type="password"]', CLAVE);
  await m.click('button[type="submit"]');
  await m.waitForSelector(".adminx__topbar", { timeout: 20000 }).catch(() => {});
  await m.goto(`${B}/admin/comprobantes?p=todo`, { waitUntil: "networkidle" });
  const ancho = await m.evaluate(() => [document.scrollingElement.scrollWidth, window.innerWidth]);
  check("no hay scroll horizontal", ancho[0] <= ancho[1] + 1, ancho.join(" vs "));
  const fila = m.locator(".cbte-fila").filter({ hasText: "SEM Ana" });
  const cajas = await fila.locator(".cbte-fila__acciones a").evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height));
  check("los botones de la fila miden 44px o más al tacto", cajas.length >= 3 && cajas.every((h) => h >= 43), cajas.map((h) => Math.round(h)).join("/"));
  await m.screenshot({ path: process.env.PG_SHOT || "qa-comprobantes-movil.png", fullPage: false });
  await fila.scrollIntoViewIfNeeded();
  await m.screenshot({ path: (process.env.PG_SHOT || "qa-comprobantes-movil.png").replace(".png", "-fila.png"), fullPage: false });
  await movil.close();
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto(`${B}/admin/comprobantes?p=todo`, { waitUntil: "networkidle" });
  await p.screenshot({ path: process.env.PG_SHOT2 || "qa-comprobantes-desktop.png", fullPage: true });
} catch (e) {
  mal++;
  console.log("  !! reventó:", e?.stack ?? e);
} finally {
  await b.close();
  console.log(semilla("restaurar").trim());
}

console.log(`\n=== ${ok} OK · ${mal} MAL ===`);
process.exit(mal ? 1 : 0);
