import { guardarUsuariosAction } from "@/app/admin/acciones-ajustes";
import { MAX_USUARIOS } from "@/lib/usuarios";
import BotonGuardar from "./BotonGuardar";

/**
 * QUIÉN ENTRA AL PANEL. La contraseña es una sola para todos: esto no es una barrera
 * entre ellos, es que el historial pueda decir quién hizo qué. Por eso aquí solo hay
 * nombres, sin roles.
 */
export default function AjustesUsuarios({
  usuarios,
  propios,
}: {
  /** Los nombres que se ofrecen hoy al entrar. */
  usuarios: string[];
  /** ¿Son los de Ajustes (true) o el respaldo de fábrica (false)? */
  propios: boolean;
}) {
  // Siempre quedan casillas libres para agregar a alguien, hasta el tope.
  const casillas = [...usuarios, ...Array(Math.max(0, MAX_USUARIOS - usuarios.length)).fill("")].slice(0, MAX_USUARIOS);
  return (
    <form action={guardarUsuariosAction} className="settings settings--wide">
      <fieldset className="setgroup">
        <legend>👥 Usuarios del panel</legend>
        <p className="setgroup__nota">
          Los nombres que aparecen al entrar. La contraseña es la misma para todos: el nombre sirve
          para que el historial diga quién cobró, quién canceló y quién tocó la despensa.
          {!propios && " Hoy salen los nombres de fábrica: escribe los de tu equipo."}
        </p>
        <div className="setgrid">
          {casillas.map((u, i) => (
            <label className="field" key={i}>
              <span>Persona {i + 1}</span>
              <input
                className="admin-input"
                name="usuario"
                defaultValue={u}
                maxLength={24}
                placeholder={i < 3 ? `Ej.: ${["Carlos", "Ana", "Luis"][i]}` : "(libre)"}
                autoComplete="off"
              />
            </label>
          ))}
        </div>
        <small className="field__nota">
          Sin puntos ni símbolos: solo letras, números y espacios. Quien ya está dentro sigue con su
          nombre hasta que salga y vuelva a entrar.
        </small>
      </fieldset>
      <BotonGuardar>Guardar usuarios</BotonGuardar>
    </form>
  );
}
