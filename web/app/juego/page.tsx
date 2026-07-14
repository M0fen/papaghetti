import type { Metadata, Viewport } from "next";
import GameClient from "./GameClient";

/**
 * /juego — EL ENREDO.
 *
 * Server Component: only ships metadata + viewport + the client shell. The actual game
 * (canvas + engine) is loaded client-only from inside <GameClient/> via a dynamic import
 * with ssr:false semantics, so the WebGL/Canvas engine never enters the main bundle and
 * never runs on the server.
 *
 * UNBRANDED (Prompt Maestro §12): the game is "EL ENREDO" — no logo, no restaurant name.
 */
export const metadata: Metadata = {
  title: "EL ENREDO",
  description: "Un juego de cocina. Cierra el enredo, sube el multiplicador, sirve.",
  manifest: "/juego/manifest.webmanifest",
  // Mystery launch: keep it out of the index until the reveal.
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EL ENREDO",
  },
  icons: { icon: "/juego/icon.svg", apple: "/juego/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1E1611",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Draw under the notch/home-indicator; the layout re-insets with env(safe-area-*).
  viewportFit: "cover",
};

export default function JuegoPage() {
  return <GameClient />;
}
