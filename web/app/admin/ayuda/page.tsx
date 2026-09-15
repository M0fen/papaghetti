import { getCatalog } from "@/lib/catalog";
import { formatCOP, TOPPINGS_INCLUIDOS } from "@/lib/menu";

export const dynamic = "force-dynamic";

/**
 * EL MANUAL DEL PRIMER DÍA.
 *
 * Escrito para leerse de pie, con prisa, antes de abrir. Nada de tour guiado que
 * secuestra la pantalla: una página que se puede consultar, imprimir y dejar en la
 * barra. Los números salen del catálogo de verdad, así que nunca queda desactualizada.
 */
export default async function AyudaPage() {
  const cat = await getCatalog();
  const a = cat.ajustes;

  return (
    <section className="ayuda">
      <div className="adminx__pageh">
        <h1>Cómo se usa esto</h1>
        <p>Lo esencial en dos minutos. Puedes imprimir esta página y dejarla en la barra.</p>
      </div>

      <div className="ayuda-acciones no-print">
        <a className="btn btn--ghost btnmini" href="/admin">
          <span>← Volver al resumen</span>
        </a>
      </div>

      {/* ---------- El día, de principio a fin ---------- */}
      <h2 className="ayuda__h2">El día, de principio a fin</h2>
      <ol className="ayuda-pasos">
        <li>
          <b>Abrir el negocio.</b> En <a href="/admin">Resumen</a>, arriba a la derecha, el
          botón dice <b>Abierto</b> o <b>Cerrado</b>. Con el local cerrado, la carta y el QR
          rechazan todos los pedidos: es el interruptor general.
        </li>
        <li>
          <b>Contar la despensa.</b> En <a href="/admin/inventario">Inventario</a> ajusta lo
          que de verdad hay. Cuando llegue mercancía, escribe la <b>cantidad</b> y{" "}
          <b>lo que pagaste</b>: el sistema aprende solo el costo por unidad y registra el
          gasto por el valor exacto del recibo.
        </li>
        <li>
          <b>Recibir pedidos.</b> Entran por tres puertas y todas caen en el mismo sitio:
          el <b>QR de la mesa</b>, el <b>sitio web</b>, y el botón{" "}
          <a href="/admin/pedidos">+ Nueva comanda</a> del panel (para el teléfono y el
          mostrador).
        </li>
        <li>
          <b>Cocinar.</b> La pantalla de <a href="/kds">Cocina</a> muestra los pedidos en
          orden de llegada, con el cronómetro corriendo. Toca el botón grande para
          avanzarlos: <i>A cocina → Listo → Entregar</i>. Si te pasas, el <b>←</b> devuelve.
        </li>
        <li>
          <b>Cobrar.</b> En <a href="/admin/pedidos">Pedidos</a>, elige el método y listo.
          Si el cliente quiere la cuenta, el botón <b>🧾 Comprobante</b> la imprime o la
          manda por WhatsApp.
        </li>
        <li>
          <b>Cerrar.</b> En <a href="/admin">Resumen</a>, <b>Cerrar caja y contar</b>: cuentas
          el cajón a ciegas y el sistema te dice la diferencia. Debajo, <b>Cierre de
          caja</b> desglosa lo cobrado por cada método para cuadrar el datáfono.
        </li>
      </ol>

      {/* ---------- Lo que más se pregunta ---------- */}
      <h2 className="ayuda__h2">Lo que más se pregunta</h2>
      <div className="ayuda-cards">
        <article className="ayuda-card">
          <h3>Se acabó algo</h3>
          <p>
            Ve a <a href="/admin/inventario">Inventario</a> y pon el insumo en <b>0</b> (lápiz
            → Stock actual). Todos los platos que lo usan se marcan agotados{" "}
            <b>al instante</b> en la carta y en el QR. Cuando vuelva a haber, súbelo y
            reaparecen solos.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>¿Dónde está el cliente?</h3>
          <p>
            Aquí no se asignan mesas. Cada pedido lleva escrito <b>dónde está</b> —“mesa del
            ventanal”, “barra, camisa azul”—. En <a href="/admin/mesas">Salón</a> se ven
            agrupados por ubicación, y se cobra la cuenta entera de un gesto. Si un pedido
            entró sin ubicación, ahí mismo se la pones.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>Me equivoqué</h3>
          <p>
            <b>Avancé de más:</b> el botón <b>← Devolver</b> en Pedidos o en Cocina.
            <br />
            <b>Cobré mal:</b> en el pedido, <b>✏️ Corregir cobro</b> y elige el método correcto.
            La hora del cobro no cambia y queda en el historial. No uses «Devolver dinero»
            para esto: eso anula la venta entera.
            <br />
            <b>El cliente se arrepintió:</b> <b>Cancelar</b> pide el motivo y, si no había
            entrado a cocina, devuelve los ingredientes a la despensa.
            <br />
            <b>Ya estaba cobrado y hay que devolver la plata:</b> <b>Devolver dinero</b>.
            Pide el motivo, saca la venta de los reportes y lo deja escrito en el
            historial y en el cuadre de caja.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>Una comanda, varios platos</h3>
          <p>
            En Pedidos, <b>+ Nueva comanda</b>. Vas agregando: platos de la carta con
            <b> + Plato de la carta</b>, o cajas armadas con <b>+ Agregar esta caja</b>.
            El <b>+</b> y el <b>−</b> de cada renglón cambian la cantidad. Una mesa de
            cuatro es <b>una</b> comanda: una sola cuenta, un solo cobro y un solo papel.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>Abrir y cerrar la caja</h3>
          <p>
            En el tablero: <b>Abrir caja</b> con el fondo con el que arrancas. Al cerrar,
            <b> cuentas primero</b> y solo después te decimos cuánto debería haber. Es a
            propósito: si ves la cifra antes, la encuentras. La diferencia queda
            guardada, así que un faltante se puede mirar al día siguiente.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>Cómo se cobra un enredo</h3>
          <p>
            Base + proteína(s) a precio completo y <b>cada acompañante a su precio</b>: en
            Papaghetti nada va por cuenta de la casa. Las <b>salsas van con el plato</b>
            porque valen $0 en la carta. Los combos, ensaladas y platos a la carta tienen{" "}
            <b>precio cerrado</b>.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>El comprobante del cliente</h3>
          <p>
            Botón <b>🧾 Comprobante</b> en cada pedido. Sale en papel de 80mm o en cualquier
            impresora, y se puede mandar por WhatsApp. <b>Ojo:</b> es un comprobante interno,{" "}
            <b>no</b> una factura electrónica ni un documento equivalente de la DIAN.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>¿Dónde están &quot;las facturas&quot;?</h3>
          <p>
            Lo que aquí se entrega se llama <b>comprobante de consumo</b> (no es factura
            electrónica). Todos, de cualquier día, están en{" "}
            <a href="/admin/comprobantes">Comprobantes</a>: se buscan por número, nombre o
            teléfono, se reimprimen, se mandan por WhatsApp y se <b>exportan a Excel</b> para
            el contador con lo cobrado por cada método. Si Excel abre el archivo en una sola
            columna: pestaña <b>Datos → Texto en columnas</b>, separador <b>punto y coma</b>.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>Se cayó internet</h3>
          <p>
            El panel necesita conexión: sin ella no hay caja ni comandas. <b>No pares la
            venta.</b> Anota en papel lo que salga: qué pidieron, dónde está el cliente,
            cuánto cobraste y con qué método. Cuando vuelva la señal, mete cada uno con{" "}
            <b>+ Nueva comanda</b> y cóbralo con el método que usaste. El pedido quedará
            con la hora de cuando lo tecleaste, no con la de la venta, así que anota
            también la hora si te importa el cuadre por horas.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>Un descuento pide motivo</h3>
          <p>
            Al cobrar, si escribes un descuento hay que elegir <b>por qué</b>. No es
            burocracia: regalar un plato mueve la misma plata que anular un pedido, y
            anular sí pedía motivo desde siempre. Así, a fin de mes se puede ver cuánto se
            regaló y por qué razón.
          </p>
        </article>

        <article className="ayuda-card">
          <h3>La tablet de la cocina</h3>
          <p>
            Abre <a href="/kds">/kds</a> y déjala puesta: es el mismo tablero sin el resto del
            panel, y mantiene la pantalla encendida sola. Activa el <b>🔔 sonido</b> una vez
            para que suene al entrar un pedido.
          </p>
        </article>
      </div>

      {/* ---------- Ficha del negocio ---------- */}
      <h2 className="ayuda__h2">Cómo está configurado hoy</h2>
      <ul className="ayuda-datos">
        <li>
          <span>Negocio</span>
          <b>{a.negocio || "—"}</b>
        </li>
        <li>
          <span>Impuesto que se cobra</span>
          <b>{a.impuestoPct ? `${a.impuestoPct}%` : "ninguno"}</b>
        </li>
        <li>
          <span>Acompañantes que no se cobran</span>
          <b>{TOPPINGS_INCLUIDOS === 0 ? "ninguno" : TOPPINGS_INCLUIDOS}</b>
        </li>
        <li>
          <span>Domicilio</span>
          <b>{formatCOP(a.costoDomicilio ?? 0)}</b>
        </li>
        <li>
          <span>Pedido mínimo a domicilio</span>
          <b>{formatCOP(a.pedidoMinimo ?? 0)}</b>
        </li>
        <li>
          <span>La carta tiene</span>
          <b>
            {cat.bases.length} bases · {cat.proteinas.length} proteínas ·{" "}
            {cat.toppings.filter((t) => t.categoria === "salsa").length} salsas ·{" "}
            {cat.toppings.filter((t) => t.categoria !== "salsa").length} acompañantes ·{" "}
            {cat.enredos.length} platos
          </b>
        </li>
      </ul>

      <p className="ayuda__pie">
        ¿Algo no cuadra? En <a href="/admin/ajustes">Ajustes</a> está la ficha del negocio y,
        al final, <b>dónde se está guardando todo</b>. Y el <b>Historial</b> guarda cada
        acción con su hora.
      </p>
    </section>
  );
}
