"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CLAVE_ROLLO, ROLLO_POR_DEFECTO, rolloValido, type Rollo } from "@/lib/rollo";

/* El rollo elegido en ESTE equipo. Se lee con useSyncExternalStore (en el servidor
   vale el de fábrica) y se avisa a las demás partes de la página con un evento, así
   el selector de la página Impresora y el del comprobante nunca discrepan. */
const EVENTO = "pg-rollo";

function leer(): Rollo {
  try {
    return rolloValido(localStorage.getItem(CLAVE_ROLLO));
  } catch {
    return ROLLO_POR_DEFECTO;
  }
}
function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useRollo(): [Rollo, (r: Rollo) => void] {
  const rollo = useSyncExternalStore(suscribir, leer, () => ROLLO_POR_DEFECTO);
  const elegir = useCallback((r: Rollo) => {
    try {
      localStorage.setItem(CLAVE_ROLLO, String(r));
    } catch {
      /* sin almacenamiento: se queda el rollo de fábrica */
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return [rollo, elegir];
}
