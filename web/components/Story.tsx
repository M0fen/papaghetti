import Reveal from "./Reveal";
import LogoMedia from "./LogoMedia";

export default function Story() {
  return (
    <section className="section" id="historia">
      <div className="container">
        <div className="story">
          <Reveal>
            <div>
              <p className="eyebrow">Nuestra historia</p>
              <h2 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", margin: "10px 0 16px" }}>
                Todo empezó por un enredo
              </h2>
              <p style={{ opacity: 0.82, marginBottom: 14 }}>
                Una hebra de spaghetti no sabe de líneas rectas. Se enreda, se
                mezcla, se junta con lo que encuentra… y ahí está la gracia.
              </p>
              <p style={{ opacity: 0.82, marginBottom: 14 }}>
                Papaghetti nace en Pereira uniendo dos amores: la papa criolla
                dorada del Eje Cafetero y la pasta que a todos nos gusta. Comfort
                food premium, hecha para verse hermosa y para armarse a tu gusto.
              </p>
              <p style={{ fontFamily: "var(--pg-font-display)", fontSize: "1.4rem", color: "var(--pg-pomodoro)" }}>
                El enredo es la gracia.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <LogoMedia className="story__video" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
