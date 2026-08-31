"use client";

/**
 * La imagen de un ingrediente, una sola fuente para todo el sitio.
 *
 * Usa el MISMO asset horneado que el juego (/food/{id}.webp) para que el armador
 * clásico, las cards del menú y el canvas hablen el mismo idioma visual. Si el
 * dueño agrega un ingrediente nuevo desde el panel y todavía no tiene arte, cae
 * al emoji del catálogo sin romper nada.
 */

import { useCallback, useState } from "react";
import type { Ingrediente } from "@/lib/menu";

export default function IngImg({
  ing,
  className,
  claseEmoji = "emoji",
}: {
  ing: Ingrediente;
  className?: string;
  claseEmoji?: string;
}) {
  const [falla, setFalla] = useState(false);

  /* POR QUÉ UN REF Y NO SOLO onError: la página llega del servidor con el <img> ya
     escrito, así que el navegador puede intentar la descarga —y fallar— ANTES de que
     React hidrate y enganche el manejador. Ese error no se vuelve a emitir nunca, y
     el respaldo al emoji no llegaba a dispararse: quedaba el icono de imagen rota
     para siempre. Al montar se mira el estado REAL del elemento y se decide. */
  const alMontar = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth === 0) setFalla(true);
  }, []);

  if (falla)
    return (
      <span className={claseEmoji} aria-hidden>
        {ing.emoji}
      </span>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={alMontar}
      className={className}
      src={ing.foto || `/food/${ing.id}.webp`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setFalla(true)}
    />
  );
}
