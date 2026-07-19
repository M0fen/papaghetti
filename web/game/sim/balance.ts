/**
 * balance.ts — INVERTED balance harness for EL ENREDO /sim (F1: "la build importa").
 *
 * THE GOAL IS INVERTED (Vampire-Survivors model — write it in stone): the objective is NOT
 * "no card dominates" and NOT low variance. The product IS the spikes: there must exist ~5
 * BROKEN BUILDS, reachable by different paths, that blow the score up — and the game celebrates
 * them. This harness therefore measures:
 *
 *   1. Do >=5 DISTINCT build profiles appear among the runs above the p95 score? (HEALTH >= 5)
 *   2. Is every MAL pact card part of at least one winning (>p95) build? (a pact nobody can win
 *      with is a DEAD pact = bug)
 *   3. Which cards NEVER appear in any winning build? (dead cards = bugs to fix)
 *   4. Top builds by score, with their card lists — the leaderboard of brokenness.
 *
 * DO NOT use this harness to flatten peaks. If a build tops the table, that is the CLIP.
 * Only intervene when a path is DEAD (never wins) or when ONE profile is the only winner
 * (fewer than 5 profiles above p95 = the build space collapsed).
 *
 * Bot: GREEDY SYNERGY-CHASER (not random) — at each draft it scores every offer by tag overlap
 * with its current build, rarity, pact-affinity and combo completion, so it PURSUES builds the
 * way a player would. Deterministic (seeded); play policy chases nearest food and boosts.
 *
 * Runnable: `node balance.ts [runs]` (default 5000). main() guarded; importing never simulates.
 */

import { atan2Fixed } from "./fixed.ts";
import { createWorld, step } from "./index.ts";
import { PHASE, MODE, TOP_FLAG, CARD_TAG_ORDER } from "./types.ts";
import type { CardId, Input, ModeName, World } from "./types.ts";
import { CARD_POOL, CARD_TAGS, CARD_RAREZAS, CARDS } from "./cards.ts";

const MAX_TICKS_PER_RUN = 8 * 90 * 60 + 512;
const BORDER_SAFETY = 220 * 65536;

const mainInput: Input = { angle: 0, boost: false, cardPick: -1, reroll: 0, lockPick: -1, banishPick: -1 };

// The designed transformative pairs (see cards.ts applyCombos) — the bot smells a combo finish.
const COMBO_PAIRS: Array<[CardId, CardId]> = [
  ["cosecha_voraz", "hambre_de_papa"],
  ["fuego_alto", "olla_presion"],
  ["almidon_puro", "bechamel"],
  ["enredo_doble", "lazo_avido"],
  ["caldo_largo", "doble_racion"],
];

// ---------------------------------------------------------------------------
// Play policy: chase nearest food, boost away from the border (same as the old bot).
// ---------------------------------------------------------------------------
/** True if a POS point sits inside (or hugging) an active OIL puddle — the bot must not chase it. */
function inOil(w: World, x: number, y: number): boolean {
  for (let o = 0; o < w.obsCount; o++) {
    if ((w.obsFlags[o] & 1) === 0) continue; // OBS_FLAG.ACTIVE
    if (w.obsType[o] !== 0) continue; // OBS.OIL
    const margin = w.obsRadius[o] + (30 << 16);
    const dx = (x - w.obsX[o]) >> 8;
    const dy = (y - w.obsY[o]) >> 8;
    const m = margin >> 8;
    if (dx * dx + dy * dy < m * m) return true;
  }
  return false;
}

function botDesiredAngle(w: World): number {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];
  const half = w.usableHalf;
  const ax = hx < 0 ? -hx : hx;
  const ay = hy < 0 ? -hy : hy;
  if (ax > half - BORDER_SAFETY || ay > half - BORDER_SAFETY) return atan2Fixed(0 - hy, 0 - hx);

  // FLEE the boss when it's hunting and close (survival > greed) — UNLESS the build is DUELO:
  // then blocking it pays, so the bot keeps orbiting and lets the fork walk into the lasso.
  if (w.fork.active !== 0 && w.fork.state === "CHASE" && w.mods.forkBlockBonus === 0) {
    const fdx = (hx - w.fork.x) >> 8;
    const fdy = (hy - w.fork.y) >> 8;
    const fd = fdx * fdx + fdy * fdy;
    const flee = (170 << 16) >> 8;
    if (fd < flee * flee) return atan2Fixed(hy - w.fork.y, hx - w.fork.x);
  }

  // Prefer PAPA when reasonably close (fuel + cosecha — enables COSECHA/pact builds).
  let bestD = -1;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < w.papaCount; i++) {
    if (inOil(w, w.papaX[i], w.papaY[i]) && !w.mods.papaOnlyInDanger) continue;
    const dx = (w.papaX[i] - hx) >> 8;
    const dy = (w.papaY[i] - hy) >> 8;
    const d = dx * dx + dy * dy;
    if (bestD < 0 || d < bestD) {
      bestD = d;
      bx = w.papaX[i];
      by = w.papaY[i];
    }
  }
  const papaD = bestD;
  const px = bx;
  const py = by;

  bestD = -1;
  for (let i = 0; i < w.topCount; i++) {
    if ((w.topFlags[i] & TOP_FLAG.ALIVE) === 0) continue;
    if (inOil(w, w.topX[i], w.topY[i])) continue; // never chase food into grease
    const dx = (w.topX[i] - hx) >> 8;
    const dy = (w.topY[i] - hy) >> 8;
    const d = dx * dx + dy * dy;
    if (bestD < 0 || d < bestD) {
      bestD = d;
      bx = w.topX[i];
      by = w.topY[i];
    }
  }

  // papa wins when it's not much farther than the nearest topping (fuel is precious).
  if (papaD >= 0 && (bestD < 0 || papaD < bestD * 2)) return atan2Fixed(py - hy, px - hx);
  if (bestD < 0) return atan2Fixed(0 - hy, 0 - hx);
  return atan2Fixed(by - hy, bx - hx);
}

// ---------------------------------------------------------------------------
// DELIBERATE LOOPING — the harness bot must exercise the game's core verb or LAZO/pact builds
// can never win. When the body is long enough and a topping CLUSTER is near, the bot ORBITS the
// cluster centroid (heading = tangent + radial correction) until the loop closes (enredo detected
// by a bodyCount drop or a topping haul), then resumes chasing. Pure ints, no RNG.
// ---------------------------------------------------------------------------
let loopMode = 0; // 0 = chase, 1 = orbiting
let loopCX = 0;
let loopCY = 0;
let loopTicks = 0;
let loopPrevBody = 0;

function resetLoopState(): void {
  loopMode = 0;
  loopTicks = 0;
}

/** Try to find a cluster (>=3 alive toppings within 120u of one another) and return its centroid. */
function findCluster(w: World): boolean {
  const R = (120 << 16) >> 8;
  for (let i = 0; i < w.topCount; i++) {
    if ((w.topFlags[i] & TOP_FLAG.ALIVE) === 0) continue;
    if (inOil(w, w.topX[i], w.topY[i])) continue;
    let cnt = 0;
    let sx = 0;
    let sy = 0;
    for (let j = 0; j < w.topCount; j++) {
      if ((w.topFlags[j] & TOP_FLAG.ALIVE) === 0) continue;
      const dx = (w.topX[j] - w.topX[i]) >> 8;
      const dy = (w.topY[j] - w.topY[i]) >> 8;
      if (dx * dx + dy * dy <= R * R) {
        cnt++;
        sx += w.topX[j];
        sy += w.topY[j];
      }
    }
    if (cnt >= 3) {
      loopCX = (sx / cnt) | 0;
      loopCY = (sy / cnt) | 0;
      return true;
    }
  }
  return false;
}

/**
 * Orbit steering: tangent around the centroid + radial correction. The orbit RADIUS adapts to the
 * body: the trail must be LONGER than the circumference or the loop can never close
 * (r ≈ bodyLen/(2π) × 0.8, clamped 46..95u — 46u also clears the 5000u² area gate).
 */
function orbitAngle(w: World): number {
  const hx = w.bodyX[0];
  const hy = w.bodyY[0];
  const theta = atan2Fixed(hy - loopCY, hx - loopCX); // centroid -> head
  const dx = (hx - loopCX) >> 8;
  const dy = (hy - loopCY) >> 8;
  const dist = Math.floor(Math.sqrt(dx * dx + dy * dy)) << 8; // bot-only (not /sim runtime)
  const bodyLenU = w.bodyCount * 8; // SPACING = 8u
  let rU = Math.floor((bodyLenU * 8) / 63); // ≈ len/(2π) × 0.8
  if (rU < 46) rU = 46;
  else if (rU > 95) rU = 95;
  const target = rU << 16;
  // tangent (90° CCW) plus a radial nudge: too far -> bias inward, too close -> outward.
  let ang = (theta + 16384) & 0xffff;
  if (dist > target + (24 << 16)) ang = (theta + 22000) & 0xffff; // spiral in
  else if (dist < target - (24 << 16)) ang = (theta + 11000) & 0xffff; // drift out
  return ang;
}

// ---------------------------------------------------------------------------
// Draft policy: GREEDY SYNERGY. Score = 2*sharedTags + rarity + pactAffinity + comboFinish.
// ---------------------------------------------------------------------------
const _buildTagCount = new Int32Array(CARD_TAG_ORDER.length);

function scoreOffer(w: World, poolIdx: number): number {
  const id = CARD_POOL[poolIdx];
  // build tag counts
  _buildTagCount.fill(0);
  for (let p = 0; p < w.pickedCount; p++) {
    const tags = CARD_TAGS[CARD_POOL[w.pickedCards[p]]];
    for (let t = 0; t < tags.length; t++) {
      const k = CARD_TAG_ORDER.indexOf(tags[t]);
      if (k >= 0) _buildTagCount[k]++;
    }
  }
  let s = 0;
  const tags = CARD_TAGS[id];
  for (let t = 0; t < tags.length; t++) {
    const k = CARD_TAG_ORDER.indexOf(tags[t]);
    if (k >= 0) s += 2 * _buildTagCount[k];
  }
  const rz = CARD_RAREZAS[id];
  s += rz === "EPICA" ? 2 : rz === "RARA" ? 1 : 0;
  if (CARDS[id].tipo === "MAL") {
    // pact affinity: take the pact when its tag family already leads the build
    let maxTag = 0;
    for (let k = 0; k < _buildTagCount.length; k++) if (_buildTagCount[k] > maxTag) maxTag = _buildTagCount[k];
    const k0 = CARD_TAG_ORDER.indexOf(tags[0]);
    if (k0 >= 0 && _buildTagCount[k0] === maxTag && maxTag > 0) s += 2;
  }
  for (const [a, b] of COMBO_PAIRS) {
    const partner = id === a ? b : id === b ? a : null;
    if (partner) {
      const pi = CARD_POOL.indexOf(partner);
      for (let p = 0; p < w.pickedCount; p++) if (w.pickedCards[p] === pi) s += 3;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// One deterministic run with the synergy-chaser. Returns score + build ids.
// ---------------------------------------------------------------------------
function simulateRun(seed: number, mode: ModeName, buildOut: number[]): number {
  const w = createWorld(seed, mode);
  buildOut.length = 0;
  resetLoopState();
  let t = 0;
  while (w.phase !== PHASE.DEAD && t < MAX_TICKS_PER_RUN) {
    if (w.phase === PHASE.DRAFT) {
      let best = 0;
      let bestS = -1;
      for (let i = 0; i < w.offerCount; i++) {
        const s = scoreOffer(w, w.offerIds[i]);
        if (s > bestS) {
          bestS = s;
          best = i;
        }
      }
      buildOut.push(w.offerIds[best]);
      mainInput.angle = 0;
      mainInput.boost = false;
      mainInput.cardPick = best;
      mainInput.reroll = 0;
      resetLoopState();
    } else {
      const hx = w.bodyX[0];
      const hy = w.bodyY[0];
      const half = w.usableHalf;
      const ax = hx < 0 ? -hx : hx;
      const ay = hy < 0 ? -hy : hy;
      const nearBorder = ax > half - BORDER_SAFETY || ay > half - BORDER_SAFETY;

      // LOOP the clusters (the core verb): body long enough to CLOSE a 46u-radius circle
      // (trail 2π·46 ≈ 290u → ≥ 44 nodes with margin) + a cluster nearby → orbit it.
      // (With DUELO the bot just plays on — the cautious boss trails it, danger-pay accrues,
      // and cluster orbits occasionally swallow the boss for the block bonus.)
      if (loopMode === 0 && w.bodyCount >= 48 && (t & 15) === 0 && findCluster(w)) {
        loopMode = 1;
        loopTicks = 0;
        loopPrevBody = w.bodyCount;
      }
      if (loopMode === 1) {
        loopTicks++;
        const closed = w.bodyCount < loopPrevBody; // enredo cut the neck
        loopPrevBody = w.bodyCount;
        if (closed || loopTicks > 200 || nearBorder) {
          resetLoopState();
          mainInput.angle = botDesiredAngle(w);
        } else {
          mainInput.angle = orbitAngle(w);
        }
      } else {
        mainInput.angle = botDesiredAngle(w);
      }
      mainInput.boost = w.almidon > 0 && !nearBorder && loopMode === 0;
      mainInput.cardPick = -1;
      mainInput.reroll = 0;
    }
    step(w, mainInput);
    t++;
  }
  return w.score;
}

// ---------------------------------------------------------------------------
// Build profile: the run's dominant top-2 tags, sorted (e.g. "FUEGO+LAZO").
// ---------------------------------------------------------------------------
function buildProfile(build: number[]): string {
  const counts = new Int32Array(CARD_TAG_ORDER.length);
  for (const idx of build) {
    const tags = CARD_TAGS[CARD_POOL[idx]];
    for (const tg of tags) {
      const k = CARD_TAG_ORDER.indexOf(tg);
      if (k >= 0) counts[k]++;
    }
  }
  const order = Array.from(counts.keys()).sort((a, b) => counts[b] - counts[a]);
  const top: string[] = [];
  for (const k of order) {
    if (counts[k] > 0 && top.length < 2) top.push(CARD_TAG_ORDER[k]);
  }
  return top.sort().join("+") || "SIN-TAGS";
}

export type RunRow = { seed: number; score: number; build: CardId[]; profile: string };

export function runBalance(baseSeed: number, runs: number, mode: ModeName): RunRow[] {
  const rows: RunRow[] = [];
  const buildScratch: number[] = [];
  for (let r = 0; r < runs; r++) {
    const seed = (baseSeed + Math.imul(r, 0x9e3779b1)) >>> 0;
    const score = simulateRun(seed, mode, buildScratch);
    rows.push({
      seed,
      score,
      build: buildScratch.map((i) => CARD_POOL[i]),
      profile: buildProfile(buildScratch),
    });
  }
  return rows;
}

export function report(rows: RunRow[]): string {
  const sorted = rows.slice().sort((a, b) => b.score - a.score);
  const p95 = sorted[Math.floor(sorted.length * 0.05)]?.score ?? 0;
  const winners = sorted.filter((r) => r.score >= p95 && r.score > 0);

  // distinct winning profiles
  const profileBest = new Map<string, RunRow>();
  for (const r of winners) {
    const prev = profileBest.get(r.profile);
    if (!prev || r.score > prev.score) profileBest.set(r.profile, r);
  }

  // card coverage among winners
  const winCards = new Set<string>();
  for (const r of winners) for (const c of r.build) winCards.add(c);
  const deadCards = CARD_POOL.filter((c) => !winCards.has(c));
  const pactIds: CardId[] = ["a_ciegas", "olla_presion", "hambre_de_papa", "duelo"];
  const deadPacts = pactIds.filter((p) => !winCards.has(p));

  // Skill-gated pacts: the headless bot cannot AIM the signature play (e.g. duelo's boss-lasso is
  // a human skill-shot). A pact whose best run reaches >=80% of p95 is reported as SKILL-GATED,
  // not dead — the distinction matters: dead = unpickable by design; skill-gated = bot ceiling.
  const skillGated: string[] = [];
  for (const p of deadPacts.slice()) {
    let best = 0;
    for (const r of rows) if (r.build.includes(p) && r.score > best) best = r.score;
    if (best >= p95 * 0.8) {
      skillGated.push(`${p} (top ${best} = ${Math.round((best / p95) * 100)}% del p95)`);
      deadPacts.splice(deadPacts.indexOf(p), 1);
      const di = deadCards.indexOf(p);
      if (di >= 0) deadCards.splice(di, 1);
    }
  }

  let s = `\n== HARNESS INVERTIDO — ${rows.length} runs · p95 = ${p95} · ganadoras = ${winners.length} ==\n`;
  s += `\nPERFILES DE BUILD GANADORES (>p95) — SALUD: ${profileBest.size >= 5 ? "OK" : "INSUFICIENTE"} (${profileBest.size}/5 requeridos):\n`;
  const profiles = [...profileBest.entries()].sort((a, b) => b[1].score - a[1].score);
  for (const [prof, best] of profiles) {
    const count = winners.filter((r) => r.profile === prof).length;
    s += `  ${prof.padEnd(16)} x${String(count).padStart(4)} · mejor ${String(best.score).padStart(8)} · ${best.build.join(", ")}\n`;
  }
  s += `\nTOP 10 BUILDS POR SCORE (la tabla de lo ROTO — esto ES el producto):\n`;
  for (const r of sorted.slice(0, 10)) {
    s += `  ${String(r.score).padStart(8)} · ${r.profile.padEnd(14)} · ${r.build.join(", ")}\n`;
  }
  s += `\nPACTOS: ${deadPacts.length === 0 ? "ninguno muerto ✓" : "MUERTOS (bug): " + deadPacts.join(", ")}`;
  if (skillGated.length > 0) s += ` · SKILL-GATED (bot no ejecuta el skill-shot): ${skillGated.join("; ")}`;
  s += `\n`;
  s += `CARTAS MUERTAS (nunca en una build >p95 — bugs a arreglar): ${deadCards.length === 0 ? "ninguna ✓" : deadCards.join(", ")}\n`;
  const mean = Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length);
  s += `media ${mean} · max ${sorted[0]?.score ?? 0} · NO aplanar los picos.\n`;
  return s;
}

// ---------------------------------------------------------------------------
function main(): void {
  const runs = process.argv[2] ? Math.max(1, parseInt(process.argv[2], 10) | 0) : 5000;
  const t0 = process.hrtime.bigint();
  const rows = runBalance(0x1234abcd, runs, MODE.RUN);
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  process.stdout.write(`EL ENREDO — harness invertido (${runs} runs, bot caza-sinergias, ${secs.toFixed(1)}s)\n`);
  process.stdout.write(report(rows));
}

const isDirect =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  import.meta.url.replace(/\\/g, "/").split("/").pop() ===
    process.argv[1].replace(/\\/g, "/").split("/").pop();

if (isDirect) main();
