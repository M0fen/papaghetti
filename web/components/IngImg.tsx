"use client";

/**
 * La imagen de un ingrediente, una sola fuente para todo el sitio.
 *
 * Usa el MISMO asset horneado que el juego (/food/{id}.webp) para que el armador
 * clásico, las cards del menú y el canvas hablen el mismo idioma visual. Si el
 * dueño agrega un ingrediente nuevo desde el panel y todavía no tiene arte, cae
 * al emoji del catálogo sin romper nada.
 */

import { useState } from "react";
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

  if (falla)
    return (
      <span className={claseEmoji} aria-hidden>
        {ing.emoji}
      </span>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
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
