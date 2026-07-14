/**
 * enredo.ts — the signature "loop" mechanic geometry + resolution for EL ENREDO /sim.
 *
 * Pure, deterministic, integer/Q16.16 geometry. Three overflow-proven primitives:
 *   segCross    — STRICT interior segment crossing; writes the POS hit point to SEG_HIT.
 *   loopArea2   — signed 2*area via shoelace in reduced AREA space (>>AREA_SHIFT, sign = winding).
 *   pointInPoly — +X ray-cast, half-open, cross-multiply (no division), on-edge => inside.
 * Plus the high-level runEnredo(w) entry that step() calls once per PLAY tick after the
 * body follow-the-leader pass.
 *
 * OVERFLOW NOTE (the recon): the loop polygon is the small neck loop the head just closed —
 * [ crossing point, body node[j], node[j-1], ..., node[1], head ]. EVERY edge of it is short:
 * node->node edges are exactly SPACING apart, the crossing->node[j] edge is <= SPACING (the
 * crossing lies on segment node[j]-node[j+1]), and the head->crossing edge is <= one head-step
 * (the crossing also lies on the head segment prevHead->node[0]). Because every edge delta is
 * O(SPACING) ~ 2^20 while positions are < 2^28, each cross-multiply term keeps ONE small factor
 * and stays < 2^49 — comfortably exact in a double. (Contract step 2's "node[j+1..bodyCount-1]"
 * text is transposed: that tail-side chain would need a long tail->head chord and would NOT be the
 * region the cut in step 6 removes; we build the neck loop node[j..1], which is consistent with
 * the cut AND with the game spec "body points from the intersection point up to the head".)
 *
 * No Math.random, no wall-clock, no Math.sin/cos/sqrt anywhere here (LUTs live in fixed.ts).
 * Math.abs / Math.floor / Math.ceil below operate only on EXACT integers (never floats).
 */

import {
  cross2,
  fmul,
  fracToQ16,
  fromFixedToInt,
  fmin,
  orient,
  toFixed,
  FP_ONE,
  FP_MASK,
} from "./fixed.ts";
import {
  ALMIDON_GAIN,
  ALMIDON_MAX,
  AREA_SHIFT,
  BURN_LIFE_TICKS,
  FORK_BLOCK_TICKS,
  ENREDO_MULT_STEP,
  GROW_PER_TOP,
  MAX_NODES,
  MAX_TOP,
  MAX_ZONE,
  MIN_LOOP_AREA_2,
  MULT_MAX,
  MULT_STEP,
  PEDIDO_BONUS,
  PEDIDO_COOLDOWN_TICKS,
  PEDIDO_SEQ_LEN,
  SKIP_NEAR_HEAD,
  TOP_BASE,
} from "./constants.ts";
import { FORK_STATE, OBS, OBS_FLAG, TOP_FLAG } from "./types.ts";
import type { World } from "./types.ts";

// ---------------------------------------------------------------------------
// Module-level scratch — reused every tick, never allocated on a hot path.
// ---------------------------------------------------------------------------

/** Loop polygon vertex buffer (POS). Max vertices = a full-body loop < MAX_NODES. */
const scratchPolyX = new Int32Array(MAX_NODES);
const scratchPolyY = new Int32Array(MAX_NODES);
/** Indices (into the topping pool) of toppings enclosed by the current loop. */
const scratchEnclosed = new Int32Array(MAX_TOP);

/** Reused output of segCross(): last strict-crossing test result + POS hit point. */
export const SEG_HIT = { hit: false, x: 0, y: 0 };

/**
 * Per-ingredient score weight, indexed by ToppingCode (SALSA..CHICHARRON).
 * Neutral (all 1) by default; kept as a table so balance can tune a kind without
 * touching the scoring path. Referenced by runEnredo's enclosed-set scoring.
 */
const KIND_WEIGHT: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1];

// ===========================================================================
// Pure geometry primitives
// ===========================================================================

/**
 * STRICT interior crossing of segment A(a1->a2) and segment B(b1->b2).
 * True only when all four orientations straddle with NONE collinear (no shared
 * endpoint, no touching, no overlap). On a hit, writes the POS intersection point
 * to SEG_HIT.x / SEG_HIT.y. Degenerate / parallel (d===0) => false.
 *
 * t = fracToQ16(cross2(w,s), cross2(r,s)); point = a1 + t*r, with
 *   r = a2-a1, s = b2-b1, w = b1-a1.
 */
export function segCross(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number,
): boolean {
  // Four orientations. In each, at least one operand is a short segment delta,
  // so cross2 stays well within 2^53 (see module OVERFLOW NOTE).
  const o1 = orient(a1x, a1y, a2x, a2y, b1x, b1y);
  const o2 = orient(a1x, a1y, a2x, a2y, b2x, b2y);
  const o3 = orient(b1x, b1y, b2x, b2y, a1x, a1y);
  const o4 = orient(b1x, b1y, b2x, b2y, a2x, a2y);

  // Strict interior crossing: no collinearity, both pairs straddle.
  if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0 || o1 === o2 || o3 === o4) {
    SEG_HIT.hit = false;
    return false;
  }

  const rX = a2x - a1x;
  const rY = a2y - a1y;
  const sX = b2x - b1x;
  const sY = b2y - b1y;

  const d = cross2(rX, rY, sX, sY); // == denominator; nonzero here (would-be parallel is collinear-guarded above)
  if (d === 0) {
    SEG_HIT.hit = false;
    return false;
  }

  const wX = b1x - a1x;
  const wY = b1y - a1y;
  const t = fracToQ16(cross2(wX, wY, sX, sY), d); // Q16.16 in (0,1) for a true crossing

  SEG_HIT.x = a1x + fmul(t, rX);
  SEG_HIT.y = a1y + fmul(t, rY);
  SEG_HIT.hit = true;
  return true;
}

/**
 * Signed 2*area of the polygon via the shoelace formula, in reduced AREA units
 * (coords translated to vertex 0, then >>AREA_SHIFT). Sign encodes winding
 * (CCW positive). Callers compare Math.abs() against the area gate.
 *
 * Translating to vertex 0 keeps the per-vertex magnitudes small; the terms with
 * vertex 0 vanish. All values stay integer and < 2^53 for any in-bounds loop.
 */
export function loopArea2(polyX: Int32Array, polyY: Int32Array, n: number): number {
  if (n < 3) return 0;
  const x0 = polyX[0];
  const y0 = polyY[0];
  let area = 0;
  // prev = reduced coords of vertex i; starts at vertex 0 => (0,0).
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const k = i + 1 === n ? 0 : i + 1;
    // (poly - vertex0) < 2^29 in magnitude => >> is bit-safe; reduce to AREA grid.
    const cx = (polyX[k] - x0) >> AREA_SHIFT;
    const cy = (polyY[k] - y0) >> AREA_SHIFT;
    area += px * cy - cx * py;
    px = cx;
    py = cy;
  }
  return area;
}

/**
 * +X ray-cast point-in-polygon. Half-open straddle rule (ay>py) !== (by>py) so a
 * vertex counts on exactly one incident edge. Crossing side decided by an integer
 * cross-multiply (no division): a point exactly on an edge returns true.
 *
 * Overflow: for the loop polygon every edge delta (bx-ax, by-ay) is O(SPACING) ~ 2^20
 * while the point-to-vertex delta is < 2^29, so each product < 2^49 — exact.
 */
export function pointInPoly(
  px: number,
  py: number,
  polyX: Int32Array,
  polyY: Int32Array,
  n: number,
): boolean {
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const ax = polyX[j];
    const ay = polyY[j];
    const bx = polyX[i];
    const by = polyY[i];
    if ((ay > py) !== (by > py)) {
      const dyEdge = by - ay; // nonzero (straddle guarantees it)
      // num = (R - L): where the horizontal ray at py crosses this edge, relative to px.
      const num = (bx - ax) * (py - ay) - (px - ax) * dyEdge;
      if (num === 0) return true; // point lies exactly on the edge
      // px is left of the crossing when num shares sign with the edge's dy.
      if (num > 0 === dyEdge > 0) inside = !inside;
    }
    j = i;
  }
  return inside;
}

// ===========================================================================
// High-level P6 entry
// ===========================================================================

/** Advance an active pedido by one collected topping (in-order). Completion pays out. */
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

/**
 * Resolve the enredo for this PLAY tick: detect the head-segment self-crossing, gate
 * by area, collect/score/consume enclosed toppings, apply card loop effects, cut the
 * neck. Mutates World in place; does nothing when no valid loop closes this tick.
 */
export function runEnredo(w: World): void {
  const n = w.bodyCount;
  const jMax = n - 3; // last testable body segment is node[jMax]-node[jMax+1]
  if (jMax < SKIP_NEAR_HEAD) return; // body too short to enclose anything

  const a1x = w.prevHeadX;
  const a1y = w.prevHeadY;
  const a2x = w.bodyX[0];
  const a2y = w.bodyY[0];

  // 1. First (smallest j) strict crossing of the head segment vs an earlier body
  //    segment wins. Skip the neck segments adjacent to the head.
  let j = -1;
  for (let s = SKIP_NEAR_HEAD; s <= jMax; s++) {
    if (
      segCross(
        a1x,
        a1y,
        a2x,
        a2y,
        w.bodyX[s],
        w.bodyY[s],
        w.bodyX[s + 1],
        w.bodyY[s + 1],
      )
    ) {
      j = s;
      break; // SEG_HIT now holds this crossing point; do not overwrite it
    }
  }
  if (j < 0) return;

  // 2. Build the neck-loop polygon: [ crossing, node[j], node[j-1], ..., node[1], head ].
  //    All edges are short (see module OVERFLOW NOTE). nVerts = j + 2.
  scratchPolyX[0] = SEG_HIT.x;
  scratchPolyY[0] = SEG_HIT.y;
  let v = 1;
  for (let k = j; k >= 1; k--) {
    scratchPolyX[v] = w.bodyX[k];
    scratchPolyY[v] = w.bodyY[k];
    v++;
  }
  scratchPolyX[v] = w.bodyX[0];
  scratchPolyY[v] = w.bodyY[0];
  v++;
  const nVerts = v;

  // 3. Area gate — reject micro-loops. minLoopAreaMul scales the frozen threshold.
  const area2 = loopArea2(scratchPolyX, scratchPolyY, nVerts);
  const areaAbs = area2 < 0 ? -area2 : area2;
  if (areaAbs < fmul(MIN_LOOP_AREA_2, w.mods.minLoopAreaMul)) return;

  // 4. Collect enclosed toppings. Multiplier = enclosed count, capped by loopCap.
  let hits = 0;
  for (let i = 0; i < w.topCount; i++) {
    if ((w.topFlags[i] & TOP_FLAG.ALIVE) === 0) continue;
    if (pointInPoly(w.topX[i], w.topY[i], scratchPolyX, scratchPolyY, nVerts)) {
      scratchEnclosed[hits] = i;
      hits++;
    }
  }
  const cap = w.mods.loopCap;
  const mult = hits < cap ? hits : cap;

  // 4a. Score the whole enclosed set with the (frozen) current global multiplier,
  //     then consume each topping (almidón / growth / pedido / mark dead).
  if (hits > 0) {
    const gMul = w.globalMult; // freeze: pedido completion below must not re-scale this batch
    let acc = 0; // Q16.16 accumulator
    for (let e = 0; e < hits; e++) {
      const i = scratchEnclosed[e];
      let val = toFixed(TOP_BASE * KIND_WEIGHT[w.topKind[i]]);
      val = fmul(val, w.mods.toppingScoreMul);
      val = fmul(val, gMul);
      val = fmul(val, w.mods.globalScoreMul);
      acc += val * mult; // enclosed-count multiplier
    }
    w.score += fromFixedToInt(acc);

    for (let e = 0; e < hits; e++) {
      const i = scratchEnclosed[e];
      w.almidon = fmin(ALMIDON_MAX, w.almidon + ALMIDON_GAIN);
      w.growPending += GROW_PER_TOP;
      w.toppingsEaten++;
      advancePedido(w, w.topKind[i]);
      w.topFlags[i] = w.topFlags[i] & ~TOP_FLAG.ALIVE; // P7 must not double-count these
    }

    // The enredo FEEDS the score snowball: a bigger/chained loop raises the global multiplier
    // (capped at MULT_MAX), so the signature mechanic drives the game's scoring engine — not just
    // a one-off payout. Pure/deterministic (function of the enclosed count).
    w.globalMult = fmin(MULT_MAX, w.globalMult + ENREDO_MULT_STEP * mult);
  }

  // 5. Card loop effects (obstacles / oil / fork enclosed by the loop).
  if (w.mods.enredoDestroysObstacles) {
    for (let i = 0; i < w.obsCount; i++) {
      if (
        (w.obsFlags[i] & OBS_FLAG.ACTIVE) !== 0 &&
        pointInPoly(w.obsX[i], w.obsY[i], scratchPolyX, scratchPolyY, nVerts)
      ) {
        w.obsFlags[i] = (w.obsFlags[i] & ~OBS_FLAG.ACTIVE) | OBS_FLAG.DESTROYED;
      }
    }
  }

  if (w.mods.enredoBurnsOil) {
    let burned = 0;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < w.obsCount; i++) {
      if (
        (w.obsFlags[i] & OBS_FLAG.ACTIVE) !== 0 &&
        w.obsType[i] === OBS.OIL &&
        pointInPoly(w.obsX[i], w.obsY[i], scratchPolyX, scratchPolyY, nVerts)
      ) {
        w.obsFlags[i] = w.obsFlags[i] & ~OBS_FLAG.ACTIVE; // extinguished
        burned++;
      }
    }
    if (burned > 0 && w.burnCount < MAX_ZONE) {
      // Burn zone = polygon bbox centroid + half-extent radius.
      minX = scratchPolyX[0];
      maxX = scratchPolyX[0];
      minY = scratchPolyY[0];
      maxY = scratchPolyY[0];
      for (let p = 1; p < nVerts; p++) {
        const xx = scratchPolyX[p];
        const yy = scratchPolyY[p];
        if (xx < minX) minX = xx;
        else if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        else if (yy > maxY) maxY = yy;
      }
      const halfW = (maxX - minX) >> 1; // extents < 2^29 => >> is bit-safe
      const halfH = (maxY - minY) >> 1;
      const idx = w.burnCount;
      w.burnX[idx] = minX + halfW;
      w.burnY[idx] = minY + halfH;
      w.burnR[idx] = halfW > halfH ? halfW : halfH;
      w.burnExpire[idx] = w.tick + BURN_LIFE_TICKS;
      w.burnCount = idx + 1;
    }
  }

  if (
    w.fork.active !== 0 &&
    pointInPoly(w.fork.x, w.fork.y, scratchPolyX, scratchPolyY, nVerts)
  ) {
    w.fork.state = FORK_STATE.BLOCKED;
    w.fork.blocked = FORK_BLOCK_TICKS;
  }

  // 6. Cut the neck: remove nodes [1..cut] (in-array memmove), head reconnects to
  //    the former node[cut+1]. cut = min(j, ceil(j * enredoTailCostMul)).
  if (w.mods.enredoCutsTail) {
    const costFixed = fmul(toFixed(j), w.mods.enredoTailCostMul); // Q16.16 ~ j*mul
    const ceilCut = Math.floor((costFixed + FP_MASK) / FP_ONE); // ceil to int (FP_MASK == FP_ONE-1)
    // Cap against body length, NOT j, so enredoTailCostMul>1 (Lazo de Hierro) actually eats
    // past the neck loop. With mul==ONE, ceilCut===j (unchanged default). Leave >=2 nodes.
    const maxCut = w.bodyCount - 2;
    let cut = ceilCut > maxCut ? maxCut : ceilCut;
    if (cut < 1) cut = 1;
    const newCount = w.bodyCount - cut;
    for (let k = 1; k < newCount; k++) {
      w.bodyX[k] = w.bodyX[k + cut];
      w.bodyY[k] = w.bodyY[k + cut];
    }
    w.bodyCount = newCount;
  }
}
