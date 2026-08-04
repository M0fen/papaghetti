import Image from "next/image";
import LogoMedia from "./LogoMedia";
import heroFoto from "@/public/hero-enredo.webp";

/* HERO v2 (auditoría "nivel máximo"): identidad + APETITO. La ciencia (Spence, Oxford:
 * "visual hunger") y los números (Grubhub +30%, DoorDash +44% con foto) mandan comida
 * REAL en el primer viewport. El logo sigue siendo la firma; el objeto héroe es LA CAJA
 * con el enredo humeante, y los ingredientes flotan alrededor (patrón dominante en F&B
 * premiado: plato hero + ingredientes en parallax).
 * Los 3 pasos llevan CÓDIGO DE COLOR (patrón Marco Pasta: base=oro, proteína=pomodoro,
 * topping=perejil) — el mismo lenguaje que la carta y el juego — y una HEBRA los
 * conecta (patrón Dashi Ramen: el fideo como sistema, no decoración). */

const PASOS = [
  { n: 1, tono: "oro", art: "/food/papa-criolla.webp", label: "Base", desc: "criolla · francesa · spaghetti" },
  { n: 2, tono: "pomodoro", art: "/food/chicharron.webp", label: "Proteína", desc: "chicharrón · res · pollo" },
  { n: 3, tono: "perejil", art: "/food/maicitos.webp", label: "Toppings", desc: "maicitos · piña · queso" },
];

const FLOTANTES = [
  { art: "/food/papa-criolla.webp", cls: "hero__flot hero__flot--a" },
  { art: "/food/tocineta.webp", cls: "hero__flot hero__flot--b" },
  { art: "/food/perejil.webp", cls: "hero__flot hero__flot--c" },
];

export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero__inner container">
        <div className="hero__copy">
          <p className="hero__kicker">Pereira · Un delicioso enredo</p>
          <LogoMedia className="hero__logo" priority />
          <p className="hero__tagline">
            Papa criolla, pasta y tu antojo: así&nbsp;se&nbsp;arma un enredo.
          </p>

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
          <Image
            src={heroFoto}
            alt="Enredo Papaghetti: nido de spaghetti con papa criolla dorada y chicharrón crocante, humeando en su caja kraft"
            priority
            placeholder="blur"
            sizes="(min-width: 920px) 42vw, 78vw"
            className="hero__foto"
          />
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
          {PASOS.map((p) => (
            <div className={`hstep hstep--${p.tono}`} role="listitem" key={p.n}>
              <span className="hstep__n">{p.n}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hstep__art" src={p.art} alt="" aria-hidden />
              <b>{p.label}</b>
              <small>{p.desc}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="scroll-cue">desliza · arma el tuyo</div>
    </header>
  );
}
