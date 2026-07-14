/**
 * balance.ts — headless, seeded balance runner for EL ENREDO /sim.
 *
 * Simulates many full runs with a simple deterministic bot policy (no wall-clock, no
 * Math.random — every stochastic choice is seeded), then reports, per card, its pick
 * rate across all drafts and the mean final score of runs in which it was picked. This
 * surfaces obviously over/under-powered cards without a renderer. It is pure w.r.t. its
 * seeds: the same (baseSeed, runs) always produces the same table on any machine.
 *
 * The bot steers toward the nearest topping (falling back to papa, then to centre to
 * avoid border death) and boosts while it has fuel. At a draft it picks a card using a
 * SEPARATE local RNG so card exposure is roughly uniform. Card picks go through step()
 * as normal Input, so the draft/apply path is exercised exactly as in play.
 *
 * Runnable: `node balance.ts [runs]`. The main() call is guarded so importing this
 * module never runs a simulation.
 */

import { atan2Fixed } from "./fixed.ts";
import { makeRng, nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { createWorld, step } from "./index.ts";
import { PHASE, MODE, TOP_FLAG } from "./types.ts";
import type { CardId, Input, ModeName, World } from "./types.ts";
import { CARD_POOL, cardIdAt } from "./cards.ts";

const MAX_TICKS_PER_RUN = 8 * 90 * 60 + 256; // full 8-service run + draft slack

// Reusable Input object — the bot rewrites it every tick (no per-tick allocation).
const botInput: Input = { angle: 0, boost: false, cardPick: -1, reroll: 0 };

// Steer back toward the centre once the head gets within this fraction of the border,
// so the bot survives into drafts instead of drifting off the edge (POS units).
const BORDER_SAFETY = 220 * 65536; // ~220 world-units from the border

/** Nearest-alive-topping heading, else nearest papa, else steer back toward centre. */
function botDesiredAngle(w: World): number {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];

  // Survival first: if we are hugging the shrinking border, aim at the origin.
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
  if (bestD < 0) {
    // Nothing to chase: aim at the origin to stay clear of the shrinking border.
    return atan2Fixed(0 - hy, 0 - hx);
  }
  return atan2Fixed(by - hy, bx - hx);
}

/** Drive one deterministic run to completion, marking which cards it drafted. */
function simulateRun(seed: number, mode: ModeName, pickedOut: Int32Array): number {
  const w = createWorld(seed, mode);
  const pickRng: RngState = makeRng(seed ^ 0x5bd1e995);
  pickedOut.fill(0);

  let t = 0;
  while (w.phase !== PHASE.DEAD && t < MAX_TICKS_PER_RUN) {
    if (w.phase === PHASE.DRAFT) {
      const slot = w.offerCount > 0 ? nextInt(pickRng, w.offerCount) : 0;
      pickedOut[w.offerIds[slot]] += 1; // draft-level pick count for this card
      botInput.angle = 0;
      botInput.boost = false;
      botInput.cardPick = slot;
      botInput.reroll = 0;
    } else {
      // Steer to target; boost only well away from the border (keeps turns tight near it).
      const hx = w.bodyX[0];
      const hy = w.bodyY[0];
      const half = w.usableHalf;
      const ax = hx < 0 ? -hx : hx;
      const ay = hy < 0 ? -hy : hy;
      const nearBorder = ax > half - BORDER_SAFETY || ay > half - BORDER_SAFETY;
      botInput.angle = botDesiredAngle(w);
      botInput.boost = w.almidon > 0 && !nearBorder;
      botInput.cardPick = -1;
      botInput.reroll = 0;
    }
    step(w, botInput);
    t++;
  }
  return w.score;
}

export type CardStat = { id: CardId; picks: number; pickRate: number; meanScore: number };

/**
 * Run `runs` full games from `baseSeed` under `mode`. For each card returns: total draft
 * picks, pick rate (picks / total drafts), and mean final score over runs that drafted it.
 */
export function runBalance(baseSeed: number, runs: number, mode: ModeName): CardStat[] {
  const n = CARD_POOL.length;
  const picks = new Int32Array(n); // total draft-level picks
  const runCount = new Int32Array(n); // runs that drafted the card at least once
  const scoreSum = new Float64Array(n); // sum of final scores (aggregation only)
  const picked = new Int32Array(n); // scratch per run
  let totalDrafts = 0;

  for (let r = 0; r < runs; r++) {
    const seed = (baseSeed + Math.imul(r, 0x9e3779b1)) >>> 0;
    const score = simulateRun(seed, mode, picked);
    for (let c = 0; c < n; c++) {
      const p = picked[c];
      if (p !== 0) {
        picks[c] += p;
        totalDrafts += p;
        runCount[c]++;
        scoreSum[c] += score;
      }
    }
  }

  const out: CardStat[] = [];
  for (let c = 0; c < n; c++) {
    out.push({
      id: cardIdAt(c),
      picks: picks[c],
      pickRate: totalDrafts > 0 ? picks[c] / totalDrafts : 0,
      meanScore: runCount[c] > 0 ? Math.round(scoreSum[c] / runCount[c]) : 0,
    });
  }
  return out;
}

/** Format the balance table as a fixed-width string (no I/O side effects). */
export function formatReport(stats: CardStat[]): string {
  let s = "card                 picks   pick%    meanScore\n";
  s += "-------------------- ------- -------- ----------\n";
  for (let i = 0; i < stats.length; i++) {
    const st = stats[i];
    const id = (st.id + "                    ").slice(0, 20);
    const picks = ("       " + st.picks).slice(-7);
    const pct = ("        " + (st.pickRate * 100).toFixed(1) + "%").slice(-8);
    const score = ("          " + st.meanScore).slice(-10);
    s += id + " " + picks + " " + pct + " " + score + "\n";
  }
  return s;
}

// ---------------------------------------------------------------------------
// Guarded CLI entry — never runs on import.
// ---------------------------------------------------------------------------
function main(): void {
  const runsArg = process.argv[2];
  const runs = runsArg ? Math.max(1, parseInt(runsArg, 10) | 0) : 200;
  const stats = runBalance(0x1234abcd, runs, MODE.RUN);
  process.stdout.write(`EL ENREDO balance — ${runs} runs (RUN mode)\n`);
  process.stdout.write(formatReport(stats));
}

// Run only when executed directly (node balance.ts), not when imported. Compares this
// module's URL basename against argv[1]'s basename so it fires for `node .../balance.ts`.
const isDirect =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  import.meta.url.replace(/\\/g, "/").split("/").pop() ===
    process.argv[1].replace(/\\/g, "/").split("/").pop();

if (isDirect) main();
