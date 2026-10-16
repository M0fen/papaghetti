/**
 * EL SITIO EN MANOS DEL DUEÑO: textos de fábrica idénticos a los de antes, el lector que
 * nunca deja huecos, los enlaces solo https, lo público sin nada privado y los bloques de
 * Ajustes → Sitio que guardan sin pisarse.
 *
 *   node --import ./qa-ts.mjs qa-sitio.mjs
 *
 * Escribe en data/catalog.json (el cerebro LOCAL) y lo deja como estaba al final, pase
 * lo que pase. qa-ts.mjs se niega a correr si el almacén de producción está a la vista.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-sitio";
if (fs.existsSync(RESPALDO)) {
  console.error(`Hay un respaldo viejo (${RESPALDO}): restáuralo o bórralo antes de correr esta suite.`);
  process.exit(1);
}
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, RESPALDO);

let ok = 0;
let mal = 0;
const si = (n, c, d = "") => {
  if (c) ok++;
  else mal++;
  console.log(`  ${c ? "✅" : "❌"} ${n}${d && !c ? " · " + d : ""}`);
};
const eq = (n, a, b) => si(n, JSON.stringify(a) === JSON.stringify(b), `dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)}`);
const campos = (o) => (k) => (typeof o[k] === "string" ? o[k] : "");

try {
  const sitio = await import("./lib/sitio.ts");
  const menu = await import("./lib/menu.ts");
  const F = sitio.SITIO_FABRICA;

  console.log("\n═══ LOS TEXTOS DE FÁBRICA SON LOS DE ANTES, LETRA POR LETRA ═══");
  // Copiados de los componentes tal como estaban (Hero, Story, Location, Footer, layout,
  // DatosEstructurados). Los invisibles van escapados para que se vean aquí.
  eq("antetítulo (· es U+00B7)", F.portada.antetitulo, "Pereira \u00b7 Un delicioso enredo");
  eq("frase: con sus DOS espacios de no separación", F.portada.frase, "Papa criolla, pasta y tu antojo: así\u00a0se\u00a0arma un enredo.");
  eq("los tres pasos", F.portada.pasos, ["criolla \u00b7 francesa \u00b7 spaghetti", "chicharrón \u00b7 res \u00b7 pollo", "maicitos \u00b7 piña \u00b7 queso"]);
  eq(
    "texto alternativo de la foto",
    F.portada.fotoAlt,
    "Enredo Papaghetti: nido de spaghetti con papa criolla dorada y chicharrón crocante, humeando en su caja kraft",
  );
  eq("título de la historia", F.historia.titulo, "Todo empezó por un enredo");
  eq("párrafos de la historia (… es U+2026)", F.historia.parrafos, [
    "Una hebra de spaghetti no sabe de líneas rectas. Se enreda, se mezcla, se junta con lo que encuentra\u2026 y ahí está la gracia.",
    "Papaghetti nace en Pereira uniendo dos amores: la papa criolla dorada del Eje Cafetero y la pasta que a todos nos gusta. Comfort food premium, hecha para verse hermosa y para armarse a tu gusto.",
  ]);
  eq("cierre", F.historia.cierre, "El enredo es la gracia.");
  eq("textos de domicilio y pie", [F.textos.domicilio, F.textos.pie], [
    "Arma tu enredo y te lo llevamos calientico.",
    "Enrédate rico. Comfort food premium para armar a tu gusto, en Pereira.",
  ]);
  eq("ciudad y departamento", [F.ubicacion.ciudad, F.ubicacion.departamento], ["Pereira", "Risaralda"]);
  eq("título (— es U+2014)", F.seo.titulo, "Papaghetti \u2014 Un delicioso enredo");
  eq(
    "descripción para buscadores",
    F.seo.descripcion,
    "Arma tu enredo: papa criolla, papa francesa o spaghetti + proteína + toppings. Comfort food premium para armar a tu gusto, en Pereira.",
  );
  eq("descripción al compartir", F.seo.descripcionCompartir, "Arma tu enredo. Papa + pasta + tu toque. Pereira.");
  eq(
    "descripción de los datos para Google",
    F.seo.descripcionGoogle,
    "Comfort food premium para armar a tu gusto: base, proteína y toppings en una caja.",
  );
  eq("foto al compartir", F.seo.fotoCompartir, { url: "/og.jpg", ancho: 1200, alto: 630 });
  const textosFabrica = [
    [F.portada.antetitulo, sitio.TOPES.antetitulo],
    [F.portada.frase, sitio.TOPES.frase],
    ...F.portada.pasos.map((p) => [p, sitio.TOPES.paso]),
    [F.historia.titulo, sitio.TOPES.titulo],
    ...F.historia.parrafos.map((p) => [p, sitio.TOPES.parrafo]),
    [F.historia.cierre, sitio.TOPES.cierre],
    [F.textos.domicilio, sitio.TOPES.domicilio],
    [F.textos.pie, sitio.TOPES.pie],
    [F.seo.titulo, sitio.TOPES.seoTitulo],
    [F.seo.descripcion, sitio.TOPES.seoDescripcion],
    [F.seo.descripcionCompartir, sitio.TOPES.seoCompartir],
    [F.seo.descripcionGoogle, sitio.TOPES.seoGoogle],
  ];
  si("todo texto de fábrica cabe en su tope", textosFabrica.every(([t, tope]) => t.length <= tope));
  // Los literales viven en UN lugar: si alguien los vuelve a escribir en un componente, el
  // dueño cambia el texto en Ajustes y el sitio sigue diciendo el viejo.
  const fuente = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
  si(
    "los componentes ya no traen los textos escritos a mano",
    !fuente("components/Hero.tsx").includes("Un delicioso enredo") &&
      !fuente("components/Story.tsx").includes("Todo empezó") &&
      !fuente("components/Footer.tsx").includes("Enrédate rico") &&
      !fuente("components/Location.tsx").includes("calientico") &&
      !fuente("app/layout.tsx").includes("Papa + pasta"),
  );
  si("las reseñas escritas en el código ya no existen", !fs.existsSync(path.join(process.cwd(), "components/resenas-data.ts")));
  si("la semilla no trae sitio (ni reseñas de ejemplo)", menu.SEED_AJUSTES.sitio === undefined);

  console.log("\n═══ EL LECTOR: BLANCO = DE FÁBRICA, ENLACES SOLO HTTPS, TOPES ═══");
  const vacio = sitio.sitioDe(undefined);
  eq("sin nada: todo de fábrica", [vacio.portada.antetitulo, vacio.historia.parrafos.length, vacio.seo.titulo, vacio.portada.foto], [
    F.portada.antetitulo,
    2,
    F.seo.titulo,
    null,
  ]);
  eq("sin foto propia: la de fábrica con su texto", vacio.portada.fotoAlt, F.portada.fotoAlt);
  const raro = sitio.sitioDe({
    negocio: "Papaghetti",
    sitio: {
      portada: { antetitulo: "   ", frase: 42, pasos: ["", "res · cerdo", null], foto: { url: "javascript:alert(1)" } },
      historia: { titulo: "\u00a0", parrafos: ["", "  "], cierre: "x".repeat(500) },
      ubicacion: { mapa: "http://maps.google.com/?q=x", ciudad: "Dosquebradas" },
      domicilios: { didi: "javascript:alert(1)" },
      redes: { mostrar: "sí", tiktok: "https://www.tiktok.com/@papa", facebook: "//facebook.com/x" },
      seo: { fotoCompartir: { url: "//evil.com/x.jpg" }, horarioGoogle: "esto no es un horario" },
      resenas: { mostrar: true, lista: [{ nombre: "QA", texto: "TEXTO-QA", estrellas: 9, fuente: "google" }, "basura"] },
    },
  });
  eq("en blanco o raro: vuelve el de fábrica", [raro.portada.antetitulo, raro.portada.frase, raro.historia.titulo], [
    F.portada.antetitulo,
    F.portada.frase,
    F.historia.titulo,
  ]);
  eq("un paso en blanco usa el suyo de fábrica; el escrito se respeta", raro.portada.pasos, [F.portada.pasos[0], "res · cerdo", F.portada.pasos[2]]);
  eq("párrafos vacíos: los de fábrica", raro.historia.parrafos, [...F.historia.parrafos]);
  eq("lo que pasa el tope se corta al leer", raro.historia.cierre.length, sitio.TOPES.cierre);
  eq("una foto que no es imagen ni dirección propia no existe", [raro.portada.foto, raro.seo.fotoCompartirPropia], [null, false]);
  eq("enlaces: solo https", [raro.ubicacion.mapa, raro.domicilios.didi, raro.redes.facebook, raro.redes.tiktok], [
    "",
    "",
    "",
    "https://www.tiktok.com/@papa",
  ]);
  eq("mostrar es SOLO true (no «sí»)", [raro.redes.mostrar, raro.contacto.mostrarTelefono], [false, false]);
  eq("una ciudad escrita se respeta", raro.ubicacion.ciudad, "Dosquebradas");
  eq("un horario que no se entiende no llega a Google", raro.seo.horarioGoogle, []);
  eq("reseñas rotas fuera", raro.resenas.lista, []);
  eq("una foto propia sin texto: uno genérico, no el de la foto de fábrica", sitio.sitioDe({ negocio: "Papaghetti", sitio: { portada: { foto: { url: "/foto/x.jpg" } } } }).portada.fotoAlt, "Plato de Papaghetti");
  si("es idempotente con lo de fábrica", JSON.stringify(sitio.sitioDe({ sitio: {} })) === JSON.stringify(vacio));

  console.log("\n═══ LO QUE ESCRIBE EL DUEÑO ═══");
  eq("enlace sin https: se completa", sitio.leerEnlace("rappi.com.co/restaurantes/123"), "https://rappi.com.co/restaurantes/123");
  eq("http pasa a https", sitio.leerEnlace("http://rappi.com.co/x"), "https://rappi.com.co/x");
  eq("javascript: NO", sitio.leerEnlace("javascript:alert(1)"), null);
  eq("vacío: sin enlace", sitio.leerEnlace("  "), "");
  eq("Instagram: @usuario, usuario o enlace → usuario", ["@Papaghetti.Pereira", "https://www.instagram.com/papaghetti.pereira/?hl=es"].map(sitio.usuarioInstagram), [
    "papaghetti.pereira",
    "papaghetti.pereira",
  ]);
  eq("Instagram: el enlace de una publicación no es un perfil", sitio.usuarioInstagram("instagram.com/p/abc"), null);
  eq("TikTok: @usuario → enlace", sitio.enlaceTiktok("@Papaghetti"), "https://www.tiktok.com/@papaghetti");
  eq("Facebook: página → enlace", sitio.enlaceFacebook("papaghetti.pereira"), "https://www.facebook.com/papaghetti.pereira");
  eq("WhatsApp de 10 dígitos recibe el 57", sitio.whatsappDe("300 111 2233"), "573001112233");
  eq("teléfono para tel:", [sitio.telHref("606 333 4455"), sitio.telHref("+57 300 1112233")], ["tel:+576063334455", "tel:+573001112233"]);
  eq("horario en español → schema.org", sitio.horarioGoogleDe("Lun a Vie 12 a 21\nSáb, Dom 12:00 - 23:30").specs, ["Mo-Fr 12:00-21:00", "Sa,Su 12:00-23:30"]);
  si("un horario raro se rechaza diciendo cuál", (sitio.horarioGoogleDe("todos los días 12-10pm").error ?? "").includes("todos los días"));
  eq("párrafos: separados por línea en blanco", sitio.parrafosDe("uno\ndos\n\n \n tres"), ["uno dos", "tres"]);

  const portadaIgual = sitio.leerPortada(campos({ antetitulo: F.portada.antetitulo, frase: F.portada.frase, paso1: F.portada.pasos[0], paso2: F.portada.pasos[1], paso3: F.portada.pasos[2] }));
  eq("guardar la portada sin tocarla no guarda nada (sigue siendo «de fábrica»)", portadaIgual.valor, { antetitulo: undefined, frase: undefined, pasos: undefined });
  const portadaNueva = sitio.leerPortada(campos({ antetitulo: "Pereira · Desde 2024", frase: "", paso1: "", paso2: "res · cerdo", paso3: "" }));
  eq("solo se guarda lo que cambió", portadaNueva.valor, { antetitulo: "Pereira · Desde 2024", frase: undefined, pasos: ["", "res · cerdo", ""] });
  si("un texto que pasa el tope se rechaza diciendo cuál", (sitio.leerPortada(campos({ antetitulo: "x".repeat(41) })).error ?? "").includes("máximo 40"));
  const historia = sitio.leerHistoria(campos({ titulo: "", parrafos: F.historia.parrafos.join("\n\n"), cierre: "" }));
  eq("los párrafos de fábrica no se guardan", historia.valor?.parrafos, undefined);
  si("más de 4 párrafos se rechaza", "error" in sitio.leerHistoria(campos({ parrafos: "a\n\nb\n\nc\n\nd\n\ne" })));
  si("un enlace de Rappi que no sirve se rechaza", "error" in sitio.leerDomicilios(campos({ rappi: "javascript:alert(1)" })));
  si("un enlace de DiDi que no parece de DiDi se guarda con aviso", (sitio.leerDomicilios(campos({ didi: "https://ejemplo.com/x" })).aviso ?? "").includes("DiDi"));
  const contacto = sitio.leerContacto(campos({ whatsapp: "311 222 3344", horarios: "Lun a Dom", direccion: "Cra 7 # 20-15", instagram: "@Papaghetti.Pereira", mostrarTelefono: "on", ciudad: "Pereira" }));
  eq("contacto: WhatsApp con 57, Instagram limpio, ciudad de fábrica no se guarda", [contacto.valor?.deSiempre.whatsapp, contacto.valor?.deSiempre.instagram, contacto.valor?.ubicacion.ciudad], [
    "573112223344",
    "papaghetti.pereira",
    undefined,
  ]);
  si("contacto: mostrar el teléfono sin teléfono avisa", (contacto.aviso ?? "").includes("teléfono"));
  si("contacto: horario y dirección son obligatorios", "error" in sitio.leerContacto(campos({ whatsapp: "", horarios: "", direccion: "" })));
  si("reseña sin la casilla de «real» se rechaza", "error" in sitio.leerResena(campos({ nombre: "QA", texto: "TEXTO-QA", estrellas: "5", fuente: "google" })));
  eq(
    "reseña real completa",
    sitio.leerResena(campos({ nombre: " QA  Uno ", texto: "TEXTO-QA", estrellas: "4", fuente: "google", enlace: "maps.app.goo.gl/x", real: "on" })).valor,
    { nombre: "QA Uno", texto: "TEXTO-QA", estrellas: 4, fuente: "google", enlace: "https://maps.app.goo.gl/x" },
  );
  si("reseña de más de 280 letras se rechaza (no se recorta: cambiaría lo que dice)", "error" in sitio.leerResena(campos({ nombre: "QA", texto: "x".repeat(281), estrellas: "5", fuente: "google", real: "on" })));

  console.log("\n═══ MEZCLAS: UN BLOQUE NO PISA A OTRO ═══");
  const FOTO = { url: "/foto/portada.jpg", ancho: 960, alto: 1200, alt: "Caja" };
  let s1 = sitio.conCampos({ portada: { foto: FOTO, antetitulo: "Viejo" }, historia: { titulo: "Mía" } }, "portada", { antetitulo: "Nuevo", frase: undefined });
  eq("guardar los textos de la portada deja su foto y la historia", [s1.portada.antetitulo, s1.portada.foto, s1.historia.titulo], ["Nuevo", FOTO, "Mía"]);
  s1 = sitio.conCampos(s1, "portada", { antetitulo: undefined, frase: undefined, pasos: undefined });
  eq("restaurar los textos deja la foto", s1.portada, { foto: FOTO });
  eq("un grupo que se queda vacío desaparece", sitio.conCampos({ textos: { pie: "x" } }, "textos", { pie: undefined }), {});
  let r = {};
  for (let i = 0; i < 6; i++) r = sitio.conResena(r, { nombre: `P${i}`, texto: "t", estrellas: 5, fuente: "google" });
  eq("hasta 6 reseñas; la séptima no entra", [r.resenas.lista.length, sitio.conResena(r, { nombre: "X", texto: "t", estrellas: 5, fuente: "google" })], [6, null]);
  eq("quitar exige que en esa posición siga la misma persona", sitio.sinResena(r, 0, "P1"), null);
  eq("quitar la que es", sitio.sinResena(r, 0, "P0").resenas.lista.map((x) => x.nombre), ["P1", "P2", "P3", "P4", "P5"]);
  eq(
    "sin reseñas, el interruptor se apaga solo",
    sitio.sinResena({ resenas: { mostrar: true, lista: [{ nombre: "A", texto: "t", estrellas: 5, fuente: "otra" }] } }, 0, "A"),
    {},
  );

  console.log("\n═══ LO PÚBLICO: NADA PRIVADO ═══");
  const A = {
    ...menu.SEED_AJUSTES,
    telefonoLocal: "606 333 4455",
    usuarios: ["Carlos", "Ana"],
    comprobante: { mensajeCierre: "SECRETO-DEL-PAPEL" },
    sitio: { resenas: { mostrar: false, lista: [{ nombre: "Borrador", texto: "BORRADOR-QA", estrellas: 5, fuente: "google" }] } },
  };
  let pub = sitio.sitioPublicoDe(A);
  const txt = JSON.stringify(pub);
  si("sin usuarios ni comprobante", !("usuarios" in pub) && !("comprobante" in pub) && !txt.includes("Carlos") && !txt.includes("SECRETO-DEL-PAPEL"));
  si("reseñas apagadas: no viajan (ni como borrador)", pub.resenas.length === 0 && !txt.includes("BORRADOR-QA"));
  eq("el teléfono no sale si no se encendió", pub.telefono, "");
  eq("el WhatsApp de ejemplo no sale", pub.whatsapp, "");
  eq("Instagram en los datos para Google como siempre; TikTok/Facebook no", pub.sameAs, ["https://instagram.com/papaghetti.pereira"]);
  eq("el mapa sale de la dirección, como antes", pub.mapa, `https://maps.google.com/?q=${encodeURIComponent(menu.SEED_AJUSTES.direccion)}`);
  pub = sitio.sitioPublicoDe({
    ...A,
    whatsapp: "573112223344",
    sitio: {
      contacto: { mostrarTelefono: true },
      redes: { mostrar: true, tiktok: "https://www.tiktok.com/@papa" },
      resenas: { mostrar: true, lista: A.sitio.resenas.lista },
    },
  });
  eq("encendidos: teléfono, WhatsApp, redes y reseñas", [pub.telefono, pub.whatsapp, pub.redes.tiktok, pub.resenas.length], [
    "606 333 4455",
    "573112223344",
    "https://www.tiktok.com/@papa",
    1,
  ]);
  eq("con redes encendidas, Google también las conoce", pub.sameAs, ["https://instagram.com/papaghetti.pereira", "https://www.tiktok.com/@papa"]);

  console.log("\n═══ METADATOS Y DATOS PARA GOOGLE ═══");
  const meta = sitio.metadatosDe({ negocio: "Papaghetti", seo: vacio.seo });
  eq("de fábrica: idénticos a los del layout de antes", meta, {
    title: "Papaghetti \u2014 Un delicioso enredo",
    description: F.seo.descripcion,
    openGraph: {
      title: "Papaghetti \u2014 Un delicioso enredo",
      description: F.seo.descripcionCompartir,
      locale: "es_CO",
      type: "website",
      siteName: "Papaghetti",
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Papaghetti" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Papaghetti \u2014 Un delicioso enredo",
      description: F.seo.descripcionCompartir,
      images: ["/og.jpg"],
    },
  });
  const metaData = sitio.metadatosDe({ negocio: "P", seo: { ...vacio.seo, fotoCompartir: { url: "data:image/jpeg;base64,AAAA", ancho: 1200, alto: 630 } } });
  eq("una foto en texto (desarrollo) no va a la vista previa: va la de fábrica", metaData.openGraph.images[0].url, "/og.jpg");
  eq("«<» escapado en el JSON-LD", sitio.jsonLdSeguro({ n: "</script><b>" }), '{"n":"\\u003c/script>\\u003cb>"}');

  console.log("\n═══ LA CACHÉ DE UN AÑO NO ALCANZA A LAS FOTOS SUBIDAS ═══");
  // Con el mismo comparador de rutas que usa Next para `headers()` en next.config.ts.
  const { getPathMatch } = await import("next/dist/shared/lib/router/utils/path-match.js");
  const config = (await import("./next.config.ts")).default;
  const anual = (await config.headers()).filter((r) =>
    r.headers.some((h) => h.key === "Cache-Control" && h.value.includes("immutable")),
  );
  const inmutable = (ruta) =>
    anual.some((r) => getPathMatch(r.source, { removeUnnamedParams: true, strict: true, sensitive: false })(ruta));
  si(
    "lo de /public sigue un año (video, fotos de comida, la de compartir)",
    ["/logo-hero.mp4", "/food/chicharron.webp", "/platos/ceviche-chicharron.webp", "/og.jpg", "/hero-enredo.webp"].every(inmutable),
  );
  si(
    "/foto/… no: su puerta pone sus cabeceras (un 404 no se queda un año)",
    !["/foto/fotos/x.jpg", "/foto/fotos/pruebas/rama/sitio-portada-Ab1.webp"].some(inmutable),
  );

  // ─────────────────────────── con el cerebro local ───────────────────────────
  const cat = await import("./lib/catalog.ts");
  const leer = () => JSON.parse(fs.readFileSync(FILE, "utf8"));
  const original = leer();
  /* Sin sitio guardado al empezar: las pruebas de abajo cuentan con lo de fábrica, y un
     cerebro local con el sitio ya cambiado (una prueba a mano en el navegador) las hacía
     fallar sin que el código tuviera la culpa. */
  fs.writeFileSync(
    FILE,
    JSON.stringify(
      {
        ...original,
        ajustes: { ...original.ajustes, sitio: undefined },
        pedidos: [],
        movimientos: [],
        historial: [],
        undo: [],
        redo: [],
        archivoMeses: [],
      },
      null,
      2,
    ),
  );
  await new Promise((r) => setTimeout(r, 2100)); // que caduque el memo de 2 s

  console.log("\n═══ GUARDAR UN BLOQUE NO BORRA LOS OTROS (en el cerebro) ═══");
  const histInicial = (leer().historial ?? []).length;
  eq(
    "con el sitio de fábrica, «Restaurar» no escribe nada (ni un sitio vacío)",
    [
      await cat.guardarSitio((a) => ({ sitio: sitio.conCampos(a.sitio, "portada", { antetitulo: undefined, frase: undefined }) }), "QA"),
      leer().ajustes.sitio,
      (leer().historial ?? []).length,
    ],
    [false, undefined, histInicial],
  );
  await cat.updateAjustes({ usuarios: ["Carlos", "Ana"], comprobante: { mensajeCierre: "Vuelve pronto" } }, "QA");
  await cat.updateAjustes({ sitio: { historia: { titulo: "Nuestra historia QA" }, textos: { pie: "Pie QA" } } }, "Cambió el sitio: historia");
  await cat.updateAjustes({ sitio: { portada: { antetitulo: "Hola QA" } } }, "Cambió el sitio: portada");
  let d = leer();
  eq("updateAjustes de un grupo deja los otros", [d.ajustes.sitio.portada.antetitulo, d.ajustes.sitio.historia.titulo, d.ajustes.sitio.textos.pie], [
    "Hola QA",
    "Nuestra historia QA",
    "Pie QA",
  ]);
  const FOTO_DATA = "data:image/jpeg;base64," + "B".repeat(3000);
  const pilaAntes = (d.undo ?? []).length;
  await cat.guardarSitio(
    (a) => ({ sitio: sitio.conCampos(a.sitio, "portada", { foto: { url: FOTO_DATA, ancho: 960, alto: 1200, alt: "Caja QA" } }) }),
    "Cambió el sitio: foto de portada",
    { transaccional: true },
  );
  d = leer();
  eq("la foto se guarda junto a los textos de la portada", [d.ajustes.sitio.portada.antetitulo, d.ajustes.sitio.portada.foto.alt], ["Hola QA", "Caja QA"]);
  eq("la foto no ocupa la pila de Deshacer", (d.undo ?? []).length, pilaAntes);
  eq("pero sí queda en el historial", d.historial[0].texto.startsWith("Cambió el sitio: foto de portada"), true);
  await cat.guardarSitio((a) => ({ sitio: sitio.conCampos(a.sitio, "portada", { antetitulo: "Otra QA" }) }), "Cambió el sitio: portada");
  d = leer();
  eq("guardar los textos después no borra la foto", [d.ajustes.sitio.portada.antetitulo, d.ajustes.sitio.portada.foto?.url === FOTO_DATA], ["Otra QA", true]);
  eq("la foto NO viaja en las fotos de Deshacer", (d.undo ?? []).some((x) => JSON.stringify(x).includes("B".repeat(200))), false);
  await cat.deshacer();
  d = leer();
  eq("Deshacer devuelve el texto y conserva la foto", [d.ajustes.sitio.portada.antetitulo, d.ajustes.sitio.portada.foto?.url === FOTO_DATA], ["Hola QA", true]);
  eq("y no toca los demás bloques", [d.ajustes.sitio.historia.titulo, d.ajustes.usuarios], ["Nuestra historia QA", ["Carlos", "Ana"]]);
  {
    // Si guardar sin cambios dejara un paso en la pila, el próximo «Deshacer» se gastaría en él.
    const [pila, hist] = [(d.undo ?? []).length, (d.historial ?? []).length];
    const huboCambio = await cat.guardarSitio(
      (a) => ({ sitio: sitio.conCampos(sitio.conCampos(a.sitio, "portada", { antetitulo: "Hola QA" }), "redes", { tiktok: undefined }) }),
      "Cambió el sitio: portada",
    );
    d = leer();
    eq("guardar un bloque tal como estaba no escribe nada (ni pila ni historial)", [huboCambio, (d.undo ?? []).length, (d.historial ?? []).length], [
      false,
      pila,
      hist,
    ]);
  }
  await cat.guardarSitio(
    (a) => ({
      telefonoLocal: "606 333 4455",
      sitio: sitio.conCampos(a.sitio, "resenas", { mostrar: false, lista: [{ nombre: "QA", texto: "BORRADOR-QA", estrellas: 5, fuente: "google" }] }),
    }),
    "QA reseñas",
  );

  console.log("\n═══ getSitioPublico ═══");
  pub = await cat.getSitioPublico();
  const crudo = JSON.stringify(pub);
  si("nunca los usuarios ni el comprobante", !crudo.includes("Carlos") && !crudo.includes("Vuelve pronto") && !("usuarios" in pub) && !("comprobante" in pub));
  si("ni las reseñas apagadas", pub.resenas.length === 0 && !crudo.includes("BORRADOR-QA"));
  eq("ni el teléfono que no se encendió", pub.telefono, "");
  eq("con lo del sitio resuelto", [pub.portada.antetitulo, pub.historia.titulo, pub.textos.pie, pub.historia.cierre], [
    "Hola QA",
    "Nuestra historia QA",
    "Pie QA",
    F.historia.cierre,
  ]);
  const catPub = await cat.getCatalogPublico();
  si("y el catálogo público sigue sin el sitio", !("sitio" in catPub.ajustes) && !JSON.stringify(catPub).includes("BORRADOR-QA"));
  await cat.guardarSitio((a) => ({ sitio: sitio.conCampos(a.sitio, "resenas", { mostrar: true }) }), "QA mostrar");
  eq("encendidas, ahí sí", (await cat.getSitioPublico()).resenas.map((x) => x.texto), ["BORRADOR-QA"]);
} catch (e) {
  mal++;
  console.log("  ❌ reventó:", e?.stack ?? e);
} finally {
  if (fs.existsSync(RESPALDO)) {
    fs.copyFileSync(RESPALDO, FILE);
    fs.unlinkSync(RESPALDO);
  }
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
