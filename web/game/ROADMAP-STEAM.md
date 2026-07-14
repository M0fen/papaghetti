# EL ENREDO — Hoja de ruta a calidad Steam

> Auditoría senior de producción (7 lentes: arte, game-feel, sistemas/roguelite, UX/onboarding,
> audio, técnico/perf, mercado) + síntesis. Anclada al código real. 2026-07-14.

## Visión (north-star)
**EL ENREDO es EL juego del lazo**: paper.io/splix reinventado como un fideo de spaghetti que brilla
en una sartén de hierro. Manejas el fideo alrededor de racimos de comida cálida iluminada por una sola
luz y **cierras un lazo — el enredo —** que estalla en luz y multiplica tu score. Ese *"enredo slam"*
compartible es el gancho más fuerte y la mecánica que **ningún competidor tiene** (SNKRX = snake+synergias
de segmento; slither = el cuerpo; paper.io = captura — nadie tiene el lazo-de-comida en una sartén). Todo
lo demás (control, drafts, pedidos, presión survivor) existe para montar y celebrar ese momento.

## Veredicto honesto del estado actual
Un **hermoso demo de comida envuelto en un cascarón de prototipo**: le da a un extraño UNA buena partida y
luego nada. La base es Steam-grade donde se invirtió (sim determinista Q16.16, control por tick, atlas de
comida horneado, fideo multi-pase con luz transversal). Tres huecos sistémicos lo tenían bajo el nivel:
1. **Retención cero** — lo único persistido era el flag de reduce-effects; al morir reinicias idéntico.
2. **Momentos de payoff huecos** — la muerte cortaba antes de dibujar el juice; el hit-stop no congelaba;
   el enredo puntuaba pero **no alimentaba el multiplicador** (mecánica firma y motor de score en rieles
   separados).
3. **Cascarón sin terminar** — todo el texto en system-ui, VFX = cuadrados fillRect, emblema de carta =
   letra en círculo, sin música (un seno a 110Hz), sin limiter, sin onboarding.
Distancia: no cerca, pero la mayoría del *vital few* es S/M porque la plomería ya existe. ~6-10 semanas
enfocadas, no un reescribir.

## Vital few (cross-disciplina, ranked)
1. **El ENREDO = corazón del score + SLAM que llena pantalla** (M) — el momento dinero + el shot de tráiler.
2. **Death beat + hit-stop temporal real** (M) — recupera el momento más emocional; da crunch al loop.
3. **Capa meta persistente** (L) — best score local, recetas de inicio, escalera de unlocks, NG+/"fuego".
4. **Matar los 3 tells visuales**: tipografía, sprites de partícula, emblema del draft (M).
5. **Enseñar objetivo+controles+el verbo "enredar" en los primeros 30s** (M) — onboarding.
6. **Soundscape**: música adaptativa por heat + limiter + SFX de acciones core (L).
7. **Contenido a ~28-32 cartas** con rarezas, cartas MAL (pactos) y sinergias transformativas (L).

## Milestones
- **M1 — "Que PEGUE y se sienta shippable" (~2-3 sem, S/M):** wire-up de juice inerte + swap de placeholders.
  Death beat + hit-stop, enredo SLAM + mult, tipografía + partículas + emblema, limiter + SFX core,
  onboarding v1. → **HECHO (parte de M1; commit 76029ac).**
- **M2 — "Razón para volver" (~3-5 sem, L):** meta persistente, expansión a ~28-32 cartas + rarezas + MAL,
  economía de draft (reroll/lock/banish pagados), lectura de build/sinergias en el draft.
- **M3 — "Pulido Steam + escala + mercado" (~2-4 sem):** motor de música adaptativa, variedad de hazards/
  jefes + un enjambre escalante, hardening de perf (culling del fideo, post-passes pre-horneados, gradientes
  cacheados, watchdog de auto-LOD), pantallas inicio/fin que muestren el pilar de hierro, captura del mejor
  enredo cableada a compartir (loop viral + tráiler).

## Estado M1 (commit 76029ac, en vivo)
✅ Death beat (hold view-only ~820ms antes de resultados; verificado por logs DEATH→FINISH).
✅ Hit-stop temporal (congela el sim por ms; 40 comer / 90+ enredo / 140 muerte; replay-safe; 144Hz-safe).
✅ Enredo → globalMult (+0.125/topping × conteo capado, cap x8). Determinismo 11/11.
✅ ENREDO SLAM (popup "¡ENREDO! ×K" con overshoot + anillo + zoom punch escalado).
✅ Tipografía Bricolage/Manrope en canvas (15 puntos, adiós system-ui).
✅ Emblema de carta = icono (emoji temático) en gema iluminada.
✅ Partículas soft-dot horneadas (burst/spark/vapor/flash) + migas redondas.
✅ Audio: master limiter (compressor) + SFX boost/ability/carta/reroll.

## Backlog P1/P2 destacado (para M2/M3)
- P1: recetas de inicio · ascensión/"fuego" + horario de hazards randomizado + 2-3 jefes · cosecha/oro
  gastable (reroll/lock/banish) · boost con kick+FOV+haptic+whoosh · haptics en momentos clave · camera
  lerp/shake dt-normalizados · HUD con scrim + labels legibles + micro-tooltips · build/sinergias en draft ·
  eat() con transient de ruido + thunk · hazards/tenedor con litBody/rimLight/specHi · atlas de comida a 2x ·
  inicio/fin con escena hero de hierro · culling del fideo · post-passes pre-horneados · captura del enredo.
- P2: retune de colores de tags (VELOZ teal rompe la paleta) · panel PEDIDO oscuro (viola 3:1) + rayo vector ·
  glow del pan a arriba-izquierda · transiciones entre pantallas · shake por trauma² + kick rotacional ·
  dedup de flags satisfechos en generateOffer · reverb/delay + paneo estéreo · sliders música/SFX/mute ·
  reduced-motion + toggle daltonismo · watchdog de calidad · split de render.ts (2200 líneas).
