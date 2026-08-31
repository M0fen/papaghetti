"use client";

/**
 * EL ARQUEO DE CAJA, CONTANDO A CIEGAS.
 *
 * El cierre de turno era un informe de solo lectura: decía lo que el sistema esperaba
 * por cada método y ahí se acababa. No había dónde anotar lo que de verdad había en
 * el cajón, así que la diferencia no existía en ninguna parte — y un faltante que no
 * queda escrito es un faltante que se repite el mes entero.
 *
 * A CIEGAS es la parte que no se puede negociar: mientras no se escriba lo contado,
 * esta pantalla NO enseña lo esperado. Si primero ves la cifra que debería salir, la
 * encuentras; contar antes de mirar es la única forma de que un descuadre aparezca.
 * Por eso el número esperado no viaja al navegador hasta que hay conteo: no está
 * escondido con CSS, sencillamente no está en la página.
 */

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { formatCOP, type Arqueo } from "@/lib/menu";
import { abrirCajaAction, cerrarCajaAction } from "@/app/admin/actions";

function Enviando({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--primary btnmini" type="submit" disabled={pending}>
      <span>{pending ? "Guardando…" : children}</span>
    </button>
  );
}

export default function ArqueoCaja({
  abierto,
  ultimo,
}: {
  /** El arqueo de hoy sin cerrar, si lo hay. */
  abierto?: Arqueo;
  /** El último arqueo ya cerrado, para poder mirar atrás. */
  ultimo?: Arqueo;
}) {
  const [confirmar, setConfirmar] = useState(false);

  return (
    <div className="card arqueo">
      <div className="card__h">
        <h2>Caja</h2>
        {abierto && <span className="badge badge--ok">Abierta</span>}
      </div>

      {!abierto ? (
        <form action={abrirCajaAction} className="arqueo__form">
          <p className="arqueo__ayuda">
            Antes de vender, cuenta el fondo con el que arranca el cajón. Sin eso, al
            cerrar no hay contra qué comparar.
          </p>
          <label className="svc__field">
            <span>Base de caja</span>
            <input
              type="number"
              name="base"
              min={0}
              step="any"
              defaultValue={0}
              inputMode="numeric"
              required
            />
          </label>
          <Enviando>Abrir caja</Enviando>
        </form>
      ) : !confirmar ? (
        <div className="arqueo__form">
          <p className="arqueo__ayuda">
            Abierta con <b>{formatCOP(abierto.base)}</b> de base
            {abierto.usuarioAbre ? ` · ${abierto.usuarioAbre}` : ""}.
          </p>
          <button
            type="button"
            className="btn btn--gold btnmini"
            onClick={() => setConfirmar(true)}
          >
            <span>🌙 Cerrar caja y contar</span>
          </button>
        </div>
      ) : (
        <form action={cerrarCajaAction} className="arqueo__form">
          <p className="arqueo__ayuda arqueo__ciego">
            <b>Cuenta primero.</b> No te vamos a decir cuánto debería haber hasta que
            escribas lo que contaste: si ves la cifra antes, la encuentras.
          </p>
          <label className="svc__field">
            <span>¿Cuánto hay en el cajón, contado?</span>
            <input
              type="number"
              name="contado"
              min={0}
              step="any"
              inputMode="numeric"
              autoFocus
              required
              placeholder="Billetes y monedas, todo"
            />
          </label>
          <label className="svc__field">
            <span>¿Salió plata de esta caja hoy? (proveedor, mandados…)</span>
            <input type="number" name="salidas" min={0} step="any" defaultValue={0} inputMode="numeric" />
          </label>
          <label className="svc__field">
            <span>Notas del cierre</span>
            <input type="text" name="notas" maxLength={200} placeholder="Opcional" />
          </label>
          <div className="arqueo__botones">
            <button type="button" className="btn btn--ghost btnmini" onClick={() => setConfirmar(false)}>
              <span>Cancelar</span>
            </button>
            <Enviando>Cerrar caja</Enviando>
          </div>
        </form>
      )}

      {/* El resultado del último cierre: es lo que se mira al día siguiente. */}
      {ultimo?.cerradoEn && (
        <div
          className={`arqueo__res ${
            ultimo.diferencia === 0 ? "is-ok" : (ultimo.diferencia ?? 0) > 0 ? "is-sobra" : "is-falta"
          }`}
        >
          <b>
            {ultimo.diferencia === 0
              ? "El último cierre cuadró exacto"
              : (ultimo.diferencia ?? 0) > 0
                ? `En el último cierre sobraron ${formatCOP(ultimo.diferencia ?? 0)}`
                : `En el último cierre faltaron ${formatCOP(-(ultimo.diferencia ?? 0))}`}
          </b>
          <span>
            {ultimo.dia} · contado {formatCOP(ultimo.contado ?? 0)} · esperado{" "}
            {formatCOP(ultimo.esperado ?? 0)}
            {ultimo.usuarioCierra ? ` · ${ultimo.usuarioCierra}` : ""}
          </span>
          {ultimo.notas && <em>{ultimo.notas}</em>}
        </div>
      )}
    </div>
  );
}
