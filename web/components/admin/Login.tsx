"use client";

/**
 * LA PUERTA DEL CEREBRO.
 *
 * Lo primero que ve el operario al abrir el local, muchas veces con una mano y con
 * prisa. Por eso: campo grande, teclado que no estorba, un solo botón, y errores
 * que dicen QUÉ pasó — antes solo existía "Contraseña incorrecta", así que un panel
 * sin `ADMIN_PASSWORD` configurada se veía igual que una clave mal tecleada.
 */

import Image from "next/image";
import Link from "next/link";
import logo from "@/public/logo-papaghetti.webp";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { login } from "@/app/admin/actions";

const MENSAJES: Record<string, { txt: string; ayuda?: string }> = {
  "1": { txt: "Esa contraseña no es." },
  espera: {
    txt: "Demasiados intentos.",
    ayuda: "Por seguridad la entrada queda bloqueada unos minutos.",
  },
  config: {
    txt: "El panel no tiene contraseña configurada.",
    ayuda: "Hay que definir ADMIN_PASSWORD en Vercel para poder entrar.",
  },
};

function Entrar() {
  // Sin esto el botón no cambia y el operario vuelve a pulsar: dos envíos.
  const { pending } = useFormStatus();
  return (
    <button className="alogin__btn" type="submit" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export default function Login() {
  const error = useSearchParams().get("error");
  const msg = error ? MENSAJES[error] ?? MENSAJES["1"] : null;

  return (
    <main className="alogin">
      <div className="alogin__card">
        <Image src={logo} alt="Papaghetti" priority className="alogin__logo" />
        <h1 className="alogin__h">El cerebro</h1>
        <p className="alogin__sub">Pedidos, cocina, despensa y caja.</p>

        <form action={login} className="alogin__form">
          <label className="alogin__campo">
            <span className="visually-hidden">Contraseña</span>
            <input
              type="password"
              name="password"
              placeholder="Contraseña"
              autoFocus
              autoComplete="current-password"
              className="alogin__inp"
              aria-invalid={!!msg}
            />
          </label>
          <Entrar />
        </form>

        {msg && (
          <p className="alogin__error" role="alert">
            {msg.txt}
            {msg.ayuda && <span>{msg.ayuda}</span>}
          </p>
        )}

        <Link className="alogin__volver" href="/">
          ← Volver al sitio
        </Link>
      </div>
    </main>
  );
}
