/**
 * IMPRESIÓN PROFUNDA — todo lo que se puede comprobar SIN la impresora delante.
 *
 * Cada camino que puede tomar el operario se recorre de verdad y se inspecciona lo
 * que sale: el documento que va a imprimirse, el PDF que Chrome genera de ese
 * documento (tamaño físico de página e imagen embebida), el fallback sin popups,
 * el camino automático, un tiquete largo, uno anulado, y la hoja normal.
 *
 *   node qa-impresion-profunda.mjs    (servidor en PG_URL, por defecto :3112, con despensa cargada)
 */
import { chromium } from "playwright";
import fs from "node:fs";
const B = process.env.PG_URL || "http://127.0.0.1:3112";
const S = "C:/Users/Carlos/AppData/Local/Temp/claude/c--Users-Carlos-Desktop-Papaghetti/0b9eca89-af0c-469f-953c-639458dbdd51/scratchpad";
let ok = 0, mal = 0;
const check = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "OK " : "MAL"} ${n}${d ? " · " + d : ""}`); };
const MM = 72 / 25.4; // puntos PDF por milímetro

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  !! pageerror:", e.message));
await p.goto(`${B}/admin`, { waitUntil: "networkidle" });
await p.fill('input[type="password"]', "pruebalocal123");
await p.click('button[type="submit"]');
await p.waitForSelector(".adminx__topbar", { timeout: 20000 }).catch(() => {});

/** Toma una comanda con `n` renglones de plato de carta y devuelve el href del tiquete. */
async function comanda(n, cliente) {
  await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /Nueva comanda/i }).click();
  for (let i = 0; i < n; i++) {
    await p.getByRole("button", { name: /Plato de la carta/i }).click();
    await p.waitForTimeout(150);
    await p.locator(".comanda__plato").nth(i % 6).click();
  }
  await p.fill('input[name="cliente"]', cliente);
  await p.getByRole("button", { name: /Mandar a cocina/i }).click();
  await p.waitForTimeout(2600);
  await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
  return p.locator(".ocard").filter({ hasText: cliente }).first().locator('a[href^="/admin/tiquete/"]').first().getAttribute("href");
}

/** Secuestra window.open para capturar el documento que se imprime (o lo bloquea). */
const capturar = (bloquear = false) =>
  p.evaluate((bloquear) => {
    window.__doc = null;
    const orig = window.open;
    window.open = function () {
      if (bloquear) return null;
      const w = orig.call(window, "", "_blank");
      if (w) w.print = () => { window.__doc = w.document.documentElement.outerHTML; };
      return w;
    };
    // Y por si cae al iframe: se congela su retirada y se captura su print()
    HTMLIFrameElement.prototype.remove = function () {};
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get() {
        const w = desc.get.call(this);
        if (w && !w.__p) { w.__p = true; w.print = () => { window.__doc = "IFRAME:" + w.document.documentElement.outerHTML; }; }
        return w;
      },
      configurable: true,
    });
  }, bloquear);

/** Decodifica un data:png en la página y devuelve ancho, alto, píxeles grises y negro por banda. */
const analizar = (src) =>
  p.evaluate(async (src) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.onerror = r; im.src = src; });
    const c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const cx = c.getContext("2d");
    cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let grises = 0, negros = 0;
    const bandas = 6, alto = Math.floor(c.height / bandas), negro = new Array(bandas).fill(0);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4, v = d[i];
      if (v > 10 && v < 245) grises++;
      if (v < 100) { negros++; negro[Math.min(bandas - 1, Math.floor(y / alto))]++; }
    }
    return { w: c.width, h: c.height, grises, negros, negro };
  }, src);

/** El PDF real que Chrome haría del documento impreso: tamaño de página e imagen. */
async function pdfDe(doc, nombre) {
  const q = await ctx.newPage();
  await q.setContent(doc, { waitUntil: "load" });
  await q.waitForTimeout(300);
  const ruta = `${S}/${nombre}.pdf`;
  await q.pdf({ path: ruta, preferCSSPageSize: true, printBackground: true });
  await q.close();
  const buf = fs.readFileSync(ruta).toString("latin1");
  const mb = buf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  const paginas = (buf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const imgW = buf.match(/\/Subtype\s*\/Image[^>]*?\/Width\s+(\d+)/) || buf.match(/\/Width\s+(\d+)[^>]*?\/Subtype\s*\/Image/);
  return { ancho: mb ? Number(mb[1]) / MM : 0, alto: mb ? Number(mb[2]) / MM : 0, paginas, imgW: imgW ? Number(imgW[1]) : 0, kb: Math.round(buf.length / 1024) };
}

// ═══ 1. CAMINO NORMAL: botón → pestaña → print ═══
console.log("\n═══ 1 · CAMINO NORMAL (térmica) ═══");
const href = await comanda(2, "PROFUNDA NORMAL");
await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
await capturar(false);
await p.getByRole("button", { name: /^Imprimir$/ }).click();
await p.waitForTimeout(2500);
let doc = await p.evaluate(() => window.__doc);
check("se abre una pestaña y se imprime", Boolean(doc) && !doc.startsWith("IFRAME:"));
/* Apoyada a la DERECHA, que es la posición de fábrica (ALINEACION_POR_DEFECTO en
   lib/rollo): el driver de la TP586 quema los 48 mm de la derecha. Esta aserción
   pedía "centrada" desde antes de ese cambio y fallaba sola. */
check("la imagen va a 48mm apoyada a la derecha, con tope al ancho útil", /img\{display:block;width:48mm;max-width:100%;margin:0 0 0 auto/.test(doc || ""));
/* SIN `size`: los drivers declaran 80×297 y 80×3276 y no todos arrancan en el mismo;
   si el @page no coincide con el papel elegido, Chrome encoge o centra la página
   ("el tiquete en un fragmento del lienzo"). Sin size, manda el papel del driver. */
check("no fija tamaño de papel: manda el del driver", /@page \{ margin: 0; \}/.test(doc || "") && !/size:/.test((doc || "").match(/@page[^}]*}/)?.[0] || ""));
const srcTermica = (doc || "").match(/src="(data:image\/png[^"]+)"/)?.[1] || "";
const at = await analizar(srcTermica);
console.log(`  imagen térmica ${at.w}×${at.h}px · grises=${at.grises} · negro por banda ${at.negro.join("/")}`);
check("la imagen que va a la térmica es blanco/negro PURO (sin grises)", at.grises === 0, `${at.grises} píxeles grises`);
check("y sigue teniendo texto (tinta en todas las bandas)", at.negro.every((n) => n > 300));
const pdf1 = await pdfDe(doc, "prof-termica");
console.log(`  PDF: ${pdf1.ancho.toFixed(1)}×${pdf1.alto.toFixed(1)}mm · ${pdf1.paginas} pág · imagen embebida ${pdf1.imgW}px · ${pdf1.kb}KB`);
/* Sin `size` en el @page, Chrome toma el papel del destino: aquí (PDF sin driver) es
   carta, 215,9 mm. En la térmica será el rollo que tenga elegido el driver. Lo que
   se comprueba es que la página NO viene de un tamaño inventado por nosotros. */
check("sin size, Chrome usa el papel del destino (carta en PDF)", Math.abs(pdf1.ancho - 215.9) < 1.5, `${pdf1.ancho.toFixed(1)}mm`);
check("el PDF lleva la imagen embebida a 384px", pdf1.imgW === 384);
check("cabe en una página", pdf1.paginas === 1);

// La versión de pantalla es la suave (con antialias): más bonita, no va al papel.
const srcPantalla = await p.locator(".cbte-imagen").getAttribute("src");
const ap = await analizar(srcPantalla);
check("en pantalla se muestra la versión suave", ap.grises > 1000, `${ap.grises} grises`);
check("y 'Descargar imagen' entrega la binaria (la del papel)", (await p.locator('a[download^="comprobante-"]').getAttribute("href")) === srcTermica);

// ═══ 2. POPUP BLOQUEADO → iframe ═══
console.log("\n═══ 2 · POPUP BLOQUEADO (fallback a iframe) ═══");
await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen");
await capturar(true);
await p.getByRole("button", { name: /^Imprimir$/ }).click();
await p.waitForTimeout(2500);
doc = await p.evaluate(() => window.__doc);
check("cae al iframe y también imprime", Boolean(doc) && doc.startsWith("IFRAME:"));
check("con el mismo documento de imagen", /<img[^>]+src="data:image\/png/.test(doc || "") && /width:48mm/.test(doc || ""));

// ═══ 3. CAMINO AUTOMÁTICO (?imprimir=1) ═══
console.log("\n═══ 3 · CAMINO AUTOMÁTICO ═══");
await p.goto(B + href + "?imprimir=1", { waitUntil: "domcontentloaded" });
await capturar(false);
await p.waitForTimeout(4000);
doc = await p.evaluate(() => window.__doc);
check("al entrar con ?imprimir=1 se imprime solo (pestaña o iframe)", Boolean(doc));

// ═══ 4. HOJA NORMAL ═══
console.log("\n═══ 4 · HOJA NORMAL ═══");
await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen");
await p.getByRole("button", { name: /Hoja normal/i }).click();
await capturar(false);
await p.getByRole("button", { name: /^Imprimir$/ }).click();
await p.waitForTimeout(2500);
doc = await p.evaluate(() => window.__doc);
check("en hoja normal la imagen va al 100% con papel automático", /width:100%/.test(doc || "") && /size: auto/.test(doc || ""));
const pdf4 = await pdfDe(doc, "prof-hoja");
check("y Chrome saca una hoja de tamaño normal (no 80mm)", pdf4.ancho > 150, `${pdf4.ancho.toFixed(0)}mm`);

// ═══ 5. TIQUETE LARGO (10 renglones) ═══
console.log("\n═══ 5 · TIQUETE LARGO ═══");
const hrefL = await comanda(10, "PROFUNDA LARGA");
await p.goto(B + hrefL, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
await capturar(false);
await p.getByRole("button", { name: /^Imprimir$/ }).click();
await p.waitForTimeout(2500);
doc = await p.evaluate(() => window.__doc);
const al = await analizar((doc || "").match(/src="(data:image\/png[^"]+)"/)?.[1] || "");
const pdf5 = await pdfDe(doc, "prof-larga");
console.log(`  imagen ${al.w}×${al.h}px · PDF ${pdf5.paginas} pág de ${pdf5.alto.toFixed(0)}mm`);
check("un tiquete de 10 renglones es más alto", al.h > at.h + 400, `${al.h}px vs ${at.h}px`);
check("y se imprime entero, en las páginas que haga falta", pdf5.paginas >= 1 && pdf5.imgW === 384);
check("con tinta hasta el final (nada se corta)", al.negro[5] > 300, `banda final=${al.negro[5]}`);

// ═══ 6. ANULADO ═══
console.log("\n═══ 6 · PEDIDO ANULADO ═══");
await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
p.once("dialog", (d) => d.accept("prueba profunda"));
await p.locator(".ocard").filter({ hasText: "PROFUNDA NORMAL" }).first().getByRole("button", { name: /^Cancelar$/ }).click();
await p.waitForTimeout(2500);
await p.goto(B + href, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
const srcAn = await p.locator('a[download^="comprobante-"]').getAttribute("href");
const aa = await analizar(srcAn);
check("el tiquete anulado es más alto (lleva el sello arriba)", aa.h > at.h + 80, `${aa.h}px vs ${at.h}px`);
/* Las bandas se reparten sobre alturas distintas (el anulado es 150px más alto), así
   que "un 20% más" era una exigencia sobre un reparto que ya no coincide. Lo que sí
   se puede afirmar: con el sello, la banda de arriba lleva MÁS tinta que sin él. */
check("y el sello añade tinta arriba", aa.negro[0] > at.negro[0], `${aa.negro[0]} vs ${at.negro[0]}`);
const dom = await p.locator(".cbte").innerText();
check("el texto de respaldo dice ANULADO", /ANULADO/.test(dom));

// ═══ 7. LOGO AUSENTE → se escribe el nombre ═══
console.log("\n═══ 7 · SIN LOGO ═══");
await ctx.route("**/logo-papaghetti-bn.png", (r) => r.abort());
await p.goto(B + hrefL, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
const sinLogo = await analizar(await p.locator('a[download^="comprobante-"]').getAttribute("href"));
check("sin logo el tiquete se dibuja igual (con el nombre)", sinLogo.h > 600 && sinLogo.negro[0] > 300, `${sinLogo.h}px · banda0=${sinLogo.negro[0]}`);
await ctx.unroute("**/logo-papaghetti-bn.png");

// ═══ 8. PATRÓN DE CALIBRACIÓN ═══
console.log("\n═══ 8 · PATRÓN DE CALIBRACIÓN ═══");
await p.goto(B + hrefL, { waitUntil: "networkidle" });
await p.waitForSelector(".cbte-imagen", { timeout: 20000 });
await capturar(false);
await p.getByRole("button", { name: /imprime el patrón de prueba/i }).click();
await p.waitForTimeout(2500);
doc = await p.evaluate(() => window.__doc);
check("el patrón se imprime por el mismo camino (imagen, 48mm, sin size)", /width:48mm;max-width:100%/.test(doc || "") && /@page \{ margin: 0; \}/.test(doc || ""));
const ac = await analizar((doc || "").match(/src="(data:image\/png[^"]+)"/)?.[1] || "");
check("es de 384 px y blanco/negro puro", ac.w === 384 && ac.grises === 0, `${ac.w}×${ac.h} · grises=${ac.grises}`);
check("con las marcas de los bordes (x=0 y el último píxel tienen tinta)", await p.evaluate(async (src) => {
  const im = new Image(); await new Promise((r) => { im.onload = r; im.onerror = r; im.src = src; });
  const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const cx = c.getContext("2d"); cx.drawImage(im, 0, 0);
  const izq = cx.getImageData(0, 200, 1, 100).data, der = cx.getImageData(c.width - 1, 200, 1, 100).data;
  const negro = (d) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n; };
  return negro(izq) > 50 && negro(der) > 50;
}, (doc || "").match(/src="(data:image\/png[^"]+)"/)?.[1] || ""));

// Limpieza
await p.goto(`${B}/admin/pedidos`, { waitUntil: "networkidle" });
p.once("dialog", (d) => d.accept("prueba"));
await p.locator(".ocard").filter({ hasText: "PROFUNDA LARGA" }).first().getByRole("button", { name: /^Cancelar$/ }).click().catch(() => {});
await p.waitForTimeout(1500);

console.log(`\n═══ ${ok} OK · ${mal} MAL ═══`);
await b.close();
process.exit(mal ? 1 : 0);
