"use client";

import { useFormStatus } from "react-dom";

/**
 * EL BOTÓN DE GUARDAR DE CADA SECCIÓN. Sin estado de "guardando…" el operario vuelve a
 * pulsar y manda dos veces; con él, el botón se apaga hasta que el servidor responde.
 * Va DENTRO del formulario (useFormStatus lee el formulario que lo contiene).
 */
export default function BotonGuardar({
  children = "Guardar cambios",
  enviando = "Guardando…",
  className = "btn btn--primary",
  disabled = false,
}: {
  children?: React.ReactNode;
  enviando?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending || disabled}>
      <span>{pending ? enviando : children}</span>
    </button>
  );
}
