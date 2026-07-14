import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";

// Display: Bricolage Grotesque (stand-in libre de Recoleta, ver PLAN §3/§4.2)
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
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
