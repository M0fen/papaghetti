"use client";

import { useEffect, useState } from "react";

/* CTA STICKY móvil (práctica nombrada de los sitios que convierten — Metro Pizza,
 * caso ConvertFlow +39%): "Pedir" siempre al alcance del pulgar una vez que el
 * usuario pasó el hero. En desktop no existe (el nav ya lo lleva); durante el
 * juego lo esconde body.enreda-jugando como al resto del chrome. */
export default function StickyPedir() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const f = () => setOn(window.scrollY > 620);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  return (
    <a
      href="#arma"
      className={`sticky-pedir ${on ? "is-on" : ""}`}
      tabIndex={on ? 0 : -1}
      aria-hidden={!on}
    >
      <span>Arma tu enredo</span>
      <b aria-hidden>→</b>
    </a>
  );
}
