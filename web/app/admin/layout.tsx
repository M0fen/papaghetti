import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Login from "@/components/admin/Login";
import Sidebar from "@/components/admin/Sidebar";
import GhettIA from "@/components/admin/GhettIA";
import { getCatalog } from "@/lib/catalog";
import { logout, deshacerAction, rehacerAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Papaghetti · El cerebro",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = (await cookies()).get("pg_admin")?.value === "1";

  if (!authed) {
    return (
      <Suspense fallback={null}>
        <Login />
      </Suspense>
    );
  }

  const cat = await getCatalog();
  const puedeDeshacer = (cat.undo?.length ?? 0) > 0;
  const puedeRehacer = (cat.redo?.length ?? 0) > 0;
  const ultima = cat.historial?.[0]?.texto;

  return (
    <div className="adminx">
      <Sidebar />
      <div className="adminx__main">
        <header className="adminx__topbar">
          <div className="adminx__undo">
            <form action={deshacerAction}>
              <button
                className="undobtn"
                type="submit"
                disabled={!puedeDeshacer}
                title={puedeDeshacer ? `Deshacer: ${ultima ?? ""}` : "Nada que deshacer"}
              >
                ↩︎ <span>Deshacer</span>
              </button>
            </form>
            <form action={rehacerAction}>
              <button
                className="undobtn"
                type="submit"
                disabled={!puedeRehacer}
                title={puedeRehacer ? "Rehacer" : "Nada que rehacer"}
              >
                ↪︎ <span>Rehacer</span>
              </button>
            </form>
            <a href="/admin/historial" className="undobtn undobtn--hist" title="Ver historial">
              🕘 <span>Historial</span>
            </a>
          </div>
          <div className="adminx__topbar-r">
            <a href="/" target="_blank" rel="noopener noreferrer" className="adminx__viewsite">
              Ver el sitio ↗
            </a>
            <form action={logout}>
              <button className="adminx__logout" type="submit">
                Salir
              </button>
            </form>
          </div>
        </header>
        <div className="adminx__content">{children}</div>
      </div>
      <GhettIA />
    </div>
  );
}
