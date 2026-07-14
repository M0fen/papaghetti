EL ENREDO /sim — IMPLEMENTATION CONTRACT (LAW for enredo.ts, spatial.ts, cards.ts, step.ts, index.ts)

This contract is authoritative. All modules import from the foundation with explicit ".ts"
extensions. Erasable-only TS (no enum/namespace/param-properties/decorators). No Math.random,
no Date.now/performance.now, no Math.sin/cos/atan/sqrt/pow anywhere at runtime (LUTs already
baked in fixed.ts at module init). No floats in gameplay math — integers / Q16.16 only.

=====================================================================================
GLOBAL RULES every module obeys
=====================================================================================
- Number spaces (from fixed.ts): POS = Q16.16 positions/lengths; COLLISION = deltas >>8 then
  squared (use dist2/withinRadius/radiusSq); AREA = coords >>9 then shoelace (enredo only).
  NEVER square raw Q16.16 deltas. NEVER apply >> or &/| to a value that can exceed 2^31 —
  use Math.floor(x/2^k) instead.
- Multiply Q16.16 ONLY via fmul(a,b). Divide ONLY via fdiv(a,b) (guard b!==0 first).
  Intersection ratio ONLY via fracToQ16. Angles ONLY via sinFixed/cosFixed/atan2Fixed/angDiff.
- One clock: everything time-based reads world.tick / world.serviceTick. One RNG: every
  stochastic gameplay decision draws from the World via nextU32(w)/nextInt(w,n)/nextFixed01(w),
  and the number+order of draws per tick MUST be a pure function of World (never wall-clock,
  never float branch). Draft offers use a SEPARATE stream (see cards.ts) so they are independent
  of gameplay draw count.
- Zero per-tick heap allocation on hot paths: pools are swap-remove; scratch buffers are
  module-level Int32Array/objects reused every tick; no .map/.filter/.forEach, no {x,y} literals
  in loops; the enredo cut is an in-array memmove.

Foundation exports available to all modules:
  ./fixed.ts:
    FP_SHIFT, FP_ONE, ONE(=65536), FP_HALF, FP_MASK
    fmul(a,b):number  fdiv(a,b):number  fracToQ16(num,den):number
    toFixed(i):number  fromFixedToInt(f):number  fixedToFloatForRender(f):number  (view only)
    fabs(a)  fsign(a)  fclamp(v,lo,hi)  fmin(a,b)  fmax(a,b)  flerp(a,b,t)
    cross2(ax,ay,bx,by):number  orient(px,py,qx,qy,rx,ry):number(-1|0|1)
    dist2(ax,ay,bx,by):number  withinRadius(ax,ay,bx,by,r):boolean  radiusSq(r):number
    sinFixed(brads):number  cosFixed(brads):number  atan2Fixed(y,x):number  angDiff(target,current):number
  ./rng.ts:
    type RngState = { rng:number }   (World is structurally an RngState via its `rng` field)
    makeRng(seed):RngState  nextU32(s):number  nextFixed01(s):number
    nextInt(s,n):number  nextRange(s,lo,hi):number
  ./constants.ts: all tunables (see file). Notably TURN_RATE, BASE_SPEED, SPACING, BOOST_MULT,
    SKIP_NEAR_HEAD, AREA_SHIFT, MIN_LOOP_AREA_2, LOOP_CAP, EAT_RADIUS, HEAD_HITBOX,
    FORK_CAPTURE_RADIUS, MAX_* pool caps, service/schedule anchors, cosecha/papa/pedido/oil/fork consts.
  ./types.ts: World, Input, Modifiers, Topping, PapaFragment, Obstacle, Pedido, Fork, and the
    const objects MODE/PHASE/FORK_STATE/OBS/OBS_FLAG/TOPPING/TOP_FLAG/PAPA/CARD_TIPO plus union
    types ModeName/PhaseName/ForkStateName/ObstacleTypeCode/ToppingCode/PapaCode/CardTipo/CardId/CosechaLevel.
  ./world.ts: createWorld(seed:number, mode:ModeName):World ; initModifiers():Modifiers

=====================================================================================
enredo.ts  — signature mechanic geometry + loop resolution
=====================================================================================
Uses AREA space (>>AREA_SHIFT) for shoelace, POS for the intersection point (fracToQ16 then
fmul), full-precision integer for point-in-poly. Module-level scratch, never per-tick alloc:
  const scratchPolyX = new Int32Array(MAX_NODES);
  const scratchPolyY = new Int32Array(MAX_NODES);
  const scratchEnclosed = new Int32Array(MAX_TOP);   // enclosed topping indices
  export const SEG_HIT = { hit:false, x:0, y:0 };    // reused segCross output

Pure geometry primitives (exported, deterministic, overflow-proven in the recon):
  segCross(a1x,a1y,a2x,a2y, b1x,b1y,b2x,b2y): boolean
     STRICT interior crossing only (all four orient() straddle, none 0). On hit, writes the
     POS intersection point to SEG_HIT.x / SEG_HIT.y (t = fracToQ16(cross2(w,s), cross2(r,s));
     x = a1x + fmul(t, rX); y = a1y + fmul(t, rY)). Returns SEG_HIT.hit. d===0 => false.
  loopArea2(polyX:Int32Array, polyY:Int32Array, n:number): number
     signed 2*area in reduced (>>AREA_SHIFT, translated to vertex 0) units; sign = winding.
  pointInPoly(px:number, py:number, polyX:Int32Array, polyY:Int32Array, n:number): boolean
     +X ray cast, half-open (ay>py)!==(by>py), cross-multiply (no division), on-edge => true.

High-level P6 entry (called once per PLAY tick by step, after body follow-the-leader):
  runEnredo(w:World): void
     1. Scan head segment (w.prevHeadX,w.prevHeadY)->(w.bodyX[0],w.bodyY[0]) vs body segments
        for j = SKIP_NEAR_HEAD .. w.bodyCount-3 (ascending; skip the adjacent neck segment).
        First (smallest j) strict segCross wins. No hit => return.
     2. Build polygon into scratchPoly: [SEG_HIT, node[j+1..bodyCount-1], head]; nVerts = bodyCount-j+1.
     3. Area gate: if Math.abs(loopArea2(scratchPolyX,scratchPolyY,nVerts))
                     < fmul(MIN_LOOP_AREA_2, w.mods.minLoopAreaMul) => return (no collect/cut).
     4. Collect: pointInPoly over alive toppings -> scratchEnclosed; count = min(hits, w.mods.loopCap).
        Score enclosed set with that multiplier (TOP_BASE*kindWeight * toppingScoreMul * globalMult
        * globalScoreMul, accumulated to w.score via fromFixedToInt); mark them dead (TOP_FLAG.ALIVE
        cleared) so step P7 will not double-count. Advance pedido/almidón/growPending as normal eats
        do (or leave those to P7 by NOT clearing — pick ONE: recommended = enredo fully consumes them,
        cleared here). Freeze the choice.
     5. Card loop effects: if w.mods.enredoDestroysObstacles -> obstacles with center in poly get
        OBS_FLAG.DESTROYED (clear ACTIVE). if w.mods.enredoBurnsOil -> enclosed OIL extinguished +
        spawn a burn zone (bbox/centroid, BURN_LIFE_TICKS). If fork.active && center in poly ->
        fork.state=FORK_STATE.BLOCKED, fork.blocked=FORK_BLOCK_TICKS.
     6. Cut: if w.mods.enredoCutsTail -> remove nodes [1..j] (memmove tail up), bodyCount -= cut,
        where cut = min(j, ceil(j * enredoTailCostMul via fmul)). Head reconnects to former node[j+1].
        If !enredoCutsTail -> no removal.

=====================================================================================
spatial.ts  — fixed-grid spatial hash (broad-phase for topping eat / enredo PIP prefilter)
=====================================================================================
Deterministic, alloc-free after construction (linked-list buckets over typed arrays; insertion
order preserved => stable iteration). Optional accelerator; step may bypass it for small counts.
  export type SpatialHash = {
    cellShift:number; cols:number; rows:number; originX:number; originY:number;  // grid in POS
    heads:Int32Array;   // length cols*rows, -1 = empty (bucket head item index)
    next:Int32Array;    // length capacity, -1 = end of chain
    itemX:Int32Array; itemY:Int32Array; itemId:Int32Array; // length capacity
    count:number;
  };
  createSpatialHash(cellShift:number, cols:number, rows:number, originX:number, originY:number, capacity:number): SpatialHash
  shClear(h:SpatialHash): void                              // heads.fill(-1); count=0
  shInsert(h:SpatialHash, id:number, x:number, y:number): void  // cell = clamp((x-originX)>>cellShift ...); prepend
  shQuery(h:SpatialHash, x:number, y:number, r:number, out:Int32Array): number
     // writes candidate item ids overlapping the query AABB (POS radius r) into `out`, returns
     // count (<= out.length). Cell index math uses Math.floor((x-originX)/cell) style if extents
     // can exceed 2^31; otherwise >>cellShift. Iterates cells in fixed row-major order.

=====================================================================================
cards.ts  — data-driven registry of 14 + deterministic draft + apply
=====================================================================================
All "+X%" are precomputed Q16.16 integer constants (round(x*65536)); apply() mutates Modifiers
only, stacking multipliers with fmul, setting caps/flags by last-write. Never touches RNG or floats.
  export type Card = { id:CardId; tipo:CardTipo; nombre:string; texto:string;
                       apply:(mods:Modifiers, w:World)=>void };
  export const CARDS: { [K in CardId]: Card };   // erasable const object literal
  export const CARD_POOL: CardId[];              // canonical registry order == offer index space
  cardIndex(id:CardId): number                   // index into CARD_POOL
  cardIdAt(index:number): CardId
  applyCard(w:World, offerSlot:number): void     // id = CARD_POOL[w.offerIds[offerSlot]];
                                                 // CARDS[id].apply(w.mods, w)
The 14 ids and their modifier writes are fixed by the spec (al_dente..fuego_alto). Constant table:
  M_112=73400 M_115=75366 M_120=78643 M_125=81920 M_130=85197 M_135=88474 M_150=98304
  M_200=131072 M_075=49152 M_070=45875 M_060=39322.

Deterministic draft (INDEPENDENT stream — must NOT consume the gameplay RNG):
  draftSeed(seed0:number, service:number, rerollUsed:number): number   // integer Wang/xorshift mix, u32
  cosechaLevel(cosecha:number, max:number): CosechaLevel                // quarter split via integer compare
  draftShape(level:CosechaLevel): { count:number; rerolls:number; guaranteedRecMal:boolean }
     low:{3,0,false} mid:{3,1,false} high:{4,0,false} max:{4,1,true}
  generateOffer(w:World): void
     // rng = makeRng(draftSeed(w.seed0, w.service, w.rerollUsed)); partial Fisher-Yates over a copy
     // of CARD_POOL indices (nextInt on the LOCAL rng); if guaranteedRecMal, draw slot 0 from the
     // REC∪MAL subset first. Writes w.offerIds (pool indices), w.offerCount=count, w.rerollLeft=rerolls.
     // Pure & input-count-independent (RETO DIARIO: same seed => same offers everywhere).

=====================================================================================
step.ts  — the pure, in-place, deterministic tick
=====================================================================================
  export function step(w:World, input:Input): void
Executes exactly these phases in this order (freeze it — replay depends on it):
  P0 Phase gate / draft resolution.
     - phase DEAD: w.tick++; return.
     - phase DRAFT: if input.reroll>0 && w.rerollLeft>0 -> w.rerollUsed++; w.rerollLeft--;
       generateOffer(w); w.tick++; return. Else if input.cardPick in [0,offerCount) ->
       applyCard(w, input.cardPick); advance service (service++, draw serviceLen via nextInt(w,..),
       serviceTick=0, reset ramp scalars as needed, phase=PLAY); w.tick++; return. Else w.tick++; return.
     - phase PLAY: continue P1..P12.
  P1 Time & difficulty: serviceTick++; every RAMP_INTERVAL_TICKS raise globalSpeedStep by
     RAMP_SPEED_STEP and contract usableHalf by RAMP_RADIUS_CONTRACT (floor WORLD_MIN_HALF).
     Expire scans (swap-remove): toppings/papa/burn/smoke by tick>=expire; pedido deadline ->
     globalMult=fmax(MULT_MIN, globalMult-MULT_DECAY), pedido.active=0, set cooldown. Oil radius
     += fmul(OIL_GROW, oilGrowthMul) clamp OIL_MAX_RADIUS. Knife/whisk phase derived from tick.
  P2 Steering: delta=angDiff(input.angle, heading); turnRate=fmul(TURN_RATE, turnRateMul) further
     scaled by SAUCE_TURN_FACTOR if head in a sauce zone; heading=(heading+fclamp(delta,-turnRate,turnRate))&FP_MASK.
  P3 Speed: speed = fmul(BASE_SPEED, baseSpeedMul) + globalSpeedStep. Boost: if (input.boost||infiniteBoost)
     && (almidon>0||infiniteBoost) -> speed=fmul(speed,BOOST_MULT); if !infiniteBoost almidon=fmax(0,almidon-ALMIDON_DRAIN).
     cannotBrake floors speed. pinaTug (speedTugMag>0): deterministic lateral nudge from tick-derived phase.
  P4 Head integration: save prevHeadX/Y; bodyX[0]+=fmul(cosFixed(heading),speed); bodyY[0]+=fmul(sinFixed(heading),speed).
  P5 Body follow-the-leader: for i=1..bodyCount-1: a=atan2Fixed(bodyY[i]-bodyY[i-1], bodyX[i]-bodyX[i-1]);
     bodyX[i]=bodyX[i-1]-fmul(cosFixed(a),SPACING); bodyY[i]=bodyY[i-1]-fmul(sinFixed(a),SPACING).
     Growth: while growPending>0 && bodyCount<MAX_NODES: append tail-dup node; growPending--; bodyCount++.
  P6 runEnredo(w).
  P7 Pickups & pedido (skip toppings already cleared by P6): topping eat via
     dist2(head,top) < radiusSq(fmul(EAT_RADIUS, hitboxRadiusMul)); apply almidón/grow/score/pedido
     progress; chicharrón cadence; piña. Papa collect: criolla -> cosecha += fmul(COSECHA_UNIT, cosechaGainMul);
     francesa sequence via papaSeq==francesaNext.
  P8 Hazards & death (ONLY border / oil / fork): head outside usableHalf -> phase=DEAD; active OIL with
     dist2(head,obs) < radiusSq(obsRadius) -> DEAD; fork CHASE within FORK_CAPTURE_RADIUS or wrapped -> DEAD.
     Self-touch never kills.
  P9 Spawning (RNG consumers, fixed draw order): maintain topping target; service-gated papa; obstacle
     schedule keyed on serviceTick; pedido (re)generation when !active and cooldown passed. All rejection
     sampling bounded by SPAWN_MAX_TRIES.
  P10 Fork AI (service%FORK_SERVICE_MODULO==0 or 8): ENTER->CHASE (atan2Fixed steer, FORK_TURN_RATE),
      smoke slows via forkSmokeSlowMul, BLOCKED counts down forkBlocked.
  P11 Service/run state machine: if serviceTick>=serviceLen: if service==SERVICE_COUNT ->
      phase=DEAD, victory=1 (RUSH: tick>=RUSH_TICKS ends run); else phase=DRAFT +
      generateOffer(w). RUSH mode skips DRAFT (straight to next service).
  P12 w.tick++.
Any helper step needs from world.ts (createWorld/initModifiers) is imported from "./world.ts".

=====================================================================================
index.ts  — public API (thin, re-exports + selectors; view-facing)
=====================================================================================
  export { createWorld } from "./world.ts";
  export { step } from "./step.ts";
  export type { World, Input, Modifiers, ModeName, PhaseName } from "./types.ts";
  // read-only selectors (never mutate World):
  export function getHeadX(w:World):number;   // POS
  export function getHeadY(w:World):number;   // POS
  export function getHeading(w:World):number; // brads
  export function bodyLength(w:World):number; // w.bodyCount
  export function getScore(w:World):number;
  export function getPhase(w:World):PhaseName;
  export function isDead(w:World):boolean;    // w.phase===PHASE.DEAD
  export function isVictory(w:World):boolean; // w.victory===1
  export function getOffers(w:World, out:Int8Array):number; // copies offerIds, returns offerCount
Optional (may live in a later state.ts and be re-exported here): serialize(w):Uint8Array,
deserialize(bytes):World, hash(bytes):number — flat little-endian, rng as single u32, no floats.

The pick is ALWAYS an Input (never chosen inside step); (seed0 + inputLog) fully determines a run.