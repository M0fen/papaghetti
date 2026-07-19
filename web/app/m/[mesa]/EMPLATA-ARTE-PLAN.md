# EMPLATA — Plan de arte y experiencia (estudio de 10 agentes, 2026-07-19)

Estudio orquestado: 5 auditores (código + crítica en vivo de producción + 3 sweeps de
referentes mundiales) → 3 diseñadores senior (lente arte / juice / mecánicas) → panel
adversarial (director de arte despiadado + productor técnico). 28 propuestas, filtradas.
Objetivo del dueño: **que EMPLATA se sienta premium y del más alto nivel mundial**, sin tocar
el flujo de pedido/catálogo, Canvas2D puro, LCP<2.5s, 60fps en Android de gama media, una mano.

Referentes que anclan el plan: **Venba** (la comida más apetitosa del medio: sprites desde
fotos reales, micro-momento de estrellato por ingrediente), **Ghibli** (vapor senoidal perpetuo
= calor), **Fruit Ninja** (feedback DONDE ocurre el impacto, partículas del color dominante),
**Papa's Pizzeria/Flipline** (armar el pedido a mano ES el producto), **Nour** (energía cinética
→ intensidad de audio), **Le Petit Chef + Domino's Pizza Tracker** (la espera post-pedido ES el
show), **Kura Sushi Bikkura-Pon** (gacha por progreso), **QR→WhatsApp LatAm** (la foto compartida
como anuncio orgánico).

---

## TIER 0 — FUNDACIÓN (esta tanda; NOW/NOW en ambos jueces)
Todo lo demás hereda de esto. Bajo riesgo, altísimo retorno, o correctness pura.

### T1 · Tipografía de marca en el canvas — **BUG, S, impacto 5** ✅ objetivo
Los 7 `ctx.font` usan `var(--pg-font-*)` — canvas NO resuelve custom properties, y además el
nombre real es `--font-display`/`--font-body` (no `--pg-font-*`). Resultado hoy: **todo el texto
del juego (wordmark, pestañas, nombres, precios, price-pops, sello PG) se dibuja en `10px
sans-serif` genérica.** Es el defecto visible nº1. Fix: portar `resolveFonts()`/`fontD()`/`fontB()`
de `web/game/view/render.ts:85-122` (gatear con `document.fonts.ready`, releer al resolver).
Hornear los textos con efecto (wordmark letterpress, pops con `strokeText` lineJoin round, PG en
Bricolage emboss). Medir nombres con `measureText` (elipsis real, no `slice(0,14)`).

### T2 · Reloj de tiempo real (dt) — **M, impacto 5** ✅ hecho
`wd.t++` asumía 60fps: en pantallas 90/120Hz (gama media 2025+) TODA la coreografía corría 1.5-2×
(fideo nervioso) y la caja se plegaba ~575ms antes de que `confirmar()` despertara del
`setTimeout(950)` — clímax muerto. **Hecho:** `dt = min((now-last)/1000, 1/30)`; `wd.t += dt*60`
(unidades de 60fps → no se reescriben constantes); toda la física y decays escalados por `df=dt*60`
(`pow(0.86,df)` para decays, `*df` para velocidades). Los spawns por módulo (`t%34===0`) → probabilidad
`rand()<p*df`; la entrada de la caja → one-shot `entered`. Con dt-normalización, el `setTimeout(950)`
ya siempre supera al plegado (que ahora dura ~0.76s reales sea cual sea el refresh) — se mantiene.
Los **muelles amortiguados** (integrador semi-implícito, presets crítico/subamortiguado/golpe) se
implementan en el **Tier 1**, donde los consumen W2 (cadena del fideo) y W3 (caída del sello): dan
anticipación/overshoot/follow-through. Aquí no se usaban aún → se difieren para no dejar código muerto.

### T3 · Bus maestro de audio + energía cinética — **S, impacto 4**
`unlock()` crea una vez `master Gain → DynamicsCompressor(-18,4) → destination`; `tone/ruido`
conectan a master (hoy van directo a `destination` → un combo rápido puede clipear el parlante).
Cachear 1 `AudioBuffer` de ruido y reproducir con offset. `caida(ing, energia)` con
`energia=clamp(vy/14,0,1)`: `peak*=0.6+0.4*energia` + detune ±25 cents (dos papas nunca suenan
igual). Combo cuantizado a pentatónica (392/440/523/587/698). ~40 líneas. Ancla: **Nour**.

### T4 · Disciplina de color + jerarquía del CTA — **S, impacto 4**
Hoy conviven rojo (precios → connota error), verde-UI, azul del emoji altavoz, morado del
post-pedido → fragmentan la armonía kraft/ámbar/espresso/crema. Y **EMPLATAR es crema-sobre-crema:
lee como DESHABILITADO** mientras la pestaña activa le roba jerarquía. Fix: precios en espresso;
GRATIS como chip kraft; iconos propios en vez de emoji de sistema; EMPLATAR = ámbar sólido con
sombra (único bloque ámbar grande inferior); PEDIR YA a ghost; verde solo albahaca desaturado
`#7A8C4F`. Canvas + `emplata.css`.

### T5 · Escenario con UNA luz: fondo horneado + grano + viñeta — **M, impacto 5**
Hornear TODO el fondo estático (crema+wallPat+luz+mostrador) a un offscreen por resize, y ahí:
pool de luz radial ↖ visible, canto real pared/mostrador (línea crema-ámbar + sombra de contacto),
veta de madera ondulada, y **tile de ruido 128px alpha 0.04** (banding a cero). En vivo solo 2
capas cacheadas: **viñeta** espresso alpha ~0.28 descentrada ↖ (multiply) + velo ámbar 0.05
(soft-light) que unifica todo bajo una temperatura. Grano+viñeta son los dos marcadores "expensive"
que `render.ts` cachea a propósito y aquí faltan. **Bonus de perf**: elimina 3 gradientes anchos +
2 fills por frame del hot path — headroom que paga las demás propuestas.

### T6 · Vapor Ghibli perpetuo + gate reduced-motion — **S, impacto 4**
Vapor = 2-3 bezier con offset senoidal que NUNCA se detienen (quitar `pila.length>0`), activo desde
el despliegue, dot-sprites horneados, retroiluminado +30% al cruzar la luz ↖. Primer asomo del
fideo curioso a ~3s (no 7s). `prefers-reduced-motion` dentro del componente (hoy no existe rama
matchMedia en EmplataGame) → vapor congelado. Elimina el `createRadialGradient` por puff por frame.

---

## TIER 1 — MOVIMIENTOS FIRMA (siguiente; WOW en el panel)
Alto esfuerzo, definen la experiencia. Dependen del Tier 0 (reloj dt + fuentes + fondo).

### W1 · El hero shot: interior de caja que da hambre — **L, impacto 5**
Hoy la "caja llena" lee VACÍA: sprites flotando sobre panel espresso plano, sin suelo, sin paredes,
sin contacto. Construir interior por capas: suelo kraft iluminado ↖ (cacheado) → BASE como CAMA
elíptica (sprite propio, no item flotante) → sombra doble horneada por item (contacto + halo
ambiente, multiply, espresso) → blob AO en cada contacto entre items (stickers → MASA) → labio
frontal DESPUÉS de la pila (por fin DENTRO) → profundidad por escala (fila trasera 0.94× y 4% más
oscura). Pila dormida → snapshot a 1 canvas. Anclas: **Monument Valley** (oclusión pintada),
**Josh Comeau** (sombras en capas con matiz), **Papa's**.

### W2 · El fideo mesero lee como ser vivo — **M, impacto 5**
Hoy en el agarre es "cable USB dorado sin ojos"; en idle, "palito rígido que atraviesa la comida".
Taper real (7px→3px), cabeza con volumen, **ojitos SIEMPRE visibles** (también en agarre/acarreo).
Bezier rígido → cadena de 6-8 seguidores con muelle (anticipación + follow-through + recoil al
soltar). Orden de capas: nace ocluido por el labio trasero (sale de DENTRO); idle por delante del
borde pero detrás de la pila. Idle 8-10s con 2-3 variantes (noodle-dance guiño a EL ENREDO).
Scratch arrays (cero alocación). Anclas: **Battle Chef Brigade**, **Le Petit Chef**.

### W3 · Cierre origami REAL + sello con hit-stop — **L, impacto 5 (clímax nº1)**
El cierre hoy es un crossfade de alfa (la apertura sí rota solapas — asimetría). Reemplazar por
plegado espejo con overlapping (laterales easeInBack → trasera → tapa, stagger 70ms); la bandeja
sale con muelle crítico y la caja crece 8% a centro-escena. Sello horneado como sticker con borde
festoneado + emboss + PG en Bricolage; cae 1.6→1 con muelle k=300, contra-rotación del monograma.
En el contacto: **hit-stop 90ms** (timescale 0.25 del dt), onda radial, 16 chispas, vibrate,
sonido nuevo (crinkle + thump 80Hz + campanita 1568Hz). Skippeable con tap; reduced-motion → estado
sellado directo. **Requiere T2 (dt).** Anclas: **Venba/Ghibli** (ceremonia).

### W4 · La espera es el teatro: tracker KDS dentro del canvas — **M, impacto 5**
NO desmontar EmplataGame al confirmar. Fase `espera` en world-state, estado real del polling ya
existente (recibido/cocina/listo/entregado, 5s). Caja sellada al fondo; el Fideo Mesero actúa una
viñeta en loop por estado REAL (ticket / vapor+sizzle+luz pulsante / campanita+chispas+haptic /
reverencia). DOM actual → capa `aria-live` visually-hidden (accesibilidad + reduced-motion).
Bajar a 30fps y pausar en `visibilitychange`. Anclas: **Domino's** (85% ventas digitales),
**Le Petit Chef** (135 sedes), **Haidilao**.

### W5 · Comparte tu caja: foto vertical del emplatado — **S, impacto 5**
Al sellar, componer offscreen 1080×1920 "hero" (caja sellada + pila real + wordmark Bricolage +
MESA n + ingredientes) → `canvas.toBlob` → `navigator.share({files})`; fallback: descargar + `wa.me`.
Cero backend. **Depende de T1 (fuentes) y W3 (sello con lacre)** — compartir la fuente rota sería
anti-marketing. Ancla: **QR→WhatsApp LatAm** (+60% pedidos en casos citados).

---

## TIER 2 — JUICE FINO (rápido, tras Tier 0)
- **El aterrizaje como golpe completo** (M/5): escala continua carta→reposo con muelle (mata el pop
  seco 77→113/56px), squash con conservación de volumen, burst 6-10 partículas del color dominante
  (samplear 1px del offscreen), micro-mancha kraft multiply, sombra de caída que encoge, `vibrate(10)`
  solo en el 1er contacto. Ancla Fruit Ninja.
- **Price-pops que nacen del impacto** (S/4): en la posición REAL de aterrizaje, empuje +22px en
  combos, texto horneado (hereda T1), muelle de entrada, trail del pulgar al arrastrar.
- **Sprites al tamaño de destino × DPR** (M/4): `bakeSprite` hornea a 96px fijos sin DPR → la cama
  base (heroína central) sale borrosa (2.35× upscale). Hornear a tamaño destino × dpr.

## TIER 3 — MECÁNICAS DE MENÚ (evaluar con el dueño; algunas piden backend)
- **Postre en el minuto exacto** (S/4): cuando KDS dice 'entregado', el fideo ofrece algo dulce.
- **El chef sugiere** (S/4): una carta destacada según lo emplatado (upsell como curaduría).
- **Bautiza tu caja** (S/3): nombre propio del pedido, en la tapa y la foto.
- **Cápsula/gacha por progreso** (Kura), **pasaporte de mesa** (localStorage, fideo te reconoce),
  **modo ronda** (una caja por comensal): valiosas pero mayor alcance/−ROI inmediato o backend.

## DESCARTADO por el panel
- "Overture de apertura + idle de juguete" (KILL/KILL): satura los primeros 5s; el T6 lo cubre mejor.
- "Cápsula gacha con premio real" en su forma completa (KILL/NEXT): requiere backend de canje/control
  de abuso; dejar solo la animación de recompensa como guiño, sin premio real, si acaso.
- Los KILL restantes eran duplicados entre-lentes de W2/W3/W4/W5 (el panel dedupe-ó).

---
Fuente completa del estudio: task `w7h94ob26` (journal en subagents/workflows/wf_7fcc68c1-829/).
Adaptaciones de criterio ya aplicadas: los toppings son únicos por id; `--pg-font-*` no existe
(usar `--font-display`/`--font-body`); no instalar Three.js; fallback 2D intacto.
