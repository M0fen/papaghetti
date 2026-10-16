import Reveal from "./Reveal";
import LogoMedia from "./LogoMedia";
import type { SitioPublico } from "@/lib/sitio";

/** La historia la cuenta el dueño (Ajustes → Sitio → Historia); el marco y el video, no. */
export default function Story({ historia }: { historia: SitioPublico["historia"] }) {
  return (
    <section className="section" id="historia">
      <div className="container">
        <div className="story">
          <Reveal>
            <div>
              <p className="eyebrow">Nuestra historia</p>
              <h2>{historia.titulo}</h2>
              {historia.parrafos.map((p, i) => (
                <p key={i} style={{ opacity: 0.82, marginBottom: 14 }}>
                  {p}
                </p>
              ))}
              <p style={{ fontFamily: "var(--pg-font-display)", fontSize: "1.4rem", color: "var(--pg-pomodoro)" }}>
                {historia.cierre}
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
