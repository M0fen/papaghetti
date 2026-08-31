/**
 * QUIÉN usa el panel.
 *
 * Los tres comparten la MISMA contraseña: esto no es una barrera entre ellos, es
 * ATRIBUCIÓN. El historial decía "Canceló #A1B2" sin nombre, así que un descuadre
 * o un pedido borrado no se le podía preguntar a nadie en concreto.
 *
 * Y son "Usuario 1/2/3" a propósito, sin roles ni nombres propios: quién es cada
 * uno se decide el primer día, en el turno, y un nombre equivocado dentro del
 * código es peor que un número — obliga a un despliegue para corregirlo.
 *
 * Vive aparte de lib/sesion.ts porque la pantalla de entrada es un componente de
 * cliente y sesion.ts importa `next/headers`, que no puede viajar al navegador.
 *
 * Para ponerles nombre después: NEXT_PUBLIC_PG_USUARIOS="Carlos,Ana,Luis" en Vercel.
 */
export const USUARIOS: string[] = (process.env.NEXT_PUBLIC_PG_USUARIOS ||
  "Usuario 1,Usuario 2,Usuario 3")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean)
  .slice(0, 8);
