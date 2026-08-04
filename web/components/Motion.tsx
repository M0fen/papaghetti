"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

/**
 * LA ORQUESTA DE MOTION del landing (GSAP, gratis desde 2025 incluidos los plugins).
 * Presupuesto deliberado — la regla premium es 3-5 animaciones con propósito, no 20:
 *  1. Titulares de sección: entran palabra a palabra (SplitText con máscara).
 *  2. La foto héroe: micro-parallax al scroll (profundidad, no espectáculo).
 *  3. Los divisores-hebra: el fideo se dibuja al paso del scroll (scrub).
 * Todo dentro de matchMedia(no-preference): con reduced-motion no corre NADA y los
 * estilos CSS de siempre quedan intactos (sin JS tampoco se oculta nada: gsap.from
 * solo esconde una vez que va a animar).
 */
export default function Motion() {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
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
      // 2) micro-parallax de la foto héroe (la caja "se queda" un pelo al scrollear)
      const plato = document.querySelector(".hero__plato");
      if (plato) {
        gsap.to(plato, {
          y: -34,
          ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.5 },
        });
      }
      // 2b) los CHIPS de topping caen en cascada (el enredo se sirve solo)
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
      // 3) divisores-hebra dibujados por el scroll (se desactiva su transition CSS
      //    para que el scrub mande frame a frame)
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
    return () => mm.revert();
  });
  return null;
}
