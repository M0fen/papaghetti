/**
 * EL ARCHIVO DE COMPROBANTES: nada se pierde al pasar del tope.
 *
 * Contra el cerebro REAL con el backend de archivo local (data/catalog.json), con
 * copia de seguridad y restauración pase lo que pase. Se siembran 2.375 pedidos
 * sintéticos (2.350 cerrados de mayo a agosto, 5 deudas vivas de mayo, 20 cerrados
 * de septiembre), se provoca un commit y se comprueba que:
 *   · el cerebro baja al tope (2.000) y las deudas vivas viejas se quedan,
 *   · lo que salió está en data/comprobantes-YYYY-MM.json y el cerebro lo apunta,
 *   · buscarPedido / pedidosArchivados / comprobantesEntre lo encuentran sin repetir,
 *   · un segundo commit no vuelve a archivar nada,
 *   · ponerACero borra también el archivo.
 *
 * Y lo que sale del almacén sin tocarlo:
 *   · la puerta de las fotos (/foto/…) solo deja pasar fotos bajo fotos/: nunca cerebro/,
 *     ni "..", ni rutas absolutas, ni otras extensiones,
 *   · el almacén y su credencial se leen como los lee el SDK (sin tocar el entorno real),
 *   · la copia completa trae todo (con los meses archivados), sin pilas de deshacer, con
 *     `completo: true` al final, y NO escribe nada.
 *
 *   node --import ./qa-ts.mjs qa-archivo.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const FILE = path.join(DATA, "catalog.json");
const RESPALDO = FILE + ".qa-archivo";
const MESES = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const archivoDe = (m) => path.join(DATA, `comprobantes-${m}.json`);
const limpiarArchivos = () => { for (const m of MESES) if (fs.existsSync(archivoDe(m))) fs.unlinkSync(archivoDe(m)); };

if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);
limpiarArchivos();

let ok = 0, mal = 0;
const si = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? " · " + d : ""}`); };
const eq = (n, a, b) => si(n, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b) ? "" : `dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)}`);

const METODOS = ["efectivo", "nequi", "daviplata", "breb", "tarjeta", "transferencia"];
let n = 0;
function pedido(msUtc, { abierto = false } = {}) {
  n++;
  const cancelado = !abierto && n % 17 === 0;
  const total = 20000 + (n % 9) * 1500;
  return {
    id: `A${String(n).padStart(6, "0")}X`,
    consecutivo: n,
    creadoEn: new Date(msUtc).toISOString(),
    canal: ["web", "qr", "salon"][n % 3],
    tipo: ["mesa", "llevar", "domicilio"][n % 3],
    cliente: `ARCH ${n}`,
    referencia: n % 5 === 0 ? "ventanal" : undefined,
    estado: abierto ? "listo" : cancelado ? "cancelado" : "entregado",
    motivoCancelacion: cancelado ? "prueba" : undefined,
    pago: abierto || cancelado ? "pendiente" : "pagado",
    metodoPago: abierto || cancelado ? undefined : METODOS[n % 6],
    items: [{ nombre: `Plato ${n % 7}`, cantidad: 1, precio: total }],
    base: `Plato ${n % 7}`, proteina: "—", toppings: [],
    subtotal: total, impuesto: 0, propina: 0, descuento: 0, total,
  };
}

const MAYO1 = Date.UTC(2026, 4, 1, 17, 0, 0);       // 12:00 de Pereira
const AGO31 = Date.UTC(2026, 7, 31, 23, 0, 0);      // 18:00 de Pereira
const paso = Math.floor((AGO31 - MAYO1) / 2350);
const cerradosViejos = Array.from({ length: 2350 }, (_, i) => pedido(MAYO1 + i * paso));
const deudasVivas = Array.from({ length: 5 }, (_, i) => pedido(Date.UTC(2026, 4, 2, 18 + i, 0, 0), { abierto: true }));
const recientes = Array.from({ length: 20 }, (_, i) => pedido(Date.UTC(2026, 8, 10, 15 + (i % 8), i, 0)));
const todos = [...cerradosViejos, ...deudasVivas, ...recientes].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

const original = JSON.parse(fs.readFileSync(FILE, "utf8"));
fs.writeFileSync(FILE, JSON.stringify({ ...original, pedidos: todos, undo: [], redo: [], historial: [], archivoMeses: [] }), "utf8");

const idsMayoCerrados = new Set(cerradosViejos.filter((p) => p.creadoEn < "2026-06-01T05:00:00.000Z").map((p) => p.id));
const enMayo = (p) => p.creadoEn >= "2026-05-01T05:00:00.000Z" && p.creadoEn < "2026-06-01T05:00:00.000Z";

try {
  const cat = await import("./lib/catalog.ts");

  console.log("\n═══ LA FUNCIÓN PURA ═══");
  const mini = [
    { id: "a", creadoEn: "2026-01-05T12:00:00Z", pago: "pagado", estado: "entregado" },
    { id: "b", creadoEn: "2026-01-04T12:00:00Z", pago: "pendiente", estado: "listo" },
    { id: "c", creadoEn: "2026-01-03T12:00:00Z", pago: "pagado", estado: "entregado" },
    { id: "d", creadoEn: "2026-01-02T12:00:00Z", pago: "pendiente", estado: "cancelado" },
    { id: "e", creadoEn: "2026-01-01T12:00:00Z", pago: "pendiente", estado: "recibido" },
  ];
  const r = cat.recortarPedidos(mini, 3);
  eq("con tope 3: se quedan las 2 deudas vivas + el cerrado más nuevo", r.quedan.map((p) => p.id), ["a", "b", "e"]);
  eq("salen los cerrados más viejos (pagado y cancelado)", r.salen.map((p) => p.id), ["c", "d"]);
  eq("por debajo del tope no toca nada", cat.recortarPedidos(mini, 5).salen.length, 0);
  eq("mesNegocio va en hora de Pereira: 03:30Z del 1 de octubre es 30 de septiembre", cat.mesNegocio("2026-10-01T03:30:00.000Z"), "2026-09");
  eq("el tope sigue en 2.000", cat.PEDIDOS_CAP, 2000);

  console.log("\n═══ ANTES DEL COMMIT: 2.375 pedidos en el cerebro ═══");
  const antes = await cat.getCatalog();
  eq("el cerebro trae los 2.375", antes.pedidos.length, 2375);
  eq("sin meses archivados", antes.archivoMeses, []);

  console.log("\n═══ UN COMMIT CUALQUIERA DISPARA EL ARCHIVADO ═══");
  await cat.updateAjustes({});
  const cat2 = await import(`./lib/catalog.ts?fresco=${Date.now()}`);
  const despues = await cat2.getCatalog();
  eq("el cerebro baja exactamente al tope", despues.pedidos.length, 2000);
  eq("apunta el mes archivado", despues.archivoMeses, ["2026-05"]);
  si("las 5 deudas vivas de mayo SIGUEN en el cerebro", deudasVivas.every((d) => despues.pedidos.some((p) => p.id === d.id)));
  si("los 20 recientes siguen", recientes.every((d) => despues.pedidos.some((p) => p.id === d.id)));
  const salieron = todos.filter((p) => !despues.pedidos.some((q) => q.id === p.id));
  eq("salieron 375", salieron.length, 375);
  si("todos los que salieron son de mayo y estaban cerrados", salieron.every((p) => idsMayoCerrados.has(p.id)));
  const masViejoQueSalio = salieron.map((p) => p.creadoEn).sort().at(-1);
  const masViejoCerradoQueQueda = despues.pedidos.filter((p) => p.pago === "pagado" || p.estado === "cancelado").map((p) => p.creadoEn).sort()[0];
  si("y son los MÁS VIEJOS: ningún cerrado que quedó es anterior a uno que salió", masViejoCerradoQueQueda > masViejoQueSalio, `${masViejoQueSalio} < ${masViejoCerradoQueQueda}`);
  si("existe data/comprobantes-2026-05.json", fs.existsSync(archivoDe("2026-05")));
  const doc = JSON.parse(fs.readFileSync(archivoDe("2026-05"), "utf8"));
  eq("con el mes y los 375 pedidos", [doc.mes, doc.pedidos.length], ["2026-05", 375]);
  si("ordenados del más nuevo al más viejo", doc.pedidos.every((p, i, a) => i === 0 || a[i - 1].creadoEn >= p.creadoEn));
  si("y sin ids repetidos", new Set(doc.pedidos.map((p) => p.id)).size === 375);

  console.log("\n═══ LEER LO ARCHIVADO ═══");
  const idArch = salieron[0].id, idVivo = recientes[0].id;
  eq("buscarPedido encuentra uno archivado", (await cat2.buscarPedido(idArch))?.id, idArch);
  eq("y uno vivo", (await cat2.buscarPedido(idVivo))?.id, idVivo);
  eq("y devuelve undefined si no existe", await cat2.buscarPedido("NOEXISTE"), undefined);
  eq("pedidosArchivados de mayo: 375", (await cat2.pedidosArchivados("2026-05-01", "2026-05-31")).length, 375);
  eq("pedidosArchivados de junio: 0 (junio no se archivó)", (await cat2.pedidosArchivados("2026-06-01", "2026-06-30")).length, 0);
  eq("sin rango: todo el archivo", (await cat2.pedidosArchivados()).length, 375);
  const mayo = await cat2.comprobantesEntre("2026-05-01", "2026-05-31");
  const esperadosMayo = todos.filter(enMayo).length;
  eq(`comprobantesEntre(mayo) une cerebro + archivo: ${esperadosMayo}`, mayo.length, esperadosMayo);
  si("sin repetidos", new Set(mayo.map((p) => p.id)).size === mayo.length);
  si("y del más nuevo al más viejo", mayo.every((p, i, a) => i === 0 || a[i - 1].creadoEn >= p.creadoEn));
  si("incluye las 5 deudas vivas de mayo", deudasVivas.every((d) => mayo.some((p) => p.id === d.id)));
  eq("comprobantesEntre(septiembre): los 20 recientes, sin tocar el archivo", (await cat2.comprobantesEntre("2026-09-01", "2026-09-30")).length, 20);
  eq("comprobantesEntre(un día de mayo) recorta al día", (await cat2.comprobantesEntre("2026-05-02", "2026-05-02")).length, todos.filter((p) => p.creadoEn >= "2026-05-02T05:00:00.000Z" && p.creadoEn < "2026-05-03T05:00:00.000Z").length);
  eq("mesesArchivados", await cat2.mesesArchivados(), ["2026-05"]);

  console.log("\n═══ IDEMPOTENTE: otro commit no vuelve a archivar ═══");
  await cat2.updateAjustes({});
  const cat3 = await import(`./lib/catalog.ts?fresco=${Date.now()}b`);
  const tercero = await cat3.getCatalog();
  eq("el cerebro sigue en 2.000", tercero.pedidos.length, 2000);
  eq("el archivo sigue con 375", JSON.parse(fs.readFileSync(archivoDe("2026-05"), "utf8")).pedidos.length, 375);

  console.log("\n═══ UN PEDIDO NUEVO NO DISPARA NADA HASTA PASAR EL MARGEN ═══");
  {
    const previo = await cat3.getCatalog();
    for (const i of previo.insumos) await cat3.abastecerInsumo(i.id, 500);
    const doc3 = await cat3.getCatalog();
    const plato = doc3.enredos.find((e) => !e.baseId && !e.proteinaId && e.activo !== false);
    const nuevo = await cat3.crearComanda({ lineas: [{ enredoId: plato.id, cantidad: 1 }], canal: "salon", tipo: "llevar", cliente: "ARCH nuevo" });
    const cat4 = await import(`./lib/catalog.ts?fresco=${Date.now()}c`);
    const conNuevo = await cat4.getCatalog();
    eq("el cerebro tiene 2.001 (tope + 1, dentro del margen)", conNuevo.pedidos.length, 2001);
    si("y el nuevo está arriba del todo", conNuevo.pedidos[0].id === nuevo.id);
    si("con consecutivo siguiente al máximo", nuevo.consecutivo === 2376, `#${nuevo.consecutivo}`);
  }

  console.log("\n═══ LA FRONTERA DEL ARCHIVO LA DECIDE EL ÍNDICE, NO EL CEREBRO ═══");
  {
    /* Un mes archivado (junio) y, en el cerebro, lo reciente más UNA DEUDA VIEJA de
       mayo. Cobrarla la convierte en el pedido cerrado más antiguo del cerebro: si la
       frontera se calculara con eso, junio dejaría de leerse y el mes entero
       desaparecería de la pantalla. */
    const base = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const sept = pedido(Date.UTC(2026, 8, 10, 18, 0, 0));
    const deudaMayo = pedido(Date.UTC(2026, 4, 3, 18, 0, 0), { abierto: true });
    const junio = pedido(Date.UTC(2026, 5, 15, 18, 0, 0));
    fs.writeFileSync(archivoDe("2026-06"), JSON.stringify({ mes: "2026-06", pedidos: [junio] }), "utf8");
    fs.writeFileSync(
      FILE,
      JSON.stringify({ ...base, pedidos: [sept, deudaMayo], archivoMeses: ["2026-05", "2026-06"], undo: [], redo: [] }),
      "utf8",
    );
    const c1 = await import(`./lib/catalog.ts?fresco=${Date.now()}f`);
    eq("junio se lee del archivo", (await c1.comprobantesEntre("2026-06-01", "2026-06-30")).map((p) => p.id), [junio.id]);
    eq("hoy no toca el archivo", (await c1.comprobantesEntre("2026-09-10", "2026-09-10")).map((p) => p.id), [sept.id]);
    await c1.cobrarPedido(deudaMayo.id, "efectivo", 0, 0); // la deuda vieja pasa a cerrada
    const c2 = await import(`./lib/catalog.ts?fresco=${Date.now()}g`);
    eq("y junio SIGUE leyéndose después de cobrar la deuda de mayo", (await c2.comprobantesEntre("2026-06-01", "2026-06-30")).map((p) => p.id), [junio.id]);
    const desdeJunio = await c2.comprobantesEntre("2026-06-01", "2026-12-31");
    eq("junio + septiembre, sin repetidos", desdeJunio.map((p) => p.id).sort(), [junio.id, sept.id].sort());
    si("y la deuda de mayo quedó cobrada", (await c2.getCatalog()).pedidos.find((p) => p.id === deudaMayo.id)?.pago === "pagado");
    fs.unlinkSync(archivoDe("2026-06"));
  }

  console.log("\n═══ PONER A CERO BORRA TAMBIÉN EL ARCHIVO ═══");
  const cat5 = await import(`./lib/catalog.ts?fresco=${Date.now()}d`);
  await cat5.ponerACero();
  const cat6 = await import(`./lib/catalog.ts?fresco=${Date.now()}e`);
  const cero = await cat6.getCatalog();
  eq("cero pedidos", cero.pedidos.length, 0);
  eq("cero meses", cero.archivoMeses, []);
  si("y el documento del mes desapareció", !fs.existsSync(archivoDe("2026-05")));

  console.log("\n═══ LA PUERTA DE LAS FOTOS: SOLO SALE LO QUE ES UNA FOTO ═══");
  {
    const { rutaFoto, formatoFoto, direccionFoto } = await import("./lib/fotos.ts");
    // Como las pide el navegador (los pedazos de la ruta) y como las guarda guardarFoto (texto).
    const buenas = [
      [["fotos", "pollo-Xy7ZaB12CdEfGh34IjKlMn56OpQrSt.jpg"], "image/jpeg"],
      ["fotos/pollo-x.jpeg", "image/jpeg"],
      ["fotos/logo_1.png", "image/png"],
      ["fotos/portada-AbC.webp", "image/webp"],
      ["fotos/plato.avif", "image/avif"],
      [["fotos", "pruebas", "mi-rama_2", "pollo-AbC.webp"], "image/webp"],
    ];
    for (const [r, tipo] of buenas) {
      eq(`sí: ${JSON.stringify(r)}`, rutaFoto(r), { pathname: Array.isArray(r) ? r.join("/") : r, tipo });
    }
    const malas = [
      // El negocio entero: lo que esta puerta existe para no entregar.
      "cerebro/catalog.json", ["cerebro", "catalog.json"], "cerebro/comprobantes-2026-05.json",
      "cerebro/respaldo-2026-10-16.json", ["cerebro", "pruebas", "rama", "catalog.json"],
      // Escaleras para salir de fotos/.
      "fotos/../cerebro/catalog.json", ["fotos", "..", "cerebro", "catalog.json"], ["fotos", "..", "cerebro", "x.jpg"],
      "fotos/%2e%2e/cerebro/x.jpg", "fotos/./pollo.jpg", "fotos//pollo.jpg", ["fotos", "", "pollo.jpg"], "fotos\\pollo.jpg",
      // Rutas absolutas o de otro sitio.
      "/fotos/pollo.jpg", "https://x.public.blob.vercel-storage.com/fotos/pollo.jpg", "//evil.com/fotos/pollo.jpg",
      // Lo que no es foto, o no se sirve (un SVG puede llevar código).
      "fotos/pollo.svg", "fotos/pollo.gif", "fotos/pollo.html", "fotos/pollo.json", "fotos/pollo.JPG",
      "fotos/pollo.jpg.html", "fotos/pollo", "fotos/", "fotos/.jpg", "fotos/pollo.jpg/", "fotos/pollo.jpg?x=1",
      // Caracteres raros y nombres casi iguales.
      "fotos/pollo .jpg", "fotos/piña.jpg", "fotos/pollo%20x.jpg", "Fotos/pollo.jpg", "fotosx/pollo.jpg", "pollo.jpg",
      "fotos/" + "a".repeat(260) + ".jpg",
      // Lo que ni siquiera es una ruta.
      "", [], undefined, null, 42, {}, ["fotos", 3],
    ];
    for (const r of malas) si(`no: ${JSON.stringify(r) ?? String(r)}`.slice(0, 90), rutaFoto(r) === null);
    eq("jpeg se guarda como .jpg", formatoFoto("JPEG"), { ext: "jpg", tipo: "image/jpeg" });
    eq("png se guarda como .png", formatoFoto("png"), { ext: "png", tipo: "image/png" });
    eq("svg no se sube", formatoFoto("svg+xml"), null);
    eq("gif tampoco", formatoFoto("gif"), null);
    const dir = direccionFoto("fotos/pollo-AbC.jpg");
    eq("la dirección es del mismo sitio", dir, "/foto/fotos/pollo-AbC.jpg");
    eq("y la puerta la reconoce tal cual", rutaFoto(dir.slice("/foto/".length).split("/"))?.pathname, "fotos/pollo-AbC.jpg");

    // Sin almacén (local): la foto se queda como texto y la puerta no tiene qué leer.
    const c = await import(`./lib/catalog.ts?fresco=${Date.now()}h`);
    const texto = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    eq("en local la foto se queda como texto (como siempre)", await c.guardarFoto(texto, "pollo"), texto);
    eq("una dirección ya guardada se respeta", await c.guardarFoto("/foto/fotos/pollo-AbC.jpg", "pollo"), "/foto/fotos/pollo-AbC.jpg");
    eq("sin foto, sin foto", await c.guardarFoto(undefined, "pollo"), undefined);
    eq("leerFoto en local: no hay almacén → nada (la puerta responde 404)", await c.leerFoto("fotos/pollo-AbC.jpg"), null);
    eq("leerFoto se niega a cerebro/ aunque se lo pidan directo", await c.leerFoto("cerebro/catalog.json"), null);
  }

  console.log("\n═══ EL ALMACÉN: CUÁL ES Y CÓMO SE ENTRA (con entornos de mentira) ═══");
  {
    const c = await import(`./lib/catalog.ts?fresco=${Date.now()}i`);
    // Un token falso armado a pedazos, para que ningún buscador de secretos lo tome por real.
    const token = (almacen, secreto = "noEsSecreto123") => ["vercel", "blob", "rw", almacen, secreto].join("_");
    eq("sin nada: no hay almacén", c.almacenBlob({}), null);
    eq("con el token: su almacén", c.almacenBlob({ BLOB_READ_WRITE_TOKEN: token("AbC123") }), { id: "store_AbC123", credencial: "token" });
    eq(
      "con la conexión del proyecto, en Vercel: OIDC",
      c.almacenBlob({ VERCEL: "1", BLOB_STORE_ID: "store_xyz789" }),
      { id: "store_xyz789", credencial: "oidc" },
    );
    eq("la conexión sin el prefijo store_ es la misma", c.almacenBlob({ VERCEL: "1", BLOB_STORE_ID: "xyz789" }), { id: "store_xyz789", credencial: "oidc" });
    eq("la conexión NO cuenta fuera de Vercel", c.almacenBlob({ BLOB_STORE_ID: "store_xyz789" }), null);
    eq(
      "fuera de Vercel, con las dos, manda el token",
      c.almacenBlob({ BLOB_STORE_ID: "store_xyz789", BLOB_READ_WRITE_TOKEN: token("AbC123") }),
      { id: "store_AbC123", credencial: "token" },
    );
    eq(
      "en Vercel, las dos del MISMO almacén: la conexión, sin aviso (mayúsculas aparte)",
      c.almacenBlob({ VERCEL: "1", BLOB_STORE_ID: "store_abc123", BLOB_READ_WRITE_TOKEN: token("AbC123") }),
      { id: "store_abc123", credencial: "oidc" },
    );
    eq(
      "en Vercel, dos almacenes DISTINTOS: la conexión, y el otro queda anotado",
      c.almacenBlob({ VERCEL: "1", BLOB_STORE_ID: "store_xyz789", BLOB_READ_WRITE_TOKEN: token("AbC123") }),
      { id: "store_xyz789", credencial: "oidc", otro: "store_AbC123" },
    );
    eq(
      "variables con solo espacios cuentan como vacías (igual que el SDK)",
      c.almacenBlob({ VERCEL: "1", BLOB_STORE_ID: "  ", BLOB_READ_WRITE_TOKEN: " " }),
      null,
    );
    eq("un token mal formado no se inventa un almacén", c.almacenBlob({ BLOB_READ_WRITE_TOKEN: "basura" }), { id: "", credencial: "token" });
    si(
      "el secreto del token no sale nunca",
      !JSON.stringify(c.almacenBlob({ VERCEL: "1", BLOB_STORE_ID: "store_x", BLOB_READ_WRITE_TOKEN: token("AbC123", "SECRETO999") })).includes("SECRETO999"),
    );
    const estado = await c.estadoPersistencia();
    eq("en local: archivo, sin almacén que mostrar", [estado.backend, estado.ok, estado.almacen ?? null], ["archivo", true, null]);
  }

  console.log("\n═══ LA COPIA COMPLETA: TODO EL NEGOCIO, SIN ESCRIBIR NADA ═══");
  {
    const base = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const archivado = pedido(Date.UTC(2026, 5, 20, 18, 0, 0)); // junio: vive en el archivo
    const ayer = pedido(Date.UTC(2026, 9, 15, 18, 0, 0));
    const hoy = pedido(Date.UTC(2026, 9, 16, 15, 0, 0), { abierto: true });
    const fotoArchivo = "/foto/fotos/pollo-AbC123.jpg";
    const fotoPortada = "/foto/fotos/portada-Xy7.webp";
    const fotoTexto = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const foto0 = { ...base.bases[0], foto: fotoArchivo };
    const snap = { ...base, undo: undefined, redo: undefined, historial: undefined, etiqueta: "Editó algo" };
    const historial = [
      { id: "h2", fecha: "2026-10-16T15:00:00.000Z", texto: "Cobró #A2 · Ana", meta: false },
      { id: "h1", fecha: "2026-10-15T18:00:00.000Z", texto: "Editó \"Pollo\" · Ana", meta: false },
    ];
    const sembrado = {
      ...base,
      bases: [foto0, ...base.bases.slice(1)],
      enredos: [{ ...base.enredos[0], foto: fotoTexto }, ...base.enredos.slice(1)],
      ajustes: { ...base.ajustes, sitio: { portada: { foto: { url: fotoPortada, ancho: 928, alto: 1152 } } } },
      pedidos: [hoy, ayer],
      undo: [snap, snap],
      redo: [snap],
      historial,
      // Julio está en el índice pero su documento no existe: no se inventa, se avisa.
      archivoMeses: ["2026-06", "2026-07"],
    };
    fs.writeFileSync(FILE, JSON.stringify(sembrado), "utf8");
    fs.writeFileSync(archivoDe("2026-06"), JSON.stringify({ mes: "2026-06", pedidos: [archivado] }), "utf8");

    // La huella de data/: qué archivos hay, cuánto pesan y cuándo se escribieron.
    const huella = () =>
      fs.readdirSync(DATA).sort().map((f) => {
        const st = fs.statSync(path.join(DATA, f));
        return `${f} · ${st.size} · ${st.mtimeMs}`;
      });
    const antes = huella();
    const bytesAntes = fs.readFileSync(FILE);

    const c = await import(`./lib/catalog.ts?fresco=${Date.now()}j`);
    const ahora = new Date("2026-10-16T15:41:00.000Z"); // 10:41 a. m. en Pereira
    const copia = await c.copiaCompleta(ahora);
    const claves = Object.keys(copia);
    eq("empieza diciendo qué es", [claves[0], copia.formato, copia.version], ["formato", "papaghetti/copia-completa", 1]);
    eq("y `completo: true` es la ÚLTIMA clave", [claves.at(-1), copia.completo], ["completo", true]);
    const texto = JSON.stringify(copia);
    si('también escrita: el archivo termina en "completo":true}', texto.endsWith('"completo":true}'));
    si("y se lee de vuelta idéntica", JSON.stringify(JSON.parse(texto)) === texto);
    eq("con la fecha y el día de Pereira", [copia.generadoEn, copia.diaNegocio], [ahora.toISOString(), "2026-10-16"]);
    eq("y de dónde salió", copia.origen, { backend: "archivo", entorno: "local" });
    eq("sin las pilas de deshacer ni rehacer", [copia.cerebro.undo, copia.cerebro.redo], [[], []]);
    eq("con el historial entero", copia.cerebro.historial, historial);
    eq("con los pedidos del cerebro", copia.cerebro.pedidos.map((p) => p.id), [hoy.id, ayer.id]);
    eq("y el mes archivado, tal como está guardado", copia.archivo, { "2026-06": { mes: "2026-06", pedidos: [archivado] } });
    eq("el mes sin documento se avisa, no se inventa", [Object.keys(copia.archivo), copia.conteos.mesesSinDocumento], [["2026-06"], ["2026-07"]]);
    eq("los conteos cuadran", copia.conteos, {
      pedidos: 2,
      pedidosArchivados: 1,
      porMes: { "2026-06": 1 },
      mesesSinDocumento: ["2026-07"],
      movimientos: sembrado.movimientos.length,
      leads: sembrado.leads.length,
      arqueos: (sembrado.arqueos ?? []).length,
      historial: 2,
      fotosEnlazadas: 2,
      fotosDentro: 1,
    });
    eq("las fotos que son archivo aparte van como dirección", copia.fotos, [
      { donde: `bases/${foto0.id}`, url: fotoArchivo },
      { donde: "ajustes/sitio/portada/foto", url: fotoPortada },
    ]);
    si(
      "la de texto no se repite en la lista: ya va dentro del cerebro",
      copia.cerebro.enredos[0].foto === fotoTexto && !copia.fotos.some((f) => f.url.startsWith("data:")),
    );
    eq("NO ESCRIBIÓ NADA: data/ quedó igual (archivos, pesos y fechas)", huella(), antes);
    si("y el cerebro quedó igual byte por byte", fs.readFileSync(FILE).equals(bytesAntes));
    eq("el nombre lleva el día y la hora de Pereira", c.nombreCopia(ahora), "papaghetti-copia-2026-10-16-1041.json");
    eq(
      "a las 11:30 p. m. en Pereira el servidor ya está en otro día; el nombre no",
      c.nombreCopia(new Date("2026-10-17T04:30:00.000Z")),
      "papaghetti-copia-2026-10-16-2330.json",
    );
    eq("pasada la medianoche: 0005, nunca 2405", c.nombreCopia(new Date("2026-10-17T05:05:00.000Z")), "papaghetti-copia-2026-10-17-0005.json");
    fs.unlinkSync(archivoDe("2026-06"));
  }
} catch (e) {
  mal++;
  console.log("  ❌ reventó:", e?.stack ?? e);
} finally {
  if (fs.existsSync(RESPALDO)) {
    fs.copyFileSync(RESPALDO, FILE);
    fs.unlinkSync(RESPALDO);
  }
  limpiarArchivos();
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
