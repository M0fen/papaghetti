import { getCatalog } from "@/lib/catalog";
import { formatCOP } from "@/lib/menu";
import PreciosRapidos from "@/components/admin/PreciosRapidos";
import AdicionalesEditor from "@/components/admin/AdicionalesEditor";

export const dynamic = "force-dynamic";

/**
 * LOS PRECIOS DEL MENÚ, CON ENTRADA PROPIA.
 *
 * El dueño pidió poder "elegir los precios del menú interactivo con facilidad desde
 * el panel". Existía el lápiz de Pedidos, pero escondido detrás de otro botón y
 * pensado para corregir un precio a la carrera. Esto es la misma hoja, como página:
 * se llega desde el menú lateral, siempre abierta, para sentarse a repasar la carta
 * entera. Cada precio guardado aquí se aplica en el acto al menú interactivo del QR
 * (/pedir), a la página web y a los pedidos nuevos.
 *
 * Arriba, las REGLAS con las que se cobra (para que nadie tenga que adivinar si el
 * impuesto va encima) y los ADICIONALES: lo que se cobra y no es un plato.
 */
export default async function PreciosPage() {
  const cat = await getCatalog();
  const a = cat.ajustes;
  const pct = a.impuestoPct ?? 0;
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Precios</h1>
        <p>
          Lo que cobra el menú interactivo, la web y la caja. Cambia un número, guarda, y
          ya está en el QR.
        </p>
      </div>

      <div className="precios__arriba">
        <section className="card cobro-reglas">
          <div className="card__h">
            <h2>Cómo se cobra</h2>
            <a href="/admin/ajustes">Cambiar →</a>
          </div>
          <ul>
            <li>
              <b>El precio que ves es el que paga el cliente.</b>{" "}
              {pct > 0
                ? `Todos los precios de esta página ya llevan el impuesto al consumo (${pct}%) adentro; el comprobante lo muestra como "incluido", no lo suma.`
                : "No se está cobrando impuesto: el total es la suma de la carta."}
            </li>
            <li>
              <b>Domicilio</b> {formatCOP(a.costoDomicilio ?? 0)}, aparte y solo en pedidos a
              domicilio. Pedido mínimo a domicilio: {formatCOP(a.pedidoMinimo ?? 0)}.
            </li>
            <li>
              <b>Descuentos</b> en la caja, al cobrar: se teclean en pesos que deja de pagar el
              cliente y siempre con su motivo.
            </li>
          </ul>
        </section>

        <AdicionalesEditor adicionales={a.adicionales ?? []} />
      </div>

      <PreciosRapidos
        inline
        bases={cat.bases}
        proteinas={cat.proteinas}
        toppings={cat.toppings}
        platos={cat.enredos}
      />
    </section>
  );
}
