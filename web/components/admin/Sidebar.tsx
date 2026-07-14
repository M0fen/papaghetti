"use client";

import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Resumen", icon: "◉", exact: true },
  { href: "/admin/pedidos", label: "Pedidos", icon: "🧾" },
  { href: "/admin/cocina", label: "Cocina", icon: "🍳" },
  { href: "/admin/mesas", label: "Mesas", icon: "🍽️" },
  { href: "/admin/inventario", label: "Inventario", icon: "📦" },
  { href: "/admin/recetas", label: "Recetas", icon: "🧪" },
  { href: "/admin/menu", label: "Menú", icon: "🍝" },
  { href: "/admin/leads", label: "Leads", icon: "✨" },
  { href: "/admin/reportes", label: "Finanzas", icon: "💰" },
  { href: "/admin/historial", label: "Historial", icon: "🕘" },
  { href: "/admin/ajustes", label: "Ajustes", icon: "⚙️" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="adminx__side">
      <a href="/admin" className="adminx__brand">
        Papa<span className="dot">·</span>ghetti
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
