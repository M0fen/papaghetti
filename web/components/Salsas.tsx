"use client";

/**
 * LAS SALSAS, EN SU PROPIO SITIO.
 *
 * Estaban mezcladas con los acompañantes en el mismo carrusel: catorce fichas, siete de
 * ellas charcos de color casi idénticos, compitiendo con lo que sí se cobra. Una salsa
 * no es algo que se apila en la caja — es una ELECCIÓN, y se lee mejor como palabra que
 * como dibujo.
 *
 * Por eso aquí no hay iconos: solo el nombre, su descripción y una marca de elegido.
 * Tipografía de la casa, hebra de color por salsa, y la franja siempre visible dice
 * cuáles llevas sin abrir nada.
 */

import { useEffect } from "react";
import type { Ingrediente } from "@/lib/menu";

export default function Salsas({
  salsas,
  elegidas,
  onToggle,
  abierta,
  onAbrir,
  onCerrar,
  parte = "ambas",
}: {
  salsas: Ingrediente[];
  elegidas: string[];
  onToggle: (id: string) => void;
  abierta: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  /**
   * La FRANJA se monta DENTRO de la barra inferior (así no hay que adivinar su alto
   * con una variable CSS que se desincroniza) y la HOJA en la raíz, por encima de todo.
   */
  parte?: "franja" | "hoja" | "ambas";
}) {
  useEffect(() => {
    if (!abierta) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierta, onCerrar]);

  if (!salsas.length) return null;
  const puestas = salsas.filter((s) => elegidas.includes(s.id));

  return (
    <>
      {/* La franja: siempre visible, dice qué llevas y abre la hoja al tocarla. */}
      {parte !== "hoja" && (
      <button type="button" className="salsas-franja" onClick={onAbrir}>
        <span className="salsas-franja__k">Salsas</span>
        <span className="salsas-franja__v">
          {puestas.length ? (
            puestas.map((s) => (
              <i key={s.id} style={{ ["--c" as string]: s.color }}>
                {s.nombre.replace(/^Salsa (de )?/i, "")}
              </i>
            ))
          ) : (
            <em>Elige las que quieras · van incluidas</em>
          )}
        </span>
        <span className="salsas-franja__ir" aria-hidden>
          {puestas.length ? "cambiar" : "elegir"}
        </span>
      </button>
      )}

      {parte !== "franja" && abierta && (
        <div className="salsas" role="dialog" aria-modal="true" aria-label="Salsas">
          <div className="salsas__panel">
            <header className="salsas__h">
              <div>
                <p className="salsas__k">VAN INCLUIDAS</p>
                <h2>Las salsas</h2>
                <p className="salsas__sub">
                  Elige las que quieras. No cuestan y no gastan tus acompañantes de cortesía.
                </p>
              </div>
              <button type="button" className="salsas__x" onClick={onCerrar} aria-label="Cerrar">
                ×
              </button>
            </header>

            <ul className="salsas__lista">
              {salsas.map((s) => {
                const on = elegidas.includes(s.id);
                const no = s.agotado || s.activo === false;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`salsa ${on ? "is-on" : ""} ${no ? "is-no" : ""}`}
                      onClick={() => !no && onToggle(s.id)}
                      disabled={no}
                      aria-pressed={on}
                      style={{ ["--c" as string]: s.color }}
                    >
                      <span className="salsa__hebra" aria-hidden />
                      <span className="salsa__txt">
                        <b>{s.nombre}</b>
                        {(s.descripcion || no) && (
                          <em>{no ? "Hoy no tenemos" : s.descripcion}</em>
                        )}
                      </span>
                      <span className="salsa__check" aria-hidden>
                        {on ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <button type="button" className="salsas__listo" onClick={onCerrar}>
              {puestas.length ? `Listo · ${puestas.length} elegida${puestas.length > 1 ? "s" : ""}` : "Seguir sin salsa"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
