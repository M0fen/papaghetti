# EL ENREDO — Prompt Maestro v4.0 (DEFINITIVO)
### Documento de entrega profesional · Julio 2026

> **⚠️ LANZAMIENTO EN MISTERIO:** el juego se publica como **"EL ENREDO"**, sin marca, sin logo,
> sin mencionar Papaghetti. Es un juego de cocina, punto. La revelación y los descuentos vienen después.

---

# PARTE 0 — REGISTRO DE DECISIONES TÉCNICAS

### ✅ Elegido: **Phaser 4.1** (estable desde abril 2026)
Framework 2D completo (escenas, input, audio, tweens, cámaras) con la comunidad más grande. Trae **SpriteGPULayer** (miles de sprites en una sola draw call) y el **sistema de Filtros unificado** (Bloom, Glow, Vignette, ColorMatrix, Blur) — que son, literalmente, las herramientas de juice ya construidas.

### ❌ Descartados (y por qué)
| Opción | Motivo del descarte |
|---|---|
| **Godot 4 (web export)** | Exige headers COOP/COEP para SharedArrayBuffer; el fallo más común es pantalla negra por headers o templates. Bugs históricos en iOS/macOS. Payload WASM+PCK pesado. **Fatal para un teaser de fricción cero en móvil.** |
| **PixiJS v8** | Es solo un renderizador (aunque el más rápido). Tendrías que construir escenas, input y audio a mano. Tiempo regalado. |
| **Unity WebGL** | Bundles enormes, rendimiento pobre en web móvil. |
| **Physics de Phaser (Arcade/Matter)** | No las usamos: nuestra sim es propia y determinista. Desactivarlas ahorra CPU y bundle. |

### 🤔 La alternativa legítimamente superior: **Rust → WASM para el `/sim`**
Daría determinismo bit a bit garantizado y **el mismo binario en cliente y servidor**.
**Decisión: NO, por ahora.** Mata la velocidad de iteración. Como `/sim` queda **totalmente aislado** de la vista, se puede portar después sin tocar una línea de Phaser. La arquitectura deja la puerta abierta a propósito.

### Stack final
`Phaser 4.1 (WebGL forzado)` · `TypeScript estricto` · `Vite` · `sim en TS puro con punto fijo Q16.16` · `Supabase + Edge Function (Deno)` · `Web Audio API` · `PWA offline` · embebido en `Next.js 15` en `/juego`

---

# PARTE 1 — DOS COSAS QUE EL LANZAMIENTO EN MISTERIO CASI SE LLEVA POR DELANTE

### 🔴 1. Si no guardas identidad de jugador DESDE EL DÍA 1, no puedes dar los descuentos después
El plan es: la gente juega sin saber qué es → luego **reciben descuentos según lo que lograron**. Eso es imposible retroactivamente si el juego no persiste **quién logró qué** desde el primer día.

**Obligatorio en el build de lanzamiento:**
- **ID anónimo de jugador** (UUID en localStorage) creado en la primera partida.
- Cada run validada se guarda contra ese ID en Supabase, con su mejor score.
- **Captura de contacto opcional y elegante:** al entrar al top del leaderboard, se ofrece guardar el puesto con un email o alias. Sin obligar, sin muro. Consentimiento claro y mínimo.
- En la revelación, **ese ID es el que canjea el descuento.** Sin esto, toda la campaña se cae.

### 🟡 2. El final debe estar "listo para revelar"
**La Factura NO va en el lanzamiento** (delataría la marca). Pero la pantalla final debe construirse con un **hook de revelación**: hoy muestra un cierre limpio y sobrio; el día del reveal se cambia por el recibo de marca **sin refactorizar nada**.

---

# PARTE 2 — 🎮 EL PROMPT MAESTRO
### (copiar íntegro a Claude Code)

```
Construye "EL ENREDO", un juego arcade roguelite 2D para navegador, calidad de producción,
MOBILE-FIRST sin descuidar desktop.

No es un clon de Snake. Es un juego de habilidad con mecánica propia y sistema de mejoras
tipo roguelite. El estándar de aprobación: debe ser genuinamente divertido por sí mismo.

════════════════════════════════════════════════════════
0. ANTES DE ESCRIBIR UNA LÍNEA
════════════════════════════════════════════════════════
Phaser 4 incluye una carpeta `skills/` en su repositorio con conocimiento profundo del
framework destinado a agentes de IA. LÉELA PRIMERO y sigue sus convenciones.
Estamos en Phaser 4.1, NO en Phaser 3: renderer nuevo, Canvas deprecado, y existen
SpriteGPULayer y el sistema de Filtros unificado. Úsalos.

════════════════════════════════════════════════════════
1. ARQUITECTURA — la decisión más importante del proyecto
════════════════════════════════════════════════════════
SEPARACIÓN ESTRICTA ENTRE SIMULACIÓN Y RENDERIZADO.

/src
  /sim      TypeScript PURO. Cero Phaser, cero DOM, cero Math.random, cero Math.sin.
            Corre en el navegador Y headless en el servidor.
    fixed.ts      // punto fijo Q16.16 + LUT de sin/cos
    rng.ts        // mulberry32 sembrado. TODA aleatoriedad pasa por aquí
    world.ts      // estado del mundo
    step.ts       // step(state, input) -> state. Función PURA y determinista
    enredo.ts     // intersección, polígono, point-in-polygon, área (shoelace)
    spatial.ts    // spatial hash grid
    cards.ts      // registro de mejoras (data-driven)
  /view     Phaser 4. SOLO dibuja el estado que produce /sim. Cero lógica de juego.
  /net      envío y validación de scores

REGLAS DE ORO DEL SIM (violarlas rompe el juego en silencio):
- Punto fijo Q16.16 con enteros. NUNCA Math.sin/cos/pow/sqrt dentro de /sim: las funciones
  de Math tienen precisión dependiente de la implementación y distintos navegadores u
  sistemas operativos devuelven resultados distintos. Usa LUTs precalculadas.
  Para distancias: dx*dx+dy*dy < r*r. Nunca sqrt.
- Fixed timestep 60Hz con acumulador. El render INTERPOLA entre estados (así un monitor de
  144Hz se ve más suave sin que el juego corra más rápido).
- step() es pura: mismo estado + mismo input = mismo resultado, en cualquier máquina.
  Escribe unit tests que lo prueben: el mismo log de inputs debe dar el mismo score 1000 veces.
- El sim no sabe qué es un píxel, ni una textura, ni un evento del navegador.

════════════════════════════════════════════════════════
2. ESTRUCTURA DE LA PARTIDA
════════════════════════════════════════════════════════
Una RUN son 8 niveles ("SERVICIOS") de 60-90s. Run completa: 8-12 min (sesión móvil ideal).
Cada 3 servicios: duelo con EL TENEDOR (nivel boss).
Al terminar cada servicio: pantalla de draft, se elige 1 mejora entre las ofrecidas.

MODOS:
- RUN (principal): roguelite completo con mejoras.
- RUSH 60: 60s, sin mejoras, habilidad pura. Rápido y compartible.
- RETO DIARIO: semilla fija del día. Mismo tablero Y MISMAS CARTAS para todo el mundo.

════════════════════════════════════════════════════════
3. MECÁNICAS BASE
════════════════════════════════════════════════════════

MOVIMIENTO — steering continuo, NO grid.
- La hebra es una polilínea; la cabeza avanza a velocidad constante y el cuerpo la sigue
  con espaciado fijo (follow-the-leader).
- Radio de giro limitado: los giros tienen peso. Nunca 90° instantáneos.
- Buffer de input de 120ms: si el jugador gira dos frames antes de tiempo, se respeta.
  Nunca debe sentirse que el juego "se tragó" un input.
- Boost "Al Dente": mantener pulsado acelera, consume la barra de Almidón, que recarga
  al comer.

EL ENREDO (mecánica firma — el corazón del juego):
- Chocar con tu propio cuerpo NO te mata: cierra un lazo.
- Se forma un polígono desde el punto de intersección hasta la cabeza.
- TODOS los toppings dentro del polígono se recogen de golpe, con multiplicador igual al
  número de toppings encerrados (tope x10).
- COSTO: la sección de cuerpo que formó el lazo SE CORTA. Pierdes esa longitud y los
  puntos bancados en ella.
- Enredo vacío = castigo neto. Enredo grande y calculado = explosión de score.
- Exige un área mínima (fórmula del shoelace) para evitar spam de micro-lazos.
- La longitud es MONEDA DE RIESGO, no un contador pasivo. Ahí vive el skill ceiling.

PEDIDOS:
- Un ticket muestra BASE + 3 TOPPINGS a recoger EN ORDEN.
- Completarlo da bonus grande y sube el multiplicador global un escalón.
- Tiene temporizador. Si expira no mueres, pero pierdes el multiplicador acumulado.
- Tensión de diseño: el Pedido te empuja a moverte con propósito; el Enredo te tienta a
  farmear. El jugador maestro encierra los toppings del pedido en el orden correcto.

MUERTE: solo por los bordes de la sartén, el aceite hirviendo, o EL TENEDOR.
Nunca por tocarte a ti mismo.

════════════════════════════════════════════════════════
4. LA PAPA — la moneda del draft
════════════════════════════════════════════════════════
Los FRAGMENTOS DE PAPA son el recurso de riesgo del juego.
- Duran poco (4-5 segundos), brillan y suenan al aparecer.
- Aparecen en sitios DIFÍCILES: lejos de la cabeza, pegados a los bordes, entre obstáculos.
- No dan solo puntos: llenan el MEDIDOR DE COSECHA del servicio.

EL MEDIDOR DE COSECHA determina el draft al final del nivel:
  Cosecha baja    -> 3 cartas
  Cosecha media   -> 3 cartas + 1 reroll
  Cosecha alta    -> 4 cartas
  Cosecha máxima  -> 4 cartas + 1 garantizada de tipo Receta o Maldición

Esto es clave: arriesgarse por una papa efímera junto al aceite NO es codicia de puntos,
es COMPRAR PODER DE BUILD. La decisión "¿voy o no voy?" se vuelve estratégica, y como la
papa vive 4 segundos, hay que decidir YA.

DOS TIPOS:
- Papa Criolla: pequeña, redonda, dorada. Vida corta. +Cosecha, +Almidón.
- Papa Francesa (servicios avanzados): una LÍNEA DE 4 BASTONES que hay que recoger EN
  SECUENCIA. Completa = Cosecha triple. Incompleta = nada.

PROGRESIÓN (la papa se "gana" con el avance):
- Servicios 1-2: SIN papa. El jugador aprende el loop base.
- Servicio 3: aparece la Papa Criolla. Es un momento de revelación: cambia el juego.
- Servicio 5: aparece la Papa Francesa.
- Servicio 7+: la papa aparece DENTRO de las zonas peligrosas.

════════════════════════════════════════════════════════
5. OBSTÁCULOS — la curva de la cocina
════════════════════════════════════════════════════════
TODOS telegrafiados 1.5s antes (sombra + sonido). Jamás una muerte injusta.

Servicio 1-2:  nada. Solo el loop puro.
Servicio 3:    ACEITE HIRVIENDO — charcos que se expanden y reducen el mundo.
Servicio 4:    OLLAS Y SARTENES — muros estáticos. Obligan a trazar rutas y estorban lazos.
Servicio 5:    CUCHILLOS BARREDORES — barren la sartén con ritmo fijo. Puro timing.
Servicio 6:    SALSA ESPESA — zonas pegajosas que ABREN TU RADIO DE GIRO. No te matan:
               te quitan precisión. Es el enemigo directo del Enredo.
Servicio 7:    BATIDOR ROTATORIO + VAPOR (nubes que tapan la visión).
Servicio 8:    EL TENEDOR + todo lo anterior.

EL TENEDOR (boss): entra desde un borde y te persigue para enrollarte. Se telegrafía 1.5s
antes. Cerrar un Enredo a su alrededor lo bloquea temporalmente.

DIFICULTAD GLOBAL: cada 30s sube la velocidad base y el área útil se contrae. La presión es
ESPACIAL, no numérica: el jugador debe SENTIR que se le acaba el mundo.

════════════════════════════════════════════════════════
6. SISTEMA ROGUELITE — el draft
════════════════════════════════════════════════════════
Cada draft ofrece cartas de tipos distintos:
- INGREDIENTE (amarillo): buff medio, SIN contrapeso. La opción segura.
- RECETA (rojo): buff potente CON un debuff real. La opción interesante.
- MALDICIÓN (negro, ocasional): debuff brutal con recompensa enorme.

TRES LEYES DE DISEÑO (no negociables):
1. Ningún debuff es solo "peor": debe CAMBIAR CÓMO SE JUEGA. Prohibido "-10% score" a secas.
   Permitido "giras más lento" (arruina lazos cerrados, premia lazos enormes).
2. Toda anti-sinergia debe tener CURA en el pool: si una carta te da hitbox grande, otra
   debe volver eso una ventaja. Ese "arreglé mi propio problema" es el placer del género.
3. Algunas builds deben QUERER el debuff. Es la prueba de que el sistema está bien diseñado.

REROLL: 1 por draft, ganado SOLO si completaste todos los pedidos del servicio sin fallar.

POOL DE LANZAMIENTO (14 cartas):

HEBRA
1. [ING] Al Dente ......... +12% velocidad de giro.
2. [REC] Hebra Gruesa ..... +35% score por topping / hitbox más grande.
3. [REC] Cabello de Ángel . Giro cerradísimo, hitbox mínima / -25% score por topping.
4. [REC] Almidón Puro ..... Boost infinito / NO PUEDES FRENAR, velocidad base +20%.

ENREDO
5. [REC] Lazo Ávido ....... Multiplicador máximo x15 / el área mínima del lazo se duplica.
6. [REC] Corte Limpio ..... El Enredo ya no corta tu cola / multiplicador máximo baja a x4.
7. [ING] Enredo Ardiente .. El área del lazo QUEMA el aceite que encierra.
8. [REC] Lazo de Hierro ... Encerrar un obstáculo lo DESTRUYE para el resto del servicio /
                            cada Enredo te cuesta 15% más de cola.
TOPPINGS
9. [REC] Chicharrón Crocante . Cada 5º topping ESTALLA: limpia aceite + bonus /
                               los toppings caducan 30% más rápido.
10.[REC] Piña Ácida ....... Los nuggets de piña dan +Almidón y valen x1.5 / cada uno te da
                            un tirón de velocidad incontrolable.
11.[REC] Tocineta Ahumada . Dejas una estela de humo que FRENA a EL TENEDOR / el humo
                            también TE TAPA A TI la visión.
PAPA
12.[ING] Ojo de Criolla ... La papa dura 50% más.
13.[REC] Cosecha Voraz .... La papa da el DOBLE de Cosecha / la papa solo aparece DENTRO
                            de zonas peligrosas.
COCINA
14.[REC] Fuego Alto ....... +50% score global / el aceite crece al doble.

SINERGIAS QUE EL JUGADOR DEBE DESCUBRIR SOLO (no las expliques en el juego):
- Hebra Gruesa (hitbox grande) + Enredo Ardiente (quemas aceite) -> el hitbox deja de importar.
- Cosecha Voraz (la papa vive en el peligro) + Lazo de Hierro (destruyes obstáculos) ->
  te fabricas tu propia zona segura donde antes había trampa. La mejor del pool.
- Almidón Puro (no frenas) + Cabello de Ángel (giro cerradísimo) -> build de velocidad pura.
- TRAMPA INTENCIONAL: Corte Limpio (techo x4) + Lazo Ávido (techo x15) SE ANULAN.
  El pool debe castigar la codicia distraída.

════════════════════════════════════════════════════════
7. LAS MEJORAS Y EL DETERMINISMO (CRÍTICO)
════════════════════════════════════════════════════════
Implementar esto mal ROMPE EL ANTI-TRAMPA EN SILENCIO y empieza a rechazar jugadores honestos:

- La ELECCIÓN DE CARTA ES UN INPUT. Va al log de inputs (frame + índice elegido).
- Las cartas ofrecidas salen del RNG SEMBRADO. Mismo seed = mismas cartas. Obligatorio para
  que el Reto Diario sea justo (mismo tablero Y mismas opciones).
- El NÚMERO de cartas ofrecidas depende del Medidor de Cosecha, que es estado del sim.
- CERO FLOATS en los modificadores. "+35%" NO es `* 1.35`: es un multiplicador en punto fijo
  Q16.16. Un solo float en /sim y el servidor desincroniza.
- Las cartas son modificadores PUROS de estado dentro de /sim. Nunca lógica en la vista.
- Registro data-driven: { id, tipo, nombre, texto, apply(state) }. Balancear = tocar datos,
  no lógica.
- Lazo de Hierro obliga a que los obstáculos sean entidades del sim con estado
  activo/destruido, y a que el point-in-polygon corra también sobre obstáculos.

════════════════════════════════════════════════════════
8. MOBILE-FIRST (requisito duro, no aspiración)
════════════════════════════════════════════════════════
Diseña para un Android de gama baja, en vertical, con UNA sola mano. Luego escala a desktop.
Si algo solo funciona bien en desktop, está mal hecho.

CONTROL TÁCTIL:
- Steering por ARRASTRE RELATIVO desde cualquier punto de la pantalla. NUNCA control absoluto
  (el dedo taparía la cabeza de la hebra).
- SESGO DE CÁMARA: desplaza el viewport para que la acción quede ARRIBA de la zona del pulgar.
  La oclusión por el dedo es la causa #1 de muertes injustas en móvil.
- Boost = mantener pulsado o segundo dedo. Debe poder jugarse con una mano.
- Pointer Events (pointerdown/move/up) con { passive: false }. No touch events.
- Todo lo interactivo va en el tercio inferior. Nada crítico arriba.

VIEWPORT (esto rompe juegos web constantemente):
- Usa `dvh`, NUNCA `vh` (la barra de direcciones de iOS rompe 100vh).
- En el canvas y su contenedor:
    touch-action: none;            /* mata scroll y doble-tap zoom */
    overscroll-behavior: none;     /* mata el pull-to-refresh */
    user-select: none;
    -webkit-tap-highlight-color: transparent;
- Respeta env(safe-area-inset-*): el HUD no puede quedar bajo el notch ni la barra de gestos.
- Phaser Scale.RESIZE (no FIT): área de juego segura + zoom de cámara para que la sartén
  siempre quepa, en vertical y horizontal.
- Pausa automática en `visibilitychange` (llamada entrante, cambio de app).
- Screen Wake Lock API para que no se apague la pantalla.

RENDIMIENTO MÓVIL:
- CAPA EL DEVICE PIXEL RATIO A 2: Math.min(window.devicePixelRatio, 2). Renderizar a DPR 3-4
  en un móvil barato es la forma más rápida de perder 30fps sin ganar nada visible.
- SpriteGPULayer de Phaser 4 para el cuerpo de la hebra y las partículas: UNA draw call en
  vez de cientos. Es el mayor unlock de rendimiento del proyecto.
- Object pooling estricto: CERO asignaciones (new, literales, arrays) dentro del game loop.
  El GC en móvil produce tirones perceptibles.
- Spatial hash grid para las colisiones. Nunca O(n²): con 300+ segmentos mata el framerate.
- Un solo texture atlas. Bundle inicial < 3MB. Objetivo: 60fps sostenidos en Android barato.
- Detección de FPS con degradación automática de partículas y filtros en 3 tiers.
- PROBAR EN UN ANDROID REAL Y BARATO, no solo en el emulador de Chrome DevTools.

AUDIO EN MÓVIL:
- iOS exige reanudar el AudioContext tras un gesto: incluye una pantalla "Toca para jugar"
  que desbloquee el audio explícitamente.
- Música en capas: arranca TODOS los stems a la vez en un único AudioContext y controla solo
  la GANANCIA (crossfade). Nunca los arranques y pares por separado: derivan.

HAPTICS:
- navigator.vibrate NO EXISTE en iOS Safari. Los haptics son un plus en Android, JAMÁS un
  canal de feedback primario. Todo evento debe entenderse sin vibración.

DESKTOP (no es ciudadano de segunda):
- Ratón (steering hacia el cursor) + WASD/flechas. Boost con click o Espacio.
- Pantalla completa, pausa con ESC, presupuestos más altos de partículas y filtros.

════════════════════════════════════════════════════════
9. GAME FEEL (no es pulido opcional — ES el producto)
════════════════════════════════════════════════════════
Cada input produce reacción visible en menos de 1 frame. Sin excepción.

- Squash & stretch: la hebra se ESTIRA al boostear, se ENGORDA al frenar; la cabeza hace
  squash al comer.
- Hit-stop: congelar 60ms al cerrar un Enredo, 100ms al completar un Pedido.
  (Congela el RENDER, nunca el timestep del sim.)
- Screen shake proporcional: comer 1px / Enredo 4px / Pedido 8px / muerte 14px.
- Micro-zoom de cámara (1.02x con easing) al cerrar Enredo.
- AL CERRAR EL ENREDO, EL ÁREA ENCERRADA SE RELLENA DE DORADO 200ms antes de recoger, con
  Bloom (filtro nativo de Phaser 4). Esa es la imagen que la gente va a grabar y compartir.
- Partículas: salpicaduras de salsa al comer, vapor al boostear, estela de aceite.
- Números flotantes con squash + easing. Nunca aparecen "planos".
- LA SARTÉN SE CALIENTA: la paleta ENTERA se calienta con el multiplicador (filtro
  ColorMatrix): crema -> ámbar -> rojo brasa. La viñeta se cierra. Al perder el multiplicador,
  todo se ENFRÍA DE GOLPE: el castigo se SIENTE antes de leerse.
- LA BUILD DEBE VERSE: cada carta cambia el aspecto de la hebra. Hebra Gruesa la engorda.
  Cabello de Ángel la afila. Enredo Ardiente le pone rescoldos. Las maldiciones la carbonizan
  con brillo rojo. Al final de la run, tu hebra es un retrato de tus decisiones.
- Música por capas: al subir el multiplicador ENTRAN capas (percusión -> bajo -> lead); al
  perderlo, se caen. El jugador OYE su racha.
- Pitch escalado: cada topping consecutivo sube el pitch un semitono.
- La papa tiene su propio sonido, agudo y urgente. Debe generar ansiedad al aparecer.

ACCESIBILIDAD (requisito, no extra):
- Toggle "Reducir efectos" (el juice fuerte marea a algunas personas).
- Los toppings se distinguen por FORMA, no solo por color (daltonismo).
- Los debuffs de las cartas se enuncian en lenguaje llano y explícito.

════════════════════════════════════════════════════════
10. PERSISTENCIA, LEADERBOARD Y ANTI-TRAMPA
════════════════════════════════════════════════════════
IDENTIDAD DE JUGADOR (obligatorio desde el día 1):
- UUID anónimo en localStorage, creado en la primera partida.
- Toda run validada se asocia a ese ID en Supabase con su mejor score.
- Al entrar al top del leaderboard, se OFRECE (sin obligar, sin muro) guardar el puesto con
  un alias o email. Consentimiento claro y datos mínimos.
- Este ID es la base de una campaña posterior de recompensas. No es opcional.

ANTI-TRAMPA — el score JAMÁS se confía al cliente:
- El cliente envía: seed, score, duración y el LOG DE INPUTS (frame + ángulo + boost +
  elección de carta).
- Una Edge Function de Supabase importa EL MISMO módulo /sim y RE-SIMULA la partida headless.
  Como el sim es punto fijo y determinista, el resultado es idéntico. Si el score no coincide,
  se rechaza.
- Validaciones extra: longitud del log coherente con la duración, tasa de inputs humanamente
  posible, rate limiting, RLS.
- Tabla runs: id, player_uuid, alias, mode, seed, score, duration_ms, input_log jsonb,
  cards_picked, verified bool, created_at.

GUARDADO DE RUN: persistir el log de inputs en IndexedDB para reanudar tras una interrupción
en móvil (las runs duran 8-12 min; en móvil te interrumpen).

════════════════════════════════════════════════════════
11. BANCO DE PRUEBAS DE BALANCEO (gratis gracias al sim puro)
════════════════════════════════════════════════════════
Construye un runner HEADLESS que simule 10.000 partidas con bots y saque la distribución de
score por carta. Telemetría de pick_rate vs score_medio.
Una carta con 80% de pick rate está ROTA. Una con 3% está MUERTA. Ambas son bugs de diseño.
Con 14+ cartas, balancear a ojo es imposible. Esto no es opcional.

════════════════════════════════════════════════════════
12. IDENTIDAD VISUAL (juego sin marca)
════════════════════════════════════════════════════════
El juego se llama "EL ENREDO". NO lleva logo, ni marca, ni nombre de restaurante. Es un juego
de cocina y nada más. No inventes branding.

Paleta (cálida, apetitosa, premium): crema #FBF1DE, espresso #1E1611, ámbar #F2A516,
rojo tomate #C8321E, verde #4C9A5A.
Estética plana, vectorial, cálida, elegante. Premium-lúdica, nunca caótica ni infantil.

PANTALLA FINAL: cierre sobrio (score, mejor Enredo, cartas usadas) construido con un HOOK DE
REVELACIÓN: debe poder sustituirse por una pantalla de marca más adelante SIN refactorizar.
Aísla ese componente.

════════════════════════════════════════════════════════
13. INTEGRACIÓN Y BUILD
════════════════════════════════════════════════════════
- Paquete standalone con Vite + TypeScript estricto (HMR rápido, sin overhead de Next).
- Se integra al Next.js 15 existente en /juego como client component con dynamic import y
  ssr:false. Phaser NUNCA debe entrar al bundle principal: debe quedar en el chunk de esa ruta.
- Phaser config: type: Phaser.WEBGL (Canvas está deprecado), physics DESACTIVADA (usamos
  nuestra propia sim), Scale.RESIZE, DPR capado a 2.
- PWA instalable + offline (service worker). El juego debe abrir sin red.

════════════════════════════════════════════════════════
14. ORDEN DE CONSTRUCCIÓN
════════════════════════════════════════════════════════
SPRINT 1: /sim (punto fijo, LUT, RNG sembrado, step puro) + /view mínima con FORMAS GRISES +
steering táctil relativo + timestep fijo + unit tests de determinismo.

>>> PUERTA DE CALIDAD INNEGOCIABLE <<<
No avances hasta que mover la hebra SE SIENTA DELICIOSO en un teléfono real, con formas grises
y sin nada de arte. Si el movimiento no es rico en pelado, ningún asset lo va a salvar.

Después: Enredo -> Papa y Cosecha -> Pedidos -> obstáculos y modos -> draft y las 14 cartas ->
pase de juice y audio -> leaderboard, anti-trampa, PWA, rendimiento, accesibilidad.

Empieza por el Sprint 1. TypeScript estricto. Arquitectura limpia. Sin dependencias innecesarias.
```

---

# PARTE 3 — PLAN DE ENTREGA (8–9 semanas)

| Sprint | Foco | Puerta de calidad |
|---|---|---|
| **1** | Sim + steering + cámara, formas grises | **¿Se siente rico en un móvil real, sin arte?** |
| **2** | Enredo (polígono, corte de cola) + spatial hash | Cerrar un lazo es satisfactorio por sí solo |
| **3** | Papa + Cosecha + Pedidos + score | El loop completo invita a repetir |
| **4** | Obstáculos + EL TENEDOR + los 3 modos | Juego completo, feo pero completo |
| **5** | Draft + las 14 cartas + registro data-driven | Dos runs seguidas se sienten distintas |
| **6** | **Pase de JUICE** + audio en capas + arte | Aquí nace la magia |
| **7** | **BALANCEO** (banco headless, 10.000 runs) | Ninguna carta con pick rate >60% o <10% |
| **8** | Leaderboard + anti-trampa + PWA + perf + accesibilidad | 60fps en Android barato |
| **9** | QA, pulido, colchón | Listo para el teaser |

### Definición de "terminado"
- ✅ 60fps sostenidos en un Android de gama baja **real**
- ✅ Los tests de determinismo pasan 1000/1000
- ✅ El servidor valida runs legítimas sin falsos rechazos
- ✅ Ninguna carta rota ni muerta según el banco de pruebas
- ✅ Jugable de principio a fin **con una sola mano**, en vertical
- ✅ Abre sin red (PWA)
- ✅ Un desconocido lo juega 3 veces seguidas sin que nadie le explique nada

---

### Nota final de alcance
Esto es un juego real, no una pieza de marketing. **8–9 semanas.** Es el componente más caro y más valioso de todo Papaghetti — y el único que la gente va a compartir por voluntad propia.
