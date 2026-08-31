import { redirect } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { haySesion } from "@/lib/sesion";
import KitchenBoard from "@/components/KitchenBoard";
import DespiertaPantalla from "@/components/admin/DespiertaPantalla";

export const dynamic = "force-dynamic";

export default async function KdsPage() {
  // Misma puerta que el resto del panel: los pedidos llevan nombre y teléfono.
  if (!(await haySesion())) redirect("/admin");
  const cat = await getCatalog();
  return (
    <>
      {/* La tablet no puede apagarse a mitad del servicio. */}
      <DespiertaPantalla />
      <KitchenBoard pedidos={cat.pedidos} />
      <a className="kds-salida" href="/admin/cocina" title="Volver al panel completo">
        ✕
      </a>
    </>
  );
}
