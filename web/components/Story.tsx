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
              <h2>
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
            {/* El marco lleva el color EXACTO del fondo del video (#f4e4c9) y se funde
                hacia la crema de la página: sin él, la caja del video se ve como un
                recuadro recortado sobre el #fbf1de de la sección. */}
            <div className="story__marco">
              <LogoMedia className="story__video" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
