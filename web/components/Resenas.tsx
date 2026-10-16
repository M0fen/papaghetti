import Reveal from "./Reveal";
import { fuenteResenaLabel, resenaDe, TOPES, type ResenaSitio } from "@/lib/sitio";

/* PRUEBA SOCIAL — el hueco de conversión #1 según la auditoría (el 61% de los comensales
 * mira reseñas antes de decidir). El bloque vive entre el hero y el armador (donde las
 * fuentes de conversión lo ubican).
 *
 * Solo con reseñas REALES: el dueño las copia de una página pública (Google, Instagram…)
 * en Ajustes → Sitio → Reseñas, marcando que son reales y diciendo de dónde salieron, y
 * enciende «mostrarlas». Apagado o sin reseñas, aquí no llega nada y el bloque no existe.
 * Nunca hay reseñas de ejemplo: ni en el código, ni en la semilla, ni en las pruebas.
 * (Y nunca van en los datos para Google: Google no acepta que un negocio se califique a
 * sí mismo, y ponerlas ahí es arriesgar el castigo de todo el sitio.) */
export default function Resenas({ lista }: { lista: ResenaSitio[] }) {
  // Se vuelven a revisar aquí: el bloque no se fía de que quien lo llame las haya filtrado.
  const reales = lista
    .map(resenaDe)
    .filter((r): r is ResenaSitio => r !== null)
    .slice(0, TOPES.resenas);
  if (reales.length === 0) return null;
  return (
    <section className="section resenas" aria-label="Lo que dicen nuestros clientes">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Palabra de enredados</p>
        </Reveal>
        <div className="resenas__grid">
          {reales.map((r, i) => (
            <Reveal key={r.nombre + i} delay={i * 110}>
              <figure className="resena">
                <div className="resena__stars" aria-label={`${r.estrellas} de 5 estrellas`}>
                  {"★".repeat(r.estrellas)}
                  <span aria-hidden>{"☆".repeat(5 - r.estrellas)}</span>
                </div>
                <blockquote>{r.texto}</blockquote>
                <figcaption>
                  — {r.nombre}
                  {/* De dónde salió, con su enlace si lo hay: así cualquiera la comprueba. */}
                  <span className="resena__fuente">
                    {" · "}
                    {r.enlace ? (
                      <a href={r.enlace} target="_blank" rel="noopener noreferrer nofollow">
                        {fuenteResenaLabel[r.fuente]}
                      </a>
                    ) : (
                      fuenteResenaLabel[r.fuente]
                    )}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
