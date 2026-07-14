/**
 * balance.ts — headless, seeded balance runner for EL ENREDO /sim.
 *
 * The old runner let the bot pick AT RANDOM, so every card landed at ~1/14 ≈ 7% (the offer rate)
 * and a random chooser could not surface a broken card. This version fixes that:
 *
 *   • GREEDY bot that actually CHOOSES. At each draft it does a SHORT ROLLOUT per candidate
 *     (clone the world, take the card, simulate a fixed lookahead with a food-chasing policy)
 *     and keeps the card that yields the most score. This is an objective, weight-free measure of
 *     card power (no hand-authored value function to bias the result).
 *   • A RANDOM baseline is kept for comparison (unbiased "score when the card is present").
 *   • Per card we report: how often it was OFFERED, PICKS, marginal pick% (share of all picks) and
 *     CONDITIONAL pick% (picked / offered — the clean, per-card power signal), meanScore, and a
 *     relative winrate (fraction of that card's runs scoring above the global median).
 *   • SYNERGIES (the TFT tags): how often each tag reached tier 1 / tier 2, and the mean score of
 *     runs that reached tier ≥2 vs the global mean (does the synergy actually carry?).
 *   • HEALTH: flag any card the greedy bot takes >60% of the time it is offered (BROKEN, dominant)
 *     or <10% (DEAD, nobody wants it). The conditional rate is used because it is per-card
 *     independent (the marginal share is bounded by the offer rate and cannot express "broken").
 *
 * Everything is seeded and pure w.r.t. (baseSeed, runs): identical table on any machine. The sim
 * itself stays untouched — the rollout clones run through the SAME step().
 *
 * Runnable: `node balance.ts [runs] [rolloutTicks]`. main() is guarded so importing never simulates.
 */

import { atan2Fixed } from "./fixed.ts";
import { makeRng, nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { createWorld, step } from "./index.ts";
import { PHASE, MODE, TOP_FLAG, CARD_TAG_ORDER } from "./types.ts";
import type { CardId, Input, ModeName, World } from "./types.ts";
import { CARD_POOL, cardIdAt, CARD_TAGS } from "./cards.ts";

const MAX_TICKS_PER_RUN = 8 * 90 * 60 + 256; // full 8-service run + draft slack
const DEFAULT_ROLLOUT_TICKS = 1200; // ~20s greedy lookahead per candidate card

// Steer back toward the centre once the head gets within this fraction of the border, so the bot
// survives into drafts instead of drifting off the edge (POS units).
const BORDER_SAFETY = 220 * 65536;

// Reusable Input objects — rewritten every tick (no per-tick allocation).
const mainInput: Input = { angle: 0, boost: false, cardPick: -1, reroll: 0 };
const rollInput: Input = { angle: 0, boost: false, cardPick: -1, reroll: 0 };

// ===========================================================================
// Bot policy (shared by real runs and rollouts): chase nearest food, boost when safe.
// ===========================================================================

/** Nearest-alive-topping heading, else nearest papa, else steer back toward centre. */
function botDesiredAngle(w: World): number {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];
  const half = w.usableHalf;
  const ax = hx < 0 ? -hx : hx;
  const ay = hy < 0 ? -hy : hy;
  if (ax > half - BORDER_SAFETY || ay > half - BORDER_SAFETY) {
    return atan2Fixed(0 - hy, 0 - hx);
  }
  let bestD = -1;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < w.topCount; i++) {
    if ((w.topFlags[i] & TOP_FLAG.ALIVE) === 0) continue;
    const dx = (w.topX[i] - hx) >> 8;
    const dy = (w.topY[i] - hy) >> 8;
    const d = dx * dx + dy * dy;
    if (bestD < 0 || d < bestD) {
      bestD = d;
      bx = w.topX[i];
      by = w.topY[i];
    }
  }
  if (bestD < 0) {
    for (let i = 0; i < w.papaCount; i++) {
      const dx = (w.papaX[i] - hx) >> 8;
      const dy = (w.papaY[i] - hy) >> 8;
      const d = dx * dx + dy * dy;
      if (bestD < 0 || d < bestD) {
        bestD = d;
        bx = w.papaX[i];
        by = w.papaY[i];
      }
    }
  }
  if (bestD < 0) return atan2Fixed(0 - hy, 0 - hx);
  return atan2Fixed(by - hy, bx - hx);
}

/** Fill `out` with the play input for the current tick (chase food, boost only away from border). */
function fillPlayInput(w: World, out: Input): void {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];
  const half = w.usableHalf;
  const ax = hx < 0 ? -hx : hx;
  const ay = hy < 0 ? -hy : hy;
  const nearBorder = ax > half - BORDER_SAFETY || ay > half - BORDER_SAFETY;
  out.angle = botDesiredAngle(w);
  out.boost = w.almidon > 0 && !nearBorder;
  out.cardPick = -1;
  out.reroll = 0;
}

// ===========================================================================
// World clone (into a reusable scratch — zero allocation on the hot rollout path).
// createWorld gives a world with identical pool capacities, so .set() is a plain memcpy.
// ===========================================================================
function copyInto(dst: World, src: World): void {
  dst.mode = src.mode;
  dst.phase = src.phase;
  dst.seed0 = src.seed0;
  dst.tick = src.tick;
  dst.service = src.service;
  dst.serviceTick = src.serviceTick;
  dst.serviceLen = src.serviceLen;
  dst.rng = src.rng;
  dst.globalSpeedStep = src.globalSpeedStep;
  dst.usableHalf = src.usableHalf;
  dst.bodyCount = src.bodyCount;
  dst.heading = src.heading;
  dst.prevHeadX = src.prevHeadX;
  dst.prevHeadY = src.prevHeadY;
  dst.growPending = src.growPending;
  dst.almidon = src.almidon;
  dst.crumbHead = src.crumbHead;
  dst.crumbCount = src.crumbCount;
  dst.topCount = src.topCount;
  dst.papaCount = src.papaCount;
  dst.francesaNext = src.francesaNext;
  dst.obsCount = src.obsCount;
  dst.burnCount = src.burnCount;
  dst.smokeCount = src.smokeCount;
  dst.score = src.score;
  dst.globalMult = src.globalMult;
  dst.cosecha = src.cosecha;
  dst.toppingsEaten = src.toppingsEaten;
  dst.pickedCount = src.pickedCount;
  dst.offerCount = src.offerCount;
  dst.rerollLeft = src.rerollLeft;
  dst.rerollUsed = src.rerollUsed;
  dst.victory = src.victory;

  dst.bodyX.set(src.bodyX);
  dst.bodyY.set(src.bodyY);
  dst.crumbX.set(src.crumbX);
  dst.crumbY.set(src.crumbY);
  dst.crumbLen.set(src.crumbLen);
  dst.topX.set(src.topX);
  dst.topY.set(src.topY);
  dst.topKind.set(src.topKind);
  dst.topFlags.set(src.topFlags);
  dst.topExpire.set(src.topExpire);
  dst.papaX.set(src.papaX);
  dst.papaY.set(src.papaY);
  dst.papaKind.set(src.papaKind);
  dst.papaSeq.set(src.papaSeq);
  dst.papaExpire.set(src.papaExpire);
  dst.obsType.set(src.obsType);
  dst.obsX.set(src.obsX);
  dst.obsY.set(src.obsY);
  dst.obsRadius.set(src.obsRadius);
  dst.obsPhase.set(src.obsPhase);
  dst.obsFlags.set(src.obsFlags);
  dst.burnX.set(src.burnX);
  dst.burnY.set(src.burnY);
  dst.burnR.set(src.burnR);
  dst.burnExpire.set(src.burnExpire);
  dst.smokeX.set(src.smokeX);
  dst.smokeY.set(src.smokeY);
  dst.smokeExpire.set(src.smokeExpire);
  dst.pickedCards.set(src.pickedCards);
  dst.synergyTier.set(src.synergyTier);
  dst.offerIds.set(src.offerIds);

  dst.fork.active = src.fork.active;
  dst.fork.x = src.fork.x;
  dst.fork.y = src.fork.y;
  dst.fork.heading = src.fork.heading;
  dst.fork.state = src.fork.state;
  dst.fork.blocked = src.fork.blocked;

  dst.pedido.active = src.pedido.active;
  dst.pedido.base = src.pedido.base;
  dst.pedido.seq[0] = src.pedido.seq[0];
  dst.pedido.seq[1] = src.pedido.seq[1];
  dst.pedido.seq[2] = src.pedido.seq[2];
  dst.pedido.progress = src.pedido.progress;
  dst.pedido.expire = src.pedido.expire;
  dst.pedido.cooldownUntil = src.pedido.cooldownUntil;

  Object.assign(dst.mods, src.mods);
}

// ===========================================================================
// Greedy chooser: short rollout per candidate, keep the highest-scoring card.
// ===========================================================================
function rollout(scratch: World, horizon: number): number {
  for (let t = 0; t < horizon && scratch.phase !== PHASE.DEAD; t++) {
    if (scratch.phase === PHASE.DRAFT) {
      // Inner draft during the lookahead: take slot 0 (cheap, deterministic) and keep moving.
      rollInput.angle = 0;
      rollInput.boost = false;
      rollInput.cardPick = scratch.offerCount > 0 ? 0 : -1;
      rollInput.reroll = 0;
    } else {
      fillPlayInput(scratch, rollInput);
    }
    step(scratch, rollInput);
  }
  return scratch.score;
}

/** Return the offer slot the greedy bot picks: the one whose short rollout scores highest. */
function greedyPickSlot(w: World, scratch: World, horizon: number): number {
  let bestSlot = 0;
  let bestScore = -1;
  for (let s = 0; s < w.offerCount; s++) {
    copyInto(scratch, w);
    rollInput.angle = 0;
    rollInput.boost = false;
    rollInput.cardPick = s;
    rollInput.reroll = 0;
    step(scratch, rollInput); // apply the pick, advance into the next service
    const sc = rollout(scratch, horizon);
    if (sc > bestScore) {
      bestScore = sc;
      bestSlot = s;
    }
  }
  return bestSlot;
}

// ===========================================================================
// One run. policy: "greedy" (rollout chooser) or "random" (uniform baseline).
// Records, per card: whether it was offered / picked this run (for offer & pick tallies), and the
// max synergy tier reached per tag. Returns the final score.
// ===========================================================================
export type RunOutcome = {
  score: number;
  offered: Uint8Array; // per card: 1 if it appeared in any offer this run
  picked: Uint8Array; // per card: 1 if drafted this run
  pickCount: Int32Array; // per card: number of times drafted this run
  tagTier: Int8Array; // per tag: max tier reached this run
};

function simulateRun(
  seed: number,
  mode: ModeName,
  policy: "greedy" | "random",
  scratch: World,
  horizon: number,
  out: RunOutcome,
): void {
  const w = createWorld(seed, mode);
  const pickRng: RngState = makeRng(seed ^ 0x5bd1e995);
  out.offered.fill(0);
  out.picked.fill(0);
  out.pickCount.fill(0);

  let t = 0;
  while (w.phase !== PHASE.DEAD && t < MAX_TICKS_PER_RUN) {
    if (w.phase === PHASE.DRAFT) {
      for (let i = 0; i < w.offerCount; i++) out.offered[w.offerIds[i]] = 1;
      let slot: number;
      if (policy === "greedy") {
        slot = greedyPickSlot(w, scratch, horizon);
      } else {
        slot = w.offerCount > 0 ? nextInt(pickRng, w.offerCount) : 0;
      }
      const id = w.offerIds[slot];
      out.picked[id] = 1;
      out.pickCount[id] += 1;
      mainInput.angle = 0;
      mainInput.boost = false;
      mainInput.cardPick = slot;
      mainInput.reroll = 0;
    } else {
      fillPlayInput(w, mainInput);
    }
    step(w, mainInput);
    t++;
  }

  for (let i = 0; i < CARD_TAG_ORDER.length; i++) out.tagTier[i] = w.synergyTier[i];
  out.score = w.score;
}

// ===========================================================================
// Aggregation.
// ===========================================================================
export type CardStat = {
  id: CardId;
  offered: number;
  picks: number;
  pickShare: number; // picks / total picks (marginal — sums to 1 across cards)
  pickCond: number; // picks / offered (conditional — the per-card power signal)
  meanScore: number; // mean final score of runs that drafted it
  winrate: number; // fraction of its runs scoring >= global median
};

export type TagStat = {
  tag: string;
  t1Rate: number; // fraction of runs reaching tier >= 1
  t2Rate: number; // fraction of runs reaching tier 2
  carryScore: number; // mean score of runs reaching tier 2 (0 if none)
};

export type BalanceReport = {
  runs: number;
  policy: "greedy" | "random";
  meanScore: number;
  medianScore: number;
  cards: CardStat[];
  tags: TagStat[];
};

export function runBalance(
  baseSeed: number,
  runs: number,
  mode: ModeName,
  policy: "greedy" | "random",
  horizon: number,
): BalanceReport {
  const n = CARD_POOL.length;
  const nt = CARD_TAG_ORDER.length;
  const offered = new Int32Array(n);
  const picks = new Int32Array(n);
  const runCount = new Int32Array(n); // runs that drafted the card at least once
  const scoreSum = new Float64Array(n);
  const winCount = new Int32Array(n); // runs (that drafted it) scoring >= median
  const t1 = new Int32Array(nt);
  const t2 = new Int32Array(nt);
  const t2ScoreSum = new Float64Array(nt);

  const scratch = createWorld(1, mode); // reusable rollout world (greedy only)
  const out: RunOutcome = {
    score: 0,
    offered: new Uint8Array(n),
    picked: new Uint8Array(n),
    pickCount: new Int32Array(n),
    tagTier: new Int8Array(nt),
  };

  // Pass 1: run everything, remember each run's final score + drafted set (for the median pass).
  const runScore = new Float64Array(runs);
  const runPicked: Uint8Array[] = new Array(runs);
  const runTagTier: Int8Array[] = new Array(runs);

  let totalPicks = 0;
  for (let r = 0; r < runs; r++) {
    const seed = (baseSeed + Math.imul(r, 0x9e3779b1)) >>> 0;
    simulateRun(seed, mode, policy, scratch, horizon, out);
    runScore[r] = out.score;
    runPicked[r] = out.picked.slice();
    runTagTier[r] = out.tagTier.slice();
    for (let c = 0; c < n; c++) {
      if (out.offered[c]) offered[c]++;
      if (out.picked[c]) {
        picks[c] += out.pickCount[c];
        totalPicks += out.pickCount[c];
        runCount[c]++;
        scoreSum[c] += out.score;
      }
    }
    for (let g = 0; g < nt; g++) {
      if (out.tagTier[g] >= 1) t1[g]++;
      if (out.tagTier[g] >= 2) {
        t2[g]++;
        t2ScoreSum[g] += out.score;
      }
    }
  }

  // Global median (for winrate). Copy + sort — off the hot path.
  const sorted = Float64Array.from(runScore).sort();
  const median = runs > 0 ? sorted[runs >> 1] : 0;
  let scoreTotal = 0;
  for (let r = 0; r < runs; r++) {
    scoreTotal += runScore[r];
    if (runScore[r] >= median) {
      const pk = runPicked[r];
      for (let c = 0; c < n; c++) if (pk[c]) winCount[c]++;
    }
  }

  const cards: CardStat[] = [];
  for (let c = 0; c < n; c++) {
    cards.push({
      id: cardIdAt(c),
      offered: offered[c],
      picks: picks[c],
      pickShare: totalPicks > 0 ? picks[c] / totalPicks : 0,
      pickCond: offered[c] > 0 ? picks[c] / offered[c] : 0,
      meanScore: runCount[c] > 0 ? Math.round(scoreSum[c] / runCount[c]) : 0,
      winrate: runCount[c] > 0 ? winCount[c] / runCount[c] : 0,
    });
  }

  const tags: TagStat[] = [];
  for (let g = 0; g < nt; g++) {
    tags.push({
      tag: CARD_TAG_ORDER[g],
      t1Rate: runs > 0 ? t1[g] / runs : 0,
      t2Rate: runs > 0 ? t2[g] / runs : 0,
      carryScore: t2[g] > 0 ? Math.round(t2ScoreSum[g] / t2[g]) : 0,
    });
  }

  return {
    runs,
    policy,
    meanScore: runs > 0 ? Math.round(scoreTotal / runs) : 0,
    medianScore: Math.round(median),
    cards,
    tags,
  };
}

// ===========================================================================
// Reporting.
// ===========================================================================
function pad(s: string, w: number): string {
  return (s + " ".repeat(w)).slice(0, w);
}
function padL(s: string, w: number): string {
  return (" ".repeat(w) + s).slice(-w);
}

/** Cards sorted by conditional pick rate (greedy preference), with health flags. */
export function formatCards(rep: BalanceReport): string {
  const rows = rep.cards.slice().sort((a, b) => b.pickCond - a.pickCond);
  let s = "";
  s += pad("card", 16) + padL("offered", 8) + padL("picks", 7) + padL("share%", 8);
  s += padL("pick|off%", 10) + padL("meanScore", 11) + padL("winrate", 9) + "  health\n";
  s += "-".repeat(16 + 8 + 7 + 8 + 10 + 11 + 9 + 9) + "\n";
  for (const c of rows) {
    let health = "";
    if (c.offered > 0 && c.pickCond > 0.6) health = "BROKEN";
    else if (c.offered > 0 && c.pickCond < 0.1) health = "DEAD";
    s += pad(c.id, 16);
    s += padL(String(c.offered), 8);
    s += padL(String(c.picks), 7);
    s += padL((c.pickShare * 100).toFixed(1), 8);
    s += padL((c.pickCond * 100).toFixed(1), 10);
    s += padL(String(c.meanScore), 11);
    s += padL((c.winrate * 100).toFixed(0) + "%", 9);
    s += "  " + health + "\n";
  }
  return s;
}

export function formatTags(rep: BalanceReport): string {
  let s = pad("tag", 10) + padL("tier1%", 8) + padL("tier2%", 8) + padL("carryScore", 12);
  s += padL("vs.mean", 9) + "\n";
  s += "-".repeat(10 + 8 + 8 + 12 + 9) + "\n";
  for (const t of rep.tags) {
    const vs = rep.meanScore > 0 && t.carryScore > 0 ? t.carryScore / rep.meanScore : 0;
    s += pad(t.tag, 10);
    s += padL((t.t1Rate * 100).toFixed(1), 8);
    s += padL((t.t2Rate * 100).toFixed(1), 8);
    s += padL(String(t.carryScore), 12);
    s += padL(vs > 0 ? "x" + vs.toFixed(2) : "-", 9);
    s += "\n";
  }
  return s;
}

export function formatReport(rep: BalanceReport): string {
  let s = `\n== ${rep.policy.toUpperCase()} — ${rep.runs} runs · mean ${rep.meanScore} · median ${rep.medianScore} ==\n`;
  s += formatCards(rep);
  s += "\nSYNERGIES (TFT tags):\n";
  s += formatTags(rep);
  if (rep.policy === "greedy") {
    // Health check on the CONDITIONAL rate (picked/offered): per-card independent, so the
    // 10%–60% band is meaningful (the marginal share is bounded by the offer rate and cannot
    // reach 60%). NB: the rollout policy chases food and never lassoes, so it under-values the
    // enredo/synergy cards — read their meanScore + winrate (objective outcomes) alongside pick%.
    const broken = rep.cards.filter((c) => c.offered > 0 && c.pickCond > 0.6).map((c) => c.id);
    const dead = rep.cards.filter((c) => c.offered > 0 && c.pickCond < 0.1).map((c) => c.id);
    s += "\nHEALTH (greedy conditional-pick band 10%–60%): ";
    if (broken.length === 0 && dead.length === 0) {
      s += "OK — every card inside the band.\n";
    } else {
      if (broken.length) s += `over(>60%): ${broken.join(", ")}. `;
      if (dead.length) s += `under(<10%): ${dead.join(", ")}.`;
      s += "\n";
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Guarded CLI entry — never runs on import.
// ---------------------------------------------------------------------------
function main(): void {
  const runsArg = process.argv[2];
  const horizonArg = process.argv[3];
  const runs = runsArg ? Math.max(1, parseInt(runsArg, 10) | 0) : 5000;
  const horizon = horizonArg ? Math.max(1, parseInt(horizonArg, 10) | 0) : DEFAULT_ROLLOUT_TICKS;
  const t0 = process.hrtime.bigint();

  const greedy = runBalance(0x1234abcd, runs, MODE.RUN, "greedy", horizon);
  const random = runBalance(0x1234abcd, runs, MODE.RUN, "random", horizon);

  const t1 = process.hrtime.bigint();
  const secs = Number(t1 - t0) / 1e9;

  process.stdout.write(
    `EL ENREDO balance — ${runs} runs each, greedy rollout horizon ${horizon} ticks (${secs.toFixed(1)}s)\n`,
  );
  process.stdout.write("Legend: share% = fraction of ALL picks · pick|off% = picked/offered (per-card power)\n");
  process.stdout.write(formatReport(greedy));
  process.stdout.write(formatReport(random));

  // Tag coverage sanity: every card carries at least one tag.
  let untagged = 0;
  for (const id of CARD_POOL) if (CARD_TAGS[id].length === 0) untagged++;
  if (untagged > 0) process.stdout.write(`WARN: ${untagged} cards have no tag.\n`);
}

const isDirect =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  import.meta.url.replace(/\\/g, "/").split("/").pop() ===
    process.argv[1].replace(/\\/g, "/").split("/").pop();

if (isDirect) main();
