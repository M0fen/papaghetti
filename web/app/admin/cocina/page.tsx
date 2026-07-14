import { getCatalog } from "@/lib/catalog";
import KitchenBoard from "@/components/KitchenBoard";

export const dynamic = "force-dynamic";

export default async function CocinaPage() {
  const cat = await getCatalog();
  return <KitchenBoard pedidos={cat.pedidos} />;
}
