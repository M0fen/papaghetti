"use client";

import { useEffect, useState } from "react";

export default function Nav({ offsetTop = 0 }: { offsetTop?: number }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <nav
      className={`nav ${scrolled ? "scrolled" : ""}`}
      style={offsetTop ? { top: offsetTop } : undefined}
    >
      <a href="#top" className="nav__brand">
        Papaghetti
      </a>
      <div className="nav__links">
        <a href="#arma">Arma tu enredo</a>
        <a href="#menu">Enredos insignia</a>
        <a href="#carta">La carta</a>
        <a href="#ubicacion">Ubicación</a>
      </div>
      {/* EL color del CTA es exclusivo (regla de los premiados): pomodoro = pedir, en
          todo el sitio. El oro queda para acentos y acciones secundarias. */}
      <a href="#arma" className="btn btn--primary" style={{ padding: "10px 18px" }}>
        <span>Pedir</span>
      </a>
    </nav>
  );
}
