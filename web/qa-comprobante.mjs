/**
 * EL COMPROBANTE, DE PUNTA A PUNTA.
 *
 * La comprobación que de verdad importa es la del iframe: se SECUESTRA su `print()`
 * para ver exactamente QUÉ documento se manda a la impresora. Contar páginas de un
 * PDF no bastaba —decía "1 página" mientras el papel salía en blanco—, porque la
 * pregunta nunca fue cuántas páginas sino qué hay dentro de ellas.
 *
 *   node qa-comprobante.mjs     (servidor en :3112, con despensa cargada)
 */
import { chromium } from "playwright";
import fs from "node:fs";
const B = "http://127.0.0.1:3112";
const S = "C:/Users/Carlos/AppData/Local/Temp/claude/c--Users-Carlos-Desktop-Papaghetti/0b9eca89-af0c-469f-953c-639458dbdd51/scratchpad";
let ok = 0, mal = 0;
const check = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "OK " : "MAL"} ${n}${d ? " · " + d : ""}`); };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
p.on("pageerror", (e) => console.log("  !! pageerror:", e.message));
await p.goto(`${B}/admin`, { waitUntil: "networkidle" });
await p.fill('input[type="password"]', "pruebalocal123");
await p.click('button[type="submit"]');
await p.waitForSelector(".adminx__topbar", { timeout: 20000 }).catch(() => {});

/* Un pedido PROPIO, siempre. Antes se tomaba `.first()`, o sea el que hubiera
   dejado cualquier otra prueba: un tiquete de 10 renglones ya cancelado, que ocupa
   dos páginas y hacía fallar comprobaciones que no tenían nada que ver con él. */
const CLIENTE = "REGRESION CBTE " + Date.now().toString(36).slice(-4);
await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
{
  await p.getByRole("button", { name: /Nueva comanda/i }).click();
  await p.locator(".npedido__tipo", { hasText: /En el local/i }).first().click();
  await p.fill('input[name="referencia"]', "Mesa del ventanal");
  await p.locator(".npedido__grupo", { hasText: "Base" }).first().locator(".chipbtn").first().click();
  await p.locator(".npedido__grupo", { hasText: "Proteína" }).first().locator(".chipbtn").first().click();
  await p.locator(".npedido__grupo", { hasText: "Acompañantes" }).first().locator(".chipbtn").first().click();
  await p.getByRole("button", { name: /Agregar esta caja/i }).click();
  await p.locator(".comanda__ren").first().getByRole("button", { name: "Uno más" }).click();
  await p.getByRole("button", { name: /Plato de la carta/i }).click();
  await p.waitForTimeout(300);
  await p.locator(".comanda__plato").first().click();
  await p.fill('input[name="cliente"]', CLIENTE);
  await p.fill('input[name="notas"]', "Sin cebolla, por favor");
  await p.getByRole("button", { name: /Mandar a cocina/i }).click();
  await p.waitForTimeout(2600);
  await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
}
const href = await p.locator(".ocard").filter({ hasText: CLIENTE }).first().locator('a[href^="/admin/tiquete/"]').first().getAttribute("href");
await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte", { timeout: 15000 });

// ---- 1. ¿Se ve al imprimir? (era el fallo: 38/38 elementos invisibles) ----
await p.emulateMedia({ media: "print" });
await p.waitForTimeout(500);
const d = await p.evaluate(() => {
  const cb = document.querySelector(".cbte");
  let ocultos = 0, total = 0;
  for (const el of cb.querySelectorAll("*")) { total++; if (getComputedStyle(el).visibility === "hidden") ocultos++; }
  const r = cb.getBoundingClientRect();
  // ¿Algo se sale del ancho del tiquete?
  const desbordan = [];
  for (const el of cb.querySelectorAll("*")) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      desbordan.push(`${el.className || el.tagName}:"${(el.textContent||"").trim().slice(0,22)}" ${el.scrollWidth}>${el.clientWidth}`);
  }
  return {
    visible: getComputedStyle(cb).visibility === "visible",
    ocultos, total,
    ancho: Math.round(r.width), alto: Math.round(r.height),
    altoDoc: Math.round(document.documentElement.scrollHeight),
    desbordan: desbordan.slice(0, 5),
  };
});
console.log("\n=== MODO IMPRESIÓN (térmica) ===");
check("el comprobante se ve", d.visible);
check("ningún elemento queda oculto", d.ocultos === 0, `${d.ocultos}/${d.total}`);
check("nada se sale del ancho", d.desbordan.length === 0, d.desbordan.join(" | "));
/* `documentElement.scrollHeight` nunca baja del alto del viewport, así que comparar
   contra él siempre falla: la pregunta de verdad —¿sale papel en blanco detrás?— la
   contesta el número de páginas del PDF, que se comprueba justo abajo. */

await p.pdf({ path: `${S}/cbte-termica.pdf`, printBackground: true });
const buf = fs.readFileSync(`${S}/cbte-termica.pdf`);
const paginas = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`  PDF térmica: ${Math.round(buf.length/1024)}KB · ${paginas} página(s)`);
check("sale en UNA sola página (sin papel en blanco)", paginas === 1, `${paginas} páginas`);

// ---- 2. Hoja normal ----
await p.emulateMedia({ media: "screen" });
await p.getByRole("button", { name: /Hoja normal/i }).click();
await p.waitForTimeout(300);
await p.emulateMedia({ media: "print" });
await p.waitForTimeout(400);
await p.pdf({ path: `${S}/cbte-hoja.pdf`, printBackground: true, format: "A4" });
const buf2 = fs.readFileSync(`${S}/cbte-hoja.pdf`);
const pag2 = (buf2.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`  PDF hoja A4: ${Math.round(buf2.length/1024)}KB · ${pag2} página(s)`);
check("la hoja normal también cabe en una página", pag2 === 1, `${pag2} páginas`);
await p.emulateMedia({ media: "screen" });

// ---- 2b. LO QUE SE MANDA A LA IMPRESORA: UNA IMAGEN ----
/* El dueño lo vio en el local: de todo el tiquete HTML, lo único que llegaba al papel
   era el logo — una imagen. Así que ahora el tiquete ENTERO es una imagen. Aquí se
   secuestra `window.open` para capturar el documento que va a la impresora, y luego
   se DECODIFICA el PNG y se cuentan píxeles negros por bandas: la prueba de que hay
   texto dibujado y no solo el logo, que era exactamente el fallo. */
await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
await p.evaluate(() => {
  window.__doc = null;
  const orig = window.open;
  window.open = function () {
    const w = orig.call(window, "", "_blank");
    if (w) {
      w.print = () => { window.__doc = w.document.documentElement.outerHTML; };
    }
    return w;
  };
});
await p.getByRole("button", { name: /^Imprimir$/ }).click();
await p.waitForTimeout(2500);
const docImp = await p.evaluate(() => window.__doc);
console.log("\n=== LO QUE LLEGA A LA IMPRESORA ===");
check("se manda un documento", Boolean(docImp));
if (docImp) {
  check("contiene UNA imagen y nada más de HTML", /<img[^>]+src="data:image\/png/.test(docImp) && !/<div|<p |<span/.test(docImp));
  /* 72mm CENTRADOS, no 100%: el rollo mide 80 pero el cabezal imprime 72 (576
     puntos). A 72mm los 576px del canvas caen uno a uno sobre los puntos del
     cabezal, sin reescalar; al 100% el driver recortaba 4mm por lado. */
  check("la imagen va a 72mm centrados (los puntos del cabezal, 1:1)", /img\{display:block;width:72mm;max-width:100%;margin:0 auto/.test(docImp));
  check("NO lleva el panel", !/adminx__side/.test(docImp));
  /* SIN `size`: Epson y Bixolon declaran 80×297 y 80×3276 y no arrancan en el mismo;
     si el @page no coincide con el papel del driver, Chrome encoge o centra la página.
     Sin size manda el papel del driver y no puede haber desajuste. */
  check("no fija tamaño de papel (manda el del driver)", /@page \{ margin: 0; \}/.test(docImp) && !/size:/.test((docImp.match(/@page[^}]*}/) || [""])[0]), (docImp.match(/@page[^}]*}/) || [""])[0]);
}

/* La imagen, decodificada: ¿tiene tinta donde debe? Se divide en bandas horizontales
   y se cuenta cuánto negro hay en cada una. El logo vive arriba; si SOLO hubiera
   logo, las bandas del medio y de abajo estarían en blanco. */
const px = await p.evaluate(async () => {
  const img = document.querySelector(".cbte-imagen");
  const src = img?.getAttribute("src") || "";
  const im = new Image();
  await new Promise((r) => { im.onload = r; im.onerror = r; im.src = src; });
  const c = document.createElement("canvas");
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const cx = c.getContext("2d");
  cx.drawImage(im, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height).data;
  const bandas = 6;
  const alto = Math.floor(c.height / bandas);
  const negro = [];
  for (let b = 0; b < bandas; b++) {
    let n = 0;
    for (let y = b * alto; y < (b + 1) * alto; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100) n++;
      }
    negro.push(n);
  }
  return { w: c.width, h: c.height, negro, bytes: src.length };
});
console.log(`  imagen ${px.w}×${px.h}px · ${Math.round(px.bytes / 1024)}KB · negro por banda: ${px.negro.join(" / ")}`);
check("la imagen mide 576px (el cabezal de 80mm)", px.w === 576, `${px.w}px`);
check("y tiene altura de tiquete", px.h > 700, `${px.h}px`);
check("hay tinta ARRIBA (logo y datos)", px.negro[0] > 500);
check("hay tinta EN MEDIO (renglones y sumas) — no solo el logo", px.negro[2] > 500 && px.negro[3] > 500, `${px.negro[2]} / ${px.negro[3]}`);
check("hay tinta ABAJO (total, pago y pie)", px.negro[4] + px.negro[5] > 500);

const dl = p.locator('a[download^="comprobante-"]');
check("existe 'Descargar imagen' como salvavidas", (await dl.count()) === 1);
check("y descarga el mismo PNG", ((await dl.getAttribute("href")) || "").startsWith("data:image/png"));
// ---- 3. WhatsApp sin teléfono ----
console.log("\n=== WHATSAPP ===");
await p.goto(B + href, { waitUntil: "networkidle" });
const btnWa = p.getByRole("button", { name: /Enviar por WhatsApp/i });
check("el botón existe aunque el pedido no traiga teléfono", await btnWa.isVisible());
await btnWa.click();
await p.locator(".cbte-wa input").fill("3001234567");
await p.waitForTimeout(200);
const hrefWa = await p.locator(".cbte-wa a").getAttribute("href");
check("arma el enlace con indicativo 57", (hrefWa || "").includes("wa.me/573001234567"), (hrefWa||"").slice(0, 60));
const txt = decodeURIComponent((hrefWa || "").split("text=")[1] || "");
check("el texto lleva el total", /TOTAL/.test(txt));
check("y NO habla de propina", !/propina/i.test(txt));

// ---- 4. Sin propina en el papel ----
console.log("\n=== SIN PROPINA ===");
const papel = await p.locator(".cbte").innerText();
check("el comprobante no menciona la propina", !/propina/i.test(papel));
await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
check("la caja ya no pide propina", (await p.locator('input[name="propina"]').count()) === 0);

await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen");
await p.locator(".cbte-imagen").screenshot({ path: `${S}/cbte-nuevo.png` });
console.log(`\n=== ${ok} OK · ${mal} MAL ===`);
await b.close();
process.exit(mal ? 1 : 0);
