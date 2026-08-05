/**
 * JSON-LD del restaurante y su carta.
 *
 * El sitio no emitía NADA de datos estructurados: para Google era una página cualquiera,
 * sin horario, sin dirección, sin menú. Esto es lo que habilita los resultados
 * enriquecidos (ficha, horario, platos) y sale del MISMO catálogo que ve el cliente,
 * así que no puede quedar desincronizado.
 */

import type { CatalogoPublico } from "@/lib/catalog";
import { findIn } from "@/lib/menu";

const SITIO = "https://papaghetti.vercel.app";

export default function DatosEstructurados({ catalog }: { catalog: CatalogoPublico }) {
  const { ajustes } = catalog;
  const byId = (id: string) => findIn(catalog, id);
  const activos = (l: typeof catalog.bases) => l.filter((i) => i.activo && !i.agotado);

  const seccion = (name: string, items: typeof catalog.bases) => ({
    "@type": "MenuSection",
    name,
    hasMenuItem: items.map((i) => ({
      "@type": "MenuItem",
      name: i.nombre,
      offers: { "@type": "Offer", price: i.precio, priceCurrency: "COP" },
    })),
  });

  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: ajustes.negocio || "Papaghetti",
    description:
      "Comfort food premium para armar a tu gusto: base, proteína y toppings en una caja.",
    url: SITIO,
    servesCuisine: ["Colombiana", "Comfort food"],
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: ajustes.direccion,
      addressLocality: "Pereira",
      addressRegion: "Risaralda",
      addressCountry: "CO",
    },
    ...(ajustes.instagram ? { sameAs: [`https://instagram.com/${ajustes.instagram}`] } : {}),
    openingHours: ajustes.horarios,
    acceptsReservations: false,
    hasMenu: {
      "@type": "Menu",
      name: "La carta de Papaghetti",
      hasMenuSection: [
        seccion("Las bases", activos(catalog.bases)),
        seccion("Las proteínas", activos(catalog.proteinas)),
        seccion("Los toppings", activos(catalog.toppings)),
        {
          "@type": "MenuSection",
          name: "Los enredos insignia",
          hasMenuItem: catalog.enredos.map((e) => ({
            "@type": "MenuItem",
            name: e.nombre,
            description: [
              e.gancho,
              [byId(e.baseId)?.nombre, byId(e.proteinaId)?.nombre, ...e.toppingIds.map((t) => byId(t)?.nombre)]
                .filter(Boolean)
                .join(", "),
            ]
              .filter(Boolean)
              .join(" · "),
            offers: { "@type": "Offer", price: e.precio, priceCurrency: "COP" },
          })),
        },
      ],
    },
  };

  return (
    <script
      type="application/ld+json"
      // El JSON viene de nuestro propio catálogo (no de entrada del usuario).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
