"use client";

/**
 * GameClient — the client-only shell around the canvas engine.
 *
 * The engine is imported with `await import("@/game/view/engine.ts")` INSIDE an effect
 * (equivalent to next/dynamic ssr:false, but works for a non-component mount function):
 * it is code-split into its own chunk, never SSR'd, never in the main bundle.
 *
 * Responsibilities here (React/DOM side; the sim + rendering live in the engine):
 *   - START overlay: mode select (RUN / RUSH 60 / RETO DIARIO) + a big "Tocar para jugar"
 *     button that ALSO unlocks Web Audio from inside the gesture (iOS requirement).
 *   - RETO DIARIO seed derived deterministically from today's local date (YYYYMMDD -> uint32).
 *   - onGameOver -> <EndScreen/>; onHud -> thin <Hud/> overlay.
 *   - Screen Wake Lock, visibilitychange pause/resume, reduce-effects accessibility toggle.
 *   - Full-viewport dvh layout + safe-area + the hard mobile canvas CSS (see juego.css).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameHandle, HudSnapshot, RunResult } from "@/game/view/engine.ts";
import EndScreen from "@/components/juego/EndScreen";
import Hud from "@/components/juego/Hud";
import "./juego.css";

type Mode = "RUN" | "RUSH" | "RETO";
type Screen = "start" | "playing" | "over";

// Minimal Wake Lock typings (not guaranteed present in the DOM lib on all TS setups).
interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}
type NavigatorWithWakeLock = Navigator & { wakeLock?: WakeLockLike };

const REDUCE_KEY = "enredo:reduce";

/** RETO DIARIO seed: today's LOCAL date folded to YYYYMMDD as a uint32 — same for everyone, today. */
function retoSeed(): number {
  const d = new Date();
  const ymd = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return ymd >>> 0;
}
function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

const MODE_LABEL: Record<Mode, string> = {
  RUN: "RUN",
  RUSH: "RUSH 60",
  RETO: "RETO DIARIO",
};
const MODE_HINT: Record<Mode, string> = {
  RUN: "Partida completa · 8 servicios",
  RUSH: "60 segundos a fuego alto",
  RETO: "Misma semilla para todos, hoy",
};

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const pausedRef = useRef(false);

  const [screen, setScreen] = useState<Screen>("start");
  const [mode, setMode] = useState<Mode>("RUN");
  const [seed, setSeed] = useState(0);
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [reduceEffects, setReduceEffects] = useState(false);

  // Restore the accessibility preference.
  useEffect(() => {
    try {
      setReduceEffects(localStorage.getItem(REDUCE_KEY) === "1");
    } catch {
      /* private mode: ignore */
    }
  }, []);

  // Register the offline service worker (scoped to /juego). Progressive enhancement.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/juego/sw.js", { scope: "/juego/" })
      .catch(() => {
        /* offline shell is optional */
      });
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const start = useCallback(async () => {
    // iOS/Safari: Web Audio must be unlocked from inside the tap gesture, not later.
    try {
      const audio = await import("@/game/view/audio.ts");
      (audio as { unlock?: () => void }).unlock?.();
    } catch {
      /* audio module optional / not ready */
    }

    setSeed(mode === "RETO" ? retoSeed() : randomSeed());
    setResult(null);
    setHud(null);
    setPaused(false);
    setRunId((n) => n + 1);
    setScreen("playing");
  }, [mode]);

  // Mount / unmount the canvas engine for the active run.
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let handle: GameHandle | null = null;

    void (async () => {
      const engine = await import("@/game/view/engine.ts");
      if (disposed) return;
      handle = engine.mountGame(
        canvas,
        { mode, seed, reduceEffects },
        {
          onGameOver: (r) => {
            setResult(r);
            setScreen("over");
          },
          onHud: (h) => setHud(h),
        },
      );
      handleRef.current = handle;
    })();

    return () => {
      disposed = true;
      handle?.destroy();
      handleRef.current = null;
    };
    // Re-mount ONLY on a new run (runId). mode/seed/reduceEffects are frozen at start()
    // so toggling reduce-effects mid-run never restarts an 8–12 min game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, runId]);

  // Wake Lock + visibilitychange pause/resume while a run is live.
  useEffect(() => {
    if (screen !== "playing") return;
    let sentinel: WakeLockSentinelLike | null = null;

    const requestWake = async () => {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        sentinel = await nav.wakeLock.request("screen");
      } catch {
        /* denied or tab not focused */
      }
    };
    const releaseWake = () => {
      sentinel?.release().catch(() => {
        /* already released */
      });
      sentinel = null;
    };

    void requestWake();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void requestWake();
        if (!pausedRef.current) handleRef.current?.resume();
      } else {
        releaseWake();
        handleRef.current?.pause();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      releaseWake();
    };
  }, [screen]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      if (next) handleRef.current?.pause();
      else handleRef.current?.resume();
      return next;
    });
  }, []);

  const toggleReduce = useCallback(() => {
    setReduceEffects((r) => {
      const next = !r;
      try {
        localStorage.setItem(REDUCE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const replay = useCallback(() => {
    setScreen("start");
    setResult(null);
    setHud(null);
  }, []);

  return (
    <div className="enredo-viewport">
      <canvas ref={canvasRef} className="enredo-canvas" />

      {screen === "playing" && (
        <Hud
          hud={hud}
          paused={paused}
          reduceEffects={reduceEffects}
          onTogglePause={togglePause}
          onToggleReduce={toggleReduce}
        />
      )}

      {screen === "start" && (
        <div className="enredo-overlay enredo-start" role="dialog" aria-label="EL ENREDO">
          <div className="enredo-start__brandmark" aria-hidden />
          <h1 className="enredo-title">EL ENREDO</h1>

          <div className="enredo-modes" role="radiogroup" aria-label="Modo de juego">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`enredo-mode ${mode === m ? "is-active" : ""}`}
                onClick={() => setMode(m)}
              >
                <span className="enredo-mode__label">{MODE_LABEL[m]}</span>
                <span className="enredo-mode__hint">{MODE_HINT[m]}</span>
              </button>
            ))}
          </div>

          <button type="button" className="enredo-play" onClick={start}>
            Tocar para jugar
          </button>

          <label className="enredo-reduce">
            <input type="checkbox" checked={reduceEffects} onChange={toggleReduce} />
            Reducir efectos
          </label>
        </div>
      )}

      {screen === "over" && result && <EndScreen result={result} onReplay={replay} />}
    </div>
  );
}
