"use client";

/**
 * EL SELECTOR del menú principal — reemplaza al armador de chips en la sección #arma.
 *
 * Dos caminos, con jerarquía deliberada:
 *  · ¡ENREDA TU PLATO! (izquierda, protagonista) → abre el JUEGO a pantalla completa.
 *    Es la misma experiencia del QR en mesa, pero en canal "web": al EMPLATAR pide
 *    servicio + contacto.
 *  · Pide rápido tu enredo (derecha, más pequeña) → el armador clásico de chips.
 *
 * El overlay lo posee <JuegoProvider> (envuelve toda la página) para que la ficha de un
 * enredo insignia pueda abrir el MISMO juego ya emplatado.
 */

import { useEffect, useState } from "react";
import type { Ingrediente } from "@/lib/menu";
import { TOPPINGS_INCLUIDOS } from "@/lib/menu";
import Reveal from "./Reveal";
import Configurator from "./Configurator";
import IngImg from "./IngImg";
import { useJuego } from "./JuegoProvider";

type Modo = "elegir" | "rapido";

export default function EnredaTuPlato({
  bases,
  proteinas,
  toppings,
  whatsapp,
  numMesas,
  impuestoPct,
  costoDomicilio,
  pedidoMinimo,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  whatsapp: string;
  numMesas: number;
  impuestoPct: number;
  costoDomicilio?: number;
  pedidoMinimo?: number;
}) {
  const [modo, setModo] = useState<Modo>("elegir");
  const juego = useJuego();

  // El botón ⚡PEDIR YA de dentro del juego cae aquí: cierra y muestra el armador.
  useEffect(() => {
    juego.onRapido(() => setModo("rapido"));
  }, [juego]);

  // Muestra del menú para la tarjeta rápida: una de cada tipo + el resto en cifra.
  const disponibles = [...bases, ...proteinas, ...toppings].filter((i) => i.activo);
  const muestra = [bases[0], proteinas[0], toppings[0], toppings[1]].filter(Boolean) as Ingrediente[];
  const resto = Math.max(0, disponibles.length - muestra.length);

  return (
    <section className="section" id="arma">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Arma tu enredo</p>
          <h2 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", margin: "10px 0 6px" }}>
            Tú mandas en el enredo
          </h2>
          <p className="lead">
            Elige base, proteína y toppings. Los primeros {TOPPINGS_INCLUIDOS} toppings van por
            cuenta de la casa.
          </p>
        </Reveal>

        {modo === "elegir" ? (
          <Reveal>
            <div className="enreda">
              {/* ---------- PROTAGONISTA: el juego ---------- */}
              <button type="button" className="enreda__juego" onClick={() => juego.abrir()}>
                <span className="enreda__badge">La forma divertida</span>
                <span className="enreda__titulo">¡Enreda tu plato!</span>
                <span className="enreda__desc">
                  Ármalo jugando: un fideo mesero te sirve cada ingrediente en la caja, y la sellas
                  cuando esté a tu gusto.
                </span>
                <span className="enreda__cta">
                  Empezar a enredar
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h13" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="enreda__teaser" src="/food/spaghetti.webp" alt="" aria-hidden />
              </button>

              {/* ---------- SECUNDARIA: el camino rápido ---------- */}
              <button type="button" className="enreda__rapido" onClick={() => setModo("rapido")}>
                <span className="enreda__rtitulo">Pide rápido tu enredo</span>
                <span className="enreda__rnota">Más rápido, pero menos divertido.</span>
                <span className="enreda__rminis" aria-hidden>
                  {muestra.map((ing) => (
                    <span className="enreda__mini" key={ing.id}>
                      <IngImg ing={ing} claseEmoji="enreda__mini__emoji" />
                    </span>
                  ))}
                  {resto > 0 && <span className="enreda__mini enreda__mini--mas">+{resto}</span>}
                </span>
                <span className="enreda__rcta">Ir al armador clásico →</span>
              </button>
            </div>
          </Reveal>
        ) : (
          <div className="enreda__clasico">
            <button type="button" className="enreda__volver" onClick={() => setModo("elegir")}>
              ← Mejor lo enredo jugando
            </button>
            <Configurator
              bases={bases}
              proteinas={proteinas}
              toppings={toppings}
              whatsapp={whatsapp}
              numMesas={numMesas}
              impuestoPct={impuestoPct}
              costoDomicilio={costoDomicilio}
              pedidoMinimo={pedidoMinimo}
              embebido
            />
          </div>
        )}
      </div>
    </section>
  );
}
