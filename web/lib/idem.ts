/**
 * CLAVE DE IDEMPOTENCIA del pedido.
 *
 * El mismo envío repetido (doble toque, red lenta, el cliente que insiste) tiene que
 * ser UN pedido, no dos con la despensa descontada dos veces. La clave nace en el
 * cliente y se reusa en los reintentos; el servidor devuelve el pedido ya creado.
 *
 * Se genera en el MANEJADOR del evento, nunca durante el render: `crypto.randomUUID()`
 * es impuro y React 19 lo prohíbe en el cuerpo de un componente (rompe el renderizado
 * concurrente, donde un componente puede renderizarse dos veces).
 *
 * Uso:
 *   const idem = useRef("");
 *   // dentro del onClick / del envío:
 *   if (!idem.current) idem.current = nuevaClave();
 */
export function nuevaClave(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
