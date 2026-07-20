# EMPLATA — Auditoría de mejoras v2 (estudio de 15 agentes, 2026-07-19)

Estudio orquestado sobre el estado REAL del código (no sobre el plan): 7 disectores por fragmento
(sprites · caja · fideo · escena · bandeja · concepto/shell · juice/audio/perf) + 5 investigadores
de referentes mundiales (menús interactivos · comida 2D apetitosa · empaque premium · animación de
mascota · microUX móvil) → 2 síntesis senior (arte / producto) → juez adversarial. Objetivo del
dueño: EMPLATA **premium, dinámico, alta tecnología, clase mundial**, sin tocar el cerebro
(catálogo/precios/`enviarPedido`), Canvas2D puro, 60fps gama media, una mano.

## Veredicto de partida
EMPLATA ya es **artesanía de estudio, por encima del 90% de menús-web**. La base premium se PROTEGE,
no se reconstruye: reloj dt-normalizado + muelles semi-implícitos + hit-stop 90ms, bus maestro con
compresor, horneado de sprites con una luz ↖ coherente, teatro KDS dentro del canvas, foto vertical
al compartir, tipografía de marca resuelta en canvas. El salto a "clase mundial" **no son features
nuevas**: son tres frentes → (1) cerrar regresiones que el ARTE-PLAN ordenó y el código no cumplió,
(2) materialidad de comida jugosa, (3) dimensionalidad de la caja + ceremonia del clímax.

## El hallazgo #1: REGRESIONES (deuda ya aprobada, verificada en fuente)
No son ideas a debatir — el criterio ya estaba resuelto en el ARTE-PLAN v1 y el código quedó corto:
- **Termómetro promedia** `pf=agg/nA` (2834) en vez de dominancia → más ingredientes = barras más
  cortas y "BIEN BALANCEADO" (valor invertido: debería CRECER al construir).
- **Grano 42px** (`gn=42`, 1168), T5 pedía 128px.
- **Nombres con `slice`** (2509-2510), T1 exigía `measureText`/elipsis real (parte palabras a la mitad).
- **6 emojis de sistema** (3089/3097/3118/3122/3127/3171) pese al mandato "cero emojis" de T4.
- **Cierre persiana** `ctx.scale(1,lidS)` (2116), W3 especificó plegado origami real.
- **Cadena de seguidores del fideo** (W2) **nunca se construyó** — cuerpo = bezier estático (1487-1497),
  muelle solo en la cabeza.
- **Gate reduced-motion incoherente**: calma el shake (1666) pero el flash de sabor (2874-2887),
  bursts y haptics siguen disparando.

---

## T1 — Cobrar regresiones + correctness + delatores baratos (sin backend, sin tocar el cerebro)
1. **Emojis del shell → SVG propios** (concepto, imp4/S). 🔇🔊⚡😴📸 + 🍝 del share → SVG inline stroke espresso.
2. **Nombres con measureText/elipsis real** (bandeja, imp4/S). 2509-2510, precio espresso como ancla.
3. **Sombra de caja direccional ↘ dos capas** (escena, imp5/S). 1717-1723: offset ↘, rotar 12-18°,
   estirar ×1.4, núcleo duro + halo difuso. Mata el look de sticker.
4. **Termómetro por dominancia, no promedio** (concepto, imp4/M). 2834: máx-por-eje; barras 5→8-10px con pulse.
5. **Blending aditivo en bursts y chispas** (juice, imp4/S). 2346-2350 y 2275-2281 → `lighter` + core blanco.
6. **Gate reduced-motion completo** (juice, imp4/M). Capar flash/bursts/puffs/pops/haptics con `reduce`.
7. **Separación de color entre fritos + AO intra-sprite** (sprites, imp4/S). criolla/pollo/piña sin compartir
   mid+dark; blob AO entre sub-elementos.
8. **Grano 128px + limpieza de código muerto** (escena, imp2/S). `gn` 42→128; quitar `*(1-t)*0` (1138) y `void eyes` (2756).
9. **muestrearColor: sesgo HSV real** (sprites, imp3/S). 536-544 es media plana y muestrea POST-horneado → todo ámbar.
10. **Feedback a taps muertos + hit-test sin huecos + haptic por energía** (bandeja, imp3/S). step/2 en hit-test;
    micro-shake al tocar agotado; `vibrate(4+energia*16)`; combo octave-wrap.

## T2 — Movimientos firma de alto wow (sin backend)
1. **Modelo de material: salsas glossy** (sprites, imp5/M). `material(glossy|mate|semi)`; highlight elíptico + menisco.
2. **Generador procedural por nombre + semilla** (sprites, imp5/M). Rutear por `ing.nombre`; hash determinista.
3. **Paredes laterales de la caja (volumen 3/4)** (caja, imp5/M). Dos trapecios en perspectiva; flauta en tapa/labio.
4. **Cierre origami real (revertir W3)** (caja, imp5/L). Tapa que pivota con shear + cara interior; solapas easeInBack stagger.
5. **Cadena de seguidores: el cuerpo del fideo ondula** (fideo, imp5/M). 3-4 nodos con springStep, rigidez graduada, recoil.
6. **Ojos con pupila direccional + boca + squash por velocidad** (fideo, imp5/M). lookAt foco; parpadeo por-seed; boca 3 estados.
7. **Foto compartida a paridad + hero SELLADO con ventana troquelada** (compartir, imp5/M). Reusar bakeFrontBand/lacre/kraftPat.
8. **Sello prensado (emboss real) + foil de cobre único** (branding, imp4/M). Bevel doble; specular solo en monograma/wordmark.
9. **Haz volumétrico + split-tone + origen de luz único** (escena, imp4/M). Shaft ↖; `const LIGHT`; velo modulado por máscara.
10. **Rim físico por color del ingrediente** (sprites, imp3/S). Tintar rim; recortar al 35% lejano a la luz.

## T3 — Ambición autoral + ceremonia multisensorial (casi todo localStorage; backend solo donde suma)
1. **Noodle-dance del fideo como show de la espera** (escena, imp5/M). Número keyframed por estado KDS (Haidilao + EL ENREDO).
2. **Haptics reales en iPhone (switch-hack) + `impactos()` crossmodal** (juice, imp5/M). Safari no tiene vibrate; `<input switch>`.
3. **Held-frame de anticipación + logo sónico exclusivo del sello** (juice, imp4/S). ~250ms de silencio→golpe; frase de 3 notas.
4. **Impacto de audio en dos etapas + whoosh al soltar** (audio, imp4/M). Thump grave en el 1er rebote; vuelo hoy mudo.
5. **Coach de primer-toque diegético (one-shot)** (onboarding, imp5/M). "toca para servir" que se autodestruye; NO overture.
6. **Combos secretos con nombre + sellos cosméticos** (concepto, imp4/M, backend opcional). Recetas ocultas → sello + nombre en la foto.
7. **Compartir a Instagram Stories con atribución** (compartir, imp5/M, backend p/medir). Deep-link stickers + CTA de retorno.
8. **Etiquetas KDS sensoriales + goal-gradient** (onboarding, imp3/S). "tu caja entró al sartén"; gaze del fideo por estado.
9. **Nota de origen editorial por ingrediente** (concepto, imp3/S). Frase horneada al agarrar; campo estático VIEW-side.
10. **Foreground bokeh + mesa con volumen** (escena, imp4/M). Tríada fondo/sujeto/primer-plano; grosor del tablero.

## Contradicciones resueltas por el juez
- **All-matte (packaging) vs. salsas glossy (food-photo)** → gobiernan superficies distintas: EMPAQUE mate
  (único metal = cobre del sello); la COMIDA es el héroe y va glossy.
- **Foto: caja abierta con sello flotando (contradicción)** → hero de caja SELLADA con **ventana troquelada**
  por la que asoma la pila con vapor (sellado premium + sneak-peek).
- **Cobre vs. lacre rojo** → primero profundizar el EMBOSS del lacre rojo actual (menor riesgo); cobre solo para el monograma.
- **Coach de primer-toque vs. "overture" descartado** → hint one-shot que se autodestruye en el primer tap, no un delay.
- **Capa de horneado global vs. luz por-elemento en sprites multi-parte** → bajar su alpha 0.30→0.15 y estrechar radio.

Fuente: task `wuuiv3now` / run `wf_c17180f5-f80` (journal en subagents/workflows/wf_c17180f5-f80/).
