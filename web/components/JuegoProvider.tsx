"use client";

/**
 * UN SOLO JUEGO PARA TODA LA CARTA.
 *
 * El overlay del juego vivía dentro de EnredaTuPlato, así que solo esa sección podía
 * abrirlo. Ahora lo posee este proveedor, que envuelve toda la página: la bifurcación
 * lo abre en blanco y la ficha de un enredo insignia lo abre YA EMPLATADO con ese plato.
 * Dos entradas, una sola experiencia — y un solo bloqueo de scroll.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Ajustes, Ingrediente } from "@/lib/menu";
import { TOPPINGS_INCLUIDOS } from "@/lib/menu";
import EmplataGame from "@/app/m/[mesa]/EmplataGame";
import "@/app/m/[mesa]/emplata.css";

export interface Precarga {
  baseId: string;
  proteinaId: string;
  toppingIds: string[];
}

interface JuegoApi {
  /** Abre el juego. Con precarga, la caja arranca con ese enredo ya servido. */
  abrir: (p?: Precarga | null) => void;
  /** Cierra el juego y pide el camino rápido (el armador clásico). */
  pedirRapido: () => void;
  onRapido: (fn: () => void) => void;
}

const Ctx = createContext<JuegoApi | null>(null);

export function useJuego(): JuegoApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useJuego fuera de <JuegoProvider>");
  return api;
}

/** Para componentes que también se usan fuera del proveedor (p. ej. una carta impresa). */
export function useJuegoOpcional(): JuegoApi | null {
  return useContext(Ctx);
}

export default function JuegoProvider({
  bases,
  proteinas,
  toppings,
  ajustes,
  children,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  ajustes: Ajustes;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [precarga, setPrecarga] = useState<Precarga | null>(null);
  const [rapidoFn, setRapidoFn] = useState<{ fn: () => void } | null>(null);

  const abrir = useCallback((p?: Precarga | null) => {
    setPrecarga(p ?? null);
    setAbierto(true);
  }, []);

  const pedirRapido = useCallback(() => {
    setAbierto(false);
    rapidoFn?.fn();
  }, [rapidoFn]);

  const onRapido = useCallback((fn: () => void) => setRapidoFn({ fn }), []);

  // Bloqueo de scroll con `position:fixed; top:-scrollY`: con el documento scrolleado,
  // el viewport visual y el de layout se separan en móvil y el juego (position:fixed)
  // aparecía corrido. Anclando el body a 0 vuelven a coincidir; al salir se devuelve
  // al usuario exactamente donde estaba.
  useEffect(() => {
    if (!abierto) return;
    const b = document.body;
    const y = window.scrollY;
    const prev = { position: b.style.position, top: b.style.top, width: b.style.width, overflow: b.style.overflow };
    b.style.position = "fixed";
    b.style.top = `-${y}px`;
    b.style.width = "100%";
    b.style.overflow = "hidden";
    b.classList.add("enreda-jugando");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      b.style.position = prev.position;
      b.style.top = prev.top;
      b.style.width = prev.width;
      b.style.overflow = prev.overflow;
      b.classList.remove("enreda-jugando");
      window.removeEventListener("keydown", onKey);
      window.scrollTo(0, y);
    };
  }, [abierto]);

  const activos = (l: Ingrediente[]) => l.filter((i) => i.activo);

  return (
    <Ctx.Provider value={{ abrir, pedirRapido, onRapido }}>
      {children}
      {abierto && (
        <div className="enreda-overlay">
          <EmplataGame
            /* la clave fuerza un montaje limpio por cada apertura: la precarga se sirve de nuevo */
            key={precarga ? `${precarga.baseId}-${precarga.proteinaId}` : "libre"}
            mesa={1}
            negocio={ajustes.negocio || "Papaghetti"}
            abierto={ajustes.abierto ?? true}
            impuestoPct={ajustes.impuestoPct ?? 0}
            incluidos={TOPPINGS_INCLUIDOS}
            bases={activos(bases)}
            proteinas={activos(proteinas)}
            toppings={activos(toppings)}
            canal="web"
            numMesas={ajustes.numMesas}
            costoDomicilio={ajustes.costoDomicilio}
            pedidoMinimo={ajustes.pedidoMinimo}
            precargar={precarga}
            onSalir={() => setAbierto(false)}
            onModoRapido={pedirRapido}
          />
        </div>
      )}
    </Ctx.Provider>
  );
}
