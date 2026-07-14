"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGERENCIAS = [
  "Compré 5 lb de carne de res",
  "Pagué 180 mil de luz",
  "Abastece toda la despensa al estándar",
  "¿Cómo vamos este mes?",
  "¿Qué debo reponer? (tabla)",
];

/* ---- mini-markdown seguro: tablas, negrita, viñetas ---- */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}
function tabla(rows: string[], key: number): ReactNode {
  const cells = rows.map((r) =>
    r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
  );
  const sep = cells[1]?.every((c) => /^:?-{2,}:?$/.test(c));
  const head = cells[0];
  const body = cells.slice(sep ? 2 : 1);
  return (
    <table key={key} className="md-table">
      <thead>
        <tr>{head.map((h, j) => <th key={j}>{inline(h)}</th>)}</tr>
      </thead>
      <tbody>
        {body.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
function md(text: string): ReactNode {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) {
      const t: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) t.push(lines[i++]);
      out.push(tabla(t, k++));
    } else if (/^\s*[-*]\s+/.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push(
        <ul key={k++} className="md-ul">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ul>
      );
    } else if (lines[i].trim() === "") {
      i++;
    } else {
      out.push(<p key={k++} className="md-p">{inline(lines[i++])}</p>);
    }
  }
  return out;
}

export default function GhettIA() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading, open]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    setError("");
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next);
    setLoading(true);
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? "Error de la IA.");
      else {
        setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
        // Si Ghett-IA ejecutó acciones (abastecer, gasto…), refresca el panel.
        if (data.changed) router.refresh();
      }
    } catch {
      setError("No pude conectar con la IA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className={`ghettia-fab ${open ? "is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir Ghett-IA, tu asistente de negocio"
        aria-expanded={open}
      >
        <span aria-hidden>🤖</span> Ghett-IA
      </button>

      {open && (
        <div className="ghettia" role="dialog" aria-label="Ghett-IA">
          <header className="ghettia__head">
            <b>Ghett-IA 🤖</b>
            <span className="ghettia__sub">tu asesor del negocio</span>
            <button className="ghettia__x" onClick={() => setOpen(false)} aria-label="Cerrar">
              ×
            </button>
          </header>

          <div className="ghettia__box" ref={boxRef} aria-live="polite">
            {msgs.length === 0 && (
              <div className="ghettia__empty">
                <p className="muted">
                  Pregúntame por finanzas y reposición — o dime lo que pasó
                  (<b>“compré 5 lb de carne”</b>, <b>“pagué 180 mil de luz”</b>) y lo
                  registro en el panel por ti.
                </p>
                <div className="chat__sugs">
                  {SUGERENCIAS.map((s) => (
                    <button key={s} className="chipbtn" onClick={() => send(s)} type="button">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`msg msg--${m.role === "user" ? "user" : "ai"}`}>
                {m.role === "assistant" ? md(m.content) : m.content}
              </div>
            ))}
            {loading && <div className="msg msg--ai msg--typing">Pensando…</div>}
          </div>

          {error && <p className="chat__error" style={{ padding: "0 12px" }}>{error}</p>}

          <form
            className="ghettia__form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="admin-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregúntale a Ghett-IA…"
              aria-label="Mensaje para Ghett-IA"
            />
            <button className="btn btn--primary btnmini" type="submit" disabled={loading || !input.trim()}>
              <span>Enviar</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
