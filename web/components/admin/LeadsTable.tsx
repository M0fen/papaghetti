"use client";

import { useState } from "react";
import {
  LEAD_ESTADOS,
  leadEstadoLabel,
  type Lead,
  type EstadoLead,
} from "@/lib/menu";
import { updateLeadEstado } from "@/app/admin/actions";

export default function LeadsTable({ leads }: { leads: Lead[] }) {
  const [filtro, setFiltro] = useState<"todos" | EstadoLead>("todos");
  const filtrados =
    filtro === "todos" ? leads : leads.filter((l) => l.estado === filtro);

  if (leads.length === 0) {
    return (
      <div className="card">
        <p className="muted">
          Aún no hay leads. Cuando alguien deje sus datos en el “Club Papaghetti”
          del sitio, aparecerá aquí para hacerle seguimiento.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="filters">
        <button
          className={`fbtn ${filtro === "todos" ? "is-on" : ""}`}
          onClick={() => setFiltro("todos")}
        >
          Todos ({leads.length})
        </button>
        {LEAD_ESTADOS.map((e) => (
          <button
            key={e}
            className={`fbtn ${filtro === e ? "is-on" : ""}`}
            onClick={() => setFiltro(e)}
          >
            {leadEstadoLabel[e]} ({leads.filter((l) => l.estado === e).length})
          </button>
        ))}
      </div>

      <div className="leadgrid">
        {filtrados.map((l) => (
          <article key={l.id} className={`leadcard lead--${l.estado}`}>
            <div className="leadcard__top">
              <b>{l.nombre}</b>
              <span className={`badge badge--lead-${l.estado}`}>
                {leadEstadoLabel[l.estado]}
              </span>
            </div>
            <p className="leadcard__meta">
              {l.telefono && <span>📞 {l.telefono} </span>}
              {l.email && <span>✉️ {l.email}</span>}
              {!l.telefono && !l.email && <span className="muted">sin contacto</span>}
            </p>
            {l.mensaje && <p className="leadcard__msg">“{l.mensaje}”</p>}
            <p className="leadcard__foot">
              <span className="cap muted">{l.canal}</span>
              <span className="muted">
                {new Date(l.creadoEn).toLocaleDateString("es-CO")}
              </span>
            </p>
            <form action={updateLeadEstado} className="leadcard__acts">
              <input type="hidden" name="id" value={l.id} />
              {LEAD_ESTADOS.filter((e) => e !== l.estado).map((e) => (
                <button key={e} name="estado" value={e} className="chipbtn" type="submit">
                  {leadEstadoLabel[e]}
                </button>
              ))}
            </form>
          </article>
        ))}
      </div>
    </>
  );
}
