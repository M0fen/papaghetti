import { getCatalog } from "@/lib/catalog";
import RecetasEditor from "@/components/admin/RecetasEditor";

export const dynamic = "force-dynamic";

export default async function RecetasPage() {
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Recetas · Ficha técnica</h1>
        <p>
          Define cuánta despensa consume cada plato (½ lb de papa, 0.2 paq de spaghetti…).
          Estandariza la porción, descuenta el <a href="/admin/inventario">inventario</a> real
          y te muestra el costo y margen de cada componente.
        </p>
      </div>
      <RecetasEditor
        bases={cat.bases}
        proteinas={cat.proteinas}
        toppings={cat.toppings}
        insumos={cat.insumos}
      />
    </section>
  );
}
