"use client";

import { useEffect, useRef } from "react";
import type { CSSVars } from "@/lib/cssVars";

/** La hebra se convierte en barra de progreso lateral y se "enreda" al bajar. */
export default function ScrollHebra() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const p = max > 0 ? doc.scrollTop / max : 0;
      el.style.setProperty("--progress", String(Math.min(1, Math.max(0, p))));
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg
      ref={ref}
      className="scroll-hebra"
      viewBox="0 0 22 1000"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        className="track"
        pathLength={1}
        d="M11 4 C 3 90, 19 170, 11 250 S 3 410, 11 490 S 19 650, 11 730 S 3 890, 11 996"
      />
      <path
        className="fill"
        pathLength={1}
        style={{ "--len": 1 } as CSSVars}
        d="M11 4 C 3 90, 19 170, 11 250 S 3 410, 11 490 S 19 650, 11 730 S 3 890, 11 996"
      />
    </svg>
  );
}
