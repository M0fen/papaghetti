import { getCatalog } from "@/lib/catalog";
import MenuEditor from "@/components/admin/MenuEditor";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
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
