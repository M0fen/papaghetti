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
import { CARD_TIPO, CARD_TAG_ORDER } from "./types.ts";
import type { CardId, CardRareza, CardTipo, CardTag, CosechaLevel, Modifiers, World } from "./types.ts";
import { initModifiers } from "./world.ts";

// ===========================================================================
// Q16.16 multiplier constants (the frozen table from the contract).
// M_1xx == round(1.xx * 65536); M_0xx == round(0.xx * 65536). No floats leak past here.
// ===========================================================================
const M_110 = 72090; // +10%
const M_112 = 73400; // +12%
const M_115 = 75366; // +15%
const M_120 = 78643; // +20%
const M_125 = 81920; // +25%
const M_130 = 85197; // +30%
const M_133 = 87163; // +33%
const M_135 = 88474; // +35%
const M_140 = 91750; // +40%
const M_150 = 98304; // +50%
const M_160 = 104858; // +60%
const M_175 = 114688; // +75%
const M_200 = 131072; // x2
const M_250 = 163840; // x2.5
const M_075 = 49152; // -25%
const M_070 = 45875; // -30% (0.70 => expires 30% faster)
const M_060 = 39322; // -40% (0.60)
const M_090 = 58982; // -10% (0.90)

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

  // ======================= F1 EXPANSION: COMUNES (ING) =======================
  mantequilla: {
    id: "mantequilla",
    tipo: CARD_TIPO.ING,
    nombre: "Mantequilla",
    texto: "+10% velocidad base.",
    apply: (mods, _w) => {
      mods.baseSpeedMul = fmul(mods.baseSpeedMul, M_110);
    },
  },
  queso_curado: {
    id: "queso_curado",
    tipo: CARD_TIPO.ING,
    nombre: "Queso Curado",
    texto: "+20% puntos por topping.",
    apply: (mods, _w) => {
      mods.toppingScoreMul = fmul(mods.toppingScoreMul, M_120);
    },
  },
  caldo_largo: {
    id: "caldo_largo",
    tipo: CARD_TIPO.ING,
    nombre: "Caldo Largo",
    texto: "+1 de crecimiento por topping.",
    apply: (mods, _w) => {
      mods.growPerTopBonus += 1;
    },
  },
  semola_fina: {
    id: "semola_fina",
    tipo: CARD_TIPO.ING,
    nombre: "Sémola Fina",
    texto: "+10% giro y hitbox 10% menor.",
    apply: (mods, _w) => {
      mods.turnRateMul = fmul(mods.turnRateMul, M_110);
      mods.hitboxRadiusMul = fmul(mods.hitboxRadiusMul, M_090);
    },
  },
  perejil_fresco: {
    id: "perejil_fresco",
    tipo: CARD_TIPO.ING,
    nombre: "Perejil Fresco",
    texto: "La papa dura 40% más y aparece un tercio más seguido.",
    apply: (mods, _w) => {
      mods.papaLifeMul = fmul(mods.papaLifeMul, M_140);
      mods.papaRateMul = fmul(mods.papaRateMul, M_133);
    },
  },
  aceite_oliva: {
    id: "aceite_oliva",
    tipo: CARD_TIPO.ING,
    nombre: "Aceite de Oliva",
    texto: "La grasa crece 30% más lento.",
    apply: (mods, _w) => {
      mods.oilGrowthMul = fmul(mods.oilGrowthMul, M_070);
    },
  },

  // ======================== F1 EXPANSION: RARAS (REC) ========================
  doble_racion: {
    id: "doble_racion",
    tipo: CARD_TIPO.REC,
    nombre: "Doble Ración",
    texto: "+3 de crecimiento por topping, pero los toppings duran 25% menos.",
    apply: (mods, _w) => {
      mods.growPerTopBonus += 3;
      mods.toppingLifeMul = fmul(mods.toppingLifeMul, M_075);
    },
  },
  reduccion: {
    id: "reduccion",
    tipo: CARD_TIPO.REC,
    nombre: "Reducción",
    texto: "Cap del enredo +5, pero el área mínima del lazo crece 50%.",
    apply: (mods, _w) => {
      mods.loopCap += 5;
      mods.minLoopAreaMul = fmul(mods.minLoopAreaMul, M_150);
    },
  },
  sofrito: {
    id: "sofrito",
    tipo: CARD_TIPO.REC,
    nombre: "Sofrito",
    texto: "El enredo alimenta el multiplicador al doble y su tope sube, pero el multiplicador DECAE.",
    apply: (mods, _w) => {
      mods.enredoMultStepMul = fmul(mods.enredoMultStepMul, M_200);
      mods.multCapBonus += 2 * ONE;
      mods.multDecayPerTick += 65; // ~0.06/s — juega en cadena o piérdelo
    },
  },
  hilo_dorado: {
    id: "hilo_dorado",
    tipo: CARD_TIPO.REC,
    nombre: "Hilo Dorado",
    texto: "Cada 8º topping suelta una papa criolla donde murió.",
    apply: (mods, _w) => {
      mods.papaOnEatEvery = 8;
    },
  },
  enredo_doble: {
    id: "enredo_doble",
    tipo: CARD_TIPO.REC,
    nombre: "Enredo Doble",
    texto: "Un enredo encadenado (en 5s del anterior) alimenta el multiplicador al doble.",
    apply: (mods, _w) => {
      mods.enredoChainMul = fmul(mods.enredoChainMul, M_200);
    },
  },
  bechamel: {
    id: "bechamel",
    tipo: CARD_TIPO.REC,
    nombre: "Bechamel",
    texto: "Boostear da +2 puntos por tick, pero drena 50% más almidón.",
    apply: (mods, _w) => {
      mods.boostScorePerTick += 2;
      mods.boostDrainMul = fmul(mods.boostDrainMul, M_150);
    },
  },

  // ================== F1 EXPANSION: PACTOS MAL (épica) =======================
  // Debuff fuerte + upside enorme: el combustible de las builds rotas.
  a_ciegas: {
    id: "a_ciegas",
    tipo: CARD_TIPO.MAL,
    nombre: "A Ciegas",
    texto: "+75% puntaje global, pero tu visión se reduce a la luz de la sartén.",
    apply: (mods, _w) => {
      mods.visionNarrow = true; // view-only fog outside a head radius
      mods.globalScoreMul = fmul(mods.globalScoreMul, M_175);
    },
  },
  olla_presion: {
    id: "olla_presion",
    tipo: CARD_TIPO.MAL,
    nombre: "Olla a Presión",
    texto: "+60% puntaje y quemar grasa paga 500, pero la grasa crece x2.5 y hay un charco extra.",
    apply: (mods, _w) => {
      mods.oilGrowthMul = fmul(mods.oilGrowthMul, M_250);
      mods.oilExtraCount += 1;
      mods.globalScoreMul = fmul(mods.globalScoreMul, M_160);
      mods.burnOilBonus += 500;
    },
  },
  hambre_de_papa: {
    id: "hambre_de_papa",
    tipo: CARD_TIPO.MAL,
    nombre: "Hambre de Papa",
    texto: "Los toppings ya NO dan almidón; la papa da +30 de almidón, doble cosecha y dura 50% más.",
    apply: (mods, _w) => {
      mods.toppingsGiveAlmidon = false;
      mods.papaAlmidonGain += 30 * ONE;
      mods.papaScoreBonus += 500; // la papa es ORO: paga puntos (× mult) — el motor de LA HUERTA
      mods.cosechaGainMul = fmul(mods.cosechaGainMul, M_200);
      mods.papaLifeMul = fmul(mods.papaLifeMul, M_150);
    },
  },
  duelo: {
    id: "duelo",
    tipo: CARD_TIPO.MAL,
    nombre: "Duelo",
    texto: "El jefe acecha SIEMPRE, pero bailarle cerca paga puntos y enredarlo paga 2000 × multiplicador.",
    apply: (mods, _w) => {
      mods.forkAlways = true;
      mods.forkBlockBonus += 2000;
      mods.forkBlockPapas += 2;
      mods.forkNearScorePerTick += 8; // danger-pay: la presencia del jefe gotea puntos
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
  // F1 expansion — APPENDED ONLY (existing indices are frozen: replays/RETO depend on them).
  "mantequilla",
  "queso_curado",
  "caldo_largo",
  "semola_fina",
  "perejil_fresco",
  "aceite_oliva",
  "doble_racion",
  "reduccion",
  "sofrito",
  "hilo_dorado",
  "enredo_doble",
  "bechamel",
  "a_ciegas",
  "olla_presion",
  "hambre_de_papa",
  "duelo",
];

/** Registry index of a card id (position within CARD_POOL). */
export function cardIndex(id: CardId): number {
  return CARD_POOL.indexOf(id);
}

/** Card id at a registry / offer index. */
export function cardIdAt(index: number): CardId {
  return CARD_POOL[index];
}

// ===========================================================================
// TAGS + SYNERGIES (TFT-style, the "build"). A card carries 1-2 tags; having enough of a tag
// activates a tier that layers extra mods on top. Everything is PURE: rebuildMods() resets mods
// and re-derives the whole build (cards + synergies) from w.pickedCards, so the result never
// depends on pick order and stays deterministic (anti-cheat safe).
// ===========================================================================
export const CARD_TAGS: Record<CardId, CardTag[]> = {
  al_dente: ["VELOZ"],
  hebra_gruesa: ["GRASA"],
  cabello_angel: ["VELOZ"],
  almidon_puro: ["GRASA", "VELOZ"],
  lazo_avido: ["LAZO"],
  corte_limpio: ["LAZO"],
  enredo_ardiente: ["FUEGO", "LAZO"],
  lazo_hierro: ["LAZO"],
  chicharron: ["FUEGO", "GRASA"],
  pina_acida: ["COSECHA"],
  tocineta: ["GRASA", "FUEGO"],
  ojo_criolla: ["COSECHA"],
  cosecha_voraz: ["COSECHA"],
  fuego_alto: ["FUEGO"],
  // F1 expansion
  mantequilla: ["VELOZ", "GRASA"],
  queso_curado: ["GRASA"],
  caldo_largo: ["GRASA"],
  semola_fina: ["VELOZ"],
  perejil_fresco: ["COSECHA"],
  aceite_oliva: ["FUEGO"],
  doble_racion: ["GRASA"],
  reduccion: ["LAZO"],
  sofrito: ["LAZO", "FUEGO"],
  hilo_dorado: ["COSECHA"],
  enredo_doble: ["LAZO"],
  bechamel: ["VELOZ", "GRASA"],
  a_ciegas: ["VELOZ"],
  olla_presion: ["FUEGO"],
  hambre_de_papa: ["COSECHA"],
  duelo: ["LAZO"],
};

// Rarity biases the draft offer (weights per cosecha tier live in generateOffer).
export const CARD_RAREZAS: Record<CardId, CardRareza> = {
  al_dente: "COMUN",
  hebra_gruesa: "COMUN",
  ojo_criolla: "COMUN",
  mantequilla: "COMUN",
  queso_curado: "COMUN",
  caldo_largo: "COMUN",
  semola_fina: "COMUN",
  perejil_fresco: "COMUN",
  aceite_oliva: "COMUN",
  cabello_angel: "RARA",
  lazo_avido: "RARA",
  corte_limpio: "RARA",
  enredo_ardiente: "RARA",
  chicharron: "RARA",
  pina_acida: "RARA",
  tocineta: "RARA",
  cosecha_voraz: "RARA",
  fuego_alto: "RARA",
  doble_racion: "RARA",
  reduccion: "RARA",
  sofrito: "RARA",
  hilo_dorado: "RARA",
  enredo_doble: "RARA",
  bechamel: "RARA",
  almidon_puro: "EPICA",
  lazo_hierro: "EPICA",
  a_ciegas: "EPICA",
  olla_presion: "EPICA",
  hambre_de_papa: "EPICA",
  duelo: "EPICA",
};

// Flag/cadence cards are UNIQUE: once taken they leave the offer pool (repeat picks were dead choices).
export const CARD_UNIQUE: Record<CardId, boolean> = {
  al_dente: false,
  hebra_gruesa: false,
  cabello_angel: false,
  almidon_puro: true,
  lazo_avido: true,
  corte_limpio: true,
  enredo_ardiente: true,
  lazo_hierro: true,
  chicharron: true,
  pina_acida: true,
  tocineta: true,
  ojo_criolla: false,
  cosecha_voraz: true,
  fuego_alto: false,
  mantequilla: false,
  queso_curado: false,
  caldo_largo: false,
  semola_fina: false,
  perejil_fresco: false,
  aceite_oliva: false,
  doble_racion: false,
  reduccion: false,
  sofrito: true,
  hilo_dorado: true,
  enredo_doble: true,
  bechamel: true,
  a_ciegas: true,
  olla_presion: true,
  hambre_de_papa: true,
  duelo: true,
};

// Tier thresholds: >=2 tags = tier 1, >=3 = tier 2 (tier 2 also keeps the tier-1 effect).
const SYN_T1 = 2;
const SYN_T2 = 3;
function tagTier(count: number): number {
  return count >= SYN_T2 ? 2 : count >= SYN_T1 ? 1 : 0;
}

/** Layer synergy effects onto mods from per-tag counts; record the active tier per tag for the HUD. */
function applySynergies(mods: Modifiers, counts: Int32Array, tierOut: Int8Array): void {
  for (let i = 0; i < CARD_TAG_ORDER.length; i++) {
    const tier = tagTier(counts[i]);
    tierOut[i] = tier;
    if (tier === 0) continue;
    switch (CARD_TAG_ORDER[i]) {
      case "FUEGO": // quema
        mods.enredoBurnsOil = true;
        if (tier >= 2) mods.globalScoreMul = fmul(mods.globalScoreMul, M_125);
        break;
      case "GRASA": // cuerpo / empuje
        mods.toppingScoreMul = fmul(mods.toppingScoreMul, M_120);
        if (tier >= 2) mods.baseSpeedMul = fmul(mods.baseSpeedMul, M_112);
        break;
      case "LAZO": // enredo
        mods.loopCap += 4;
        if (tier >= 2) mods.enredoCutsTail = false;
        break;
      case "VELOZ": // maniobra
        mods.turnRateMul = fmul(mods.turnRateMul, M_115);
        if (tier >= 2) mods.turnRateMul = fmul(mods.turnRateMul, M_115);
        break;
      case "COSECHA": // papa / economía
        mods.cosechaGainMul = fmul(mods.cosechaGainMul, M_135);
        if (tier >= 2) mods.papaLifeMul = fmul(mods.papaLifeMul, M_160);
        break;
      default:
        break;
    }
  }
}

// ===========================================================================
// TRANSFORMATIVE COMBOS + THE 5 DESIGNED "BROKEN BUILDS" (F1 — the clip fuel).
//
// Balance philosophy is INVERTED (Vampire-Survivors model): individually-controlled cards that in
// certain COMBINATIONS break the screen — and the game CELEBRATES it. These are the ~5 intended
// broken builds, each reachable by a different path, each visually distinct. DO NOT flatten them,
// DO NOT announce them in the UI (the player discovers them):
//
//  1. LA HUERTA (COSECHA): hambre_de_papa + cosecha_voraz (+perejil_fresco, hilo_dorado, ojo_criolla)
//     → C1 fires: papa everywhere, infinite draft economy. Screen fills with glowing criollas.
//  2. COCINA INFERNAL (FUEGO, glass cannon): olla_presion + fuego_alto (+enredo_ardiente, sofrito)
//     → C2 fires: you farm the very grease that hunts you; burn zones become score fields of embers.
//  3. FLAMBÉ PERPETUO (VELOZ): almidon_puro + bechamel (+cabello_angel, semola_fina, mantequilla)
//     → C3 fires: infinite boost that SCORES per tick. Perpetual speedlines; pure velocity.
//  4. CADENA PERFECTA (LAZO): enredo_doble + lazo_avido (+sofrito, reduccion)
//     → C4 fires: chained enredos feed the mult ×4 with a raised cap; sofrito punishes stopping.
//  5. EL FIDEO INFINITO (GRASA — the most Snake of all): caldo_largo + doble_racion (+hebra_gruesa,
//     queso_curado) → C5 fires: LENGTH multiplies score. The screen fills with noodle.
//
// SNAKE-DNA AUDIT (móvil central): none of these erase eat-to-grow, the body, or the tail's
// tension — every build still reads as "la culebrita, pero mejor". a_ciegas is an input handicap
// (view fog), never a sim change. Keep it that way for any future card.
// ===========================================================================

/** True if the build (picked set) contains the card id. Pure over the set. */
function makeHas(w: World): (id: CardId) => boolean {
  return (id: CardId): boolean => {
    const idx = CARD_POOL.indexOf(id);
    for (let i = 0; i < w.pickedCount; i++) if (w.pickedCards[i] === idx) return true;
    return false;
  };
}

/**
 * Layer TRANSFORMATIVE pair-combos onto mods. Pure function of the picked SET (order-independent
 * by construction — it runs after all card applies, keyed only on membership).
 */
function applyCombos(mods: Modifiers, has: (id: CardId) => boolean): void {
  // C1 LA HUERTA: papa fever — twice the papa, twice the papa-fuel, twice the papa-gold.
  if (has("cosecha_voraz") && has("hambre_de_papa")) {
    mods.papaRateMul = fmul(mods.papaRateMul, M_200);
    mods.papaAlmidonGain = fmul(mods.papaAlmidonGain, M_200);
    mods.papaScoreBonus *= 2;
  }
  // C2 COCINA INFERNAL: the burn field itself scores while you ride it.
  if (has("fuego_alto") && has("olla_presion")) {
    mods.burnScorePerTick += 30;
  }
  // C3 FLAMBÉ PERPETUO: boosting becomes the scoring engine.
  if (has("almidon_puro") && has("bechamel")) {
    mods.boostScorePerTick += 4; // 2 (bechamel) + 4 = 6/tick
    mods.baseSpeedMul = fmul(mods.baseSpeedMul, M_110);
  }
  // C4 CADENA PERFECTA: chains feed ×4.
  if (has("enredo_doble") && has("lazo_avido")) {
    mods.enredoChainMul = fmul(mods.enredoChainMul, M_200);
  }
  // C5 EL FIDEO INFINITO: +5% topping score per 25 body nodes (clamped in step).
  if (has("caldo_largo") && has("doble_racion")) {
    mods.scorePerLenMul = 3277;
  }
}

// Scratch tag-count buffer — rebuildMods runs only on a draft pick, never per tick.
const _tagCounts = new Int32Array(CARD_TAG_ORDER.length);

/** Rebuild w.mods from scratch: neutral → every picked card's apply() → combos → synergies. Pure over the build. */
export function rebuildMods(w: World): void {
  Object.assign(w.mods, initModifiers());
  _tagCounts.fill(0);
  for (let i = 0; i < w.pickedCount; i++) {
    const id = CARD_POOL[w.pickedCards[i]];
    CARDS[id].apply(w.mods, w);
    const tags = CARD_TAGS[id];
    for (let t = 0; t < tags.length; t++) {
      const idx = CARD_TAG_ORDER.indexOf(tags[t]);
      if (idx >= 0) _tagCounts[idx]++;
    }
  }
  applyCombos(w.mods, makeHas(w));
  applySynergies(w.mods, _tagCounts, w.synergyTier);
}

/**
 * Take the card in draft offer slot `offerSlot`: append it to the build (each card rides a body
 * segment) and REBUILD mods (cards + synergies). Replaces the old direct-apply.
 */
export function pickCard(w: World, offerSlot: number): void {
  const poolIdx = w.offerIds[offerSlot];
  if (w.pickedCount < w.pickedCards.length) {
    w.pickedCards[w.pickedCount] = poolIdx;
    w.pickedCount++;
  }
  rebuildMods(w);
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
const eligibleIdx = new Int8Array(32); // candidate pool indices for the current slot
const eligibleW = new Int32Array(32); // per-candidate rarity weight
const offeredMark = new Int8Array(32); // 1 = already placed in this offer

/** True when a card's taxonomy is REC (rojo) or MAL (negro) — the guaranteed-slot subset. */
function isRecMal(id: CardId): boolean {
  const t = CARDS[id].tipo;
  return t === CARD_TIPO.REC || t === CARD_TIPO.MAL;
}

// Rarity weight per cosecha tier (comun / rara / epica). Higher cosecha → better odds.
const RARITY_W: Record<CosechaLevel, [number, number, number]> = {
  low: [100, 30, 7],
  mid: [100, 38, 12],
  high: [100, 48, 18],
  max: [100, 56, 26],
};

function rarityWeight(id: CardId, level: CosechaLevel): number {
  const r = CARD_RAREZAS[id];
  const wts = RARITY_W[level];
  return r === "COMUN" ? wts[0] : r === "RARA" ? wts[1] : wts[2];
}

/** True if pool index i may be offered: not banished, not already offered, not a taken UNIQUE. */
function isEligible(w: World, i: number): boolean {
  if (w.banished[i] !== 0) return false;
  if (offeredMark[i] !== 0) return false;
  const id = CARD_POOL[i];
  if (CARD_UNIQUE[id]) {
    for (let p = 0; p < w.pickedCount; p++) if (w.pickedCards[p] === i) return false;
  }
  return true;
}

/**
 * Populate w.offerIds / w.offerCount / w.rerollLeft for the current draft.
 * LOCAL rng from draftSeed (never the gameplay stream). RARITY-WEIGHTED sampling without
 * replacement (weights scale with the cosecha tier), honouring: BANISHED cards never appear,
 * UNIQUE cards already taken never re-appear, a LOCKED card takes slot 0 (consumed), and the
 * max-tier guaranteedRecMal slot draws from the REC∪MAL subset. Deterministic & pure.
 */
export function generateOffer(w: World): void {
  const rng = makeRng(draftSeed(w.seed0, w.service, w.rerollUsed));
  const level = cosechaLevel(w.cosecha, COSECHA_MAX);
  const shape = draftShape(level);
  const n = CARD_POOL.length;
  offeredMark.fill(0);

  let filled = 0;

  // 0. LOCKED card (draft economy): goes straight into slot 0, lock consumed (one draft).
  if (w.lockedCard >= 0) {
    const li = w.lockedCard;
    w.lockedCard = -1;
    if (isEligible(w, li)) {
      w.offerIds[0] = li;
      offeredMark[li] = 1;
      filled = 1;
    }
  }

  // Weighted draw for one slot over a filtered candidate set; returns pool idx or -1.
  const draw = (recMalOnly: boolean): number => {
    let m = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      if (!isEligible(w, i)) continue;
      const id = CARD_POOL[i];
      if (recMalOnly && !isRecMal(id)) continue;
      const wt = rarityWeight(id, level);
      eligibleIdx[m] = i;
      eligibleW[m] = wt;
      total += wt;
      m++;
    }
    if (m === 0) return -1;
    let r = nextInt(rng, total);
    for (let k = 0; k < m; k++) {
      r -= eligibleW[k];
      if (r < 0) return eligibleIdx[k];
    }
    return eligibleIdx[m - 1];
  };

  // 1. Guaranteed REC/MAL slot at max tier (first non-locked slot).
  if (shape.guaranteedRecMal && filled < shape.count) {
    const pick = draw(true);
    if (pick >= 0) {
      w.offerIds[filled] = pick;
      offeredMark[pick] = 1;
      filled++;
    }
  }

  // 2. Remaining slots: rarity-weighted over the whole eligible pool.
  while (filled < shape.count) {
    const pick = draw(false);
    if (pick < 0) break; // pool exhausted (heavy banish/unique late-run) — offer fewer
    w.offerIds[filled] = pick;
    offeredMark[pick] = 1;
    filled++;
  }

  w.offerCount = filled > 0 ? filled : 0;
  w.rerollLeft = shape.rerolls;
}
