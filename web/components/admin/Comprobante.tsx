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
 * La PROPINA va en línea aparte, después del total del consumo, con el aviso de que
 * es voluntaria (Ley 1935 de 2018 obliga a informarlo).
 *
 * Imprime en papel térmico de 80mm y también en A4 desde cualquier navegador.
 */

import { useEffect } from "react";
import {
  formatCOP,
  lineasDe,
  metodoLabel,
  tipoLabel,
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
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

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
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [auto]);

  // Solo lo que de verdad se cobró: sin impuesto no se pinta la línea (no "$0").
  const consumo = p.subtotal - (p.descuento ?? 0);
  const lineas: { k: string; v: number }[] = [
    { k: "Consumo", v: p.subtotal },
    ...(p.descuento ? [{ k: "Descuento", v: -p.descuento }] : []),
    ...(p.impuesto ? [{ k: `Impuesto (${a.impuestoPct}%)`, v: p.impuesto }] : []),
    ...(p.domicilio ? [{ k: "Domicilio", v: p.domicilio }] : []),
  ];
  const totalConsumo = consumo + (p.impuesto ?? 0) + (p.domicilio ?? 0);

  /* UN PEDIDO CANCELADO NO PUEDE IMPRIMIR UN PAPEL QUE PAREZCA UN CONSUMO VÁLIDO.
     Se cancelaba un pedido, se abría su comprobante y salía idéntico a los demás:
     mismo número, mismo total, ni una palabra de que estaba anulado. En una caja eso
     es un papel que se puede entregar, reclamar o cuadrar por error. */
  const anulado = p.estado === "cancelado";
  const devuelto = p.pago === "devuelto";

  const texto = [
    `*${a.negocio || "Papaghetti"}* — comprobante N° ${p.consecutivo ?? p.id}`,
    devuelto
      ? `*** DINERO DEVUELTO (${formatCOP(p.devolucion?.monto ?? p.total)}) ***`
      : anulado
        ? "*** PEDIDO ANULADO — NO ES UN CONSUMO ***"
        : "",
    hora(p.creadoEn),
    "",
    ...lineasDe(p).flatMap((l) => [
      `${l.cantidad > 1 ? `${l.cantidad}× ` : ""}${l.nombre}  ${formatCOP(l.precio * l.cantidad)}`,
      l.detalle ? `   ${l.detalle}` : "",
    ]),
    "",
    ...lineas.map((l) => `${l.k}: ${formatCOP(l.v)}`),
    `TOTAL: ${formatCOP(totalConsumo)}`,
    p.propina ? `Propina voluntaria: ${formatCOP(p.propina)}` : "",
    p.propina ? `Recibido: ${formatCOP(p.total)}` : "",
    "",
    "¡Gracias por venir!",
  ]
    .filter(Boolean)
    .join("\n");

  const wa = p.telefono
    ? `https://wa.me/${p.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`
    : null;

  return (
    <>
      <div className="cbte-acciones no-print">
        <button className="btn btn--primary" type="button" onClick={() => window.print()}>
          <span>🖨️ Imprimir</span>
        </button>
        {wa && (
          <a className="btn btn--ghost" href={wa} target="_blank" rel="noopener noreferrer">
            <span>Enviar por WhatsApp</span>
          </a>
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

      <article className={`cbte ${anulado ? "cbte--anulado" : ""}`}>
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
          <b className="cbte__negocio">{a.negocio || "Papaghetti"}</b>
          {a.razonSocial && <span>{a.razonSocial}</span>}
          {a.nit && <span>NIT {a.nit}</span>}
          {a.direccion && <span>{a.direccion}</span>}
          {(a.telefonoLocal || a.whatsapp) && <span>Tel. {a.telefonoLocal || a.whatsapp}</span>}
        </header>

        <div className="cbte__tit">COMPROBANTE DE CONSUMO</div>

        <div className="cbte__meta">
          <span>N° interno</span>
          <b>{p.consecutivo ?? p.id}</b>
        </div>
        <div className="cbte__meta">
          <span>Fecha</span>
          <b>{hora(p.creadoEn)}</b>
        </div>
        <div className="cbte__meta">
          <span>Servicio</span>
          <b>{tipoLabel[p.tipo]}</b>
        </div>
        {p.referencia && (
          <div className="cbte__meta">
            <span>Ubicación</span>
            <b>{p.referencia}</b>
          </div>
        )}
        {p.cliente && (
          <div className="cbte__meta">
            <span>Cliente</span>
            <b>{p.cliente}</b>
          </div>
        )}

        <hr className="cbte__sep" />

        {/* RENGLÓN A RENGLÓN. Antes el papel ponía el nombre de la base con el subtotal
            ENTERO al lado y los extras debajo sin precio: el cliente leía "$34.400" como
            si fuera el precio de la papa criolla. Con varios platos ya era ilegible. */}
        {lineasDe(p).map((l, i) => (
          <div key={i}>
            <div className="cbte__item">
              <span>
                {l.cantidad > 1 && <b className="cbte__x">{l.cantidad}×</b>} {l.nombre}
              </span>
              <b>{formatCOP(l.precio * l.cantidad)}</b>
            </div>
            {l.detalle && <div className="cbte__sub">{l.detalle}</div>}
          </div>
        ))}
        {p.notas && <div className="cbte__sub">Nota: {p.notas}</div>}

        <hr className="cbte__sep" />

        {lineas.map((l) => (
          <div className="cbte__linea" key={l.k}>
            <span>{l.k}</span>
            <b>{formatCOP(l.v)}</b>
          </div>
        ))}
        <div className="cbte__total">
          <span>TOTAL</span>
          <b>{formatCOP(totalConsumo)}</b>
        </div>

        {/* La propina va DESPUÉS del total del consumo y siempre se puede no pagar. */}
        {p.propina > 0 && (
          <>
            <div className="cbte__linea cbte__linea--prop">
              <span>Propina voluntaria</span>
              <b>{formatCOP(p.propina)}</b>
            </div>
            <div className="cbte__total">
              <span>RECIBIDO</span>
              <b>{formatCOP(p.total)}</b>
            </div>
          </>
        )}

        <hr className="cbte__sep" />
        <div className="cbte__meta">
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

        <footer className="cbte__pie">
          <p>La propina es voluntaria. Usted decide si la paga y por cuánto.</p>
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
