import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Login from "@/components/admin/Login";
import Sidebar from "@/components/admin/Sidebar";
import GhettIA from "@/components/admin/GhettIA";
import { getCatalog, persistenciaEnRiesgo, usuariosDelPanel } from "@/lib/catalog";
import { haySesion } from "@/lib/sesion";
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
  const authed = await haySesion();

  if (!authed) {
    // Los nombres salen de Ajustes → Usuarios del panel (con el respaldo si no hay).
    const usuarios = await usuariosDelPanel();
    return (
      <Suspense fallback={null}>
        <Login usuarios={usuarios} />
      </Suspense>
    );
  }

  const cat = await getCatalog();
  const puedeDeshacer = (cat.undo?.length ?? 0) > 0;
  const puedeRehacer = (cat.redo?.length ?? 0) > 0;
  /* Lo que de verdad va a deshacer (o rehacer): la etiqueta de la foto de arriba de la
     pila. Antes decía la última línea del historial, que casi nunca era eso. */
  const aDeshacer = cat.undo?.at(-1)?.etiqueta;
  const aRehacer = cat.redo?.at(-1)?.etiqueta;
  const aviso = (await cookies()).get("pg_aviso")?.value;
  const [avisoTipo, ...avisoResto] = (aviso ?? "").split(":");
  const avisoTexto = avisoResto.join(":");

  return (
    <div className="adminx">
      <Sidebar />
      <div className="adminx__main">
        {/* Sin Supabase en producción el cerebro escribe en /tmp: efímero y distinto
            por instancia. Es la clase de fallo que no se nota hasta que se perdió el
            turno entero, así que se avisa donde el dueño no pueda no verlo. */}
        {persistenciaEnRiesgo() && (
          <div className="adminx__alarma" role="alert">
            ⚠️ <b>Los pedidos NO se están guardando.</b> Falta conectar Supabase
            (variables <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
            <code>SUPABASE_SERVICE_ROLE</code> en Vercel). Todo lo que pase hoy se
            perderá al reiniciar el servidor.
          </div>
        )}
        {avisoTexto && (
          <div
            className={`adminx__aviso adminx__aviso--${avisoTipo === "ok" ? "ok" : "error"}`}
            role="status"
          >
            {avisoTipo === "ok" ? "✅" : "⚠️"} {avisoTexto}
          </div>
        )}
        <header className="adminx__topbar">
          <div className="adminx__undo">
            <form action={deshacerAction}>
              <button
                className="undobtn"
                type="submit"
                disabled={!puedeDeshacer}
                title={puedeDeshacer ? `Deshacer: ${aDeshacer ?? "el último cambio"}` : "Nada que deshacer"}
              >
                ↩︎ <span>Deshacer</span>
              </button>
            </form>
            <form action={rehacerAction}>
              <button
                className="undobtn"
                type="submit"
                disabled={!puedeRehacer}
                title={puedeRehacer ? `Rehacer: ${aRehacer ?? "el último cambio"}` : "Nada que rehacer"}
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
