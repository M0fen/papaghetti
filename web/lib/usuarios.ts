/**
 * QUIÉN usa el panel.
 *
 * Los tres comparten la MISMA contraseña: esto no es una barrera entre ellos, es
 * ATRIBUCIÓN. El historial decía "Canceló #A1B2" sin nombre, así que un descuadre
 * o un pedido borrado no se le podía preguntar a nadie en concreto.
 *
 * Vive aparte de lib/sesion.ts porque la pantalla de entrada es un componente de
 * cliente y sesion.ts importa `next/headers`, que no puede viajar al navegador.
 *
 * Para cambiar los nombres: PG_USUARIOS="Carlos,Ana,Luis" en Vercel, o aquí mismo.
 */
export const USUARIOS: string[] = (process.env.NEXT_PUBLIC_PG_USUARIOS ||
  "Carlos,Mesero 1,Mesero 2")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean)
  .slice(0, 8);
