"use client";

/**
 * Sonido diegético de EMPLATA (WebAudio synth, compartido por la v1 DOM y el juego canvas).
 * Unlock en el primer gesto; mute persistido. Cada ingrediente suena a lo que ES.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ingrediente } from "@/lib/menu";

export function useSonido() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [mute, setMute] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("emplata-mute") === "1";
  });
  const muteRef = useRef(mute);
  useEffect(() => {
    muteRef.current = mute;
  }, [mute]);

  const unlock = useCallback(() => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctxRef.current = new Ctor();
    } catch {
      ctxRef.current = null;
    }
  }, []);

  const tone = useCallback(
    (freq: number, dur: number, type: OscillatorType, peak: number, glideTo?: number) => {
      const ctx = ctxRef.current;
      if (!ctx || muteRef.current) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    [],
  );

  const ruido = useCallback((dur: number, peak: number, hp = 1200) => {
    const ctx = ctxRef.current;
    if (!ctx || muteRef.current) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start();
  }, []);

  /** Sonido según el ingrediente (crocante cruje, salsa chapotea, maíz tintinea…). */
  const caida = useCallback(
    (ing: Ingrediente) => {
      const id = ing.id;
      if (/chicharron|tocineta|crispy|nugget/.test(id)) {
        ruido(0.09, 0.2, 2400);
        tone(180, 0.08, "triangle", 0.1);
      } else if (/salsa|hogao|bolonesa|napolitana|queso|bechamel/.test(id)) {
        tone(220, 0.16, "sine", 0.18, 90);
      } else if (/maicito|maiz|parmesano|perejil/.test(id)) {
        tone(880, 0.07, "triangle", 0.12);
        tone(1320, 0.06, "sine", 0.08);
      } else if (ing.categoria === "base") {
        tone(130, 0.14, "sine", 0.2, 80);
        ruido(0.05, 0.06, 600);
      } else {
        tone(420, 0.09, "triangle", 0.14);
      }
    },
    [tone, ruido],
  );

  const confirmar = useCallback(() => {
    tone(523, 0.1, "triangle", 0.16);
    tone(784, 0.14, "triangle", 0.16);
    setTimeout(() => tone(1046, 0.2, "sine", 0.14), 90);
    ruido(0.12, 0.05, 500);
  }, [tone, ruido]);

  const toggleMute = useCallback(() => {
    setMute((m) => {
      localStorage.setItem("emplata-mute", m ? "0" : "1");
      return !m;
    });
  }, []);

  return { unlock, caida, confirmar, mute, toggleMute, tone, ruido };
}
