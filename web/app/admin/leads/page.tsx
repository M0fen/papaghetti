import { getCatalog } from "@/lib/catalog";
import LeadsTable from "@/components/admin/LeadsTable";
import { haySesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  // Sin sesión no se arma nada: el login del layout no basta (ver haySesion en lib/sesion.ts).
  if (!(await haySesion())) return null;
  const cat = await getCatalog();
  const nuevos = cat.leads.filter((l) => l.estado === "nuevo").length;
  return (
    <section>
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Leads</h1>
          <p>Quienes dejaron sus datos en el sitio. Hazles seguimiento.</p>
        </div>
        {nuevos > 0 && <span className="badge badge--warn">{nuevos} sin contactar</span>}
      </div>
      <LeadsTable leads={cat.leads} />
    </section>
  );
}
