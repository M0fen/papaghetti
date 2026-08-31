import { getCatalog } from "@/lib/catalog";
import KitchenBoard from "@/components/KitchenBoard";

export const dynamic = "force-dynamic";

export default async function CocinaPage() {
  const cat = await getCatalog();
  return (
    <>
      {/* La tablet de la cocina se abre en /kds: mismo tablero, sin el cromo del
          panel (ni el botón Deshacer al alcance de una mano con harina). */}
      <div className="kds-abrir">
        <a href="/kds" className="btn btn--ghost btnmini" target="_blank" rel="noopener">
          <span>⛶ Abrir en pantalla completa</span>
        </a>
      </div>
      <KitchenBoard pedidos={cat.pedidos} />
    </>
  );
}
