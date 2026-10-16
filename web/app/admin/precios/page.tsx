import { getCatalog } from "@/lib/catalog";
import { basesMaxDe, cobroBasesDe, formatCOP } from "@/lib/menu";
import { listasAjusteDe } from "@/lib/precios";
import PreciosRapidos from "@/components/admin/PreciosRapidos";
import AdicionalesEditor from "@/components/admin/AdicionalesEditor";
import AjustePrecios from "@/components/admin/AjustePrecios";
import { haySesion } from "@/lib/sesion";

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
 * impuesto va encima) y los ADICIONALES: lo que se cobra y no es un plato. Después,
 * SUBIR O BAJAR PRECIOS de una vez (cuando sube el proveedor), y al final la hoja de
 * siempre, producto por producto.
 */
export default async function PreciosPage() {
  // Sin sesión no se arma nada: el login del layout no basta (ver haySesion en lib/sesion.ts).
  if (!(await haySesion())) return null;
  const cat = await getCatalog();
  const a = cat.ajustes;
  const pct = a.impuestoPct ?? 0;
  const dosBases = basesMaxDe(a) === 2;
  const modoBases = cobroBasesDe(a);
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
            <a href="/admin/ajustes#cobro">Cambiar →</a>
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
            {/* Se dice aquí porque es una regla de PRECIO: con dos bases, el mismo plato
                puede valer una base o dos según Ajustes. */}
            <li>
              {dosBases ? (
                <>
                  <b>Dos bases en un plato:</b> se puede.{" "}
                  {modoBases === "mitad"
                    ? "Se cobra mitad y mitad: la base más cara, y cada una va en media porción."
                    : "Se cobran las dos completas, cada una a su precio y en porción entera."}
                </>
              ) : (
                <>
                  <b>Una base por plato:</b> el cliente no puede elegir dos.
                </>
              )}{" "}
              <a href="/admin/ajustes#cobro" className="cobro-reglas__cambiar">
                Cambiar en Ajustes
              </a>
            </li>
          </ul>
        </section>

        <AdicionalesEditor adicionales={a.adicionales ?? []} />
      </div>

      {/* Solo lo que la cuenta necesita (nombre, precio, si está en la carta): nada de
          fotos ni recetas en el HTML. */}
      <AjustePrecios listas={listasAjusteDe(cat)} />

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
