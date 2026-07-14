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
        <a href="#menu">Menú</a>
        <a href="#ubicacion">Ubicación</a>
      </div>
      <a href="#arma" className="btn btn--gold" style={{ padding: "10px 18px" }}>
        <span>Pedir</span>
      </a>
    </nav>
  );
}
