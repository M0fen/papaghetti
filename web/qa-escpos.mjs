/**
 * EL CODIFICADOR ESC/POS, byte a byte, con un bitmap sintético.
 *
 *   node --import ./qa-ts.mjs qa-escpos.mjs
 */
const { rasterEscPos, trabajoEscPos, trocear } = await import("./lib/escpos.ts");
const { ascii, fila, partir, armarTiquete, codificarRenglones, tiqueteEscPos, pruebaTextoEscPos } = await import("./lib/tiquete-escpos.ts");
let ok = 0, mal = 0;
// El 4º argumento es un detalle que se imprime solo si falla (antes se ignoraba).
const eq = (n, a, b, d) => { const c = JSON.stringify(a) === JSON.stringify(b); c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${c ? "" : `  (dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)})${d === undefined ? "" : ` · ${typeof d === "string" ? d : JSON.stringify(d)}`}`}`); };
const hex = (a) => [...a].map((b) => b.toString(16).padStart(2, "0")).join(" ");

/** Un bitmap RGBA de 576 de ancho: fila 0 toda negra, fila 1 alternando negro/blanco. */
function bitmap(alto, pinta) {
  const w = 576, data = new Uint8ClampedArray(w * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < w; x++) {
    const v = pinta(x, y) ? 0 : 255, i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: w, height: alto, data };
}

console.log("\n═══ CABECERA GS v 0 ═══");
const r = rasterEscPos(bitmap(2, (x, y) => (y === 0 ? true : x % 2 === 0)));
eq("empieza por GS v 0 modo normal", hex(r.subarray(0, 4)), "1d 76 30 00");
eq("ancho = 72 bytes (576 puntos / 8), little-endian", hex(r.subarray(4, 6)), "48 00");
eq("alto = 2 filas", hex(r.subarray(6, 8)), "02 00");
eq("la fila negra son 72 bytes 0xFF", [...r.subarray(8, 80)].every((b) => b === 0xff), true);
eq("la fila alterna es 0xAA (bit alto = punto izquierdo)", [...r.subarray(80, 152)].every((b) => b === 0xaa), true);
eq("longitud exacta: 8 + 72×2", r.length, 8 + 72 * 2);

console.log("\n═══ BLOQUES ═══");
const largo = rasterEscPos(bitmap(450, () => false));
eq("450 filas → 3 bloques (200 + 200 + 50)", largo.length, 3 * 8 + 72 * 450);
eq("el 3º bloque declara 50 filas", hex(largo.subarray(2 * (8 + 72 * 200) + 6, 2 * (8 + 72 * 200) + 8)), "32 00");

console.log("\n═══ EL TRABAJO COMPLETO ═══");
const t = trabajoEscPos(bitmap(1, () => false));
eq("arranca con ESC @", hex(t.subarray(0, 2)), "1b 40");
eq("termina con avance de 4 y corte parcial GS V 66 0", hex(t.subarray(t.length - 7)), "1b 64 04 1d 56 42 00");
const sinCorte = trabajoEscPos(bitmap(1, () => false), { cortar: false, avance: 2 });
eq("sin corte, termina en el avance", hex(sinCorte.subarray(sinCorte.length - 3)), "1b 64 02");

console.log("\n═══ TROCEADO PARA BLE ═══");
const trozos = trocear(t, 20);
eq("todos los trozos caben en 20 bytes", trozos.every((z) => z.length <= 20), true);
eq("y juntos son el trabajo entero", trozos.reduce((s, z) => s + z.length, 0), t.length);

console.log("\n═══ EL TIQUETE EN TEXTO: ascii ═══");
eq("quita tildes y eñes, traduce símbolos", ascii("Ñandú Pérez · N° 7 — ¡Gracias! 2× papa"), "Nandu Perez - No. 7 - Gracias! 2x papa");
eq("lo que no cabe en ASCII se elimina, no se inventa", ascii("Nido 🍝 ok"), "Nido  ok");
eq("fila: valor pegado a la derecha, ancho exacto", fila("Consumo", "$34.400", 48).map((l) => l.length), [48]);
eq("fila larga: baja y el valor va al final de la última línea", fila("Nido Carbonara con un nombre larguisimo para forzar el salto", "$68.800", 48).every((l) => l.length <= 48), true);
eq("partir: corta palabras imposibles", partir("A".repeat(100), 48).map((l) => l.length), [48, 48, 4]);

/* Un pedido de mentira, con lo peor que puede traer: eñes, líneas largas, detalle, nota. */
const pedido = {
  id: "abc", consecutivo: 7, creadoEn: "2026-09-12T19:03:00.000Z", tipo: "mesa",
  cliente: "Ñandú Pérez", referencia: "Mesa 4", notas: "Sin cebolla, por favor; alérgico",
  base: "Nido", proteina: "Pollo", toppings: [], cantidad: 1,
  items: [
    { nombre: "Nido Carbonara con un nombre larguísimo para forzar el salto de línea", detalle: "con Pollo, papa criolla, queso", precio: 34400, cantidad: 2 },
    { nombre: "Limonada", precio: 6000, cantidad: 1 },
  ],
  subtotal: 74800, descuento: 4800, impuesto: 5600, domicilio: 0, total: 75600,
  pago: "pagado", metodoPago: "nequi", estado: "listo",
};
const ajustes = { negocio: "Papaghetti", nit: "901.234.567-8", direccion: "Cra 7 # 20-15, Pereira", telefonoLocal: "606 333 4455", impuestoPct: 8 };

/** Lee el trabajo de vuelta: líneas de texto y el tamaño de letra vigente en cada una. */
function leer(bytes) {
  const lineas = []; let act = "", tam = 1, i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x1b) { i += bytes[i + 1] === 0x40 ? 2 : 3; continue; }
    if (b === 0x1d) {
      if (bytes[i + 1] === 0x21) { tam = bytes[i + 2] === 0x11 ? 2 : 1; i += 3; continue; }
      if (bytes[i + 1] === 0x56) { i += 4; continue; }
      throw new Error("comando GS desconocido en " + i);
    }
    if (b === 0x0a) { lineas.push({ t: act, tam }); act = ""; i++; continue; }
    act += String.fromCharCode(b); i++;
  }
  return lineas;
}

console.log("\n═══ EL TIQUETE EN TEXTO: el trabajo ═══");
const tt = tiqueteEscPos(pedido, ajustes);
eq("arranca con ESC @", hex(tt.subarray(0, 2)), "1b 40");
eq("termina restaurando estilos, avance 4 y corte", hex(tt.subarray(tt.length - 16)), "1b 61 00 1b 45 00 1d 21 00 1b 64 04 1d 56 42 00");
eq("pesa menos de 3 KB (la imagen pesa 60)", tt.length < 3000, true, tt.length);
eq("solo bytes ASCII: ni un UTF-8 suelto", [...tt].every((b) => b < 0x80), true);
const L = leer(tt);
eq("ninguna línea pasa de 48 columnas (24 en letra doble)", L.every((l) => l.t.length <= (l.tam === 2 ? 24 : 48)), true, JSON.stringify(L.filter((l) => l.t.length > (l.tam === 2 ? 24 : 48)).map((l) => l.t)));
eq("el nombre va en letra doble", L.find((l) => l.t === "PAPAGHETTI")?.tam, 2);
eq("el cliente sale sin tilde", L.some((l) => l.t === "Cliente: Nandu Perez"), true);
const i2x = L.findIndex((l) => l.t.startsWith("2x Nido Carbonara"));
eq("2x y el nombre largo, partido por palabras", i2x > 0 && L[i2x].t.length <= 48, true, L[i2x]?.t);
eq("y el importe al final de la última línea del nombre, pegado a la derecha", /\$68\.800$/.test(L[i2x + 1]?.t ?? "") && L[i2x + 1].t.length === 48, true, L[i2x + 1]?.t);
eq("el detalle va sangrado", L.some((l) => l.t.startsWith("   con Pollo")), true);
eq("descuento en negativo", L.some((l) => /^Descuento\s+-\$4\.800$/.test(l.t)), true);
eq("impuesto con su porcentaje", L.some((l) => /^Impuesto \(8%\)\s+\$5\.600$/.test(l.t)), true);
eq("TOTAL en letra doble a 24 columnas: 70.000 + 5.600 = $75.600", L.find((l) => l.t.startsWith("TOTAL"))?.t, "TOTAL" + " ".repeat(24 - 5 - 7) + "$75.600");
eq("pago con el método", L.some((l) => l.t === "Pago: Nequi"), true);
eq("la nota", L.some((l) => l.t.startsWith("Nota: Sin cebolla")), true);
eq("sin nota legal al pie (el dueño pidió quitarla)", /No es factura|Documento interno/.test(L.map((l) => l.t).join(" ")), false);
eq("ni propina ni la palabra Factura a secas", L.some((l) => /propina|^Factura/i.test(l.t)), false);

console.log("\n═══ EL TIQUETE EN TEXTO: casos ═══");
const anulado = leer(tiqueteEscPos({ ...pedido, estado: "cancelado", pago: "devuelto", devolucion: { monto: 75600, motivo: "se cayó" } }, ajustes));
eq("devuelto: aviso arriba en letra doble", anulado.find((l) => /DINERO DEVUELTO/.test(l.t))?.tam, 2);
eq("y el motivo, sin tilde", anulado.some((l) => /Se devolvieron \$75\.600 - se cayo/.test(l.t)), true);
const t58 = leer(tiqueteEscPos(pedido, ajustes, { cols: 32 }));
eq("58 mm: nada pasa de 32 columnas (16 en doble)", t58.every((l) => l.t.length <= (l.tam === 2 ? 16 : 32)), true);
const sinCorteT = tiqueteEscPos(pedido, ajustes, { cortar: false, avance: 2 });
eq("sin corte: termina en el avance", hex(sinCorteT.subarray(sinCorteT.length - 3)), "1b 64 02");
const pr = pruebaTextoEscPos();
eq("la prueba de canal pesa menos de 1 KB", pr.length < 1000, true, pr.length);
eq("y trae la regla de 48 dígitos", leer(pr).some((l) => l.t === "012345678901234567890123456789012345678901234567"), true);
eq("armarTiquete + codificarRenglones = tiqueteEscPos", hex(codificarRenglones(armarTiquete(pedido, ajustes))) === hex(tt), true);

console.log("\n═══ EL ROLLO DE 58 MM (Star POS TP586) ═══");
const { ROLLOS, ROLLO_POR_DEFECTO, rolloValido } = await import("./lib/rollo.ts");
eq("el rollo de fábrica es el del local: 58", ROLLO_POR_DEFECTO, 58);
eq("58 mm = 48 mm útiles, 384 puntos, 32 columnas", [ROLLOS[58].mm, ROLLOS[58].puntos, ROLLOS[58].cols], [48, 384, 32]);
eq("80 mm = 72 mm útiles, 576 puntos, 48 columnas", [ROLLOS[80].mm, ROLLOS[80].puntos, ROLLOS[80].cols], [72, 576, 48]);
eq("puntos = mm × 8 (203 dpi) en los dos", ROLLOS[58].puntos === ROLLOS[58].mm * 8 && ROLLOS[80].puntos === ROLLOS[80].mm * 8, true);
eq("lo guardado raro vuelve al de fábrica", [rolloValido("80"), rolloValido("58"), rolloValido(null), rolloValido("72")], [80, 58, 58, 58]);
const pr58 = leer(pruebaTextoEscPos(32));
eq("la prueba de 58 trae la regla de 32 dígitos", pr58.some((l) => l.t === "01234567890123456789012345678901"), true);
eq("y nada en ella pasa de 32 columnas (16 en doble)", pr58.every((l) => l.t.length <= (l.tam === 2 ? 16 : 32)), true);
const bmp58 = { width: 384, height: 2, data: new Uint8ClampedArray(384 * 2 * 4).fill(255) };
eq("un raster de 384 puntos va a 48 bytes por fila", hex(rasterEscPos(bmp58).subarray(4, 6)), "30 00");
eq("58 mm: el TOTAL en doble llena sus 16 columnas", t58.find((l) => l.t.startsWith("TOTAL"))?.t, "TOTAL" + " ".repeat(16 - 5 - 7) + "$75.600");

console.log("\n═══ F3 · ascii: ordinales y tabuladores ═══");
eq("Nº y º/ª (se teclean en las direcciones)", [ascii("Cra 7 Nº 20-15, 2º piso"), ascii("N.º 4, 1ª etapa")], ["Cra 7 No. 20-15, 2o piso", "No. 4, 1a etapa"]);
eq("un tabulador es un espacio (antes pegaba las palabras)", ascii("Tab\taquí"), "Tab aqui");
eq("y los espacios de dentro no se tocan (el relleno de las columnas)", ascii("Consumo       $34.400"), "Consumo       $34.400");

console.log("\n═══ F3 · EL PAPEL DE HOY, EN TEXTO (dorado, 32 columnas) ═══");
/* Sin configurar nada, el tiquete de texto de la TP586 sale como siempre: mismo orden,
   mismas palabras. Cambia solo lo que se arregló a propósito: la fecha lleva el mismo
   separador que las otras salidas ("-", que es el "·" en ASCII). */
/** "concepto ..... valor" a 32 columnas: la regla del papel, escrita aparte del código que se prueba. */
const a32 = (izq, der) => izq + " ".repeat(32 - izq.length - der.length) + der;
const DORADO_32 = [
  "PAPAGHETTI",
  "NIT 901.234.567-8",
  "Cra 7 # 20-15, Pereira",
  "Tel. 606 333 4455",
  "-".repeat(32),
  "COMPROBANTE DE CONSUMO",
  "No. 7",
  "-".repeat(32),
  "Fecha: 12/09/2026 - 14:03",
  "Servicio: En el local",
  "Ubicacion: Mesa 4",
  "Cliente: Nandu Perez",
  "-".repeat(32),
  "2x Nido Carbonara con un nombre",
  "larguisimo para forzar el salto",
  a32("de linea", "$68.800"),
  "   con Pollo, papa criolla,",
  "   queso",
  a32("Limonada", "$6.000"),
  "",
  "Nota: Sin cebolla, por favor;",
  "alergico",
  "-".repeat(32),
  a32("Consumo", "$74.800"),
  a32("Descuento", "-$4.800"),
  a32("Impuesto (8%)", "$5.600"),
  "TOTAL" + " ".repeat(16 - 5 - 7) + "$75.600",
  "Pago: Nequi",
  "-".repeat(32),
  "Gracias por venir!",
];
eq("dorado: línea por línea", t58.map((l) => l.t), DORADO_32);

console.log("\n═══ F3 · A LA MEDIDA · texto ESC/POS ═══");
const { papelDe, piezasPapel } = await import("./lib/papel.ts");
const AJ3 = {
  ...ajustes, whatsapp: "573001112233", razonSocial: "Pasta & Ñoquis S.A.S. — Pereira",
  comprobante: {
    mensajeCierre: "¡Vuelve pronto, enredado! 🍝",
    lineasPie: ["Síguenos en @papaghetti.pereira · ¡gracias!", "W".repeat(70), "Wi-Fi: Papaghetti · Clave: Ñandú2026", "una cuarta que NO sale"],
    datosCliente: { cliente: false, ubicacion: true, telefono: true },
  },
};
const pF3 = { ...pedido, telefono: "3001234567" };
const plano = (Lx) => Lx.map((l) => l.t).join(" ").replace(/\s+/g, " ");
const sb = (s) => s.replace(/\s+/g, "").toLowerCase(); // sin espacios ni mayúsculas: insensible a cortes y relleno
for (const cols of [32, 48]) {
  const bytes = tiqueteEscPos(pF3, AJ3, { cols }), Lc = leer(bytes), tx = plano(Lc);
  eq(`${cols} col · solo ASCII (¡, tildes, eñe, raya, emoji)`, [...bytes].every((b) => b < 0x80), true);
  eq(`${cols} col · nada pasa del ancho (la mitad en doble)`, Lc.every((l) => l.t.length <= (l.tam === 2 ? cols / 2 : cols)), true, Lc.filter((l) => l.t.length > (l.tam === 2 ? cols / 2 : cols)).map((l) => l.t));
  eq(`${cols} col · las filas con valor a la derecha miden exactamente el ancho`, Lc.filter((l) => l.tam !== 2 && / {2,}\$\S+$/.test(l.t)).every((l) => l.t.length === cols), true);
  eq(`${cols} col · cierre propio, en ASCII y sin el emoji`, Lc.some((l) => l.t === "Vuelve pronto, enredado!"), true);
  eq(`${cols} col · ya no dice Gracias por venir`, /Gracias por venir/.test(tx), false);
  eq(`${cols} col · líneas extra (y la palabra imposible, partida)`, tx.includes("Siguenos en @papaghetti.pereira - gracias!") && Lc.some((l) => l.t === "W".repeat(cols)), true);
  eq(`${cols} col · la clave sale sin eñe (por eso el editor avisa)`, sb(tx).includes(sb("Clave: Nandu2026")), true);
  eq(`${cols} col · como mucho 3`, /una cuarta/.test(tx), false);
  eq(`${cols} col · razón social sin eñe ni raya`, tx.includes("Pasta & Noquis S.A.S. - Pereira"), true);
  eq(`${cols} col · cliente oculto / ubicación y teléfono visibles`, [Lc.some((l) => /^Cliente:/.test(l.t)), Lc.some((l) => l.t === "Ubicacion: Mesa 4"), Lc.some((l) => l.t === "Telefono: 300 123 4567")], [false, true, true]);
  eq(`${cols} col · título intacto y sin nota legal`, Lc.filter((l) => l.t === "COMPROBANTE DE CONSUMO").length === 1 && !/No es factura|Documento interno/.test(tx), true);
  eq(`${cols} col · sin el número de ejemplo (sale el teléfono del local)`, [/3001112233|300 111 2233/.test(tx), tx.includes("Tel. 606 333 4455")], [false, true]);
  eq(`${cols} col · y sin teléfono del local, con el WhatsApp de ejemplo, no hay 'Tel.'`, /Tel\./.test(plano(leer(tiqueteEscPos(pF3, { negocio: "Papaghetti", whatsapp: "573001112233" }, { cols })))), false);
  eq(`${cols} col · TOTAL en doble llena ${cols / 2}`, Lc.find((l) => l.t.startsWith("TOTAL"))?.t.length, cols / 2);
  eq(`${cols} col · ninguna línea arranca con un espacio, salvo el detalle sangrado`, Lc.every((l) => !l.t.startsWith(" ") || l.t.startsWith("   ")), true, Lc.filter((l) => l.t.startsWith(" ") && !l.t.startsWith("   ")).map((l) => l.t));
  eq(`${cols} col · ESC/POS = papel (cada pieza, en ASCII)`, piezasPapel(papelDe(pF3, AJ3)).filter((s) => !sb(tx).includes(sb(ascii(s)))), []);
  eq(`${cols} col · sigue pesando menos de 3 KB con todo`, bytes.length < 3000, true, bytes.length);
}
const centradas = leer(tiqueteEscPos(pF3, { ...AJ3, comprobante: { lineasPie: ["❤️ Hecho con amor ❤️"] } }, { cols: 32 }));
eq("una línea centrada no arranca con espacio aunque se le quite un emoji", centradas.some((l) => l.t === "Hecho con amor"), true);
const anuladoEn = (cols) => leer(tiqueteEscPos({ ...pedido, estado: "cancelado", motivoCancelacion: "cliente se fue" }, ajustes, { cols }));
eq("el sello va ANTES que el nombre, como en la imagen y la pantalla, y en 58 mm cabe en UNA línea doble", (() => {
  const Lx = anuladoEn(32);
  return [Lx[0].t, Lx[0].tam, Lx.findIndex((l) => l.t === "PAPAGHETTI") > 2];
})(), ["PEDIDO ANULADO", 2, true]);
eq("en 80 mm, con sus asteriscos de siempre", anuladoEn(48)[0].t, "*** PEDIDO ANULADO ***");
const { lineasImpresas, renglonesDePapel, comoSaleEnTexto } = await import("./lib/tiquete-escpos.ts");
eq("la vista previa de Ajustes lee las mismas líneas que la impresora", lineasImpresas(renglonesDePapel(papelDe(pF3, AJ3), 32), 32).map((l) => l.texto), leer(tiqueteEscPos(pF3, AJ3, { cols: 32 })).map((l) => l.t));
eq("comoSaleEnTexto: lo que el editor muestra bajo una línea al pie", comoSaleEnTexto("Wi-Fi: Papaghetti · Clave: Ñandú2026 🍝"), "Wi-Fi: Papaghetti - Clave: Nandu2026");

console.log("\n═══ F3 · LA IMAGEN DE LA TÉRMICA (lienzo de mentira, sin navegador) ═══");
/* Un contexto 2D falso que anota lo que se dibuja. measureText cuenta 11 unidades por
   letra: no es la fuente real, pero alcanza para comprobar que nada se pasa del ancho. */
const trazos = [], dibujos = [];
const ctx2d = new Proxy({}, {
  get: (o, k) => k === "measureText" ? (s) => ({ width: [...String(s)].length * 11 })
    : k === "fillText" ? (s) => trazos.push(String(s))
    : k === "drawImage" ? (img, ...r) => dibujos.push({ img, r })
    : k in o ? o[k] : () => {},
  set: (o, k, v) => ((o[k] = v), true),
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { dibujarTiquete, cargarImagen, tintaDeLogo, cajaDeTinta } = await import("./lib/tiquete-imagen.ts");
const ANCHO = { 58: 456, 80: 532 }; // ancho útil de texto, en unidades lógicas
const pintar = (p, a, rollo, logo = null) => {
  trazos.length = 0; dibujos.length = 0;
  dibujarTiquete({ papel: papelDe(p, a), logo, rollo });
  return trazos.join(" ").replace(/\s+/g, " ");
};
pintar(pedido, ajustes, 58);
eq("imagen sin configurar: termina en ¡Gracias por venir!", trazos.at(-1), "¡Gracias por venir!");
eq("y sin logo cargado escribe el nombre arriba", trazos[0], "Papaghetti");
for (const rollo of [58, 80]) {
  const img = pintar(pF3, AJ3, rollo);
  eq(`imagen ${rollo} · cierre propio / sin el de fábrica`, [img.includes("¡Vuelve pronto, enredado!"), img.includes("¡Gracias por venir!")], [true, false]);
  eq(`imagen ${rollo} · sin cliente (apagado)`, [img.includes("Ñandú Pérez"), trazos.includes("CLIENTE")], [false, false]);
  eq(`imagen ${rollo} · título fijo, una vez`, trazos.filter((t) => t === "COMPROBANTE DE CONSUMO").length, 1);
  eq(`imagen ${rollo} · la misma línea extra que el WhatsApp y el texto`, img.includes("Síguenos en @papaghetti.pereira · ¡gracias!"), true);
  eq(`imagen ${rollo} · nada se pasa del ancho (ni la palabra de 70 letras)`, trazos.filter((t) => [...t].length * 11 > ANCHO[rollo]), []);
  eq(`imagen ${rollo} · imagen = papel (cada pieza)`, piezasPapel(papelDe(pF3, AJ3)).filter((s) => !sb(img).includes(sb(s))), []);
}
const valorLargo = pintar({ ...pF3, referencia: "Mesa del ventanal grande, junto a la puerta que da al parqueadero" }, AJ3, 58);
eq("un valor largo no se monta sobre su rótulo: el rótulo va solo y el valor debajo, partido", [trazos.includes("UBICACIÓN"), valorLargo.includes("Mesa del ventanal grande, junto a la puerta que da al parqueadero")], [true, true]);
const logoFalso = { naturalWidth: 400, naturalHeight: 400 };
pintar(pF3, AJ3, 58, logoFalso);
const dib = dibujos.find((d) => d.img === logoFalso);
eq("con logo se dibuja el logo, no el nombre", [Boolean(dib), trazos.includes("Papaghetti")], [true, false]);
eq("un logo cuadrado ENCAJA en la caja de 330×140 (antes salía de 330 de alto)", dib && [dib.r[2] <= 330, dib.r[3] <= 140, dib.r[3]], [true, true, 140]);
pintar(pF3, AJ3, 58, { naturalWidth: 640, naturalHeight: 274 });
const casa = dibujos.find((d) => d.img.naturalWidth === 640);
eq("el logo de la casa sale como siempre: a lo ancho, ~330×140", casa && [Math.abs(casa.r[2] - 330) <= 4, casa.r[3] <= 140], [true, true]);
pintar({ ...pedido, estado: "cancelado", pago: "devuelto", devolucion: { monto: 75600, motivo: "se cayó" } }, ajustes, 58);
eq("el sello de devuelto va primero y con su motivo", [trazos[0], trazos.some((t) => t.includes("se cayó"))], ["DINERO DEVUELTO", true]);

console.log("\n═══ F3 · CARGAR IMAGEN NUNCA SE QUEDA ESPERANDO ═══");
globalThis.Image = class { set src(v) { this._src = v; } }; // una imagen que nunca responde
const t0 = Date.now();
const nada = await cargarImagen("/logo-que-no-responde.png", 60);
eq("con tiempo límite resuelve null (antes: 'Preparando…' para siempre)", [nada, Date.now() - t0 < 2000], [null, true]);
globalThis.Image = class { set src(v) { setTimeout(() => this.onerror?.(), 0); } };
eq("y si falla, null sin lanzar", await cargarImagen("/roto.png", 1000), null);

console.log("\n═══ F3 · EL LOGO PROPIO: DE COLOR A TINTA (sin navegador) ═══");
/* Un logo de mentira de 10×6 sobre crema: una barra marrón, una naranja (clara: la
   luminancia la borraba) y el resto fondo. */
const W10 = 10, H6 = 6, rgba = new Uint8ClampedArray(W10 * H6 * 4);
for (let i = 0; i < W10 * H6; i++) rgba.set([251, 241, 222, 255], i * 4);
for (let x = 2; x <= 4; x++) for (let y = 1; y <= 4; y++) rgba.set([60, 36, 20, 255], (y * W10 + x) * 4);
for (let x = 6; x <= 7; x++) for (let y = 2; y <= 3; y++) rgba.set([242, 165, 22, 255], (y * W10 + x) * 4);
const gris = tintaDeLogo(rgba, W10, H6);
eq("el fondo queda blanco y el marrón negro", [gris[0], gris[1 * W10 + 2]], [255, 0]);
eq("el naranja también es tinta (por distancia al fondo, no por luminancia)", gris[2 * W10 + 6] < 150, true);
eq("la caja de tinta recorta los bordes vacíos", cajaDeTinta(gris, W10, H6), { x: 2, y: 1, w: 6, h: 4 });
eq("una imagen sin dibujo no tiene tinta (no se vuelve un manchón)", cajaDeTinta(tintaDeLogo(new Uint8ClampedArray(W10 * H6 * 4).fill(250), W10, H6), W10, H6), null);

console.log("\n═══ F3 · DOS BASES EN EL PAPEL, a 32 y 48 columnas ═══");
/* Así llegan del servidor (fase 1): nombre "A / B" y el modo al frente del detalle,
   con las proteínas unidas por " + ". */
const p2 = {
  ...pedido, consecutivo: 21, impuestoIncluido: true, impuestoPct: 8, notas: undefined,
  items: [
    { nombre: "Spaghetti / Papa criolla", detalle: "mitad y mitad · con Carne molida · + Parmesano", precio: 24907, precioFinal: 26900, cantidad: 2 },
    { nombre: "Fettuccine / Papa francesa", detalle: "dos bases completas · con Pollo + Tocineta · + Queso extra, Maduro", precio: 30000, precioFinal: 32400, cantidad: 1 },
    { nombre: "Spaghetti / Papa criolla", detalle: "mitad y mitad", precio: 15648, precioFinal: 16900, cantidad: 1 },
  ],
  subtotal: 0, descuento: 0, impuesto: 0, bruto: 103100, total: 103100,
};
const a48 = (izq, der) => izq + " ".repeat(48 - izq.length - der.length) + der;
const sub = (Lx, trozo) => { const t = Lx.map((l) => l.t); const i = t.indexOf(trozo[0]); return i >= 0 && trozo.every((x, j) => t[i + j] === x); };
const L32 = leer(tiqueteEscPos(p2, ajustes, { cols: 32 }));
eq("32 · un nombre de dos bases que no cabe con su precio se parte en la barra, y el precio cierra el plato",
  sub(L32, ["2x Spaghetti /", a32("Papa criolla", "$53.800"), "   mitad y mitad - con Carne", "   molida - + Parmesano"]), true, L32.map((l) => l.t));
eq("32 · igual con una sola unidad", sub(L32, ["Fettuccine /", a32("Papa francesa", "$32.400")]), true);
eq("32 · y si cabe, en una sola línea como siempre", L32.some((l) => l.t === a32("Spaghetti / Papa criolla", "$16.900")), true);
eq("32 · el «+» nunca queda colgado al final de un renglón", L32.filter((l) => /\+$/.test(l.t.trimEnd())).map((l) => l.t), []);
eq("32 · las proteínas unidas por «+» se parten bien", sub(L32, ["   dos bases completas - con", "   Pollo + Tocineta - + Queso", "   extra, Maduro"]), true, L32.map((l) => l.t));
const L48 = leer(tiqueteEscPos(p2, ajustes, { cols: 48 }));
eq("48 · a lo ancho caben enteros, con su precio", [a48("2x Spaghetti / Papa criolla", "$53.800"), a48("Fettuccine / Papa francesa", "$32.400")].every((x) => L48.some((l) => l.t === x)), true, L48.map((l) => l.t));
eq("48 · el «+» tampoco queda colgado", L48.filter((l) => /\+$/.test(l.t.trimEnd())).map((l) => l.t), []);
for (const [cols, Lx] of [[32, L32], [48, L48]]) {
  eq(`${cols} · nada pasa del ancho`, Lx.every((l) => l.t.length <= (l.tam === 2 ? cols / 2 : cols)), true);
  eq(`${cols} · ESC/POS = papel (las dos bases y su modo, en ASCII)`, piezasPapel(papelDe(p2, ajustes)).filter((s) => !sb(plano(Lx)).includes(sb(ascii(s)))), []);
  eq(`${cols} · TOTAL de los tres platos`, Lx.find((l) => l.t.startsWith("TOTAL"))?.t.endsWith("$103.100"), true);
}
eq("solo ASCII, y sin «½» (el modo va escrito)", [...tiqueteEscPos(p2, ajustes, { cols: 32 })].every((b) => b < 0x80) && !plano(L32).includes("1/2"), true);
/* La imagen, con nombres más largos: el lienzo de mentira mide 11 por letra. */
const p2l = { ...p2, items: [{ nombre: "Spaghetti integral / Papa criolla salteada", detalle: "mitad y mitad · con Pollo + Carne molida + Tocineta · + Parmesano, Maduro, Queso extra", precio: 24907, precioFinal: 26900, cantidad: 12 }] };
for (const rollo of [58, 80]) {
  pintar(p2l, ajustes, rollo);
  eq(`imagen ${rollo} · se parte en la barra, no dentro de una base`, [trazos.includes("12× Spaghetti integral /"), trazos.includes("Papa criolla salteada"), trazos.some((t) => /^(salteada|criolla salteada)$/.test(t))], [true, true, false], trazos);
  eq(`imagen ${rollo} · el «+» nunca cierra un renglón del detalle`, trazos.filter((t) => /\+$/.test(t.trim())), []);
  eq(`imagen ${rollo} · nada se pasa del ancho`, trazos.filter((t) => [...t].length * 11 > ANCHO[rollo]), []);
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
