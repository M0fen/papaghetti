import { getCatalog } from "@/lib/catalog";
import KitchenBoard from "@/components/KitchenBoard";
import { haySesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function CocinaPage() {
  // Sin sesión no se arma nada: el login del layout no basta (ver haySesion en lib/sesion.ts).
  if (!(await haySesion())) return null;
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
