"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import logo from "@/public/logo-papaghetti.webp";

const NAV = [
  { href: "/admin", label: "Resumen", icon: "◉", exact: true },
  { href: "/admin/pedidos", label: "Pedidos", icon: "🧾" },
  { href: "/admin/cocina", label: "Cocina", icon: "🍳" },
  { href: "/admin/mesas", label: "Salón", icon: "🍽️" },
  { href: "/admin/inventario", label: "Inventario", icon: "📦" },
  { href: "/admin/recetas", label: "Recetas", icon: "🧪" },
  { href: "/admin/menu", label: "Menú", icon: "🍝" },
  { href: "/admin/leads", label: "Leads", icon: "✨" },
  { href: "/admin/reportes", label: "Finanzas", icon: "💰" },
  { href: "/admin/historial", label: "Historial", icon: "🕘" },
  { href: "/admin/ajustes", label: "Ajustes", icon: "⚙️" },
  { href: "/admin/ayuda", label: "Ayuda", icon: "❓" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="adminx__side">
      {/* El logo de verdad, no el texto. Estaba en assets-src sin usar. */}
      <a href="/admin" className="adminx__brand" aria-label="Papaghetti · el cerebro">
        <Image src={logo} alt="Papaghetti" priority className="adminx__logo" />
      </a>
      <span className="adminx__kicker">El cerebro</span>
      <nav className="adminx__nav">
        {NAV.map((n) => {
          const active = n.exact ? path === n.href : path.startsWith(n.href);
          return (
            <a
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`adminx__link ${active ? "is-active" : ""}`}
            >
              <span className="adminx__ico" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
