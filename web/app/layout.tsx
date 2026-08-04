import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

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

// Cuerpo/UI: Manrope (stand-in libre de Satoshi/General Sans)
const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://papaghetti.vercel.app"),
  title: "Papaghetti — Un delicioso enredo",
  description:
    "Arma tu enredo: papa criolla, papa francesa o spaghetti + proteína + toppings. Comfort food premium para armar a tu gusto, en Pereira.",
  keywords: [
    "Papaghetti",
    "arma tu bowl",
    "papa criolla",
    "spaghetti",
    "comida premium Pereira",
    "bowl",
  ],
  openGraph: {
    title: "Papaghetti — Un delicioso enredo",
    description: "Arma tu enredo. Papa + pasta + tu toque. Pereira.",
    locale: "es_CO",
    type: "website",
    siteName: "Papaghetti",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Papaghetti" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Papaghetti — Un delicioso enredo",
    description: "Arma tu enredo. Papa + pasta + tu toque. Pereira.",
    images: ["/og.jpg"],
  },
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
      <body>{children}</body>
    </html>
  );
}
