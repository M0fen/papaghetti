# EMPLATA — Build gráfico 1

Sigue tu propia propuesta de la sesión anterior. Construimos cinco ideas, en este orden.

## Por qué este orden

La 8 va primero porque libera fill-rate y paga las demás. La 2 es la de mejor impacto por riesgo de tu lista. La 6 va antes que la 1 porque es su motor de respaldo. La 4 sube porque **la métrica de Emplata es la foto que el cliente comparte**, y varias de tus ideas de firma no existen en una imagen fija — se sienten usando, desaparecen en el screenshot. La 1 va al final porque es la más grande y quiero el presupuesto ya liberado cuando llegue.

## Los cinco

**1 · Idea 8 — Presupuesto de post.**
Velo + viñeta horneados en un solo offscreen combinado → un `drawImage` multiply por frame. **Mide el frame time antes y después.** Ese número decide si el resto cabe; si no liberaste nada, para y dímelo antes de seguir.

**2 · Idea 2 — Aterrizaje con peso.**
Hit-stop de ~40ms en aterrizajes reusando `wd.hitStop`. Canal de trauma único: los eventos suman, decae solo, intensidad al cuadrado. Flash de 1 frame en la pieza que cae, y el vecino de abajo recibe el hundimiento heredado. Sincronizado con el `vibrate` que ya existe.

**3 · Idea 6 — Luz viva sin sensor.**
Cascada de tres niveles alimentando los `tiltX`/`tiltY` existentes:
- sensor si hay permiso concedido
- puntero como proxy en desktop
- **autopan** si no hay ninguno de los dos: dos senos desfasados, período 8–15s, amplitud 30%

Recorta las dos capas de luz al rect de la caja al hacerlo — hoy son full-screen y ahora estarán activas siempre.

**4 · Idea 4 — La pila habita la caja.**
Sombra de la pila proyectada en la pared trasera interior: silueta a un offscreen, blur una sola vez, dibujada multiply. **En `recomputeSlots`, no por frame.** Más rim cálido horneado en la silueta superior de cada sprite.

**5 · Idea 1 — El foil de comida.**
Máscara de brillo por material horneada por sprite, reemplazando la medialuna genérica del `bakeGlaze` actual: hotspot liso y húmedo para salsas, ruido de aristas para fritos, micro-puntos para hierbas. El barrido especular pasa por esas máscaras y su posición la da el `tilt` — que después del paso 3 siempre tiene valor, venga del sensor, del puntero o del autopan.

**Sobre el permiso de iOS:** no lo pidas. Nada de diálogo nativo en el primer toque de la experiencia. En iPhone el barrido lo mueve el autopan y ya. Si algún día lo pedimos será desde un control explícito, no al entrar.

## Reglas

- Uno a la vez. Diff antes de pasar al siguiente.
- Después de cada uno: `npx tsc --noEmit`, `npx eslint`, `npm run build`.
- Captura con Playwright después de cada paso y **mírala**. Si un cambio no se ve, dilo — no lo des por bueno porque compiló.
- Frame time medido en los pasos 1, 3 y 5. Números, no impresiones.
- No reestructures. Cirugía in-place.
- El cerebro no se toca: `lib/catalog.ts`, `lib/menu.ts`, `lib/precios.ts`, `pedido-actions.ts`.
- Canvas2D puro, cero dependencias nuevas.
- Gate de `prefers-reduced-motion` en todo lo que se mueva, autopan incluido.
- La ruta DOM accesible sigue funcionando.

## Fuera de alcance

Ideas 3, 5 y 7. No las toques aunque queden cerca.

La 3 en particular: son ~20 draws de tiras finas por frame en Android de gama media, con un desplazamiento de 2px que puede ser invisible en pantalla de teléfono. Antes de construirla quiero medirla y verla, no estimarla.

## Al terminar

Antes/después lado a lado, mismo estado de la caja, más la tabla de frame times. Y dime cómo se ve el foil en las tres rutas: sensor, puntero y autopan.

Si la diferencia es incremental y no dramática, dilo — prefiero eso a un reporte optimista.
