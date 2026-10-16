import { getCatalog } from "@/lib/catalog";
import { diaNegocio } from "@/lib/precios";
import { basesMaxDe, cobroBasesDe } from "@/lib/menu";
import { ajustesPapelDe } from "@/lib/papel";
import OrdersTable from "@/components/admin/OrdersTable";
import NuevoPedido from "@/components/admin/NuevoPedido";
import PreciosRapidos from "@/components/admin/PreciosRapidos";
import { haySesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  // Sin sesión no se arma nada: el login del layout no basta (ver haySesion en lib/sesion.ts).
  if (!(await haySesion())) return null;
  const cat = await getCatalog();
  /* LA CAJA ES HOY. Antes esta lista traía los ~2.000 pedidos del cerebro, así que
     "Cobrado" sumaba semanas enteras y no coincidía con el "Cobrado · hoy" del
     archivo de comprobantes: dos cifras del mismo día en el mismo panel. Se queda lo
     de hoy MÁS las deudas vivas de cualquier fecha, que son las únicas que todavía
     piden algo del cajero. Todo lo demás está en Comprobantes. */
  const hoy = diaNegocio();
  const delDia = cat.pedidos.filter(
    (p) => diaNegocio(p.creadoEn) === hoy || (p.pago === "pendiente" && p.estado !== "cancelado"),
  );
  const viejosPorCobrar = delDia.filter((p) => diaNegocio(p.creadoEn) !== hoy).length;
  return (
    <section>
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Pedidos</h1>
          <p>
            La caja de hoy: todo lo que ha entrado, con su estado y canal
            {viejosPorCobrar > 0
              ? `, más ${viejosPorCobrar} ${viejosPorCobrar === 1 ? "pedido de otro día que sigue" : "pedidos de otros días que siguen"} por cobrar`
              : ""}
            .
          </p>
        </div>
        {/* La caja es HOY. Lo de otros días (reimprimir, mandar, exportar) vive en el
            archivo de comprobantes; aquí solo el atajo para llegar. */}
        <a className="btn btn--ghost btnmini" href="/admin/comprobantes">
          <span>🗂️ Buscar un comprobante de otro día →</span>
        </a>
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
          adicionales={cat.ajustes.adicionales ?? []}
          basesMax={basesMaxDe(cat.ajustes)}
          cobroBases={cobroBasesDe(cat.ajustes)}
        />
        <PreciosRapidos
          bases={cat.bases}
          proteinas={cat.proteinas}
          toppings={cat.toppings}
          platos={cat.enredos}
        />
      </div>
      <OrdersTable
        pedidos={delDia}
        adicionales={cat.ajustes.adicionales ?? []}
        ajustesPapel={ajustesPapelDe(cat.ajustes)}
      />
    </section>
  );
}
