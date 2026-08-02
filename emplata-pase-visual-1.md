# MISIÓN EMPLATA — Pase visual 1: matar a los delatores

> Asume la skill `emplata-craft` instalada. Si no dispara sola, léela primero:
> `~/.claude/skills/emplata-craft/SKILL.md` y `references/materia.md`.

---

Trabajas sobre **EMPLATA**, el menú-juego Canvas2D de Papaghetti en `web/app/m/[mesa]/`.

## El encargo

Subir el nivel gráfico de forma visible. **Este pase no añade features: elimina los detalles que delatan que esto lo hizo un dev y no un estudio.** Son baratos, son de bajo riesgo, y son los que enmascaran todo lo demás — con la caja flotando y el grano leyéndose como suciedad, ningún trabajo de materialidad se va a notar.

Sigue la ley de la skill. Refuerzo el punto 1 porque es el fallo que más me costaría: **no reestructures el archivo.** Si tu instinto es extraer, ordenar o modularizar, para y propónmelo aparte.

## Antes de tocar nada

Lee `EmplataGame.tsx` completo, más `EMPLATA-ARTE-PLAN.md` y `EMPLATA-ARTE-PLAN-2.md`. Ese segundo documento es una auditoría de 15 agentes sobre el código real y ya trae el criterio resuelto: **estos cinco puntos son regresiones, no ideas a debatir.** El plan v1 los ordenó y el código quedó corto.

Después: captura el estado actual con Playwright (`/m/1`, conduce con eventos de puntero sintéticos) y **mírala**. Dime qué ves mal antes de que yo te diga qué arreglar. Si tu lectura contradice mi lista, quiero saberlo.

## Los cinco pasos

En este orden. Uno a la vez, diff antes de avanzar.

**1 · Sombra de contacto direccional en dos capas** *(el que más mueve la aguja)*
Hoy es una sola capa uniforme: la caja lee como sticker pegado sobre el fondo. Van dos: núcleo de contacto duro y ceñido bajo el canto (ancla la caja a la mesa) más halo ambiente elongado ×1.4, rotado 12–18°, desplazado ↘ desde la luz. La caja tiene que *apoyarse*, no flotar.

**2 · Separación de color entre fritos + AO intra-sprite**
Criolla, pollo crispy y piña comparten tono medio y oscuro: la bandeja se lee como una sola masa ámbar y el cliente pierde la capacidad de distinguir lo que pide. Sepáralos en el horneado y mete blob de AO entre sub-elementos del mismo sprite.

**3 · Los seis emojis de sistema → iconos SVG propios**
🔇 🔊 ⚡ 😴 📸 🍝 en el shell. Cambian de forma entre plataformas, rompen la paleta y son lo más barato que se ve en toda la pantalla. Stroke espresso, mismo peso óptico entre ellos.

**4 · Textura y luz de partícula**
Grano del fondo de 42px → 128px (a 42 se lee como suciedad; a 128 como película). Bursts y chispas a blending `lighter` con núcleo blanco — hoy son opacos y matan la sensación de energía. De paso: `muestrearColor` muestrea **después** del horneado y hace media plana, así que toda partícula sale ámbar; muestrea antes del barniz o aplica sesgo HSV real.

**5 · Disciplina tipográfica y de color en la bandeja**
Nombres con `measureText` y elipsis real — el `slice()` actual parte palabras a la mitad justo donde el cliente lee. Precios en espresso, nunca en rojo (connota error). Verifica que el CTA principal sea el único bloque ámbar sólido grande de la zona inferior; si es crema sobre crema, lee como deshabilitado.

## Criterio de éxito

Screenshot antes/después, lado a lado, mismo estado de la caja.

**La prueba:** alguien que no conoce el proyecto debería poder señalar cuál de las dos se ve más cara, sin que le expliques nada. Si no puede, el pase no funcionó y quiero saberlo — no lo maquilles en el reporte.

Muéstrame las dos capturas al terminar y describe la diferencia con tus palabras.

## Fuera de alcance en esta sesión

No lo toques aunque lo veas roto. Repórtalo si lo encuentras:

- Salsas glossy y modelo de material *(es el pase 2)*
- Paredes laterales de la caja y cierre origami real *(pase 3)*
- Cadena de seguidores del fideo, ojos direccionales *(pase 3)*
- Termómetro por dominancia *(es lógica, no gráfico)*
- Cualquier extracción o refactor del archivo

## Tarea paralela para mí, no para ti

Las fotos de `/public/food/*.webp` entran a 64×64 y se dibujan en sprites de 96px lógicos con `dpr` hasta 2 — hasta 3× de upscale justo donde vive el apetito. Necesito re-exportarlas a ≥192px de lado. Dime en qué punto exacto del código habría que cambiar el tamaño de destino cuando tenga los assets nuevos, pero **no cambies nada de eso ahora**.

## Cómo me hablas

Directo, sin preámbulo ni resumen de lo que acabas de hacer. Si un paso de mi lista es mala idea, dímelo con el argumento antes de ejecutarlo. Si algo quedó frágil, dilo — prefiero eso a un reporte optimista.
