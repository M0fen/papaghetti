import Reveal from "./Reveal";
import LeadCapture from "./LeadCapture";
import type { AjustesPublicos } from "@/lib/catalog";

/* Iconos propios en vez de emojis del sistema: el resto de la carta ya habla en SVG
   y arte horneado, y los emojis se renderizan distinto en cada teléfono. */
const Ico = ({ d }: { d: string }) => (
  <svg
    className="loc__ico"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);
const PIN = "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z M12 10.5v.01";
const MOTO = "M5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M19 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M7.5 15.5h6l3-6h2 M13.5 9.5H10";
const CHISPA = "M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z";

export default function Location({ ajustes }: { ajustes: AjustesPublicos }) {
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(ajustes.direccion)}`;
  return (
    <section className="section section--dark" id="ubicacion">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Ubicación y pedidos</p>
          <h2>
            Enrédate con nosotros
          </h2>
        </Reveal>
        <div className="loc">
          <Reveal>
            <div className="loc__card">
              <h3><Ico d={PIN} /> Dónde estamos</h3>
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
              <h3><Ico d={MOTO} /> Pide a domicilio</h3>
              <div className="loc__row">
                <span>Arma tu enredo y te lo llevamos calientico.</span>
              </div>
              <div
                style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}
              >
                <a href="#arma" className="btn btn--primary">
                  <span>Armar y pedir</span>
                </a>
                {/* Solo si el dueño puso su enlace real en /admin/ajustes: mandar a la
                    home genérica de Rappi era un callejón sin salida. */}
                {ajustes.rappi ? (
                  <a
                    href={ajustes.rappi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost"
                  >
                    <span>Rappi</span>
                  </a>
                ) : null}
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
