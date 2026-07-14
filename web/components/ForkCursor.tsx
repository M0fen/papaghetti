"use client";

import { useEffect, useRef } from "react";

/** Cursor-tenedor que sigue el puntero y hace "twirl" al hacer clic. */
export default function ForkCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (coarse || reduce) return;

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;

    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
    };
    const loop = () => {
      tx += (x - tx) * 0.22;
      ty += (y - ty) * 0.22;
      el.style.transform = `translate(${tx}px, ${ty}px)`;
      raf = requestAnimationFrame(loop);
    };
    const twirl = () => {
      el.classList.remove("twirl");
      void el.offsetWidth; // reinicia la animación
      el.classList.add("twirl");
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", twirl);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", twirl);
    };
  }, []);

  return (
    <div ref={ref} className="fork-cursor" aria-hidden>
      <svg viewBox="0 0 30 32" width="30" height="32" fill="none">
        <g
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 3v7" />
          <path d="M15 3v7" />
          <path d="M21 3v7" />
          <path d="M9 10c0 3.2 2.4 4.6 6 4.6s6-1.4 6-4.6" />
          <path d="M15 14.6V29" />
        </g>
      </svg>
    </div>
  );
}
