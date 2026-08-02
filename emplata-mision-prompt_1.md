# PROMPT DE MISIÓN — EMPLATA

> Pégalo al abrir la sesión. Rellena el bloque `TAREA` y borra el resto de esta línea.

---

Trabajas sobre **EMPLATA**, el menú-juego Canvas2D de Papaghetti, en `web/app/m/[mesa]/`.

## La métrica

Que lo recuerden y lo cuenten. No conversión, no ticket, no velocidad de pedido. La imagen que el cliente se lleva en el teléfono es el producto; la experiencia es la máquina que la produce. Ante dos opciones igual de buenas, gana la que produce mejor imagen compartida.

## Antes de escribir una sola línea

Lee completos: `EmplataGame.tsx`, `emplata.css`, `sonido.ts`, `EmplataSwitch.tsx`, `EMPLATA-ARTE-PLAN.md`, `EMPLATA-ARTE-PLAN-2.md`, `EMPLATA-DISENO.md`, `lib/sabor.ts`. Los comentarios del código documentan *por qué* está cada cosa, incluyendo bugs pasados y su causa. No son ruido: son la memoria del proyecto.

Después dime en tres frases qué entendiste del motor. Si te equivocas ahí, te corrijo antes de que escribas código.

## LA LEY

Cinco cosas que no se negocian sin que yo lo diga explícitamente.

1. **No reescribas. Mejora.** Este archivo es artesanía de estudio: reloj dt-normalizado, muelles semi-implícitos, hit-stop, bus de audio con compresor, horneado con luz coherente, teatro KDS dentro del canvas. Costó iteraciones. Si tu instinto es reestructurar el archivo, **para y propónmelo aparte** — no lo hagas de paso.
2. **El cerebro es intocable.** `lib/catalog.ts`, `lib/menu.ts`, `lib/precios.ts`, `pedido-actions.ts`. Si tu cambio los necesita, para y dilo.
3. **Una sola luz, arriba-izquierda.** Todo elemento nuevo obedece: AO ↘, rim ↖, especular ↖.
4. **Canvas2D puro.** Cero dependencias nuevas. Cero motor.
5. **60fps en Android de gama media, vertical, una mano.** Si tu cambio añade trabajo por frame, dime cuánto y de dónde sale el headroom.

## Lo que vas a hacer mal si no te lo advierto

- **Canvas2D no resuelve `var(--…)`.** Falla en silencio a `10px sans-serif`. Los tokens reales son `--font-display` y `--font-body`, no `--pg-font-*`. Usa `resolveFonts()` y re-hornea dentro de `document.fonts.ready`.
- **El reloj está en unidades de 60fps escaladas por `df`.** Decaimientos `pow(k, df)`, velocidades `*df`, spawns periódicos como probabilidad `rand() < p*df`. Un sistema escrito "normal" desincroniza toda la coreografía en pantallas de 90/120Hz.
- **El hit-test escala por `U`, igual que el dibujo.** Píxeles crudos rompen en tablet. Y las pestañas **no tienen respaldo DOM**: si el hit-test falla, quedan inalcanzables.
- **Nada de alocación por frame.** Ni `createRadialGradient`, ni `createPattern`, ni `new Image()`, ni `createElement("canvas")` dentro del loop. Se hornea al montar o por resize; en el frame solo `drawImage`.
- **Elipsis con `measureText`**, jamás con `slice()`.
- **`prefers-reduced-motion` cubre todo lo que se mueve**: shake, flash, bursts, puffs, pops y haptics. Hoy solo calma el shake.
- **La v1 DOM (`EmplataClient`) es el fallback accesible.** Debe seguir funcionando después de tu cambio.

## TAREA

<!-- ═══ RELLENA AQUÍ ═══ -->

[Describe el encargo concreto de esta sesión. Una cosa, no cinco.]

<!-- ═══════════════════ -->

## Cómo trabajas

**1. Diagnóstico.** Localiza el código real y dime qué está pasando hoy y por qué. Con números de línea. Si el diagnóstico contradice mi encargo, dilo — prefiero que me corrijas a que ejecutes algo equivocado con elegancia.

**2. Plan.** Máximo 5 pasos. Por cada uno: qué archivo, qué cambia, qué riesgo tiene, y cómo se verifica que funcionó. Si un paso toca la ley, márcalo.

**3. Espera mi OK.** No escribas código hasta que apruebe el plan.

**4. Ejecuta un paso a la vez.** Muéstrame el diff de cada uno antes de pasar al siguiente.

**5. Valida.** Después de cada paso: `npx tsc --noEmit`, `npx eslint`, `npm run build`. Los tres en verde o no avanzas.

**6. Verifica visualmente.** Un sprite mal horneado compila perfecto. Playwright está instalado: levanta el server, navega a `/m/1`, conduce con eventos de puntero sintéticos, captura, y **mira la imagen**. Si el cambio es de luz o materialidad, compara antes/después lado a lado y descríbeme la diferencia. Si no puedes capturar, dímelo en vez de asumir que quedó bien.

## Cuándo PARAS y me preguntas

- El cambio necesita tocar el cerebro, o un campo nuevo del catálogo.
- El cambio necesita una dependencia.
- Encontraste algo roto que no es tu encargo — repórtalo, no lo arregles de paso.
- Vas a superar 5 pasos.
- Descubriste que mi encargo parte de una premisa equivocada.

## Cómo me hablas

Directo. Sin preámbulo ni resumen de lo que acabas de hacer. Si algo que pedí es mala idea, dímelo con el argumento, no con un rodeo. Si algo salió a medias, dilo — prefiero un "esto quedó frágil" que un reporte optimista.

---

## Tareas sugeridas, en orden de retorno

Si no tienes claro por dónde arrancar, estas son las que más mueven la métrica por unidad de riesgo:

1. **El póster compartible.** Dominio placeholder (`papaghetti.vercel.app`), quitar total y número de pedido, resolver el truncado de `slice(0,6)`, y limpiar el `fillStyle = "var(--ambar)"` muerto. Es la única pieza que sale del restaurante.
2. **Variación entre cajas.** Semilla determinista por composición: rotación del sello, desorden de la pila, tinte del velo por perfil dominante. Sin variación no hay nada que comparar y nada que publicar.
3. **Las fotos de comida.** Servirlas a resolución de destino (hoy entran a 64px y se dibujan en 96 lógicos con dpr 2) y conectar `ing.foto` del catálogo, que hoy nunca llega al canvas.
4. **Cerrar el gate de reduced-motion.**
5. **Cadena de seguidores del fideo.** El cuerpo hoy es bezier estático; debe ondular con 3–4 nodos de rigidez graduada.
