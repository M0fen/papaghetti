"use client";

import { useState, useTransition } from "react";
import { capturarLead } from "@/app/lead-actions";

export default function LeadCapture() {
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    const esEmail = contacto.includes("@");
    start(async () => {
      await capturarLead({
        nombre,
        email: esEmail ? contacto : undefined,
        telefono: !esEmail && contacto ? contacto : undefined,
        canal: "web",
      });
      setOk(true);
    });
  };

  if (ok) {
    return (
      <div className="loc__card">
        <h3>✨ ¡Quedaste en el Club!</h3>
        <p style={{ opacity: 0.85 }}>
          Te avisaremos de nuevos enredos y antojos. Gracias, {nombre.split(" ")[0]}.
        </p>
      </div>
    );
  }

  return (
    <div className="loc__card">
      <h3>✨ Club Papaghetti</h3>
      <p style={{ opacity: 0.85, marginBottom: 14 }}>
        Déjanos tus datos y entérate primero de nuevos enredos y promos.
      </p>
      <form onSubmit={submit} className="club-form">
        <input
          className="admin-input"
          placeholder="Tu nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-label="Nombre"
          required
        />
        <input
          className="admin-input"
          placeholder="WhatsApp o correo"
          value={contacto}
          onChange={(e) => setContacto(e.target.value)}
          aria-label="Contacto"
        />
        <button className="btn btn--gold" type="submit" disabled={pending}>
          <span>{pending ? "Enviando…" : "Unirme"}</span>
        </button>
      </form>
    </div>
  );
}
