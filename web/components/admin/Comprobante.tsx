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
import { dibujarTiquete, cargarImagen } from "@/lib/tiquete-imagen";

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

  /* La imagen del tiquete, ya dibujada. Se hace una vez al montar y cada vez que
     cambia el pedido: sirve para imprimir, descargar y ver en pantalla, así que lo
     que se ve es EXACTAMENTE lo que sale. */
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      } catch {
        /* sin API de fuentes: se dibuja con las del sistema */
      }
      const logo = await cargarImagen("/logo-papaghetti-bn.png");
      if (!vivo) return;
      const c = dibujarTiquete({ pedido: p, ajustes: a, logo });
      setPng(c.toDataURL("image/png"));
    })();
    return () => {
      vivo = false;
    };
  }, [p, a]);

  /**
   * IMPRIMIR LA IMAGEN, Y NADA MÁS.
   *
   * Tres versiones anteriores imprimían HTML+CSS —la página, luego un iframe con
   * las hojas de estilo copiadas— y las tres acabaron en el mismo sitio: papel en
   * blanco o solo el logo. Entre un documento HTML y una térmica hay demasiadas
   * manos (el @media print global, la regla @page, el driver de Windows y sus
   * papeles declarados, "gráficos en segundo plano") y cada una puede dejar caer el
   * texto sin avisar. El logo llegaba porque es una IMAGEN.
   *
   * Así que se manda un documento que solo contiene una imagen a todo lo ancho. Un
   * driver imprime un bitmap igual que imprime su autotest. Y se abre en una
   * PESTAÑA visible, no en un iframe escondido: si el diálogo fallara, el operario
   * tiene el tiquete delante y puede imprimirlo con Ctrl+P o guardarlo con clic
   * derecho. Nada queda oculto donde no se pueda rescatar.
   */
  const imprimir = () => {
    if (!png) return;
    const page =
      papel === "termica"
        ? "@page { size: 80mm 297mm; margin: 0; }"
        : "@page { size: auto; margin: 10mm; }";
    const html =
      `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
      `<title>Comprobante N° ${p.consecutivo ?? p.id}</title>` +
      `<style>${page}
        html,body{margin:0;padding:0;background:#fff}
        /* A TODO LO ANCHO del papel que sea. En una térmica el ancho es 80mm y el
           tiquete lo llena; en una carta se ve grande pero entero. Nunca "un
           fragmento del lienzo", que es lo que salía con el HTML a 72mm dentro de
           una hoja carta. */
        img{display:block;width:100%;height:auto}
        @media print{ body,img{visibility:visible !important;display:block !important} }
      </style></head><body><img src="${png}" alt="Comprobante"></body></html>`;

    const ventana = window.open("", "_blank");
    if (ventana && ventana.document) {
      ventana.document.open();
      ventana.document.write(html);
      ventana.document.close();
      const img = ventana.document.querySelector("img");
      const lanzar = () => {
        try {
          ventana.focus();
          ventana.print();
        } catch {
          /* el operario ve el tiquete en la pestaña y puede imprimir con Ctrl+P */
        }
      };
      if (img && !img.complete) img.addEventListener("load", lanzar, { once: true });
      else setTimeout(lanzar, 50);
      return;
    }

    /* Ventana bloqueada (popups): un iframe con SOLO la imagen. Sigue siendo un
       bitmap, sigue sin depender de CSS: es tan robusto como la pestaña. */
    const marco = document.createElement("iframe");
    marco.className = "cbte-print-frame";
    marco.setAttribute("aria-hidden", "true");
    marco.style.cssText =
      "position:fixed;left:-10000px;top:0;width:400px;height:800px;border:0;pointer-events:none";
    document.body.appendChild(marco);
    const doc = marco.contentDocument;
    if (!doc) {
      marco.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const img = doc.querySelector("img");
    const lanzar = () => {
      try {
        marco.contentWindow?.focus();
        marco.contentWindow?.print();
      } finally {
        setTimeout(() => marco.remove(), 2000);
      }
    };
    if (img && !img.complete) img.addEventListener("load", lanzar, { once: true });
    else setTimeout(lanzar, 50);
  };

  useEffect(() => {
    if (auto && png) {
      const t = setTimeout(imprimir, 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, png]);

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
          exacta la fija `imprimir()` justo antes de abrir el diálogo. */}
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
        <button className="btn btn--primary" type="button" onClick={imprimir} disabled={!png}>
          <span>{png ? "Imprimir" : "Preparando…"}</span>
        </button>
        {/* La misma imagen, como archivo. Es el salvavidas que no depende de NADA
            del navegador: Windows imprime una foto en cualquier impresora con
            "ajustar al marco", y si la térmica se niega desde Chrome, desde el visor
            de fotos sale. */}
        {png && (
          <a
            className="btn btn--ghost"
            href={png}
            download={`comprobante-${p.consecutivo ?? p.id}.png`}
          >
            <span>Descargar imagen</span>
          </a>
        )}
        {/* La instrucción del caso real: vista previa bien + papel que no sale =
            el DRIVER no tiene el papel del rollo configurado. Se dice aquí, donde
            está el que sufre el problema, no en un manual que nadie abre. */}
        {papel === "termica" && (
          <small className="cbte-ayuda">
            Se imprime como una sola imagen a todo lo ancho del papel. Si la térmica no
            responde desde el navegador: <b>Descargar imagen</b> y abrirla en el visor
            de fotos de Windows → Imprimir → &quot;ajustar al marco&quot;.
          </small>
        )}
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
      {/* En pantalla se muestra LA IMAGEN: es la misma que se imprime, se descarga y
          se manda, así que lo que se ve es exactamente lo que sale. El artículo de
          abajo queda para lectores de pantalla, copiar texto y Ctrl+P. */}
      {png && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cbte-imagen" src={png} alt={`Comprobante N° ${p.consecutivo ?? p.id}`} />
      )}
      <article
        ref={hoja}
        className={`cbte printable cbte--${papel} ${anulado ? "cbte--anulado" : ""} ${png ? "cbte--respaldo" : ""}`}
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
