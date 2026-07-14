/**
 * engine.ts — mountGame: the Canvas2D game loop for EL ENREDO.
 *
 * Deterministic sim, view-only juice. A fixed 60Hz accumulator drives step(); the render
 * INTERPOLATES between the previous body snapshot and the current one so high-refresh
 * displays look smooth WITHOUT running the sim faster. Every tick's Input is recorded to
 * inputLog for anti-cheat replay. Hit-stop freezes only the render; screen shake, micro-
 * zoom, heat and the golden enredo flash are cosmetic. Camera fits the whole pan (border)
 * and biases the viewport up so the finger never occludes the head. DPR is capped at 2.
 */

import { createWorld, step } from "@/game/sim/index.ts";
import type { World, Input } from "@/game/sim/index.ts";
import { PHASE } from "@/game/sim/types.ts";
import { CARD_POOL } from "@/game/sim/cards.ts";
import { TICKS_PER_SEC, COSECHA_MAX, ALMIDON_MAX, TOP_BASE } from "@/game/sim/constants.ts";
import { createSteer } from "./input.ts";
import type { SteerController } from "./input.ts";
import { createAudio } from "./audio.ts";
import type { GameAudio } from "./audio.ts";
import {
  renderFrame,
  draftLayout,
  PT_SAUCE,
  PT_BURST,
  PT_SPARK,
  PT_SPEED,
  PT_VAPOR,
  PT_FLASH,
} from "./render.ts";
import type { Camera, FrameState, Insets, Rect } from "./render.ts";

const MAXN = 4096; // MAX_NODES
const FIXED_MS = 1000 / TICKS_PER_SEC;
const MAX_STEPS = 6; // spiral-of-death guard
const HEAT_RANGE = 2.0; // multiplier 1..3 maps to heat 0..1
const STREAK_WINDOW = 45; // ticks; consecutive-topping streak window

export type RunResult = {
  seed: number;
  mode: "RUN" | "RUSH" | "RETO";
  score: number;
  durationMs: number;
  victory: boolean;
  bestEnredo: number;
  cardsPicked: string[];
  inputLog: Array<{ t: number; a: number; b: 0 | 1; c: number; r: 0 | 1 }>;
};

export type HudSnapshot = {
  score: number;
  multiplier: number;
  service: number;
  cosecha01: number;
  almidon01: number;
  phase: "PLAY" | "DRAFT" | "DEAD";
  alive: boolean;
};

export type EngineOptions = { mode: "RUN" | "RUSH" | "RETO"; seed: number; reduceEffects?: boolean };
export type EngineCallbacks = { onGameOver: (r: RunResult) => void; onHud?: (h: HudSnapshot) => void };
export interface GameHandle {
  destroy(): void;
  pause(): void;
  resume(): void;
}

type WakeLockLike = { release: () => Promise<void> };
type WakeLockNav = Navigator & {
  wakeLock?: { request: (t: "screen") => Promise<WakeLockLike> };
};

export function mountGame(
  canvas: HTMLCanvasElement,
  opts: EngineOptions,
  cb: EngineCallbacks,
): GameHandle {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const reduceEffects = opts.reduceEffects === true;
  const world: World = createWorld(opts.seed, opts.mode);

  const controller: SteerController = createSteer(canvas);
  controller.setAngle(world.heading);
  const audio: GameAudio = createAudio();

  // Reusable buffers (no per-tick heap allocation).
  const prevBodyX = new Int32Array(MAXN);
  const prevBodyY = new Int32Array(MAXN);
  let prevBodyCount = 0;
  const input: Input = { angle: world.heading, boost: false, cardPick: -1, reroll: 0 };

  const cam: Camera = { x: 0, y: 0, scale: 1, biasY: 0, shakeX: 0, shakeY: 0 };

  // Juice / smoothing state.
  let shakeMag = 0;
  let microZoom = 1;
  let enredoFlash = 0;
  let heat01 = 0;
  let hitStop = 0;
  let eatStreak = 0;
  let lastEatTick = -999;

  // Character juice (view-only, dt-normalized in frame()).
  let mouthOpen = 0;
  let headStretch = 1;
  let flashHead = 0;
  let gaze = (world.heading / 65536) * Math.PI * 2;
  let abilityPulse = 0;
  let prevAlm = world.almidon;
  let eatBurstPending = 0;
  let sparkPending = 0;
  let deathBurstPending = 0;
  let sauceTick = 0;

  // Particle pool — SoA, WORLD-anchored, swap-remove. Pure view; never read by /sim.
  const MAXP = 512;
  const pPx = new Float32Array(MAXP);
  const pPy = new Float32Array(MAXP);
  const pVx = new Float32Array(MAXP);
  const pVy = new Float32Array(MAXP);
  const pLife = new Float32Array(MAXP);
  const pMax = new Float32Array(MAXP);
  const pSize = new Float32Array(MAXP);
  const pType = new Uint8Array(MAXP);
  let pCount = 0;
  // Reused reference object (no per-frame alloc); only .count is rewritten each frame.
  const parts = {
    px: pPx,
    py: pPy,
    vx: pVx,
    vy: pVy,
    life: pLife,
    size: pSize,
    type: pType,
    count: 0,
  };
  const spawn = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    type: number,
  ): void => {
    if (pCount >= MAXP) return;
    const i = pCount++;
    pPx[i] = x;
    pPy[i] = y;
    pVx[i] = vx;
    pVy[i] = vy;
    pLife[i] = 1;
    pMax[i] = life;
    pSize[i] = size;
    pType[i] = type;
  };

  // Event trackers (compared each step).
  let trkScore = world.score;
  let trkMult = world.globalMult;
  let trkTop = world.topCount;
  let trkEaten = world.toppingsEaten;
  let trkPapa = world.papaCount;
  let trkPhase: string = world.phase;
  let bestEnredo = 0;

  // Floating "+score" popups (view-only juice), positioned in WORLD units so the camera moves them.
  const pops: { wx: number; wy: number; age: number; text: string }[] = [];

  // Result accumulators.
  const inputLog: RunResult["inputLog"] = [];
  const cardsPicked: string[] = [];
  const startTime = performance.now();
  let ended = false;

  // View sizing.
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  const insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  const readInsets = (): void => {
    const cs = getComputedStyle(canvas);
    const pick = (v: string): number => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    insets.top = pick(cs.getPropertyValue("--safe-top")) || 0;
    insets.right = pick(cs.getPropertyValue("--safe-right")) || 0;
    insets.bottom = pick(cs.getPropertyValue("--safe-bottom")) || 0;
    insets.left = pick(cs.getPropertyValue("--safe-left")) || 0;
  };

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    readInsets();
    controller.setInsets(insets);
  };
  resize();

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ----- timing -----
  let acc = 0;
  let last = performance.now();
  let paused = false;
  let raf = 0;

  // ----- audio unlock behind first gesture -----
  const unlock = (): void => audio.unlock();
  canvas.addEventListener("pointerdown", unlock, { passive: true });

  // ----- wake lock -----
  let wakeLock: WakeLockLike | null = null;
  const requestWake = (): void => {
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return;
    nav.wakeLock
      .request("screen")
      .then((wl) => {
        wakeLock = wl;
      })
      .catch(() => {
        wakeLock = null;
      });
  };
  const releaseWake = (): void => {
    if (wakeLock) {
      void wakeLock.release();
      wakeLock = null;
    }
  };
  requestWake();

  // ----- per-tick sim advance -----
  const doStep = (): void => {
    // snapshot the body BEFORE stepping (interpolation source)
    prevBodyCount = world.bodyCount;
    prevBodyX.set(world.bodyX.subarray(0, prevBodyCount));
    prevBodyY.set(world.bodyY.subarray(0, prevBodyCount));
    const bodyCountBefore = world.bodyCount;

    // build input
    input.angle = controller.readAngle();
    input.boost = controller.readBoost();
    input.cardPick = -1;
    input.reroll = 0;
    if (world.phase === PHASE.DRAFT) {
      const pick = controller.consumeDraftPick();
      const rr = controller.consumeReroll();
      if (rr === 1 && world.rerollLeft > 0) {
        input.reroll = 1;
      } else if (pick >= 0 && pick < world.offerCount) {
        input.cardPick = pick;
        cardsPicked.push(CARD_POOL[world.offerIds[pick]]);
      }
    }

    // record BEFORE stepping (tick is this tick's index)
    inputLog.push({
      t: world.tick,
      a: input.angle,
      b: input.boost ? 1 : 0,
      c: input.cardPick,
      r: input.reroll as 0 | 1,
    });

    step(world, input);

    // ----- event detection (snapshot deltas) -----
    const scoreDelta = world.score - trkScore;
    if (scoreDelta > 0 && pops.length < 24) {
      pops.push({ wx: world.bodyX[0] / 65536, wy: world.bodyY[0] / 65536, age: 0, text: "+" + scoreDelta });
    }

    // eat
    if (world.toppingsEaten > trkEaten) {
      eatStreak = world.tick - lastEatTick <= STREAK_WINDOW ? eatStreak + 1 : 1;
      lastEatTick = world.tick;
      audio.eat(eatStreak);
      if (shakeMag < 1) shakeMag = 1;
      if (hitStop < 1) hitStop = 1;
      // character reaction (burst spawned once per FRAME, not per step — see frame())
      eatBurstPending++;
      mouthOpen = 1;
      flashHead = 1;
      headStretch = 0.86; // gulp squash, eases back in frame()
    }

    // enredo: cut drops bodyCount; Corte Limpio (no-cut) -> big score + enclosed toppings gone
    const bodyCut = world.bodyCount < bodyCountBefore;
    const topDrop = trkTop - world.topCount;
    const eatenDelta = world.toppingsEaten - trkEaten;
    const enclosed = topDrop - eatenDelta;
    if (bodyCut || (enclosed >= 2 && scoreDelta > TOP_BASE * 2)) {
      const mult = Math.max(1, Math.min(enclosed, world.mods.loopCap));
      if (mult > bestEnredo) bestEnredo = mult;
      shakeMag = Math.max(shakeMag, 4);
      microZoom = 1.06;
      enredoFlash = 1;
      hitStop = Math.max(hitStop, 2);
      sparkPending++;
      audio.enredo();
    }

    // pedido complete: globalMult only rises on completion
    if (world.globalMult > trkMult) {
      shakeMag = Math.max(shakeMag, 8);
      audio.pedido();
    }

    // papa appear
    if (world.papaCount > trkPapa) audio.papa();

    // death
    if (world.phase === PHASE.DEAD && trkPhase !== PHASE.DEAD) {
      shakeMag = Math.max(shakeMag, 14);
      deathBurstPending = 1;
      flashHead = 1;
      headStretch = 0.8;
      audio.death();
      finish();
    }

    // roll trackers
    trkScore = world.score;
    trkMult = world.globalMult;
    trkTop = world.topCount;
    trkEaten = world.toppingsEaten;
    trkPapa = world.papaCount;
    trkPhase = world.phase;
  };

  const finish = (): void => {
    if (ended) return;
    ended = true;
    releaseWake();
    const result: RunResult = {
      seed: opts.seed,
      mode: opts.mode,
      score: world.score,
      durationMs: Math.round(performance.now() - startTime),
      victory: world.victory === 1,
      bestEnredo,
      cardsPicked: cardsPicked.slice(),
      inputLog,
    };
    cb.onGameOver(result);
  };

  // ----- camera -----
  // Follow the head and ZOOM IN to a window (~VIEW_SPAN world-units) so the snake reads as a
  // substantial, fast creature — not a tiny dot in the whole arena. When the world contracts
  // below the view span, the full pan fits and the camera stops panning (border closes in).
  const VIEW_SPAN = 470; // world-units across the smaller screen dimension (tighter = less empty)
  const updateCamera = (): void => {
    const halfU = world.usableHalf / 65536;
    const marginU = 70;
    const spanU = Math.min(VIEW_SPAN, 2 * (halfU + marginU));
    cam.scale = (Math.min(cssW, cssH) / spanU) * microZoom;
    const headX = world.bodyX[0] / 65536;
    const headY = world.bodyY[0] / 65536;
    // Clamp so we never reveal much beyond the pan border.
    const halfViewX = cssW / cam.scale / 2;
    const halfViewY = cssH / cam.scale / 2;
    const limX = Math.max(0, halfU + marginU - halfViewX);
    const limY = Math.max(0, halfU + marginU - halfViewY);
    // Velocity LOOKAHEAD: aim ahead of the head in the heading direction, then ease toward it
    // (world scrolls past; the head sits centred-ish and you see where you're going).
    const hr = (world.heading / 65536) * 2 * Math.PI;
    const lead = (input.boost ? 95 : 55) / cam.scale; // world units (small lead = less swing on turns)
    const tgtX = Math.max(-limX, Math.min(limX, headX + Math.cos(hr) * lead));
    const tgtY = Math.max(-limY, Math.min(limY, headY + Math.sin(hr) * lead));
    cam.x += (tgtX - cam.x) * 0.22; // snappier tracking so turns don't feel laggy
    cam.y += (tgtY - cam.y) * 0.22;
    cam.biasY = cssH > cssW ? cssH * 0.1 : 0; // thumb bias in portrait
    if (reduceEffects || shakeMag < 0.1) {
      cam.shakeX = 0;
      cam.shakeY = 0;
    } else {
      cam.shakeX = (Math.random() * 2 - 1) * shakeMag;
      cam.shakeY = (Math.random() * 2 - 1) * shakeMag;
    }
  };

  let hudFrame = 0;
  const emitHud = (): void => {
    if (!cb.onHud) return;
    cb.onHud({
      score: world.score,
      multiplier: world.globalMult / 65536,
      service: world.service,
      cosecha01: Math.max(0, Math.min(1, world.cosecha / COSECHA_MAX)),
      almidon01: Math.max(0, Math.min(1, world.almidon / ALMIDON_MAX)),
      phase: world.phase,
      alive: world.phase !== PHASE.DEAD,
    });
  };

  // ----- main loop -----
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    if (paused) {
      last = now;
      return;
    }
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // clamp huge stalls
    acc += dt;

    let steps = 0;
    while (acc >= FIXED_MS && steps < MAX_STEPS && !ended) {
      doStep();
      acc -= FIXED_MS;
      steps++;
    }

    // interpolation alpha; hit-stop holds the latest discrete frame
    let alpha = acc / FIXED_MS;
    if (hitStop > 0) {
      alpha = 1;
      hitStop--;
    }

    // ---- decay juice — dt-NORMALIZED so 60 / 120 / 144 Hz feel identical ----
    const dtS = dt / 1000;
    const dpow = (base: number): number => Math.pow(base, dt / 16.6667);
    shakeMag *= dpow(0.86);
    enredoFlash *= dpow(0.9);
    microZoom += (1 - microZoom) * (1 - dpow(0.85));
    mouthOpen *= dpow(0.82);
    flashHead *= dpow(0.6);
    abilityPulse *= dpow(0.85);
    const targetHeat = Math.max(0, Math.min(1, (world.globalMult / 65536 - 1) / HEAT_RANGE));
    heat01 += (targetHeat - heat01) * (1 - dpow(0.92));
    const targetStretch = input.boost ? 1.42 : 1;
    headStretch += (targetStretch - headStretch) * (1 - dpow(0.78));
    audio.setLayer(heat01);

    // eyes: micro-lag toward heading (shortest-angle)
    const headRad = (world.heading / 65536) * Math.PI * 2;
    let dg = headRad - gaze;
    dg = Math.atan2(Math.sin(dg), Math.cos(dg));
    gaze += dg * Math.min(1, 0.22 * (dt / 16.6667));

    // ability "ready" pulse when almidón refills to full
    if (world.almidon >= ALMIDON_MAX && prevAlm < ALMIDON_MAX) abilityPulse = 1;
    prevAlm = world.almidon;

    // ---- view-only particle sim + spawns (WORLD units; never touches /sim) ----
    const hxw = world.bodyX[0] / 65536;
    const hyw = world.bodyY[0] / 65536;
    const drag = Math.pow(0.5, dtS / 0.4);
    for (let i = pCount - 1; i >= 0; i--) {
      pPx[i] += pVx[i] * dtS;
      pPy[i] += pVy[i] * dtS;
      pVx[i] *= drag;
      pVy[i] *= drag;
      pLife[i] -= dtS / pMax[i];
      if (pLife[i] <= 0) {
        pCount--;
        pPx[i] = pPx[pCount];
        pPy[i] = pPy[pCount];
        pVx[i] = pVx[pCount];
        pVy[i] = pVy[pCount];
        pLife[i] = pLife[pCount];
        pMax[i] = pMax[pCount];
        pSize[i] = pSize[pCount];
        pType[i] = pType[pCount];
      }
    }
    if (world.phase === PHASE.PLAY) {
      sauceTick++;
      // simple, eye-catching RED SAUCE TRAIL — a drip left under the noodle
      if ((sauceTick & 1) === 0) {
        spawn(
          hxw + (Math.random() - 0.5) * 6,
          hyw + (Math.random() - 0.5) * 6,
          0,
          0,
          1.6,
          11 + Math.random() * 4,
          PT_SAUCE,
        );
      }
      if (input.boost) {
        for (let k = 0; k < 2; k++) {
          const sp = 90 + Math.random() * 60;
          spawn(hxw, hyw, -Math.cos(headRad) * sp, -Math.sin(headRad) * sp, 0.22, 2, PT_SPEED);
        }
      }
      if (sauceTick % 22 === 0 && !reduceEffects) {
        spawn(
          hxw + (Math.random() - 0.5) * 200,
          hyw + 60 + Math.random() * 80,
          (Math.random() - 0.5) * 8,
          -14,
          2.2,
          7 + Math.random() * 6,
          PT_VAPOR,
        );
      }
    }
    if (eatBurstPending > 0) {
      for (let k = 0; k < 15; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 50 + Math.random() * 120;
        spawn(hxw, hyw, Math.cos(a) * sp, Math.sin(a) * sp, 0.32 + Math.random() * 0.1, 2 + Math.random() * 2.5, PT_BURST);
      }
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * Math.PI * 2;
        spawn(hxw, hyw, Math.cos(a) * 120, Math.sin(a) * 120, 0.2, 2, PT_FLASH);
      }
      eatBurstPending = 0;
    }
    if (sparkPending > 0) {
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 150 + Math.random() * 240;
        spawn(hxw, hyw, Math.cos(a) * sp, Math.sin(a) * sp, 0.3, 2 + Math.random() * 1.5, PT_SPARK);
      }
      sparkPending = 0;
    }
    if (deathBurstPending > 0) {
      for (let k = 0; k < 28; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 200;
        spawn(hxw, hyw, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.3, 2 + Math.random() * 3, PT_BURST);
      }
      deathBurstPending = 0;
    }

    updateCamera();

    // draft layout (shared with input hit-testing)
    let draftCards: Rect[] = [];
    let rerollRect: Rect | null = null;
    if (world.phase === PHASE.DRAFT) {
      const layout = draftLayout(cssW, cssH, world.offerCount, world.rerollLeft > 0, insets);
      draftCards = layout.cards;
      rerollRect = layout.reroll;
      controller.setDraft(true, draftCards, rerollRect);
    } else {
      controller.setDraft(false, [], null);
    }

    // age + retire floating popups (dt-normalized units of ~60fps frames)
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].age += dt / 16.6667;
      if (pops[i].age > 46) pops.splice(i, 1);
    }
    parts.count = pCount;

    // draw (CSS-pixel space; DPR handled by transform)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fs: FrameState = {
      world,
      prevBodyX,
      prevBodyY,
      prevBodyCount,
      alpha,
      cam,
      heat01,
      enredoFlash: reduceEffects ? 0 : enredoFlash,
      reduceEffects,
      insets,
      draftCards,
      rerollRect,
      steer: world.phase === PHASE.PLAY ? controller.getSteer() : null,
      boosting: input.boost,
      pops,
      parts,
      mouthOpen,
      headStretch,
      flashHead: reduceEffects ? 0 : flashHead,
      gaze,
      abilityPulse,
      picked: cardsPicked,
    };
    renderFrame(ctx, { w: cssW, h: cssH }, fs);

    if ((hudFrame++ & 3) === 0) emitHud();
  };
  raf = requestAnimationFrame(frame);

  // ----- lifecycle -----
  const onVisibility = (): void => {
    if (document.hidden) pause();
    else resume();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const pause = (): void => {
    if (paused) return;
    paused = true;
    releaseWake();
  };
  const resume = (): void => {
    if (!paused) return;
    paused = false;
    last = performance.now();
    acc = 0;
    requestWake();
  };

  const destroy = (): void => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("pointerdown", unlock);
    controller.destroy();
    audio.destroy();
    releaseWake();
  };

  return { destroy, pause, resume };
}
