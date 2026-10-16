import Reveal from "./Reveal";
import LeadCapture from "./LeadCapture";
import { waLink } from "@/lib/menu";
import { telHref, type SitioPublico } from "@/lib/sitio";

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

/**
 * Dónde estamos y cómo pedir. Todo lo de aquí sale de Ajustes → Sitio: lo que no está
 * puesto no se pinta (un botón de Rappi sin enlace era un callejón sin salida), y el
 * teléfono solo aparece si el dueño decidió mostrarlo.
 */
export default function Location({ sitio }: { sitio: SitioPublico }) {
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
                <span>{sitio.direccion}</span>
              </div>
              <div className="loc__row">
                <span>{sitio.horarios}</span>
              </div>
              {sitio.telefono ? (
                <div className="loc__row">
                  <a href={telHref(sitio.telefono)} className="loc__tel" aria-label={`Llamar al ${sitio.telefono}`}>
                    Tel. {sitio.telefono}
                  </a>
                </div>
              ) : null}
              {/* El enlace propio del local en Google Maps (con su ficha y sus reseñas)
                  si el dueño lo puso; si no, la búsqueda de la dirección, como siempre. */}
              <a
                href={sitio.mapa}
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
                <span>{sitio.textos.domicilio}</span>
              </div>
              <div
                style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}
              >
                <a href="#arma" className="btn btn--primary">
                  <span>Armar y pedir</span>
                </a>
                {/* Solo con un número real: el de ejemplo mandaba al cliente a un chat
                    que no existe (ver whatsappValido). */}
                {sitio.whatsapp ? (
                  <a
                    href={waLink(sitio.whatsapp, `¡Hola ${sitio.negocio}! 🍝 Quiero hacer un pedido a domicilio.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost"
                  >
                    <span>WhatsApp</span>
                  </a>
                ) : null}
                {/* Solo si el dueño puso su enlace real en Ajustes → Sitio: mandar a la
                    home genérica de Rappi era un callejón sin salida. */}
                {sitio.rappi ? (
                  <a
                    href={sitio.rappi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost"
                  >
                    <span>Rappi</span>
                  </a>
                ) : null}
                {sitio.didi ? (
                  <a
                    href={sitio.didi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost"
                  >
                    <span>DiDi Food</span>
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
