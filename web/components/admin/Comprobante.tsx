"use client";

/**
 * EL COMPROBANTE QUE SE LE ENTREGA AL CLIENTE.
 *
 * OJO, y esto no es un detalle de estilo: Papaghetti **no emite factura electrónica
 * ni documento equivalente P.O.S.** de la DIAN. Un comprobante interno NO reemplaza
 * esa obligación. Por eso este papel se llama COMPROBANTE DE CONSUMO y tiene
 * prohibido llevar las palabras "Factura", "Documento equivalente", "CUFE", "CUDE"
 * o una resolución de numeración: imitar un documento fiscal sin serlo es peor que
 * no entregar nada. El consecutivo es interno y así lo dice.
 *
 * IMPRIMIR SALÍA EN BLANCO, y por partida doble.
 *
 * Primero: hay un `@media print` global que apaga TODO el body
 * (`body * { visibility: hidden }`) y solo devuelve la visibilidad a lo que lleva la
 * clase `printable`. El comprobante no la llevaba — 38 de sus 38 elementos salían en
 * `visibility: hidden`.
 *
 * Y aun con la clase puesta, ese patrón es frágil: depende de que el navegador
 * respete la excepción a través de toda la cadena de ancestros apagados, y basta un
 * `transform`, un `contain` o un Safari para que se caiga. Siguió saliendo en blanco.
 *
 * Por eso ya no se imprime ESTA página. Se imprime un IFRAME que contiene únicamente
 * el comprobante: sin cromo que ocultar, no hay excepción que pueda fallar. Ningún
 * navegador puede sacar en blanco un documento en el que solo está el tiquete.
 *
 * DOS PAPELES, porque hay dos realidades: la térmica de 80mm de un POS y la hoja
 * normal de una impresora de oficina, que es con lo que se abre el primer día. El
 * selector cambia la regla `@page` de verdad — no es un maquillaje de CSS.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatCOP,
  lineasDe,
  metodoLabel,
  tipoLabel,
  whatsappValido,
  type Ajustes,
  type Pedido,
} from "@/lib/menu";

/**
 * La fecha, ARMADA A MANO a partir de las piezas.
 *
 * `toLocaleString` completo mete literales que dependen de la versión de ICU: el
 * servidor (Node) escribía "07:15 a. m." con un espacio normal y el navegador con un
 * espacio fino, así que React descartaba el HTML del servidor y volvía a pintar el
 * comprobante entero (error 418 de hidratación). Tomando solo los valores y poniendo
 * nosotros los separadores, las dos mitades escriben exactamente lo mismo.
 */
const PARTES = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function hora(iso: string) {
  const p: Record<string, string> = {};
  for (const x of PARTES.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.day}/${p.month}/${p.year} · ${p.hour}:${p.minute}`;
}

/**
 * LA HEBRA: el mismo fideo que recorre el sitio, aquí como separador.
 *
 * Es la única "textura" que se permite el papel. Una línea punteada es ruido de
 * formulario; esta ondita dice Papaghetti sin gritar, y una térmica la imprime
 * perfecta porque es un trazo negro de 1px, no una trama de grises.
 */
function Hebra({ corta }: { corta?: boolean }) {
  return (
    <svg
      className={`cbte__hebra ${corta ? "cbte__hebra--corta" : ""}`}
      viewBox="0 0 130 8"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M1 4 Q 17 0.5 33 4 T 65 4 T 97 4 T 129 4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </svg>
  );
}

type Papel = "termica" | "hoja";

export default function Comprobante({
  pedido: p,
  ajustes: a,
  auto,
}: {
  pedido: Pedido;
  ajustes: Ajustes;
  /** Abre el diálogo de impresión al entrar (se llega desde el botón de la caja). */
  auto?: boolean;
}) {
  const [papel, setPapel] = useState<Papel>("termica");
  const [tel, setTel] = useState(p.telefono ?? "");
  const [pidiendoTel, setPidiendoTel] = useState(false);
  const hoja = useRef<HTMLElement>(null);

  /**
   * IMPRIMIR MIDIENDO EL PAPEL PRIMERO.
   *
   * Una térmica imprime sobre ROLLO CONTINUO: no hay hoja que llenar, corta donde se
   * le diga. Con una altura de página fija (297mm) cada tiquete de 14cm se llevaba
   * otros 15cm de papel en blanco antes del corte. Así que antes de abrir el diálogo
   * se mide lo que ocupa el comprobante y se escribe ESA altura en la regla `@page`.
   *
   * Se toca el DOM a mano en vez de pasar por el estado porque `window.print()` es
   * síncrono: si el tamaño de página dependiera de un re-render de React, el diálogo
   * se abriría con la regla anterior.
   */
  const imprimir = () => {
    const el = hoja.current;
    if (!el) return;

    /* La altura del papel: una térmica imprime sobre ROLLO CONTINUO, no sobre hojas.
       Con una altura fija cada tiquete de 14cm se llevaba otros 15cm en blanco antes
       del corte. `+14mm` es el colchón que se come la cuchilla. */
    const mm = Math.ceil((el.offsetHeight / 96) * 25.4) + 14;
    const page =
      papel === "termica"
        ? `@page { size: 80mm ${mm}mm; margin: 0; }`
        : "@page { size: auto; margin: 12mm; }";

    /* Las MISMAS hojas de estilo de la página, para que el tiquete del iframe se
       vea exactamente igual que el de la pantalla. */
    const hojas = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((l) => `<link rel="stylesheet" href="${(l as HTMLLinkElement).href}">`)
      .join("");

    const marco = document.createElement("iframe");
    /* La clase importa: `:has(.cbte)` NO puede mirar dentro de un iframe, así que para
       la regla estructural de impresión este marco es un hijo más del body sin tiquete
       — y lo ocultaría, dejando su documento sin maquetar (altura 0 = rollo en
       blanco) en cualquier motor que aplique el medio print al padre. Se excluye por
       nombre en el CSS global. */
    marco.className = "cbte-print-frame";
    marco.setAttribute("aria-hidden", "true");
    marco.setAttribute("tabindex", "-1");
    /* CON TAMAÑO REAL, aparcado fuera de la pantalla — no 0×0. Un iframe de 0×0 tiene
       una vista de 0×0, y aunque la impresión de verdad re-maqueta contra el tamaño
       de @page, cualquier motor (o emulación, o versión vieja) que use la vista de la
       ventana para maquetar imprime un documento de altura cero: rollo en blanco.
       Con 340×700 aparcado a -10000px no hay caso posible en que el contenido mida 0,
       y lo que se mide en las pruebas es lo mismo que sale por la impresora. */
    marco.style.cssText =
      "position:fixed;left:-10000px;top:0;width:340px;height:700px;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(marco);

    const doc = marco.contentDocument;
    if (!doc) {
      marco.remove();
      window.print(); // si el navegador no deja iframes, al menos que imprima algo
      return;
    }
    doc.open();
    doc.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8">${hojas}` +
        `<style>${page}
         html,body{margin:0;padding:0;background:#fff}
         /* El bloque global de impresión apaga TODO el body con \`visibility\` y solo
            revive lo que lleva \`printable\`. Aquí dentro no hay nada más que el
            tiquete, así que se anula entero: es justo la regla que lo dejaba en
            blanco cuando el navegador no aplicaba bien la excepción. */
         @media print {
           body, body * { visibility: visible !important; }
           /* La clase repetida sube la especificidad por encima de cualquier regla
              global de ocultar (las de \`body:has(...) > *\` pesan (0,2,1); esto pesa
              (0,3,1)). Este documento SOLO contiene el tiquete: aquí nada tiene
              permiso para esconderlo, hoy ni cuando alguien toque el CSS global. */
           body > .cbte.cbte.cbte { display: block !important; }
         }
         .cbte { border:0 !important; border-radius:0 !important; box-shadow:none !important; }
        </style></head><body>${el.outerHTML}</body></html>`,
    );
    doc.close();

    /* Hay que esperar a que las hojas de estilo del iframe carguen: si se imprime
       antes, sale el tiquete sin estilos (que es otra forma de salir mal). */
    const lanzar = () => {
      try {
        marco.contentWindow?.focus();
        marco.contentWindow?.print();
      } finally {
        // Se quita DESPUÉS del diálogo; en Chrome print() es bloqueante, en otros no.
        setTimeout(() => marco.remove(), 1500);
      }
    };
    const links = [...doc.querySelectorAll("link")];
    let faltan = links.length;
    if (!faltan) {
      lanzar();
      return;
    }
    const listo = () => {
      faltan -= 1;
      if (faltan <= 0) setTimeout(lanzar, 60);
    };
    for (const l of links) {
      l.addEventListener("load", listo, { once: true });
      l.addEventListener("error", listo, { once: true });
    }
    // Red lenta o una hoja que nunca resuelve: se imprime igual, no se cuelga.
    setTimeout(() => {
      if (faltan > 0) {
        faltan = 0;
        lanzar();
      }
    }, 2500);
  };

  useEffect(() => {
    if (auto) {
      const t = setTimeout(imprimir, 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const consumo = p.subtotal - (p.descuento ?? 0);
  const lineas: { k: string; v: number }[] = [
    { k: "Consumo", v: p.subtotal },
    ...(p.descuento ? [{ k: "Descuento", v: -p.descuento }] : []),
    ...(p.impuesto ? [{ k: `Impuesto (${a.impuestoPct}%)`, v: p.impuesto }] : []),
    ...(p.domicilio ? [{ k: "Domicilio", v: p.domicilio }] : []),
  ];
  const total = consumo + (p.impuesto ?? 0) + (p.domicilio ?? 0);

  /* UN PEDIDO CANCELADO NO PUEDE IMPRIMIR UN PAPEL QUE PAREZCA UN CONSUMO VÁLIDO.
     Se cancelaba un pedido, se abría su comprobante y salía idéntico a los demás:
     mismo número, mismo total, ni una palabra de que estaba anulado. En una caja eso
     es un papel que se puede entregar, reclamar o cuadrar por error. */
  const anulado = p.estado === "cancelado";
  const devuelto = p.pago === "devuelto";

  const texto = useMemo(
    () =>
      [
        `*${a.negocio || "Papaghetti"}*`,
        `Comprobante N° ${p.consecutivo ?? p.id} · ${hora(p.creadoEn)}`,
        devuelto
          ? `*** DINERO DEVUELTO (${formatCOP(p.devolucion?.monto ?? p.total)}) ***`
          : anulado
            ? "*** PEDIDO ANULADO — NO ES UN CONSUMO ***"
            : "",
        "",
        ...lineasDe(p).flatMap((l) => [
          `${l.cantidad > 1 ? `${l.cantidad}× ` : ""}${l.nombre}   ${formatCOP(l.precio * l.cantidad)}`,
          l.detalle ? `   _${l.detalle}_` : "",
        ]),
        "",
        ...lineas.map((l) => `${l.k}: ${formatCOP(l.v)}`),
        `*TOTAL: ${formatCOP(total)}*`,
        "",
        `Pago: ${
          p.pago === "devuelto"
            ? "devuelto"
            : p.pago === "pagado"
              ? p.metodoPago
                ? metodoLabel[p.metodoPago]
                : "pagado"
              : "PENDIENTE"
        }`,
        "",
        "Comprobante interno de control. No es factura electrónica de venta ni documento equivalente P.O.S.",
        "¡Gracias por venir!",
      ]
        .filter(Boolean)
        .join("\n"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, a.negocio, total, anulado, devuelto],
  );

  const soloDigitos = tel.replace(/\D/g, "");
  const waHref = `https://wa.me/${soloDigitos.length === 10 ? `57${soloDigitos}` : soloDigitos}?text=${encodeURIComponent(texto)}`;
  const telOk = whatsappValido(tel);

  return (
    <>
      {/* El tamaño de papel se escribe de verdad en la regla @page: es lo único que
          hace que el navegador saque una tira de 80mm en vez de una carta. La altura
          exacta la calcula `imprimir()` justo antes de abrir el diálogo. */}
      <style id="pg-page">{
        papel === "termica"
          ? "@page { size: 80mm 297mm; margin: 0; }"
          : "@page { size: auto; margin: 12mm; }"
      }</style>

      <div className="cbte-acciones no-print">
        <div className="cbte-papel" role="group" aria-label="Tamaño de papel">
          <button
            type="button"
            className={papel === "termica" ? "is-on" : ""}
            onClick={() => setPapel("termica")}
          >
            Térmica 80mm
          </button>
          <button
            type="button"
            className={papel === "hoja" ? "is-on" : ""}
            onClick={() => setPapel("hoja")}
          >
            Hoja normal
          </button>
        </div>
        <button className="btn btn--primary" type="button" onClick={imprimir}>
          <span>Imprimir</span>
        </button>
        {/* WhatsApp SIEMPRE. Antes el botón solo existía si el pedido traía teléfono,
            o sea casi nunca: en el mostrador nadie lo pide. Si no hay número, se
            escribe aquí y ya. */}
        {p.telefono ? (
          <a className="btn btn--gold" href={waHref} target="_blank" rel="noopener noreferrer">
            <span>Enviar por WhatsApp</span>
          </a>
        ) : !pidiendoTel ? (
          <button className="btn btn--gold" type="button" onClick={() => setPidiendoTel(true)}>
            <span>Enviar por WhatsApp</span>
          </button>
        ) : (
          <span className="cbte-wa">
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="Número de WhatsApp"
              aria-label="Número de WhatsApp del cliente"
            />
            <a
              className={`btn btn--gold ${telOk ? "" : "is-off"}`}
              href={telOk ? waHref : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!telOk}
            >
              <span>Enviar</span>
            </a>
          </span>
        )}
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => navigator.clipboard?.writeText(texto)}
        >
          <span>Copiar texto</span>
        </button>
        <a className="btn btn--ghost" href="/admin/pedidos">
          <span>← Volver a la caja</span>
        </a>
      </div>

      {/* `printable` es lo que lo hace visible al imprimir: sin esa clase el papel
          salía en blanco (ver la cabecera de este archivo). */}
      <article
        ref={hoja}
        className={`cbte printable cbte--${papel} ${anulado ? "cbte--anulado" : ""}`}
      >
        {anulado && (
          <div className="cbte__anulado" role="alert">
            {devuelto ? "DINERO DEVUELTO" : "PEDIDO ANULADO"}
            <em>
              {devuelto ? (
                <>
                  Se devolvieron {formatCOP(p.devolucion?.monto ?? p.total)}
                  {p.devolucion?.motivo ? ` — ${p.devolucion.motivo}` : ""}. Este pedido ya no
                  es un consumo.
                </>
              ) : (
                <>
                  Este pedido se canceló
                  {p.motivoCancelacion ? `: ${p.motivoCancelacion}` : ""}. No corresponde a un
                  consumo y no debe cobrarse.
                </>
              )}
            </em>
          </div>
        )}

        <header className="cbte__h">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cbte__logo" src="/logo-papaghetti-bn.png" alt={a.negocio || "Papaghetti"} />
          <p className="cbte__datos">
            {a.razonSocial && <span>{a.razonSocial}</span>}
            {a.nit && <span>NIT {a.nit}</span>}
            {a.direccion && <span>{a.direccion}</span>}
            {(a.telefonoLocal || a.whatsapp) && <span>Tel. {a.telefonoLocal || a.whatsapp}</span>}
          </p>
        </header>

        <Hebra />

        <div className="cbte__tit">
          Comprobante de consumo
          <b>N° {p.consecutivo ?? p.id}</b>
        </div>

        <dl className="cbte__meta">
          <div>
            <dt>Fecha</dt>
            <dd>{hora(p.creadoEn)}</dd>
          </div>
          <div>
            <dt>Servicio</dt>
            <dd>{tipoLabel[p.tipo]}</dd>
          </div>
          {p.referencia && (
            <div>
              <dt>Ubicación</dt>
              <dd>{p.referencia}</dd>
            </div>
          )}
          {p.cliente && (
            <div>
              <dt>Cliente</dt>
              <dd>{p.cliente}</dd>
            </div>
          )}
        </dl>

        <Hebra corta />

        {/* Renglón a renglón. Antes el papel ponía el nombre de la base con el subtotal
            ENTERO al lado y los extras debajo sin precio: el cliente leía "$34.400"
            como si fuera el precio de la papa criolla. */}
        <ul className="cbte__items">
          {lineasDe(p).map((l, i) => (
            <li key={i}>
              <span className="cbte__cant">{l.cantidad > 1 ? `${l.cantidad}×` : ""}</span>
              <span className="cbte__nom">
                {l.nombre}
                {l.detalle && <em>{l.detalle}</em>}
              </span>
              <span className="cbte__val">{formatCOP(l.precio * l.cantidad)}</span>
            </li>
          ))}
        </ul>
        {p.notas && <p className="cbte__nota">Nota: {p.notas}</p>}

        <Hebra corta />

        <div className="cbte__sumas">
          {lineas.map((l) => (
            <div className="cbte__linea" key={l.k}>
              <span>{l.k}</span>
              <b>{formatCOP(l.v)}</b>
            </div>
          ))}
        </div>

        <div className="cbte__total">
          <span>TOTAL</span>
          <b>{formatCOP(total)}</b>
        </div>

        <div className="cbte__pago">
          <span>Pago</span>
          <b>
            {p.pago === "devuelto"
              ? "DEVUELTO"
              : p.pago === "pagado"
                ? p.metodoPago
                  ? metodoLabel[p.metodoPago]
                  : "Pagado"
                : "PENDIENTE"}
          </b>
        </div>

        <Hebra />

        <footer className="cbte__pie">
          <p className="cbte__aviso">
            Documento interno de control. No es factura electrónica de venta ni documento
            equivalente P.O.S.
          </p>
          <p className="cbte__gracias">¡Gracias por venir!</p>
        </footer>
      </article>
    </>
  );
}
