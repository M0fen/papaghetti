/**
 * EL MÓDULO PURO DEL HISTORIAL DE COMPROBANTES, con pedidos de mentira.
 *
 *   node --import ./qa-ts.mjs qa-comprobantes.mjs
 */
const C = await import("./lib/comprobantes.ts");
let ok = 0, mal = 0;
const eq = (n, a, b) => { const c = JSON.stringify(a) === JSON.stringify(b); c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${c ? "" : `  (dio ${JSON.stringify(a)}, esperaba ${JSON.stringify(b)})`}`); };
const si = (n, c, d = "") => { c ? ok++ : mal++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? " · " + d : ""}`); };

const base = { canal: "salon", tipo: "mesa", estado: "entregado", pago: "pagado", metodoPago: "efectivo", subtotal: 30000, impuesto: 2400, descuento: 0, propina: 0, total: 32400, items: [{ nombre: "Nido Carbonara", cantidad: 1, precio: 30000 }], base: "Nido Carbonara", proteina: "—", toppings: [] };
const P = [
  { ...base, id: "AAAA1111", consecutivo: 10, creadoEn: "2026-09-12T17:03:00.000Z", cliente: "Ñandú Pérez", telefono: "300 123 4567" },
  { ...base, id: "BBBB2222", consecutivo: 11, creadoEn: "2026-09-12T18:30:00.000Z", cliente: "Juan", metodoPago: "nequi", referencia: "ventanal; mesa 2" },
  { ...base, id: "CCCC3333", consecutivo: 12, creadoEn: "2026-09-12T19:00:00.000Z", pago: "pendiente", metodoPago: undefined, estado: "listo" },
  { ...base, id: "DDDD4444", consecutivo: 13, creadoEn: "2026-09-13T01:30:00.000Z", pago: "devuelto", estado: "cancelado", devolucion: { monto: 32400, motivo: "se cayó", fecha: "2026-09-13T02:00:00.000Z" } },
  { ...base, id: "EEEE5555", consecutivo: 15, creadoEn: "2026-09-11T16:00:00.000Z", estado: "cancelado", pago: "pendiente", metodoPago: undefined, motivoCancelacion: "cliente se fue" },
  { ...base, id: "FFFF6666", consecutivo: 15, creadoEn: "2026-09-11T15:00:00.000Z", metodoPago: "tarjeta", tipo: "domicilio", domicilio: 5000, total: 37400, direccion: "Cra 7 # 20-15", items: [{ nombre: "Churrasco", cantidad: 2, precio: 15000, detalle: "término medio" }] },
  { ...base, id: "GGGG7777", creadoEn: "2026-09-10T15:00:00.000Z", canal: "qr", notas: "sin cebolla; alérgico" },
];

console.log("\n═══ SITUACIÓN ═══");
eq("pagado", C.situacionDe(P[0]), "pagado");
eq("por pagar", C.situacionDe(P[2]), "pendiente");
eq("devuelto manda sobre cancelado", C.situacionDe(P[3]), "devuelto");
eq("anulado = cancelado sin cobrar", C.situacionDe(P[4]), "anulado");

console.log("\n═══ BÚSQUEDA ═══");
eq("normalizar quita tildes y mayúsculas", C.normalizar("Ñandú PÉREZ "), "nandu perez");
si("por cliente sin tilde", C.coincide(P[0], "nandu"));
si("por número exacto", C.coincide(P[1], "11"));
si("un número NO encuentra a los que lo contienen (#112 vs 12)", !C.coincide({ ...P[0], consecutivo: 112, telefono: undefined, id: "ZZZZ" }, "12"));
si("por número con almohadilla", C.coincide(P[1], "#11") && !C.coincide(P[0], "#11"));
si("por 'n° 11' y 'no. 11'", C.coincide(P[1], "N° 11") && C.coincide(P[1], "no. 11"));
si("por trozo de teléfono", C.coincide(P[0], "1234"));
si("con menos de 4 dígitos NO mira teléfono ni id: '1' no encuentra al #10 con teléfono 300 123…", !C.coincide(P[0], "1") && !C.coincide(P[1], "222"));
si("pero sí el número exacto corto", C.coincide({ ...P[0], consecutivo: 1 }, "1"));
si("por trozo de id (dígitos)", C.coincide(P[1], "2222"));
si("por id (texto)", C.coincide(P[0], "aaaa"));
si("por referencia", C.coincide(P[1], "ventanal"));
si("por dirección", C.coincide(P[5], "cra 7"));
si("por plato", C.coincide(P[5], "churrasco"));
si("por nota", C.coincide(P[6], "alergico"));
si("vacío coincide con todo", C.coincide(P[2], "   "));
eq("filtrar por situación", C.filtrarComprobantes(P, { situacion: "devuelto" }).map((p) => p.id), ["DDDD4444"]);
eq("filtrar por método", C.filtrarComprobantes(P, { metodo: "nequi" }).map((p) => p.id), ["BBBB2222"]);
eq("filtrar por tipo y canal", [C.filtrarComprobantes(P, { tipo: "domicilio" }).length, C.filtrarComprobantes(P, { canal: "qr" }).length], [1, 1]);
eq("'todos' no filtra", C.filtrarComprobantes(P, { situacion: "todos", metodo: "todos", tipo: "todos", canal: "todos" }).length, P.length);
eq("texto + situación se combinan (el de churrasco no dice nido)", C.filtrarComprobantes(P, { q: "nido", situacion: "pagado" }).length, 3);

console.log("\n═══ RESUMEN ═══");
const r = C.resumirComprobantes(P);
eq("cantidad", r.cantidad, 7);
eq("cobrado: 4 pagados (efectivo ×2, nequi, tarjeta)", [r.cobrado.n, r.cobrado.total], [4, 32400 * 3 + 37400]);
eq("por método, solo los que tienen algo, en el orden de METODOS", r.cobrado.porMetodo.map((m) => `${m.metodo}:${m.n}`), ["efectivo:2", "nequi:1", "tarjeta:1"]);
eq("pendiente: 1 (el anulado no cuenta como deuda)", [r.pendiente.n, r.pendiente.total], [1, 32400]);
eq("devuelto: 1 con su monto", [r.devuelto.n, r.devuelto.monto], [1, 32400]);
eq("anulados: 1", r.anulados, 1);
eq("ticket promedio sobre lo cobrado", r.ticketPromedio, Math.round((32400 * 3 + 37400) / 4));
eq("resumen de lista vacía no revienta", C.resumirComprobantes([]).cobrado.porMetodo, []);

console.log("\n═══ NUMERACIÓN ═══");
const h = C.huecosDeConsecutivo(P);
eq("falta el 14", h.faltan, [14]);
eq("el 15 está repetido", h.repetidos, [15]);
eq("uno sin número", h.sinNumero, 1);
eq("rango 10..15", [h.desde, h.hasta], [10, 15]);
eq("sin números: vacío", C.huecosDeConsecutivo([P[6]]), { faltan: [], saltos: [], repetidos: [], sinNumero: 1 });
eq("un salto grande no se enumera: se dice como salto", C.huecosDeConsecutivo([{ consecutivo: 1 }, { consecutivo: 2 }, { consecutivo: 500 }, { consecutivo: 501 }, { consecutivo: 503 }]), { faltan: [502], saltos: [[2, 500]], repetidos: [], sinNumero: 0, desde: 1, hasta: 503 });

console.log("\n═══ POR DÍA (hora de Pereira) ═══");
const dias = C.agruparPorDia(P);
eq("cuatro días, el más reciente primero", dias.map((d) => d.dia), ["2026-09-12", "2026-09-11", "2026-09-10"].length === 3 ? dias.map((d) => d.dia) : null);
eq("la 01:30Z del 13 es el 12 en Pereira: el 12 tiene 4", dias.find((d) => d.dia === "2026-09-12")?.pedidos.length, 4);
si("dentro del día, el más reciente primero", dias[0].pedidos[0].id === "DDDD4444");
eq("cada día trae su resumen", dias.find((d) => d.dia === "2026-09-11")?.resumen.anulados, 1);

console.log("\n═══ RANGOS ═══");
const AHORA = new Date("2026-09-12T20:00:00.000Z"); // sábado 12 sep, 15:00 Pereira
eq("hoy", C.rangoDe("hoy", AHORA), { desde: "2026-09-12", hasta: "2026-09-12" });
eq("ayer", C.rangoDe("ayer", AHORA), { desde: "2026-09-11", hasta: "2026-09-11" });
eq("semana arranca el lunes 7", C.rangoDe("semana", AHORA), { desde: "2026-09-07", hasta: "2026-09-12" });
eq("mes", C.rangoDe("mes", AHORA), { desde: "2026-09-01", hasta: "2026-09-12" });
eq("año", C.rangoDe("anio", AHORA), { desde: "2026-01-01", hasta: "2026-09-12" });
eq("a las 03:00Z ya es el 13 en UTC pero sigue siendo el 12 en Pereira", C.rangoDe("hoy", new Date("2026-09-13T03:00:00.000Z")), { desde: "2026-09-12", hasta: "2026-09-12" });
eq("rango libre", C.rangoDe("rango", AHORA, "2026-08-01", "2026-08-31"), { desde: "2026-08-01", hasta: "2026-08-31" });
eq("rango al revés se endereza", C.rangoDe("rango", AHORA, "2026-08-31", "2026-08-01"), { desde: "2026-08-01", hasta: "2026-08-31" });
eq("rango sin fin = un día", C.rangoDe("rango", AHORA, "2026-08-05"), { desde: "2026-08-05", hasta: "2026-08-05" });
eq("rango con basura = hoy", C.rangoDe("rango", AHORA, "ayer", "x"), { desde: "2026-09-12", hasta: "2026-09-12" });
eq("diaMas cruza mes y año", [C.diaMas("2026-08-31", 1), C.diaMas("2026-01-01", -1)], ["2026-09-01", "2025-12-31"]);
eq("diaLegible", C.diaLegible("2026-09-12").toLowerCase().includes("12"), true);
eq("horaLegible en Pereira", C.horaLegible("2026-09-12T17:03:00.000Z"), "12:03");
eq("fechaCorta en Pereira", C.fechaCorta("2026-09-13T01:30:00.000Z"), "12/09/2026");

console.log("\n═══ CSV PARA EXCEL ═══");
const csv = C.csvComprobantes(P);
const lineas = csv.split("\r\n");
si("empieza con BOM UTF-8", csv.charCodeAt(0) === 0xfeff);
eq("cabecera ascii en minúscula, con ; y 21 columnas", lineas[0].slice(1), C.COLUMNAS_CSV.join(";"));
si("sin tildes ni mayúsculas en la cabecera (tablas dinámicas)", /^[a-z_;]+$/.test(lineas[0].slice(1)));
eq("una fila por comprobante y NINGUNA fila de totales (rompe el pivot)", lineas.length, 1 + P.length);
si("el teléfono va solo en dígitos", lineas[1].includes(";3001234567;"));
si("un texto que empieza por = no puede ser fórmula", C.celdaCsv("=SUMA(A1)").startsWith("'=") && C.celdaCsv("-hola").startsWith("'-") && C.celdaCsv(-4800) === "-4800");
si("los números van sin $ ni puntos de miles", /;32400;30000;0;2400;0;/.test(lineas[1]));
si("las tildes sobreviven", lineas[1].includes("Ñandú Pérez"));
si("el punto y coma dentro de un texto va entre comillas", lineas.some((l) => l.includes('"ventanal; mesa 2"')));
si("el devuelto lleva motivo, monto y fecha", lineas.some((l) => /Dinero devuelto;.*;se cayó;32400;12\/09\/2026/.test(l)));
si("el detalle junta los platos con cantidad y detalle", lineas.some((l) => l.includes("2x Churrasco (término medio)")));
si("ninguna celda dice 'factura'", !/factura/i.test(csv));
eq("nombre del archivo", [C.nombreCsv({ desde: "2026-09-01", hasta: "2026-09-30" }), C.nombreCsv({ desde: "2026-09-12", hasta: "2026-09-12" })], ["comprobantes-2026-09-01_2026-09-30.csv", "comprobantes-2026-09-12.csv"]);

console.log("\n═══ FILTROS DESDE LA URL ═══");
eq("sin nada: hoy, sin filtros, página 1", C.leerFiltros({}), { p: "hoy", desde: undefined, hasta: undefined, q: "", s: "todos", m: "todos", t: "todos", c: "todos", pag: 1 });
eq("con búsqueda y sin atajo: se busca en TODO", C.leerFiltros({ q: " 12 " }).p, "todo");
eq("con búsqueda y atajo explícito, se respeta", C.leerFiltros({ q: "12", p: "hoy" }).p, "hoy");
eq("desde/hasta implican rango", C.leerFiltros({ desde: "2026-08-01", hasta: "2026-08-31" }), { p: "rango", desde: "2026-08-01", hasta: "2026-08-31", q: "", s: "todos", m: "todos", t: "todos", c: "todos", pag: 1 });
eq("fechas basura se ignoran y el rango cae a hoy", C.leerFiltros({ desde: "ayer" }).p, "hoy");
eq("valores inválidos caen al defecto", C.leerFiltros({ p: "siempre", s: "roto", m: "bitcoin", t: "avion", c: "fax", pag: "-3" }), { p: "hoy", desde: undefined, hasta: undefined, q: "", s: "todos", m: "todos", t: "todos", c: "todos", pag: 1 });
eq("valores válidos se conservan", C.leerFiltros({ p: "mes", s: "devuelto", m: "nequi", t: "domicilio", c: "qr", pag: "3" }), { p: "mes", desde: undefined, hasta: undefined, q: "", s: "devuelto", m: "nequi", t: "domicilio", c: "qr", pag: 3 });
eq("arrays (param repetido) toman el primero", C.leerFiltros({ q: ["ana", "otro"] }).q, "ana");
eq("la búsqueda se recorta a 80 caracteres", C.leerFiltros({ q: "x".repeat(200) }).q.length, 80);
eq("rangoDe('todo') arranca en el día cero", C.rangoDe("todo", AHORA), { desde: "2000-01-01", hasta: "2026-09-12" });
eq("mes=2026-08 se expande al mes entero", C.leerFiltros({ mes: "2026-08" }), { p: "rango", desde: "2026-08-01", hasta: "2026-08-31", q: "", s: "todos", m: "todos", t: "todos", c: "todos", pag: 1 });
eq("mes de febrero bisiesto y de diciembre", [C.rangoDelMes("2028-02").hasta, C.rangoDelMes("2026-12").hasta], ["2028-02-29", "2026-12-31"]);
eq("mes inválido se ignora", C.leerFiltros({ mes: "2026-13" }).p, "hoy");
eq("mesDe reconoce un mes entero y solo eso", [C.mesDe({ desde: "2026-08-01", hasta: "2026-08-31" }), C.mesDe({ desde: "2026-08-01", hasta: "2026-08-30" })], ["2026-08", ""]);
eq("mesesDisponibles: cerebro + archivo, del más reciente al más viejo, con etiqueta", C.mesesDisponibles(P, ["2026-05"]).map((m) => `${m.valor}=${m.etiqueta}`), ["2026-09=Septiembre de 2026", "2026-05=Mayo de 2026"]);

console.log("\n═══ LA URL DE UNA VISTA ═══");
const f0 = C.leerFiltros({});
eq("la vista por defecto es la ruta pelada", C.queryDe(f0), "/admin/comprobantes");
eq("solo lo que difiere del defecto", C.queryDe(f0, { p: "mes", m: "nequi" }), "/admin/comprobantes?p=mes&m=nequi");
eq("buscar en todo no escribe p (es el defecto con q)", C.queryDe(f0, { q: "ana", p: "todo" }), "/admin/comprobantes?q=ana");
eq("buscar en hoy sí lo escribe", C.queryDe(f0, { q: "ana", p: "hoy" }), "/admin/comprobantes?q=ana&p=hoy");
eq("rango libre escribe las fechas", C.queryDe(f0, { p: "rango", desde: "2026-08-01", hasta: "2026-08-31" }), "/admin/comprobantes?p=rango&desde=2026-08-01&hasta=2026-08-31");
eq("cambiar de página conserva el resto", C.queryDe(C.leerFiltros({ p: "mes", s: "pagado" }), { pag: 2 }), "/admin/comprobantes?p=mes&s=pagado&pag=2");
eq("cambiar un filtro vuelve a la página 1", C.queryDe(C.leerFiltros({ p: "mes", pag: "4" }), { s: "pagado" }), "/admin/comprobantes?p=mes&s=pagado");
si("ida y vuelta: leerFiltros(queryDe(f)) === f", JSON.stringify(C.leerFiltros(Object.fromEntries(new URL("http://x" + C.queryDe(C.leerFiltros({ p: "rango", desde: "2026-08-01", hasta: "2026-08-31", q: "nequi", s: "pagado", m: "nequi", t: "mesa", c: "salon", pag: "2" }))).searchParams))) === JSON.stringify(C.leerFiltros({ p: "rango", desde: "2026-08-01", hasta: "2026-08-31", q: "nequi", s: "pagado", m: "nequi", t: "mesa", c: "salon", pag: "2" })));
eq("hayFiltros", [C.hayFiltros(f0), C.hayFiltros(C.leerFiltros({ m: "nequi" })), C.hayFiltros(C.leerFiltros({ p: "mes" }))], [false, true, false]);

console.log("\n═══ PAGINACIÓN ═══");
const cien = Array.from({ length: 120 }, (_, i) => i + 1);
eq("100 por página: 2 páginas", C.paginar(cien, 1).paginas, 2);
eq("la página 2 trae del 101 al 120", [C.paginar(cien, 2).items[0], C.paginar(cien, 2).items.at(-1), C.paginar(cien, 2).desde, C.paginar(cien, 2).hasta], [101, 120, 101, 120]);
eq("página fuera de rango se recorta a la última", C.paginar(cien, 9).pag, 2);
eq("página 0 o negativa es la primera", [C.paginar(cien, 0).pag, C.paginar(cien, -2).pag], [1, 1]);
eq("lista vacía: 1 página, 0 de 0", C.paginar([], 1), { items: [], pag: 1, paginas: 1, total: 0, desde: 0, hasta: 0 });
eq("resumenLineas: dos y el resto", C.resumenLineas({ ...base, items: [{ nombre: "Nido", cantidad: 1, precio: 1 }, { nombre: "Churrasco", cantidad: 2, precio: 1 }, { nombre: "Limonada", cantidad: 1, precio: 1 }] }), "Nido, 2× Churrasco y 1 más");
eq("resumenLineas: uno solo", C.resumenLineas(P[0]), "Nido Carbonara");

console.log("\n═══ EL TEXTO PARA WHATSAPP ═══");
const t = C.textoComprobante(P[0], { negocio: "Papaghetti", impuestoPct: 8 });
si("arranca con el negocio en negrita, y luego el título y el número", t.startsWith("*Papaghetti*\n\n*COMPROBANTE DE CONSUMO* · N° 10\nFecha: 12/09/2026 · 12:03"));
si("lleva la línea del plato con su importe", t.includes("Nido Carbonara   $30.000"));
si("impuesto con porcentaje y TOTAL en negrita", t.includes("Impuesto (8%): $2.400") && t.includes("*TOTAL: $32.400*"));
si("pago con el método", t.includes("Pago: Efectivo"));
si("y el aviso de que NO es factura", t.includes("No es factura electrónica de venta"));
si("un devuelto lo grita arriba, con su motivo, y el pago dice DEVUELTO como el papel", C.textoComprobante(P[3]).startsWith("*** DINERO DEVUELTO ***\nSe devolvieron $32.400 — se cayó. Este pedido ya no es un consumo.") && C.textoComprobante(P[3]).includes("Pago: DEVUELTO"));
si("un anulado también", C.textoComprobante(P[4]).includes("*** PEDIDO ANULADO") && C.textoComprobante(P[4]).includes("Este pedido se canceló: cliente se fue."));
si("sin ajustes: Papaghetti e 'Impuesto' a secas", C.textoComprobante(P[0]).includes("*Papaghetti*") && C.textoComprobante(P[0]).includes("Impuesto: $2.400"));
eq("telefonoWa: 10 dígitos → 57", [C.telefonoWa("300 123 4567"), C.telefonoWa("+57 300 123 4567"), C.telefonoWa("6063334455")], ["573001234567", "573001234567", "576063334455"]);
si("waComprobanteHref con teléfono", C.waComprobanteHref(P[0]).startsWith("https://wa.me/573001234567?text=*Papaghetti*%0A%0A*COMPROBANTE%20DE%20CONSUMO*"));
eq("y null sin teléfono", C.waComprobanteHref(P[1]), null);

console.log("\n═══ F3 · EL PAPEL, UNA SOLA VEZ (lib/papel.ts) ═══");
const Pa = await import("./lib/papel.ts");
const LEGAL = "Documento interno de control. No es factura electrónica de venta ni documento equivalente P.O.S.";
const m0 = Pa.papelDe(P[0]);
eq("sin config: el papel de hoy (título, nota legal, cierre, sin extras, logo de la casa)",
  [m0.titulo, m0.pie.legal, m0.pie.cierre, m0.pie.extra, m0.cabecera.logo, m0.cabecera.logoPropio, m0.cabecera.nombre],
  ["COMPROBANTE DE CONSUMO", LEGAL, "¡Gracias por venir!", [], "/logo-papaghetti-bn.png", false, "Papaghetti"]);
eq("las constantes son las de siempre (una sola redacción de la nota legal)", [Pa.TITULO, Pa.AVISO_LEGAL, Pa.CIERRE_POR_DEFECTO], ["COMPROBANTE DE CONSUMO", LEGAL, "¡Gracias por venir!"]);
eq("datos del cliente de fábrica = el papel de hoy: cliente, ubicación y nota sí; teléfono y dirección no",
  Pa.comprobanteDe({}).datosCliente, { cliente: true, ubicacion: true, telefono: false, direccion: false, notas: true });
eq("sin config, P[0] muestra el cliente y NO su teléfono", m0.cliente, [{ k: "Cliente", v: "Ñandú Pérez" }]);
eq("ubicación antes que el cliente, como hoy", Pa.papelDe(P[1]).cliente.map((d) => d.k), ["Ubicación", "Cliente"]);
eq("la nota de cocina sale de fábrica", Pa.papelDe(P[6]).nota, "sin cebolla; alérgico");
/* El papel de HOY, letra por letra (dorado): sin ajustes del dueño, con los datos de
   siempre. Si esto cambia sin querer, todos los comprobantes cambian. */
const DORADO = [
  "*Papaghetti*",
  "Papaghetti S.A.S.",
  "NIT 901.234.567-8",
  "Cra 7 # 20-15, Pereira",
  "Tel. 606 333 4455",
  "",
  "*COMPROBANTE DE CONSUMO* · N° 11",
  "Fecha: 12/09/2026 · 13:30",
  "Servicio: En el local",
  "Ubicación: ventanal; mesa 2",
  "Cliente: Juan",
  "",
  "Nido Carbonara   $30.000",
  "",
  "Consumo: $30.000",
  "Impuesto (8%): $2.400",
  "*TOTAL: $32.400*",
  "Pago: Nequi",
  "",
  LEGAL,
  "¡Gracias por venir!",
].join("\n");
const AJ0 = { negocio: "Papaghetti", razonSocial: "Papaghetti S.A.S.", nit: "901.234.567-8", direccion: "Cra 7 # 20-15, Pereira", telefonoLocal: "6063334455", impuestoPct: 8 };
eq("dorado: el WhatsApp de un pedido de mesa sin configurar", C.textoComprobante(P[1], AJ0), DORADO);

console.log("\n═══ F3 · LO QUE EL DUEÑO CONFIGURA ═══");
const A = {
  negocio: "Papaghetti", razonSocial: "Enredos de Pereira S.A.S.", nit: "NIT 901.234.567-8", direccion: "Calle 19 # 8-32, Pereira",
  whatsapp: "573001112233", impuestoPct: 8,
  comprobante: {
    mensajeCierre: "  ¡Vuelve\tpronto,\n enredado!  ",
    lineasPie: ["Wi-Fi: Papaghetti · Clave: pasta2026", "   ", "Síguenos en @papaghetti.pereira", "Domicilios 300 000 0000", "una cuarta que NO sale"],
    datosCliente: { telefono: true, direccion: true },
  },
};
const m5 = Pa.papelDe(P[5], A);
eq("cierre propio, limpio (sin tabuladores, saltos ni espacios de más)", m5.pie.cierre, "¡Vuelve pronto, enredado!");
eq("máximo 3 líneas extra, sin vacías y en su orden", m5.pie.extra, ["Wi-Fi: Papaghetti · Clave: pasta2026", "Síguenos en @papaghetti.pereira", "Domicilios 300 000 0000"]);
eq("un cierre en blanco vuelve al de fábrica", Pa.papelDe(P[0], { comprobante: { mensajeCierre: "   " } }).pie.cierre, "¡Gracias por venir!");
eq("el NIT no sale dos veces aunque lo hayan escrito con 'NIT' delante", m5.cabecera.datos[1], "NIT 901.234.567-8");
eq("la dirección del domicilio sale si se enciende, y el teléfono también, escrito para leerse",
  Pa.papelDe({ ...P[5], telefono: "3001234567" }, A).cliente, [{ k: "Teléfono", v: "300 123 4567" }, { k: "Dirección", v: "Cra 7 # 20-15" }]);
si("…y la dirección solo en domicilio: un pedido de mesa no la imprime", !Pa.papelDe({ ...P[0], direccion: "Cra 1" }, A).cliente.some((d) => d.k === "Dirección"));
si("…y oculta si se apaga", !Pa.papelDe(P[5], { ...A, comprobante: { ...A.comprobante, datosCliente: { direccion: false } } }).cliente.some((d) => d.k === "Dirección"));
const sinNadie = Pa.papelDe({ ...P[1], notas: "sin sal", telefono: "300 123 4567" }, { comprobante: { datosCliente: { cliente: false, ubicacion: false, notas: false, telefono: false } } });
eq("todo el cliente apagado: ni nombre, ni ubicación, ni teléfono, ni nota", [sinNadie.cliente, sinNadie.nota], [[], undefined]);
const tA = C.textoComprobante(P[0], { ...A, comprobante: { ...A.comprobante, datosCliente: { cliente: false } } });
si("cliente oculto: ni su nombre ni su teléfono en el WhatsApp", !tA.includes("Ñandú Pérez") && !tA.includes("300 123 4567"));
eq("datos del negocio en el papel", m5.cabecera.datos, ["Enredos de Pereira S.A.S.", "NIT 901.234.567-8", "Calle 19 # 8-32, Pereira"]);

console.log("\n═══ F3 · EL NÚMERO DE EJEMPLO NUNCA SALE ═══");
si("con el WhatsApp de ejemplo y sin teléfono del local: sin 'Tel.'", !Pa.piezasPapel(m5).some((s) => /573001112233|300 111 2233|Tel\./.test(s)));
si("ni escrito sin el 57", Pa.telefonoNegocio({ whatsapp: "3001112233" }) === "" && Pa.telefonoNegocio({ telefonoLocal: "300 111 2233" }) === "");
eq("un WhatsApp real sale escrito para leerse", Pa.telefonoNegocio({ whatsapp: "573104445566" }), "310 444 5566");
eq("el teléfono del local manda sobre el WhatsApp", Pa.telefonoNegocio({ telefonoLocal: "6063334455", whatsapp: "573104445566" }), "606 333 4455");
eq("un teléfono con extensión queda como se escribió", Pa.telefonoNegocio({ telefonoLocal: "606 333 4455 ext. 12" }), "606 333 4455 ext. 12");
si("el WhatsApp de ejemplo tampoco sale en el texto de la caja", !C.textoComprobante(P[0], { whatsapp: "573001112233" }).includes("Tel."));

console.log("\n═══ F3 · LO FIJO NO SE CAMBIA DESDE EL JSON ═══");
const tocado = Pa.papelDe(P[0], { comprobante: { titulo: "FACTURA DE VENTA", legal: "", aviso: "x", pie: { legal: "" } } });
eq("título y aviso legal, intactos aunque el JSON traiga otros", [tocado.titulo, tocado.pie.legal], ["COMPROBANTE DE CONSUMO", LEGAL]);
const roto = Pa.papelDe(P[0], { comprobante: { lineasPie: "no es una lista", datosCliente: null, mensajeCierre: 42, logo: "javascript:alert(1)" } });
eq("un JSON tocado a mano no revienta: valores de fábrica donde no cuadra", [roto.pie.extra, roto.pie.cierre, roto.cabecera.logo, roto.cliente.length], [[], "42", "/logo-papaghetti-bn.png", 1]);
eq("un logo que no es PNG en data URL no se dibuja", Pa.comprobanteDe({ comprobante: { logo: "https://otro.com/logo.png" } }).logoPropio, false);
eq("textos con topes: 60 en el cierre, 64 por línea", [Pa.comprobanteDe({ comprobante: { mensajeCierre: "x".repeat(200) } }).mensajeCierre.length, Pa.comprobanteDe({ comprobante: { lineasPie: ["y".repeat(200)] } }).lineasPie[0].length], [60, 64]);
eq("los emojis se quitan del papel (la térmica no los tiene); ©® se quedan", [Pa.textoPapel("¡Vuelve pronto! 🍝"), Pa.textoPapel("❤️ Hecho con amor ❤️"), Pa.textoPapel("Papaghetti® ©2026")], ["¡Vuelve pronto!", "Hecho con amor", "Papaghetti® ©2026"]);

console.log("\n═══ F3 · LAS SALIDAS DICEN LO MISMO (WhatsApp = papel) ═══");
for (const [nombre, p, a] of [["mesa sin config", P[1], {}], ["domicilio configurado", P[5], A], ["devuelto", P[3], A], ["anulado", P[4], A], ["con nota", P[6], AJ0]]) {
  const papel = Pa.papelDe(p, a);
  const txt = C.textoComprobante(p, a);
  eq(`WhatsApp = papel · ${nombre}`, Pa.piezasPapel(papel).filter((s) => !txt.includes(s)), []);
}
const t5 = C.textoComprobante(P[5], A);
si("el cierre propio reemplaza al de fábrica", t5.includes("¡Vuelve pronto, enredado!") && !t5.includes("¡Gracias por venir!"));
si("las líneas extra, en orden, entre la nota legal y el cierre", t5.indexOf(LEGAL) < t5.indexOf("Wi-Fi:") && t5.indexOf("Wi-Fi:") < t5.indexOf("Síguenos") && t5.indexOf("Domicilios 300") < t5.indexOf("¡Vuelve pronto"));
si("la cuarta línea no sale", !t5.includes("una cuarta"));
si("hay líneas en blanco de verdad, y nunca dos seguidas", t5.includes("\n\n") && !t5.includes("\n\n\n") && !t5.startsWith("\n") && !t5.endsWith("\n"));
si("ninguna línea con espacios sueltos al final", t5.split("\n").every((l) => l === l.trimEnd()));
eq("el enlace lleva exactamente ese texto", decodeURIComponent(C.waComprobanteHref(P[0], A).split("text=")[1]), C.textoComprobante(P[0], A));
si("la caja sin ajustes arma el papel completo (título y nota legal)", C.textoComprobante(P[0]).includes("COMPROBANTE DE CONSUMO") && C.textoComprobante(P[0]).includes(LEGAL));
si("ajustesPapelDe deja el logo fuera de la caja y lo trae donde se dibuja", (() => {
  const aj = { ...AJ0, whatsapp: "", horarios: "", numMesas: 0, propinaSugeridaPct: 0, abierto: true, instagram: "", costoDomicilio: 0, pedidoMinimo: 0, promos: [], usuarios: ["Ana"], comprobante: { logo: "data:image/png;base64,AAAA", mensajeCierre: "Hola" } };
  const sin = Pa.ajustesPapelDe(aj), con = Pa.ajustesPapelDe(aj, true);
  return sin.comprobante.logo === undefined && sin.comprobante.mensajeCierre === "Hola" && con.comprobante.logo === "data:image/png;base64,AAAA" && !("usuarios" in con) && !("promos" in con) && aj.comprobante.logo === "data:image/png;base64,AAAA";
})());

console.log("\n═══ F3 · EL FORMULARIO DE AJUSTES (validación del servidor) ═══");
const fd = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [].concat(v)) f.append(k, x); return f; };
const base3 = { negocio: "Papaghetti", razonSocial: "", nit: "", direccion: "Calle 19 # 8-32", telefonoLocal: "", mensajeCierre: "", lineaPie: ["", "", ""] };
const F = (o = {}) => Pa.validarComprobante(Pa.formularioComprobante(fd({ ...base3, ...o })));
const ok3 = F({ nit: "NIT: 901.234.567-8", mensajeCierre: " ¡Vuelve\tpronto! ", lineaPie: ["Wi-Fi: x", "  ", "IG @p"], dc_cliente: "0", dc_telefono: "1" });
eq("acepta, limpia y deja el NIT sin 'NIT'", ok3.ok && [ok3.datos.nit, ok3.comprobante.mensajeCierre, ok3.comprobante.lineasPie], ["901.234.567-8", "¡Vuelve pronto!", ["Wi-Fi: x", "IG @p"]]);
eq("los datos del cliente llegan como 1/0, y lo que no llega queda de fábrica", ok3.comprobante.datosCliente, { cliente: false, ubicacion: true, telefono: true, direccion: false, notas: true });
si("sin el logo: tiene sus propias acciones", !("logo" in ok3.comprobante));
const rechazos = [
  ["nombre vacío", F({ negocio: "   " }), "nombre comercial"],
  ["factura en el cierre", F({ mensajeCierre: "Gracias por su factura" }), "documentos de la DIAN"],
  ["FACTURA ELECTRÓNICA en una línea", F({ lineaPie: ["FACTURA ELECTRÓNICA No. 1", "", ""] }), "línea 1"],
  ["CUFE", F({ lineaPie: ["", "CUFE: 1234", ""] }), "línea 2"],
  ["documento equivalente", F({ razonSocial: "Documento equivalente S.A.S." }), "razón social"],
  ["resolución DIAN", F({ lineaPie: ["", "", "Resolución DIAN 1876"] }), "línea 3"],
  ["propina", F({ mensajeCierre: "La propina es voluntaria" }), "propina"],
  ["NIT con letras", F({ nit: "novecientos" }), "NIT"],
  ["teléfono corto", F({ telefonoLocal: "123" }), "7 números"],
  ["el número de ejemplo como teléfono del local", F({ telefonoLocal: "300 111 2233" }), "ejemplo"],
];
for (const [n, r, frag] of rechazos) si(`rechaza: ${n}`, !r.ok && r.error.includes(frag), r.ok ? "lo aceptó" : r.error);
si("…pero no por una razón social honrada que contiene esas letras (Manufacturas Escudero)", F({ razonSocial: "Manufacturas Escudero S.A.S." }).ok);
si("ningún mensaje de error usa la palabra 'factura'", rechazos.every(([, r]) => !/factura/i.test(r.error ?? "")));
const conEmoji = F({ mensajeCierre: "¡Vuelve pronto! 🍝" });
si("un emoji se guarda, pero se avisa que no se imprime", conEmoji.ok && conEmoji.avisos.some((x) => /emojis no se imprimen/.test(x)));
eq("los topes de largo también los pone el servidor", (() => { const r = F({ negocio: "N".repeat(300), lineaPie: ["L".repeat(300), "", ""] }); return r.ok && [r.datos.negocio.length, r.comprobante.lineasPie[0].length]; })(), [60, 64]);
eq("más de 3 líneas al pie (una petición a mano): solo 3", (() => { const r = F({ lineaPie: ["a", "b", "c", "d"] }); return r.ok && r.comprobante.lineasPie; })(), ["a", "b", "c"]);

console.log("\n═══ F3 · EL LOGO QUE LLEGA AL SERVIDOR ═══");
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// Un PNG de 16×16 de verdad (la cabecera dice el tamaño).
const png16 = (() => {
  const cab = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 16, 0, 0, 0, 16, 8, 6, 0, 0, 0, 0, 0, 0, 0];
  return "data:image/png;base64," + Buffer.from(cab).toString("base64");
})();
const lv = Pa.logoPngValido(png16);
eq("un PNG de verdad pasa, con su tamaño", lv.ok && [lv.ancho, lv.alto], [16, 16]);
const rechLogo = [
  ["vacío", ""],
  ["un JPEG", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ"],
  ["una URL", "https://otro.com/logo.png"],
  ["un PNG falso (otros bytes con la etiqueta de PNG)", "data:image/png;base64," + Buffer.from("GIF89a no soy un png, lo juro de verdad").toString("base64")],
  ["demasiado pesado", png16 + "A".repeat(Pa.LOGO_MAX_CARACTERES)],
  ["de 1×1 (no es un logo)", PNG1],
  ["con algo raro pegado", png16 + "\"><script>"],
];
for (const [n, v] of rechLogo) { const r = Pa.logoPngValido(v); si(`rechaza el logo: ${n}`, !r.ok, r.ok ? "lo aceptó" : r.error); }

console.log("\n═══ F3 · EL PEDIDO DE MUESTRA (vista previa de Ajustes) ═══");
const mu = Pa.pedidoDeMuestra("domicilio", 8);
const cMu = Pa.papelDe(mu, { comprobante: { datosCliente: { telefono: true, direccion: true } } });
eq("cuadra: total = bruto + domicilio, y el impuesto va dentro", [mu.total, mu.bruto + mu.domicilio, cMu.cuenta.total, mu.subtotal + mu.impuesto === mu.bruto], [55000, 55000, 55000, true]);
eq("trae todo lo que el papel puede mostrar", cMu.cliente.map((d) => d.k), ["Cliente", "Teléfono", "Dirección"]);
eq("y el de mesa, su ubicación", Pa.papelDe(Pa.pedidoDeMuestra("local", 8)).cliente.map((d) => d.k), ["Ubicación", "Cliente"]);

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
