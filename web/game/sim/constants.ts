/**
 * constants.ts — all frozen tunables for EL ENREDO /sim.
 *
 * Every value is an integer. Values that live in a fixed-point space are commented
 * with their space (Q16.16 unless noted). Fractional multipliers are pre-baked as
 * round(x * 65536) literals so NO float ever enters gameplay math. Balance changes
 * happen here and never touch step() logic. Nothing here reads wall-clock or RNG.
 *
 * Spaces: POS = Q16.16 world units/lengths. brads = binary angle (65536 = full turn).
 */

import { FP_ONE } from "./fixed.ts";

// --- timestep -------------------------------------------------------------
export const TICKS_PER_SEC = 60;

// --- world / spatial pressure (center origin; playfield is [-half, +half]^2) --
export const WORLD_HALF = 1000 * FP_ONE; // POS, initial border half-extent (±1000 u)
export const WORLD_MIN_HALF = 300 * FP_ONE; // POS, contraction floor
export const RAMP_INTERVAL_TICKS = 1800; // 30s: raise speed & contract border
export const RAMP_SPEED_STEP = FP_ONE >> 2; // POS, +0.25 u/tick per ramp
export const RAMP_RADIUS_CONTRACT = 20 * FP_ONE; // POS, shrink border by 20 u per ramp

// --- run / service structure ---------------------------------------------
export const SERVICE_COUNT = 8;
export const SERVICE_MIN_TICKS = 60 * TICKS_PER_SEC; // 3600 (60s)
export const SERVICE_MAX_TICKS = 90 * TICKS_PER_SEC; // 5400 (90s)
export const RUSH_TICKS = 60 * TICKS_PER_SEC; // RUSH mode: single 60s run, no drafts
export const FORK_SERVICE_MODULO = 3; // fork appears on service % 3 == 0 (and s8)

// --- head / body movement -------------------------------------------------
export const BASE_SPEED = 5 * FP_ONE; // POS, units/tick at service 1 (300 u/s @60Hz)
export const TURN_RATE = 1650; // brads/tick (~9.1 deg = ~545 deg/s) — snappy, tight ~31u radius
// Turn cap scales DOWN as the snake grows (weight without twitch), but never below ~half so a
// long snake still maneuvers: young ~545°/s, a 200-node snake ~270°/s.
export const TURN_NMAX = 240; // node count where the turn cap bottoms out
export const TURN_FLOOR = 32768; // Q16.16 = 0.50 (min fraction of TURN_RATE)
export const TURN_SPAN = 32768; // Q16.16 = 0.50 (span above the floor)
export const SPACING = 8 * FP_ONE; // POS, arc-length spacing between body nodes on the trail
export const START_NODES = 24; // initial body length
export const CRUMB_CAP = 8192; // breadcrumb ring capacity (~40k u of trail; covers a max-length snake)
export const BOOST_MULT = 114688; // Q16.16 = round(1.75 * 65536)
export const SAUCE_TURN_FACTOR = 45875; // Q16.16 = round(0.70 * 65536), widens radius in sauce
export const PINA_TUG_MAG = 6553; // POS, ~0.10 u/tick uncontrolled lateral tug (Piña Ácida)

// --- almidón (boost fuel) -------------------------------------------------
export const ALMIDON_MAX = 100 * FP_ONE; // Q16.16
export const ALMIDON_DRAIN = FP_ONE; // Q16.16, per boosting tick (1.0)
export const ALMIDON_GAIN = 8 * FP_ONE; // Q16.16, per topping eaten
export const PINA_ALMIDON_BONUS = 12 * FP_ONE; // Q16.16, extra from pineapple

// --- growth / body cap ----------------------------------------------------
export const GROW_PER_TOP = 3; // nodes owed per topping
export const MAX_NODES = 4096; // hard body cap / pool capacity

// --- enredo (loop) --------------------------------------------------------
export const SKIP_NEAR_HEAD = 4; // body segments near the neck are not tested
export const AREA_SHIFT = 9; // shoelace coord reduction: 65536>>9 => 1/128-u grid
export const MIN_LOOP_AREA_UNITS = 400; // world-units^2 minimum loop area
// doubled + reduced-grid units for the shoelace gate: 2 * area * 128^2. Compared
// against Math.abs(loopArea2(...)) after fmul-scaling by mods.minLoopAreaMul.
export const MIN_LOOP_AREA_2 = 2 * MIN_LOOP_AREA_UNITS * 128 * 128; // 13,107,200
export const LOOP_CAP = 10; // default enclosed-count multiplier cap

// --- collision radii (POS / Q16.16) --------------------------------------
export const EAT_RADIUS = 12 * FP_ONE; // topping / papa collect radius (before hitboxMul)
export const HEAD_HITBOX = 6 * FP_ONE; // head radius for oil / fork / border death
export const FORK_CAPTURE_RADIUS = 18 * FP_ONE; // fork wrap/contact kill radius

// --- scoring --------------------------------------------------------------
export const TOP_BASE = 100; // int base points per topping
export const PEDIDO_BONUS = 2000; // int bonus on order completion
export const MULT_STEP = FP_ONE >> 2; // Q16.16, +0.25 to globalMult per completed pedido
export const MULT_DECAY = FP_ONE >> 1; // Q16.16, -0.5 to globalMult on pedido fail
export const MULT_MIN = FP_ONE; // Q16.16, global multiplier floor (1.0)
export const GLOBAL_MULT_START = FP_ONE; // Q16.16, starting global multiplier

// --- pedido (orders) ------------------------------------------------------
export const PEDIDO_TICKS = 25 * TICKS_PER_SEC; // deadline ticks
export const PEDIDO_SEQ_LEN = 3; // toppings required in order
export const PEDIDO_FIRST_SERVICE = 1; // pedidos active from service 1
export const PEDIDO_COOLDOWN_TICKS = 4 * TICKS_PER_SEC; // gap after a pedido resolves

// --- cosecha / papa (draft currency) -------------------------------------
export const COSECHA_MAX = 100 * FP_ONE; // Q16.16, full harvest meter
export const COSECHA_UNIT = 10 * FP_ONE; // Q16.16, gain per Papa Criolla (before cosechaGainMul)
export const COSECHA_FRANCESA_MULT = 3; // Papa Francesa completed line = triple cosecha
export const PAPA_LIFE_TICKS = 270; // ~4.5s base fragment lifetime (before papaLifeMul)
export const PAPA_CRIOLLA_SERVICE = 3; // criolla first appears
export const PAPA_FRANCESA_SERVICE = 5; // francesa line first appears
export const PAPA_DANGER_SERVICE = 7; // papa spawns inside danger zones from here
export const FRANCESA_LINE_LEN = 4; // sticks in a francesa sequence

// --- toppings lifetime / chicharrón --------------------------------------
export const TOPPING_LIFE_TICKS = 12 * TICKS_PER_SEC; // base lifetime (before toppingLifeMul)
export const CHICHARRON_EVERY = 5; // Chicharrón Crocante explosion cadence

// --- oil ------------------------------------------------------------------
export const OIL_START_RADIUS = 20 * FP_ONE; // POS
export const OIL_GROW = FP_ONE >> 3; // POS, +0.125 u/tick base (before oilGrowthMul)
export const OIL_MAX_RADIUS = 200 * FP_ONE; // POS, growth clamp
export const OIL_SERVICE = 3; // boiling oil first appears

// --- obstacle schedule anchors (which service introduces what) -----------
export const WALL_SERVICE = 4;
export const KNIFE_SERVICE = 5;
export const SAUCE_SERVICE = 6;
export const WHISK_SERVICE = 7;

// --- fork boss ------------------------------------------------------------
export const FORK_SPEED = 5 * FP_ONE; // POS, units/tick
export const FORK_TURN_RATE = 500; // brads/tick
export const FORK_BLOCK_TICKS = 5 * TICKS_PER_SEC; // stun when enclosed by an enredo
export const FORK_ENTER_MARGIN = 40 * FP_ONE; // POS, distance inside border to reach CHASE

// --- spawning -------------------------------------------------------------
export const TOP_TARGET_PER_SERVICE = 14; // maintained topping count
export const SPAWN_MAX_TRIES = 8; // bounded rejection sampling (determinism)

// --- pool capacities ------------------------------------------------------
export const MAX_TOP = 64;
export const MAX_PAPA = 16;
export const MAX_OBS = 24;
export const MAX_ZONE = 16; // burn zones
export const MAX_SMOKE = 128; // smoke trail segments
export const SMOKE_LIFE_TICKS = 3 * TICKS_PER_SEC;
export const BURN_LIFE_TICKS = 2 * TICKS_PER_SEC;
export const MAX_OFFERS = 5; // draft offer buffer size

// --- angle ----------------------------------------------------------------
export const FULL_CIRCLE = 65536; // brads per revolution

// --- draft sentinels ------------------------------------------------------
export const CARD_PICK_NONE = -1; // Input.cardPick when not picking
export const REROLL_NONE = 0; // Input.reroll default
