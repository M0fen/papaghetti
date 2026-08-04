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
    ];
  },
};

export default nextConfig;
