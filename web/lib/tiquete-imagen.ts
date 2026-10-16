/**
 * EL COMPROBANTE, DIBUJADO COMO UNA SOLA IMAGEN.
 *
 * Tres rondas de "sale en blanco" enseñaron una cosa: en el camino entre un
 * documento HTML y una térmica de 80mm hay demasiadas manos —el bloque global de
 * impresión, la regla @page, el driver de Windows con sus papeles declarados, la
 * opción "gráficos en segundo plano"— y cada una puede dejar caer el texto sin
 * avisar. La prueba definitiva la dio el dueño desde el local: lo ÚNICO que llegaba
 * al papel era el logo. Una imagen.
 *
 * Así que el papel entero se vuelve una imagen, del ancho EXACTO del cabezal —576
 * píxeles en una de 80 mm (72 mm útiles), 384 en una de 58 mm (48 mm útiles)—,
 * negro puro sobre blanco, sin antialias que el cabezal convierta en manchas. Un
 * driver imprime un bitmap igual que imprime su autotest: no tiene nada que
 * interpretar. Y la misma imagen sirve para descargar, para WhatsApp y para verla
 * en pantalla, así que lo que se ve es exactamente lo que sale.
 *
 * Solo corre en el navegador (usa <canvas>). Es un módulo puro: recibe el papel ya
 * decidido (lib/papel.ts, el mismo de las otras tres salidas) y el logo ya cargado, y
 * devuelve el canvas. Nada de React aquí dentro.
 */

import { formatCOP } from "./menu";
import { CAJA_LOGO, palabrasDe, trozosNombre, type Papel } from "./papel";
import { ROLLO_POR_DEFECTO, ROLLOS, type Rollo } from "./rollo";

/**
 * LA GEOMETRÍA DEL PAPEL. El tiquete se diseñó en unidades de 576 (80 mm) y así se
 * sigue escribiendo; en 58 mm el lienzo mide los 384 puntos reales y se dibuja con
 * una escala de 0,8 sobre un ancho lógico de 480. No es encoger una foto: el texto
 * se rasteriza ya al tamaño final, nítido, y reparte los renglones en el ancho que
 * hay. Solo 0,8 (no 384/576 = 0,67) porque a dos tercios la letra de los renglones
 * bajaba de los 2 mm de alto y en el mostrador no se leía. Los márgenes se recortan:
 * en 48 mm cada milímetro cuenta.
 */
interface Geo {
  /** Puntos reales del cabezal = ancho del lienzo. */
  puntos: number;
  /** Escala lógico → puntos. */
  k: number;
  /** Ancho lógico en el que se dibuja. */
  W: number;
  M: number;
  /** Ancho útil de texto (lógico). */
  T: number;
}
function geometria(rollo: Rollo): Geo {
  const { puntos } = ROLLOS[rollo];
  const k = rollo === 58 ? 0.8 : 1;
  const W = puntos / k;
  const M = rollo === 58 ? 12 : 22;
  return { puntos, k, W, M, T: W - M * 2 };
}

/** Puntos del cabezal del rollo (576 en 80 mm, 384 en 58 mm). */
export const puntosDe = (rollo: Rollo) => ROLLOS[rollo].puntos;

/* Las fuentes del sitio si están cargadas; si no, las del sistema. Un cabezal térmico
   no sabe de Fraunces, pero la imagen se hace en el navegador, donde sí existen. Los
   nombres de familia son los LITERALES que declara el CSS: cambiarlos haría que la
   imagen cayera en silencio a Segoe UI o Georgia. */
const CUERPO = '"Manrope", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const DISPLAY = '"Fraunces", "Georgia", "Times New Roman", serif';

type Ctx = CanvasRenderingContext2D;

/**
 * Parte un texto en líneas que quepan en `ancho` con la fuente ya puesta en `ctx`.
 * Una palabra que no cabe sola (una URL, la clave del Wi-Fi) se parte por letras: antes
 * quedaba entera en su línea y el papel la cortaba por los dos lados. Un "+" suelto va
 * con la palabra que le sigue (`palabrasDe`), igual que en el texto ESC/POS.
 */
function partir(ctx: Ctx, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const w of palabrasDe(texto)) {
    const prueba = actual ? `${actual} ${w}` : w;
    if (ctx.measureText(prueba).width <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) lineas.push(actual);
    let resto = Array.from(w);
    while (resto.length > 1 && ctx.measureText(resto.join("")).width > ancho) {
      let n = resto.length - 1;
      while (n > 1 && ctx.measureText(resto.slice(0, n).join("")).width > ancho) n--;
      lineas.push(resto.slice(0, n).join(""));
      resto = resto.slice(n);
    }
    actual = resto.join("");
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * El nombre de un plato: entero si cabe; si no, por sus trozos (`trozosNombre`: un plato
 * de dos bases se parte en la barra, no dentro de "Papa criolla") y cada trozo por palabras.
 */
function partirNombre(ctx: Ctx, nombre: string, ancho: number): string[] {
  if (ctx.measureText(nombre).width <= ancho) return [nombre];
  return trozosNombre(nombre).flatMap((t) => partir(ctx, t, ancho));
}

/** La hebra de la casa: el mismo fideo ondulado que separa el sitio, en un trazo. */
function hebra(ctx: Ctx, g: Geo, y: number, corta = false): number {
  const ancho = corta ? g.T * 0.62 : g.T;
  const x0 = (g.W - ancho) / 2;
  ctx.save();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  const ondas = corta ? 5 : 8;
  const paso = ancho / ondas;
  ctx.moveTo(x0, y);
  for (let i = 0; i < ondas; i++) {
    const xa = x0 + paso * i;
    ctx.quadraticCurveTo(xa + paso / 2, y + (i % 2 ? 5 : -5), xa + paso, y);
  }
  ctx.stroke();
  ctx.restore();
  return y + 22;
}

/** Las medidas de lo que se pueda dibujar como logo (una <img> o un lienzo). */
export interface LogoCargado {
  naturalWidth: number;
  naturalHeight: number;
}

export interface EntradaTiquete {
  /** El comprobante ya decidido (`papelDe`). */
  papel: Papel;
  /** El logo ya cargado (o null si no pudo cargarse: se escribe el nombre). */
  logo: (CanvasImageSource & LogoCargado) | null;
  /** El rollo de la térmica. Por defecto, el del local. */
  rollo?: Rollo;
}

/**
 * Dibuja el tiquete y devuelve el canvas. La altura la decide el contenido: se pinta
 * primero en un canvas muy alto y al final se recorta a lo que se usó, más un
 * colchón abajo para la cuchilla, que se come los últimos milímetros.
 */
export function dibujarTiquete({ papel, logo, rollo = ROLLO_POR_DEFECTO }: EntradaTiquete): HTMLCanvasElement {
  const g = geometria(rollo);
  const { W: ANCHO_TIQUETE, M: MARGEN, T: ANCHO_TEXTO } = g;
  const lienzo = document.createElement("canvas");
  lienzo.width = g.puntos;
  lienzo.height = 4000; // de sobra; se recorta al final
  const ctx = lienzo.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.scale(g.k, g.k);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";

  let y = 26;
  const centro = (t: string, fuente: string, salto: number) => {
    ctx.font = fuente;
    ctx.textAlign = "center";
    for (const l of partir(ctx, t, ANCHO_TEXTO)) {
      y += salto;
      ctx.fillText(l, ANCHO_TIQUETE / 2, y);
    }
    ctx.textAlign = "left";
  };
  /* "Concepto ........ valor", el valor en la primera línea. Se dibuja DESPUÉS de las
     líneas del concepto: en el papel no se nota, pero así lo dibujado, leído en orden
     (como lo leen las pruebas para comparar las cuatro salidas), no corta un nombre
     largo con su precio en medio. */
  const fila = (izq: string, der: string, fuenteI: string, fuenteD = fuenteI, salto = 30, plato = false) => {
    ctx.font = fuenteD;
    const wDer = ctx.measureText(der).width;
    ctx.font = fuenteI;
    const lineas = (plato ? partirNombre : partir)(ctx, izq, ANCHO_TEXTO - wDer - 16);
    const y0 = y + salto;
    for (const l of lineas) {
      y += salto;
      ctx.textAlign = "left";
      ctx.font = fuenteI;
      ctx.fillText(l, MARGEN, y);
    }
    if (!lineas.length) y += salto;
    ctx.textAlign = "right";
    ctx.font = fuenteD;
    ctx.fillText(der, ANCHO_TIQUETE - MARGEN, y0);
    ctx.textAlign = "left";
  };
  /* RÓTULO Y VALOR ("CLIENTE ····· Ana"). Antes solo se partía el rótulo: una
     ubicación o un nombre largos se montaban encima del rótulo y se salían por la
     izquierda, y una dirección de domicilio era ilegible. Si no caben en una línea, el
     rótulo va arriba y el valor debajo, partido, con sangría. */
  const rotulo = (k: string, v: string, fuenteK: string, fuenteV: string, salto: number) => {
    ctx.font = fuenteK;
    const wK = ctx.measureText(k).width;
    ctx.font = fuenteV;
    const wV = ctx.measureText(v).width;
    y += salto;
    ctx.textAlign = "left";
    ctx.font = fuenteK;
    ctx.fillText(k, MARGEN, y);
    if (wK + 16 + wV <= ANCHO_TEXTO) {
      ctx.textAlign = "right";
      ctx.font = fuenteV;
      ctx.fillText(v, ANCHO_TIQUETE - MARGEN, y);
      ctx.textAlign = "left";
      return;
    }
    ctx.font = fuenteV;
    for (const l of partir(ctx, v, ANCHO_TEXTO - 16)) {
      y += salto - 4;
      ctx.fillText(l, MARGEN + 16, y);
    }
  };

  // ── Sello de anulado: negro sobre blanco, imposible de no ver ──
  if (papel.sello) {
    const y0 = y;
    ctx.font = `500 21px ${CUERPO}`;
    const lineasDet = partir(ctx, papel.sello.detalle, ANCHO_TEXTO - 32);
    ctx.font = `800 30px ${CUERPO}`;
    const lineasTit = partir(ctx, papel.sello.titulo, ANCHO_TEXTO - 16);
    const alto = 20 + lineasTit.length * 36 + lineasDet.length * 26 + 18;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(MARGEN, y0, ANCHO_TEXTO, alto);
    y = y0 + 8;
    centro(papel.sello.titulo, `800 30px ${CUERPO}`, 36);
    ctx.font = `500 21px ${CUERPO}`;
    ctx.textAlign = "center";
    for (const l of lineasDet) {
      y += 26;
      ctx.fillText(l, ANCHO_TIQUETE / 2, y);
    }
    ctx.textAlign = "left";
    y = y0 + alto + 24;
  }

  // ── Logo (o el nombre, si el logo no cargó) ──
  /* El logo ENCAJA en su caja: el de la casa (640×274) entra a lo ancho como siempre;
     uno cuadrado entra a lo alto, en vez de salir de 33 mm de alto. */
  if (logo && logo.naturalWidth > 0 && logo.naturalHeight > 0) {
    const s = Math.min(CAJA_LOGO.ancho / logo.naturalWidth, CAJA_LOGO.alto / logo.naturalHeight);
    const w = Math.round(logo.naturalWidth * s);
    const h = Math.round(logo.naturalHeight * s);
    ctx.drawImage(logo, (ANCHO_TIQUETE - w) / 2, y, w, h);
    y += h + 10;
  } else {
    centro(papel.cabecera.nombre, `700 44px ${DISPLAY}`, 48);
    y += 6;
  }

  // ── Datos del negocio ──
  for (const d of papel.cabecera.datos) centro(d, `500 20px ${CUERPO}`, 25);
  y += 14;

  y = hebra(ctx, g, y);

  // ── Título + número ──
  // Lado a lado si caben; si no (58 mm con un número largo), el número baja.
  y += 8;
  ctx.font = `700 22px ${CUERPO}`;
  const wTit = ctx.measureText(papel.titulo).width;
  ctx.font = `700 34px ${DISPLAY}`;
  const wNum = ctx.measureText(papel.numero).width;
  ctx.font = `700 22px ${CUERPO}`;
  ctx.textAlign = "left";
  ctx.fillText(papel.titulo, MARGEN, y + 22);
  if (wTit + 16 + wNum > ANCHO_TEXTO) y += 34;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.textAlign = "right";
  ctx.fillText(papel.numero, ANCHO_TIQUETE - MARGEN, y + 26);
  ctx.textAlign = "left";
  y += 44;

  // ── Meta: fecha, servicio y los datos del cliente que se muestran ──
  const meta: [string, string][] = [
    ["FECHA", papel.fecha],
    ["SERVICIO", papel.servicio],
    ...papel.cliente.map((d): [string, string] => [d.k.toUpperCase(), d.v]),
  ];
  for (const [k, v] of meta) rotulo(k, v, `700 18px ${CUERPO}`, `600 21px ${CUERPO}`, 28);
  y += 14;

  y = hebra(ctx, g, y, true);

  // ── Renglones ──
  y += 6;
  const cuenta = papel.cuenta;
  for (const l of cuenta.lineas) {
    const cant = l.cantidad > 1 ? `${l.cantidad}× ` : "";
    fila(`${cant}${l.nombre}`, formatCOP(l.importe), `800 24px ${CUERPO}`, `800 24px ${CUERPO}`, 32, true);
    if (l.detalle) {
      ctx.font = `500 19px ${CUERPO}`;
      for (const s of partir(ctx, l.detalle, ANCHO_TEXTO - 24)) {
        y += 24;
        ctx.fillText(s, MARGEN + 24, y);
      }
    }
    y += 6;
  }
  if (papel.nota) {
    ctx.font = `600 19px ${CUERPO}`;
    for (const s of partir(ctx, `Nota: ${papel.nota}`, ANCHO_TEXTO)) {
      y += 24;
      ctx.fillText(s, MARGEN, y);
    }
  }
  y += 12;

  y = hebra(ctx, g, y, true);

  // ── Sumas ── (de cuentaImpresa: la tarifa congelada en el pedido)
  for (const [k, v] of cuenta.sumas) fila(k, formatCOP(v), `500 21px ${CUERPO}`, `700 21px ${CUERPO}`, 28);

  // ── TOTAL ──
  y += 16;
  ctx.fillRect(MARGEN, y, ANCHO_TEXTO, 3);
  y += 6;
  fila("TOTAL", formatCOP(cuenta.total), `800 26px ${CUERPO}`, `800 40px ${DISPLAY}`, 44);
  if (papel.anulado) {
    // Tachado: el total sigue ahí para que se lea, pero no vale.
    const tachado = Math.min(220, ANCHO_TEXTO * 0.5);
    ctx.fillRect(ANCHO_TIQUETE - MARGEN - tachado, y - 14, tachado, 4);
  }
  y += 4;
  ctx.fillRect(MARGEN, y, ANCHO_TEXTO, 3);
  y += 10;
  /* El impuesto va DENTRO del total, y así se dice: una línea debajo, no una suma más
     que hiciera creer que se agregó encima. */
  if (cuenta.nota) {
    centro(cuenta.nota, `600 18px ${CUERPO}`, 22);
    y += 8;
  }

  // ── Pago ──
  fila("PAGO", papel.pago, `700 18px ${CUERPO}`, `800 22px ${CUERPO}`, 30);
  y += 16;

  y = hebra(ctx, g, y);

  // ── Pie: la nota legal (fija), las líneas del dueño y el cierre ──
  y += 4;
  centro(papel.pie.legal, `500 17px ${CUERPO}`, 22);
  if (papel.pie.extra.length) {
    y += 8;
    for (const e of papel.pie.extra) centro(e, `500 19px ${CUERPO}`, 24);
  }
  y += 12;
  centro(papel.pie.cierre, `700 26px ${DISPLAY}`, 30);

  // Colchón para la cuchilla: se come los últimos milímetros.
  y += 60;

  // ── Recorte a lo usado ──
  const final = document.createElement("canvas");
  final.width = g.puntos;
  final.height = Math.min(Math.ceil(y * g.k), lienzo.height);
  const fctx = final.getContext("2d")!;
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, final.width, final.height);
  fctx.drawImage(lienzo, 0, 0);
  return final;
}

/**
 * BLANCO Y NEGRO PUROS, para el cabezal térmico.
 *
 * Un cabezal quema un punto o no lo quema: no existe el gris. Cuando le llega el
 * antialias del navegador (bordes de letra en gris), el driver lo convierte con un
 * tramado que ensucia el contorno de cada glifo — texto "peludo", que es lo que se ve
 * en muchos tiquetes web. Un umbral limpio antes de mandar la imagen deja cada borde
 * decidido. En pantalla se sigue mostrando la versión suave; esta es solo para el
 * papel térmico y para el archivo descargado.
 */
export function binarizar(origen: HTMLCanvasElement, umbral = 150): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = origen.width;
  c.height = origen.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(origen, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // luminancia aproximada; el alfa ya es opaco (se pintó blanco debajo)
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = lum < umbral ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * EL PATRÓN DE CALIBRACIÓN: lo que se imprime para saber, en un solo papel, cómo
 * está llegando el bitmap al cabezal. Se dibuja a los puntos REALES del rollo (sin
 * escala), porque lo que mide es justamente si el driver los respeta 1:1.
 *
 *  · Una REGLA en milímetros con marca cada mm y número cada 10: si al medir con
 *    una regla de verdad los "10" caen a 10 mm, cada píxel va sobre un punto; si
 *    caen a 11 o a 9, el driver está reescalando (papel equivocado en el driver o
 *    "ajustar a la página" activo).
 *  · Marcas en los dos bordes: si falta alguna, el driver recorta ese lado.
 *  · Un TABLERO de 1 px: nítido = 1:1; gris o con bandas = remuestreo o dithering.
 *  · Texto de 16, 20, 24 y 30 px, para ver qué tamaño se lee bien en ESTE cabezal.
 */
export function dibujarCalibracion(rollo: Rollo = ROLLO_POR_DEFECTO): HTMLCanvasElement {
  const { puntos, mm: mmUtiles } = ROLLOS[rollo];
  const c = document.createElement("canvas");
  c.width = puntos;
  c.height = 540;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.font = `800 ${rollo === 58 ? 22 : 26}px ${CUERPO}`;
  ctx.fillText("PATRÓN DE PRUEBA", puntos / 2, 32);
  ctx.font = `600 18px ${CUERPO}`;
  ctx.fillText(`Rollo ${rollo} mm · ${puntos} puntos = ${mmUtiles} mm`, puntos / 2, 56);

  // Bordes: si uno no sale, ese lado se recorta.
  ctx.fillRect(0, 0, 3, c.height);
  ctx.fillRect(puntos - 3, 0, 3, c.height);

  // Regla: 8 px = 1 mm.
  const y0 = 76;
  ctx.fillRect(0, y0, puntos, 2);
  ctx.font = `700 18px ${CUERPO}`;
  for (let mm = 0; mm <= mmUtiles; mm++) {
    const x = mm * 8;
    const alto = mm % 10 === 0 ? 26 : mm % 5 === 0 ? 16 : 8;
    ctx.fillRect(Math.min(x, puntos - 2), y0, 2, alto);
    if (mm % 10 === 0 && mm < mmUtiles - 3) ctx.fillText(String(mm), x + (mm === 0 ? 10 : 0), y0 + 46);
  }
  ctx.fillText(String(mmUtiles), puntos - 14, y0 + 46);

  // Tablero de 1 px: la prueba de remuestreo.
  const yt = 150;
  ctx.font = `600 18px ${CUERPO}`;
  ctx.textAlign = "left";
  ctx.fillText("Tablero 1 px (nítido, no gris):", 14, yt - 8);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < puntos - 28; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(14 + x, yt + y, 1, 1);
    }
  }
  // Líneas verticales de 1 px separadas 2 px: si salen bandas, hay escalado.
  const yl = yt + 64;
  ctx.fillText("Líneas de 1 px:", 14, yl - 8);
  for (let x = 14; x < puntos - 14; x += 3) ctx.fillRect(x, yl, 1, 40);

  // Tamaños de texto.
  let y = yl + 80;
  for (const px of [16, 20, 24, 30]) {
    ctx.font = `600 ${px}px ${CUERPO}`;
    ctx.fillText(`${px} px · Papaghetti 0123`, 14, y);
    y += px + 14;
  }
  ctx.font = `500 17px ${CUERPO}`;
  for (const l of [`Regla corta de ${mmUtiles}: recorta.`, "El 10 no mide 10 mm: reescala.", "Tablero gris: hay tramado."]) {
    y += 24;
    ctx.fillText(l, 14, y);
  }

  return binarizar(c);
}

/**
 * Carga una imagen y resuelve con ella, o con null si no se pudo. Nunca rechaza, y
 * nunca se queda esperando: sin tiempo límite, un logo que no respondía dejaba el
 * botón en "Preparando…" para siempre. Una imagen de otro origen se pide con CORS:
 * cargada sin él "ensucia" el lienzo y después no se puede ni descargar ni imprimir
 * (getImageData lanza error). Si el otro servidor no lo permite, falla limpio y el
 * papel lleva el nombre escrito.
 */
export function cargarImagen(src: string, tiempoMs = 4000): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    let listo = false;
    const fin = (v: HTMLImageElement | null) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      res(v);
    };
    const reloj = setTimeout(() => fin(null), tiempoMs);
    try {
      const img = new Image();
      img.onload = () => fin(img);
      img.onerror = () => fin(null);
      if (/^https?:\/\//i.test(src) && typeof location !== "undefined" && !src.startsWith(location.origin)) {
        img.crossOrigin = "anonymous";
      }
      img.src = src;
    } catch {
      fin(null);
    }
  });
}

/* ───────────────────────── El logo propio: del archivo al papel ───────────────────────── */

/** El tamaño al que se guarda el logo: el doble de su caja en el papel (nítido en pantalla y en 80 mm). */
export const LOGO_GUARDADO = { ancho: CAJA_LOGO.ancho * 2, alto: CAJA_LOGO.alto * 2 } as const;

/**
 * DE COLOR A TINTA, como qa-logo-bn.mjs hizo con el logo de la casa: por DISTANCIA AL
 * FONDO, no por luminancia. La luminancia es la trampa evidente y es la equivocada: un
 * naranja es un color CLARO, y pasado a gris salía casi blanco y desaparecía del papel.
 * Lo que hay que medir es cuánta tinta hay, o sea cuánto se aleja cada píxel del color
 * del fondo (el de las esquinas; un logo transparente ya llega pintado sobre blanco). El
 * 1,25 empuja los medios tonos al negro: una térmica no hace grises finos.
 *
 * Recibe RGBA y devuelve un gris por píxel: 0 = tinta, 255 = papel. Pura, sin DOM.
 */
export function tintaDeLogo(rgba: Uint8ClampedArray | Uint8Array, ancho: number, alto: number): Uint8ClampedArray {
  const n = ancho * alto;
  const gris = new Uint8ClampedArray(n).fill(255);
  if (!n) return gris;
  const esquinas = [0, ancho - 1, (alto - 1) * ancho, n - 1].map((i) => i * 4);
  const mediana = (c: number) => {
    const v = esquinas.map((p) => rgba[p + c]).sort((a, b) => a - b);
    return (v[1] + v[2]) / 2;
  };
  const fondo = [mediana(0), mediana(1), mediana(2)];
  const dist = new Float32Array(n);
  let dmax = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const d = Math.hypot(rgba[p] - fondo[0], rgba[p + 1] - fondo[1], rgba[p + 2] - fondo[2]);
    dist[i] = d;
    if (d > dmax) dmax = d;
  }
  /* Una imagen sin dibujo (todo del color del fondo, o casi) no tiene tinta que sacar:
     normalizar su ruido lo volvería un manchón negro. */
  if (dmax < 24) return gris;
  for (let i = 0; i < n; i++) gris[i] = 255 - Math.min(255, (dist[i] / dmax) * 255 * 1.25);
  return gris;
}

/** El rectángulo que ocupa la tinta (gris por debajo del umbral), o null si no hay. */
export function cajaDeTinta(
  gris: Uint8ClampedArray,
  ancho: number,
  alto: number,
  umbral = 150,
): { x: number; y: number; w: number; h: number } | null {
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (gris[y * ancho + x] < umbral) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * EL LOGO DEL DUEÑO, LISTO PARA EL PAPEL: sobre blanco → a tinta → recorte de los
 * bordes vacíos → encaje en LOGO_GUARDADO → umbral → PNG. Sale en blanco y negro
 * puros, así que lo que se ve en Ajustes es lo que quema el cabezal (y pesa poco: un PNG
 * de dos colores se comprime muy bien).
 *
 * No sirve ImageUpload para esto: exporta JPEG (los bordes del JPEG son motas después
 * del umbral) y no pinta fondo, así que un PNG transparente quedaba como un bloque negro.
 *
 * `umbral` decide cuánta tinta queda: más alto, trazo más grueso. Devuelve null si la
 * imagen no tiene dibujo.
 */
export function prepararLogo(
  fuente: CanvasImageSource,
  anchoFuente: number,
  altoFuente: number,
  umbral = 150,
  caja: { ancho: number; alto: number } = LOGO_GUARDADO,
): { dataUrl: string; ancho: number; alto: number } | null {
  if (!(anchoFuente > 0 && altoFuente > 0)) return null;
  // 1. Sobre blanco, a un tamaño de trabajo razonable (más es solo memoria).
  const k = Math.min(1, 1600 / Math.max(anchoFuente, altoFuente));
  const w = Math.max(1, Math.round(anchoFuente * k));
  const h = Math.max(1, Math.round(altoFuente * k));
  const trabajo = document.createElement("canvas");
  trabajo.width = w;
  trabajo.height = h;
  const t = trabajo.getContext("2d", { willReadFrequently: true })!;
  t.fillStyle = "#fff";
  t.fillRect(0, 0, w, h);
  t.drawImage(fuente, 0, 0, w, h);
  const img = t.getImageData(0, 0, w, h);
  // 2. A tinta (en gris todavía: el encaje suaviza mejor sobre gris que sobre dos colores).
  const gris = tintaDeLogo(img.data, w, h);
  const borde = cajaDeTinta(gris, w, h, umbral);
  if (!borde) return null;
  for (let i = 0; i < gris.length; i++) {
    const p = i * 4;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = gris[i];
    img.data[p + 3] = 255;
  }
  t.putImageData(img, 0, 0);
  // 3. Recorte (con un margen de 2 px) y encaje, sin agrandar: agrandar solo inventa bordes.
  const m = 2;
  const cx = Math.max(0, borde.x - m);
  const cy = Math.max(0, borde.y - m);
  const cw = Math.min(w - cx, borde.w + m * 2);
  const ch = Math.min(h - cy, borde.h + m * 2);
  const s = Math.min(1, caja.ancho / cw, caja.alto / ch);
  const fw = Math.max(1, Math.round(cw * s));
  const fh = Math.max(1, Math.round(ch * s));
  const final = document.createElement("canvas");
  final.width = fw;
  final.height = fh;
  const f = final.getContext("2d", { willReadFrequently: true })!;
  f.fillStyle = "#fff";
  f.fillRect(0, 0, fw, fh);
  f.imageSmoothingEnabled = true;
  f.imageSmoothingQuality = "high";
  f.drawImage(trabajo, cx, cy, cw, ch, 0, 0, fw, fh);
  // 4. Umbral: blanco y negro puros, como lo quema el cabezal.
  const fin = f.getImageData(0, 0, fw, fh);
  for (let i = 0; i < fin.data.length; i += 4) {
    const v = fin.data[i] < umbral ? 0 : 255;
    fin.data[i] = fin.data[i + 1] = fin.data[i + 2] = v;
    fin.data[i + 3] = 255;
  }
  f.putImageData(fin, 0, 0);
  return { dataUrl: final.toDataURL("image/png"), ancho: fw, alto: fh };
}
