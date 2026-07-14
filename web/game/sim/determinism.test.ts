/**
 * determinism.test.ts — the anti-cheat safety net for EL ENREDO /sim.
 *
 * The whole point of the sim is bit-identical replay: (seed0 + inputLog) must reproduce
 * the exact final state on any machine, or leaderboards / RETO DIARIO break silently.
 * These tests assert that invariant plus the low-level pieces it rests on:
 *   1. replay determinism — same seed + same input log => identical state hash (x1000),
 *   2. fmul + trig-LUT sanity (the fixed-point core),
 *   3. the enredo enclosing-area gate (micro-loops rejected, real loops accepted),
 *   4. RNG reproducibility (seed => sequence) and draft-offer reproducibility.
 *
 * Run with Node's native TS + test runner: `node --test determinism.test.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ONE, FP_ONE, fmul, sinFixed, cosFixed, atan2Fixed } from "./fixed.ts";
import { makeRng, nextU32, nextInt } from "./rng.ts";
import { createWorld, step } from "./index.ts";
import { PHASE, TOP_FLAG } from "./types.ts";
import type { Input, World } from "./types.ts";
import { loopArea2, pointInPoly } from "./enredo.ts";
import { generateOffer } from "./cards.ts";
import { MIN_LOOP_AREA_2 } from "./constants.ts";

// ---------------------------------------------------------------------------
// State hash — FNV-1a (32-bit) over every field that defines a snapshot. Any drift
// between two supposedly-identical runs flips the hash. Integer-only.
// ---------------------------------------------------------------------------
function mix(h: number, v: number): number {
  h ^= v | 0;
  h = Math.imul(h, 0x01000193);
  return h >>> 0;
}

function phaseCode(w: World): number {
  return w.phase === PHASE.PLAY ? 0 : w.phase === PHASE.DRAFT ? 1 : 2;
}

function hashWorld(w: World): number {
  let h = 0x811c9dc5;
  h = mix(h, w.tick);
  h = mix(h, w.service);
  h = mix(h, w.serviceTick);
  h = mix(h, w.serviceLen);
  h = mix(h, phaseCode(w));
  h = mix(h, w.rng);
  h = mix(h, w.score);
  h = mix(h, w.globalMult);
  h = mix(h, w.cosecha);
  h = mix(h, w.almidon);
  h = mix(h, w.globalSpeedStep);
  h = mix(h, w.usableHalf);
  h = mix(h, w.heading);
  h = mix(h, w.prevHeadX);
  h = mix(h, w.prevHeadY);
  h = mix(h, w.growPending);
  h = mix(h, w.bodyCount);
  h = mix(h, w.toppingsEaten);
  h = mix(h, w.victory);
  for (let i = 0; i < w.bodyCount; i++) {
    h = mix(h, w.bodyX[i]);
    h = mix(h, w.bodyY[i]);
  }
  h = mix(h, w.topCount);
  for (let i = 0; i < w.topCount; i++) {
    h = mix(h, w.topX[i]);
    h = mix(h, w.topY[i]);
    h = mix(h, w.topKind[i]);
    h = mix(h, w.topFlags[i]);
    h = mix(h, w.topExpire[i]);
  }
  h = mix(h, w.papaCount);
  for (let i = 0; i < w.papaCount; i++) {
    h = mix(h, w.papaX[i]);
    h = mix(h, w.papaY[i]);
    h = mix(h, w.papaKind[i]);
    h = mix(h, w.papaSeq[i]);
  }
  h = mix(h, w.francesaNext);
  h = mix(h, w.obsCount);
  for (let i = 0; i < w.obsCount; i++) {
    h = mix(h, w.obsType[i]);
    h = mix(h, w.obsX[i]);
    h = mix(h, w.obsY[i]);
    h = mix(h, w.obsRadius[i]);
    h = mix(h, w.obsFlags[i]);
  }
  h = mix(h, w.fork.active);
  h = mix(h, w.fork.x);
  h = mix(h, w.fork.y);
  h = mix(h, w.fork.heading);
  h = mix(h, w.fork.blocked);
  h = mix(h, w.pedido.active);
  h = mix(h, w.pedido.progress);
  h = mix(h, w.pedido.expire);
  h = mix(h, w.pedido.seq[0]);
  h = mix(h, w.pedido.seq[1]);
  h = mix(h, w.pedido.seq[2]);
  // Draft + modifiers state (closes the anti-cheat blind spot: a divergence in applied
  // cards or generated offers now flips the hash on the exact tick it happens).
  h = mix(h, w.rerollUsed);
  h = mix(h, w.rerollLeft);
  h = mix(h, w.offerCount);
  for (let i = 0; i < w.offerCount; i++) h = mix(h, w.offerIds[i]);
  // build state (cards taken + active synergy tiers) — a divergence here flips the hash.
  h = mix(h, w.pickedCount);
  for (let i = 0; i < w.pickedCount; i++) h = mix(h, w.pickedCards[i]);
  for (let i = 0; i < w.synergyTier.length; i++) h = mix(h, w.synergyTier[i]);
  const m = w.mods;
  const b = (v: boolean) => (v ? 1 : 0);
  h = mix(h, m.turnRateMul);
  h = mix(h, m.baseSpeedMul);
  h = mix(h, m.hitboxRadiusMul);
  h = mix(h, m.speedTugMag);
  h = mix(h, b(m.infiniteBoost));
  h = mix(h, b(m.cannotBrake));
  h = mix(h, m.toppingScoreMul);
  h = mix(h, m.globalScoreMul);
  h = mix(h, m.loopCap);
  h = mix(h, m.minLoopAreaMul);
  h = mix(h, b(m.hasLazoAvido));
  h = mix(h, b(m.hasCorteLimpio));
  h = mix(h, b(m.enredoCutsTail));
  h = mix(h, b(m.enredoBurnsOil));
  h = mix(h, b(m.enredoDestroysObstacles));
  h = mix(h, m.enredoTailCostMul);
  h = mix(h, m.toppingLifeMul);
  h = mix(h, m.toppingExplodeEvery);
  h = mix(h, b(m.pineappleEnabled));
  h = mix(h, m.pineappleValueMul);
  h = mix(h, b(m.smokeTrailEnabled));
  h = mix(h, m.forkSmokeSlowMul);
  h = mix(h, m.papaLifeMul);
  h = mix(h, m.cosechaGainMul);
  h = mix(h, b(m.papaOnlyInDanger));
  h = mix(h, m.oilGrowthMul);
  return h >>> 0;
}

// Build one tick of input deterministically from a local RNG + the world's phase, and
// return a COPY so it can be logged and replayed byte-for-byte.
function makeInput(w: World, r: { rng: number }): Input {
  const u = nextU32(r);
  if (w.phase === PHASE.DRAFT) {
    const reroll = (u & 7) === 0 ? 1 : 0;
    const cardPick = w.offerCount > 0 ? (u >>> 3) % w.offerCount : -1;
    return { angle: 0, boost: false, cardPick, reroll };
  }
  return { angle: u & 0xffff, boost: (u & 0x10000) !== 0, cardPick: -1, reroll: 0 };
}

// ===========================================================================
// 1. Replay determinism, x1000.
// ===========================================================================
test("same seed + same input log => identical final state (x1000)", () => {
  const ITERS = 1000;
  const TICKS = 260;
  for (let iter = 0; iter < ITERS; iter++) {
    const seed = (0x1234abcd + Math.imul(iter, 0x9e3779b1)) >>> 0;

    // Reference run — record the input log.
    const a = createWorld(seed, "RUN");
    const inRng = { rng: (seed ^ 0x5bd1e995) >>> 0 };
    const log: Input[] = [];
    for (let t = 0; t < TICKS; t++) {
      const inp = makeInput(a, inRng);
      log.push(inp);
      step(a, inp);
    }
    const hashA = hashWorld(a);

    // Replay run — feed the identical log to a fresh world.
    const b = createWorld(seed, "RUN");
    for (let t = 0; t < TICKS; t++) step(b, log[t]);
    const hashB = hashWorld(b);

    assert.equal(hashB, hashA, `replay diverged at iter ${iter} (seed ${seed})`);
    assert.equal(b.score, a.score, `score diverged at iter ${iter}`);
  }
});

// A long single run that reaches multiple services/drafts stays deterministic on replay.
test("long run with drafts replays identically", () => {
  const seed = 0xc0ffee >>> 0;
  const MAXT = 30000;

  const a = createWorld(seed, "RUN");
  const inRng = { rng: (seed ^ 0x1b56c4e9) >>> 0 };
  const log: Input[] = [];
  for (let t = 0; t < MAXT && a.phase !== PHASE.DEAD; t++) {
    // Survival-biased bot: steer toward the nearest alive topping (via LUT atan2).
    let angle = a.heading;
    if (a.phase === PHASE.PLAY) {
      let best = -1;
      let bx = 0;
      let by = 0;
      const hx = a.bodyX[0];
      const hy = a.bodyY[0];
      for (let i = 0; i < a.topCount; i++) {
        if ((a.topFlags[i] & TOP_FLAG.ALIVE) === 0) continue;
        const dx = (a.topX[i] - hx) >> 8;
        const dy = (a.topY[i] - hy) >> 8;
        const d = dx * dx + dy * dy;
        if (best < 0 || d < best) {
          best = d;
          bx = a.topX[i];
          by = a.topY[i];
        }
      }
      angle = best < 0 ? atan2Fixed(-hy, -hx) : atan2Fixed(by - hy, bx - hx);
    }
    const u = nextU32(inRng);
    const inp: Input =
      a.phase === PHASE.DRAFT
        ? { angle: 0, boost: false, cardPick: a.offerCount > 0 ? u % a.offerCount : -1, reroll: 0 }
        : { angle, boost: (u & 1) !== 0, cardPick: -1, reroll: 0 };
    log.push(inp);
    step(a, inp);
  }
  const hashA = hashWorld(a);

  const b = createWorld(seed, "RUN");
  for (let t = 0; t < log.length; t++) step(b, log[t]);
  assert.equal(hashWorld(b), hashA);
  assert.equal(b.tick, a.tick);
});

// ===========================================================================
// 2. fmul + trig LUT sanity.
// ===========================================================================
test("fmul identity / scaling", () => {
  assert.equal(fmul(ONE, ONE), ONE);
  assert.equal(fmul(ONE, 12345), 12345);
  assert.equal(fmul(2 * ONE, 3 * ONE), 6 * ONE);
  assert.equal(fmul(-2 * ONE, 3 * ONE), -6 * ONE);
  // 1.5 * 4 = 6
  assert.equal(fmul((3 * ONE) >> 1, 4 * ONE), 6 * ONE);
});

test("trig LUT anchors", () => {
  assert.equal(sinFixed(0), 0);
  assert.equal(cosFixed(0), ONE);
  assert.equal(sinFixed(16384), ONE); // sin(90deg) == 1.0
  assert.equal(cosFixed(16384), 0); // cos(90deg) == 0
  assert.equal(sinFixed(32768), 0); // sin(180deg) == 0
  assert.equal(cosFixed(32768), -ONE); // cos(180deg) == -1
  assert.equal(sinFixed(49152), -ONE); // sin(270deg) == -1
});

test("atan2Fixed quadrant anchors (brads)", () => {
  assert.equal(atan2Fixed(0, 1), 0); // +x
  assert.equal(atan2Fixed(1, 0), 16384); // +y (90deg)
  assert.equal(atan2Fixed(0, -1), 32768); // -x (180deg)
  assert.equal(atan2Fixed(-1, 0), 49152); // -y (270deg)
});

// ===========================================================================
// 3. Enredo enclosing-area gate.
// ===========================================================================
function square(sideUnits: number): { x: Int32Array; y: Int32Array; n: number } {
  const s = sideUnits * FP_ONE;
  const x = new Int32Array([0, s, s, 0]);
  const y = new Int32Array([0, 0, s, s]);
  return { x, y, n: 4 };
}

test("loopArea2 gate rejects micro-loops, accepts real loops", () => {
  const small = square(5); // 5x5 = 25 u² — a degenerate micro-loop
  const mid = square(60); // 60x60 = 3600 u² — below the 5000 u² gate: must be REJECTED now
  const big = square(80); // 80x80 = 6400 u² — a real enclosing loop: must clear the gate
  const aSmall = Math.abs(loopArea2(small.x, small.y, small.n));
  const aMid = Math.abs(loopArea2(mid.x, mid.y, mid.n));
  const aBig = Math.abs(loopArea2(big.x, big.y, big.n));

  assert.ok(aSmall > 0, "degenerate area");
  assert.ok(aSmall < MIN_LOOP_AREA_2, "25 u² loop must be below the gate");
  assert.ok(aMid < MIN_LOOP_AREA_2, "3600 u² loop must be below the 5000 u² gate");
  assert.ok(aBig >= MIN_LOOP_AREA_2, "6400 u² loop must clear the gate");
});

test("pointInPoly inside/outside a square", () => {
  const sq = square(40);
  const c = 20 * FP_ONE; // centre
  assert.equal(pointInPoly(c, c, sq.x, sq.y, sq.n), true);
  assert.equal(pointInPoly(-1 * FP_ONE, c, sq.x, sq.y, sq.n), false); // left of the square
  assert.equal(pointInPoly(100 * FP_ONE, c, sq.x, sq.y, sq.n), false); // right of the square
});

// ===========================================================================
// 4. RNG + draft reproducibility.
// ===========================================================================
test("RNG is reproducible and bounded", () => {
  const a = makeRng(0xdeadbeef);
  const b = makeRng(0xdeadbeef);
  for (let i = 0; i < 500; i++) assert.equal(nextU32(a), nextU32(b));

  const c = makeRng(42);
  for (let i = 0; i < 1000; i++) {
    const v = nextInt(c, 7);
    assert.ok(v >= 0 && v < 7);
  }
});

test("draft offers are reproducible for the same (seed, service, cosecha)", () => {
  const w1 = createWorld(0x777, "RETO");
  const w2 = createWorld(0x777, "RETO");
  w1.service = 3;
  w2.service = 3;
  w1.cosecha = w2.cosecha; // equal meters => equal tier
  generateOffer(w1);
  generateOffer(w2);
  assert.equal(w1.offerCount, w2.offerCount);
  for (let i = 0; i < w1.offerCount; i++) assert.equal(w1.offerIds[i], w2.offerIds[i]);
});
