/**
 * world.ts — World allocation + initial state for EL ENREDO /sim (skeleton).
 *
 * Owns the ONLY place the World object and its typed-array pools are allocated.
 * `initModifiers()` returns the neutral card-effect struct; `createWorld(seed, mode)`
 * allocates every pool once, lays the starting body, and draws service 1's length from
 * the seeded RNG (the first RNG consumers). It deliberately leaves entity population
 * (toppings / pedido / obstacles for service 1) to step.ts's service-init phase so that
 * the RNG draw order is defined entirely by step(). index.ts re-exports createWorld.
 *
 * No Math.random, no wall-clock, no floats.
 */

import { nextInt } from "./rng.ts";
import {
  ALMIDON_MAX,
  BASE_SPEED,
  CRUMB_CAP,
  GLOBAL_MULT_START,
  MAX_NODES,
  MAX_OBS,
  MAX_OFFERS,
  MAX_PAPA,
  MAX_SMOKE,
  MAX_TOP,
  MAX_ZONE,
  SERVICE_JITTER_TICKS,
  serviceLenBase,
  SPACING,
  START_NODES,
  WORLD_HALF,
} from "./constants.ts";
import { FORK_STATE, PHASE, TOPPING } from "./types.ts";
import type { ModeName, Modifiers, World } from "./types.ts";

const ONE = 65536; // Q16.16 1.0 (local literal; avoids importing for a single default)

/** Neutral modifier struct: multipliers = 1.0, flags off, enredoCutsTail on, loopCap 10. */
export function initModifiers(): Modifiers {
  return {
    turnRateMul: ONE,
    baseSpeedMul: ONE,
    hitboxRadiusMul: ONE,
    speedTugMag: 0,
    infiniteBoost: false,
    cannotBrake: false,
    toppingScoreMul: ONE,
    globalScoreMul: ONE,
    loopCap: 10,
    minLoopAreaMul: ONE,
    hasLazoAvido: false,
    hasCorteLimpio: false,
    enredoCutsTail: true,
    enredoBurnsOil: false,
    enredoDestroysObstacles: false,
    enredoTailCostMul: ONE,
    toppingLifeMul: ONE,
    toppingExplodeEvery: 0,
    pineappleEnabled: false,
    pineappleValueMul: ONE,
    smokeTrailEnabled: false,
    forkSmokeSlowMul: ONE,
    papaLifeMul: ONE,
    cosechaGainMul: ONE,
    papaOnlyInDanger: false,
    oilGrowthMul: ONE,
  };
}

/**
 * Allocate and initialise a fresh World for a run.
 * @param seed 32-bit run seed (RETO DIARIO passes a fixed daily seed).
 * @param mode "RUN" | "RUSH" | "RETO".
 */
export function createWorld(seed: number, mode: ModeName): World {
  const s = seed >>> 0;
  const w: World = {
    mode,
    phase: PHASE.PLAY,
    seed0: s,
    tick: 0,
    service: 1,
    serviceTick: 0,
    serviceLen: 0,

    rng: s,

    globalSpeedStep: 0,
    usableHalf: WORLD_HALF,

    bodyX: new Int32Array(MAX_NODES),
    bodyY: new Int32Array(MAX_NODES),
    bodyCount: 0,
    heading: 0,
    prevHeadX: 0,
    prevHeadY: 0,
    growPending: 0,
    almidon: ALMIDON_MAX,

    crumbX: new Int32Array(CRUMB_CAP),
    crumbY: new Int32Array(CRUMB_CAP),
    crumbLen: new Int32Array(CRUMB_CAP),
    crumbHead: 0,
    crumbCount: 0,

    topX: new Int32Array(MAX_TOP),
    topY: new Int32Array(MAX_TOP),
    topKind: new Int8Array(MAX_TOP),
    topFlags: new Int8Array(MAX_TOP),
    topExpire: new Int32Array(MAX_TOP),
    topCount: 0,

    papaX: new Int32Array(MAX_PAPA),
    papaY: new Int32Array(MAX_PAPA),
    papaKind: new Int8Array(MAX_PAPA),
    papaSeq: new Int8Array(MAX_PAPA),
    papaExpire: new Int32Array(MAX_PAPA),
    papaCount: 0,
    francesaNext: 0,

    obsType: new Int8Array(MAX_OBS),
    obsX: new Int32Array(MAX_OBS),
    obsY: new Int32Array(MAX_OBS),
    obsRadius: new Int32Array(MAX_OBS),
    obsPhase: new Int32Array(MAX_OBS),
    obsFlags: new Int8Array(MAX_OBS),
    obsCount: 0,

    burnX: new Int32Array(MAX_ZONE),
    burnY: new Int32Array(MAX_ZONE),
    burnR: new Int32Array(MAX_ZONE),
    burnExpire: new Int32Array(MAX_ZONE),
    burnCount: 0,
    smokeX: new Int32Array(MAX_SMOKE),
    smokeY: new Int32Array(MAX_SMOKE),
    smokeExpire: new Int32Array(MAX_SMOKE),
    smokeCount: 0,

    fork: { active: 0, x: 0, y: 0, heading: 0, state: FORK_STATE.ENTER, blocked: 0 },
    pedido: {
      active: 0,
      base: TOPPING.SALSA,
      seq: [0, 0, 0],
      progress: 0,
      expire: 0,
      cooldownUntil: 0,
    },

    score: 0,
    globalMult: GLOBAL_MULT_START,
    cosecha: 0,
    toppingsEaten: 0,

    mods: initModifiers(),

    offerIds: new Int8Array(MAX_OFFERS),
    offerCount: 0,
    rerollLeft: 0,
    rerollUsed: 0,

    victory: 0,
  };

  // Start facing UP (heading 49152 brads = -y screen up), so the snake never spawns as the
  // flat horizontal bar that read as "not moving like a snake". Head at origin; body + trail
  // laid straight DOWN (+y, behind the head). It curves the instant the player steers.
  w.heading = 49152;
  w.bodyCount = START_NODES;
  for (let i = 0; i < START_NODES; i++) {
    w.bodyX[i] = 0;
    w.bodyY[i] = i * SPACING; // trailing down, behind the head
  }
  w.prevHeadX = w.bodyX[0];
  w.prevHeadY = w.bodyY[0];

  // Pre-fill the breadcrumb trail straight down so trail sampling has history from tick 0.
  const P = Math.min(CRUMB_CAP, 60); // covers >(START_NODES+3)*SPACING at BASE_SPEED
  for (let k = 0; k < P; k++) {
    w.crumbX[k] = 0;
    w.crumbY[k] = (P - 1 - k) * BASE_SPEED; // k=P-1 is the head (y=0); older crumbs are further down
    w.crumbLen[k] = BASE_SPEED;
  }
  w.crumbHead = P - 1;
  w.crumbCount = P;

  // First RNG consumers: draw this service's length (short early → the first card comes fast).
  w.serviceLen = serviceLenBase(w.service) + nextInt(w, SERVICE_JITTER_TICKS + 1);

  // NOTE (skeleton): initial toppings / pedido / obstacles for service 1 are populated
  // by step.ts service-init on the first PLAY ticks so RNG draw order stays owned by step().
  return w;
}
