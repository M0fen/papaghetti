import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import Comprobante from "@/components/admin/Comprobante";

export const dynamic = "force-dynamic";

export default async function TiquetePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imprimir?: string }>;
}) {
  const { id } = await params;
  const { imprimir } = await searchParams;
  const cat = await getCatalog();
  const pedido = cat.pedidos.find((p) => p.id === id.toUpperCase());
  if (!pedido) notFound();

  return (
    <section className="cbte-wrap">
      <Comprobante pedido={pedido} ajustes={cat.ajustes} auto={imprimir === "1"} />
    </section>
  );
}
