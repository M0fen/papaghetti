/**
 * cards.ts — data-driven registry of the 14 EL ENREDO cards + deterministic draft.
 *
 * Every card is a PURE modifier over the `Modifiers` struct: each "+X%" is a pre-baked
 * Q16.16 integer constant (round(x * 65536)); multipliers stack via fmul, caps/flags are
 * last-write. `apply()` mutates Modifiers ONLY — it never reads the clock, never touches
 * floats, and never draws from the gameplay RNG.
 *
 * The draft (offer generation) runs on a SEPARATE, input-count-independent RNG stream
 * seeded purely from (seed0, service, rerollUsed) so RETO DIARIO yields identical offers
 * on every machine regardless of how many gameplay draws happened. Offer count and reroll
 * count derive from the Cosecha meter tier. All draft math is integer / Q16.16.
 */

import { fmul, ONE } from "./fixed.ts";
import { makeRng, nextInt } from "./rng.ts";
import { CHICHARRON_EVERY, COSECHA_MAX, PINA_TUG_MAG } from "./constants.ts";
import { CARD_TIPO } from "./types.ts";
import type { CardId, CardTipo, CosechaLevel, Modifiers, World } from "./types.ts";

// ===========================================================================
// Q16.16 multiplier constants (the frozen table from the contract).
// M_1xx == round(1.xx * 65536); M_0xx == round(0.xx * 65536). No floats leak past here.
// ===========================================================================
const M_112 = 73400; // +12%
const M_115 = 75366; // +15%
const M_120 = 78643; // +20%
const M_125 = 81920; // +25%
const M_130 = 85197; // +30%
const M_135 = 88474; // +35%
const M_150 = 98304; // +50%
const M_200 = 131072; // x2
const M_075 = 49152; // -25%
const M_070 = 45875; // -30% (0.70 => expires 30% faster)
const M_060 = 39322; // -40% (0.60)

/**
 * Resolve the enredo cap fields from the two flags so the outcome depends on WHICH cards
 * were taken, not the draft order. Taking both Lazo Ávido and Corte Limpio cancels out to
 * neutral (the intentional trap in the spec: "se anulan; el pool castiga la codicia distraída").
 * These three fields are owned exclusively by these two cards, so full recompute is safe.
 */
function resolveEnredoCaps(mods: Modifiers): void {
  const a = mods.hasLazoAvido;
  const c = mods.hasCorteLimpio;
  mods.loopCap = a && !c ? 15 : c && !a ? 4 : 10;
  mods.minLoopAreaMul = a && !c ? M_200 : ONE; // area penalty only when Lazo is the live cap
  mods.enredoCutsTail = !(c && !a); // "no cut" buff only when Corte is the live one
}

// ===========================================================================
// Card record type + registry.
// ===========================================================================
export type Card = {
  id: CardId;
  tipo: CardTipo;
  nombre: string;
  texto: string;
  apply: (mods: Modifiers, w: World) => void;
};

// Each apply() below has a comment mapping the design text to the concrete modifier
// writes. `_w` is unused by every current card (all effects live on Modifiers) but the
// signature is fixed by the contract.
export const CARDS: { [K in CardId]: Card } = {
  // 1 [ING] +12% turn speed. -> turnRateMul *= 1.12
  al_dente: {
    id: "al_dente",
    tipo: CARD_TIPO.ING,
    nombre: "Al Dente",
    texto: "+12% velocidad de giro.",
    apply: (mods, _w) => {
      mods.turnRateMul = fmul(mods.turnRateMul, M_112);
    },
  },

  // 2 [REC] +35% score/topping + bigger hitbox.
  //   -> toppingScoreMul *= 1.35 (buff); hitboxRadiusMul *= 1.30 (bigger collect/collide radius).
  hebra_gruesa: {
    id: "hebra_gruesa",
    tipo: CARD_TIPO.REC,
    nombre: "Hebra Gruesa",
    texto: "+35% puntos por topping, pero hitbox más grande.",
    apply: (mods, _w) => {
      mods.toppingScoreMul = fmul(mods.toppingScoreMul, M_135);
      mods.hitboxRadiusMul = fmul(mods.hitboxRadiusMul, M_130);
    },
  },

  // 3 [REC] Very tight turn + minimal hitbox / -25% score/topping.
  //   -> turnRateMul *= 1.30 (tighter radius = quicker steer); hitboxRadiusMul *= 0.60
  //      (minimal hitbox); toppingScoreMul *= 0.75 (debuff).
  cabello_angel: {
    id: "cabello_angel",
    tipo: CARD_TIPO.REC,
    nombre: "Cabello de Ángel",
    texto: "Giro muy cerrado y hitbox mínima, pero -25% puntos por topping.",
    apply: (mods, _w) => {
      mods.turnRateMul = fmul(mods.turnRateMul, M_130);
      mods.hitboxRadiusMul = fmul(mods.hitboxRadiusMul, M_060);
      mods.toppingScoreMul = fmul(mods.toppingScoreMul, M_075);
    },
  },

  // 4 [REC] Infinite boost / CANNOT brake, base speed +20%.
  //   -> infiniteBoost=true; cannotBrake=true (debuff); baseSpeedMul *= 1.20.
  almidon_puro: {
    id: "almidon_puro",
    tipo: CARD_TIPO.REC,
    nombre: "Almidón Puro",
    texto: "Boost infinito y +20% velocidad base, pero no puedes frenar.",
    apply: (mods, _w) => {
      mods.infiniteBoost = true;
      mods.cannotBrake = true;
      mods.baseSpeedMul = fmul(mods.baseSpeedMul, M_120);
    },
  },

  // 5 [REC] LOOP_CAP up to x15 / min loop area doubles.
  lazo_avido: {
    id: "lazo_avido",
    tipo: CARD_TIPO.REC,
    nombre: "Lazo Ávido",
    texto: "Multiplicador de enredo hasta x15, pero el área mínima del lazo se duplica.",
    apply: (mods, _w) => {
      mods.hasLazoAvido = true;
      resolveEnredoCaps(mods);
    },
  },

  // 6 [REC] Enredo no longer cuts tail / LOOP_CAP down to x4.
  corte_limpio: {
    id: "corte_limpio",
    tipo: CARD_TIPO.REC,
    nombre: "Corte Limpio",
    texto: "El enredo ya no corta la cola, pero el multiplicador baja a x4.",
    apply: (mods, _w) => {
      mods.hasCorteLimpio = true;
      resolveEnredoCaps(mods);
    },
  },

  // 7 [ING] The loop area BURNS the oil it encloses. -> enredoBurnsOil=true.
  enredo_ardiente: {
    id: "enredo_ardiente",
    tipo: CARD_TIPO.ING,
    nombre: "Enredo Ardiente",
    texto: "El área del lazo quema el aceite que encierra.",
    apply: (mods, _w) => {
      mods.enredoBurnsOil = true;
    },
  },

  // 8 [REC] Enclosing an obstacle DESTROYS it / each Enredo costs 15% more tail.
  //   -> enredoDestroysObstacles=true (buff); enredoTailCostMul *= 1.15 (debuff).
  lazo_hierro: {
    id: "lazo_hierro",
    tipo: CARD_TIPO.REC,
    nombre: "Lazo de Hierro",
    texto: "Encerrar un obstáculo lo destruye, pero cada enredo cuesta 15% más cola.",
    apply: (mods, _w) => {
      mods.enredoDestroysObstacles = true;
      mods.enredoTailCostMul = fmul(mods.enredoTailCostMul, M_115);
    },
  },

  // 9 [REC] Every 5th topping EXPLODES / toppings expire 30% faster.
  //   -> toppingExplodeEvery=5 (buff cadence); toppingLifeMul *= 0.70 (debuff lifetime).
  chicharron: {
    id: "chicharron",
    tipo: CARD_TIPO.REC,
    nombre: "Chicharrón Crocante",
    texto: "Cada 5º topping explota (limpia aceite + bonus), pero los toppings duran 30% menos.",
    apply: (mods, _w) => {
      mods.toppingExplodeEvery = CHICHARRON_EVERY;
      mods.toppingLifeMul = fmul(mods.toppingLifeMul, M_070);
    },
  },

  // 10 [REC] Pineapple gives +almidón & x1.5 value / each gives an uncontrollable speed tug.
  //   -> pineappleEnabled=true; pineappleValueMul *= 1.5 (buff); speedTugMag=PINA_TUG_MAG (debuff).
  pina_acida: {
    id: "pina_acida",
    tipo: CARD_TIPO.REC,
    nombre: "Piña Ácida",
    texto: "La piña da +almidón y x1.5 valor, pero cada una provoca un tirón incontrolable.",
    apply: (mods, _w) => {
      mods.pineappleEnabled = true;
      mods.pineappleValueMul = fmul(mods.pineappleValueMul, M_150);
      mods.speedTugMag = PINA_TUG_MAG;
    },
  },

  // 11 [REC] Leave a smoke trail that SLOWS THE FORK / smoke blocks YOUR vision (view-only debuff).
  //   -> smokeTrailEnabled=true; forkSmokeSlowMul *= 0.60 (fork moves at 60% inside smoke).
  tocineta: {
    id: "tocineta",
    tipo: CARD_TIPO.REC,
    nombre: "Tocineta Ahumada",
    texto: "Dejas un rastro de humo que frena al Tenedor, pero también te tapa la visión.",
    apply: (mods, _w) => {
      mods.smokeTrailEnabled = true;
      mods.forkSmokeSlowMul = fmul(mods.forkSmokeSlowMul, M_060);
    },
  },

  // 12 [ING] Papa lasts 50% longer. -> papaLifeMul *= 1.5.
  ojo_criolla: {
    id: "ojo_criolla",
    tipo: CARD_TIPO.ING,
    nombre: "Ojo de Criolla",
    texto: "La papa dura 50% más.",
    apply: (mods, _w) => {
      mods.papaLifeMul = fmul(mods.papaLifeMul, M_150);
    },
  },

  // 13 [REC] Papa gives DOUBLE cosecha / papa only spawns INSIDE danger zones.
  //   -> cosechaGainMul *= 2.0 (buff); papaOnlyInDanger=true (debuff spawn placement).
  cosecha_voraz: {
    id: "cosecha_voraz",
    tipo: CARD_TIPO.REC,
    nombre: "Cosecha Voraz",
    texto: "La papa da doble cosecha, pero solo aparece dentro de zonas peligrosas.",
    apply: (mods, _w) => {
      mods.cosechaGainMul = fmul(mods.cosechaGainMul, M_200);
      mods.papaOnlyInDanger = true;
    },
  },

  // 14 [REC] +50% global score / oil grows at double rate.
  //   -> globalScoreMul *= 1.5 (buff); oilGrowthMul *= 2.0 (debuff hazard).
  fuego_alto: {
    id: "fuego_alto",
    tipo: CARD_TIPO.REC,
    nombre: "Fuego Alto",
    texto: "+50% puntaje global, pero el aceite crece al doble.",
    apply: (mods, _w) => {
      mods.globalScoreMul = fmul(mods.globalScoreMul, M_150);
      mods.oilGrowthMul = fmul(mods.oilGrowthMul, M_200);
    },
  },
};

// ===========================================================================
// Canonical registry order. Offer indices index into THIS array (== pool index space).
// Freeze this order: replays / RETO seeds depend on it.
// ===========================================================================
export const CARD_POOL: CardId[] = [
  "al_dente",
  "hebra_gruesa",
  "cabello_angel",
  "almidon_puro",
  "lazo_avido",
  "corte_limpio",
  "enredo_ardiente",
  "lazo_hierro",
  "chicharron",
  "pina_acida",
  "tocineta",
  "ojo_criolla",
  "cosecha_voraz",
  "fuego_alto",
];

/** Registry index of a card id (position within CARD_POOL). */
export function cardIndex(id: CardId): number {
  return CARD_POOL.indexOf(id);
}

/** Card id at a registry / offer index. */
export function cardIdAt(index: number): CardId {
  return CARD_POOL[index];
}

/**
 * Apply the card in draft offer slot `offerSlot` to the world's Modifiers.
 * Resolves the pool index stored in w.offerIds, then runs that card's pure apply().
 */
export function applyCard(w: World, offerSlot: number): void {
  const poolIdx = w.offerIds[offerSlot];
  const id = CARD_POOL[poolIdx];
  CARDS[id].apply(w.mods, w);
}

// ===========================================================================
// Deterministic draft — INDEPENDENT stream. draftSeed mixes only run-header inputs,
// so the offer set is a pure function of (seed0, service, rerollUsed) and never of
// the gameplay draw count.
// ===========================================================================

/**
 * Wang/xorshift integer mix of (seed0, service, rerollUsed) -> u32 draft seed.
 * Math.imul + >>>0 are the intended 32-bit semantics here (this is RNG seeding, not
 * Q16.16 gameplay math). Deterministic and bit-identical across engines.
 */
export function draftSeed(seed0: number, service: number, rerollUsed: number): number {
  let h = seed0 >>> 0;
  h = (h ^ Math.imul(service + 1, 0x9e3779b1)) >>> 0;
  h = (h ^ Math.imul(rerollUsed + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Cosecha tier via integer quarter-split (no division of the compared values):
 * low < 25%, mid < 50%, high < 75%, else max. Inputs are Q16.16 meters; the
 * comparisons scale cosecha by 4 (well within 2^31 for the documented meter range).
 */
export function cosechaLevel(cosecha: number, max: number): CosechaLevel {
  const c4 = cosecha * 4;
  if (c4 < max) return "low";
  if (c4 < max * 2) return "mid";
  if (c4 < max * 3) return "high";
  return "max";
}

/** Draft width/rerolls/guarantee for a cosecha tier. */
export function draftShape(level: CosechaLevel): {
  count: number;
  rerolls: number;
  guaranteedRecMal: boolean;
} {
  if (level === "low") return { count: 3, rerolls: 0, guaranteedRecMal: false };
  if (level === "mid") return { count: 3, rerolls: 1, guaranteedRecMal: false };
  if (level === "high") return { count: 4, rerolls: 0, guaranteedRecMal: false };
  return { count: 4, rerolls: 1, guaranteedRecMal: true };
}

// Module-level draft scratch — reused every call, zero per-draft allocation.
const scratchIdx = new Int8Array(14); // shuffled copy of CARD_POOL indices
const recMalPos = new Int8Array(14); // positions in scratchIdx whose card is REC or MAL

/** True when a card's taxonomy is REC (rojo) or MAL (negro) — the guaranteed-slot subset. */
function isRecMal(id: CardId): boolean {
  const t = CARDS[id].tipo;
  return t === CARD_TIPO.REC || t === CARD_TIPO.MAL;
}

/**
 * Populate w.offerIds / w.offerCount / w.rerollLeft for the current draft.
 * Uses a LOCAL rng seeded from draftSeed (does NOT consume the gameplay RNG), and a
 * partial Fisher-Yates over a copy of the pool indices. When guaranteedRecMal, offer
 * slot 0 is drawn from the REC∪MAL subset first, then the remaining slots shuffle the
 * rest of the pool (distinct cards). Pure & input-count-independent (RETO DIARIO).
 */
export function generateOffer(w: World): void {
  const rng = makeRng(draftSeed(w.seed0, w.service, w.rerollUsed));
  const level = cosechaLevel(w.cosecha, COSECHA_MAX);
  const shape = draftShape(level);
  const n = CARD_POOL.length;

  // Fresh identity permutation into scratch.
  for (let i = 0; i < n; i++) scratchIdx[i] = i;

  let filled = 0;
  if (shape.guaranteedRecMal) {
    // Collect current REC/MAL positions, pick one, swap it into slot 0 (frozen thereafter).
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (isRecMal(CARD_POOL[scratchIdx[i]])) recMalPos[m++] = i;
    }
    const pick = recMalPos[nextInt(rng, m)];
    const t = scratchIdx[0];
    scratchIdx[0] = scratchIdx[pick];
    scratchIdx[pick] = t;
    filled = 1;
  }

  // Partial Fisher-Yates for the remaining offer slots: pick from the unshuffled tail.
  for (let s = filled; s < shape.count; s++) {
    const j = s + nextInt(rng, n - s);
    const t = scratchIdx[s];
    scratchIdx[s] = scratchIdx[j];
    scratchIdx[j] = t;
  }

  for (let s = 0; s < shape.count; s++) w.offerIds[s] = scratchIdx[s];
  w.offerCount = shape.count;
  w.rerollLeft = shape.rerolls;
}
