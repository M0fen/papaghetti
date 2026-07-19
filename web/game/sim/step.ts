/**
 * step.ts — the pure, in-place, deterministic tick for EL ENREDO /sim.
 *
 * This is the integrative core: it wires the foundation (fixed/rng/constants/types/world)
 * and the modules (enredo geometry, card draft/apply) into one `step(world, input)` that
 * is a PURE function of (world, input): same inputs => bit-identical result on any machine.
 * Mutation happens in place on the World for zero per-tick heap churn, but the semantics
 * are pure — the world is the entire snapshot and (seed0 + inputLog) fully determines a run.
 *
 * The tick executes a FROZEN phase order P0..P12 (replay depends on it). Nothing here reads
 * wall-clock or Math.random; all trig is LUT lookups baked in fixed.ts; all gameplay math is
 * integer / Q16.16. The only RNG is the World's own mulberry32 stream via nextInt(w, n); the
 * number and order of draws per tick is a pure function of World. Draft offers use a separate
 * stream inside cards.ts and never perturb the gameplay draw count.
 */

import {
  FP_MASK,
  FP_ONE,
  fmul,
  fdiv,
  fclamp,
  fmax,
  fmin,
  flerp,
  toFixed,
  fromFixedToInt,
  sinFixed,
  cosFixed,
  atan2Fixed,
  angDiff,
  dist2,
  radiusSq,
} from "./fixed.ts";
import { nextInt } from "./rng.ts";
import {
  ALMIDON_DRAIN,
  ALMIDON_GAIN,
  ALMIDON_MAX,
  BANISH_COST,
  BASE_SPEED,
  BOOST_MULT,
  LOCK_COST,
  BURN_LIFE_TICKS,
  CRUMB_CAP,
  START_NODES,
  TURN_NMAX,
  TURN_FLOOR,
  TURN_SPAN,
  COSECHA_FRANCESA_MULT,
  COSECHA_MAX,
  COSECHA_UNIT,
  EAT_RADIUS,
  FORK_CAPTURE_RADIUS,
  FORK_ENTER_MARGIN,
  FORK_SERVICE_MODULO,
  FORK_SPEED,
  FORK_TURN_RATE,
  FRANCESA_LINE_LEN,
  GROW_PER_TOP,
  MAX_NODES,
  MAX_OBS,
  MAX_PAPA,
  MAX_SMOKE,
  MAX_TOP,
  MAX_ZONE,
  MULT_DECAY,
  MULT_MIN,
  MULT_STEP,
  OIL_GROW,
  OIL_MAX_RADIUS,
  OIL_SERVICE,
  OIL_START_RADIUS,
  PAPA_CRIOLLA_SERVICE,
  PAPA_DANGER_SERVICE,
  PAPA_FRANCESA_SERVICE,
  PAPA_LIFE_TICKS,
  PEDIDO_BONUS,
  PEDIDO_COOLDOWN_TICKS,
  PEDIDO_FIRST_SERVICE,
  PEDIDO_SEQ_LEN,
  PEDIDO_TICKS,
  PINA_ALMIDON_BONUS,
  RAMP_INTERVAL_TICKS,
  RAMP_SPEED_STEP,
  WORLD_HALF,
  WORLD_MAX_HALF,
  WORLD_GROW_PER_NODE,
  RUSH_TICKS,
  SAUCE_SERVICE,
  SAUCE_TURN_FACTOR,
  SERVICE_COUNT,
  SERVICE_JITTER_TICKS,
  serviceLenBase,
  SMOKE_LIFE_TICKS,
  SPACING,
  SPAWN_MAX_TRIES,
  TOPPING_LIFE_TICKS,
  TOP_BASE,
  TOP_TARGET_PER_SERVICE,
  CLUSTER_MIN,
  CLUSTER_MAX,
  CLUSTER_RADIUS,
  CLUSTER_MIN_DIST_HEAD,
  TOP_MIN_SEP,
  TOP_PLACE_TRIES,
  TURN_RATE,
  WALL_SERVICE,
  KNIFE_SERVICE,
  WHISK_SERVICE,
} from "./constants.ts";
import { MODE, PHASE, FORK_STATE, OBS, OBS_FLAG, TOPPING, TOP_FLAG, PAPA } from "./types.ts";
import type { Input, World } from "./types.ts";
import { runEnredo } from "./enredo.ts";
import { pickCard, generateOffer } from "./cards.ts";

export { createWorld } from "./world.ts";

// ---------------------------------------------------------------------------
// Local tunables (integers / Q16.16). These describe entity sizing and cadences
// that live only in step()'s spawning/effects and are not shared with other modules;
// balance-tuning them never touches phase logic. No float ever enters these.
// ---------------------------------------------------------------------------
const WALL_RADIUS = 30 * FP_ONE; // POS
const KNIFE_RADIUS = 26 * FP_ONE; // POS
const SAUCE_RADIUS = 55 * FP_ONE; // POS
const WHISK_RADIUS = 42 * FP_ONE; // POS
const SPAWN_MARGIN = 24; // int world-units kept clear of the border on spawn
const SAFE_SPAWN_DIST = 130 * FP_ONE; // POS min distance new hazards/papa keep from the head
const CHICHARRON_BONUS = 500; // int score bonus on a chicharrón explosion
const EXPLODE_RADIUS = 70 * FP_ONE; // POS oil-clearing radius of a chicharrón explosion
const SMOKE_RADIUS = 34 * FP_ONE; // POS radius a smoke node slows the fork within
const SMOKE_EVERY = 6; // ticks between smoke drops when smokeTrail is on
const PAPA_CRIOLLA_EVERY = 200; // ticks between criolla spawns
const FRANCESA_EVERY = 420; // ticks between francesa line spawns
const FRANCESA_SPACING = 34 * FP_ONE; // POS gap between francesa sticks
const SWEEP_RATE = 512; // brads/tick knife/whisk phase advance (view rhythm)
const OIL_SPAWN_COUNT = 3;
const WALL_SPAWN_COUNT = 2;
const KNIFE_SPAWN_COUNT = 2;
const SAUCE_SPAWN_COUNT = 2;
const WHISK_SPAWN_COUNT = 1;

// Module-level scratch reused every tick — never allocated on a hot path.
const _pos = { x: 0, y: 0 };

// ===========================================================================
// Small pure pool helpers (swap-remove keeps the active prefix dense).
// ===========================================================================

function swapRemoveTop(w: World, i: number): void {
  const n = w.topCount - 1;
  w.topX[i] = w.topX[n];
  w.topY[i] = w.topY[n];
  w.topKind[i] = w.topKind[n];
  w.topFlags[i] = w.topFlags[n];
  w.topExpire[i] = w.topExpire[n];
  w.topCount = n;
}

function swapRemovePapa(w: World, i: number): void {
  const n = w.papaCount - 1;
  w.papaX[i] = w.papaX[n];
  w.papaY[i] = w.papaY[n];
  w.papaKind[i] = w.papaKind[n];
  w.papaSeq[i] = w.papaSeq[n];
  w.papaExpire[i] = w.papaExpire[n];
  w.papaCount = n;
}

function swapRemoveBurn(w: World, i: number): void {
  const n = w.burnCount - 1;
  w.burnX[i] = w.burnX[n];
  w.burnY[i] = w.burnY[n];
  w.burnR[i] = w.burnR[n];
  w.burnExpire[i] = w.burnExpire[n];
  w.burnCount = n;
}

function swapRemoveSmoke(w: World, i: number): void {
  const n = w.smokeCount - 1;
  w.smokeX[i] = w.smokeX[n];
  w.smokeY[i] = w.smokeY[n];
  w.smokeExpire[i] = w.smokeExpire[n];
  w.smokeCount = n;
}

// ===========================================================================
// Deterministic spawn placement. Uses ONLY the gameplay RNG; draw order is fixed.
// ===========================================================================

/** Uniform integer POS position inside the usable playfield (minus a border margin). */
function randPos(w: World): void {
  let halfU = fromFixedToInt(w.usableHalf) - SPAWN_MARGIN;
  if (halfU < 1) halfU = 1;
  const span = halfU * 2;
  const xi = nextInt(w, span + 1) - halfU;
  const yi = nextInt(w, span + 1) - halfU;
  _pos.x = toFixed(xi);
  _pos.y = toFixed(yi);
}

/** Uniform POS position that stays at least SAFE_SPAWN_DIST from the head (bounded tries). */
function randPosFarFromHead(w: World): void {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];
  const need = radiusSq(SAFE_SPAWN_DIST);
  for (let t = 0; t < SPAWN_MAX_TRIES; t++) {
    randPos(w);
    if (dist2(_pos.x, _pos.y, hx, hy) >= need) return;
  }
  // Fall through with the last sample (bounded — determinism over perfect placement).
}

/** True if a POS point lies inside an active OIL or WALL obstacle (no food inside hazards). */
function posInHazard(w: World, x: number, y: number): boolean {
  for (let i = 0; i < w.obsCount; i++) {
    if ((w.obsFlags[i] & OBS_FLAG.ACTIVE) === 0) continue;
    const ty = w.obsType[i];
    if (ty !== OBS.OIL && ty !== OBS.WALL) continue;
    if (dist2(x, y, w.obsX[i], w.obsY[i]) < radiusSq(w.obsRadius[i])) return true;
  }
  return false;
}

/**
 * Pick a cluster CENTRE into _pos: uniform in the playfield, >= CLUSTER_MIN_DIST_HEAD from the
 * head, clear of oil/walls, and FAR ENOUGH from the border that the WHOLE cluster fits inside
 * (so no topping ever needs clamping onto the border — the ugly straight-line artefact). Bounded.
 */
function clusterCenter(w: World): void {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];
  const needHead = radiusSq(CLUSTER_MIN_DIST_HEAD);
  // Keep the centre this far (POS) from the border so centre ± CLUSTER_RADIUS stays inside.
  const fit = w.usableHalf - CLUSTER_RADIUS - toFixed(SPAWN_MARGIN);
  const fitU = fit > FP_ONE ? fromFixedToInt(fit) : 1;
  for (let t = 0; t < SPAWN_MAX_TRIES; t++) {
    randPos(w);
    // Re-sample inside the fit box (randPos already used the border margin; tighten to fit box).
    if (fromFixedToInt(_pos.x) > fitU || fromFixedToInt(_pos.x) < -fitU) continue;
    if (fromFixedToInt(_pos.y) > fitU || fromFixedToInt(_pos.y) < -fitU) continue;
    if (dist2(_pos.x, _pos.y, hx, hy) < needHead) continue;
    if (posInHazard(w, _pos.x, _pos.y)) continue;
    return;
  }
  // Bounded fall-through with the last sample.
}

function pushObstacle(
  w: World,
  type: number,
  x: number,
  y: number,
  radius: number,
  lethal: boolean,
): void {
  if (w.obsCount >= MAX_OBS) return;
  const i = w.obsCount;
  w.obsType[i] = type;
  w.obsX[i] = x;
  w.obsY[i] = y;
  w.obsRadius[i] = radius;
  w.obsPhase[i] = nextInt(w, 65536); // rhythm seed for knife/whisk (view)
  w.obsFlags[i] = lethal ? OBS_FLAG.ACTIVE | OBS_FLAG.LETHAL : OBS_FLAG.ACTIVE;
  w.obsCount = i + 1;
}

function spawnObstacleSet(w: World, type: number, count: number, radius: number, lethal: boolean): void {
  for (let k = 0; k < count; k++) {
    randPosFarFromHead(w);
    pushObstacle(w, type, _pos.x, _pos.y, radius, lethal);
  }
}

// ===========================================================================
// Pedido (order) progression — mirror of enredo.ts's private advance, so a topping
// eaten by a normal collect and one consumed by the loop advance the order identically.
// ===========================================================================

function advancePedido(w: World, kind: number): void {
  const p = w.pedido;
  if (p.active === 0) return;
  if (kind === p.seq[p.progress]) {
    p.progress++;
    if (p.progress >= PEDIDO_SEQ_LEN) {
      w.score += PEDIDO_BONUS;
      w.globalMult += MULT_STEP;
      p.active = 0;
      p.progress = 0;
      p.cooldownUntil = w.tick + PEDIDO_COOLDOWN_TICKS;
    }
  }
}

// ===========================================================================
// Per-service initialisation (runs once, on the first PLAY tick of a service when
// serviceTick === 0). Owns the deterministic obstacle + fork placement so the RNG
// draw order for a service is fully defined by step().
// ===========================================================================

function initService(w: World): void {
  // Fresh hazard/effect state each service (obstacles are per-service; spec).
  w.obsCount = 0;
  w.burnCount = 0;
  w.smokeCount = 0;
  w.papaCount = 0;
  w.francesaNext = 0;

  const s = w.service;
  // Olla a Presión: extra grease puddles per service.
  if (s >= OIL_SERVICE) {
    spawnObstacleSet(w, OBS.OIL, OIL_SPAWN_COUNT + w.mods.oilExtraCount, OIL_START_RADIUS, true);
  }
  if (s >= WALL_SERVICE) spawnObstacleSet(w, OBS.WALL, WALL_SPAWN_COUNT, WALL_RADIUS, false);
  if (s >= KNIFE_SERVICE) spawnObstacleSet(w, OBS.KNIFE, KNIFE_SPAWN_COUNT, KNIFE_RADIUS, false);
  if (s >= SAUCE_SERVICE) spawnObstacleSet(w, OBS.SAUCE, SAUCE_SPAWN_COUNT, SAUCE_RADIUS, false);
  if (s >= WHISK_SERVICE) spawnObstacleSet(w, OBS.WHISK, WHISK_SPAWN_COUNT, WHISK_RADIUS, false);

  // Fork boss appears on every FORK_SERVICE_MODULO-th service and on the final service.
  // Duelo (pacto): the boss hunts EVERY service.
  if (w.mods.forkAlways || s % FORK_SERVICE_MODULO === 0 || s === SERVICE_COUNT) {
    const f = w.fork;
    f.active = 1;
    f.state = FORK_STATE.ENTER;
    f.blocked = 0;
    // Enter from a deterministic edge; head toward centre.
    const edge = nextInt(w, 4);
    const half = w.usableHalf;
    if (edge === 0) {
      f.x = -half;
      f.y = 0;
      f.heading = 0;
    } else if (edge === 1) {
      f.x = half;
      f.y = 0;
      f.heading = 32768;
    } else if (edge === 2) {
      f.x = 0;
      f.y = -half;
      f.heading = 16384;
    } else {
      f.x = 0;
      f.y = half;
      f.heading = 49152;
    }
  } else {
    w.fork.active = 0;
  }
}

// ===========================================================================
// Zone tests (broad iteration over small pools; step bypasses the spatial hash here).
// ===========================================================================

function headInSauce(w: World): boolean {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];
  for (let i = 0; i < w.obsCount; i++) {
    if ((w.obsFlags[i] & OBS_FLAG.ACTIVE) === 0) continue;
    if (w.obsType[i] !== OBS.SAUCE) continue;
    if (dist2(hx, hy, w.obsX[i], w.obsY[i]) < radiusSq(w.obsRadius[i])) return true;
  }
  return false;
}

function forkInSmoke(w: World): boolean {
  const fx = w.fork.x;
  const fy = w.fork.y;
  const need = radiusSq(SMOKE_RADIUS);
  for (let i = 0; i < w.smokeCount; i++) {
    if (dist2(fx, fy, w.smokeX[i], w.smokeY[i]) < need) return true;
  }
  return false;
}

// ===========================================================================
// Service / run advancement (draft pick and RUSH fast-forward both land here).
// ===========================================================================

function advanceService(w: World): void {
  w.service++;
  w.serviceTick = 0;
  w.serviceLen = serviceLenBase(w.service) + nextInt(w, SERVICE_JITTER_TICKS + 1);
  w.phase = PHASE.PLAY;
}

// ===========================================================================
// THE TICK
// ===========================================================================

export function step(w: World, input: Input): void {
  // ---- P0 Phase gate / draft resolution -----------------------------------
  if (w.phase === PHASE.DEAD) {
    w.tick++;
    return;
  }
  if (w.phase === PHASE.DRAFT) {
    // Draft economy (F1) — ONE action per tick, priority: banish > reroll > lock > pick.
    // banish/lock SPEND the cosecha meter (which also sets the next draft's tier: real tradeoff).
    if (
      input.banishPick >= 0 &&
      input.banishPick < w.offerCount &&
      w.cosecha >= BANISH_COST
    ) {
      w.cosecha -= BANISH_COST;
      w.banished[w.offerIds[input.banishPick]] = 1;
      w.rerollUsed++; // folds into the draft seed → fresh deterministic offer
      generateOffer(w);
    } else if (input.reroll > 0 && w.rerollLeft > 0) {
      w.rerollUsed++;
      w.rerollLeft--;
      generateOffer(w);
    } else if (
      input.lockPick >= 0 &&
      input.lockPick < w.offerCount &&
      w.lockedCard < 0 &&
      w.cosecha >= LOCK_COST
    ) {
      w.cosecha -= LOCK_COST;
      w.lockedCard = w.offerIds[input.lockPick]; // guaranteed in slot 0 of the NEXT draft
    } else if (input.cardPick >= 0 && input.cardPick < w.offerCount) {
      pickCard(w, input.cardPick);
      advanceService(w);
    }
    w.tick++;
    return;
  }

  // ---- PLAY: service init (once per service, before the clock advances) ----
  if (w.serviceTick === 0) initService(w);

  // ---- P1 Time & difficulty ----------------------------------------------
  w.serviceTick++;
  if (w.serviceTick % RAMP_INTERVAL_TICKS === 0) w.globalSpeedStep += RAMP_SPEED_STEP;
  // World EXPANDS with the snake (grow-only). Never let it retract past the head (enredo cut safety).
  {
    let target = WORLD_HALF + w.bodyCount * WORLD_GROW_PER_NODE;
    if (target > WORLD_MAX_HALF) target = WORLD_MAX_HALF;
    if (target > w.usableHalf) w.usableHalf = target;
  }

  // Expire toppings / papa / burn / smoke (swap-remove).
  {
    let i = 0;
    while (i < w.topCount) {
      if (w.tick >= w.topExpire[i]) swapRemoveTop(w, i);
      else i++;
    }
    i = 0;
    while (i < w.papaCount) {
      if (w.tick >= w.papaExpire[i]) swapRemovePapa(w, i);
      else i++;
    }
    i = 0;
    while (i < w.burnCount) {
      if (w.tick >= w.burnExpire[i]) swapRemoveBurn(w, i);
      else i++;
    }
    i = 0;
    while (i < w.smokeCount) {
      if (w.tick >= w.smokeExpire[i]) swapRemoveSmoke(w, i);
      else i++;
    }
  }

  // Sofrito's price: the global multiplier DECAYS — chain enredos or lose the snowball.
  if (w.mods.multDecayPerTick > 0) {
    w.globalMult = fmax(MULT_MIN, w.globalMult - w.mods.multDecayPerTick);
  }

  // Pedido deadline: miss -> lose a multiplier step (never death), set cooldown.
  if (w.pedido.active !== 0 && w.tick >= w.pedido.expire) {
    w.globalMult = fmax(MULT_MIN, w.globalMult - MULT_DECAY);
    w.pedido.active = 0;
    w.pedido.progress = 0;
    w.pedido.cooldownUntil = w.tick + PEDIDO_COOLDOWN_TICKS;
  }

  // Oil grows (contracts play), knife/whisk phase advances (view rhythm).
  for (let i = 0; i < w.obsCount; i++) {
    if ((w.obsFlags[i] & OBS_FLAG.ACTIVE) === 0) continue;
    const t = w.obsType[i];
    if (t === OBS.OIL) {
      w.obsRadius[i] = fmin(OIL_MAX_RADIUS, w.obsRadius[i] + fmul(OIL_GROW, w.mods.oilGrowthMul));
    } else if (t === OBS.KNIFE || t === OBS.WHISK) {
      w.obsPhase[i] = (w.obsPhase[i] + SWEEP_RATE) & FP_MASK;
    }
  }

  // ---- P2 Steering (limited turn radius) ---------------------------------
  // Size-scaled turn cap: t = ((TURN_NMAX - len)/(TURN_NMAX - START_NODES))^2, clamped 0..1.
  let tnum = TURN_NMAX - w.bodyCount;
  if (tnum < 0) tnum = 0;
  let t = Math.floor((tnum * FP_ONE) / (TURN_NMAX - START_NODES)); // Q16.16
  if (t > FP_ONE) t = FP_ONE;
  const sizeF = TURN_FLOOR + fmul(TURN_SPAN, fmul(t, t)); // 0.30 (big) .. 1.0 (young)
  let turnRate = fmul(fmul(TURN_RATE, sizeF), w.mods.turnRateMul);
  if (headInSauce(w)) turnRate = fmul(turnRate, SAUCE_TURN_FACTOR);
  const dAng = angDiff(input.angle, w.heading);
  w.heading = (w.heading + fclamp(dAng, -turnRate, turnRate)) & FP_MASK;

  // ---- P3 Speed / boost / almidón / tug ----------------------------------
  const baseSpeed = fmul(BASE_SPEED, w.mods.baseSpeedMul) + w.globalSpeedStep;
  let speed = baseSpeed;
  const wantBoost = input.boost || w.mods.infiniteBoost;
  const hasFuel = w.almidon > 0 || w.mods.infiniteBoost;
  if (wantBoost && hasFuel) {
    speed = fmul(speed, BOOST_MULT);
    if (!w.mods.infiniteBoost) {
      w.almidon = fmax(0, w.almidon - fmul(ALMIDON_DRAIN, w.mods.boostDrainMul));
    }
    // Bechamel / Flambé Perpetuo: boosting IS a scoring engine.
    if (w.mods.boostScorePerTick > 0) w.score += w.mods.boostScorePerTick;
  }
  if (w.mods.cannotBrake && speed < baseSpeed) speed = baseSpeed;

  // ---- P4 Head integration -----------------------------------------------
  w.prevHeadX = w.bodyX[0];
  w.prevHeadY = w.bodyY[0];
  w.bodyX[0] += fmul(cosFixed(w.heading), speed);
  w.bodyY[0] += fmul(sinFixed(w.heading), speed);
  if (w.mods.speedTugMag > 0) {
    // Deterministic lateral nudge from a tick-derived phase (Piña Ácida). w.tick & 31
    // is bit-safe; (31 << 11) < 65536 so the phase stays a valid brad.
    const tugPhase = ((w.tick & 31) << 11) & FP_MASK;
    const tugMag = fmul(w.mods.speedTugMag, sinFixed(tugPhase));
    const perp = (w.heading + 16384) & FP_MASK;
    w.bodyX[0] += fmul(cosFixed(perp), tugMag);
    w.bodyY[0] += fmul(sinFixed(perp), tugMag);
  }

  // ---- P5 Body: breadcrumb TRAIL SAMPLING + growth -----------------------
  // Record one crumb per tick at the (already-moved) head; the segment ending here is
  // exactly this tick's travel `speed` (no sqrt). Then place every body node at arc-length
  // i*SPACING back ALONG THE HEAD'S OWN PATH — the slither-style trail that reads as a real
  // snake and never corner-cuts / rubber-bands like the old follow-the-leader chain did.
  const ch = (w.crumbHead + 1) % CRUMB_CAP;
  w.crumbHead = ch;
  w.crumbX[ch] = w.bodyX[0];
  w.crumbY[ch] = w.bodyY[0];
  w.crumbLen[ch] = speed; // per-tick head travel (perpendicular tug is a negligible nudge)
  if (w.crumbCount < CRUMB_CAP) w.crumbCount++;

  // Grow first so a newly owed node gets a real trail position this same tick.
  while (w.growPending > 0 && w.bodyCount < MAX_NODES) {
    w.bodyCount++;
    w.growPending--;
  }

  // Single backward pass over the crumbs: emit a node each time cumulative arc-length
  // crosses the next i*SPACING. O(bodyCount) — no per-node re-walk.
  {
    let j = w.crumbHead;
    let acc = 0;
    let nextArc = SPACING;
    let ni = 1;
    let steps = w.crumbCount - 1;
    while (ni < w.bodyCount && steps > 0) {
      const seg = w.crumbLen[j];
      const k = (j - 1 + CRUMB_CAP) % CRUMB_CAP; // previous (older) crumb
      while (ni < w.bodyCount && acc + seg >= nextArc) {
        const frac = seg > 0 ? fdiv(nextArc - acc, seg) : 0; // Q16.16 in [0,1]
        w.bodyX[ni] = flerp(w.crumbX[j], w.crumbX[k], frac);
        w.bodyY[ni] = flerp(w.crumbY[j], w.crumbY[k], frac);
        ni++;
        nextArc += SPACING;
      }
      acc += seg;
      j = k;
      steps--;
    }
    // Trail shorter than the body (spawn / very long snake): pin the rest to the oldest crumb.
    while (ni < w.bodyCount) {
      w.bodyX[ni] = w.crumbX[j];
      w.bodyY[ni] = w.crumbY[j];
      ni++;
    }
  }

  // ---- P6 Enredo (loop) resolution ---------------------------------------
  runEnredo(w);

  // ---- P7 Pickups & pedido (skip toppings already consumed by P6) ---------
  {
    const hx = w.bodyX[0];
    const hy = w.bodyY[0];
    const eatR2 = radiusSq(fmul(EAT_RADIUS, w.mods.hitboxRadiusMul));

    // Toppings: compact away enredo-consumed (ALIVE cleared) and freshly eaten.
    let i = 0;
    while (i < w.topCount) {
      if ((w.topFlags[i] & TOP_FLAG.ALIVE) === 0) {
        swapRemoveTop(w, i);
        continue;
      }
      if (dist2(hx, hy, w.topX[i], w.topY[i]) < eatR2) {
        const kind = w.topKind[i];
        const tx = w.topX[i];
        const ty = w.topY[i];
        // Score: base * toppingScore * (pineapple) * (length build) * globalMult * globalScore.
        let val = toFixed(TOP_BASE);
        val = fmul(val, w.mods.toppingScoreMul);
        if (kind === TOPPING.PINA && w.mods.pineappleEnabled) {
          val = fmul(val, w.mods.pineappleValueMul);
          w.almidon = fmin(ALMIDON_MAX, w.almidon + PINA_ALMIDON_BONUS);
        }
        // EL FIDEO INFINITO (C5): length itself multiplies the plate (+5%/25 nodes, capped).
        if (w.mods.scorePerLenMul > 0) {
          let steps = (w.bodyCount / 25) | 0;
          if (steps > 20) steps = 20;
          val = fmul(val, FP_ONE + w.mods.scorePerLenMul * steps);
        }
        val = fmul(val, w.globalMult);
        val = fmul(val, w.mods.globalScoreMul);
        w.score += fromFixedToInt(val);

        // Hambre de Papa flips the fuel source: toppings stop giving almidón.
        if (w.mods.toppingsGiveAlmidon) {
          w.almidon = fmin(ALMIDON_MAX, w.almidon + ALMIDON_GAIN);
        }
        w.growPending += GROW_PER_TOP + w.mods.growPerTopBonus;
        w.toppingsEaten++;
        advancePedido(w, kind);

        // Hilo Dorado: every Nth topping drops a criolla WHERE IT DIED (no RNG — pure position).
        if (
          w.mods.papaOnEatEvery > 0 &&
          w.toppingsEaten % w.mods.papaOnEatEvery === 0 &&
          w.papaCount < MAX_PAPA
        ) {
          const pi = w.papaCount;
          w.papaX[pi] = tx;
          w.papaY[pi] = ty;
          w.papaKind[pi] = PAPA.CRIOLLA;
          w.papaSeq[pi] = -1;
          w.papaExpire[pi] = w.tick + fromFixedToInt(fmul(toFixed(PAPA_LIFE_TICKS), w.mods.papaLifeMul));
          w.papaCount = pi + 1;
        }

        // Chicharrón cadence: every Nth topping explodes — clears nearby oil + bonus.
        if (
          w.mods.toppingExplodeEvery > 0 &&
          w.toppingsEaten % w.mods.toppingExplodeEvery === 0
        ) {
          w.score += CHICHARRON_BONUS;
          const clearR2 = radiusSq(EXPLODE_RADIUS);
          for (let o = 0; o < w.obsCount; o++) {
            if ((w.obsFlags[o] & OBS_FLAG.ACTIVE) === 0) continue;
            if (w.obsType[o] !== OBS.OIL) continue;
            if (dist2(hx, hy, w.obsX[o], w.obsY[o]) < clearR2) {
              w.obsFlags[o] = w.obsFlags[o] & ~OBS_FLAG.ACTIVE;
            }
          }
          if (w.burnCount < MAX_ZONE) {
            const b = w.burnCount++;
            w.burnX[b] = hx;
            w.burnY[b] = hy;
            w.burnR[b] = EXPLODE_RADIUS;
            w.burnExpire[b] = w.tick + BURN_LIFE_TICKS;
          }
        }
        swapRemoveTop(w, i);
        continue;
      }
      i++;
    }

    // Papa: criolla fills cosecha; francesa collects a 4-stick line in sequence.
    i = 0;
    while (i < w.papaCount) {
      if (dist2(hx, hy, w.papaX[i], w.papaY[i]) < eatR2) {
        if (w.papaKind[i] === PAPA.CRIOLLA) {
          w.cosecha = fmin(COSECHA_MAX, w.cosecha + fmul(COSECHA_UNIT, w.mods.cosechaGainMul));
          // Hambre de Papa: la papa es el combustible del boost… y ORO (score × mult).
          if (w.mods.papaAlmidonGain > 0) {
            w.almidon = fmin(ALMIDON_MAX, w.almidon + w.mods.papaAlmidonGain);
          }
          if (w.mods.papaScoreBonus > 0) {
            w.score += fromFixedToInt(fmul(toFixed(w.mods.papaScoreBonus), w.globalMult));
          }
          swapRemovePapa(w, i);
          continue;
        }
        // FRANCESA — only the next-in-sequence stick is collectible.
        if (w.papaSeq[i] === w.francesaNext) {
          w.francesaNext++;
          if (w.francesaNext >= FRANCESA_LINE_LEN) {
            const gain = fmul(COSECHA_UNIT * COSECHA_FRANCESA_MULT, w.mods.cosechaGainMul);
            w.cosecha = fmin(COSECHA_MAX, w.cosecha + gain);
            w.francesaNext = 0;
          }
          swapRemovePapa(w, i);
          continue;
        }
      }
      i++;
    }

    // COCINA INFERNAL (C2): riding a burn zone scores per tick — the burn field IS the build.
    if (w.mods.burnScorePerTick > 0) {
      for (let b = 0; b < w.burnCount; b++) {
        if (dist2(hx, hy, w.burnX[b], w.burnY[b]) < radiusSq(w.burnR[b])) {
          w.score += w.mods.burnScorePerTick;
          break; // one zone per tick — overlapping zones don't multiply
        }
      }
    }
  }

  // ---- P8 Hazards & death (ONLY border / oil / fork) ---------------------
  {
    const hx = w.bodyX[0];
    const hy = w.bodyY[0];
    const half = w.usableHalf;
    if (hx < -half || hx > half || hy < -half || hy > half) {
      w.phase = PHASE.DEAD;
    } else {
      for (let i = 0; i < w.obsCount; i++) {
        if ((w.obsFlags[i] & OBS_FLAG.ACTIVE) === 0) continue;
        if (w.obsType[i] !== OBS.OIL) continue;
        if (dist2(hx, hy, w.obsX[i], w.obsY[i]) < radiusSq(w.obsRadius[i])) {
          w.phase = PHASE.DEAD;
          break;
        }
      }
      if (
        w.phase !== PHASE.DEAD &&
        w.fork.active !== 0 &&
        w.fork.state === FORK_STATE.CHASE &&
        dist2(hx, hy, w.fork.x, w.fork.y) < radiusSq(FORK_CAPTURE_RADIUS)
      ) {
        w.phase = PHASE.DEAD;
      }
    }
  }
  if (w.phase === PHASE.DEAD) {
    w.tick++;
    return;
  }

  // ---- P9 Spawning (RNG consumers; fixed draw order) ---------------------
  // 9a. Maintain the topping CLUSTERS. Grouped food is what makes the enredo (lasso) mechanic
  //     usable: a single loop can now enclose a whole cluster instead of ~0 uniform toppings.
  //     A depleted cluster is replaced by a fresh one elsewhere. All fixed-point, seeded RNG,
  //     bounded — the draw order stays a pure function of World, so determinism holds.
  {
    const lifeTicks = fromFixedToInt(fmul(toFixed(TOPPING_LIFE_TICKS), w.mods.toppingLifeMul));
    const rSpanU = fromFixedToInt(CLUSTER_RADIUS); // units; sample dx,dy in [-R, +R]
    const need2 = radiusSq(CLUSTER_RADIUS); // in-disc acceptance (uniform density, no clumping)
    const sepSq = radiusSq(TOP_MIN_SEP); // min separation between toppings (no overlap)
    let guard = 0;
    // Topping/cluster COUNT scales with the playfield AREA so DENSITY stays ~constant as the arena
    // expands (else the enredo starves in late-game with the same handful of clusters spread thin).
    // ratio = (usableHalf / WORLD_HALF)^2 in integer units; usableHalf ∈ [360,1000] u ⇒ target grows
    // from ~22 toward ~123, capped by the pool. Pure function of usableHalf ⇒ determinism holds.
    const halfU = fromFixedToInt(w.usableHalf);
    const baseU = fromFixedToInt(WORLD_HALF);
    const areaTarget = Math.floor((TOP_TARGET_PER_SERVICE * halfU * halfU) / (baseU * baseU));
    const target = Math.min(MAX_TOP - CLUSTER_MAX, areaTarget);
    // Only spawn a fresh cluster when there's room for a whole one (no per-topping trickle).
    // guard bounds the loop hard (each pass adds >= CLUSTER_MIN).
    while (w.topCount + CLUSTER_MIN <= target && w.topCount < MAX_TOP && guard < 6) {
      guard++;
      clusterCenter(w); // -> _pos: far from head, clear of oil/walls, WHOLE cluster fits inside
      const cx = _pos.x;
      const cy = _pos.y;
      const clusterStart = w.topCount; // min-sep is tested against this cluster's own toppings
      const size = CLUSTER_MIN + nextInt(w, CLUSTER_MAX - CLUSTER_MIN + 1);
      for (let m = 0; m < size && w.topCount < MAX_TOP; m++) {
        // Place ONE topping: uniform-in-disc via integer SQUARE REJECTION (no sqrt) + min-sep.
        let placed = false;
        let tx = cx;
        let ty = cy;
        for (let tr = 0; tr < TOP_PLACE_TRIES; tr++) {
          const dx = toFixed(nextInt(w, rSpanU * 2 + 1) - rSpanU);
          const dy = toFixed(nextInt(w, rSpanU * 2 + 1) - rSpanU);
          if (dist2(dx, dy, 0, 0) > need2) continue; // outside the disc -> reject
          tx = cx + dx;
          ty = cy + dy;
          let ok = true;
          for (let k = clusterStart; k < w.topCount; k++) {
            if (dist2(tx, ty, w.topX[k], w.topY[k]) < sepSq) {
              ok = false;
              break;
            }
          }
          if (ok) {
            placed = true;
            break;
          }
        }
        if (!placed) continue; // bounded tries exhausted -> this topping simply does not spawn
        const kind = nextInt(w, 8);
        const idx = w.topCount;
        w.topX[idx] = tx;
        w.topY[idx] = ty;
        w.topKind[idx] = kind;
        w.topFlags[idx] = kind === TOPPING.PINA ? TOP_FLAG.ALIVE | TOP_FLAG.PINA : TOP_FLAG.ALIVE;
        w.topExpire[idx] = w.tick + lifeTicks;
        w.topCount = idx + 1;
      }
    }
  }

  // 9b. Papa (service-gated). Criolla from s3; francesa line from s5. Rate scales with
  //     papaRateMul (Perejil / LA HUERTA): every = PAPA_CRIOLLA_EVERY / papaRateMul, floor 40.
  let papaEvery = PAPA_CRIOLLA_EVERY;
  if (w.mods.papaRateMul !== FP_ONE) {
    papaEvery = fromFixedToInt(fdiv(toFixed(PAPA_CRIOLLA_EVERY), w.mods.papaRateMul));
    if (papaEvery < 40) papaEvery = 40;
  }
  if (w.service >= PAPA_CRIOLLA_SERVICE && w.papaCount < MAX_PAPA && w.serviceTick % papaEvery === 0) {
    const life = fromFixedToInt(fmul(toFixed(PAPA_LIFE_TICKS), w.mods.papaLifeMul));
    const danger = w.mods.papaOnlyInDanger || w.service >= PAPA_DANGER_SERVICE;
    let px = 0;
    let py = 0;
    let placed = false;
    if (danger) {
      // Prefer a spot inside a hazard (first active oil puddle).
      for (let o = 0; o < w.obsCount; o++) {
        if ((w.obsFlags[o] & OBS_FLAG.ACTIVE) !== 0 && w.obsType[o] === OBS.OIL) {
          const rU = fromFixedToInt(w.obsRadius[o]);
          const off = rU > 1 ? rU : 1;
          px = w.obsX[o] + toFixed(nextInt(w, off * 2 + 1) - off);
          py = w.obsY[o] + toFixed(nextInt(w, off * 2 + 1) - off);
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      randPosFarFromHead(w);
      px = _pos.x;
      py = _pos.y;
    }
    const idx = w.papaCount;
    w.papaX[idx] = px;
    w.papaY[idx] = py;
    w.papaKind[idx] = PAPA.CRIOLLA;
    w.papaSeq[idx] = -1;
    w.papaExpire[idx] = w.tick + life;
    w.papaCount = idx + 1;
  }

  if (
    w.service >= PAPA_FRANCESA_SERVICE &&
    w.francesaNext === 0 &&
    w.serviceTick % FRANCESA_EVERY === 0 &&
    w.papaCount + FRANCESA_LINE_LEN <= MAX_PAPA
  ) {
    const life = fromFixedToInt(fmul(toFixed(PAPA_LIFE_TICKS), w.mods.papaLifeMul));
    randPosFarFromHead(w);
    const bx = _pos.x;
    const by = _pos.y;
    for (let k = 0; k < FRANCESA_LINE_LEN; k++) {
      const idx = w.papaCount;
      w.papaX[idx] = bx + k * FRANCESA_SPACING;
      w.papaY[idx] = by;
      w.papaKind[idx] = PAPA.FRANCESA;
      w.papaSeq[idx] = k;
      w.papaExpire[idx] = w.tick + life;
      w.papaCount = idx + 1;
    }
  }

  // 9c. Pedido (re)generation when idle and past cooldown.
  if (
    w.pedido.active === 0 &&
    w.service >= PEDIDO_FIRST_SERVICE &&
    w.tick >= w.pedido.cooldownUntil
  ) {
    const p = w.pedido;
    p.base = nextInt(w, 8);
    p.seq[0] = nextInt(w, 8);
    p.seq[1] = nextInt(w, 8);
    p.seq[2] = nextInt(w, 8);
    p.progress = 0;
    p.expire = w.tick + PEDIDO_TICKS;
    p.active = 1;
  }

  // 9d. Smoke trail (Tocineta) drops behind the head.
  if (w.mods.smokeTrailEnabled && w.serviceTick % SMOKE_EVERY === 0 && w.smokeCount < MAX_SMOKE) {
    const idx = w.smokeCount;
    w.smokeX[idx] = w.bodyX[0];
    w.smokeY[idx] = w.bodyY[0];
    w.smokeExpire[idx] = w.tick + SMOKE_LIFE_TICKS;
    w.smokeCount = idx + 1;
  }

  // ---- P10 Fork AI --------------------------------------------------------
  if (w.fork.active !== 0) {
    const f = w.fork;
    // Duelo danger-pay: dancing NEAR the hunting boss trickles score (tension → reward).
    if (
      w.mods.forkNearScorePerTick > 0 &&
      f.state === FORK_STATE.CHASE &&
      dist2(w.bodyX[0], w.bodyY[0], f.x, f.y) < radiusSq(200 * FP_ONE)
    ) {
      w.score += w.mods.forkNearScorePerTick;
    }
    if (f.state === FORK_STATE.BLOCKED) {
      if (f.blocked > 0) f.blocked--;
      if (f.blocked <= 0) f.state = FORK_STATE.CHASE;
    } else {
      let fspeed = FORK_SPEED;
      // Duelo: the boss circles cautiously (a duel, not a hunt) — 85% speed. Gives the lasso
      // counter-play real room, and the pact stays survivable with it active EVERY service.
      if (w.mods.forkAlways) fspeed = fmul(fspeed, 55706); // ×0.85
      if (forkInSmoke(w)) fspeed = fmul(fspeed, w.mods.forkSmokeSlowMul);
      const hx = w.bodyX[0];
      const hy = w.bodyY[0];
      const desired = atan2Fixed(hy - f.y, hx - f.x);
      const d = angDiff(desired, f.heading);
      f.heading = (f.heading + fclamp(d, -FORK_TURN_RATE, FORK_TURN_RATE)) & FP_MASK;
      f.x += fmul(cosFixed(f.heading), fspeed);
      f.y += fmul(sinFixed(f.heading), fspeed);
      if (f.state === FORK_STATE.ENTER) {
        const inner = w.usableHalf - FORK_ENTER_MARGIN;
        const ax = f.x < 0 ? -f.x : f.x;
        const ay = f.y < 0 ? -f.y : f.y;
        if (ax <= inner && ay <= inner) f.state = FORK_STATE.CHASE;
      }
    }
  }

  // ---- P11 Service / run state machine -----------------------------------
  if (w.mode === MODE.RUSH) {
    if (w.tick >= RUSH_TICKS) {
      w.phase = PHASE.DEAD;
    } else if (w.serviceTick >= w.serviceLen) {
      advanceService(w); // RUSH skips DRAFT entirely
    }
  } else if (w.serviceTick >= w.serviceLen) {
    if (w.service >= SERVICE_COUNT) {
      w.phase = PHASE.DEAD;
      w.victory = 1;
    } else {
      w.phase = PHASE.DRAFT;
      generateOffer(w);
    }
  }

  // ---- P12 Advance the clock ---------------------------------------------
  w.tick++;
}
