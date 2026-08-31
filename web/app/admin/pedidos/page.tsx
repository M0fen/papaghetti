import { getCatalog } from "@/lib/catalog";
import OrdersTable from "@/components/admin/OrdersTable";
import NuevoPedido from "@/components/admin/NuevoPedido";
import PreciosRapidos from "@/components/admin/PreciosRapidos";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Pedidos</h1>
        <p>Todo lo que ha entrado, con su estado y canal.</p>
      </div>
      {/* El canal de mostrador y teléfono ya no se queda fuera del cerebro; y el lápiz
          deja corregir un precio aquí mismo, sin dejar de mirar la cola. */}
      <div className="pedidos__acciones">
        <NuevoPedido
          bases={cat.bases}
          proteinas={cat.proteinas}
          toppings={cat.toppings}
          platos={cat.enredos}
          impuestoPct={cat.ajustes.impuestoPct ?? 0}
          costoDomicilio={cat.ajustes.costoDomicilio}
        />
        <PreciosRapidos
          bases={cat.bases}
          proteinas={cat.proteinas}
          toppings={cat.toppings}
          platos={cat.enredos}
        />
      </div>
      <OrdersTable pedidos={cat.pedidos} />
    </section>
  );
}
