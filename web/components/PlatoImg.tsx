"use client";

/**
 * LA FOTO DE UN PLATO DE PRECIO CERRADO.
 *
 * Diez de los doce platos de la carta —las ensaladas, los de a la carta y los
 * especiales— no se arman por partes, así que no había caja que dibujar y la ficha
 * caía en un emoji de plato 🍽️. En una carta que se vende por antojo, eso es el
 * hueco más caro que hay: nadie pide una ensalada napolitana de $37.500 mirando un
 * cubierto gris.
 *
 * El orden de preferencia, de más específico a más general:
 *   1. `foto` del catálogo — lo que el dueño subió desde /admin/menu, manda siempre.
 *   2. /platos/{id}.webp — la ilustración de la casa (carpeta aparte de /food para
 *      que un ingrediente y un plato con el mismo nombre nunca se pisen).
 *   3. lo que pase el llamador como `respaldo` (la caja armada, para los combos).
 *   4. el emoji, que ya no debería verse nunca.
 */

import { useCallback, useState, type ReactNode } from "react";
import type { EnredoInsignia } from "@/lib/menu";

export default function PlatoImg({
  enredo,
  className,
  respaldo,
}: {
  enredo: EnredoInsignia;
  className?: string;
  /** Qué pintar si no hay ninguna imagen: la caja del combo, normalmente. */
  respaldo?: ReactNode;
}) {
  const [falla, setFalla] = useState(false);

  /* POR QUÉ UN REF Y NO SOLO onError: la página llega del servidor con el <img> ya
     escrito, así que el navegador puede intentar (y fallar) la descarga ANTES de que
     React hidrate y enganche el manejador. Ese fallo no se vuelve a emitir: el
     resultado era un icono de imagen rota permanente, justo lo que se ve en las
     capturas. Al montar se comprueba el estado real del elemento. */
  const alMontar = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth === 0) setFalla(true);
  }, []);

  if (falla || !enredo.id) return <>{respaldo ?? null}</>;

  /* Una FOTO del dueño es rectangular y se recorta a la caja (`cover`); una
     ILUSTRACIÓN de la casa viene recortada con fondo transparente y hay que dejarla
     entera (`contain`, sin radio). Se distinguen aquí y no en cada llamador, que si
     no acabaría cada ficha inventándose su propia regla. */
  const propia = !enredo.foto;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={alMontar}
      className={`${className ?? ""}${propia ? " plato__foto--ilustra" : ""}`}
      src={enredo.foto || `/platos/${enredo.id}.webp`}
      alt={enredo.nombre}
      loading="lazy"
      decoding="async"
      onError={() => setFalla(true)}
    />
  );
}
