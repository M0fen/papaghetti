"use client";

import { useActionState, useState } from "react";
import { agregarResenaAction, quitarResenaAction, mostrarResenasAction } from "@/app/admin/acciones-sitio";
import { BotonesSitio, Campo, MensajeSitio, ESTADO_INICIAL } from "./SitioFormulario";
import BotonGuardar from "./BotonGuardar";
import { FUENTES_RESENA, fuenteResenaLabel, TOPES, type ResenaSitio } from "@/lib/sitio";

/**
 * RESEÑAS REALES. No hay reseñas de ejemplo en ningún lado: el bloque del sitio no existe
 * hasta que el dueño copia reseñas de una página pública, marca que son reales, dice de
 * dónde salieron y lo enciende. Apagado, las reseñas son un borrador que no sale del panel.
 */
export default function SitioResenas({ lista, mostrar }: { lista: ResenaSitio[]; mostrar: boolean }) {
  const lleno = lista.length >= TOPES.resenas;
  return (
    <div className="sitio-resenas">
      <Interruptor mostrar={mostrar} hay={lista.length > 0} />

      {lista.length > 0 && (
        <ul className="sitio-resenas__lista">
          {lista.map((r, i) => (
            <Fila key={`${i}-${r.nombre}`} r={r} indice={i} />
          ))}
        </ul>
      )}

      {lleno ? (
        <p className="setgroup__nota">Ya hay {TOPES.resenas} reseñas, el máximo: quita una para agregar otra.</p>
      ) : (
        <Agregar />
      )}
    </div>
  );
}

function Interruptor({ mostrar, hay }: { mostrar: boolean; hay: boolean }) {
  const [estado, enviar] = useActionState(mostrarResenasAction, ESTADO_INICIAL);
  return (
    <form action={enviar} className={`sitio-resenas__estado ${mostrar ? "is-on" : ""}`}>
      <p>
        <b>{mostrar ? "Se ven en el sitio." : "No se ven en el sitio."}</b>{" "}
        {hay
          ? mostrar
            ? "Aparecen entre la portada y el armador."
            : "Las de abajo son un borrador: nadie más las ve."
          : "Cuando agregues reseñas, aquí las enciendes."}
      </p>
      {(hay || mostrar) && (
        <>
          <input type="hidden" name="mostrar" value={mostrar ? "0" : "1"} />
          <BotonGuardar className={`btn ${mostrar ? "btn--ghost" : "btn--primary"} btnmini`}>
            {mostrar ? "Esconderlas" : "Mostrarlas en el sitio"}
          </BotonGuardar>
        </>
      )}
      <MensajeSitio estado={estado} />
    </form>
  );
}

function Fila({ r, indice }: { r: ResenaSitio; indice: number }) {
  const [estado, enviar] = useActionState(quitarResenaAction, ESTADO_INICIAL);
  return (
    <li className="sitio-resena">
      <div className="sitio-resena__texto">
        <span className="sitio-resena__estrellas" aria-label={`${r.estrellas} de 5 estrellas`}>
          {"★".repeat(r.estrellas)}
          <span aria-hidden>{"☆".repeat(5 - r.estrellas)}</span>
        </span>
        <q>{r.texto}</q>
        <small>
          — {r.nombre} · {fuenteResenaLabel[r.fuente]}
          {r.enlace && (
            <>
              {" · "}
              <a href={r.enlace} target="_blank" rel="noopener noreferrer">
                ver la original ↗
              </a>
            </>
          )}
        </small>
      </div>
      <form action={enviar}>
        <input type="hidden" name="indice" value={indice} />
        <input type="hidden" name="nombre" value={r.nombre} />
        <BotonGuardar className="btn btn--ghost btnmini" enviando="Quitando…">
          Quitar
        </BotonGuardar>
        <MensajeSitio estado={estado} oculto={estado.ok} />
      </form>
    </li>
  );
}

function Agregar() {
  const [estado, enviar] = useActionState(agregarResenaAction, ESTADO_INICIAL);
  const [editado, setEditado] = useState(-1);
  const vuelta = estado.n ?? 0;
  const v = (k: string, porDefecto = "") => estado.valores?.[k] ?? porDefecto;
  return (
    <form action={enviar} className="sitio-form sitio-resenas__nueva" onInput={() => setEditado(vuelta)}>
      <h4>Agregar una reseña real</h4>
      {/* Tras guardar, el formulario queda limpio para la siguiente; tras un rechazo,
          vuelve con lo escrito. */}
      <div className="setgrid sitio-campos" key={vuelta}>
        <Campo
          c={{
            nombre: "nombre",
            etiqueta: "Nombre (como aparece en la reseña)",
            valor: "",
            tope: TOPES.resenaNombre,
            requerido: true,
            placeholder: "Ej.: Ana M.",
            nota: "Si prefieres, solo el nombre y la inicial del apellido.",
          }}
          valor={v("nombre")}
        />
        <label className="field">
          <span>Estrellas que le dio</span>
          <select className="admin-input" name="estrellas" defaultValue={v("estrellas", "5")}>
            {[5, 4, 3, 2, 1].map((e) => (
              <option key={e} value={e}>
                {"★".repeat(e)} ({e})
              </option>
            ))}
          </select>
        </label>
        <Campo
          c={{
            nombre: "texto",
            etiqueta: "La reseña, tal cual",
            valor: "",
            tipo: "area",
            filas: 4,
            tope: TOPES.resenaTexto,
            requerido: true,
            completo: true,
            nota: "Cópiala sin cambiarle nada. Si es muy larga, elige otra: recortarla cambia lo que dice.",
          }}
          valor={v("texto")}
        />
        <label className="field">
          <span>De dónde la copiaste</span>
          <select className="admin-input" name="fuente" defaultValue={v("fuente", "google")}>
            {FUENTES_RESENA.map((f) => (
              <option key={f} value={f}>
                {f === "otra" ? "Otra página pública" : fuenteResenaLabel[f]}
              </option>
            ))}
          </select>
        </label>
        <Campo
          c={{
            nombre: "enlace",
            etiqueta: "Enlace a la reseña (opcional)",
            valor: "",
            teclado: "url",
            placeholder: "https://maps.app.goo.gl/…",
            nota: "Con él, cualquiera puede comprobar que es real.",
          }}
          valor={v("enlace")}
        />
        <label className="field field--check sitio-campo--completo sitio-casilla">
          <span>Es real</span>
          <span className="admin-check">
            <input type="checkbox" name="real" required defaultChecked={estado.valores?.real === "on"} />
            <em>La copié de una reseña pública real, sin cambiar lo que dice.</em>
          </span>
        </label>
      </div>
      <BotonesSitio boton="Agregar reseña" />
      <MensajeSitio estado={estado} oculto={editado === vuelta} />
    </form>
  );
}
