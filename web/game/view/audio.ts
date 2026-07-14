/**
 * audio.ts — minimal synthesized SFX for EL ENREDO (VIEW-ONLY). No asset files.
 *
 * iOS/Safari require an AudioContext to be created/resumed inside a user gesture, so
 * everything is a safe no-op until unlock() runs behind a "tap to play" tap. All effects
 * are short synthesized tones (oscillator + gain envelope) — zero network, zero decode.
 * A very quiet layered drone can be crossfaded via setLayer() as an intensity hook.
 */

export type GameAudio = {
  /** Create/resume the context inside a user gesture (idempotent). */
  unlock(): void;
  /** Eat blip; pitch rises a semitone per consecutive topping (streak >= 1). */
  eat(streak: number): void;
  /** Enredo loop closed — a rising golden chime. */
  enredo(): void;
  /** Pedido completed — a bright two-note confirm. */
  pedido(): void;
  /** Papa appeared — an urgent double pip. */
  papa(): void;
  /** Death — a descending thud. */
  death(): void;
  /** Layered ambience gain in [0,1] (intensity hook; smoothly crossfaded). */
  setLayer(intensity01: number): void;
  destroy(): void;
};

const SEMI = Math.pow(2, 1 / 12);

function getCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneGain: GainNode | null = null;
  let unlocked = false;

  const ensure = (): boolean => unlocked && ctx !== null && ctx.state === "running";

  /** One enveloped oscillator note. */
  const tone = (
    freq: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    delay: number,
  ): void => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  /** A note whose pitch glides from f0 to f1 (chimes / thuds). */
  const glide = (
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    peak: number,
  ): void => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  return {
    unlock(): void {
      if (unlocked) {
        if (ctx && ctx.state === "suspended") void ctx.resume();
        return;
      }
      const Ctor = getCtor();
      if (!Ctor) return;
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        // Subtle layered drone (starts silent; setLayer crossfades it in).
        const drone = ctx.createOscillator();
        droneGain = ctx.createGain();
        drone.type = "sine";
        drone.frequency.value = 110;
        droneGain.gain.value = 0;
        drone.connect(droneGain);
        droneGain.connect(master);
        drone.start();
        void ctx.resume();
        unlocked = true;
      } catch {
        ctx = null;
        master = null;
        droneGain = null;
        unlocked = false;
      }
    },
    eat(streak: number): void {
      if (!ensure()) return;
      const s = streak < 1 ? 1 : streak > 16 ? 16 : streak;
      tone(520 * Math.pow(SEMI, s - 1), 0.1, "triangle", 0.22, 0);
    },
    enredo(): void {
      if (!ensure()) return;
      glide(330, 880, 0.34, "sawtooth", 0.28);
      tone(660, 0.3, "sine", 0.16, 0.04);
    },
    pedido(): void {
      if (!ensure()) return;
      tone(784, 0.12, "square", 0.2, 0);
      tone(1175, 0.18, "square", 0.2, 0.1);
    },
    papa(): void {
      if (!ensure()) return;
      tone(300, 0.09, "square", 0.24, 0);
      tone(300, 0.09, "square", 0.24, 0.14);
    },
    death(): void {
      if (!ensure()) return;
      glide(320, 60, 0.7, "sawtooth", 0.32);
    },
    setLayer(intensity01: number): void {
      if (!ctx || !droneGain) return;
      const v = intensity01 < 0 ? 0 : intensity01 > 1 ? 1 : intensity01;
      droneGain.gain.setTargetAtTime(0.06 * v, ctx.currentTime, 0.25);
    },
    destroy(): void {
      if (ctx) {
        try {
          void ctx.close();
        } catch {
          /* ignore */
        }
      }
      ctx = null;
      master = null;
      droneGain = null;
      unlocked = false;
    },
  };
}
