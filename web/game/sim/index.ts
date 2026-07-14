/**
 * index.ts — the public, view-facing API surface for EL ENREDO /sim.
 *
 * Thin by design: it re-exports the run lifecycle (createWorld / step) and the shared
 * types, then exposes a small set of READ-ONLY selectors the renderer uses to draw a
 * frame. Selectors never mutate the World and never allocate (the one array-copying
 * selector writes into a caller-owned buffer). A run is fully determined by
 * (seed0 + inputLog); the view is a pure function of the snapshot these selectors read.
 *
 * No gameplay math lives here — selectors return raw snapshot values (POS/brads/int).
 */

export { createWorld } from "./world.ts";
export { step } from "./step.ts";
export type { World, Input, Modifiers, ModeName, PhaseName } from "./types.ts";

import { PHASE } from "./types.ts";
import type { PhaseName, World } from "./types.ts";

/** Head X position (POS / Q16.16). */
export function getHeadX(w: World): number {
  return w.bodyX[0];
}

/** Head Y position (POS / Q16.16). */
export function getHeadY(w: World): number {
  return w.bodyY[0];
}

/** Current head heading (brads, 65536 = full turn). */
export function getHeading(w: World): number {
  return w.heading;
}

/** Active body node count (== polyline length). */
export function bodyLength(w: World): number {
  return w.bodyCount;
}

/** Accumulated score (integer points). */
export function getScore(w: World): number {
  return w.score;
}

/** Current run phase ("PLAY" | "DRAFT" | "DEAD"). */
export function getPhase(w: World): PhaseName {
  return w.phase;
}

/** True once the run has ended (any cause). */
export function isDead(w: World): boolean {
  return w.phase === PHASE.DEAD;
}

/** True when the run ended on an 8-service clear. */
export function isVictory(w: World): boolean {
  return w.victory === 1;
}

/**
 * Copy the current draft offer pool indices into `out` and return the offer count.
 * Meaningful only while phase === "DRAFT"; writes min(offerCount, out.length) entries.
 */
export function getOffers(w: World, out: Int8Array): number {
  const n = w.offerCount < out.length ? w.offerCount : out.length;
  for (let i = 0; i < n; i++) out[i] = w.offerIds[i];
  return n;
}
