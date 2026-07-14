import { getCatalog } from "@/lib/catalog";
import TablesBoard from "@/components/admin/TablesBoard";

export const dynamic = "force-dynamic";

export default async function MesasPage() {
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Mesas</h1>
        <p>Ocupación del salón en vivo. La mesa se asigna al crear el pedido.</p>
      </div>
      <TablesBoard pedidos={cat.pedidos} numMesas={cat.ajustes.numMesas} />
    </section>
  );
}
