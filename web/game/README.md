# EL ENREDO — juego (arquitectura)

Juego arcade roguelite 2D, **mobile-first**, que se lanza **en misterio** (sin marca) e
integra al sitio Next.js en **`/juego`**. Brief completo: `EL_ENREDO_PROMPT_MAESTRO_v4`.

## Principio rector: separación estricta sim ↔ view

```
web/game/
  sim/     TypeScript PURO y determinista. Cero DOM, cero render, cero Math.random.
           Corre en el navegador Y headless en el servidor (Supabase Edge Function).
    fixed.ts       Punto fijo Q16.16 + LUTs de sin/cos (ángulo binario, 65536 brads/vuelta)
    rng.ts         mulberry32 sembrado (toda aleatoriedad pasa por aquí)
    constants.ts   Tunables (velocidad, radio de giro, área mínima de lazo, umbrales…)
    types.ts       World (snapshot), Input, Modifiers, entidades
    enredo.ts      Geometría: intersección, shoelace, point-in-polygon
    spatial.ts     Spatial hash grid (colisiones broad-phase)
    cards.ts       Registro data-driven de las 14 cartas + draft determinista
    step.ts        createWorld + step(world,input) PURO y determinista
    index.ts       API pública del sim (lo único que ve la vista)
    balance.ts     Banco de pruebas headless (10.000 runs → pick_rate vs score)
    *.test.ts      Tests de determinismo (node:test; se corren con `node --test`)
  view/    Render (Canvas2D por defecto, swappable). SOLO dibuja el estado del sim.
  net/     Identidad de jugador + envío/validación de scores.
```

## Decisiones técnicas (y por qué difieren del brief donde aplica)

- **Renderer: Canvas2D detrás de una interfaz swappable**, no Phaser 4.1. Motivos: (1) el
  principio #1 del propio brief es aislar el view para poder cambiarlo sin tocar el sim —
  exactamente lo que hace esta interfaz; (2) bundle ~0 vs. ~1MB+ de Phaser, alineado con
  "fricción cero en móvil / <3MB"; (3) el "quality gate" del Sprint 1 es *"mover la hebra se
  siente delicioso con formas grises, sin arte"* → Canvas2D es ideal para eso; (4) evita
  depender de una versión de Phaser potencialmente no publicada. La puerta a Phaser/WebGL
  queda abierta: solo se reescribe `view/`, el sim no se toca.
- **Punto fijo Q16.16, ángulo binario** (65536 brads/vuelta → `& 0xffff` envuelve gratis),
  trig por **LUT precalculada** (Math.sin solo en init del módulo, nunca por tick). `fmul`
  overflow-safe por split hi/lo (sin BigInt, sin floats). Distancias sin `sqrt`.
- **Node v24 nativo** corre el TS del sim → los imports relativos llevan `.ts` explícito
  (Next lo resuelve con `allowImportingTsExtensions`). El sim es **erasable-only** (sin enums
  ni namespaces) para el type-stripping de Node.
- **Anti-trampa**: el score no se confía al cliente; una Edge Function re-simula con el MISMO
  `/sim`. Ver `web/supabase/enredo.sql`.

## Identidad de jugador
`net/identity.ts` — UUID anónimo en localStorage desde la 1ª partida + captura opcional de
contacto (sin muro). Es lo que canjea el descuento en la revelación.
