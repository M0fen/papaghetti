"use client";

/**
 * LO QUE FALTA POR HACER.
 *
 * No es un checklist que alguien tenga que ir tachando: cada línea se calcula del
 * estado real del negocio (lib/tareas.ts) y desaparece sola cuando se cumple. Por eso
 * se puede confiar en ella — si algo sigue en la lista, es porque de verdad falta.
 *
 * Se guarda cerrada/abierta en el navegador para que no estorbe en hora pico.
 */

import { useState } from "react";
import type { ResumenTareas, Tarea } from "@/lib/tareas";

const TITULO: Record<Tarea["momento"], string> = {
  montaje: "Antes de abrir",
  servicio: "Ahora mismo",
  cierre: "Para cerrar",
};

export default function Pendientes({ resumen }: { resumen: ResumenTareas }) {
  /* Abierta/cerrada con <details>, que lo maneja el navegador: sin estado que
     sincronizar en un efecto (React 19 lo prohíbe) y sin desajuste de hidratación. */
  const [abierto, setAbierto] = useState(true);
  const recordar = (v: boolean) => {
    setAbierto(v);
    try {
      localStorage.setItem("pg_pendientes", v ? "1" : "0");
    } catch {
      /* navegador sin almacenamiento: da igual */
    }
  };

  const { tareas, montajeTotal, montajeHechas } = resumen;
  const urgentes = tareas.filter((t) => t.tono === "urgente").length;

  if (tareas.length === 0) {
    return (
      <div className="pend-box pend-box--limpio">
        <b>✅ Todo listo.</b> No hay nada pendiente ahora mismo.
      </div>
    );
  }

  const momentos = (["servicio", "montaje", "cierre"] as const).filter((m) =>
    tareas.some((t) => t.momento === m),
  );

  return (
    <details
      className={`pend-box ${urgentes ? "is-urgente" : ""}`}
      open={abierto}
      onToggle={(e) => recordar((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="pend-box__h">
        <span className="pend-box__t">
          Falta por hacer <b>{tareas.length}</b>
          {urgentes > 0 && <em className="pend-box__urg">{urgentes} urgente{urgentes > 1 ? "s" : ""}</em>}
        </span>
        {/* Progreso solo del montaje: es lo que tiene final. Lo del servicio va y viene. */}
        <span className="pend-box__prog" title="Puesta a punto">
          {montajeHechas}/{montajeTotal} listo
          <i style={{ width: `${(montajeHechas / montajeTotal) * 100}%` }} />
        </span>
        <span className="pend-box__caret" aria-hidden />
      </summary>

      <div className="pend-box__cuerpo">
          {momentos.map((m) => (
            <div key={m} className="pend-grupo">
              <h3>{TITULO[m]}</h3>
              <ul>
                {tareas
                  .filter((t) => t.momento === m)
                  .map((t) => (
                    <li key={t.id}>
                      <a href={t.href} className={`tarea tarea--${t.tono}`}>
                        <span className="tarea__punto" aria-hidden />
                        <span className="tarea__txt">
                          <b>{t.texto}</b>
                          {t.porque && <em>{t.porque}</em>}
                        </span>
                        <span className="tarea__ir" aria-hidden>
                          →
                        </span>
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
      </div>
    </details>
  );
}
