import Reveal from "./Reveal";
import { MOSTRAR, RESENAS } from "./resenas-data";

/* El bloque de reseñas vive entre el hero y el armador (donde las fuentes de
 * conversión lo ubican). Solo se renderiza con contenido REAL — ver resenas-data.ts. */
export default function Resenas() {
  if (!MOSTRAR || RESENAS.length === 0) return null;
  return (
    <section className="section resenas" aria-label="Lo que dicen nuestros clientes">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Palabra de enredados</p>
        </Reveal>
        <div className="resenas__grid">
          {RESENAS.map((r, i) => (
            <Reveal key={r.nombre + i} delay={i * 110}>
              <figure className="resena">
                <div className="resena__stars" aria-label={`${r.estrellas} de 5 estrellas`}>
                  {"★".repeat(r.estrellas)}
                  <span aria-hidden>{"☆".repeat(5 - r.estrellas)}</span>
                </div>
                <blockquote>{r.texto}</blockquote>
                <figcaption>— {r.nombre}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
