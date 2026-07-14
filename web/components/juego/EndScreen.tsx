"use client";

/**
 * EndScreen — REVEAL-READY end card (Prompt Maestro §12: the game ships UNBRANDED).
 *
 * ⚠️ ISOLATION CONTRACT — DO NOT BREAK THIS SEAM.
 * This component is deliberately self-contained so the "mystery reveal" can swap this
 * sober close for a BRANDED receipt (Papaghetti ticket + discount) WITHOUT refactoring
 * the game. The swap must remain a ONE-FILE replacement:
 *   - same props: { result: RunResult; onReplay: () => void }
 *   - same mount point in GameClient (screen === "over")
 *   - keep ALL branded / receipt / discount logic INSIDE this file
 * Nothing outside this component should learn about the reveal. No branding leaks in;
 * no game state leaks out.
 */

import { useEffect, useRef, useState } from "react";
import type { RunResult } from "@/game/view/engine.ts";
import { submitRun } from "@/game/net/leaderboard.ts";

const MODE_LABEL: Record<RunResult["mode"], string> = {
  RUN: "RUN",
  RUSH: "RUSH 60",
  RETO: "RETO DIARIO",
};

type SubmitState = "idle" | "sending" | "ok" | "error";

export default function EndScreen(props: { result: RunResult; onReplay: () => void }) {
  const { result, onReplay } = props;
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const sentFor = useRef<RunResult | null>(null);

  // Submit the run to the leaderboard exactly once per run (server re-simulates to verify).
  useEffect(() => {
    if (sentFor.current === result) return;
    sentFor.current = result;
    setSubmit("sending");
    let alive = true;
    submitRun(result)
      .then((r) => {
        if (alive) setSubmit(r.ok ? "ok" : "error");
      })
      .catch(() => {
        if (alive) setSubmit("error");
      });
    return () => {
      alive = false;
    };
  }, [result]);

  const share = async () => {
    const text =
      `EL ENREDO — ${result.score.toLocaleString("es-CO")} pts` +
      (result.bestEnredo > 0 ? ` · enredo x${result.bestEnredo}` : "") +
      ` (${MODE_LABEL[result.mode]})`;
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title: "EL ENREDO", text });
        return;
      }
    } catch {
      /* user cancelled the share sheet */
    }
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      /* no clipboard access */
    }
  };

  return (
    <div className="enredo-overlay enredo-end" role="dialog" aria-label="Fin de la partida">
      <div className="enredo-end__card">
        <p className="enredo-end__eyebrow">
          {result.victory ? "Servicio completo" : "Se acabó el servicio"}
        </p>

        <div className="enredo-end__score">
          <span className="enredo-end__score-num">{result.score.toLocaleString("es-CO")}</span>
          <span className="enredo-end__score-unit">puntos</span>
        </div>

        <dl className="enredo-end__stats">
          <div>
            <dt>Mejor enredo</dt>
            <dd>{result.bestEnredo > 0 ? `x${result.bestEnredo}` : "—"}</dd>
          </div>
          <div>
            <dt>Cartas usadas</dt>
            <dd>{result.cardsPicked.length}</dd>
          </div>
          <div>
            <dt>Modo</dt>
            <dd>{MODE_LABEL[result.mode]}</dd>
          </div>
        </dl>

        {result.cardsPicked.length > 0 && (
          <ul className="enredo-end__cards" aria-label="Cartas usadas">
            {result.cardsPicked.map((id, i) => (
              <li key={`${id}-${i}`} className="enredo-end__chip">
                {id}
              </li>
            ))}
          </ul>
        )}

        <p className={`enredo-end__submit is-${submit}`} aria-live="polite">
          {submit === "sending" && "Registrando tu marca…"}
          {submit === "ok" && "Marca registrada."}
          {submit === "error" && "No pudimos registrar la marca (sin conexión)."}
          {submit === "idle" && " "}
        </p>

        <div className="enredo-end__actions">
          <button type="button" className="enredo-play" onClick={onReplay}>
            Jugar de nuevo
          </button>
          <button type="button" className="enredo-btn-ghost" onClick={share}>
            Compartir
          </button>
        </div>
      </div>
    </div>
  );
}
