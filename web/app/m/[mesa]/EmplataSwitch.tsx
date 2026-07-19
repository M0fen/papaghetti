"use client";

/**
 * Decide la experiencia: el JUEGO canvas (por defecto — premium) o la versión 2D DOM
 * (fallback accesible: prefers-reduced-motion, device débil, ?2d=1, o botón PEDIR YA).
 * Misma data, mismo flujo de pedido — solo cambia la piel.
 */

import { useEffect, useState } from "react";
import type { Ingrediente } from "@/lib/menu";
import EmplataClient from "./EmplataClient";
import EmplataGame from "./EmplataGame";

export default function EmplataSwitch(props: {
  mesa: number;
  negocio: string;
  abierto: boolean;
  impuestoPct: number;
  incluidos: number;
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
}) {
  const [modo, setModo] = useState<"game" | "2d" | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      const force2d = url.searchParams.get("2d") === "1";
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const debil =
        (navigator as unknown as { deviceMemory?: number }).deviceMemory !== undefined &&
        (navigator as unknown as { deviceMemory?: number }).deviceMemory! < 2;
      setModo(force2d || reduce || debil ? "2d" : "game");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  if (modo === null) {
    // primer pintado instantáneo (LCP): shell mínima mientras decide (1 frame)
    return <div className="emp-root" style={{ minHeight: "100dvh" }} />;
  }
  if (modo === "2d") return <EmplataClient {...props} />;
  return <EmplataGame {...props} onModoRapido={() => setModo("2d")} />;
}
