"use client";

/**
 * Sonido diegético de EMPLATA (WebAudio synth, compartido por la v1 DOM y el juego canvas).
 * Unlock en el primer gesto; mute persistido. Cada ingrediente suena a lo que ES.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ingrediente } from "@/lib/menu";

export function useSonido() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null); // bus maestro (todo pasa por aquí)
  const noiseRef = useRef<AudioBuffer | null>(null); // 1s de ruido blanco cacheado
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
      const ctx = new Ctor();
      // bus: master → compresor → destino (evita clipeo del parlante en combos rápidos)
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.16;
      master.connect(comp);
      comp.connect(ctx.destination);
      masterRef.current = master;
      // buffer de ruido cacheado (1s) — cero alocación por golpe
      const n = ctx.sampleRate;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseRef.current = buf;
      ctxRef.current = ctx;
    } catch {
      ctxRef.current = null;
    }
  }, []);

  const tone = useCallback(
    (
      freq: number,
      dur: number,
      type: OscillatorType,
      peak: number,
      glideTo?: number,
      when = 0,
      detune = 0,
    ) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master || muteRef.current) return;
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (detune) osc.detune.setValueAtTime(detune, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    [],
  );

  const ruido = useCallback((dur: number, peak: number, hp = 1200, when = 0) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buf = noiseRef.current;
    if (!ctx || !master || !buf || muteRef.current) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    // envolvente decreciente (antes venía del buffer; ahora del gain para poder cachear)
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }, []);

  /**
   * Sonido según el ingrediente (crocante cruje, salsa chapotea, maíz tintinea…), con
   * ENERGÍA cinética [0..1] del aterrizaje: más fuerte cuanto más rápido cae, + detune
   * aleatorio para que dos papas nunca suenen idénticas (Nour).
   */
  const caida = useCallback(
    (ing: Ingrediente, energia = 1) => {
      const id = ing.id;
      const e = 0.6 + 0.4 * Math.max(0, Math.min(1, energia));
      const dt = (Math.random() * 2 - 1) * 25; // ±25 cents
      if (/chicharron|tocineta|crispy|nugget/.test(id)) {
        ruido(0.09, 0.2 * e, 2400);
        tone(180, 0.08, "triangle", 0.1 * e, undefined, 0, dt);
      } else if (/salsa|hogao|bolonesa|napolitana|queso|bechamel/.test(id)) {
        tone(220, 0.16, "sine", 0.18 * e, 90, 0, dt);
      } else if (/maicito|maiz|parmesano|perejil/.test(id)) {
        tone(880, 0.07, "triangle", 0.12 * e, undefined, 0, dt);
        tone(1320, 0.06, "sine", 0.08 * e, undefined, 0, dt);
      } else if (ing.categoria === "base") {
        tone(130, 0.14, "sine", 0.2 * e, 80, 0, dt);
        ruido(0.05, 0.06 * e, 600);
      } else {
        tone(420, 0.09, "triangle", 0.14 * e, undefined, 0, dt);
      }
    },
    [tone, ruido],
  );

  const confirmar = useCallback(() => {
    // arpegio ascendente agendado en el reloj de audio (sin jitter del main thread)
    tone(523, 0.1, "triangle", 0.16, undefined, 0);
    tone(784, 0.14, "triangle", 0.16, undefined, 0.05);
    tone(1046, 0.22, "sine", 0.14, undefined, 0.1);
    ruido(0.12, 0.05, 500);
  }, [tone, ruido]);

  /** Escala pentatónica para que toda seguidilla de emplatado sea musical. */
  const combo = useCallback(
    (n: number) => {
      const escala = [392, 440, 523, 587, 698];
      tone(escala[Math.min(n, escala.length - 1)], 0.09, "triangle", 0.1);
    },
    [tone],
  );

  const toggleMute = useCallback(() => {
    setMute((m) => {
      localStorage.setItem("emplata-mute", m ? "0" : "1");
      return !m;
    });
  }, []);

  return { unlock, caida, confirmar, combo, mute, toggleMute, tone, ruido };
}
