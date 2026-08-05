import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * LA SESIÓN DEL PANEL — firmada, no inventable.
 *
 * Antes la sesión era la cookie `pg_admin` con el valor literal `"1"`, comparado con
 * `=== "1"`. `httpOnly` no protegía de nada: el atacante no necesitaba LEER la cookie,
 * le bastaba escribirla. Un `curl -H 'Cookie: pg_admin=1' .../admin` entraba al panel
 * completo — reportes con el P&L, leads con teléfonos, cobrar y cancelar pedidos
 * ajenos, y `resetTodo`. La contraseña era irrelevante porque nadie tenía que adivinarla.
 *
 * Ahora la cookie es `<vence>.<hmac>`: sin el secreto del servidor no se puede fabricar
 * un valor que pase la verificación, y la comparación es en tiempo constante.
 */

const COOKIE = "pg_admin";
const DURACION_MS = 8 * 60 * 60 * 1000; // 8 h de turno

/** En local (next dev) hace falta poder entrar sin configurar nada. En producción, no. */
const ES_DEV = process.env.NODE_ENV !== "production";
const CLAVE_DEV = "papaghetti-dev";

/**
 * El secreto de firma. En PRODUCCIÓN, si no está definido, NADIE entra — antes, si
 * faltaba la variable de entorno, la contraseña caía a `"papaghetti"` y el panel
 * quedaba abierto al mundo con una clave publicada en el README. Fallar cerrado es la
 * única opción defendible cuando hay dinero detrás.
 */
function secreto(): string | null {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (s && s.trim().length >= 8) return s.trim();
  return ES_DEV ? CLAVE_DEV : null;
}

function firmar(vence: number, key: string): string {
  return crypto.createHmac("sha256", key).update(`v1.${vence}`).digest("hex");
}

/** Compara en tiempo constante (evita distinguir un HMAC casi-correcto por el tiempo). */
function igual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

/** ¿La petición trae una sesión válida y vigente? */
export async function haySesion(): Promise<boolean> {
  const key = secreto();
  if (!key) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [venceStr, mac] = raw.split(".");
  const vence = Number(venceStr);
  if (!Number.isFinite(vence) || !mac) return false;
  if (vence < Date.now()) return false; // caducada
  return igual(mac, firmar(vence, key));
}

/** Abre sesión (tras validar la contraseña) o la RENUEVA en cada acción exitosa. */
export async function abrirSesion(): Promise<void> {
  const key = secreto();
  if (!key) return;
  const vence = Date.now() + DURACION_MS;
  (await cookies()).set(COOKIE, `${vence}.${firmar(vence, key)}`, {
    httpOnly: true,
    sameSite: "lax",
    // En producción la cookie NUNCA debe viajar en claro. En local (http) sí,
    // o no habría forma de entrar al panel para desarrollar.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DURACION_MS / 1000),
  });
}

export async function cerrarSesion(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** ¿Está el panel configurado para poder usarse? (sin secreto, nadie entra) */
export const sesionConfigurada = (): boolean => secreto() !== null;

/**
 * Freno de fuerza bruta al login. En memoria de la instancia: no es una defensa
 * distribuida, pero convierte "probar 10.000 claves" en algo inviable desde un solo
 * origen, que es el ataque realista contra un panel de un restaurante.
 */
const intentos = new Map<string, { n: number; hasta: number }>();
const MAX_INTENTOS = 8;
const CASTIGO_MS = 10 * 60 * 1000;

export function loginBloqueado(ip: string): boolean {
  const e = intentos.get(ip);
  if (!e) return false;
  if (e.hasta > Date.now()) return true;
  if (e.hasta && e.hasta <= Date.now()) intentos.delete(ip);
  return false;
}

export function registrarFallo(ip: string): void {
  const e = intentos.get(ip) ?? { n: 0, hasta: 0 };
  e.n += 1;
  if (e.n >= MAX_INTENTOS) e.hasta = Date.now() + CASTIGO_MS;
  intentos.set(ip, e);
  if (intentos.size > 500) intentos.clear(); // techo de memoria
}

export function limpiarIntentos(ip: string): void {
  intentos.delete(ip);
}

/** Compara la contraseña en tiempo constante. */
export function claveCorrecta(intento: string): boolean {
  // Sin ADMIN_PASSWORD en producción nadie entra; en local vale la clave de desarrollo.
  const esperada = (process.env.ADMIN_PASSWORD ?? "").trim() || (ES_DEV ? CLAVE_DEV : "");
  if (!esperada) return false;
  const a = Buffer.from(intento);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
