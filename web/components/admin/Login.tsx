"use client";

import { useSearchParams } from "next/navigation";
import { login } from "@/app/admin/actions";

export default function Login() {
  const error = useSearchParams().get("error");
  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <p className="eyebrow">El cerebro · Papaghetti</p>
        <h1 style={{ fontSize: "2rem", margin: "8px 0 4px" }}>Consola de admin</h1>
        <p style={{ opacity: 0.7, marginBottom: 20 }}>
          Menú, pedidos, inventario y leads — en un solo lugar.
        </p>
        <form action={login} className="admin-login__form">
          <input
            type="password"
            name="password"
            placeholder="Contraseña"
            autoFocus
            className="admin-input"
            aria-label="Contraseña"
          />
          <button className="btn btn--primary" type="submit">
            <span>Entrar</span>
          </button>
        </form>
        {error && (
          <p style={{ color: "var(--pg-pomodoro)", marginTop: 12 }}>
            Contraseña incorrecta.
          </p>
        )}
      </div>
    </div>
  );
}
