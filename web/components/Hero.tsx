import Image from "next/image";
import LogoMedia from "./LogoMedia";
import heroFoto from "@/public/hero-enredo.webp";
import type { SitioPublico } from "@/lib/sitio";

/* HERO v2 (auditoría "nivel máximo"): identidad + APETITO. La ciencia (Spence, Oxford:
 * "visual hunger") y los números (Grubhub +30%, DoorDash +44% con foto) mandan comida
 * REAL en el primer viewport. El logo sigue siendo la firma; el objeto héroe es LA CAJA
 * con el enredo humeante, y los ingredientes flotan alrededor (patrón dominante en F&B
 * premiado: plato hero + ingredientes en parallax).
 * Los 3 pasos llevan CÓDIGO DE COLOR (patrón Marco Pasta: base=oro, proteína=pomodoro,
 * topping=perejil) — el mismo lenguaje que la carta y el juego — y una HEBRA los
 * conecta (patrón Dashi Ramen: el fideo como sistema, no decoración).
 *
 * Los TEXTOS y la FOTO son del dueño (Ajustes → Sitio → Portada); el diseño no: colores,
 * etiquetas de los pasos, ingredientes flotantes y la hebra se quedan fijos. */

const PASOS = [
  { n: 1, tono: "oro", art: "/food/papa-criolla.webp", label: "Base" },
  { n: 2, tono: "pomodoro", art: "/food/chicharron.webp", label: "Proteína" },
  { n: 3, tono: "perejil", art: "/food/maicitos.webp", label: "Toppings" },
];

const FLOTANTES = [
  { art: "/food/papa-criolla.webp", cls: "hero__flot hero__flot--a" },
  { art: "/food/tocineta.webp", cls: "hero__flot hero__flot--b" },
  { art: "/food/perejil.webp", cls: "hero__flot hero__flot--c" },
];

export default function Hero({ portada }: { portada: SitioPublico["portada"] }) {
  return (
    <header className="hero" id="top">
      <div className="hero__inner container">
        <div className="hero__copy">
          <p className="hero__kicker">{portada.antetitulo}</p>
          <LogoMedia className="hero__logo" priority />
          {/* La frase de fábrica trae dos espacios de no separación («así se arma» no se
              parte): viajan dentro del texto, no como &nbsp; escritos aquí. */}
          <p className="hero__tagline">{portada.frase}</p>

          <div className="hero__cta">
            <a href="#arma" className="btn btn--primary">
              <span>Arma tu enredo</span>
            </a>
            <a href="#menu" className="btn btn--ghost">
              <span>Ver el menú</span>
            </a>
          </div>
        </div>

        <div className="hero__plato">
          {portada.foto ? (
            /* La foto del dueño, con <img> como el resto de fotos subidas (IngImg,
               PlatoImg): viene del almacén de fotos, que next/image no tiene autorizado,
               y ya llega recortada a 4:5 y comprimida desde el panel. Es lo primero que
               se ve, así que se pide con prioridad alta y sin carga diferida. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={portada.foto.url}
              alt={portada.fotoAlt}
              width={portada.foto.ancho ?? 960}
              height={portada.foto.alto ?? 1200}
              fetchPriority="high"
              className="hero__foto hero__foto--propia"
            />
          ) : (
            <Image
              src={heroFoto}
              alt={portada.fotoAlt}
              priority
              placeholder="blur"
              sizes="(min-width: 920px) 42vw, 78vw"
              className="hero__foto"
            />
          )}
          {FLOTANTES.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.cls} src={f.art} alt="" aria-hidden className={f.cls} />
          ))}
        </div>

        <div className="hero__steps" role="list" aria-label="Cómo funciona en 3 pasos">
          {/* la hebra que CONECTA los pasos: se dibuja sola al cargar (patrón Dashi) */}
          <svg className="hero__hilo" viewBox="0 0 300 12" aria-hidden preserveAspectRatio="none">
            <path d="M4 6 Q 40 -2 75 6 T 150 6 T 225 6 T 296 6" pathLength={100} />
          </svg>
          {PASOS.map((p, i) => (
            <div className={`hstep hstep--${p.tono}`} role="listitem" key={p.n}>
              <span className="hstep__n">{p.n}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hstep__art" src={p.art} alt="" aria-hidden />
              <b>{p.label}</b>
              <small>{portada.pasos[i]}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="scroll-cue">desliza · arma el tuyo</div>
    </header>
  );
}
