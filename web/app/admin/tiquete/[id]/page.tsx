import { notFound } from "next/navigation";
import { getCatalog, buscarPedido } from "@/lib/catalog";
import Comprobante from "@/components/admin/Comprobante";

export const dynamic = "force-dynamic";

export default async function TiquetePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imprimir?: string; wa?: string; de?: string }>;
}) {
  const { id } = await params;
  const { imprimir, wa, de } = await searchParams;
  /* `buscarPedido` mira también el ARCHIVO: un comprobante de hace tres meses ya no
     está en el cerebro, pero se tiene que poder reimprimir igual. */
  const [cat, pedido] = await Promise.all([getCatalog(), buscarPedido(id.toUpperCase())]);
  if (!pedido) notFound();

  return (
    <section className="cbte-wrap">
      <Comprobante
        pedido={pedido}
        ajustes={cat.ajustes}
        auto={imprimir === "1"}
        wa={wa === "1"}
        volver={de === "comprobantes" ? "comprobantes" : "pedidos"}
      />
    </section>
  );
}
