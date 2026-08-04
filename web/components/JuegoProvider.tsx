"use client";

/**
 * UN SOLO JUEGO PARA TODA LA CARTA.
 *
 * El overlay del juego vivía dentro de EnredaTuPlato, así que solo esa sección podía
 * abrirlo. Ahora lo posee este proveedor, que envuelve toda la página: la bifurcación
 * lo abre en blanco y la ficha de un enredo insignia lo abre YA EMPLATADO con ese plato.
 * Dos entradas, una sola experiencia — y un solo bloqueo de scroll.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Ajustes, Ingrediente } from "@/lib/menu";
import { TOPPINGS_INCLUIDOS } from "@/lib/menu";

/* PEREZOSO (auditoría): el juego NO viaja en el JS inicial del landing — su chunk
   (juego + CSS) se descarga al abrir. ssr:false: es Canvas puro, no tiene HTML útil. */
const EmplataGame = dynamic(() => import("./JuegoCanvas"), {
  ssr: false,
  loading: () => (
    <div className="enreda-cargando" role="status" aria-label="Preparando la cocina">
      <span className="enreda-cargando__hebra" aria-hidden />
      Calentando la olla…
    </div>
  ),
});

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

  /**
   * El callback de "camino rápido" vive en una REF, no en estado.
   *
   * Con estado se formaba un bucle infinito de render: onRapido guardaba un objeto nuevo
   * → cambiaba el estado → el proveedor re-renderizaba → pedirRapido cambiaba de identidad
   * → cambiaba el value del contexto → el efecto de EnredaTuPlato (deps [juego]) volvía a
   * llamar onRapido → vuelta a empezar. Una ref no dispara render: se corta el ciclo.
   */
  const rapidoRef = useRef<(() => void) | null>(null);

  const abrir = useCallback((p?: Precarga | null) => {
    setPrecarga(p ?? null);
    setAbierto(true);
  }, []);

  const pedirRapido = useCallback(() => {
    setAbierto(false);
    rapidoRef.current?.();
  }, []);

  const onRapido = useCallback((fn: () => void) => {
    rapidoRef.current = fn;
  }, []);

  // Value ESTABLE: si cambia de identidad, todos los consumidores re-renderizan.
  const api = useMemo<JuegoApi>(() => ({ abrir, pedirRapido, onRapido }), [abrir, pedirRapido, onRapido]);

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

  /**
   * Las listas de ingredientes son DEPENDENCIA de los efectos del juego (el horneado de
   * sprites y el bucle de render). Si se filtran durante el render, cada re-render del
   * proveedor crea arrays nuevos → los efectos se desmontan y vuelven a montar → la escena
   * se re-hornea entera. Eso era el PARPADEO. Memorizadas, la identidad no cambia.
   */
  const basesA = useMemo(() => bases.filter((i) => i.activo), [bases]);
  const proteinasA = useMemo(() => proteinas.filter((i) => i.activo), [proteinas]);
  const toppingsA = useMemo(() => toppings.filter((i) => i.activo), [toppings]);

  const salir = useCallback(() => setAbierto(false), []);

  return (
    <Ctx.Provider value={api}>
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
            bases={basesA}
            proteinas={proteinasA}
            toppings={toppingsA}
            canal="web"
            numMesas={ajustes.numMesas}
            costoDomicilio={ajustes.costoDomicilio}
            pedidoMinimo={ajustes.pedidoMinimo}
            precargar={precarga}
            onSalir={salir}
            onModoRapido={pedirRapido}
          />
        </div>
      )}
    </Ctx.Provider>
  );
}
