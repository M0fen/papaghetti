"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ESTADOS,
  estadoLabel,
  formatCOP,
  tipoLabel,
  tipoIcon,
  METODOS,
  metodoLabel,
  metodoEmoji,
  MOTIVOS_DESCUENTO,
  lineasDe,
  type AdicionalConfig,
  type Pedido,
  type EstadoPedido,
} from "@/lib/menu";
import type { AjustesPapel } from "@/lib/papel";
import {
  avanzarPedidoAction,
  retrocederPedidoAction,
  cobrarAction,
  cancelarAction,
  devolverAction,
  corregirCobroAction,
  agregarAdicionalAction,
  quitarAdicionalAction,
} from "@/app/pedido-actions";
import { esVenta } from "@/lib/menu";
/* El texto del comprobante para WhatsApp es el MISMO que el de la página del tiquete
   (con los avisos de anulado / dinero devuelto): antes aquí había una copia sin ellos. */
import { waComprobanteHref } from "@/lib/comprobantes";

type Filtro = "todos" | EstadoPedido | "porpagar";

const soloDigitos = (s: string) => s.replace(/\D/g, "");
/** "50000" → "50.000" mientras se escribe: un cero de más se ve antes de sumar. */
const conPuntos = (s: string) => {
  const d = soloDigitos(s).slice(0, 9);
  return d ? Number(d).toLocaleString("es-CO") : "";
};

export default function OrdersTable({
  pedidos,
  adicionales = [],
  ajustesPapel,
}: {
  pedidos: Pedido[];
  /** Los adicionales de un toque, configurados en Precios. */
  adicionales?: AdicionalConfig[];
  /** Lo que el comprobante necesita para el WhatsApp de cada pedido (sin el logo). */
  ajustesPapel?: AjustesPapel;
}) {
  void ajustesPapel; // (lo usa el WhatsApp del comprobante; ver la fase del comprobante)
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const router = useRouter();

  /* La caja era la ÚNICA de las tres pantallas operativas sin auto-refresco (cocina va
     a 8s y mesas a 15s): el cajero cobraba sobre una lista vieja, sin nada que le
     avisara de que estaba desactualizada. */
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(id);
  }, [router]);

  const filtrados =
    filtro === "todos"
      ? pedidos
      : filtro === "porpagar"
      ? pedidos.filter((p) => p.pago === "pendiente" && p.estado !== "cancelado")
      : pedidos.filter((p) => p.estado === filtro);

  /* "Cobrado" excluye los cancelados, igual que Finanzas. Antes esta pantalla los
     seguía sumando y las dos daban cifras distintas del mismo turno. */
  const cobrado = pedidos
    .filter((p) => p.pago === "pagado" && esVenta(p))
    .reduce((s, p) => s + p.total, 0);
  const porCobrar = pedidos
    .filter((p) => p.pago === "pendiente" && p.estado !== "cancelado")
    .reduce((s, p) => s + p.total, 0);

  return (
    <>
      <div className="filters">
        <button
          className={`fbtn ${filtro === "todos" ? "is-on" : ""}`}
          onClick={() => setFiltro("todos")}
        >
          Todos ({pedidos.length})
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e}
            className={`fbtn ${filtro === e ? "is-on" : ""}`}
            onClick={() => setFiltro(e)}
          >
            {estadoLabel[e]} ({pedidos.filter((p) => p.estado === e).length})
          </button>
        ))}
        <button
          className={`fbtn ${filtro === "porpagar" ? "is-on" : ""}`}
          onClick={() => setFiltro("porpagar")}
        >
          💵 Por pagar
        </button>
        <span className="filters__spacer" />
        <span className="muted">
          Cobrado <b style={{ color: "var(--pg-oro-ink)" }}>{formatCOP(cobrado)}</b> · Por
          cobrar <b style={{ color: "var(--pg-pomodoro)" }}>{formatCOP(porCobrar)}</b>
        </span>
      </div>

      <div className="orders">
        {filtrados.length === 0 && (
          <p className="muted" style={{ padding: 8 }}>
            Sin pedidos en este filtro.
          </p>
        )}
        {filtrados.map((p) => (
          <OrderCard key={p.id} p={p} adicionales={adicionales} />
        ))}
      </div>
    </>
  );
}

/**
 * SUMAR UN ADICIONAL A UNA CUENTA ABIERTA: lo que aparece a la hora de pagar ("dos
 * limonadas", "los almuerzos van aparte"). Va plegado: se usa a menudo, pero no en
 * cada cuenta, y abierto ocupaba media tarjeta.
 */
function AgregarAdicional({ p, adicionales }: { p: Pedido; adicionales: AdicionalConfig[] }) {
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [cocina, setCocina] = useState(false);
  /* Si el pedido ya salió de cocina, un adicional "a cocina" no lo vería nadie: la
     cocina ya cerró esa tarjeta. Ahí solo se cobra. */
  const enCocina = p.estado === "recibido" || p.estado === "cocina";
  const guardados = adicionales.filter((a) => a.activo !== false);
  return (
    <details className="ocard__adic">
      <summary className="btn btn--ghost btnmini">
        <span>＋ Adicional</span>
      </summary>
      <div className="ocard__adicbox">
        {guardados.length > 0 && (
          <div className="ocard__adicchips">
            {guardados.map((a) => (
              <form key={a.id} action={agregarAdicionalAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="nombre" value={a.nombre} />
                <input type="hidden" name="precio" value={a.precio} />
                {a.cocina && enCocina && <input type="hidden" name="cocina" value="1" />}
                <button type="submit" className="chipbtn">
                  {a.nombre} · {formatCOP(a.precio)}
                </button>
              </form>
            ))}
          </div>
        )}
        <form
          action={agregarAdicionalAction}
          className="adic__escrito"
          onSubmit={() =>
            setTimeout(() => {
              setConcepto("");
              setValor("");
              setCocina(false);
            }, 400)
          }
        >
          <input type="hidden" name="id" value={p.id} />
          <input
            name="nombre"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            maxLength={60}
            placeholder="Concepto · ej. Almuerzos"
            aria-label="Concepto del adicional"
            required
          />
          <label className="prq__precio">
            <span aria-hidden>$</span>
            <input
              name="precio"
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(conPuntos(e.target.value))}
              placeholder="50.000"
              aria-label="Valor del adicional"
              required
            />
          </label>
          {enCocina && (
            <label className="adic__check">
              <input
                type="checkbox"
                name="cocina"
                value="1"
                checked={cocina}
                onChange={(e) => setCocina(e.target.checked)}
              />
              A cocina
            </label>
          )}
          <button
            type="submit"
            className="btn btn--gold btnmini"
            disabled={!concepto.trim() || !(Number(soloDigitos(valor)) > 0)}
          >
            <span>+ Sumar a la cuenta</span>
          </button>
        </form>
      </div>
    </details>
  );
}

function OrderCard({ p, adicionales }: { p: Pedido; adicionales: AdicionalConfig[] }) {
  /* Una sola vez: arma el texto completo del comprobante y esta lista se repinta
     cada 10 segundos, con una tarjeta por pedido. */
  const wa = waComprobanteHref(p);
  const activo = p.estado !== "entregado" && p.estado !== "cancelado";
  /* Un pedido ENTREGADO por error (un toque de más en la cocina) no se podía ni
     devolver ni cancelar desde ninguna pantalla: el plato desaparecía del flujo y la
     cuenta se quedaba viva para siempre. Mientras no esté cobrado, siempre hay salida. */
  const corregible = p.estado !== "cancelado" && p.pago === "pendiente";
  /* El descuento se teclea en lo que deja de pagar el cliente. En los pedidos de antes
     se había guardado sobre la base sin impuesto, y así se muestra al corregirlos. */
  const descuentoVisto = p.impuestoIncluido ? (p.descuentoFinal ?? 0) : (p.descuento ?? 0);
  return (
    <article className={`ocard ${p.estado === "cancelado" ? "is-cancelado" : ""}`}>
      <div className="ocard__top">
        <b>#{p.id}</b>
        <span className="ocard__tipo">
          {tipoIcon[p.tipo]} {tipoLabel[p.tipo]}
          {p.referencia ? ` · ${p.referencia}` : ""}
        </span>
        <time suppressHydrationWarning>
          {new Date(p.creadoEn).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>

      {(p.cliente || p.telefono) && (
        <p className="ocard__ref">
          👤 {p.cliente || "Cliente"}
          {p.telefono && (
            <>
              {" · "}
              {/* Con clase: es el atajo para llamar al cliente de un domicilio que no
                  aparece, y medía 18px de alto. Se toca con prisa y con una mano. */}
              <a
                className="ocard__tel"
                href={`https://wa.me/${p.telefono.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📱 {p.telefono}
              </a>
            </>
          )}
        </p>
      )}

      {/* Renglón a renglón: una comanda de mesa puede llevar cuatro platos y el
          resumen de una línea los volvía ilegibles. */}
      <ul className="ocard__lineas">
        {lineasDe(p).map((l, i) => (
          <li key={i} className={l.adicional ? "is-adicional" : undefined}>
            {l.cantidad > 1 && <b className="ocard__x">{l.cantidad}×</b>}
            <span>
              {l.nombre}
              {l.detalle ? <em> {l.detalle}</em> : null}
              {/* El valor de un adicional se escribió a mano: se deja a la vista para
                  que un cero de más se note antes de cobrar. */}
              {l.adicional ? <em> · {formatCOP((l.precioFinal ?? l.precio) * l.cantidad)}</em> : null}
            </span>
            {l.adicional && corregible && (
              <form action={quitarAdicionalAction} className="ocard__quitar">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="indice" value={i} />
                <input type="hidden" name="nombre" value={l.nombre} />
                <button type="submit" aria-label={`Quitar ${l.nombre}`} title="Quitar de la cuenta">
                  ×
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <div className="ocard__badges">
        <span className={`badge badge--${p.estado}`}>{estadoLabel[p.estado]}</span>
        <span
          className={`badge ${
            p.pago === "devuelto" ? "badge--danger" : p.pago === "pagado" ? "badge--ok" : "badge--warn"
          }`}
        >
          {p.pago === "devuelto"
            ? "Dinero devuelto"
            : p.pago === "pagado"
              ? `Pagado · ${p.metodoPago ? metodoLabel[p.metodoPago] : ""}`
              : "Pendiente por pagar"}
        </span>
        <span className="ocard__total">{formatCOP(p.total)}</span>
      </div>

      <div className="ocard__actions">
        {activo && (
          <form action={avanzarPedidoAction}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="desde" value={p.estado} />
            <button className="btn btn--primary btnmini" type="submit">
              <span>Avanzar →</span>
            </button>
          </form>
        )}
        {corregible && <AgregarAdicional p={p} adicionales={adicionales} />}
        {p.pago === "pendiente" && p.estado !== "cancelado" && (
          <form action={cobrarAction} className="ocard__cobrar">
            <input type="hidden" name="id" value={p.id} />
            {/* AQUÍ NO SE COBRA PROPINA. Papaghetti no la maneja: no se sugiere, no se
                teclea y no sale en el papel. El campo se quitó entero en vez de solo
                esconderlo del comprobante — una propina cobrada que el papel no
                muestra es un total que no cuadra con lo que el cliente leyó.
                step="any" en el descuento: con step=500 el navegador rechazaba en
                silencio $1.200 y el cobro simplemente no ocurría, sin ningún mensaje. */}
            <label className="ocard__pd" title="En pesos que deja de pagar el cliente">
              Descuento
              <input type="number" name="descuento" min={0} step="any" defaultValue={0} aria-label="Descuento" />
            </label>
            {/* Un descuento sin motivo no entra. Era la única salida de dinero que no
                dejaba una palabra escrita. El servidor solo lo exige si hay descuento,
                así que el cobro normal no gana ni un toque. */}
            <label className="ocard__pd">
              Motivo
              <select name="motivoDescuento" defaultValue="" aria-label="Motivo del descuento">
                <option value="">—</option>
                {MOTIVOS_DESCUENTO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">Cobrar:</span>
            {METODOS.map((m) => (
              <button key={m} className="chipbtn" name="metodo" value={m} type="submit">
                {metodoEmoji[m]} {metodoLabel[m]}
              </button>
            ))}
          </form>
        )}
        {/* CORREGIR EL COBRO: teclear Nequi cuando fue efectivo es el error más común
            de un mostrador, y hasta ahora la única salida era "Devolver dinero", que
            anula la venta entera y le entrega al cliente un papel que dice ANULADO.
            Va plegado a propósito: se usa poco y no debe compartir renglón con nada. */}
        {p.pago === "pagado" && p.estado !== "cancelado" && (
          <details className="ocard__corregir">
            <summary className="btn btn--ghost btnmini">
              <span>✏️ Corregir cobro</span>
            </summary>
            <form action={corregirCobroAction}>
              <input type="hidden" name="id" value={p.id} />
              <label className="ocard__pd">
                Descuento
                <input type="number" name="descuento" min={0} step="any" defaultValue={descuentoVisto} aria-label="Descuento" />
              </label>
              <label className="ocard__pd">
                Motivo
                <select name="motivoDescuento" defaultValue={p.motivoDescuento ?? ""} aria-label="Motivo del descuento">
                  <option value="">—</option>
                  {MOTIVOS_DESCUENTO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <span className="muted">Se cobró de verdad con:</span>
              {METODOS.map((m) => (
                <button key={m} className={`chipbtn ${p.metodoPago === m ? "is-on" : ""}`} name="metodo" value={m} type="submit">
                  {metodoEmoji[m]} {metodoLabel[m]}
                </button>
              ))}
              <small className="muted">La hora del cobro no cambia: el dinero entró cuando entró.</small>
            </form>
          </details>
        )}

        {/* Devolver un paso: la única salida cuando la cocina avanzó de más. */}
        {corregible && p.estado !== "recibido" && (
          <form action={retrocederPedidoAction}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn btn--ghost btnmini" type="submit" title="Devolver al paso anterior">
              <span>← Devolver</span>
            </button>
          </form>
        )}

        {/* El comprobante para el cliente. Existe cobrado o no: muchas veces se pide
            la cuenta ANTES de pagar. */}
        <a
          className="btn btn--ghost btnmini"
          href={`/admin/tiquete/${p.id}`}
          target="_blank"
          rel="noopener"
        >
          <span>🧾 Comprobante</span>
        </a>
        {/* Y directo al WhatsApp que dejó el cliente en su pedido: un toque, sin
            copiar números a mano. */}
        {wa && (
          <a
            className="btn btn--ghost btnmini"
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            title={`Enviar el comprobante al ${p.telefono}`}
          >
            <span>📲 Enviar cuenta</span>
          </a>
        )}

        {/* Cancelar pide MOTIVO y confirma: estaba a un mis-tap de los chips de cobro,
            sin confirmación ninguna, y el motivo ahora queda en el historial. */}
        {corregible && (
          <form
            action={cancelarAction}
            style={{ marginLeft: "auto" }}
            onSubmit={(e) => {
              const motivo = window.prompt(
                `¿Por qué se cancela el pedido #${p.id}? (queda registrado)`,
              );
              if (motivo === null) {
                e.preventDefault();
                return;
              }
              (e.currentTarget.elements.namedItem("motivo") as HTMLInputElement).value =
                motivo;
            }}
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="motivo" defaultValue="" />
            <button className="ocard__cancel" type="submit">
              Cancelar
            </button>
          </form>
        )}

        {/* LA SALIDA QUE NO EXISTÍA. Un pedido ya cobrado no se podía anular: había que
            arreglarlo por fuera del sistema, que es como se pierde el cuadre. */}
        {p.pago === "pagado" && p.estado !== "cancelado" && (
          <form
            action={devolverAction}
            style={{ marginLeft: "auto" }}
            onSubmit={(e) => {
              const motivo = window.prompt(
                `Devolver ${formatCOP(p.total)} del pedido #${p.id}.\n\n` +
                  `¿Por qué? (queda en el historial y en el cuadre de caja)`,
              );
              if (motivo === null || !motivo.trim()) {
                e.preventDefault();
                return;
              }
              (e.currentTarget.elements.namedItem("motivo") as HTMLInputElement).value = motivo;
            }}
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="motivo" defaultValue="" />
            <button className="ocard__cancel" type="submit">
              Devolver dinero
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
