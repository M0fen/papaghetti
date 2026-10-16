/**
 * QUIÉN usa el panel.
 *
 * Los tres comparten la MISMA contraseña: esto no es una barrera entre ellos, es
 * ATRIBUCIÓN. El historial decía "Canceló #A1B2" sin nombre, así que un descuadre
 * o un pedido borrado no se le podía preguntar a nadie en concreto.
 *
 * Los nombres los pone el dueño en Ajustes → Usuarios del panel. Antes vivían solo en
 * la variable NEXT_PUBLIC_PG_USUARIOS, que se congela al desplegar: corregir un nombre
 * mal escrito exigía un despliegue. La variable queda como RESPALDO (si Ajustes no
 * tiene nombres, o si el cerebro no se puede leer en la pantalla de entrada), y sin
 * ella siguen "Usuario 1/2/3".
 *
 * Vive aparte de lib/sesion.ts porque la pantalla de entrada es un componente de
 * cliente y sesion.ts importa `next/headers`, que no puede viajar al navegador.
 */

/** Como mucho este número de personas en la pantalla de entrada. */
export const MAX_USUARIOS = 8;

/**
 * Un nombre que cabe en la cookie de sesión. SIN PUNTOS: la cookie es
 * `<vence>.<usuario>.<firma>`, y con un punto dentro del nombre ("Sra. Luz") la
 * sesión no validaba y esa persona volvía al login en cada clic.
 */
export const nombreUsuario = (u: string): string =>
  String(u ?? "")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

/** Limpia una lista: sin vacíos, sin repetidos (sin importar mayúsculas), con tope. */
export function limpiarUsuarios(lista: readonly string[] | undefined | null): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const crudo of lista ?? []) {
    const u = nombreUsuario(crudo);
    const clave = u.toLocaleLowerCase("es-CO");
    if (!u || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(u);
    if (out.length >= MAX_USUARIOS) break;
  }
  return out;
}

/** El respaldo: la variable de entorno, o "Usuario 1/2/3". */
export const USUARIOS: string[] = (() => {
  const desdeEnv = limpiarUsuarios((process.env.NEXT_PUBLIC_PG_USUARIOS || "").split(","));
  return desdeEnv.length ? desdeEnv : ["Usuario 1", "Usuario 2", "Usuario 3"];
})();

/** Los nombres que se ofrecen al entrar: los de Ajustes, o el respaldo. */
export function usuariosDe(a?: { usuarios?: readonly string[] } | null): string[] {
  const propios = limpiarUsuarios(a?.usuarios);
  return propios.length ? propios : USUARIOS;
}
