import { getCatalog } from "@/lib/catalog";
import { insumoBajo } from "@/lib/menu";
import InsumosTable from "@/components/admin/InsumosTable";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const cat = await getCatalog();
  const alerta = cat.insumos.filter(insumoBajo).length;

  return (
    <section>
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Inventario · Despensa</h1>
          <p>
            Materia prima real (lb, paquetes, unidades…). Cada venta descuenta según la{" "}
            <a href="/admin/recetas">receta</a> de cada plato. A falta de insumo, el plato se
            agota solo.
          </p>
        </div>
        {alerta > 0 && (
          <span className="badge badge--warn">{alerta} por reponer</span>
        )}
      </div>
      <InsumosTable insumos={cat.insumos} />
    </section>
  );
}
