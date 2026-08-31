/**
 * PRUEBAS DE DOMINIO — la aritmética del dinero y el día contable.
 *
 * Son funciones puras sin E/S, justo lo que sí vale la pena testear (la UI cambia
 * mucho y aporta poco). Se ejecutan con `node qa-dominio.mjs` desde web/.
 *
 * El proyecto no tiene runner instalado a propósito: esto no necesita uno.
 */
import {
  totalDe,
  diaNegocio,
  horaNegocio,
  calcularTotales,
  desglosarPrecioFinal,
  idsGratis,
} from "./lib/precios.ts";
import { inicioDe, esVenta, ventaNeta } from "./lib/menu.ts";

let ok = 0,
  mal = 0;
const eq = (nombre, a, b) => {
  const bien = JSON.stringify(a) === JSON.stringify(b);
  bien ? ok++ : mal++;
  console.log(`  ${bien ? "✅" : "❌"} ${nombre}${bien ? "" : `  → esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`}`);
};

console.log("\n═══ EL TOTAL INCLUYE EL DOMICILIO (el bug de los $5.000) ═══");
{
  // El pedido real #82C78905 del catálogo.
  const p = { subtotal: 27900, impuesto: 2232, domicilio: 5000, propina: 0, descuento: 0 };
  eq("pedido a domicilio recién creado", totalDe(p), 35132);
  // Al cobrarlo (antes daba 30132: se perdía el envío).
  eq("el mismo pedido al cobrarlo", totalDe({ ...p, propina: 0, descuento: 0 }), 35132);
  eq("con propina de $3.000", totalDe({ ...p, propina: 3000 }), 38132);
  eq("con descuento de $2.000", totalDe({ ...p, descuento: 2000 }), 33132);
  eq("en mesa (sin domicilio)", totalDe({ ...p, domicilio: 0 }), 30132);
  eq("nunca negativo", totalDe({ subtotal: 1000, impuesto: 0, descuento: 99999 }), 0);
}

console.log("\n═══ EL DÍA CONTABLE ES EL DE PEREIRA, NO EL DEL SERVIDOR ═══");
{
  // 2026-08-04 23:30 en Pereira = 2026-08-05 04:30 UTC.
  eq("23:30 de Pereira sigue siendo el mismo día", diaNegocio("2026-08-05T04:30:00.000Z"), "2026-08-04");
  // 2026-08-04 19:30 Pereira = 2026-08-05 00:30 UTC → antes saltaba al día siguiente.
  eq("19:30 de Pereira NO es mañana", diaNegocio("2026-08-05T00:30:00.000Z"), "2026-08-04");
  // 00:30 de Pereira = 05:30 UTC del mismo día civil.
  eq("00:30 de Pereira ya es el día nuevo", diaNegocio("2026-08-05T05:30:00.000Z"), "2026-08-05");
  eq("hora local de un pedido de las 8pm", horaNegocio("2026-08-05T01:00:00.000Z"), 20);

  // El inicio de "hoy" para un instante de las 19:30 hora Pereira.
  const durante = new Date("2026-08-05T00:30:00.000Z"); // 4 ago, 19:30 Pereira
  const inicio = inicioDe("hoy", durante);
  eq("'hoy' arranca a medianoche de Pereira", inicio.toISOString(), "2026-08-04T05:00:00.000Z");
  const almuerzo = new Date("2026-08-04T17:00:00.000Z"); // 4 ago, 12:00 Pereira
  eq("el almuerzo del mismo día CUENTA en 'hoy'", almuerzo >= inicio, true);
}

console.log("\n═══ VENTA = LO QUE SE QUEDA EL NEGOCIO ═══");
{
  const p = {
    estado: "entregado",
    subtotal: 27900,
    impuesto: 2232,
    domicilio: 5000,
    propina: 4000,
    descuento: 0,
    total: 39132,
  };
  eq("la venta no incluye impuesto ni propina ni envío", ventaNeta(p), 27900);
  eq("el descuento sí baja la venta", ventaNeta({ ...p, descuento: 1900 }), 26000);
  eq("un pedido entregado es venta", esVenta(p), true);
  eq("un cancelado NO es venta", esVenta({ ...p, estado: "cancelado" }), false);
}

console.log("\n═══ EL ESPEJO DEL CLIENTE COINCIDE CON EL SERVIDOR ═══");
{
  const base = { id: "b", nombre: "Papa criolla", precio: 18900 };
  const prot = { id: "p", nombre: "Chicharrón", precio: 9000 };
  const tops = [
    { id: "t1", nombre: "Maicitos", precio: 2000 },
    { id: "t2", nombre: "Hogao", precio: 2000 },
    { id: "t3", nombre: "Aguacate", precio: 4500 },
  ];
  const t = calcularTotales({
    base,
    proteinas: [prot],
    toppings: tops,
    impuestoPct: 8,
    tipo: "domicilio",
    costoDomicilio: 5000,
    incluidos: 2,
  });
  /* Este bloque prueba la MAQUINARIA de promoción con `incluidos: 2` explícito. La regla
     viva del negocio es otra —nada va por cuenta de la casa, TOPPINGS_INCLUIDOS = 0— y se
     comprueba más abajo. Con 2 se descuentan los DOS MÁS CAROS (4.500 y 2.000) y se cobra
     el que queda (2.000): nunca "los dos primeros del array", que llegaba en el orden en
     que el cliente los tocó y hacía que el mismo plato costara distinto según los clics. */
  eq("con promoción de 2, se descuentan los dos más caros", t.subtotal, 18900 + 9000 + 2000);
  eq("impuesto", t.impuesto, Math.round(29900 * 0.08));
  eq("total del espejo", t.total, 29900 + 2392 + 5000);
  eq("y coincide con totalDe()", totalDe(t), 37292);

  // El orden de los clics ya NO cambia el precio.
  const alReves = calcularTotales({
    base,
    proteinas: [prot],
    toppings: [...tops].reverse(),
    impuestoPct: 8,
    incluidos: 2,
  });
  const alDerecho = calcularTotales({ base, proteinas: [prot], toppings: tops, impuestoPct: 8, incluidos: 2 });
  eq("tocar los toppings en otro orden cuesta lo mismo", alReves.total, alDerecho.total);

  // Las SALSAS valen $0 en la carta y no ensucian el conteo de acompañantes.
  const salsas = [
    { id: "s1", nombre: "Salsa", categoria: "salsa", precio: 0 },
    { id: "s2", nombre: "Otra salsa", categoria: "salsa", precio: 0 },
  ];
  const conSalsas = calcularTotales({
    base,
    proteinas: [prot],
    toppings: [...salsas, ...tops],
    impuestoPct: 8,
    incluidos: 2,
  });
  eq("las salsas no gastan cupo de promoción", conSalsas.subtotal, alDerecho.subtotal);

  /* LA REGLA VIVA: nada va por cuenta de la casa. Sin pasar `incluidos`, `calcularTotales`
     usa TOPPINGS_INCLUIDOS — y mientras ese número sea 0, se cobra TODO acompañante. Esto
     es lo que ve el cliente hoy, así que se prueba sin sustituirlo por una constante local:
     si alguien vuelve a poner 2 en menu.ts sin querer, esta prueba lo caza. */
  const hoy = calcularTotales({ base, proteinas: [prot], toppings: tops, impuestoPct: 8 });
  eq("hoy se cobran TODOS los acompañantes", hoy.subtotal, 18900 + 9000 + 2000 + 2000 + 4500);
  eq("y nada aparece marcado como regalado", idsGratis(tops).size, 0);
  const hoyConSalsas = calcularTotales({
    base,
    proteinas: [prot],
    toppings: [...salsas, ...tops],
    impuestoPct: 8,
  });
  eq("las salsas siguen sin costar", hoyConSalsas.subtotal, hoy.subtotal);

  // Enredo insignia: precio de carta cerrado, desglosado hacia atrás.
  const d = desglosarPrecioFinal(28900, 8);
  eq("el desglose reconstruye el precio de carta", d.subtotal + d.impuesto, 28900);
}

console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══\n`);
process.exit(mal > 0 ? 1 : 0);
