import Reveal from "./Reveal";
import LeadCapture from "./LeadCapture";
import type { Ajustes } from "@/lib/menu";

export default function Location({ ajustes }: { ajustes: Ajustes }) {
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(ajustes.direccion)}`;
  return (
    <section className="section section--dark" id="ubicacion">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Ubicación y pedidos</p>
          <h2 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", margin: "10px 0 30px" }}>
            Enrédate con nosotros
          </h2>
        </Reveal>
        <div className="loc">
          <Reveal>
            <div className="loc__card">
              <h3>📍 Dónde estamos</h3>
              <div className="loc__row">
                <span>{ajustes.direccion}</span>
              </div>
              <div className="loc__row">
                <span>{ajustes.horarios}</span>
              </div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--gold"
                style={{ marginTop: 18 }}
              >
                <span>Cómo llegar</span>
              </a>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="loc__card">
              <h3>🛵 Pide a domicilio</h3>
              <div className="loc__row">
                <span>Arma tu enredo y te lo llevamos calientico.</span>
              </div>
              <div
                style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}
              >
                <a href="#arma" className="btn btn--primary">
                  <span>Armar y pedir</span>
                </a>
                <a
                  href="https://www.rappi.com.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--ghost"
                >
                  <span>Rappi</span>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
        <Reveal>
          <div className="loc__club">
            <LeadCapture />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
