import { getCatalog } from "@/lib/catalog";
import OrdersTable from "@/components/admin/OrdersTable";
import NuevoPedido from "@/components/admin/NuevoPedido";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Pedidos</h1>
        <p>Todo lo que ha entrado, con su estado y canal.</p>
      </div>
      {/* El canal de mostrador y teléfono ya no se queda fuera del cerebro. */}
      <div style={{ marginBottom: 18 }}>
        <NuevoPedido
          bases={cat.bases}
          proteinas={cat.proteinas}
          toppings={cat.toppings}
          impuestoPct={cat.ajustes.impuestoPct ?? 0}
          costoDomicilio={cat.ajustes.costoDomicilio}
        />
      </div>
      <OrdersTable pedidos={cat.pedidos} />
    </section>
  );
}
