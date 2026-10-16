"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import BotonGuardar from "./BotonGuardar";
import type { EstadoSitio } from "@/lib/sitio";

/**
 * UN BLOQUE DE AJUSTES → SITIO: sus casillas, su botón de guardar, el de volver al texto
 * original y el resultado ESCRITO JUNTO AL BOTÓN.
 *
 * El resultado va aquí y no solo en la barra del panel porque esta sección está al fondo
 * de Ajustes: el aviso de arriba aparecía fuera de la pantalla y quien guardaba no sabía
 * si había funcionado. Si el servidor rechaza algo, el formulario vuelve con lo que la
 * persona escribió (React lo borraría al terminar el envío y habría que escribirlo todo de
 * nuevo para corregir una letra).
 */

export type AccionSitio = (prev: EstadoSitio, fd: FormData) => Promise<EstadoSitio>;
export const ESTADO_INICIAL: EstadoSitio = { ok: true, mensaje: "", n: 0 };

/** Una casilla del formulario (datos simples: la arma el componente de servidor). */
export interface CampoSitio {
  nombre: string;
  etiqueta: string;
  /** Lo que se ve hoy en el sitio (el texto de fábrica si nunca se cambió). */
  valor: string;
  tipo?: "texto" | "area" | "casilla";
  /** Largo máximo: se cuenta mientras se escribe (sin cortar lo que se pega). */
  tope?: number;
  nota?: string;
  /** Pide acción (en rojo): el WhatsApp de ejemplo, por ejemplo. */
  alerta?: string;
  placeholder?: string;
  requerido?: boolean;
  /** Ocupa toda la fila. */
  completo?: boolean;
  filas?: number;
  teclado?: "text" | "tel" | "url" | "numeric";
  /** Casilla marcada hoy. */
  marcado?: boolean;
}

const largo = (s: string) => Array.from(s).length;

/** Una casilla con su etiqueta, su contador de letras y sus notas. */
export function Campo({ c, valor, marcado }: { c: CampoSitio; valor: string; marcado?: boolean }) {
  const [n, setN] = useState(largo(valor));
  if (c.tipo === "casilla") {
    return (
      <label className={`field field--check sitio-casilla ${c.completo ? "sitio-campo--completo" : ""}`}>
        <span>{c.etiqueta}</span>
        <span className="admin-check">
          <input type="checkbox" name={c.nombre} defaultChecked={marcado} />
          {c.nota && <em>{c.nota}</em>}
        </span>
      </label>
    );
  }
  const comun = {
    name: c.nombre,
    defaultValue: valor,
    className: "admin-input",
    required: c.requerido,
    placeholder: c.placeholder,
    autoComplete: "off",
    "aria-invalid": c.tope && n > c.tope ? true : undefined,
    onInput: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => setN(largo(e.currentTarget.value)),
  };
  return (
    <label className={`field ${c.completo ? "sitio-campo--completo" : ""}`}>
      <span className="sitio-etq">
        {c.etiqueta}
        {c.tope ? (
          <small className={`sitio-cuenta ${n > c.tope ? "is-pasado" : ""}`} aria-live="polite">
            {n}/{c.tope}
          </small>
        ) : null}
      </span>
      {c.tipo === "area" ? (
        <textarea {...comun} rows={c.filas ?? 3} />
      ) : (
        <input {...comun} type="text" inputMode={c.teclado} />
      )}
      {c.alerta && <small className="field__alerta">{c.alerta}</small>}
      {c.nota && <small className="field__nota">{c.nota}</small>}
    </label>
  );
}

/** Guardar y (si se puede) volver al original, con su estado de «guardando…». */
export function BotonesSitio({ boton, restaurar }: { boton: string; restaurar?: string }) {
  const { pending, data } = useFormStatus();
  const restaurando = pending && data?.get("restaurar") === "1";
  return (
    <div className="sitio-botones">
      <BotonGuardar enviando={restaurando ? "Un momento…" : "Guardando…"}>{boton}</BotonGuardar>
      {restaurar && (
        /* formNoValidate: volver al original no necesita que las casillas estén bien. */
        <button
          type="submit"
          name="restaurar"
          value="1"
          formNoValidate
          className="btn btn--ghost btnmini sitio-restaurar"
          disabled={pending}
        >
          <span>{restaurando ? "Restaurando…" : restaurar}</span>
        </button>
      )}
    </div>
  );
}

/** El resultado del último envío. Se apaga en cuanto se vuelve a escribir. */
export function MensajeSitio({ estado, oculto }: { estado: EstadoSitio; oculto?: boolean }) {
  if (!estado.mensaje || oculto) return null;
  return (
    <p className={`sitio-msj ${estado.ok ? "is-ok" : "is-error"}`} role={estado.ok ? "status" : "alert"}>
      {estado.ok ? "✅" : "⚠️"} {estado.mensaje}
    </p>
  );
}

export default function SitioGrupo({
  accion,
  campos,
  boton,
  restaurar,
}: {
  accion: AccionSitio;
  campos: CampoSitio[];
  boton: string;
  /** Texto del botón para volver al original (sin él, no hay botón). */
  restaurar?: string;
}) {
  const [estado, enviar] = useActionState(accion, ESTADO_INICIAL);
  const [editado, setEditado] = useState(-1);
  const vuelta = estado.n ?? 0;
  return (
    <form action={enviar} className="sitio-form" onInput={() => setEditado(vuelta)}>
      {/* Con cada respuesta las casillas se vuelven a armar: con lo guardado (y ya
          limpio: un Instagram pegado como enlace vuelve como usuario) o, si se rechazó,
          con lo que se había escrito. */}
      <div className="setgrid sitio-campos" key={vuelta}>
        {campos.map((c) => (
          <Campo
            key={c.nombre}
            c={c}
            valor={estado.valores?.[c.nombre] ?? c.valor}
            marcado={estado.valores ? estado.valores[c.nombre] === "on" : c.marcado}
          />
        ))}
      </div>
      <BotonesSitio boton={boton} restaurar={restaurar} />
      <MensajeSitio estado={estado} oculto={editado === vuelta} />
    </form>
  );
}
