/**
 * fixed.ts — Q16.16 fixed-point math core for EL ENREDO /sim.
 *
 * Every "fixed" value is an EXACT integer stored in a JS double: round(real * 65536).
 * This module is the ONLY place Math.sin/cos/atan are allowed, and they run ONLY at
 * module init to bake the trig LUTs (see the marked loops below). Nothing here reads
 * wall-clock or Math.random. All runtime helpers are pure integer / power-of-two-division
 * math, provably bit-identical on Node v24 native-TS and every browser.
 *
 * Number-space convention (locked project-wide):
 *   POS       — Q16.16 world position/length (playfield <= ~3000 units => raw < 2^28).
 *   COLLISION — deltas reduced by >>8 before squaring; all radius compares live here.
 *   AREA      — polygon coords reduced by >>9 before shoelace (enredo.ts owns that).
 *
 * Bit-op safety rule: a bit-shift / & / | is valid ONLY on values already < 2^31.
 * For anything that can be larger, use Math.floor(x / 2^k) (exact on a double).
 */

export const FP_SHIFT = 16;
export const FP_ONE = 65536; // 1.0
export const ONE = 65536; // alias used by enredo.ts / cards.ts
export const FP_HALF = 32768; // 0.5
export const FP_MASK = 0xffff;

// ---------------------------------------------------------------------------
// Core arithmetic
// ---------------------------------------------------------------------------

/**
 * Q16.16 multiply, sign-correct, round-half-up. Exact within the documented bounds:
 * split the value into an exact hi/lo pair so no intermediate exceeds 2^53 and no
 * bit-shift is applied to an out-of-32-bit value.
 * Bounds: keep |result| < 2^37 and the smaller operand's low term al*b < 2^53.
 */
export function fmul(a: number, b: number): number {
  const ah = Math.floor(a / FP_ONE); // exact; == a>>16 when |a| < 2^31
  const al = a - ah * FP_ONE; // al in [0, 65536), exact even for negative a
  return ah * b + Math.floor((al * b + FP_HALF) / FP_ONE);
}

/**
 * Q16.16 divide, deterministic, round-half-away-from-zero. Repairs the at-most-1-ulp
 * error of the double division using the EXACT integer remainder.
 * Bound: |a| < 2^37 (numerator a*65536 < 2^53). Divisor magnitude unconstrained.
 * b === 0 returns a clamped sentinel; callers must guard so this never fires in step().
 */
export function fdiv(a: number, b: number): number {
  if (b === 0) return a >= 0 ? 0x7fffffff : -0x7fffffff;
  const num = a * FP_ONE; // exact if |a| < 2^37
  let q = Math.floor(num / b);
  let r = num - q * b; // exact remainder
  if (b > 0) {
    while (r < 0) {
      q--;
      r += b;
    }
    while (r >= b) {
      q++;
      r -= b;
    }
    if (2 * r >= b) q++;
  } else {
    while (r > 0) {
      q--;
      r += b;
    }
    while (r <= b) {
      q++;
      r -= b;
    }
    if (2 * r <= b) q++; // round-half toward zero, matching the b>0 branch (fix: was q--)
  }
  return q;
}

/**
 * round(num/den * 65536) as Q16.16, sign-safe, for cross-scale integers where
 * num can reach ~2^51 and den ~2^45 (the enredo intersection parameter t).
 * Splits off the integer part then reduces the denominator so rem*65536 < 2^53.
 * NOTE: uses Math.floor(dR/2) — NOT dR>>1 — because dR can exceed 2^31.
 */
export function fracToQ16(num: number, den: number): number {
  let sgn = 1;
  if (num < 0) {
    num = -num;
    sgn = -sgn;
  }
  if (den < 0) {
    den = -den;
    sgn = -sgn;
  }
  if (den === 0) return 0;
  const ip = Math.floor(num / den); // 0 or 1 for t in [0,1]
  const rem = num - ip * den; // rem in [0, den)
  let dR = den;
  let k = 0;
  while (dR > 0x1fffffffff) {
    // reduce until dR < 2^37
    dR = Math.floor(dR / 2);
    k++;
  }
  const remR = k ? Math.floor(rem / (1 << k)) : rem; // 1<<k <= 512
  let frac = Math.floor((remR * FP_ONE + Math.floor(dR / 2)) / dR);
  // Guard: rounding can push frac to a full unit even though rem < den; keep t strictly
  // below 1.0 for a genuine crossing so the loop vertex never coincides with the head.
  if (ip === 0 && frac >= FP_ONE) frac = FP_ONE - 1;
  return sgn * (ip * FP_ONE + frac);
}

// ---------------------------------------------------------------------------
// Scalar helpers
// ---------------------------------------------------------------------------

export const toFixed = (i: number): number => i * FP_ONE; // int -> Q16.16
export const fromFixedToInt = (f: number): number => Math.floor(f / FP_ONE); // floor to int
export const fixedToFloatForRender = (f: number): number => f / FP_ONE; // VIEW ONLY, never in step()

export const fabs = (a: number): number => (a < 0 ? -a : a);
export const fsign = (a: number): number => (a > 0 ? 1 : a < 0 ? -1 : 0);
export const fclamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
export const fmin = (a: number, b: number): number => (a < b ? a : b);
export const fmax = (a: number, b: number): number => (a > b ? a : b);
/** t is Q16.16 in [0, FP_ONE]; result = a + (b-a)*t */
export const flerp = (a: number, b: number, t: number): number => a + fmul(b - a, t);

// ---------------------------------------------------------------------------
// Cross products / orientation (used by enredo.ts). Operands stay < 2^28 x 2^28
// only when at least one factor is a short segment delta (< 2^22) — see enredo spec.
// ---------------------------------------------------------------------------

export const cross2 = (ax: number, ay: number, bx: number, by: number): number =>
  ax * by - ay * bx;

/** sign of 2*area of triangle p->q->r. q-p short, r-p long => product <= 2^50. */
export const orient = (
  px: number,
  py: number,
  qx: number,
  qy: number,
  rx: number,
  ry: number,
): number => fsign(cross2(qx - px, qy - py, rx - px, ry - py));

// ---------------------------------------------------------------------------
// Squared distance (COLLISION space) — sqrt-free, overflow-free.
// dx,dy reduced by >>8 (Q16.16 -> Q8.8) before squaring; result is in Q16.16 units.
// >>8 is safe because playfield deltas fit in 32 bits (< 2^31).
// ---------------------------------------------------------------------------

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  // Math.floor(/256) instead of `>>8`: exact on a double and safe even if a delta ever
  // reaches 2^31 (a `>>` would ToInt32-wrap it). Matches arithmetic-shift floor otherwise.
  const dx = Math.floor((ax - bx) / 256);
  const dy = Math.floor((ay - by) / 256);
  return dx * dx + dy * dy; // max ~2^41
}

/** true when the two POS points are within Q16.16 radius r. */
export function withinRadius(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): boolean {
  const r8 = r >> 8;
  return dist2(ax, ay, bx, by) < r8 * r8;
}

/** pre-square a Q16.16 radius into COLLISION space (compare directly against dist2). */
export const radiusSq = (r: number): number => {
  const r8 = r >> 8;
  return r8 * r8;
};

// ===========================================================================
// TRIG + ATAN LUTs — built ONCE at module init. Math.sin / Math.atan appear ONLY
// in the two init loops below and NEVER inside a per-tick function.
// Angle unit: brads, full circle = 65536, so (angle & 0xffff) wraps for free.
// ===========================================================================

const SIN_BITS = 12;
const SIN_N = 1 << SIN_BITS; // 4096 entries
const SIN_MASK = SIN_N - 1;
const BRAD2IDX = FP_SHIFT - SIN_BITS; // 4 (right-shift brads -> table index)
const QUARTER = 16384; // 90 degrees in brads

const SIN_LUT = new Int32Array(SIN_N);
// --- MODULE INIT ONLY: Math.sin used here to bake the Q16.16 sine table. ---
for (let i = 0; i < SIN_N; i++) {
  const theta = (i / SIN_N) * 2 * Math.PI;
  SIN_LUT[i] = Math.round(Math.sin(theta) * FP_ONE); // Q16.16 in [-65536, 65536]
}

/** sine of a brad angle -> Q16.16. Nearest-entry lookup, deterministic for any integer. */
export function sinFixed(brads: number): number {
  return SIN_LUT[(brads >>> BRAD2IDX) & SIN_MASK];
}
/** cosine of a brad angle -> Q16.16. Reuses the sine table via the exact quarter-turn offset. */
export function cosFixed(brads: number): number {
  return SIN_LUT[((brads + QUARTER) >>> BRAD2IDX) & SIN_MASK];
}

const ATAN_BITS = 10;
const ATAN_N = 1 << ATAN_BITS; // 1024
const ATAN_LUT = new Int32Array(ATAN_N + 1);
// --- MODULE INIT ONLY: Math.atan used here to bake the first-octant table. ---
for (let k = 0; k <= ATAN_N; k++) {
  const t = k / ATAN_N; // ratio in [0,1]
  ATAN_LUT[k] = Math.round((Math.atan(t) / (2 * Math.PI)) * FP_ONE); // brads in [0, 8192]
}

/** integer round(n/d) for exact integers, |n| < 2^53, d > 0. */
function idivRound(n: number, d: number): number {
  return Math.floor((n + Math.floor(d / 2)) / d);
}

/**
 * Deterministic integer atan2 -> brads in [0, 65536). Works on raw deltas of any
 * consistent unit (uses only the ratio, so no squaring / no overflow).
 * Overflow: ay*ATAN_N <= 2^28 * 2^10 = 2^38 < 2^53.
 */
export function atan2Fixed(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = fabs(x);
  const ay = fabs(y);
  let a: number; // brads in [0, 16384]
  if (ax >= ay) {
    a = ATAN_LUT[idivRound(ay * ATAN_N, ax)]; // 0..8192
  } else {
    a = QUARTER - ATAN_LUT[idivRound(ax * ATAN_N, ay)];
  }
  let ang: number;
  if (x >= 0) ang = y >= 0 ? a : 65536 - a; // Q1 : Q4
  else ang = y >= 0 ? 32768 - a : 32768 + a; // Q2 : Q3
  return ang & FP_MASK;
}

/** signed shortest angular difference (target - current) in [-32768, 32768). */
export function angDiff(target: number, current: number): number {
  let d = (target - current) & FP_MASK; // [0, 65536)
  if (d >= 32768) d -= 65536;
  return d;
}
