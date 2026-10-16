import { getCatalog } from "@/lib/catalog";
import MenuEditor from "@/components/admin/MenuEditor";
import { haySesion } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  // Sin sesión no se arma nada: el login del layout no basta (ver haySesion en lib/sesion.ts).
  if (!(await haySesion())) return null;
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Menú</h1>
        <p>Precios y disponibilidad. Se reflejan al instante en el sitio.</p>
      </div>
      <MenuEditor catalog={cat} />
    </section>
  );
}
