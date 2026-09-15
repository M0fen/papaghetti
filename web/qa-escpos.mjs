/**
 * EL CODIFICADOR ESC/POS, byte a byte, con un bitmap sintético.
 *
 *   node --import ./qa-ts.mjs qa-escpos.mjs
 */
const { rasterEscPos, trabajoEscPos, trocear } = await import("./lib/escpos.ts");
const { ascii, fila, partir, armarTiquete, codificarRenglones, tiqueteEscPos, pruebaTextoEscPos } = await import("./lib/tiquete-escpos.ts");
let ok = 0, mal = 0;
const eq = (n, a, b) => { const c = JSON.stringify(a) === JSON.stringify(b); c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${c ? "" : `  (dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)})`}`); };
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
eq("el aviso de que NO es factura, partido en líneas", L.map((l) => l.t).join(" ").includes("No es factura electronica de venta ni documento equivalente P.O.S."), true);
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

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
