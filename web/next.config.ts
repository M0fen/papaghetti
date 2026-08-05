import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /* AVIF primero (auditoría): ~20-25% menos bytes que WebP en las fotos de comida.
       Solo se codifica en el primer MISS; después vive en la caché de Vercel. */
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        /* /public se sirve con max-age=0 por defecto en Vercel: el video del logo se
           revalidaba en CADA visita. Los media pesados son versionados-por-nombre →
           immutable un año. (Si cambias el video, cámbiale el nombre de archivo.) */
        source: "/:file*.(mp4|webm|webp|jpg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        /* Cabeceras de seguridad (auditoría): no había NINGUNA. Baratas, estándar
           y sin efecto sobre el diseño. */
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        /* El panel NO se embebe en ningún sitio: sin esto, un iframe invisible sobre
           el panel de un operario con sesión abierta puede hacerle pulsar botones
           (clickjacking) — incluido "Restaurar catálogo". */
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
