/**
 * types.ts — the shared type layer for EL ENREDO /sim.
 *
 * Erasable-only TypeScript: NO enum / namespace / decorators. String/number "kinds"
 * are `const OBJ = {...} as const` value objects paired with `typeof`-derived union
 * types (the classic enum replacement). Pools in the World snapshot are Structure-of-
 * Arrays typed arrays (serialise trivially, zero per-tick allocation); the single-entity
 * record types (Topping, PapaFragment, Obstacle) describe one logical entity for
 * selectors / enredo scratch, while Pedido and Fork are inline singletons on the World.
 *
 * Everything in World is authoritative snapshot state; no floats, no derived view caches.
 */

// ===========================================================================
// Kind const-objects + union types
// ===========================================================================

export const MODE = { RUN: "RUN", RUSH: "RUSH", RETO: "RETO" } as const;
export type ModeName = (typeof MODE)[keyof typeof MODE];

export const PHASE = { PLAY: "PLAY", DRAFT: "DRAFT", DEAD: "DEAD" } as const;
export type PhaseName = (typeof PHASE)[keyof typeof PHASE];

export const FORK_STATE = { ENTER: "ENTER", CHASE: "CHASE", BLOCKED: "BLOCKED" } as const;
export type ForkStateName = (typeof FORK_STATE)[keyof typeof FORK_STATE];

// Obstacle type codes — stored as Int8 in the pool (never strings in pools).
export const OBS = { OIL: 0, WALL: 1, KNIFE: 2, SAUCE: 3, WHISK: 4 } as const;
export type ObstacleTypeName = keyof typeof OBS;
export type ObstacleTypeCode = (typeof OBS)[keyof typeof OBS];

// Obstacle flag bits (obsFlags Int8).
export const OBS_FLAG = { ACTIVE: 1, DESTROYED: 2, LETHAL: 4 } as const;

// Topping ingredient codes — stored as Int8 in the pool.
export const TOPPING = {
  SALSA: 0,
  QUESO: 1,
  CEBOLLA: 2,
  MAIZ: 3,
  RIZADAS: 4,
  PINA: 5,
  HUEVO: 6,
  CHICHARRON: 7,
} as const;
export type ToppingName = keyof typeof TOPPING;
export type ToppingCode = (typeof TOPPING)[keyof typeof TOPPING];

// Topping flag bits (topFlags Int8).
export const TOP_FLAG = { ALIVE: 1, PINA: 2, EXPLOSIVE: 4 } as const;

// Papa kinds — stored as Int8 in the pool.
export const PAPA = { CRIOLLA: 0, FRANCESA: 1 } as const;
export type PapaName = keyof typeof PAPA;
export type PapaCode = (typeof PAPA)[keyof typeof PAPA];

// Card taxonomy.
export const CARD_TIPO = { ING: "ING", REC: "REC", MAL: "MAL" } as const;
export type CardTipo = (typeof CARD_TIPO)[keyof typeof CARD_TIPO];

// Card rarity — biases the draft offer (weights scale with the cosecha tier). MAL pacts are épica.
export const CARD_RAREZA = { COMUN: "COMUN", RARA: "RARA", EPICA: "EPICA" } as const;
export type CardRareza = (typeof CARD_RAREZA)[keyof typeof CARD_RAREZA];

// Card TAGS drive TFT-style synergies: having N cards of a tag activates a tier. A card can carry
// 1-2 tags. FUEGO=quema, GRASA=cuerpo/boost, LAZO=enredo, VELOZ=maniobra, COSECHA=papa/economía.
export const CARD_TAG = {
  FUEGO: "FUEGO",
  GRASA: "GRASA",
  LAZO: "LAZO",
  VELOZ: "VELOZ",
  COSECHA: "COSECHA",
} as const;
export type CardTag = (typeof CARD_TAG)[keyof typeof CARD_TAG];
export const CARD_TAG_ORDER: readonly CardTag[] = ["FUEGO", "GRASA", "LAZO", "VELOZ", "COSECHA"];

export type CardId =
  | "al_dente"
  | "hebra_gruesa"
  | "cabello_angel"
  | "almidon_puro"
  | "lazo_avido"
  | "corte_limpio"
  | "enredo_ardiente"
  | "lazo_hierro"
  | "chicharron"
  | "pina_acida"
  | "tocineta"
  | "ojo_criolla"
  | "cosecha_voraz"
  | "fuego_alto"
  // --- expansion (F1): comunes ---
  | "mantequilla"
  | "queso_curado"
  | "caldo_largo"
  | "semola_fina"
  | "perejil_fresco"
  | "aceite_oliva"
  // --- expansion (F1): raras ---
  | "doble_racion"
  | "reduccion"
  | "sofrito"
  | "hilo_dorado"
  | "enredo_doble"
  | "bechamel"
  // --- expansion (F1): pactos MAL (épica) ---
  | "a_ciegas"
  | "olla_presion"
  | "hambre_de_papa"
  | "duelo";

// Cosecha tier -> draft width.
export type CosechaLevel = "low" | "mid" | "high" | "max";

// ===========================================================================
// Modifiers — the card-effect struct (part of the snapshot; mutated once on pick).
// Multiplier fields default to ONE (65536) and stack via fmul. Flags default neutral.
// ===========================================================================

export type Modifiers = {
  // steering / movement
  turnRateMul: number; // Q16.16 * TURN_RATE
  baseSpeedMul: number; // Q16.16 * base head speed
  hitboxRadiusMul: number; // Q16.16 * collect/collide radius
  speedTugMag: number; // POS lateral tug magnitude (0 = none)

  // boost
  infiniteBoost: boolean; // boost ignores almidón drain
  cannotBrake: boolean; // speed floored at base

  // scoring
  toppingScoreMul: number; // Q16.16 * per-topping score
  globalScoreMul: number; // Q16.16 * final score

  // enredo
  loopCap: number; // int enclosed-count cap
  minLoopAreaMul: number; // Q16.16 * MIN_LOOP_AREA gate
  // Cap intents as flags so the Lazo Ávido / Corte Limpio interaction is ORDER-INDEPENDENT:
  // loopCap/minLoopAreaMul/enredoCutsTail are resolved from these, so taking BOTH cancels
  // out to neutral (the "se anulan" trap in the spec) regardless of draft order.
  hasLazoAvido: boolean;
  hasCorteLimpio: boolean;
  enredoCutsTail: boolean; // default TRUE
  enredoBurnsOil: boolean; // enclosed oil extinguished
  enredoDestroysObstacles: boolean; // enclosed obstacle destroyed
  enredoTailCostMul: number; // Q16.16 * cut length

  // toppings
  toppingLifeMul: number; // Q16.16 * lifetime ticks
  toppingExplodeEvery: number; // int; 0 = off

  // pineapple
  pineappleEnabled: boolean;
  pineappleValueMul: number; // Q16.16

  // fork / smoke
  smokeTrailEnabled: boolean;
  forkSmokeSlowMul: number; // Q16.16 * fork speed in smoke

  // papa / cosecha
  papaLifeMul: number; // Q16.16
  cosechaGainMul: number; // Q16.16
  papaOnlyInDanger: boolean;

  // oil
  oilGrowthMul: number; // Q16.16

  // --- F1 expansion: the fields the BUILD system plays with -----------------
  // growth / body (Snake DNA: length is a resource)
  growPerTopBonus: number; // int, extra nodes per topping (on top of GROW_PER_TOP)
  scorePerLenMul: number; // Q16.16 extra topping-score per 25 body nodes (0 = off)
  // almidón economy (Hambre de Papa flips the fuel source)
  toppingsGiveAlmidon: boolean; // default true
  papaAlmidonGain: number; // Q16.16 almidón per papa collected (0 = none)
  // papa cadence
  papaRateMul: number; // Q16.16 multiplier on papa spawn RATE (2.0 = twice as often)
  papaOnEatEvery: number; // int; every Nth topping drops a criolla where it died (0 = off)
  papaScoreBonus: number; // int score per criolla collected (× globalMult) — LA HUERTA's engine
  // boost as a build (velocity builds)
  boostScorePerTick: number; // int score per boosting tick
  boostDrainMul: number; // Q16.16 on ALMIDON_DRAIN
  // enredo mult flow (cards modify the snowball: step, cap, chain)
  enredoMultStepMul: number; // Q16.16 on ENREDO_MULT_STEP
  multCapBonus: number; // Q16.16 added to MULT_MAX
  multDecayPerTick: number; // Q16.16 globalMult decay per tick (0 = none; sofrito's price)
  enredoChainMul: number; // Q16.16 on the mult gain of a CHAINED enredo (within the window)
  // burn zones as a score field (glass-cannon build)
  burnScorePerTick: number; // int score per tick while the head is inside a burn zone
  burnOilBonus: number; // int flat score per oil puddle burned by an enredo
  // pacts
  visionNarrow: boolean; // A Ciegas: view renders a fog outside a head radius (view-only read)
  forkAlways: boolean; // Duelo: a boss is active EVERY service
  forkBlockBonus: number; // int score when an enredo blocks the boss
  forkBlockPapas: number; // int criollas dropped at the blocked boss
  forkNearScorePerTick: number; // int score/tick while the hunting boss is within ~150u ("bailar paga")
  oilExtraCount: number; // int extra oil puddles per service (Olla a Presión)
};

// ===========================================================================
// Input for one tick
// ===========================================================================

export type Input = {
  angle: number; // brads, ABSOLUTE desired heading (sim rate-limits the turn)
  boost: boolean;
  cardPick: number; // -1 in PLAY; else 0..offerCount-1 in DRAFT
  reroll: number; // 0 normally; >0 requests a reroll this DRAFT tick
  // draft economy (F1): both are -1 in PLAY / when unused. Paid with cosecha; priority in
  // step P0 is banish > reroll > lock > pick (one action per DRAFT tick).
  lockPick: number; // slot 0..offerCount-1 to LOCK for the next draft
  banishPick: number; // slot 0..offerCount-1 to BANISH from this run's pool
};

// ===========================================================================
// Single-entity record types (selectors / enredo scratch). Pools store SoA below.
// ===========================================================================

export type Topping = {
  x: number; // POS
  y: number; // POS
  kind: ToppingCode;
  flags: number; // TOP_FLAG bits
  expire: number; // tick at which it vanishes
};

export type PapaFragment = {
  x: number; // POS
  y: number; // POS
  kind: PapaCode;
  seq: number; // francesa sequence index 0..3; -1 for criolla
  expire: number; // tick
};

export type Obstacle = {
  type: ObstacleTypeCode;
  x: number; // POS anchor / center
  y: number; // POS
  radius: number; // POS (live radius; oil grows)
  phase: number; // knife/whisk rhythm phase (brads or tick offset)
  flags: number; // OBS_FLAG bits
};

// Inline singletons on the World.
export type Pedido = {
  active: number; // bool 0/1
  base: number; // ToppingCode required base
  seq: [number, number, number]; // the 3 ToppingCodes in required order
  progress: number; // 0..3 next-to-collect index
  expire: number; // tick deadline
  cooldownUntil: number; // tick before which no new pedido is generated
};

export type Fork = {
  active: number; // bool 0/1
  x: number; // POS
  y: number; // POS
  heading: number; // brads
  state: ForkStateName;
  blocked: number; // ticks remaining while BLOCKED
};

// ===========================================================================
// World — the authoritative snapshot. One object; pools are fixed-capacity SoA
// typed arrays with a `count` active-prefix and swap-remove semantics.
// ===========================================================================

export type World = {
  // run / mode / phase
  mode: ModeName;
  phase: PhaseName;
  seed0: number; // uint32, immutable replay header
  tick: number; // global tick counter — the ONLY clock
  service: number; // 1..8
  serviceTick: number; // ticks elapsed in current service
  serviceLen: number; // ticks for the current service (drawn from RNG)

  // RNG (whole generator state; World is a valid RngState via this field)
  rng: number; // uint32 (mulberry32)

  // difficulty ramp
  globalSpeedStep: number; // POS, added to base speed
  usableHalf: number; // POS, current border half-extent

  // head + body polyline (node[0] = head). Body nodes are RE-DERIVED every tick by
  // arc-length sampling of the head's breadcrumb trail (slither-style), not a rigid chain.
  bodyX: Int32Array; // POS, length MAX_NODES
  bodyY: Int32Array; // POS
  bodyCount: number;
  heading: number; // brads, current head heading
  prevHeadX: number; // POS, head position before this tick's integration
  prevHeadY: number; // POS
  growPending: number; // nodes owed, appended at tail over ticks
  almidon: number; // Q16.16 boost fuel, 0..ALMIDON_MAX

  // breadcrumb trail (ring buffer): one crumb per tick at the head, with the exact
  // per-tick travel distance as the segment length (no sqrt needed). Body node i sits at
  // arc-length i*SPACING back along this trail.
  crumbX: Int32Array; // POS, length CRUMB_CAP
  crumbY: Int32Array; // POS
  crumbLen: Int32Array; // POS, length of the segment ending at this crumb
  crumbHead: number; // ring index of the newest crumb (== head position)
  crumbCount: number; // valid crumbs (<= CRUMB_CAP)

  // toppings pool
  topX: Int32Array;
  topY: Int32Array;
  topKind: Int8Array; // ToppingCode
  topFlags: Int8Array; // TOP_FLAG bits
  topExpire: Int32Array;
  topCount: number;

  // papa pool
  papaX: Int32Array;
  papaY: Int32Array;
  papaKind: Int8Array; // PapaCode
  papaSeq: Int8Array; // francesa index; -1 criolla
  papaExpire: Int32Array;
  papaCount: number;
  francesaNext: number; // next expected seq index for the active francesa line

  // obstacle pool
  obsType: Int8Array; // ObstacleTypeCode
  obsX: Int32Array;
  obsY: Int32Array;
  obsRadius: Int32Array; // POS
  obsPhase: Int32Array;
  obsFlags: Int8Array; // OBS_FLAG bits
  obsCount: number;

  // transient effect zones
  burnX: Int32Array;
  burnY: Int32Array;
  burnR: Int32Array; // POS
  burnExpire: Int32Array;
  burnCount: number;
  smokeX: Int32Array;
  smokeY: Int32Array;
  smokeExpire: Int32Array;
  smokeCount: number;

  // singletons
  fork: Fork;
  pedido: Pedido;

  // meters / scoring
  score: number; // int accumulated points
  globalMult: number; // Q16.16, >= 1.0
  cosecha: number; // Q16.16, 0..COSECHA_MAX
  toppingsEaten: number; // running count (Chicharrón cadence)

  // card state
  mods: Modifiers;

  // build: cards taken so far, in pick order (each one "rides" a body segment). Mods are REBUILT
  // from this list + combos + synergies on every pick, so the effect is a pure function of the build.
  pickedCards: Int8Array; // CARD_POOL indices, length MAX_PICKS
  pickedCount: number;
  synergyTier: Int8Array; // active tier per tag (index = CARD_TAG_ORDER), 0/1/2 — view + effects

  // draft economy (F1)
  banished: Int8Array; // per pool index: 1 = banished from this run's offers
  lockedCard: number; // pool index guaranteed in slot 0 of the NEXT draft; -1 = none

  // enredo chain (the build-explosion arc): consecutive loop-closes within the chain window
  lastEnredoTick: number; // tick of the last catching enredo (very negative at start)
  enredoChain: number; // current chain length (1 = no chain yet)

  // draft buffer (meaningful only while phase === DRAFT)
  offerIds: Int8Array; // pool indices into CARD_POOL, length MAX_OFFERS
  offerCount: number; // active offers 3..4
  rerollLeft: number; // rerolls remaining
  rerollUsed: number; // rerolls consumed (folds into draft seed)

  // terminal flags
  victory: number; // bool 0/1 (set with phase === DEAD on an 8-service clear)
};
