import { getCatalog } from "@/lib/catalog";
import OrdersTable from "@/components/admin/OrdersTable";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Pedidos</h1>
        <p>Todo lo que ha entrado, con su estado y canal.</p>
      </div>
      <OrdersTable pedidos={cat.pedidos} />
    </section>
  );
}
