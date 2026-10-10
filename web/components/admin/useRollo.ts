"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ALINEACION_POR_DEFECTO,
  CLAVE_ALINEACION,
  CLAVE_ROLLO,
  ROLLO_POR_DEFECTO,
  alineacionValida,
  rolloValido,
  type Alineacion,
  type Rollo,
} from "@/lib/rollo";

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

/* Dónde cae el tiquete en el papel del driver: mismo mecanismo que el rollo, su propia
   clave. Lo eligen la página Impresora y lo leen el comprobante y el patrón. */
const EVENTO_ALINEAR = "pg-alinear";

function leerAlineacion(): Alineacion {
  try {
    return alineacionValida(localStorage.getItem(CLAVE_ALINEACION));
  } catch {
    return ALINEACION_POR_DEFECTO;
  }
}
function suscribirAlineacion(cb: () => void) {
  window.addEventListener(EVENTO_ALINEAR, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO_ALINEAR, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useAlineacion(): [Alineacion, (a: Alineacion) => void] {
  const alinear = useSyncExternalStore(suscribirAlineacion, leerAlineacion, () => ALINEACION_POR_DEFECTO);
  const elegir = useCallback((a: Alineacion) => {
    try {
      localStorage.setItem(CLAVE_ALINEACION, a);
    } catch {
      /* sin almacenamiento: se queda la de fábrica */
    }
    window.dispatchEvent(new Event(EVENTO_ALINEAR));
  }, []);
  return [alinear, elegir];
}
