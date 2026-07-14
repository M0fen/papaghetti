/**
 * spatial.ts — fixed-grid spatial hash (broad-phase) for EL ENREDO /sim.
 *
 * A deterministic, allocation-free-after-construction uniform grid used to prefilter
 * head-vs-topping eats and the enredo point-in-poly pass. Buckets are singly-linked
 * lists threaded over parallel typed arrays (a `heads[cell]` head index + a `next[]`
 * chain), so no per-tick heap allocation occurs and iteration order is a pure function
 * of insertion order — never JS object key order. Cells are iterated in fixed row-major
 * order so query results are bit-identical on every machine.
 *
 * Number space: all coordinates are POS (Q16.16). `cellShift` is the power-of-two side
 * length of a grid cell in POS units (cell = 1 << cellShift). Playfield extents stay
 * well under 2^31 (|x - originX| < ~2^28), so an arithmetic `>> cellShift` is exact and
 * matches Math.floor for negative offsets — we use it directly. Nothing here reads
 * wall-clock, Math.random, or trig; there is no floating-point gameplay math.
 */

// This module deliberately imports nothing from the foundation: it operates purely on
// raw POS integers handed in by step.ts, and does no Q16.16 multiply/divide of its own.

export type SpatialHash = {
  cellShift: number; // POS side length of a cell = 1 << cellShift
  cols: number;
  rows: number;
  originX: number; // POS coordinate of grid cell (0,0) lower corner
  originY: number; // POS
  heads: Int32Array; // length cols*rows, -1 = empty (bucket head item index)
  next: Int32Array; // length capacity, -1 = end of chain
  itemX: Int32Array; // length capacity (POS)
  itemY: Int32Array; // length capacity (POS)
  itemId: Int32Array; // length capacity (caller's entity id)
  count: number; // active inserted item count (prefix of the item arrays)
};

/**
 * Allocate every backing array once. `capacity` is the maximum number of items that can
 * be inserted between clears (typically a pool cap such as MAX_TOP or MAX_OBS).
 */
export function createSpatialHash(
  cellShift: number,
  cols: number,
  rows: number,
  originX: number,
  originY: number,
  capacity: number,
): SpatialHash {
  const heads = new Int32Array(cols * rows);
  heads.fill(-1);
  return {
    cellShift,
    cols,
    rows,
    originX,
    originY,
    heads,
    next: new Int32Array(capacity),
    itemX: new Int32Array(capacity),
    itemY: new Int32Array(capacity),
    itemId: new Int32Array(capacity),
    count: 0,
  };
}

/** Reset all buckets to empty and drop every inserted item. No allocation. */
export function shClear(h: SpatialHash): void {
  h.heads.fill(-1);
  h.count = 0;
}

/** Clamp a raw cell coordinate into [0, hi-1]. */
function clampCell(c: number, hi: number): number {
  if (c < 0) return 0;
  if (c >= hi) return hi - 1;
  return c;
}

/**
 * Insert one item at POS (x, y). The item is prepended to its cell's chain; because the
 * chain is walked head-first, iteration reflects reverse-insertion order deterministically.
 * Silently ignores inserts past `capacity` (callers keep counts within their pool caps).
 */
export function shInsert(h: SpatialHash, id: number, x: number, y: number): void {
  const i = h.count;
  if (i >= h.next.length) return; // capacity guard; never fires within pool caps
  // |x - originX| < 2^28 for the bounded playfield, so >> is exact and == Math.floor.
  const cx = clampCell((x - h.originX) >> h.cellShift, h.cols);
  const cy = clampCell((y - h.originY) >> h.cellShift, h.rows);
  const cell = cy * h.cols + cx;

  h.itemX[i] = x;
  h.itemY[i] = y;
  h.itemId[i] = id;
  h.next[i] = h.heads[cell]; // prepend: point at previous chain head (-1 if empty)
  h.heads[cell] = i;
  h.count = i + 1;
}

/**
 * Broad-phase query: gather item ids whose stored position lies inside the POS AABB
 * centred on (x, y) with half-extent `r`. Cells overlapping the AABB are visited in
 * fixed row-major order (cy outer, cx inner) and each chain is walked head-to-tail, so
 * the emitted order is fully deterministic. Writes up to `out.length` ids into `out`
 * and returns the number written. This is a candidate prefilter — callers still run the
 * exact circle/point test in COLLISION space.
 */
export function shQuery(
  h: SpatialHash,
  x: number,
  y: number,
  r: number,
  out: Int32Array,
): number {
  const cap = out.length;
  if (cap === 0) return 0;

  const minX = x - r;
  const maxX = x + r;
  const minY = y - r;
  const maxY = y + r;

  const cxLo = clampCell((minX - h.originX) >> h.cellShift, h.cols);
  const cxHi = clampCell((maxX - h.originX) >> h.cellShift, h.cols);
  const cyLo = clampCell((minY - h.originY) >> h.cellShift, h.rows);
  const cyHi = clampCell((maxY - h.originY) >> h.cellShift, h.rows);

  let n = 0;
  for (let cy = cyLo; cy <= cyHi; cy++) {
    const rowBase = cy * h.cols;
    for (let cx = cxLo; cx <= cxHi; cx++) {
      let i = h.heads[rowBase + cx];
      while (i !== -1) {
        const ix = h.itemX[i];
        const iy = h.itemY[i];
        // Exact AABB membership trims cross-cell false positives cheaply.
        if (ix >= minX && ix <= maxX && iy >= minY && iy <= maxY) {
          out[n] = h.itemId[i];
          n++;
          if (n >= cap) return n;
        }
        i = h.next[i];
      }
    }
  }
  return n;
}
