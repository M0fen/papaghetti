import LogoMedia from "./LogoMedia";

// El mismo arte horneado que sirve el juego, no emojis del sistema: los tres pasos son
// lo primero que se ve y marcan el idioma visual del resto de la carta.
const PASOS = [
  { n: 1, art: "/food/papa-criolla.webp", label: "Base", desc: "criolla · francesa · spaghetti" },
  { n: 2, art: "/food/chicharron.webp", label: "Proteína", desc: "chicharrón · res · pollo…" },
  { n: 3, art: "/food/maicitos.webp", label: "Toppings", desc: "maicitos · piña · tocineta…" },
];

export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero__inner container">
        <p className="hero__kicker">Pereira · Un delicioso enredo</p>
        <LogoMedia className="hero__logo" priority />
        <p className="hero__tagline">Comfort food premium para armar a tu gusto.</p>

        <div className="hero__steps" role="list" aria-label="Cómo funciona en 3 pasos">
          {PASOS.map((p) => (
            <div className="hstep" role="listitem" key={p.n}>
              <span className="hstep__n">{p.n}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hstep__art" src={p.art} alt="" aria-hidden />
              <b>{p.label}</b>
              <small>{p.desc}</small>
            </div>
          ))}
        </div>

        <div className="hero__cta">
          <a href="#arma" className="btn btn--primary">
            <span>Arma tu enredo</span>
          </a>
          <a href="#menu" className="btn btn--ghost">
            <span>Ver el menú</span>
          </a>
        </div>
      </div>
      <div className="scroll-cue">desliza · arma el tuyo</div>
    </header>
  );
}
