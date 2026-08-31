"use client";

import { useEffect } from "react";

/**
 * MANTIENE LA TABLET DESPIERTA mientras dure el servicio.
 *
 * Una pantalla de cocina que se apaga a los dos minutos obliga a tocarla con las
 * manos llenas, y en ese rato los pedidos entran a ciegas. La Screen Wake Lock API
 * lo evita sin tocar los ajustes del dispositivo.
 *
 * El bloqueo se PIERDE al minimizar o cambiar de pestaña, así que hay que volver a
 * pedirlo cuando la pantalla vuelve a estar visible — sin eso funciona la primera
 * vez y deja de funcionar en cuanto alguien mira otra cosa.
 */
export default function DespiertaPantalla() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return; // navegador sin soporte: no pasa nada

    let sentinel: Sentinel | null = null;
    let vivo = true;

    const pedir = async () => {
      try {
        if (document.visibilityState === "visible") {
          sentinel = await nav.wakeLock!.request("screen");
        }
      } catch {
        /* el navegador puede negarlo (batería baja): el tablero sigue igual */
      }
    };
    const alVolver = () => {
      if (vivo && document.visibilityState === "visible") void pedir();
    };

    void pedir();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  return null;
}
