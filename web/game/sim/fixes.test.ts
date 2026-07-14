/**
 * fixes.test.ts — regression tests locking in the review-fix corrections:
 *  - fdiv() sign symmetry / correct rounding for negative divisors.
 *  - Lazo Ávido / Corte Limpio cap resolution is ORDER-INDEPENDENT (they cancel out).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fdiv } from "./fixed.ts";
import { initModifiers } from "./world.ts";
import { CARDS } from "./cards.ts";
import type { World } from "./types.ts";

test("fdiv is sign-symmetric (round-half toward zero on both branches)", () => {
  const pairs: [number, number][] = [
    [1, 3],
    [2, 3],
    [7, 4],
    [5, 2],
    [123, 7],
    [1000, 999],
    [65536, 3],
  ];
  for (const [a, b] of pairs) {
    assert.equal(fdiv(a, -b), -fdiv(a, b), `fdiv(${a},-${b}) should equal -fdiv(${a},${b})`);
    assert.equal(fdiv(-a, b), -fdiv(a, b), `fdiv(-${a},${b}) should equal -fdiv(${a},${b})`);
    assert.equal(fdiv(-a, -b), fdiv(a, b), `fdiv(-${a},-${b}) should equal fdiv(${a},${b})`);
  }
  // Exact known values (Q16.16): 1/3 -> round(0.3333*65536)=21845.
  assert.equal(fdiv(1, 3), 21845);
  assert.equal(fdiv(1, -3), -21845);
});

test("Lazo Ávido + Corte Limpio cap is order-independent", () => {
  const w = null as unknown as World; // both cards ignore the world arg
  const lazo = CARDS.lazo_avido;
  const corte = CARDS.corte_limpio;

  // Order A: lazo then corte
  const a = initModifiers();
  lazo.apply(a, w);
  corte.apply(a, w);

  // Order B: corte then lazo
  const b = initModifiers();
  corte.apply(b, w);
  lazo.apply(b, w);

  assert.equal(a.loopCap, b.loopCap, "loopCap must not depend on draft order");
  assert.equal(a.minLoopAreaMul, b.minLoopAreaMul, "minLoopAreaMul must not depend on order");
  assert.equal(a.enredoCutsTail, b.enredoCutsTail, "enredoCutsTail must not depend on order");

  // Taking BOTH cancels to neutral (the intentional trap): cap 10, no area penalty, cut on.
  assert.equal(a.loopCap, 10);
  assert.equal(a.minLoopAreaMul, 65536); // ONE
  assert.equal(a.enredoCutsTail, true);

  // Each alone keeps its own effect.
  const onlyLazo = initModifiers();
  lazo.apply(onlyLazo, w);
  assert.equal(onlyLazo.loopCap, 15);

  const onlyCorte = initModifiers();
  corte.apply(onlyCorte, w);
  assert.equal(onlyCorte.loopCap, 4);
  assert.equal(onlyCorte.enredoCutsTail, false);
});
