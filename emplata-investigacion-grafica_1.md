# EMPLATA — Investigación y propuesta gráfica

Repo: `web/app/m/[mesa]/` — EMPLATA, el menú-juego Canvas2D de Papaghetti.

## Lo que quiero

Subir el nivel **gráfico y estético** de Emplata hasta que se sienta como un juego bien hecho, no como una web bonita. El feeling que busco es de videojuego: materia, peso, luz, jugo.

**Esta sesión NO escribe código de producción.** Termina en una propuesta que yo escojo. Si me traes código sin que yo haya elegido, te desviaste.

## Paso 1 — Estado real, no documentado

Lee el código fuente y dime **qué hay hoy**, verificado línea por línea.

Hay documentos de planificación en el repo (`EMPLATA-ARTE-PLAN.md`, `EMPLATA-ARTE-PLAN-2.md`, `EMPLATA-DISENO.md`). **Léelos como historia, no como estado.** Están desactualizados: varias cosas que listan como pendientes ya se resolvieron en commits posteriores. Si vas a citar algo de ahí, verifícalo primero contra la fuente y dime si sigue vivo o ya está hecho.

Entrégame:
- Qué técnicas gráficas ya están implementadas (horneado, capas de luz, materiales, partículas, post-proceso)
- Qué se ve flojo y por qué, con tu propio criterio
- Captura del estado actual con Playwright (`/m/1`) y descríbeme lo que ves

## Paso 2 — Investiga afuera

Busca en repos, foros, artículos, GDC talks, devlogs, itch.io, lo que encuentres. Me interesa especialmente lo que **no** esté ya en `web/game/REFERENCIAS.md` — ese archivo ya tiene una ronda de scouting, no me la repitas.

Direcciones que quiero que explores:

- **Materialidad en Canvas2D puro.** Cómo se logra brillo húmedo, subsuperficie, translucidez y especular por material sin WebGL ni shaders. Trucos con `globalCompositeOperation`, capas horneadas, máscaras.
- **Luz que responde.** La escena tiene una sola luz ↖ y ya lee el giroscopio (`tiltX`/`tiltY`) sin usarlo casi. ¿Qué se puede hacer con eso?
- **Post-proceso barato.** Bloom, aberración, grading por LUT, viñeta que late — todo en Canvas2D, sin matar 60fps en Android medio.
- **Apetito.** Cómo los juegos de comida hacen que la comida se vea comestible. Y qué toma prestado eso de la fotografía gastronómica real (luz de contra, brillo de aceite, ángulo héroe, vapor).
- **Game feel visual.** Lo que separa un juego con peso de uno flotante: anticipación, hitstop, squash, follow-through, partículas con propósito.

Cítame de dónde sacaste cada cosa. Si algo es teoría tuya y no una fuente, dilo.

## Paso 3 — Propuesta

Máximo **8 ideas**, ordenadas por impacto visual dividido entre riesgo.

Por cada una:

| Campo | Qué va |
|---|---|
| Qué se ve distinto | En una frase, lo que notaría un cliente |
| Cómo se hace | Técnica concreta, no "mejorar el brillo" |
| Costo | S / M / L |
| Riesgo de perf | Qué añade al frame y de dónde sale el headroom |
| Fuente | De dónde salió la idea |

Márcame cuáles son **la firma** — las que harían que alguien diga "esto no parece una web".

## Restricciones

- **No reestructures nada.** El archivo grande es artesanía; si quieres refactor, propónlo aparte.
- **El cerebro no se toca:** `lib/catalog.ts`, `lib/menu.ts`, `lib/precios.ts`, `pedido-actions.ts`.
- **Canvas2D puro.** Cero dependencias nuevas, cero motor, cero WebGL.
- **Una sola luz, arriba-izquierda.** Todo lo que propongas obedece ese origen.
- **60fps en Android de gama media**, vertical, una mano.
- **Nada de alocación por frame** (gradientes, patrones, canvas nuevos dentro del loop).
- La ruta DOM accesible (`EmplataClient`) debe seguir funcionando.

## Cómo me hablas

Directo, sin preámbulo. Si una idea mía es mala, dímelo con el argumento. Si algo que encontraste no aplica a Canvas2D, dilo en vez de forzarlo.

Cuando termines el paso 3, **para y espera**. Yo escojo qué construimos.
