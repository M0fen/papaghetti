# EL ENREDO · Edge Functions (anti-trampa)

`enredo-verify` re-simula cada partida con **el mismo `/sim` determinista** y solo guarda
las runs cuyo score recomputado coincide con el enviado. El score nunca se confía al cliente.

## Por qué `../_sim` y no `@/game/sim`
Deno empaqueta cada función desde SU carpeta y no puede subir a `web/game/sim`. Hay que
**copiar el sim** dentro de la función (es TS puro/erasable, corre en Deno sin cambios):

```bash
# desde web/
cp -r game/sim supabase/functions/_sim          # bash
# PowerShell:
# Copy-Item game/sim supabase/functions/_sim -Recurse -Force
```

`supabase/functions/_sim/` está gitignorado (es una copia); re-cópialo cuando cambie el sim.

## Desplegar
```bash
supabase functions deploy enredo-verify --no-verify-jwt
# secrets que la función lee (usa SB_* para no chocar con los reservados):
supabase secrets set SB_URL="https://xxxx.supabase.co" SB_SERVICE_ROLE="<service_role_key>"
```
Antes corre el esquema `web/supabase/enredo.sql` (tabla `enredo_runs` + RLS + vista `enredo_top`).

## Contrato
**POST** body: `{ player_uuid, alias?, mode, seed, score, duration_ms, input_log:[{t,a,b,c,r}], cards_picked? }`
**Respuesta:** `{ ok, verified, stored?, reason?, recomputed?, row? }` (422 si el score no cuadra).

## Qué valida
- Forma y rangos (seed uint32, ángulos 0..65535, ticks monótonos +1, duración coherente con 60Hz).
- **Re-simulación**: `createWorld(seed,mode)` + `step()` por cada input ⇒ `getScore()` debe igualar el enviado.
- Techo de ticks (15 min) y tamaño del log. (Rate-limiting por jugador: añadir en la capa de gateway si hace falta.)
