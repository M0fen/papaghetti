/**
 * JSON-LD del restaurante y su carta.
 *
 * El sitio no emitía NADA de datos estructurados: para Google era una página cualquiera,
 * sin horario, sin dirección, sin menú. Esto es lo que habilita los resultados
 * enriquecidos (ficha, horario, platos) y sale del MISMO catálogo que ve el cliente,
 * así que no puede quedar desincronizado.
 *
 * Los datos del negocio (descripción, ciudad, redes, horario) salen de Ajustes → Sitio.
 * Las reseñas NO van aquí nunca (ni `review` ni `aggregateRating`): Google no acepta que
 * un negocio publique las suyas sobre sí mismo.
 */

import type { CatalogoPublico } from "@/lib/catalog";
import { findIn } from "@/lib/menu";
import { SITIO_URL as SITIO, jsonLdSeguro, telHref, type SitioPublico } from "@/lib/sitio";

export default function DatosEstructurados({ catalog, sitio }: { catalog: CatalogoPublico; sitio: SitioPublico }) {
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

  const telefono = sitio.telefono ? telHref(sitio.telefono).replace(/^tel:/, "") : "";
  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: sitio.negocio,
    description: sitio.seo.descripcionGoogle,
    url: SITIO,
    servesCuisine: ["Colombiana", "Comfort food"],
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: sitio.direccion,
      addressLocality: sitio.ciudad,
      addressRegion: sitio.departamento,
      addressCountry: "CO",
    },
    // Solo si el dueño decidió mostrarlo en el sitio: lo que Google sabe, lo ve el cliente.
    ...(telefono ? { telephone: telefono } : {}),
    ...(sitio.sameAs.length ? { sameAs: sitio.sameAs } : {}),
    /* Google solo entiende «Mo-Su 12:00-22:00». Si el dueño escribió el horario para
       Google, va ese; si no, el texto del sitio, como siempre. */
    openingHours: sitio.seo.horarioGoogle.length
      ? sitio.seo.horarioGoogle.length === 1
        ? sitio.seo.horarioGoogle[0]
        : sitio.seo.horarioGoogle
      : sitio.horarios,
    acceptsReservations: false,
    hasMenu: {
      "@type": "Menu",
      name: `La carta de ${sitio.negocio}`,
      hasMenuSection: [
        seccion("Las bases", activos(catalog.bases)),
        seccion("Las proteínas", activos(catalog.proteinas)),
        seccion("Los toppings", activos(catalog.toppings)),
        {
          "@type": "MenuSection",
          name: "Los enredos insignia",
          // Un plato apagado no se ofrece: Google lo mostraba y el pedido se rechazaba.
          hasMenuItem: catalog.enredos
            .filter((e) => e.activo !== false)
            .map((e) => ({
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
      /* Con «<» escapado: los nombres, descripciones y textos los escriben personas en el
         panel, y un «</script>» cerraba la etiqueta (ver jsonLdSeguro). */
      dangerouslySetInnerHTML={{ __html: jsonLdSeguro(data) }}
    />
  );
}
