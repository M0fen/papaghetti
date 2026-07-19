import { getCatalog } from "@/lib/catalog";
import TablesBoard from "@/components/admin/TablesBoard";

export const dynamic = "force-dynamic";

export default async function MesasPage() {
  const cat = await getCatalog();
  const numMesas = cat.ajustes.numMesas;
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Mesas</h1>
        <p>Ocupación del salón en vivo. La mesa se asigna al crear el pedido.</p>
      </div>
      <TablesBoard pedidos={cat.pedidos} numMesas={numMesas} />

      {/* EMPLATA: enlaces de pedido por QR — imprime un QR por mesa apuntando a /m/N */}
      <div className="adminx__pageh" style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Pedido QR por mesa</h2>
        <p style={{ margin: "4px 0 10px" }}>
          Cada mesa tiene su enlace <code>/m/N</code> — genera el QR con ese URL y pégalo en la mesa.
          El pedido del cliente entra solo a Cocina.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Array.from({ length: numMesas }, (_, k) => (
            <a
              key={k + 1}
              href={`/m/${k + 1}`}
              target="_blank"
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1.5px solid rgba(30,22,17,.18)",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              🍽️ Mesa {k + 1} → /m/{k + 1}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
