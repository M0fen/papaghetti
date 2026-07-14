# EL ENREDO — Estudio de jugabilidad y ruta al "concepto más divertido"

> Análisis del estado actual (código real en `web/game/`) + qué falta para el cóctel que buscamos:
> **culebra (snake/slither) + roguelite de horda (Brotato / Vampire Survivors) + build con sinergias (TFT)**.
> Recursos de referencia en [`REFERENCIAS.md`](./REFERENCIAS.md).

## 1. Lo que tenemos hoy (los sistemas, tal como están en el sim)

| Sistema | Estado | Dónde |
|---|---|---|
| **Movimiento** culebra-fideo (trail sampling, giro por radio, boost=almidón, salsa ensancha el giro) | ✅ sólido | `step.ts` P2–P5 |
| **Comida** (8 toppings): comer → puntaje + crece (+3 nodos) + almidón | ✅ | `step.ts` P7 |
| **ENREDO (lazo)**: rodear comida = puntaje × nº encerrados (cap `loopCap`), corta la cola | ✅ la FIRMA | `enredo.ts` |
| **PEDIDO**: comer 3 toppings EN ORDEN antes del deadline (25s) → +2000 + mult +0.25; fallar → mult −0.5 | ⚠️ plano | `step.ts` P9c, `advancePedido` |
| **Multiplicador global**: sube SOLO al completar pedidos | ⚠️ único canal | — |
| **COSECHA**: se llena con PAPA → al fin de servicio abre el DRAFT (oferta escalada por cosecha) | ✅ | `cards.ts` `generateOffer` |
| **PAPA**: criolla (cosecha) + francesa (línea ×3). Servicio-gated (s3/s5) | ✅ | `step.ts` P9b |
| **SERVICIOS**: 8, draft entre cada uno (ahora CORTOS al inicio → 1ª carta en ~20s) | ✅ (recién) | `step.ts` P11 |
| **CARTAS (14)**: cada una buff + debuff, stack orden-independiente | ⚠️ pocas, sin combos | `cards.ts` |
| **HAZARDS**: aceite (crece, letal), muro, cuchillo, salsa (frena giro), batidor, **TENEDOR (jefe)** | ✅ | `step.ts` P8/P10 |

**El esqueleto es bueno y ÚNICO** (culebra + lazo + cocina, determinista, anti-trampa). Nadie tiene esa fusión.

## 2. Diagnóstico honesto — por qué aún no "engancha"

Comparado con el cóctel objetivo, faltan los BUCLES que generan diversión:

- **A. Las mejoras llegan tarde y son escasas — el corazón roguelite casi no se ve.** Antes: 1 draft por servicio (máx 8 cartas/partida) y la 1ª tras 60-90s. *Ya mitigado*: servicios cortos al inicio. Pero **14 cartas es un pool pequeño** y se repiten; falta el goteo constante de mejoras (el snowball de VS).
- **B. NO hay SINERGIAS.** Las cartas suman números pero no COMBINAN. Sin tags, sin sets, sin "3 de fuego = incendio". Es el motor de diversión de TFT/Brotato y no existe. (Molde: `Slay-The-Robot` interceptors + `sts-synergy-relic` en REFERENCIAS.)
- **C. Tu visión original — cada segmento porta un ítem — no está.** El cuerpo es solo largo. La fusión única sería: **cada carta = una cuenta visible en un segmento**, y las sinergias entre segmentos definen el build. Es *TFT sobre una culebra*: nadie lo tiene.
- **D. El PEDIDO es plano y aislado.** "Come 3 en orden" no interactúa con el lazo ni con el build, y es el ÚNICO canal del multiplicador (si lo ignoras, no escalas). Debería ser el LATIDO temático (servir platos) e integrarse con el enredo.
- **E. Falta presión de HORDA (el "survivor").** Los servicios son solo temporizadores; la amenaza es el tenedor + hazards estáticos. Falta un enemigo que ENJAMBRE y escale.
- **F. Economía delgada.** Cosecha → draft gratis. No hay moneda ni SHOP con reroll de costo (la parrilla de Brotato).

## 3. La ruta — qué construir (priorizado por impacto/costo, con el scout)

**FASE A — Bucle de poder VISIBLE (lo más urgente; ya empezado)**
1. Cartas más frecuentes *(servicios cortos: hecho)*. Añadir **micro-mejoras al comer papa / completar pedido** (snowball constante de VS).
2. Ampliar el pool (14 → 24+) y añadir **RAREZAS** (común/raro/épico) escaladas por oleada (Brotato).

**FASE B — SINERGIAS + SEGMENTO-ÍTEM (la fusión única, el mayor diferenciador)** ⭐
3. Dar **TAGS** a las cartas (salsa / pasta / fuego / fresco / graso / ácido…).
4. Cada carta tomada = una **cuenta visible en un segmento** del cuerpo (tu visión).
5. **SINERGIAS por conteo de tags** (TFT): 3 fuego = quema el aceite alrededor, 3 fresco = frena hazards, 3 graso = boost infinito corto… (molde: interceptors data-driven).
   → Esto ES tu concepto original y el salto de diversión más grande.

**FASE C — El PEDIDO como corazón temático**
6. Pedidos más ricos (varios platos, combos) y **"emplatar" = encerrar sus toppings con el lazo** (enredo y pedido se refuerzan).
7. El multiplicador crece también por enredos grandes / rachas, no solo por pedido (que nunca se estanque).

**FASE D — Horda + economía (profundidad)**
8. Oleadas con amenaza que ESCALA (pestes/clientes que enjambran, no solo el tenedor).
9. SHOP entre oleadas con **moneda** (cosecha → oro), reroll de costo, comprar/vender (UI con Kenney CC0).

**FASE E — Meta (retención, tras el misterio)**
10. Desbloqueos entre partidas, skins de fideo, misiones (Little Big Snake).

## 4. Recomendación: por dónde empezar

Las **Fases A y B son el 80% de la diversión** y encajan con tu visión de "cada segmento un ítem".
- **Ya:** servicios cortos + spawn libre/nutrido (comida esparcida, sin plato) → el jugador ve la temática y las cartas rápido.
- **Siguiente:** **FASE B (tags + segmento-ítem + primeras sinergias)** — convierte "culebra bonita" en "un build que quiero repetir".

Todo se construye respetando el `/sim` determinista (tags/sinergias = datos + mods puros, como las cartas actuales; el render de las cuentas en segmentos = view). Ver `sim/CONTRACT.md`.
