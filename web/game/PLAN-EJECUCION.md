# EL ENREDO — PLAN DE EJECUCIÓN DETALLADO (F1 → F2 → F3)
### Handoff-ready: cualquier modelo (Opus/Fable) puede retomar desde aquí.
> Fuente: `papaghettiprompt.md` (raíz del repo) + `web/game/ROADMAP-STEAM.md` + decisiones del usuario.
> Actualiza los checkboxes al completar. Commit por fase. Deploy: `cd web && vercel --prod --yes`.

## ⛳ ESTADO AL PAUSAR (2026-07-18) — LEE ESTO PRIMERO SI RETOMAS
**✅ FASE 1 COMPLETA Y VALIDADA** (commit "F1 — la build importa"): 30 cartas + 4 pactos + 5 combos
+ rarezas + unique + economía lock/banish + cadena de enredos + harness invertido. GATE SUPERADO:
15 perfiles de build > p95 (meta ≥5) · PACTOS: ninguno muerto (duelo ganó con lazo_avido+al_dente+duelo
a 52.5k) · CARTAS MUERTAS: ninguna (30/30 en builds ganadoras) · determinism 11/11 · tsc/lint/build ✓ ·
UI del draft verificada por screenshot (marcos TFT + TU FIDEO + glow sinergia + chips de tags + 🔒10/✖25).
**Decisiones de diseño tomadas en F1 (no revertir sin razón):**
- duelo = danger-pay (8/tick a <200u del jefe en CHASE) + bloqueo 2000×mult + bloqueo alimenta mult
  (2 steps) + jefe cauto (×0.85 velocidad con forkAlways). Fue la 5ª iteración; las anteriores
  (bonus plano, ×mult solo, duel-orbit del bot) no bastaron — el bloqueo es skill-shot humano.
- hambre_de_papa ganó vía papaScoreBonus 500×mult (la papa es ORO) — C1 lo duplica.
- El harness reporta pactos "SKILL-GATED" (top ≥80% p95) aparte de MUERTOS — distinción honesta.
- El bot del harness: caza-sinergias + esquiva aceite + huye del jefe (salvo duelo) + ORBITA racimos
  (radio adaptativo al cuerpo: r=len/2π×0.8 clamp 46..95; entra con bodyCount≥48).
**▶️ SIGUIENTE = FASE 2** (sección F2 abajo; las respuestas del usuario ya están en "DECISIONES").
F2 no ha empezado. F3 no ha empezado. El juego quedó jugable y desplegable tras F1.

---

## DECISIONES YA TOMADAS POR EL USUARIO (no re-preguntar)
1. **Calor máximo** = "Horno con jerarquía": bloom/viñeta-que-late/grano suben fuerte; el BLANCO
   CALIENTE solo en ACENTOS (bordes, números, slam, contador); fideo+comida siempre nítidos.
2. **Números** = "Contador de cadena central": contador grande arriba-centro (×N con squash/temblor)
   + números flotantes normales debajo.
3. **Pantalla hero** = "Escena viva en canvas": la sartén real renderizada idle detrás del menú
   (fideo nadando, bot simple), menú HTML encima.
4. **Cartas-pacto MAL**: las diseña Claude (specs abajo, sección F1.2-MAL). El usuario puede corregir.
5. Móvil central del prompt: **ADN DE CULEBRITA** rige sobre todo. Balanceo INVERTIDO (≥5 builds
   rotas alcanzables y celebradas). Clip = "LA BUILD ROTA" (arco 8-10s), legible en miniatura muteada.

## INVARIANTES /sim (LEY — ver web/game/sim/CONTRACT.md)
- Q16.16 (`fmul`/`fdiv`/LUTs trig), CERO `Math.random`/wall-clock/floats en gameplay.
- RNG sembrado vía `nextInt(w,n)`; nº y orden de draws por tick = función pura del World.
- Draft usa stream SEPARADO (`draftSeed(seed0, service, rerollUsed)`).
- Bucles acotados, pools swap-remove, cero alloc por tick.
- La elección de carta ES un Input del log. `node --test game/sim/*.test.ts` = 11/11 SIEMPRE.
- El código evolucionó vs CONTRACT.md en: `pickCard` (no applyCard) + `rebuildMods` (efecto = función
  pura del SET de cartas), cuerpo por trail-sampling (no follow-the-leader), mundo CRECE (no contrae).
  Los invariantes se mantienen; las diferencias son intencionales.

## VALIDACIÓN (correr tras cada bloque)
```bash
cd web
npx tsc --noEmit                                    # exit 0
npx eslint game/sim/*.ts game/view/*.ts             # 0 errors
node --test game/sim/determinism.test.ts game/sim/fixes.test.ts   # 11/11
node game/sim/balance.ts 5000                       # el harness F1 (tabla de builds)
npm run build                                       # exit 0
```
Screenshots: patrón `_shot.mjs` en web/ (Playwright ya instalado): navegar `localhost:3000/juego`,
click `.enredo-play`, conducir con KeyboardEvent sintéticos en `window` (ArrowRight/Down/Left/Up),
capturar. Server: `npm run start` en background; matar puerto 3000 con netstat+taskkill (node).
**OJO**: el selector `[class*='over']` matchea el overlay de juego — para detectar game-over usar
logs de consola, no ese selector.

---

# ═══════════ FASE 1 — "LA BUILD IMPORTA" ═══════════

## F1.0 Cimientos (types/constants/world) — ✅ HECHO (esta sesión)
- [x] `types.ts`: `CARD_RAREZA` const + `CardRareza`; 16 nuevos `CardId`; `Modifiers` +22 campos
      nuevos (ver lista abajo); `Input` + `lockPick`/`banishPick`; `World` + `banished: Int8Array`,
      `lockedCard`, `lastEnredoTick`, `enredoChain`.
- [x] `constants.ts`: `LOCK_COST=10*FP_ONE`, `BANISH_COST=25*FP_ONE`, `MAX_CARDS=32`,
      `ENREDO_CHAIN_WINDOW=300`.
- [x] `world.ts`: `initModifiers()` con los 22 campos neutros (ya editado).
- [ ] `world.ts` createWorld: inicializar `banished: new Int8Array(MAX_CARDS)`, `lockedCard: -1`,
      `lastEnredoTick: -100000`, `enredoChain: 0`. (import MAX_CARDS)

**Campos nuevos de Modifiers (con neutros):** growPerTopBonus:0 · scorePerLenMul:0 ·
toppingsGiveAlmidon:true · papaAlmidonGain:0 · papaRateMul:ONE · papaOnEatEvery:0 ·
boostScorePerTick:0 · boostDrainMul:ONE · enredoMultStepMul:ONE · multCapBonus:0 ·
multDecayPerTick:0 · enredoChainMul:ONE · burnScorePerTick:0 · burnOilBonus:0 ·
visionNarrow:false · forkAlways:false · forkBlockBonus:0 · forkBlockPapas:0 · oilExtraCount:0.

## F1.1 Las 16 cartas nuevas (cards.ts) — valores EXACTOS
Constantes Q16.16 ya en cards.ts: M_112, M_115, M_120, M_125, M_130, M_135, M_150, M_160, M_200,
M_075, M_070, M_060. Añadir: `M_110=72090` (+10%), `M_133=87163` (+33%), `M_140=91750` (+40%),
`M_175=114688` (+75%), `M_250=163840` (×2.5), `M_090=58982` (−10%), `M_1500=...` no — usar enteros.

**COMUNES (tipo ING salvo indicado):**
| id | nombre | tags | efecto (apply) |
|---|---|---|---|
| mantequilla | Mantequilla | VELOZ,GRASA | baseSpeedMul ×1.10 |
| queso_curado | Queso Curado | GRASA | toppingScoreMul ×1.20 |
| caldo_largo | Caldo Largo | GRASA | growPerTopBonus +1 (¡largo = recurso, ADN Snake!) |
| semola_fina | Sémola Fina | VELOZ | turnRateMul ×1.10, hitboxRadiusMul ×0.90 |
| perejil_fresco | Perejil Fresco | COSECHA | papaLifeMul ×1.40, papaRateMul ×1.33 |
| aceite_oliva | Aceite de Oliva | FUEGO | oilGrowthMul ×0.70 |

**RARAS (tipo REC):**
| id | nombre | tags | efecto |
|---|---|---|---|
| doble_racion | Doble Ración | GRASA | growPerTopBonus +3, toppingLifeMul ×0.75 |
| reduccion | Reducción | LAZO | loopCap +5, minLoopAreaMul ×1.50 |
| sofrito | Sofrito | LAZO,FUEGO | enredoMultStepMul ×2, multCapBonus +2*ONE, multDecayPerTick=65 (~0.06/s: el mult DECAE — juega en cadena o piérdelo) |
| hilo_dorado | Hilo Dorado | COSECHA | papaOnEatEvery=8 (cada 8º topping suelta criolla donde murió) |
| enredo_doble | Enredo Doble | LAZO | enredoChainMul ×2 (un enredo encadenado alimenta el doble) |
| bechamel | Bechamel | VELOZ,GRASA | boostScorePerTick=2, boostDrainMul ×1.50 |

**PACTOS MAL (épica) — diseño de Claude (debuff fuerte + upside enorme):**
| id | nombre | tags | efecto |
|---|---|---|---|
| a_ciegas | A Ciegas | VELOZ | visionNarrow=true (niebla view-only fuera de un radio de la cabeza) **+** globalScoreMul ×1.75 |
| olla_presion | Olla a Presión | FUEGO | oilGrowthMul ×2.5, oilExtraCount +1 **+** globalScoreMul ×1.60, burnOilBonus=500 |
| hambre_de_papa | Hambre de Papa | COSECHA | toppingsGiveAlmidon=false (¡el boost solo se recarga con papa!) **+** papaAlmidonGain=30*ONE, cosechaGainMul ×2, papaLifeMul ×1.5 |
| duelo | Duelo | LAZO | forkAlways=true (jefe TODOS los servicios) **+** forkBlockBonus=1500, forkBlockPapas=2 |

**RAREZA por carta:** COMUN = al_dente, hebra_gruesa, ojo_criolla + las 6 comunes nuevas (9).
RARA = cabello_angel, lazo_avido, corte_limpio, enredo_ardiente, chicharron, pina_acida, tocineta,
cosecha_voraz, fuego_alto + las 6 raras nuevas (15). EPICA = almidon_puro, lazo_hierro + los 4 pactos (6).

**UNIQUE (no re-ofertar una vez tomada — mata los picks muertos):** almidon_puro, lazo_avido,
corte_limpio, enredo_ardiente, lazo_hierro, chicharron, pina_acida, tocineta, cosecha_voraz,
sofrito, hilo_dorado, enredo_doble, bechamel, a_ciegas, olla_presion, hambre_de_papa, duelo.
(Stackeables: al_dente, hebra_gruesa, cabello_angel, fuego_alto, ojo_criolla, mantequilla,
queso_curado, caldo_largo, semola_fina, perejil_fresco, aceite_oliva, doble_racion, reduccion.)

**TAGS de las 14 viejas: NO cambian.** CARD_TAGS se extiende con las 16 nuevas (arriba).

## F1.2 Combos transformativos + LAS 5 BUILDS ROTAS (documentar en comentario de cards.ts)
Implementar `applyCombos(mods, has: (id)=>boolean)` llamado por `rebuildMods` DESPUÉS de los apply
de cartas y ANTES de `applySynergies`. Función pura del SET (orden-independiente). Combos:
- **C1** cosecha_voraz + hambre_de_papa → papaRateMul ×2 extra, papaAlmidonGain ×2.
- **C2** fuego_alto + olla_presion → burnScorePerTick=30 (la zona quemada ES campo de puntos).
- **C3** almidon_puro + bechamel → boostScorePerTick=6 (total), baseSpeedMul ×1.10 extra.
- **C4** enredo_doble + lazo_avido → enredoChainMul ×2 extra (→ ×4 encadenado).
- **C5** caldo_largo + doble_racion → scorePerLenMul=3277 (+5% score por cada 25 nodos; clamp 20 pasos).

**Las 5 builds (comentario en cards.ts, NO anunciar en UI):**
1. **LA HUERTA** (COSECHA): hambre_de_papa + cosecha_voraz (+perejil, +hilo_dorado, +ojo_criolla).
   Pantalla llena de PAPA; economía de draft infinita. Visual: campo verde-dorado de criollas.
2. **COCINA INFERNAL** (FUEGO, glass cannon): olla_presion + fuego_alto (+enredo_ardiente, +aceite_oliva
   NO — sin él; + sofrito). Aceite por todas partes que TÚ quemas por puntos. Visual: campo de brasas.
3. **FLAMBÉ PERPETUO** (VELOZ): almidon_puro + bechamel (+cabello_angel, +semola, +mantequilla).
   Boost infinito que PUNTÚA por tick. Visual: velocidad + speedlines perpetuas.
4. **CADENA PERFECTA** (LAZO): enredo_doble + lazo_avido (+sofrito, +reduccion). Enredos encadenados
   ×4 al mult con cap subido; el sofrito castiga parar. Visual: slams en cadena, contador ×N.
5. **EL FIDEO INFINITO** (GRASA/largo — el más Snake): caldo_largo + doble_racion (+hebra_gruesa,
   +queso_curado). La LONGITUD multiplica el score. Visual: la pantalla llena de fideo.

**ADN de culebrita (auditoría F1.3-bis):** ninguna carta elimina cuerpo/longitud ni vuelve
irrelevante comer-para-crecer. a_ciegas es niebla (input handicap, no cambia el sim). ✓ Mantener así.

## F1.3 generateOffer con RAREZAS + banish/lock (cards.ts)
- Redimensionar scratch: `scratchIdx`/`recMalPos` de 14 → 32.
- `CARD_RAREZAS: Record<CardId, CardRareza>` + `CARD_UNIQUE: Record<CardId, boolean>`.
- Pesos por cosechaLevel: COMUN=100 siempre; RARA low/mid/high/max = 30/38/48/56;
  EPICA = 7/12/18/26.
- Algoritmo (rng LOCAL de draftSeed, determinista): para cada slot: elegible = !banished[i] &&
  !ya-ofertada-este-draft && !(UNIQUE && ya en pickedCards). total=Σpesos; r=nextInt(rng,total);
  recorrido acumulativo → carta. Si `lockedCard>=0` y elegible → va DIRECTO al slot 0 y
  `w.lockedCard=-1` (el lock es para UN draft). `guaranteedRecMal` (tier max) se mantiene para
  el primer slot NO-lockeado.
- Si el pool elegible se agota (final de run con muchos unique/banish) → rellenar con stackeables.

## F1.4 step.ts P0 (economía) + hooks de juego
**P0 DRAFT — prioridad banish > reroll > lock > pick (una acción por tick):**
```
if (input.banishPick in [0,offerCount) && cosecha >= BANISH_COST):
    cosecha -= BANISH_COST; banished[offerIds[banishPick]] = 1; rerollUsed++; generateOffer(w)
elif (input.reroll > 0 && rerollLeft > 0): (igual que hoy)
elif (input.lockPick in [0,offerCount) && cosecha >= LOCK_COST && lockedCard < 0):
    cosecha -= LOCK_COST; lockedCard = offerIds[lockPick]   // NO regenera; sigue el draft
elif (input.cardPick ...): pickCard + advanceService (igual que hoy)
```
**Hooks en PLAY:**
- P1: si `mods.multDecayPerTick>0`: `globalMult = fmax(MULT_MIN, globalMult - multDecayPerTick)`.
- P3: drain del boost = `fmul(ALMIDON_DRAIN, mods.boostDrainMul)`; si boosteando y
  `mods.boostScorePerTick>0`: `score += boostScorePerTick`.
- P7 (comer topping): growPending += GROW_PER_TOP + growPerTopBonus; almidón SOLO si
  toppingsGiveAlmidon; scorePerLen: `steps=min(20,(bodyCount/25)|0); if scorePerLenMul>0:
  val=fmul(val, ONE + scorePerLenMul*steps)`; hilo dorado: si papaOnEatEvery>0 &&
  toppingsEaten % every === 0 && papaCount<MAX_PAPA → push criolla EN LA POS del topping comido
  (sin RNG), expire = tick + papaLife.
- P7 (papa criolla): si papaAlmidonGain>0 → almidon = fmin(MAX, almidon + papaAlmidonGain).
- P7 zona quemada: si burnScorePerTick>0 y head dentro de un burn zone → score += burnScorePerTick.
- P9 papa cadence: `everyFx = fdiv(toFixed(PAPA_CRIOLLA_EVERY), papaRateMul); every =
  max(40, fromFixedToInt(everyFx))` (entero, determinista).
- initService: si `mods.forkAlways` → fork activo TODOS los servicios; oil count += oilExtraCount.

## F1.5 enredo.ts — cadena + pactos
Tras el bloque `if (hits > 0)` (dentro):
```
const chained = w.tick - w.lastEnredoTick <= ENREDO_CHAIN_WINDOW;
w.enredoChain = chained ? w.enredoChain + 1 : 1;
w.lastEnredoTick = w.tick;
let gain = ENREDO_MULT_STEP * mult;
gain = fmul(gain, w.mods.enredoMultStepMul);
if (w.enredoChain >= 2) gain = fmul(gain, w.mods.enredoChainMul);
w.globalMult = fmin(MULT_MAX + w.mods.multCapBonus, w.globalMult + gain);
```
- Quemar aceite: `score += burnOilBonus * burned` (int).
- Bloquear jefe: `score += forkBlockBonus`; si forkBlockPapas>0 → dropear N criollas en pos del
  fork (offsets deterministas ±20u, sin RNG), expire = tick + papaLife.

## F1.6 hashWorld + Input literals (determinism.test.ts)
- hashWorld añade: lastEnredoTick, enredoChain, lockedCard, banished[] (loop), y TODOS los mods
  nuevos (22 campos, bools con b()).
- TODOS los literales `Input` del repo ganan `lockPick:-1, banishPick:-1`: determinism.test.ts
  (makeInput + long-run), balance.ts (botInput/rollInput/mainInput), engine.ts (input),
  y donde el makeInput random del test puede ejercitar lock/banish: opcional (mejor: en DRAFT,
  `lockPick = (u>>>6)%7===0 ? pick%offerCount : -1` etc. para cobertura).

## F1.7 UI del draft (render.ts + input.ts + engine.ts)
- `draftLayout` devuelve además: `ownedRow: Rect` (fila sobre las cartas), `lockRects: Rect[]`,
  `banishRects: Rect[]` (botoncitos bajo cada carta, ~28px alto).
- `drawDraft`:
  - Fila "TU FIDEO": mini-medallones (icono `CARD_ICON` + color de tag) de las cartas YA tomadas.
  - GLOW DE SINERGIA: si la carta ofrecida comparte tag con la build → borde extra pulsante ámbar
    + los tag-chips compartidos iluminados bajo el nombre ("arma algo").
  - Botones por carta: 🔒 LOCK (10) y ✖ BANISH (25) con costo; gris si cosecha insuficiente.
  - Micro-tooltip = el texto ya existente (buff/debuff) — sin muros de texto.
- `input.ts`: `consumeLockPick()`/`consumeBanishPick()` (hit-test de los nuevos rects, mismo patrón
  que consumeDraftPick). `setDraft` recibe los rects extra.
- `engine.ts`: pasar lockPick/banishPick al Input en DRAFT; log inputLog añade `l` y `k`.

## F1.8 HARNESS INVERTIDO (balance.ts) — reescribir el objetivo
- Bot **greedy de sinergias** (rápido, sin rollouts): en draft puntúa cada oferta:
  `2*tagsCompartidosConBuild + (rareza: comun 0/rara 1/epica 2) + (2 si pacto y su tag domina la
  build) + (3 si completa un combo C1..C5)`; empate → índice menor. Persigue builds de verdad.
- ≥5000 runs. Por run: score final + build (ids) + perfil de tags dominante (top-2 tags ordenados).
- **Métrica de salud NUEVA (el objetivo INVERTIDO):**
  - p95 de scores. ¿Cuántos PERFILES de build distintos aparecen en runs > p95? **SALUD = ≥5.**
  - ¿Cada pacto aparece en ≥1 run ganadora (>p95)? Si no → pacto muerto = BUG.
  - Cartas que NUNCA aparecen en runs > p95 → lista "cartas muertas" = bugs a arreglar.
  - NO reportar varianza como problema. NO aplanar picos. Los picos SON el producto.
- Reporte: top 10 builds por score máximo (perfil + cartas + score), tabla de salud, cartas muertas.

## F1.9 Validación F1
- [ ] tsc/eslint/determinism 11/11.
- [ ] `node game/sim/balance.ts 5000` → pegar tabla; confirmar ≥5 perfiles > p95 y 0 pactos muertos
      (iterar valores de cartas si no — es TUNING, no rediseño).
- [ ] 3 runs manuales (Playwright orbit) persiguiendo build: posible y emocionante en <8 min.
- [ ] Commit: "F1 — la build importa (30 cartas, pactos, combos, economía de draft, harness invertido)".

---

# ═══════════ FASE 2 — "EL REVIENTE SE VE" ═══════════

## F2.1 Auditoría de tells — [ ]
Grep en render.ts/pantallas nuevas: `fillRect` cuadrado en VFX (solo permitidos: barras UI/scrims),
`system-ui` (solo permitido en glifos emoji). Corregir lo que la F1 haya introducido.

## F2.2 Escalada de calor "HORNO CON JERARQUÍA" — [ ]
Driver: `heat01` ya existe (mult 1→3 mapea 0→1). Añadir **tier de reviente**: `blaze01 =
clamp((mult-3)/5, 0..1)` (mult 3→8) pasado en FrameState.
- palette.ts: extender rampa `panColor` con 2 stops más hacia brasa profunda (NO blanco: el pan
  nunca es blanco). Acentos blanco-caliente: `RGB_WHITE_HOT = [255,246,224]`.
- render.ts (post): BLOOM = stamp radial additivo cacheado centrado en la cabeza, alpha
  `0.10+0.25*blaze01`, radio `40%→60%` del viewport (1 drawImage, barato). VIÑETA: alpha modulada
  `+0.15*blaze01*sin(tick*0.08)` (late). GRANO: alpha 0.05 → `0.05+0.04*blaze01`.
- Borde de sartén y canto del plato ganan tinte white-hot con blaze01 (mixRgb hacia WHITE_HOT).
- REGLA DURA: fideo/comida SIEMPRE por encima (no aplicar bloom sobre sus píxeles → el bloom va
  ANTES de dibujar fideo? No: bloom es additivo suave al final PERO alpha máx 0.35 y radial desde
  cabeza — la jerarquía se mantiene por valor. Verificar con la prueba de miniatura.)

## F2.3 Contador de cadena central + números — [ ]
- engine: `chainView = world.enredoChain` (decae a 0 si pasan >ENREDO_CHAIN_WINDOW ticks desde
  lastEnredoTick); `chainPulse=1` en cada slam encadenado.
- render `drawChainCounter`: visible si `chain>=2 || blaze01>0.15`: "×N" gigante (fontD 40-64px)
  top-centro bajo el pedido; squash-in con chainPulse; color crema→ámbar→WHITE_HOT con blaze01;
  微 temblor `sin(tick*0.7)*blaze01*2px`. SIN texto explicativo (solo ×N).
- Números flotantes: tamaño por magnitud (`13+6*log10(valor)`), los de enredo/pedido en fontD y
  color heat; pop-in squash (ya hay sc) + al superar mult≥5 → tinte WHITE_HOT.
- Slam encadenado: si enredoChain≥2, el slam dice "CADENA ×N" bajo "¡ENREDO!" y escala +10%/paso
  (cap ×2), el anillo dobla.

## F2.4 Pantallas hero (escena viva) + EndScreen build — [ ]
- `GameClient`: en screen "start"/"over", montar un ATTRACT LOOP ligero: `createWorld(seed fijo,
  "RUN")` + cada frame `step(world, botInput)` con bot orbit simple (reusar lógica nearest-topping
  de balance) + `renderFrame(ctx, view, fsAttract)` con `fs.attract=true`.
- render: si `fs.attract` → NO dibujar HUD/controles/draft/slam (solo el campo). Cámara normal.
- El menú HTML queda encima con un scrim suave (bajar opacidad del fondo actual para que se VEA).
- Al morir el bot attract → recrear world (seed+1). Coste: es el juego real, ya optimizado.
- EndScreen: sección "TU BUILD": medallones (CARD_ICON + nombre) de result.cardsPicked en fila
  con wrap; exportar `CARD_ICON` desde render.ts. La lista ES la historia del clip.
- start screen: quitar el logo conic-gradient placeholder; título en fontD grande sobre la escena.

## F2.5 Prueba de miniatura — [ ]
Capturar frame en pico (orbit + enredos encadenados), redimensionar a 320px de ancho
(PowerShell System.Drawing: New-Object Bitmap/Graphics.DrawImage → Save). Checks:
(a) ¿se lee "algo se rompió a mi favor"? (b) ¿se reconoce la CULEBRITA (silueta del fideo)?
Si (b) falla → subir contraste del fideo (grosor de rim/specular) hasta que pase.
- [ ] Commit F2 + deploy.

---

# ═══════════ FASE 3 — "RAZÓN PARA VOLVER + PULIDO" ═══════════

## F3.1 Meta persistente — [ ]
- Nuevo `web/game/view/meta.ts` (view-side, NO toca sim): localStorage key `enredo-meta-v1`:
  `{ bestByMode: {RUN,RUSH,RETO}, victories: number, fuegoUnlocked: 0..3, unlockedCards: CardId[],
  recetas: RecetaId[], seenFirstEnredo: boolean, settings: {music:0..1, sfx:0..1} }`.
- **Escalera de unlocks** (empieza con 24 de 30; se desbloquean 6):
  llegar a servicio 3 → `hilo_dorado`; servicio 5 → `sofrito`; primera victoria → `duelo`;
  score>30k → `bechamel`; score>60k → `a_ciegas`; 3 victorias → `olla_presion`.
  (Los pactos "más rotos" se ganan → curva de descubrimiento.)
- `createWorld(seed, mode, opts?: {poolMask?: Int8Array, startCard?: number, fuego?: 0..3})`:
  poolMask filtra generateOffer (elegible &= poolMask[i]); startCard → pickedCards[0] pre-seed +
  rebuildMods; fuego → World.fuego (0-3): rampa `RAMP_SPEED_STEP*(1+fuego*0.25)` y serviceLen −5%/nivel
  (enteros: precomputar). TODO es parte del header del run (replay incluye opts → guardar en RunResult).
- **RECETAS de inicio** (elegibles en start screen, desbloqueables): "Clásica" (nada, default) ·
  "Cosechera" (startCard=perejil_fresco; unlock: 1 victoria) · "Ardiente" (startCard=aceite_oliva;
  unlock: score>20k) · "Veloz" (startCard=mantequilla; unlock: servicio 6).
- IndexedDB `enredo-runs`: guardar el inputLog del mejor run por modo (para revalidar/replay
  futuro): helper mínimo openDB/put/get (~50 líneas). No bloquear si falla (privado).
- EndScreen: mostrar "MEJOR: X" + "NUEVO RÉCORD" cuando aplique; badge de unlock nuevo.

## F3.2 Onboarding SIN TEXTO — [ ]
- `PEDIDO_FIRST_SERVICE 1→2` (s1 = Snake puro + platos; sin pedido). Papa ya entra s3. ✓ 0-5s Snake.
- Primer plato del s1: garantizar un cluster a <300u del spawn (clusterCenter: primer cluster del
  run usa CLUSTER_MIN_DIST_HEAD como MÁXIMO también (anillo 160-300u) — determinista con los mismos
  draws (rechazo acotado)).
- View: hasta que `meta.seenFirstEnredo` → el plato más cercano pulsa su canto ámbar ×3 intensidad
  + un ANILLO DISCONTINUO animado se dibuja alrededor (la señal "ródealo", sin palabras). Al primer
  enredo → celebración slam + guardar seenFirstEnredo. NADA de texto nuevo en pantalla.

## F3.3 Variedad: jefes + schedule + enjambre — [ ]
- `Fork.kind: 0=TENEDOR 1=CUCHARA 2=ESPATULA` (reusar el singleton fork + su render/estado).
  - TENEDOR (actual): chase con giro.
  - CUCHARA: ciclo AIM (60 ticks, apunta lento con telegraph visible) → DASH (recto ×2.2 velocidad,
    40 ticks) → REST (45 ticks). Estados en fork.state + fork.blocked reutilizado como timer.
  - ESPÁTULA: barre en arcos amplios (heading += constante mientras avanza; velocidad ×1.15),
    predecible pero rápida.
- Schedule: s3=TENEDOR, s5=CUCHARA, s7=ESPÁTULA, s8=nextInt(w,3) (sembrado). `forkAlways` (Duelo):
  jefe cada servicio con kind = service%3.
- Hazards: initService randomiza ±1 los counts (nextInt) y baraja qué menores entran (sembrado).
- ENJAMBRE "MIGAS QUEMADAS" (presión tardía): pool SoA `MAX_MIGAS=40` (x,y,expire), desde s6:
  spawn cada `max(50, 90 - (serviceTick>>7))` ticks en el borde, drift hacia la cabeza a 0.8u/tick
  (atan2Fixed, sin RNG por tick), LETALES al contacto (radiusSq pequeño), el ENREDO las limpia
  (pointInPoly → +50 c/u). Render: brasitas (dot naranja + glow). Hash: count+x+y.
- [ ] hashWorld += fork.kind, migas.

## F3.4 Música por capas + sliders — [ ]
- audio.ts: un solo AudioContext (ya). Añadir buses: `musicGain` y `sfxGain` → limiter.
  4 capas sintetizadas en loop por SCHEDULER lookahead (setInterval 25ms, programa notas con
  ctx.currentTime hasta +0.12s; patrón 16 pasos, ~96 BPM):
  L1 BAJO (siempre, gain 0.05-0.12) · L2 PERC kick/hat (heat>0.2) · L3 PAD acorde (heat>0.45) ·
  L4 LEAD arp (heat>0.7 o blaze>0). Crossfade SOLO por ganancia (setTargetAtTime) — nunca
  arrancar/parar el scheduler (deriva). `setIntensity(heat01, blaze01)` desde engine.
  Arquitectura lista para stems: cada capa = interfaz {connect(gain), schedule(t0,step)} → sustituible
  por AudioBufferSource sin refactor.
- eat(): añadir transiente de ruido (buffer de noise 0.05s pre-generado) + thunk grave 90Hz.
  enredo(): twirl (dos glides cruzados).
- Muerte: duck musicGain a 0 (0.1s) y restore en el próximo run.
- UI: en pausa (ya hay botón ||) → popover con sliders MÚSICA/SFX + MUTE (persisten en meta.settings).

## F3.5 Perf hardening — [ ]
- CULLING: en render, saltar plato/topping/papa/obstáculo/miga si su (sx,sy) está fuera del
  viewport + margen 80px (los sx/sy ya se computan — comparación barata antes de dibujar).
- WATCHDOG auto-LOD (engine): media móvil de dt (32 frames): >19ms sostenido → tier1 (sin grano,
  sin vapor, sin iron-rings); >26ms → tier2 (= reduceEffects). Recuperación con histéresis (<15ms
  60 frames). Pasar tier en fs.
- Post-passes: vignette/grain/iron ya cacheados ✓; bloom = 1 stamp cacheado ✓ (F2).
- render.ts split: DEFERIDO conscientemente (2400+ líneas funciona; split = riesgo sin payoff de
  jugador). Anotar en ROADMAP si molesta.

## F3.6 Accesibilidad — [ ]
- `matchMedia('(prefers-reduced-motion: reduce)')` → default reduceEffects=true (GameClient init;
  el usuario puede re-activar FX).
- HUD: labels 9px → 11px (COSECHA/ALMIDÓN + sinergias).
- Daltonismo: la comida ya es por FORMA ✓ (documentado). Teclado ✓. Una mano ✓.

## F3.7 VALIDACIÓN FINAL (la vara de Steam) — [ ]
- determinism 11/11 ✓ · harness: sigue habiendo ≥5 builds >p95 ✓ · miniatura F2 sigue pasando ✓
- FPS: medir frame-time medio en desktop headless durante reviente con enjambre (proxy de gama
  baja; objetivo <10ms desktop ≈ 60fps móvil bajo). Watchdog activo como red.
- 3 runs de un "extraño" (bot + juicio visual) — a la 3ª se persigue una build.
- La pregunta honesta: ¿dan ganas de grabar el reviente? Si no → volver a F2.2/F2.3.
- Commit F3 + deploy + actualizar memoria (enredo-juego.md parte 11) + ROADMAP-STEAM.md estado.

---

## ORDEN DE COMMITS
1. `F1 — la build importa` (sim + harness + UI draft) → deploy.
2. `F2 — el reviente se ve` (calor/cadena/números/hero/miniatura) → deploy.
3. `F3 — razón para volver` (meta/onboarding/jefes/enjambre/música/perf/a11y) → deploy.

## NOTAS PARA QUIEN RETOME (Opus)
- Lee `web/game/sim/CONTRACT.md` + este archivo. NO rehagas M1 (ver ROADMAP-STEAM.md).
- El patrón de verificación visual: build de PRODUCCIÓN (`npm run build && npm run start`), nunca
  dev. Playwright con teclado sintético (window.dispatchEvent KeyboardEvent) para conducir.
- memoria del proyecto: `C:\Users\Carlos\.claude\projects\...\memory\enredo-juego.md` (actualizar).
- Deploy Vercel desde `web/`: `vercel --prod --yes`; verificar `papaghetti.vercel.app/juego` → 200.
- El usuario prefiere autonomía + reportes claros en español.
