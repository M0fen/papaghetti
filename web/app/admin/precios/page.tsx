import { getCatalog } from "@/lib/catalog";
import PreciosRapidos from "@/components/admin/PreciosRapidos";

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
 */
export default async function PreciosPage() {
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Precios</h1>
        <p>
          Lo que cobra el menú interactivo, la web y la caja. Cambia un número, guarda, y
          ya está en el QR.
        </p>
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
