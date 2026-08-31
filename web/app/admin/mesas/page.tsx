import { getCatalog } from "@/lib/catalog";
import TablesBoard from "@/components/admin/TablesBoard";

export const dynamic = "force-dynamic";

export default async function MesasPage() {
  const cat = await getCatalog();
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Salón</h1>
        <p>
          Quién está comiendo ahora y quién debe. Aquí no se asignan mesas: cada pedido
          lleva escrito <b>dónde está el cliente</b>.
        </p>
      </div>
      <TablesBoard pedidos={cat.pedidos} />

      {/* EMPLATA: el QR de la carta. Un solo enlace basta — se puede imprimir y pegar
          en varias mesas, porque el pedido ya no depende de un número. */}
      <div className="adminx__pageh" style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>El QR de la carta</h2>
        <p style={{ margin: "4px 0 10px" }}>
          Genera un código QR con este enlace y pégalo en las mesas. Puede ser el{" "}
          <b>mismo QR para todas</b>: el cliente escribe dónde está al pedir, y su pedido
          entra directo a Cocina.
        </p>
        <a href="/m/1" target="_blank" className="btn btn--primary btnmini">
          <span>🍽️ Abrir la carta del cliente → /m/1</span>
        </a>
      </div>
    </section>
  );
}
