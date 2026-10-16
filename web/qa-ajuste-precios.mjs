/**
 * SUBIR O BAJAR LOS PRECIOS DE UNA VEZ: la cuenta, la vista previa y el guardado.
 *
 *   node --import ./qa-ts.mjs qa-ajuste-precios.mjs
 *
 * La primera mitad es pura (lib/precios.ts: redondeo, grupos, plan, avisos, firma). La
 * segunda escribe en data/catalog.json —el cerebro LOCAL— a través de lib/catalog.ts, y lo
 * deja como estaba al final, pase lo que pase. qa-ts.mjs se niega a correr si el almacén
 * de producción está a la vista.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "catalog.json");
const RESPALDO = FILE + ".qa-ajuste-precios";
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
const rechaza = async (n, fn, frag) => {
  try {
    await fn();
    si(n, false, "no lanzó");
  } catch (e) {
    const m = String(e?.message ?? e);
    si(n, !frag || m.toLowerCase().includes(frag.toLowerCase()), m);
  }
};
const TODOS = ["bases", "proteinas", "acompanantes", "platos", "adicionales"];

try {
  const precios = await import("./lib/precios.ts");
  const menu = await import("./lib/menu.ts");
  const pa = precios.precioAjustado;

  console.log("\n═══ EL REDONDEO, SIN COMA FLOTANTE ═══");
  eq("$3.000 + 15 % = $3.500 (en coma flotante salía $3.400)", pa(3000, 15), 3500);
  eq("$5.000 + 13 % = $5.700 (en coma flotante salía $5.600)", pa(5000, 13), 5700);
  eq("$15.900 + 8 % = $17.200", pa(15900, 8), 17200);
  eq("$15.900 − 10 % = $14.300", pa(15900, -10), 14300);
  eq("un decimal: $10.000 + 8,5 % = $10.900", pa(10000, 8.5), 10900);
  eq("$0 se queda en $0, suba o baje", [pa(0, 15), pa(0, -50)], [0, 0]);
  eq("con valor, nunca por debajo de $100", [pa(50, 8), pa(150, -50), pa(100, -40)], [100, 100, 100]);
  eq("0 % no mueve nada (ni siquiera redondea)", pa(15950, 0), 15950);
  eq("con cualquier porcentaje, el resultado es múltiplo de $100", pa(15950, 0.1), 16000);
  {
    // La cuenta exacta, con enteros grandes: redondeo a la centena más cercana (los medios hacia arriba).
    let casos = 0;
    const malos = [];
    for (let p = 50; p <= 60000; p += 50) {
      for (let d = -500; d <= 500; d++) {
        if (d === 0) continue;
        casos++;
        const exacto = Number((BigInt(p) * BigInt(1000 + d) + 50000n) / 100000n) * 100;
        const esperado = Math.max(100, exacto);
        const dio = pa(p, d / 10);
        if (dio !== esperado && malos.length < 3) malos.push(`${p} ${d / 10}% → ${dio} (≠ ${esperado})`);
      }
    }
    eq(`${casos.toLocaleString("es-CO")} combinaciones de precio y porcentaje (−50 % a +50 %, de a 0,1) cuadran con la cuenta exacta`, malos, []);
  }

  console.log("\n═══ LOS GRUPOS Y EL PORCENTAJE ═══");
  eq("cinco grupos, en el orden de la carta", precios.GRUPOS_AJUSTE.map((g) => g.id), TODOS);
  eq("cada uno con su etiqueta", precios.GRUPOS_AJUSTE.map((g) => g.etiqueta), ["Bases", "Proteínas", "Acompañantes", "Platos", "Adicionales"]);
  eq(
    "lista blanca: las salsas, __proto__ o basura no son grupos",
    ["salsas", "__proto__", "toString", "", null, "Bases", 3].map(precios.esGrupoAjuste),
    [false, false, false, false, false, false, false],
  );
  eq(
    "el porcentaje como lo escribe la gente",
    ["8", "8,5", " 8.5 % ", "12.", ".5", "8,55", "abc", "-5", "", null, "1e3"].map((x) => {
      const v = precios.leerPct(x);
      return Number.isNaN(v) ? "NaN" : v;
    }),
    [8, 8.5, 8.5, 12, 0.5, 8.6, "NaN", "NaN", "NaN", "NaN", "NaN"],
  );
  eq("el tope de un adicional es el de la caja", precios.TOPE_ADICIONAL, 5_000_000);

  // Una carta de prueba: dos combos que hoy cuadran exacto con sus piezas.
  const L = {
    bases: [
      { id: "spa", nombre: "Spaghetti", precio: 15900, activo: true },
      { id: "cri", nombre: "Papa criolla", precio: 16900, activo: true },
      { id: "vie", nombre: "Base de temporada", precio: 12000, activo: false },
    ],
    proteinas: [
      { id: "car", nombre: "Carne molida", precio: 8000, activo: true },
      { id: "nug", nombre: "Nugget", precio: 9500, activo: true },
    ],
    toppings: [
      { id: "sal", nombre: "Salsa de la casa", precio: 0, categoria: "salsa", activo: true },
      { id: "salp", nombre: "Salsa con precio", precio: 2000, categoria: "salsa", activo: true },
      { id: "par", nombre: "Parmesano", precio: 4500, categoria: "topping", activo: true },
      { id: "toc", nombre: "Tocineta", precio: 5000, categoria: "topping", activo: true },
      { id: "agu", nombre: "Agua de la casa", precio: 0, categoria: "topping", activo: true },
    ],
    enredos: [
      { id: "cla", nombre: "Clásico", precio: 28400, baseId: "spa", proteinaId: "car", toppingIds: ["sal", "par"], gancho: "El de siempre" },
      { id: "cro", nombre: "Crocante", precio: 31400, baseId: "cri", proteinaId: "nug", toppingIds: ["toc"], gancho: "Crujiente por $31.400", activo: true },
      { id: "ens", nombre: "Ensalada", precio: 35100, baseId: "", proteinaId: "", toppingIds: [], gancho: "" },
    ],
    adicionales: [
      { id: "ad-lim", nombre: "Limonada", precio: 9000 },
      { id: "ad-evt", nombre: "Evento", precio: 4_800_000 },
    ],
    promos: [
      { id: "p1", texto: "Combo estudiante desde $24.900", activo: false },
      { id: "p2", texto: "2x1 los martes", activo: true },
    ],
    cuentasAbiertas: 3,
  };

  console.log("\n═══ EL PLAN ═══");
  {
    const plan = precios.planAjuste(L, 8, TODOS);
    const ids = plan.cambios.map((c) => c.id);
    eq(
      "cambian los de los grupos elegidos, en el orden de la carta",
      ids,
      ["spa", "cri", "vie", "car", "nug", "par", "toc", "cla", "cro", "ens", "ad-lim"],
    );
    si("las salsas no se tocan nunca, ni la que tiene precio", !ids.includes("sal") && !ids.includes("salp") && !plan.sinCambio.some((x) => x.id.startsWith("sal")));
    const agua = plan.sinCambio.find((x) => x.id === "agu");
    eq("un precio en $0 se queda igual, y se dice por qué", [agua?.precio, agua?.porque], [0, "está en $0"]);
    eq("lo de fuera de la carta también se ajusta, marcado", plan.cambios.find((c) => c.id === "vie"), {
      grupo: "bases", id: "vie", nombre: "Base de temporada", fueraDeCarta: true, antes: 12000, despues: 13000,
    });
    eq("un adicional que pasaría el tope se queda como está", plan.sinCambio.find((x) => x.id === "ad-evt")?.porque, "pasaría el tope de un adicional");
    si("…y se avisa", plan.avisos.some((a) => a.tipo === "tope" && a.texto.includes("Evento")));
    eq("cada cambio dice antes y después", plan.cambios.find((c) => c.id === "ad-lim"), {
      grupo: "adicionales", id: "ad-lim", nombre: "Limonada", antes: 9000, despues: 9700,
    });
    // Crocante: piezas 18.300 + 10.300 + 5.400 = 34.000 y combo 33.900 → el redondeo regala $100.
    si(
      "el redondeo parejo hace aparecer un «Ahorras $100» en la portada",
      plan.avisos.some((a) => a.tipo === "ahorro" && a.texto === "«Crocante» va a decir «Ahorras $100» en la portada."),
      JSON.stringify(plan.avisos),
    );
    si("el Clásico sigue cuadrado: sin aviso", !plan.avisos.some((a) => a.texto.includes("Clásico")));
    si("promo con un precio escrito a mano (y apagada)", plan.avisos.some((a) => a.tipo === "texto" && a.texto.includes("Combo estudiante") && a.texto.includes("(apagada)")));
    si("la que no tiene precio escrito, no", !plan.avisos.some((a) => a.texto.includes("2x1")));
    si("descripción de un plato con un precio escrito", plan.avisos.some((a) => a.tipo === "texto" && a.texto.includes("«Crocante»")));
    eq(
      "y las cuentas abiertas conservan sus precios (va de último)",
      plan.avisos.at(-1),
      { tipo: "cuentas", texto: "Las 3 cuentas abiertas conservan sus precios: lo nuevo aplica desde el próximo pedido." },
    );
    eq("una sola cuenta, en singular", precios.planAjuste({ ...L, cuentasAbiertas: 1 }, 8, ["bases"]).avisos.at(-1).texto, "La cuenta abierta conserva sus precios: lo nuevo aplica desde el próximo pedido.");
  }
  {
    const piezas = precios.planAjuste(L, 10, ["bases", "proteinas", "acompanantes"]);
    si("subir las piezas y no los combos: el combo pasa a decir «Ahorras»", piezas.avisos.some((a) => a.texto === "«Clásico» va a decir «Ahorras $2.900» en la portada."), JSON.stringify(piezas.avisos));
    const combos = precios.planAjuste(L, 10, ["platos"]);
    si("subir solo los combos: el combo queda más caro que armarlo", combos.avisos.some((a) => a.texto === "«Clásico» queda $2.800 más caro que armarlo por partes."), JSON.stringify(combos.avisos));
    const conAhorro = { ...L, enredos: [{ ...L.enredos[0], precio: 27000 }] }; // hoy: «Ahorras $1.400»
    si(
      "un ahorro que ya estaba cambia de cifra",
      precios.planAjuste(conAhorro, 10, ["bases", "proteinas", "acompanantes"]).avisos.some((a) => a.texto === "«Clásico»: el «Ahorras» de la portada pasa de $1.400 a $4.300."),
    );
    si(
      "…o se vuelve más caro que armarlo, y se dice lo que decía",
      precios.planAjuste(conAhorro, 10, ["platos"]).avisos.some((a) => a.texto === "«Clásico» queda $1.300 más caro que armarlo por partes (hoy la portada dice «Ahorras $1.400»)."),
    );
    const casiCuadra = { ...L, enredos: [{ ...L.enredos[0], precio: 28000 }] }; // «Ahorras $400»
    si(
      "…o desaparece justo en cero",
      precios.planAjuste(casiCuadra, 1.4, ["platos"]).avisos.some((a) => a.texto === "«Clásico» deja de decir «Ahorras $400» en la portada."),
    );
    const apagado = { ...L, enredos: [{ ...L.enredos[0], activo: false }] };
    si("un combo fuera de la carta no avisa (no sale en la portada)", !precios.planAjuste(apagado, 10, ["bases"]).avisos.some((a) => a.tipo === "ahorro"));
  }
  {
    // El caso real de la carta: Don crocante cuadra exacto con sus piezas, y +5 % parejo lo descuadra por $100.
    const real = precios.planAjuste(precios.listasAjusteDe(menu.SEED_CATALOG), 5, ["bases", "proteinas", "acompanantes", "platos"]);
    si("con la carta de fábrica: +5 % parejo y el Don crocante dice «Ahorras $100»", real.avisos.some((a) => a.texto === "«Don crocante» va a decir «Ahorras $100» en la portada."), JSON.stringify(real.avisos.map((a) => a.texto)));
  }
  {
    const vacio = (p) => p.cambios.length === 0 && p.avisos.length === 0;
    si("sin porcentaje, 0 %, o sin grupos: nada que mostrar", [precios.planAjuste(L, NaN, TODOS), precios.planAjuste(L, 0, TODOS), precios.planAjuste(L, 0.04, TODOS), precios.planAjuste(L, 8, [])].every(vacio));
    eq("un grupo desconocido se ignora", precios.planAjuste(L, 8, ["salsas", "bases", "__proto__"]).cambios.map((c) => c.grupo), ["bases", "bases", "bases"]);
  }

  console.log("\n═══ LA FIRMA DE LA VISTA PREVIA ═══");
  {
    const f = (l, pct = 8, g = TODOS) => precios.planAjuste(l, pct, g).firma;
    si("tiene forma de huella (n-hex)", /^\d+-[0-9a-f]{8}$/.test(f(L)), f(L));
    eq("la misma carta da la misma firma", f(structuredClone(L)), f(L));
    si("un precio que cambió, otra firma", f({ ...L, bases: [{ ...L.bases[0], precio: 16000 }, ...L.bases.slice(1)] }) !== f(L));
    si("otro porcentaje, otra firma", f(L, 9) !== f(L));
    si("otros grupos, otra firma", f(L, 8, ["bases"]) !== f(L));
    si("un producto nuevo en un grupo elegido, otra firma", f({ ...L, proteinas: [...L.proteinas, { id: "pol", nombre: "Pollo", precio: 8000, activo: true }] }) !== f(L));
    eq("cambiar un nombre no la mueve (lo que importa es el precio)", f({ ...L, bases: [{ ...L.bases[0], nombre: "Spaghetti al dente" }, ...L.bases.slice(1)] }), f(L));
  }

  console.log("\n═══ LO QUE SE LEE ═══");
  {
    const l = precios.listasAjusteDe({
      bases: [{ id: "b", nombre: "B", precio: 100, activo: true, foto: "data:image/png;base64,AAAA", receta: [{ insumoId: "x", cantidad: 1 }], stock: 3 }],
      proteinas: [],
      toppings: [{ id: "t", nombre: "T", precio: 0, categoria: "salsa", activo: true, emoji: "🥫" }],
      enredos: [{ id: "e", nombre: "E", precio: 100, baseId: "b", proteinaId: "", toppingIds: ["t"], gancho: "g", foto: "x" }],
      ajustes: { adicionales: [{ id: "a", nombre: "A", precio: 100, cocina: true }], promos: [{ id: "p", texto: "P", activo: true, tono: "oro", banner: true }] },
      pedidos: [{ pago: "pendiente", estado: "recibido" }, { pago: "pendiente", estado: "cancelado" }, { pago: "pagado", estado: "entregado" }, { pago: "pendiente", estado: "entregado" }],
    });
    eq("a la pantalla va lo justo: sin fotos, recetas ni stock", Object.keys(l.bases[0]).sort(), ["activo", "id", "nombre", "precio"]);
    eq("los platos llevan sus piezas (para el «Ahorras»)", Object.keys(l.enredos[0]).sort(), ["activo", "baseId", "gancho", "id", "nombre", "precio", "proteinaId", "toppingIds"]);
    eq("cuentas abiertas: sin cobrar y sin cancelar", l.cuentasAbiertas, 2);
  }

  console.log("\n═══ LOS TEXTOS ═══");
  {
    const plan = precios.planAjuste(L, 8, ["bases", "proteinas"]);
    eq("el historial y el botón Deshacer", precios.textoAjuste(plan, 8), "Subió 8 % los precios de Bases y Proteínas (5 productos)");
    eq("bajando, con decimal", precios.textoAjuste(precios.planAjuste(L, -8.5, ["platos"]), -8.5), "Bajó 8,5 % los precios de Platos (3 productos)");
    eq("tres grupos", precios.gruposTexto(precios.planAjuste(L, 8, ["bases", "proteinas", "adicionales"]).cambios), "Bases, Proteínas y Adicionales");
    eq("un producto, en singular", precios.textoAjuste({ cambios: [{ grupo: "bases" }] }, 5), "Subió 5 % los precios de Bases (1 producto)");
    eq("el aviso de listo", precios.textoListo(18, 8), "Listo: 18 precios subieron 8 %. Si no era eso, toca Deshacer.");
    eq("…en singular y bajando", precios.textoListo(1, -5), "Listo: 1 precio bajó 5 %. Si no era eso, toca Deshacer.");
    eq("el porcentaje sin signo", [precios.pctTexto(-12), precios.pctTexto(8.5), precios.pctTexto(10)], ["12 %", "8,5 %", "10 %"]);
  }

  // ─────────────────────────── con el cerebro local ───────────────────────────
  const leer = () => JSON.parse(fs.readFileSync(FILE, "utf8"));
  const original = leer();
  // Punto de partida conocido: sin pilas ni pedidos, abierto, vendible sin depender de la
  // despensa de prueba, y con dos adicionales guardados (uno fuera de la caja).
  fs.writeFileSync(
    FILE,
    JSON.stringify(
      {
        ...original,
        pedidos: [],
        movimientos: [],
        arqueos: [],
        historial: [],
        undo: [],
        redo: [],
        archivoMeses: [],
        bases: original.bases.map((b, i) => (i === 0 ? { ...b, activo: true, agotado: false } : b)),
        ajustes: {
          ...original.ajustes,
          abierto: true,
          controlarStock: false,
          adicionales: [
            { id: "ad-qa-lim", nombre: "Limonada QA", precio: 9000 },
            { id: "ad-qa-emp", nombre: "Empaque QA", precio: 1500, activo: false },
          ],
        },
      },
      null,
      2,
    ),
  );
  // El módulo se carga DESPUÉS de sembrar: su memo de 2 s arranca vacío.
  const cat = await import("./lib/catalog.ts");
  /** Los precios de todo lo que se puede ajustar (y de las salsas), por grupo e id. */
  const preciosDe = (d) => ({
    bases: Object.fromEntries(d.bases.map((x) => [x.id, x.precio])),
    proteinas: Object.fromEntries(d.proteinas.map((x) => [x.id, x.precio])),
    toppings: Object.fromEntries(d.toppings.map((x) => [x.id, x.precio])),
    enredos: Object.fromEntries(d.enredos.map((x) => [x.id, x.precio])),
    adicionales: Object.fromEntries((d.ajustes.adicionales ?? []).map((x) => [x.id, x.precio])),
  });
  /** Todo lo demás de la carta, para comprobar que no se tocó. */
  const sinPrecios = (d) =>
    JSON.stringify(
      [d.bases, d.proteinas, d.toppings, d.enredos, d.ajustes.adicionales ?? []].map((l) =>
        l.map((x) => {
          const { precio, ...resto } = x;
          void precio;
          return resto;
        }),
      ),
    );
  const planDe = async (pct, grupos) => precios.planAjuste(precios.listasAjusteDe(await cat.getCatalog()), pct, grupos);

  console.log("\n═══ APLICAR: UN SOLO COMMIT ═══");
  // Lo de antes, tal como lo lee el cerebro (ya migrado): así se compara con lo que escribe.
  const d0 = await cat.getCatalog();
  const plan = await planDe(8, TODOS);
  si("hay de todo en el plan (bases, platos y adicionales)", ["bases", "platos", "adicionales"].every((g) => plan.cambios.some((c) => c.grupo === g)));
  const r = await cat.ajustarPrecios({ pct: 8, grupos: TODOS, firma: plan.firma });
  eq("devuelve cuántos y el texto, nunca el catálogo", Object.keys(r).sort(), ["n", "texto"]);
  eq("cuántos", r.n, plan.cambios.length);
  const d1 = leer();
  eq("UNA sola foto nueva en la pila de deshacer", (d1.undo ?? []).length, (d0.undo ?? []).length + 1);
  eq("el historial dice qué pasó", d1.historial[0].texto, precios.textoAjuste(plan, 8));
  eq("y el botón Deshacer dice lo mismo", d1.undo.at(-1).etiqueta, precios.textoAjuste(plan, 8));
  {
    const p1 = preciosDe(d1);
    const donde = { bases: "bases", proteinas: "proteinas", acompanantes: "toppings", platos: "enredos", adicionales: "adicionales" };
    const malos = plan.cambios.filter((c) => p1[donde[c.grupo]][c.id] !== c.despues);
    eq("cada precio quedó como decía la vista previa", malos, []);
    const salsas = d0.toppings.filter((t) => t.categoria === "salsa");
    si("las salsas, intactas", salsas.length > 0 && salsas.every((s) => p1.toppings[s.id] === s.precio));
    eq("el adicional fuera de la caja también se ajustó", p1.adicionales["ad-qa-emp"], 1600);
    eq("nada más cambió: nombres, fotos, disponibilidad, recetas", sinPrecios(d1), sinPrecios(d0));
  }
  {
    const pub = await cat.getCatalogPublico();
    eq("la portada y el QR ya ven el precio nuevo", pub.bases[0].precio, precios.precioAjustado(d0.bases[0].precio, 8));
  }

  console.log("\n═══ UN DOBLE TOQUE NO SUBE DOS VECES ═══");
  await rechaza("la misma firma otra vez se rechaza", () => cat.ajustarPrecios({ pct: 8, grupos: TODOS, firma: plan.firma }), "Los precios cambiaron mientras mirabas la vista previa: revísala de nuevo.");
  eq("y los precios siguen con UN solo 8 %", preciosDe(leer()), preciosDe(d1));

  console.log("\n═══ PEDIDOS EN MEDIO NO IMPIDEN DESHACER ═══");
  {
    const base = d1.bases[0];
    const p = await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" });
    await cat.avanzarPedido(p.id);
    await cat.cobrarPedido(p.id, "efectivo", 0, 0);
    await cat.crearPedido({ baseId: base.id, toppingIds: [], tipo: "llevar" });
    eq("los pedidos no ocupan la pila", leer().undo.length, d1.undo.length);
    eq("el pedido se cobró al precio nuevo", leer().pedidos.find((x) => x.id === p.id).items[0].precioFinal, base.precio);
    await cat.deshacer();
    const d2 = leer();
    eq("Deshacer revierte TODOS los precios: bases, proteínas, acompañantes, platos y adicionales", preciosDe(d2), preciosDe(d0));
    eq("los pedidos siguen ahí", d2.pedidos.length, 2);
    eq("y el que se cobró conserva su precio congelado", d2.pedidos.find((x) => x.id === p.id).items[0].precioFinal, base.precio);
    eq("el historial dice qué se deshizo", d2.historial[0].texto, `↩︎ Deshizo: ${precios.textoAjuste(plan, 8)}`);
    await cat.rehacer();
    eq("Rehacer lo vuelve a poner entero", preciosDe(leer()), preciosDe(d1));
    await cat.deshacer();
    eq("(y se deshace otra vez para seguir)", preciosDe(leer()), preciosDe(d0));
  }

  console.log("\n═══ SI ALGO CAMBIÓ MIENTRAS MIRABA, NO SE TOCA NADA ═══");
  {
    const vista = await planDe(5, ["bases"]);
    const b = leer().bases[1];
    await cat.updateIngrediente(b.id, { precio: b.precio + 100 }); // otro precio, en otra pantalla
    const antes = leer();
    await rechaza("una firma vieja se rechaza, con el mensaje para el dueño", () => cat.ajustarPrecios({ pct: 5, grupos: ["bases"], firma: vista.firma }), "Los precios cambiaron mientras mirabas la vista previa: revísala de nuevo.");
    const despues = leer();
    eq("ningún precio se movió", preciosDe(despues), preciosDe(antes));
    eq("ni se guardó nada (pila e historial iguales)", [despues.undo.length, despues.historial.length], [antes.undo.length, antes.historial.length]);
    await cat.deshacer(); // el cambio de la otra pantalla
  }
  {
    // La firma se compara con lo que hay AHORA, no con la copia de hasta 2 s del memo.
    await cat.getCatalog(); // esta instancia se queda con una copia
    const doc = leer();
    const viejo = precios.planAjuste(precios.listasAjusteDe(doc), 5, ["bases"]);
    doc.bases[2].precio += 1000; // otra instancia cambia un precio por debajo
    fs.writeFileSync(FILE, JSON.stringify(doc, null, 2));
    const nuevo = precios.planAjuste(precios.listasAjusteDe(doc), 5, ["bases"]);
    await rechaza("con la firma de la copia vieja, no", () => cat.ajustarPrecios({ pct: 5, grupos: ["bases"], firma: viejo.firma }), "cambiaron");
    const r2 = await cat.ajustarPrecios({ pct: 5, grupos: ["bases"], firma: nuevo.firma });
    eq("con la de lo que hay ahora, sí (y sobre el precio de ahora)", [r2.n, leer().bases[2].precio], [nuevo.cambios.length, precios.precioAjustado(doc.bases[2].precio, 5)]);
    await cat.deshacer();
  }

  console.log("\n═══ NADA QUE CAMBIAR, O UN PORCENTAJE RARO ═══");
  {
    const antes = leer();
    await rechaza("sin grupos no hay nada que cambiar", () => cat.ajustarPrecios({ pct: 5, grupos: [], firma: precios.planAjuste(precios.listasAjusteDe(antes), 5, []).firma }), "no cambia ningún precio");
    await rechaza("grupos que no existen tampoco", () => cat.ajustarPrecios({ pct: 5, grupos: ["salsas"], firma: precios.planAjuste(precios.listasAjusteDe(antes), 5, []).firma }), "no cambia ningún precio");
    for (const pct of [0, 60, -51, NaN]) {
      await rechaza(`un porcentaje de ${pct} no entra`, () => cat.ajustarPrecios({ pct, grupos: ["bases"], firma: "1-00000000" }), "entre 0,1 y 50");
    }
    const despues = leer();
    eq("nada se guardó", [despues.undo.length, despues.historial.length, JSON.stringify(preciosDe(despues))], [antes.undo.length, antes.historial.length, JSON.stringify(preciosDe(antes))]);
  }
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
