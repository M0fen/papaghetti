import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SITIO_URL, metadatosDe, sitioDe } from "@/lib/sitio";

/* Display: FRAUNCES variable (ejes SOFT/WONK/opsz) — diseñada sobre Windsor/Cooper,
   la familia histórica de los restaurantes cálidos, y hermana tipográfica del logo
   (serif gorda y curva). Cierra la brecha logo↔sitio que Bricolage (geométrica,
   tech) dejaba abierta. Si algún día llega la licencia de Recoleta, sigue primera
   en la cadena de --pg-font-display. */
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

/* Cuerpo/UI: Manrope VARIABLE — un solo woff2 (~40KB) en vez de 5 instancias
   estáticas (~70KB). Mismos pesos disponibles (200-800), menos critical path. */
const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

/* LOS METADATOS DE RESPALDO, con los textos de fábrica (lib/sitio.ts: los literales viven
   en un solo lugar). La portada y /pedir ponen los de Ajustes → Sitio con su propio
   generateMetadata; aquí no se lee el cerebro a propósito: el layout envuelve también el
   juego (sin marca), el 404 y el panel, y leer aquí los obligaría a todos a esperar al
   almacén. */
export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  ...metadatosDe({ negocio: "Papaghetti", seo: sitioDe().seo }),
  keywords: [
    "Papaghetti",
    "arma tu bowl",
    "papa criolla",
    "spaghetti",
    "comida premium Pereira",
    "bowl",
  ],
};

export const viewport: Viewport = {
  themeColor: "#1E1611",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        {/* RUM real de clientes (gratis en Hobby, 10K puntos/mes): LCP/INP de campo
            en los teléfonos colombianos de verdad — la brújula de toda optimización */}
        <SpeedInsights />
      </body>
    </html>
  );
}
