/**
 * rng.ts — mulberry32 seeded PRNG for EL ENREDO /sim.
 *
 * The generator state is a single uint32 held in a small struct so it lives inside
 * the deterministic world snapshot: (seed0 + inputLog) fully determines every draw.
 * Math.imul + >>> 0 are the INTENDED 32-bit semantics here (unlike Q16.16 math where
 * 32-bit ops are forbidden). No Math.random, no wall-clock — ever.
 *
 * Two streams use this module:
 *   1. gameplay stream — the World itself is the RngState (World.rng is the field).
 *   2. draft stream    — cards.ts builds a fresh {rng} seeded from (runSeed, service),
 *      independent of gameplay draw count so offers stay input-independent (RETO DIARIO).
 */

/** The entire generator state. World satisfies this structurally via its `rng` field. */
export type RngState = { rng: number };

/** Build an independent generator from a 32-bit seed. */
export function makeRng(seed: number): RngState {
  return { rng: seed >>> 0 };
}

/** Advance the state and return the next uint32. */
export function nextU32(state: RngState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Q16.16 fraction in [0, 1): the top 16 bits of a fresh uint32. */
export function nextFixed01(state: RngState): number {
  return nextU32(state) >>> 16;
}

/**
 * Unbiased integer in [0, n) via Lemire rejection (kills modulo bias in offers/spawns).
 * Draw count is a pure function of state; keep n small and callers bounded.
 */
export function nextInt(state: RngState, n: number): number {
  if (n <= 1) return 0;
  const threshold = 0x100000000 % n; // 2^32 mod n
  let r: number;
  do {
    r = nextU32(state);
  } while (r < threshold);
  return r % n;
}

/** Inclusive integer range [lo, hi]. */
export function nextRange(state: RngState, lo: number, hi: number): number {
  return lo + nextInt(state, hi - lo + 1);
}
