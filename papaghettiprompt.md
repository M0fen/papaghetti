# EL ENREDO — PROMPTS ENCADENADOS A CALIDAD STEAM
### 3 fases · ancladas a tu ROADMAP-STEAM.md · para Claude Code sobre M0fen/papaghetti

> **Objetivo (north-star de ESTE documento):** que el juego alcance la vara de un indie de Steam
> **en el navegador**, y que su momento-clip —**"LA BUILD ROTA"**— sea tan legible que se comparta
> solo, sin sonido y sin contexto, en el feed de un tercero.
>
> **🐍 MÓVIL CENTRAL — ADN DE CULEBRITA (rige por encima de todo lo demás):**
> Al primer contacto, el juego debe SENTIRSE como el clásico Snake, pero mejorado. Es el ancla
> emocional y de reconocimiento instantáneo: un extraño debe pensar *"ah, es la culebrita"* en los
> primeros 3 segundos, y *"...pero mejor"* a los 30. Esto CORRIGE una deriva del propio roadmap, que
> en su visión dice "paper.io/splix reinventado" (linaje de captura de territorio). El linaje correcto
> es **SNAKE**, no paper.io. Traducción concreta e innegociable:
> - **Comer para CRECER** es el verbo primario. La longitud es visible, se siente, importa.
> - **Tu propia cola es el peligro clásico de Snake** — pero EL ENREDO lo reinventa: tocarte ya no te
>   mata, cierra el lazo. Esa es "la mejora". El nervio de esquivarte sigue presente; cambió el castigo
>   por una herramienta.
> - **Movimiento de serpiente:** deslizamiento continuo, cuerpo que sigue a la cabeza (ya está), la
>   sensación de conducir una cola larga que te estorba y te salva.
> - Todo lo nuevo (enredo, cartas, papa, pedidos) se monta ENCIMA de ese esqueleto Snake, nunca lo
>   reemplaza. Si una decisión hace que deje de sentirse a culebrita, es la decisión equivocada.
>
> **Contexto para Claude Code:** el repo YA tiene ROADMAP-STEAM.md (auditoría de productor senior) y
> M1 está HECHO (death beat, hit-stop temporal, enredo slam+mult, tipografía real, SFX, partículas
> horneadas). Estas 3 fases = M2 y M3 de ese roadmap, RE-PRIORIZADOS hacia el clip de build.
> No rehagas M1. No reintroduzcas placeholders ya eliminados.

---

## ⚠️ EL GIRO DE DISEÑO QUE ORDENA TODO (leer antes de la Fase 1)

El ROADMAP-STEAM.md fue escrito con el **"enredo slam"** como momento-clip. La decisión de producto
AHORA es distinta: **el clip es "LA BUILD ROTA"** — una sinergia de cartas que revienta el score.

Esto NO descarta el enredo (sigue siendo el verbo core y el motor de multiplicador). Lo que cambia es
**dónde va el brillo**: el clip ya no es un instante de medio segundo, es un **arco de 8-10 segundos**
donde el jugador *ve venir* la explosión que él mismo armó. El placer es **"mira lo que ARMÉ"**, no
"mira mi reflejo".

**Tres consecuencias que Claude Code debe respetar en todo lo que sigue:**

1. **El héroe del juego es el SISTEMA DE CARTAS, no una mecánica suelta.** El draft, las sinergias y su
   lectura son P0, no P1.
2. **El balanceo se INVIERTE.** El objetivo ya NO es "que ninguna carta domine". Es el modelo Vampire
   Survivors: cartas individualmente controladas que **en ciertas combinaciones ROMPEN la pantalla, y
   el juego lo CELEBRA en vez de castigarlo.** La meta de balance es *"que existan ~5 builds rotas,
   alcanzables por caminos distintos"*. Si el banco de balanceo aplana todo, está optimizando lo
   contrario del clip. Escríbelo en el harness.
3. **"Que graben ellos" = listón de legibilidad.** Sin botón de compartir, el reviente tiene que
   entenderse **en la miniatura muteada de un video de terceros**: los números, el color de calor y el
   caos deben leerse sin audio y sin UI que explique. Es un requisito de dirección de arte, no un extra.

---

# ══════════════════════════════════════════════
# FASE 1 — "LA BUILD IMPORTA" (núcleo del clip)
# ══════════════════════════════════════════════
### Corresponde a M2 del roadmap, re-priorizado hacia el clip de build.

```
Trabaja sobre el repo actual. Lee primero web/ROADMAP-STEAM.md y web/game/sim/CONTRACT.md.
M1 ya está hecho: NO lo rehagas. Esta fase construye el sistema que produce el clip "BUILD ROTA".

INVARIANTES /sim (no romper): punto fijo Q16.16, cero Math.random/wall-clock/trig en runtime,
bucles acotados, RNG sembrado, step() puro. La elección de carta ES un input del log. Los
determinism tests (11/11) deben seguir pasando al final.

OBJETIVO DE LA FASE: que una RUN pueda "romperse" de forma visible, provocada y celebrada.

1. EXPANSIÓN DE CARTAS a ~28-32 (desde 14), data-driven en cards.ts:
   - Añade RAREZAS (común / rara / épica) que sesgan la oferta del draft.
   - Añade CARTAS-PACTO ("MAL"): debuff fuerte + upside enorme (ya diseñadas: A Ciegas, Olla a
     Presión, Hambre de Papa, Duelo). Son el combustible de las builds rotas.
   - Añade SINERGIAS TRANSFORMATIVAS: cartas cuyo efecto CAMBIA si ya tienes otra (no solo +stats).
     Reusa el sistema de tags TFT ya presente.

2. ~5 "BUILDS ROTAS" DISEÑADAS A PROPÓSITO (documéntalas en un comentario en cards.ts):
   Cada una alcanzable por un camino distinto, cada una revienta el score de una forma VISUALMENTE
   distinta (una llena la pantalla de enredos, otra de papa, otra de velocidad, etc.).
   Ejemplos base a partir del pool actual: Cosecha Voraz + Lazo de Hierro (fábrica de zona segura) ·
   Fuego Alto + Olla a Presión (glass cannon) · Almidón Puro + Cabello de Ángel (velocidad pura).
   NO las anuncies en la UI: el jugador las DESCUBRE.

3. EL ENREDO ALIMENTA LA BUILD (cerrar el bucle de sistemas):
   Verifica que enredo → globalMult ya funciona (M1). Ahora haz que las CARTAS modifiquen ese flujo
   (cap del mult, valor por topping, área) para que una build se sienta cualitativamente distinta,
   no solo "más números".

3-bis. PROTEGER EL ADN DE CULEBRITA (móvil central, rige sobre el resto):
   El juego debe sentirse a SNAKE MEJORADO al primer contacto. Auditar y garantizar que las cartas y
   sinergias NUNCA borren las raíces de Snake:
   - Comer-para-crecer siempre visible y satisfactorio; la longitud es un recurso que se siente.
   - La cola sigue siendo tensión (esquivarte importa), pero el enredo la vuelve herramienta.
   - Prohibido que una build convierta el juego en "otro género" hasta perder la lectura de culebrita
     (p. ej. una carta que elimine el cuerpo o vuelva irrelevante la longitud rompe el móvil central).
     Si una carta-pacto altera esto, debe ser un pacto EXTREMO y legible, no el estado por defecto.
   - Regla de oro para el harness y el diseño: si al ver un clip un extraño NO reconoce "es la
     culebrita", la build o la carta está mal, por muy rota que sea.

4. LECTURA DE BUILD EN EL DRAFT (P0, era P1):
   En la pantalla de carta, muestra las cartas que YA tienes y RESALTA cuando la carta ofrecida
   tiene sinergia con ellas (un glow, un hilo de conexión). El jugador debe VER que está armando algo.
   Micro-tooltips con el efecto real. Sin muros de texto.

5. ECONOMÍA DE DRAFT: reroll / lock / banish pagados con Cosecha (ya existe el medidor). Da agencia
   para PERSEGUIR una build en vez de aceptar lo que caiga. Es lo que convierte "me tocó" en "lo armé".

BALANCEO INVERTIDO — reescribe el objetivo del harness (sim/balance.ts):
   - Bot GREEDY que persiga sinergias (no aleatorio).
   - >= 5000 runs.
   - La métrica de salud NO es "varianza baja". Es: ¿existen >=5 builds que superan el p95 de score,
     por caminos distintos? ¿Cada carta-pacto es elegible por al menos una build ganadora?
   - Reporta: top builds por score, y qué cartas nunca aparecen en una build ganadora (esas SÍ son
     bugs: cartas muertas). No aplanes los picos.

VALIDACIÓN: determinism 11/11 verdes. Corre el harness y pega la tabla de builds. Juega 3 runs
persiguiendo a propósito una build rota: debe sentirse posible y emocionante en <8 min.
```

---

# ══════════════════════════════════════════════
# FASE 2 — "EL REVIENTE SE VE" (dirección de arte del clip)
# ══════════════════════════════════════════════
### Toma piezas de arte de M2/M3 y las concentra en la LEGIBILIDAD del momento viral.

```
Trabaja sobre el repo tras la Fase 1. El sistema de build ya produce reventones; esta fase hace que
se VEAN tan bien que se compartan solos, MUTEADOS y sin contexto. Respeta la BIBLIA DE ARTE
("Overcooked de hierro fundido": una luz arriba-izquierda, sin contornos negros, todo rechoncho,
materiales por especular). No rompas /sim.

1. MATAR LOS 3 TELLS DE PROTOTIPO restantes (si quedan): tipografía en canvas (ya M1), sprites de
   partícula redondos horneados (ya M1), emblema de carta como icono en gema (ya M1). Audita que no
   reaparezca ningún fillRect cuadrado ni system-ui en ninguna pantalla nueva de la Fase 1.

2. LA ESCALADA VISUAL DEL CALOR (el corazón del clip de build):
   El multiplicador global ya calienta la paleta. Súbelo a nivel Steam: al entrar en "build rota" y
   dispararse el mult, la sartén debe ESCALAR su respuesta en capas legibles —
   crema → ámbar → rojo brasa → blanco caliente— con bloom creciente, viñeta que late y grano que
   sube. El "reviente" tiene que leerse como TEMPERATURA en la miniatura, sin números.
   REGLA: la comida y el fideo SIEMPRE quedan por encima del efecto de calor (jerarquía de valor).

3. NÚMEROS QUE CUENTAN LA HISTORIA: los números flotantes del score, en pleno reviente, deben
   apilarse/escalar/encadenarse de forma legible (juice de tipografía, no solo texto). El pico del
   clip es "el número se descontroló". Que el número sea protagonista, con squash y easing.

4. EL ENREDO SLAM al servicio de la build: cuando un enredo dispara una cadena por sinergia, el slam
   debe encadenar (combo visual), no ser un pop aislado. Es la diferencia entre "cerré un lazo" y
   "mi build explotó".

5. PANTALLAS INICIO/FIN con la escena hero de hierro (P1 del roadmap): el título y el resumen final
   deben verse como un juego de tienda, no como un canvas de jam. El resumen final debe MOSTRAR la
   build que armaste (las cartas), porque esa lista ES la historia del clip.

6. LEGIBILIDAD DE MINIATURA (prueba dura): captura un frame del pico del reviente, escálalo a 320px
   de ancho, quítale el sonido mental. Dos preguntas deben tener SÍ por respuesta:
   (a) ¿se entiende que "algo se rompió a mi favor"? y
   (b) ¿se reconoce que ES UNA CULEBRITA? — la silueta del fideo-serpiente larga enroscándose debe
   leerse como Snake incluso en miniatura. Si el reviente vuelve la pantalla un caos irreconocible que
   ya no parece la culebrita, perdiste el gancho de reconocimiento: recupéralo (la serpiente debe
   seguir siendo la protagonista visual del caos). Sube contraste de calor y jerarquía hasta que ambas
   den SÍ.

VALIDACIÓN: prueba de miniatura pasada. determinism 11/11 verdes (el arte vive en /view, no debe
tocar el sim). 60fps sostenidos en móvil de gama baja durante un reviente (el peor caso de partículas).
```

---

# ══════════════════════════════════════════════
# FASE 3 — "RAZÓN PARA VOLVER + PULIDO FINAL"
# ══════════════════════════════════════════════
### M2 (meta) + M3 (pulido/perf/onboarding) del roadmap, cerrando el paquete.

```
Trabaja sobre el repo tras la Fase 2. El juego ya es bello y produce el clip. Esta fase da retención
y el barniz final. No rompas /sim.

1. META PERSISTENTE (la retención, hoy en cero): mejor score local, "recetas de inicio" desbloqueables,
   escalera de unlocks de cartas entre runs, y un modo ascensión ("fuego"/NG+) que sube dificultad.
   Persistir en IndexedDB (guardar el log de inputs para reanudar; el score real se revalida por sim).
   Esto es lo que convierte "una buena partida y nada" en "una más".

2. ONBOARDING SIN TEXTO (decisión de producto): enseñar en los primeros 30 segundos, por diseño de
   nivel y composición, NO por tutorial escrito. El ORDEN importa y refuerza el móvil central:
   - Segundos 0-5: que se sienta a CULEBRITA de una. El jugador come, crece, conduce la cola.
     Reconocimiento instantáneo ("ah, Snake") ANTES de introducir nada nuevo.
     No metas cartas, papa ni pedidos en los primeros segundos: primero el Snake puro.
   - Segundos 5-30: introduce "la mejora" — el primer servicio debe casi forzar al jugador a cerrar su
     primer ENREDO sobre un plato y ver el slam. "El plato" (el disco bajo el racimo) es la señal visual
     de "rodea esto": explótala como maestro silencioso. Ese es el momento "...pero mejor".
   El arco de enseñanza ES el pitch del juego: culebrita → culebrita mejorada.

3. CONTENIDO Y VARIEDAD (M3): schedule de hazards randomizado, 2-3 jefes además del Tenedor, y un
   enjambre escalante para la presión tardía. Que dos runs se sientan distintas.

4. AUDIO ADAPTATIVO (P1, sigue CC0 por ahora — la música de sello entra DESPUÉS):
   música por capas atada al calor/multiplicador (entran capas al subir el mult, caen al perderlo),
   crossfade por ganancia en un solo AudioContext (nunca arrancar/parar stems: derivan). Limiter ya
   está (M1). SFX core con transientes reales (el eat con thunk, el enredo con twirl). Sliders
   música/SFX/mute. Deja la ARQUITECTURA lista para sustituir los stems CC0 por los de tu sello sin
   refactor.

5. HARDENING DE PERF (M3): culling del fideo fuera de cámara, post-passes pre-horneados, gradientes
   cacheados, watchdog de auto-LOD por FPS en 3 tiers. Objetivo firme: 60fps en Android de gama baja,
   incluso en el peor reviente. Considera partir render.ts (2200 líneas) por dominios.

6. ACCESIBILIDAD (requisito Steam-grade): reduced-motion real, toggle daltonismo (comida ya se
   distingue por FORMA), texto legible, jugable con una mano en móvil y con teclado en desktop.

VALIDACIÓN FINAL (la vara de Steam):
- determinism 11/11 verdes.
- Un extraño juega 3 runs SIN que nadie le explique nada, y a la 3ª persigue una build a propósito.
- Prueba de miniatura de la Fase 2 sigue pasando.
- 60fps en gama baja en el peor caso.
- La pregunta honesta: al ver un reviente, ¿te dan ganas de grabarlo? Si no, vuelve a la Fase 2.
```

---

## NOTA DE PRODUCCIÓN — cómo usar esto
- Son **secuenciales**: no arranques la Fase 2 hasta que el harness de la Fase 1 demuestre que existen
  builds rotas alcanzables. El arte de un reviente que no existe es humo.
- Cada fase empieza pidiéndole a Claude Code que **lea el estado real del repo y ROADMAP-STEAM.md**, y
  que reporte qué del checklist YA está hecho antes de escribir código. El repo se mueve; el prompt no
  debe asumir.
- La **música de tu sello y el loop viral de compartir** quedan explícitamente para después de estas 3
  fases (tu decisión: CC0 ahora para avanzar). La arquitectura de audio y de captura se deja lista para
  enchufarlos sin reescribir.
```
