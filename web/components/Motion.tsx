"use client";

import { useEffect } from "react";

/**
 * LA ORQUESTA DE MOTION del landing — GSAP DIFERIDO (auditoría de optimización):
 * el import estático metía ~45KB gz en el chunk de la ruta y alargaba la hidratación
 * (long tasks = riesgo INP). Ahora GSAP llega en su propio chunk DESPUÉS del load;
 * los titulares son visibles desde el HTML y solo se esconden cuando van a animar.
 * Presupuesto deliberado (la regla premium es 3-5 animaciones con propósito):
 *  1. Titulares de sección palabra a palabra (SplitText con máscara).
 *  2. Micro-parallax de la foto héroe.
 *  2b. Cascada de los chips de la carta.
 *  3. Divisores-hebra dibujados por el scroll (scrub).
 * Con prefers-reduced-motion no se descarga NADA de GSAP.
 */
export default function Motion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let muerto = false;
    let limpiar: (() => void) | null = null;

    (async () => {
      const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ]);
      if (muerto) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);

      const ctx = gsap.context(() => {
        // 1) TITULARES palabra a palabra
        document.querySelectorAll<HTMLElement>("main h2").forEach((h) => {
          const split = SplitText.create(h, { type: "words", mask: "words" });
          gsap.from(split.words, {
            yPercent: 115,
            duration: 0.68,
            ease: "power3.out",
            stagger: 0.05,
            scrollTrigger: { trigger: h, start: "top 88%", once: true },
          });
        });
        // 2) micro-parallax de la foto héroe
        const plato = document.querySelector(".hero__plato");
        if (plato) {
          gsap.to(plato, {
            y: -34,
            ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.5 },
          });
        }
        // 2b) los CHIPS de topping caen en cascada
        const chips = gsap.utils.toArray<HTMLElement>(".carta__chip");
        if (chips.length) {
          gsap.from(chips, {
            y: 16,
            opacity: 0,
            duration: 0.45,
            ease: "power2.out",
            stagger: { each: 0.035, from: "start" },
            scrollTrigger: { trigger: ".carta__chips", start: "top 88%", once: true },
          });
        }
        // 3) divisores-hebra dibujados por el scroll
        document.querySelectorAll<SVGPathElement>(".divider .hebra-draw-path").forEach((p) => {
          gsap.set(p, { transition: "none" });
          gsap.fromTo(
            p,
            { strokeDashoffset: 1 },
            {
              strokeDashoffset: 0,
              ease: "none",
              scrollTrigger: { trigger: p, start: "top 96%", end: "top 52%", scrub: 0.6 },
            },
          );
        });
      });
      limpiar = () => ctx.revert();
    })();

    return () => {
      muerto = true;
      limpiar?.();
    };
  }, []);

  return null;
}
