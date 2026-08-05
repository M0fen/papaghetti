# Auditoría del POS Papaghetti — agosto 2026

> **Cómo se hizo.** 23 agentes: 8 auditores especializados leyendo el código (dinero, concurrencia,
> seguridad, inventario, coherencia menú↔POS, operación/KDS, reportes, plataforma Next 16), cada uno
> seguido de un **verificador adversarial** cuyo único trabajo era refutarlo; más 6 investigadores
> sobre POS líderes, KDS, cumplimiento colombiano, arquitectura, librerías y analítica.
> De 94 hallazgos que sobrevivieron la refutación salieron **41 problemas reales** tras deduplicar.
> 2,2 millones de tokens, 696 llamadas a herramientas, 0 agentes fallidos.

---

## Verificaciones hechas a mano (no delegadas)

Los agentes se equivocan. Estas las comprobé yo mismo contra el sistema real, y dos cambian el orden
del plan:

### ✅ RESUELTO: las env vars de Supabase NO existen en Vercel

El informe dejó esto como su única pregunta abierta (§D1) porque no se puede leer desde el repo.
`npx vercel env ls` sobre `m0fens-projects/papaghetti` devuelve **exactamente dos variables**:

```
ADMIN_PASSWORD      Encrypted   Production   34d ago
DEEPSEEK_API_KEY    Encrypted   Production   35d ago
```

No hay `NEXT_PUBLIC_SUPABASE_URL` ni `SUPABASE_SERVICE_ROLE`. `supabaseEnabled()`
(`lib/supabase.ts:15`) devuelve `false` en producción → el cerebro escribe en `/tmp`, efímero y
distinto por cada instancia de lambda. **A1 queda CONFIRMADO: el POS de producción no está guardando
de forma fiable.** Esto asciende la activación de Supabase al primer puesto absoluto.

Dato colateral bueno: `ADMIN_PASSWORD` **sí** está definida en Production, así que la clave por
defecto `"papaghetti"` no aplica en el sitio en vivo. Sí aplica en los deploys de *Preview*, donde
la variable no está definida.

### ✅ CONFIRMADA en vivo: la fuga del catálogo (no es teoría de build)

Descargué el HTML real de `papaghetti.vercel.app` y busqué el payload RSC con las comillas escapadas
(la primera sonda, con comillas normales, dio falso negativo — el flight data va escapado dentro de
`__next_f.push`):

```
HTML bytes: 81.553
FUGA \"insumos\"      → [{"id":"papa-criolla-lb","stock":40,"parStock":40,"costo":3500,…
FUGA \"pedidos\"      → [{"id":"3235062A","creadoEn":"2026-08-05T02:41:09.522Z","canal…
FUGA \"costo\"        33 ocurrencias → 3500, 2800, 4500, 14000, 12000, 9000, 8000, 11000
FUGA \"parStock\"     64 · \"receta\" 32 · \"leads\" · \"movimientos\" · \"historial\" · \"undo\"
```

Es decir: **el costo que le pagas a cada proveedor, tus recetas, tu stock y tus pedidos están hoy
mismo dentro del HTML público que sirve el CDN**, legibles con Ctrl+U. Hay un pedido real ahí dentro.
El día que Supabase esté activo, ahí viajarán también los teléfonos de tus clientes.

### ✅ CONFIRMADO con aritmética real: el bug del domicilio

`data/catalog.json`, pedido `#82C78905`: `subtotal 27.900 + impuesto 2.232 + domicilio 5.000 =
total 35.132`. Al pasar por `cobrarPedido` (`lib/catalog.ts:524`) el total se recalcula sin
`p.domicilio` → **30.132**. Faltan los $5.000 exactos.

**Matiz honesto que ningún agente comprobó:** en tu catálogo actual hay 10 pedidos a domicilio y
**ninguno ha sido cobrado todavía** (`pago: "pagado"` = 0 en los 47 pedidos). O sea: el bug **aún no
ha destruido plata**. Se dispara el primer día que cobres un domicilio de verdad.

### ✅ CONFIRMADO: el insignia que se vende sin ingrediente

En datos reales hay exactamente un ingrediente caído — `tocineta (agotado: true)` — y exactamente un
enredo insignia que la contiene: **`el-antojado`, $30.900**. `components/FeaturedMenu.tsx` no
contiene la palabra "agotado" ni una sola vez (verificado con grep: 0). La tarjeta se pinta normal y
se puede pedir. Tres secciones más abajo, `CartaCompleta` sí marca la tocineta como agotada. La misma
página se contradice consigo misma.

### ✅ CONFIRMADO: el undo se come el 90% del cerebro

`data/catalog.json` pesa 282 KB compactos. `undo` (12 snapshots del catálogo entero) ocupa **254 KB
— el 90%**. Sin las pilas, el documento serían 28 KB. Cada acción del panel lee y reescribe los 282 KB
completos.

### ⚠️ CORREGIDO: el KDS **sí** se auto-refresca

Contra lo que sospeché al empezar, `components/KitchenBoard.tsx:23-26` hace `router.refresh()` cada
8 s sobre una página `force-dynamic`. La cocina **no** está ciega. Lo que sí falta es todo lo demás
(orden FIFO, cronómetro, sonido, tamaño de letra) — está en §B7.

### ⚠️ ACOTADO: el COGS cero

`createIngrediente` no siembra receta, así que todo producto que crees tú nace con costo 0. Pero de
los 16 ingredientes actuales, **cero** están sin receta (`migrate` los rellenó desde `SEED_RECETAS`).
Es una trampa para el futuro, no un dato falso de hoy.

### ✅ CONFIRMADAS: las dos acciones huérfanas

`asignarMesaAction` existe en `app/pedido-actions.ts:99` y **nadie la llama** (grep en todo el repo:
solo su definición). Y el panel **no puede crear pedidos**: `enviarPedido` no se importa desde
ningún archivo bajo `app/admin/` ni `components/admin/`.

---

## Lo que NO se verificó y no debes dar por bueno

Además de lo que el propio informe lista en §F: los umbrales y plazos de la DIAN vienen de análisis
secundarios (Alegra, Siigo, Siempre al Día), no del texto oficial; los precios de proveedores
fiscales y de hardware son de material comercial; y la clasificación tributaria real de Papaghetti
(responsable de INC / Régimen Simple / no responsable) es la pregunta que **solo tu contador** puede
responder — y de la que depende si hoy estás cobrando un 8% que quizá no debas recaudar.

---
---

# Informe de los 23 agentes
**Para: Carlos. Fecha: 2026-08-04. Base: 94 hallazgos de bugs (post-refutación) + 85 brechas de capacidad, deduplicados a 41 problemas reales.**

---

## 0. Veredicto en una página

El sistema tiene una base conceptual buena y poco común en un POS pequeño: recetas reales que descuentan despensa, costo congelado por pedido (`catalog.ts:466-471`), tres canales de entrada convergiendo en una sola función, y una carta que se auto-agota. Eso es trabajo que la mayoría de los POS de esta escala no hacen.

Lo que está roto no es el diseño del producto. Es la **fontanería**: dónde vive la plata, quién puede tocarla, y qué pasa cuando dos cosas ocurren al mismo tiempo.

Tres frases que resumen todo:

1. **Hoy, en producción, es probable que el sistema no guarde nada.** `catalog.ts:66` manda el catálogo a `/tmp` en Vercel y Supabase no está activo (`lib/supabase.ts:15` exige dos env vars que `.env.local` no tiene). Cada lambda tiene su propio `/tmp`. Si esto es así en tu proyecto de Vercel, todos los demás bugs son teóricos: los pedidos ya se están evaporando solos.
2. **La página pública lleva dentro todo el negocio.** `app/page.tsx:76` pasa el `Catalog` completo a un componente `"use client"` (`FeaturedMenu.tsx:1,20`). En el HTML servido por CDN van teléfonos de clientes, costo de cada insumo, margen de cada plato, gastos, y hasta 12 copias de todo eso en la pila de undo. Verificado sobre el build: `.next/server/app/index.html`, claves `leads`/`pedidos`/`movimientos` ×13, teléfonos en claro.
3. **El panel se abre con una cookie escrita a mano.** `guard()` es `cookies().get("pg_admin")?.value === "1"` (`admin/actions.ts:45-47`). `curl -H 'Cookie: pg_admin=1' .../admin` entra. Y si `ADMIN_PASSWORD` no está definida en Vercel, la clave es `papaghetti` (`actions.ts:58`, documentada en `web/README.md:33`).

Después de eso, la fuga de plata más limpia y constante: **cobrar un domicilio le borra los $5.000 del envío al total** (`catalog.ts:524` omite `p.domicilio`, que `catalog.ts:491` sí había sumado). No es intermitente. Pasa siempre.

---

# A. BUGS QUE HAY QUE ARREGLAR YA

Ordenados por plata perdida y pedidos perdidos. Cada uno con el arreglo concreto.

---

### A1 — Persistencia efímera: en Vercel el POS puede no estar guardando nada
**Severidad: bloqueante · Esfuerzo: S (30 min) + verificación tuya**

`catalog.ts:66`: `const DATA_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data")`. El backend Supabase solo se activa si existen `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE` (`lib/supabase.ts:15`).

Consecuencia encadenada, toda verificada:
- El cliente pide por QR en la instancia A; el KDS refresca a los 8 s (`KitchenBoard.tsx:24`) y cae en la instancia B, cuyo `/tmp` está vacío → `readFile` lanza ENOENT → catch (`catalog.ts:126-129`) → devuelve `SEED_CATALOG` → cocina ve cero pedidos y la carta de fábrica.
- En cuanto alguien toca un botón en la instancia B, esa semilla se escribe. Precios de fábrica servidos al siguiente cliente.
- El landing es prerenderizado estático (verificado en `.next/prerender-manifest.json`: `/` está en la lista) y se horneó desde la semilla, porque en build `/tmp` estaba vacío. Por eso el sitio público puede mostrar precios viejos aunque tú los cambies en el panel.

**Arreglo:** crear el proyecto Supabase, correr `web/supabase/schema.sql`, definir las dos env vars en Vercel. El código ya tiene el camino (`catalog.ts:143-173`), no hay que tocar nada. Y añadir un guard: si `process.env.VERCEL && !supabaseEnabled()`, lanzar error explícito en `read()`/`write()` en vez de fingir que `/tmp` funciona.

**Ojo — esto es lo único del informe que no pude verificar desde el repo.** Si tú ya definiste esas env vars en el dashboard de Vercel, este hallazgo desaparece. Compruébalo antes de nada; cambia el orden de todo lo demás.

---

### A2 — El catálogo completo viaja en el HTML público del landing
**Severidad: crítica (legal + competitiva) · Esfuerzo: S (1 hora)**

`app/page.tsx:36` hace `getCatalog()` (documento entero) y `app/page.tsx:76` lo pasa a `<FeaturedMenu catalog={catalog} />`, que es `"use client"` (`FeaturedMenu.tsx:1`, firma en `:20`). Next serializa la prop completa al payload RSC embebido en el HTML.

Medición real sobre `data/catalog.json`: 289.114 caracteres serializados donde bastaban 5.600 (bases + proteínas + toppings + enredos + ajustes). Dentro van: pedidos con `cliente` y `telefono`, costo de cada insumo (papa criolla $3.500/lb, carne $14.000/lb), `costo` por pedido — o sea el margen exacto de cada plato —, movimientos de caja, leads del Club, y 12 snapshots de undo con todo lo anterior repetido.

Dos matices honestos: los teléfonos del catálogo local son de QA ("QA Lleno", "3004445555"), no clientes reales; y con `/tmp` efímero lo que se filtra permanentemente son costos, márgenes, recetas y stock, más los pedidos acumulados desde el último arranque en frío. **El mecanismo es real y en producción con Supabase acumularía teléfonos reales** — eso es Ley 1581 de Habeas Data.

**Arreglo:** crear `getCatalogPublico()` en `lib/catalog.ts` que devuelva solo `{bases, proteinas, toppings, enredos, ajustes públicos}` con los ingredientes limpios (sin `receta`, `stock`, `parStock`, `costo`), y cambiar la firma de `FeaturedMenu` para recibir esos campos. Aplicar lo mismo en `app/m/[mesa]/page.tsx:37`, donde `activos()` también manda `receta` y `stock` al navegador. Regla permanente: ninguna ruta pública llama a `getCatalog()`.

Bonus: el LCP móvil del landing mejora ~50× de peso de HTML, justo lo que el comentario de `page.tsx:19-23` decía querer optimizar.

---

### A3 — La sesión del panel es la cookie literal `pg_admin=1`
**Severidad: crítica · Esfuerzo: S (2-3 horas)**

`admin/actions.ts:45-47` y `:60`. El valor no está firmado ni ligado a sesión: es la cadena `"1"`. `httpOnly` no ayuda — el atacante no necesita leerla, la inventa. El mismo patrón literal se repite en `admin/layout.tsx:21`, `pedido-actions.ts:16` y `api/asistente/route.ts:263`. No existe `middleware.ts`/`proxy.ts` (verificado con `git ls-files`).

Con esa cookie se alcanza: `resetTodo` (`actions.ts:120`, borra el catálogo entero), `saveAjustes` (cambiar el WhatsApp del negocio por el del atacante), `cobrarAction`/`cancelarAction` sobre pedidos reales, `/admin/reportes` con todo el P&L, `/admin/leads`, y la IA con sus tres herramientas de escritura contable.

Agravante: contraseña por defecto `papaghetti` si falta `ADMIN_PASSWORD` (`actions.ts:58`), login sin contador de intentos ni backoff (`actions.ts:55-67`), y sin `secure: true` en la cookie (`:60-65`).

**Arreglo mínimo viable, sin dependencias nuevas:**
```
const exp = Date.now() + 8*3600_000;
const mac = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(String(exp)).digest('hex');
cookie = `${exp}.${mac}`
```
`guard()` recalcula el HMAC y valida `exp > Date.now()`. Exigir `SESSION_SECRET` (fallar el arranque si falta) y eliminar el fallback `?? "papaghetti"` — sin env var, que **nadie** entre, en vez de que entre todo el mundo. Añadir `secure: true`. Importar un solo `guard()` en los cuatro sitios en vez de repetir la comparación. Quitar el default de `web/README.md:33` y `:135`.

**Después** (Ola 3): identidad por empleado con PIN, para que el historial deje de decir "Canceló pedido #A1B2" sin nombre.

---

### A4 — Cobrar un domicilio borra los $5.000 del envío
**Severidad: alta (fuga diaria y constante) · Esfuerzo: XS (1 línea)**

Al crear: `total: subtotal + impuesto + domicilio` (`catalog.ts:491`). Al cobrar: `p.total = Math.max(0, p.subtotal + p.impuesto + p.propina - p.descuento)` (`catalog.ts:524`) — `p.domicilio` desapareció. El propio tipo documenta lo contrario: `menu.ts:431` dice `// subtotal + impuesto + domicilio + propina − descuento`.

El pedido llega a caja con el envío dentro y sale sin él. Contamina `OrdersTable.tsx:33-35` ("Cobrado"), `reportes/page.tsx:47-48` (Ventas / Entró en caja), `TurnoReportes.tsx:35,39` (cierre de caja) y `admin/page.tsx:18` (Ventas hoy). El arqueo muestra menos de lo que hay en la caja, todos los días, y parece faltante del cajero.

**Arreglo:**
```ts
p.total = Math.max(0, p.subtotal + p.impuesto + (p.domicilio ?? 0) + p.propina - p.descuento);
```
Mejor: extraer `totalDe(p)` a `lib/precios.ts` y usarla en `crearPedido` (`:491`), `cobrarPedido` (`:524`) y `asignarMesa`. Hoy la fórmula vive escrita dos veces en el servidor y una tercera en el espejo del cliente (`precios.ts:41-49`), que **sí** incluye domicilio: el cliente ve un número y la caja registra otro.

Migración: un paso en `migrate()` (`catalog.ts:101-109`) que recomponga el total de los pedidos con `tipo:'domicilio'` y `pago:'pagado'` ya afectados.

Relacionado y del mismo arreglo: `asignarMesa` (`catalog.ts:540-549`) convierte un domicilio en pedido de mesa pero deja `domicilio: 5000` dentro del total y no toca `p.pago` — estado internamente contradictorio. Añadir `p.domicilio = 0` y recalcular con la fórmula única.

---

### A5 — "Deshacer" es un rollback global: borra pedidos y cobros
**Severidad: alta · Esfuerzo: S (media jornada)**

`stripSnap` (`catalog.ts:180-182`) solo quita `undo/redo/historial`: **`pedidos`, `movimientos` e `insumos` viajan enteros dentro de cada snapshot**. Verificado en los datos reales: los 12 snapshots de `data/catalog.json` contienen 35, 36, 37 … 46 pedidos respectivamente. `commit()` apila ese snapshot completo (`:193-198`) y lo usan por igual las ediciones de menú y el dinero: `crearPedido:497`, `cobrarPedido:526`, `cancelarPedido:535`, `asignarMesa:547`. `deshacer()` (`:202-215`) hace `write(restored)` con el documento entero, sin re-leer ni fusionar.

El botón vive en la barra superior de **todas** las páginas del panel, incluida cocina (`admin/layout.tsx:42-51`), sin confirmación. El detalle de qué se va a deshacer está solo en el atributo `title` (`:47`) — invisible en tablet táctil.

Escenario real: el dueño sube el precio del pollo, entran cuatro pedidos por QR, se arrepiente del precio y pulsa Deshacer cuatro veces. Los cuatro pedidos que la cocina está preparando desaparecen del sistema; dos de ellos ya estaban cobrados.

Mitigación que existe hoy y hay que conocer: `deshacer()` apila el estado actual en `redo` (`:210`), así que **Rehacer los recupera** — siempre que no haya ocurrido ningún commit intermedio, porque `commit` limpia `redo` (`:196`). Un pedido nuevo entre medias mata la recuperación.

**Arreglo:** que `deshacer()`/`rehacer()` re-inyecten lo vivo sobre el snapshot restaurado:
```ts
const restored = { ...snap, pedidos: cat.pedidos, movimientos: cat.movimientos, leads: cat.leads, ... };
```
y que `stripSnap` excluya `pedidos`/`movimientos` de los snapshots. Efecto lateral valioso: el documento pasa de ~291 KB compactos (de los cuales `undo` ocupa 262 KB, el 90%) a menos de 100 KB. Eso reduce la ventana de las carreras de A7 y evita que el documento llegue a ~1 MB justo cuando se migre a Supabase.

Además: ocultar Deshacer/Rehacer en `/admin/cocina`, y mostrar el texto de la acción en el botón, no en el `title`.

---

### A6 — `slice(0, 200)`: el pedido 201 destruye al más viejo, para siempre
**Severidad: alta · Esfuerzo: S ahora / L definitivo**

`catalog.ts:496`. El corte se hace al crear y no mira `pago` ni `estado`. No hay archivo histórico: el `Catalog` (`menu.ts:690-705`) no tiene ninguna colección de cierres o resúmenes.

Consecuencias verificadas:
- Un domicilio pendiente de cobro que sale del array desaparece del filtro "Por pagar" (`OrdersTable.tsx:29-31`) y ya no hay forma de cobrarlo.
- `/admin/reportes?p=mes` y `?p=anio` calculan sobre `cat.pedidos.filter(...)` (`reportes/page.tsx:43`): con 45-50 pedidos/día, "Ventas del mes" son en realidad los últimos 4 días, y "Año" da el mismo número que "Mes". **Nada en la pantalla advierte que la serie está cortada**, y el selector sigue ofreciendo Mes y Año (`menu.ts:495-500`).
- Contraste revelador: movimientos guarda 2000 (`:662, :726`), leads 500 (`:815`). El cap más agresivo está sobre el dato más valioso.

**Arreglo puente (hoy):** subir a `slice(0, 2000)` y, si hay que recortar, recortar por antigüedad y solo pedidos cerrados (`pago === 'pagado' || estado === 'cancelado'`), nunca pendientes de cobro. Mientras el cerebro sea un documento único, el cap es una necesidad de rendimiento, no un capricho.

**Arreglo real:** sacar `pedidos` y `movimientos` del jsonb a tablas propias en Supabase, con índice por `creado_en`. Es la Ola 3.

---

### A7 — El día contable empieza a las 7:00 p.m. hora Pereira
**Severidad: alta · Esfuerzo: S (2 horas, cero dependencias)**

`inicioDe()` usa la hora **local del proceso**: `d.setHours(0,0,0,0)` (`menu.ts:508-511`), y `enPeriodo` compara contra eso (`:524-525`). En Vercel el runtime corre en UTC y Colombia es UTC−5 sin horario de verano. `reportes/page.tsx` es Server Component (`:28`) con `const now = new Date()` en el servidor (`:40`).

A las 7:30 p.m. de un martes, "Hoy" arranca en el miércoles 00:00 UTC = martes 7:00 p.m. Pereira. **Todo el almuerzo y la tarde quedan fuera del reporte**, justo en el momento en que se mira. El gráfico de 7 días parte cada barra a las 7 p.m. (`reportes/page.tsx:96-107`), mezclando el cierre de un día con la apertura del siguiente. Lo mismo en `admin/page.tsx:14-16` y en la IA (`api/asistente/route.ts:156-159`).

Detalle que empeora la confusión: `TurnoReportes.tsx` es `"use client"` (`:1`), así que su `new Date().toDateString()` (`:25`) se evalúa con la zona del **navegador** (Colombia) y da bien. Resultado: "Ventas hoy" del dashboard (servidor, UTC) y "Ventas hoy" de TurnoReportes (cliente, Bogotá) **discrepan en la misma pantalla**.

**Arreglo, sin instalar nada:**
```ts
const diaNegocio = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso)); // "YYYY-MM-DD"
```
Reemplazar los seis puntos: `menu.ts:508-525`, `reportes/page.tsx:96-107`, `admin/page.tsx:14-16`, `TurnoReportes.tsx:25-26`, `api/asistente/route.ts:156-159`. No adoptar Luxon ni date-fns-tz: resuelven DST, que Colombia no tiene desde 1993.

---

### A8 — `crearPedido` no valida absolutamente nada, y es público
**Severidad: alta · Esfuerzo: M (1-2 días)**

`enviarPedido` (`pedido-actions.ts:35`) es una server action pública a propósito — la usan los clientes. Pero `crearPedido` (`catalog.ts:406-499`) tiene **un solo** camino de rechazo: el pedido mínimo (`:461-465`), que `faltaParaMinimo` desactiva cuando `tipo !== 'domicilio'` (`precios.ts:70`). Todo lo demás pasa:

| Lo que no se valida | Dónde | Qué produce |
|---|---|---|
| `it.agotado` / `it.activo` | `consumir()`, `catalog.ts:410-425` — no lee ninguno de los dos | Se vende y se cobra lo que no hay |
| `cat.ajustes.abierto` | no aparece en `crearPedido`; único uso en `toggleAbierto:562` | Pedidos a las 3 a.m. con la cocina apagada |
| ids inexistentes | `.filter(Boolean)` los descarta callado (`:441-445`) | Ticket "Base: —" y venta registrada por menos de lo que el cliente aceptó |
| longitud de `toppingIds`/`proteinaIds` | `:442-445`, sin tope ni dedup | Un pedido con 5.000 toppings vacía la despensa real |
| `mesa` contra `numMesas` | `:478` guarda lo que llegue | Consumo de salón inflado sin mesa donde cobrarlo |
| duplicados de envío | no hay clave de idempotencia | Doble toque con red lenta = pedido duplicado + despensa descontada dos veces |
| tasa por IP | no existe middleware (0 archivos) | 200 pedidos falsos expulsan la venta real del día por el `slice(200)` |

Además `consumirReceta` clampea con `Math.max(0, ...)` (`:401`, `:418`), así que el faltante desaparece: quedan 0.2 lb de cerdo, entra un pedido de 0.35 lb, el stock queda en 0 y **nadie registra que se comprometieron 0.15 lb que no existían**.

Y el efecto se dispara sin atacante: la carta pública es **estática servida por CDN** (`app/page.tsx:19-23`), así que una pestaña vieja o cacheada pide un ítem que se marcó agotado hace media hora, y el servidor lo acepta.

**Caso concreto que pasa hoy mismo:** en `data/catalog.json`, `tocineta` está `agotado: true` y su insumo en `stock: 0`. El enredo insignia `el-antojado` la lleva en sus `toppingIds`. `FeaturedMenu.tsx` (231 líneas, leído completo) **no contiene la palabra `agotado`**: la tarjeta se pinta sin marca y `PedirInsignia.tsx:56` manda el pedido. Tres secciones más abajo, `CartaCompleta.tsx:96` sí dice "agotado". La misma pantalla se contradice.

**Arreglo, en `crearPedido`, antes de consumir nada:**
1. `if (cat.ajustes.abierto === false) throw new Error("Estamos cerrados — " + cat.ajustes.horarios)`
2. Resolver todos los ids; si alguno no existe, tiene `activo === false`, `agotado === true` o falla `puedePreparar(it, byId)` → `throw new Error("Se nos acabó X — quítalo y vuelve a intentar")`. `enviarPedido` ya sabe devolver ese mensaje (`pedido-actions.ts:47-55`) y `EmplataGame.tsx:1498-1506` ya lo sabe pintar.
3. `toppingIds = [...new Set(toppingIds)].slice(0, 12)`, `proteinaIds` máx. 4 (los topes que la propia UI permite).
4. Validar `mesa` contra `cat.ajustes.numMesas`.
5. `idemKey: string` en `NuevoPedido`, generado por el cliente **una vez al armar la caja** (no al enviar) y reusado en reintentos; en `crearPedido`, si ya existe un pedido con esa clave, devolverlo sin volver a consumir.
6. Rate limit por IP en `enviarPedido` y `capturarLead` (`headers().get('x-forwarded-for')` + Map en memoria; el patrón ya está en `api/asistente/route.ts:147`).

**Y en el cliente**, dos huecos que hay que tapar en el mismo movimiento:
- `FeaturedMenu`: calcular disponibilidad del insignia (`[base, proteina, ...toppings].find(i => !i || i.agotado || !i.activo)`) y pintar "Hoy no disponible", deshabilitando `PedirInsignia`.
- `Configurator.tsx:311-319` y `PedirInsignia.tsx:159-167` no reciben la prop `abierto` y sus CTA solo se deshabilitan por `pending`. El CTA principal del landing sí la respeta (`JuegoProvider.tsx:150` → `EmplataGame.tsx:1560`); los dos secundarios no.

---

### A9 — Cancelar: no reversa el cobro, no devuelve la despensa, no pide confirmación
**Severidad: alta · Esfuerzo: M**

`cancelarPedido` (`catalog.ts:531-537`) hace **solo** `p.estado = "cancelado"`. Tres consecuencias distintas:

**(a) Hueco de robo perfecto.** No comprueba `p.pago`, no borra `metodoPago`, no genera movimiento de devolución. La UI tampoco lo impide: el botón Cancelar se muestra siempre que el pedido no esté entregado ni cancelado (`OrdersTable.tsx:86, 163-170`), sin mirar `p.pago`. Cobrar en efectivo y cancelar deja el ingreso invisible en Finanzas (`reportes/page.tsx:43-44` excluye cancelados) mientras el efectivo se lo lleva quien quiera. Y el mismo pedido **sigue sumando** en "Cobrado" de `/admin/pedidos`, porque ese cálculo filtra solo `p.pago === 'pagado'` sin mirar el estado (`OrdersTable.tsx:33-35`). Dos pantallas del mismo panel, dos cifras.

**(b) Merma invisible.** El pedido ya consumió la despensa (`consumirReceta`, `:398-403`, invocada en `:415`) y nada la repone. En el P&L el cancelado se excluye por igual de ventas **y** de COGS (`reportes/page.tsx:43-50`), así que 4 cancelaciones al día son insumos que salieron y no bajaron la utilidad ni un peso. Deriva silenciosa y acumulativa.

**(c) La cocina no se entera.** El ticket deja de renderizarse sin señal (`KitchenBoard.tsx:45`), pero el contador del encabezado lo sigue contando porque `activos` filtra solo `p.estado !== "entregado"` (`:28`): el título dice "3 activos" con 2 tarjetas en pantalla. El cocinero termina un plato que nadie va a recoger. Y el botón es un submit directo sin confirmación, en la misma fila que los chips de cobro con `marginLeft:auto` (`OrdersTable.tsx:163-170`) — mis-tap garantizado.

**Arreglo:**
- Si `p.pago === 'pagado'`, no cancelar en silencio: exigir anulación explícita que registre un `Movimiento` de devolución por `p.total` y una entrada de historial "Anuló cobro de #ID".
- `cancelarPedido(id, motivo)` con motivo obligatorio, y devolver los insumos si el pedido no pasó de "recibido" — para lo cual hay que guardar los ids de los componentes en el `Pedido` (hoy solo se guardan los nombres, `:483-485`), o su receta congelada junto a `costo`. Si ya se cocinó, registrar la merma en vez de devolver.
- Unificar "Cobrado" de `OrdersTable.tsx:33` para que excluya cancelados igual que reportes.
- Confirmación de dos pasos en el botón, separado visualmente del cobro.
- `KitchenBoard.tsx:28` → `p.estado !== "entregado" && p.estado !== "cancelado"`, y mostrar el cancelado 60 s como tarjeta tachada roja antes de retirarla.

Nota: hoy el único camino de reversa de una cancelación es el botón Deshacer de A5 — el peligroso.

---

### A10 — Un error de lectura devuelve la SEMILLA, y la siguiente acción la escribe encima
**Severidad: alta hoy, crítica el día que se active Supabase · Esfuerzo: S**

`readFile` (`catalog.ts:126-129`) tiene un `catch` **desnudo**: no distingue "el archivo no existe todavía" de "el JSON está corrupto" de "el disco falló". Devuelve `structuredClone(SEED_CATALOG)`. `readSupabase` (`:157-160`) hace lo mismo y además convierte el error del select en throw (`:151`) solo para caer en su propio catch.

El valor devuelto **no lleva ninguna marca de fallback**. Y toda mutación es `read()` → mutar → `commit()` → `write()` del documento entero. Un `catalog.json` truncado por un corte de luz (`fs.writeFile` de `:135` no es atómico: no hay tmp+rename en todo el archivo) hace que la primera acción del operador reescriba la semilla encima, destruyendo el único respaldo.

Con Supabase activo esto se vuelve catastrófico: un timeout de 200 ms un sábado a las 8:30 p.m. devuelve la semilla, la cocina pulsa "Listo", y el `upsert` sube 0 pedidos, 0 movimientos, precios de fábrica e inventario de demo. Sin error visible. Solo un panel "vacío".

**Arreglo:**
- `readFile`: caer a la semilla **solo** si `e.code === 'ENOENT'`; cualquier otro error, relanzar.
- `readSupabase`: relanzar siempre. La rama de siembra legítima ya existe y es correcta (`:153-156`, cuando `data?.data` es null con la consulta exitosa).
- Escritura atómica: `writeFile(FILE + '.tmp')` + `fs.rename`, y guardar `catalog.bak.json` antes del rename.

---

### A11 — Las escrituras se tragan el error: el cliente ve "pedido recibido" y no se guardó nada
**Severidad: media hoy, alta con Supabase · Esfuerzo: S**

`writeFile` (`:136-139`) y `writeSupabase` (`:170-172`) terminan en `console.error` y no relanzan. `write()` está tipado `Promise<void>` (`:117`), así que `commit` (`:198`) y todos sus llamadores no pueden distinguir "guardado" de "perdido". `crearPedido` devuelve el objeto en memoria (`:498`) y `enviarPedido` responde `{ok:true, id, total}` (`pedido-actions.ts:40-46`) haya o no persistido.

Honestidad sobre el alcance actual: el único backend vivo es el de archivo, y `fs.mkdir` + `fs.writeFile` a `/tmp` rara vez falla. Toda la lista de fallos interesantes (fila bloqueada, cuota, payload rechazado) pertenece a `writeSupabase`, que hoy no se ejecuta. **Es deuda que hay que saldar ANTES de activar Supabase**, no un incendio de hoy.

**Arreglo:** `throw e` en ambos catch, con un reintento con backoff (2 intentos) antes de rendirse. `enviarPedido` ya convierte la excepción en `{ok:false, error}` visible. Las acciones del panel deben devolver estado de error en vez de `return` mudo.

Y en el mismo movimiento, tapar el hueco defensivo de `EmplataClient.tsx:189-198`: hace `setPedido({id: r.id, total: r.total})` sin mirar `r.ok`, y el `catch` de la línea 199 nunca se dispara porque `enviarPedido` no lanza. Hoy es **inalcanzable** (por ese canal el pedido es siempre `tipo:'mesa'` y la única excepción de `crearPedido` es el mínimo a domicilio) — pero se vuelve el modo de fallo por defecto en cuanto se hagan A8 y A11. Copiar la guarda del gemelo `EmplataGame.tsx:1498-1506`. Ojo: `setError` no existe en ese componente, hay que crear el estado y pintarlo.

Añadir Sentry (`@sentry/nextjs`, peer `next: ^16.0.0-0` declarado) y convertir esos tres `catch` mudos en `captureException`. Sin esto, los fallos de producción se los traga un `console.error` que nadie mira durante el servicio.

---

### A12 — Concurrencia: dos acciones simultáneas se pisan
**Severidad: media hoy, alta con Supabase · Esfuerzo: M parche / L definitivo**

Cada mutación es read-modify-write del documento completo, sin transacción, sin versión, sin lock. `writeSupabase` hace `upsert({id:'main', data: cat})` (`:163-173`) sobre una única fila; el esquema (`supabase/schema.sql:12-16`) solo tiene `id/data/updated_at`, sin columna de versión. El último write gana y borra lo que otro request hizo mientras tanto.

Peor: `commit` hace un **segundo** `read()` (`:194`) solo para armar el snapshot de undo, ensanchando la ventana. Son 2 lecturas + 1 escritura del documento completo por acción, sobre un documento que hoy pesa 291 KB compactos (90% de los cuales son snapshots de undo).

Efecto secundario documentado: si entre el read del llamador y el read de `commit` otra acción escribió, `prev` incluye ese cambio pero `cat` no, y `write(cat)` lo borra — mientras el snapshot recién apilado sí lo contiene. Un pedido queda existiendo **solo dentro de la pila de undo**. (No dura "días": con `UNDO_CAP = 12` y ~6 acciones por pedido, ese snapshot cae de la pila en minutos.)

**Sinceridad sobre la severidad:** para un local con ~100 escrituras repartidas en 8 h, la probabilidad de solape es baja y el daño es por evento, no continuo. Y hoy en Vercel cada instancia tiene su propio `/tmp`, así que el problema dominante es A1, no esta carrera. **Pero hay que arreglarlo antes de activar Supabase**, porque ahí la ventana pasa de milisegundos de disco local a centenas de milisegundos de red.

**Arreglo puente:** añadir `version bigint` a `pg_catalog`, leerla con el documento y cambiar el upsert por `.update({data, version: v+1}).eq('id','main').eq('version', v)`; si afecta 0 filas, releer y reintentar (3 intentos). Y eliminar el `read()` redundante de `commit:194` pasando el estado previo desde el llamador.

**Arreglo real:** tablas por entidad (Ola 3).

---

### A13 — Los reportes se contradicen entre sí y cuentan plata que no es del negocio
**Severidad: alta (decisiones sobre números falsos) · Esfuerzo: S por cada uno**

Cinco defectos independientes que hay que arreglar juntos:

1. **"Ventas hoy" del dashboard suma los cancelados.** `admin/page.tsx:15-19` no filtra `estado`, mientras las líneas 20-25 del **mismo archivo** sí lo hacen para "activos" y "por cobrar". Finanzas (`reportes/page.tsx:43-44`) y TurnoReportes (`:27`) sí excluyen. El ticket promedio también sale mal porque divide entre los 30 en vez de 27.

2. **La propina y el impuesto se cuentan como venta y como utilidad.** `reportes/page.tsx:47` es `sum(pedPer, p => p.total)`, y el total lleva impuesto por construcción (`catalog.ts:491`) y propina tras el cobro (`:524`). De ahí salen `utilBruta` (`:51`), `margenPct` (`:52`), `ticket` (`:53`) y el titular del hero `utilTeorica = utilBruta - totalGastos` (`:119`). En toda la página no hay una sola resta de `p.propina` ni de `p.impuesto`. La propina es plata del personal; el impoconsumo es de la DIAN. Un día con 40 pedidos y $8.000 de propina promedio infla la "Utilidad" en $320.000.
   *Matiz honesto: la propina la teclea el operario con `defaultValue={0}` (`OrdersTable.tsx:149`). Si no se registran propinas, el efecto es cero — el defecto contable está igual.*

3. **"Por cobrar" del cierre ignora los entregados sin pagar.** `TurnoReportes.tsx:29-32` calcula `porCobrar` sobre `activos`, que excluye `entregado`. La deuda más común y peligrosa de un restaurante —el que ya comió y no se le registró el pago— es la única que el cierre de caja no muestra: aparece como faltante del cajero. Además `activos` no filtra por fecha: arrastra pedidos de días anteriores. Las tres pantallas dan tres "por cobrar" distintos (`admin/page.tsx:23-25`, `reportes/page.tsx:49`, `TurnoReportes.tsx:32`).

4. **Registrar el mercado como gasto categoría "Insumos" lo cuenta doble.** `utilTeorica = utilBruta - totalGastos` (`:119`) con `utilBruta = ventas - cogs` (`:51`), y `totalGastos` (`:58-60`) no excluye ninguna categoría. La categoría "Insumos / mercado" está en el `<select>` (`:253-257`, `menu.ts:450-461`) y el texto de ayuda solo advierte sobre las compras de despensa (`:174-178`). Esa plata ya entra como COGS cuando los insumos se venden. La utilidad del mes sale negativa justo cuando más se abasteció.

5. **Todo producto nuevo tiene COGS cero.** `createIngrediente` (`catalog.ts:292-303`) inserta sin campo `receta`; `crearIngredienteAction` (`actions.ts:351-361`) tampoco lo pide; `migrate:97` solo rellena desde `SEED_RECETAS`, que cubre los 16 ids sembrados (`menu.ts:658-678`). `costoReceta([])` devuelve 0 (`menu.ts:741`) y eso se congela en `pedido.costo`. 30 arepas a $18.000 entran completas a Ventas y aportan 0 al COGS: el plato que pierde plata parece el más rentable.

**Arreglos:**
- (1) `&& p.estado !== 'cancelado'` en `admin/page.tsx:15`. Mejor: un helper único `ventasDelDia(cat, fecha)` compartido por dashboard, Finanzas y TurnoReportes, para que exista **una** definición de "venta".
- (2) `ventasNetas = sum(pedPer, p => p.subtotal - p.descuento)` como base de `utilBruta`, `margenPct` y `ticket`. Mostrar "Impuesto recaudado" y "Propinas a entregar" como líneas de terceros en el flujo de caja, no como ventas.
- (3) `porCobrar` desde todos los no-cancelados con `pago === 'pendiente'`, separando "del turno de hoy" de "arrastre". Añadir una fila `Descuadre = Ventas − Cobrado − Por cobrar` que debe dar 0.
- (4) Excluir la categoría `insumos` de `totalGastos` en el P&L (dejarla en flujo de caja), o quitarla del `<select>` y redirigir a "Abastecer".
- (5) `sinReceta = pedPer.filter(p => !p.costo).length` y mostrar "margen estimado sobre N de M pedidos — faltan fichas técnicas" con enlace a `/admin/recetas`. De fondo: exigir receta o costo unitario al crear un ingrediente.

---

### A14 — Inventario: cinco formas de que el sistema mienta sobre lo que hay en la nevera
**Severidad: alta agregada · Esfuerzo: M**

1. **Borrar un insumo amputa las recetas en silencio.** `deleteInsumo` (`:637-647`) filtra el insumo de todas las recetas (`:643`) sin avisar ni bloquear. Con datos reales, `chicharron` (único renglón: cerdo-lb 0.35) y `chicharron-crocante` (cerdo-lb 0.1) quedan con receta `[]`. Entonces `puedePreparar` cae a `(ing.stock ?? 0) > 0` (`:390`) con un contador abstracto de 30/24 que nada mantiene, `consumir` cae a la rama legado (`:417-419`) y `costoReceta([])` devuelve **0**: el plato de mayor costo aparece gratis en el P&L y se vende 24 veces sin materia prima. Todo por un clic sin confirmación pegado al botón Guardar (`InsumosTable.tsx:205-208`).
   Agravante de diseño: `puedePreparar:393` es fail-open — `return ins ? ins.stock >= r.cantidad : true; // insumo inexistente → no bloquea`. Debe ser `false`.

2. **"Abastecer a estándar" RESTA cuando hay más del par.** `abastecerAPar` (`:684-688`) hace `it.stock = it.parStock` sin condición, e igual `abastecerTodoAPar` sobre toda la despensa (`:697-701`). `registrarCompra` ignora deltas negativos (`:650-651`), así que la reducción no deja rastro. El botón dice "Llenar hasta el estándar" (`InsumosTable.tsx:157`) y "Apertura: deja todo en su nivel estándar" (`:70`). Con 60 lb de papa y par 40, el lunes se borran 20 lb del registro. *No se evapora comida — se evapora el registro.* El sistema reporta menos de lo que hay y el operario vuelve a comprar.
   **Arreglo:** `it.stock = Math.max(it.stock, it.parStock)` en ambas.

3. **`migrate()` resiembra la despensa cuando el operario la vacía a propósito.** `catalog.ts:81-83`: `if (!Array.isArray(cat.insumos) || cat.insumos.length === 0)` — confunde "campo ausente" con "lista deliberadamente vacía". El dueño borra los 16 insumos de demo para cargar los suyos, recarga la página, y vuelven los 16 con 40 lb de papa criolla que no existen.
   **Arreglo:** quitar el `|| cat.insumos.length === 0`. Sembrar solo en el camino de creación del documento (ENOENT / fila ausente), nunca en `migrate`.

4. **No existe la merma.** `TipoMovimiento` solo admite `"compra" | "gasto"` (`menu.ts:440`); grep de `merma|desperdicio` en todo `web/` = 0. La única forma de bajar stock sin vender es `updateInsumo` (`:628-635`), que hace `Object.assign` y no genera ningún movimiento; el historial solo dice "Editó insumo X". El dueño nunca puede ver cuánto pierde por desperdicio, que en un restaurante es una de las fugas grandes.

5. **El componente nuevo muere a las 20 ventas y no hay forma de reponerlo.** `createIngrediente` crea con `stock: 20` y sin receta; la rama legado (`:417-419`) descuenta 1 por venta y agota a los 20. Las dos funciones que reponen ese stock abstracto —`restock` (`:568`) y `saveStock` (`actions.ts:92`)— **no tienen ningún consumidor en la app** (grep: solo sus propias definiciones). `/admin/inventario` solo renderiza insumos. Hay salida (darle receta en `/admin/recetas` lo saca de esa rama para siempre) pero nadie la descubre.
   **Arreglo:** eliminar la rama de stock abstracto — obligar receta a todo componente y que `puedePreparar` devuelva `false` sin ficha técnica, con aviso en `/admin/recetas`. Quitar `stock`/`parStock` de `Ingrediente`.

Menor, de la misma familia: cambiar la unidad de un insumo (`actions.ts:212` → `Object.assign`, `catalog.ts:631`) no convierte nada. **No hay ninguna escala 1000×** — todos los cálculos ignoran la unidad, que es puramente una etiqueta. El daño es semántico: la tarjeta pasa a decir "1590 kg", la receta se lee "15 kg por porción", y los presets de abastecer cambian de [100,500] a [1,5], así que quien pulsa "+5" cree sumar 5 kg y suma 5 unidades del stock viejo.

---

### A15 — Detalles que cuestan pedidos y conversión
**Severidad: media · Esfuerzo: S cada uno**

- **"Enredarlo a mi gusto" sube el precio $1.232 sin cambiar nada.** `FeaturedMenu.tsx:25-28` hace `juego.abrir({baseId, proteinaId, toppingIds})` pero la interfaz `Precarga` (`JuegoProvider.tsx:29-33`) no tiene campo `enredoId`, así que `EmplataGame.tsx:1485-1495` envía sin él y `crearPedido` cotiza a la carta. Verificado: `el-criollazo` = 18.900 + 9.000 + (maicitos y hogao gratis, perejil cobrado 0) = 27.900 × 1,08 = **30.132** frente al precio de carta 28.900 — exactamente los $1.232 que la propia tarjeta anuncia como "Ahorras" (`:50-56`). El cliente ve subir el precio justo después de que le prometieron un ahorro: ese es el punto donde se abandona el pedido. Y el pedido pierde el `enredoId`, así que los reportes nunca sabrán cuántos Criollazos se vendieron.
  **Arreglo:** pasar `enredoId` en la precarga y mantenerlo mientras la selección sea idéntica; soltarlo (avisándolo en la barra) en cuanto el cliente agregue o quite algo.

- **La caja no se auto-refresca.** `OrdersTable.tsx` no tiene `useEffect`, `useRouter` ni intervalo en sus 175 líneas — solo el `useState` del filtro (`:24`). Sus dos hermanas sí: `KitchenBoard.tsx:23-26` (8 s) y `TablesBoard.tsx:15-18` (15 s). El cajero cobra sobre una lista vieja, sin nada que le indique que está desactualizada.
  **Arreglo:** el mismo `setInterval(() => router.refresh(), 10000)` + hora del último refresco en el encabezado.

- **Doble toque salta un estado.** `<form action={avanzarPedidoAction}>` sin `useFormStatus`, sin `disabled` (`KitchenBoard.tsx:81-86`, `OrdersTable.tsx:137-142`), y `avanzarPedido` no es idempotente (`catalog.ts:505` avanza desde el estado que haya). Con red lenta y manos ocupadas, el pedido pasa de "recibido" a "listo" sin cocinarse, y no hay forma de retroceder salvo el Deshacer peligroso.
  **Arreglo:** `<input type="hidden" name="desde" value={p.estado}>` y avanzar solo si `p.estado === desde`; `useFormStatus` para deshabilitar mientras está pendiente. Añadir `retrocederPedido` con un `prevEstado` simétrico y un botón "←" en la tarjeta.

- **Cobrar dos veces borra la propina.** `cobrarPedido` no mira `p.pago` ni `p.estado` antes de escribir (`:518-525`). La única barrera es el render condicional (`OrdersTable.tsx:144`) sobre una página que no auto-refresca. Un segundo cobro pisa propina, descuento y método: la propina del mesero desaparece y el arqueo por método no cuadra con el datáfono.
  *Corrección importante: **no** se acumula la pérdida del domicilio — `:524` recalcula siempre desde `subtotal + impuesto`, no desde `total`, así que la operación es idempotente en ese sentido.*
  **Arreglo:** `if (!p || p.pago === 'pagado' || p.estado === 'cancelado') return cat;` y devolver resultado para que la UI avise.

- **`resetTodo` es un submit pelado sin confirmación** al final de `/admin/menu` (`MenuEditor.tsx:52-56`), y `resetCatalog` (`:267-271`) reemplaza el documento **entero** con `SEED_CATALOG`, que trae `pedidos: []`, `movimientos: []`, `leads: []` (`menu.ts:722-724`). La etiqueta dice "catálogo"; lo que borra es el negocio. Ventana de recuperación: 12 acciones (`UNDO_CAP`, `:176`).
  **Arreglo:** que `resetCatalog` conserve `pedidos`/`movimientos`/`leads`, y exigir escribir la palabra RESTAURAR para habilitar el submit. Lo mismo para `eliminarInsumoAction` y el `✕` de movimientos (`reportes/page.tsx:341-344`). Grep de `confirm(` en `web/components`: **0 coincidencias** en todo el panel.

- **Las 31 acciones abortan en silencio.** `if (!(await guard())) return;` × 27 en `admin/actions.ts` + 4 en `pedido-actions.ts`. El atacante sin cookie recibe 200 sin cuerpo (indistinguible de éxito) y no queda rastro en `cat.historial`. La cookie dura 8 h (`:64`) y **nunca se renueva**.
  *Corrección al hallazgo original: el operario **sí** ve algo — `admin/layout.tsx:10` es `force-dynamic` y `:21-29` renderiza `<Login/>` sin cookie, y la respuesta de una server action re-renderiza el árbol RSC. No es un botón mudo eterno.*
  **Arreglo:** renovar la cookie en cada acción exitosa, extraer un wrapper `conSesion(fn)` en vez de repetir 31 veces, y registrar los intentos rechazados. Añadir feedback (`sonner`, 5 kB, React 19 verificado en sus peers) porque hoy "guardado" y "no pasó nada" se ven igual.

- **Cabeceras de seguridad: cero.** El único bloque `headers()` de `next.config.ts:9-21` define `Cache-Control` para media. Sin CSP, sin `X-Frame-Options`/`frame-ancestors` en `/admin`, sin `nosniff`, sin `Referrer-Policy`, sin HSTS. Cookie sin `secure`.
  **Arreglo:** bloque `source: '/(.*)'` con las cuatro cabeceras estándar, `X-Frame-Options: DENY` para `/admin/:path*`, y CSP con `frame-ancestors 'none'`.

- **`foto` acepta cualquier cadena sin validar.** `actions.ts:82, 114, 360, 393`. La compresión a 640px vive solo en el navegador (`ImageUpload.tsx:75-88`) — o sea del lado del atacante. Un data URI de 5 MB se replica ×13 por la pila de undo y se inyecta en el HTML público de A2.
  **Arreglo:** aceptar solo `/^data:image\/(jpeg|png|webp);base64,/` y rechazar sobre ~200 KB, en las cuatro acciones.

- **La IA escribe contabilidad protegida por la cookie falsificable.** `api/asistente/route.ts:263`. Tres herramientas de escritura (`abastecer_insumo`, `registrar_gasto` sin tope de monto, `abastecer_todo_estandar`, `:105-141`), un prompt que le ordena ejecutar sin pedir confirmación (`:37`), un forzado por regex (`:290` + `tool_choice: "required"` en `:250`), y un rate limit **global** de módulo (`:147`) que vive en la memoria de una lambda. Cada respuesta lleva `resumen(cat)` con P&L, costo y margen por plato (`:283`). El 502 devuelve `detail` con el error crudo del upstream (`:327`) — no la API key, que nunca sale de `:244`.
  **Arreglo:** usar el `guard()` firmado de A3, tope de monto en `registrar_gasto`, confirmación explícita para las tres herramientas de escritura, quitar `detail` de la respuesta.

---

### A16 — Lo que **no** es un bug aunque lo parezca (y por qué)

Te lo digo con nombre propio porque tres auditores lo reportaron como defecto y no lo es:

**Los 2 toppings de cortesía "por orden de clic".** `catalog.ts:453` regala los dos primeros del array, y el array llega por orden de toque. Eso hace que la misma caja cueste hasta $3.240 distinto según en qué orden se toquen los toppings, y que quitar y reponer el mismo topping suba la cuenta.

Pero es una **política deliberada y documentada**: `precios.ts:10` dice literalmente "los primeros `incluidos` toppings van por cuenta de la casa, POR ORDEN de agregado", cliente y servidor coinciden (`catalog.ts:453` ≡ `precios.ts:44` ≡ `EmplataClient.tsx:140`), y la UI marca en vivo cuáles quedaron gratis (`EmplataClient.tsx:384-389`, `Configurator.tsx:87-90`). No es un exploit: cualquier cliente puede elegir sus dos caros primero desde la propia interfaz, es la regla.

**Lo que sí queda en pie es económico, no técnico:** un topping de $0 (perejil) puede quemar un cupo de cortesía, y la casa regala justo los ítems de mayor margen (nuggets $5.000, aguacate $4.500) cuando el cliente los toca primero. Dos mesas vecinas pueden ver cuentas distintas por el mismo plato.

**Esto es una decisión tuya, no un arreglo.** Opciones: (a) dejarlo como está, asumiendo la varianza; (b) regalar siempre los **más caros** (`[...tops].sort((a,b)=>b.precio-a.precio)`) — determinista, siempre favorece al cliente, defendible en el mostrador; (c) regalar los más baratos, mejor margen pero peor percepción. Si eliges (b) o (c), el cambio son 2 líneas en `catalog.ts:453` y `precios.ts:44`, y la UI se adapta sola.

---

# B. LO QUE LE FALTA PARA SER UN POS DE VERDAD

Esto no está roto: no existe. Ordenado por lo que más te limita hoy.

### B1 — El pedido es UN plato: no se puede vender una gaseosa
`Pedido` (`menu.ts:410-436`) tiene `base: string`, `proteina: string`, `toppings: string[]`. Sin líneas, sin cantidad, sin precio por línea. `Categoria` solo admite `"base" | "proteina" | "topping"` (`menu.ts:8`).

**No hay forma de cobrar una Coca-Cola, un postre, una porción extra o dos bowls iguales.** Se cobra por fuera, no entra a reportes y no descuenta inventario. En un local donde el 100% pide bebida, eso es margen que no existe en ningún número. Bebidas y postres suben el ticket 12-15% con margen del 60%+.

Es la brecha **raíz**: cuenta de mesa, split, coursing, ticket promedio real y ruteo a estaciones dependen todos de resolverla. **Esfuerzo XL.** Va en Ola 4, junto con la migración a tablas — pagas una sola migración.

### B2 — No existe "sin cebolla": cero notas y cero modificadores
Grep de `nota|alergi|observacion` en el pipeline: no hay campo en `NuevoPedido` (`catalog.ts:364-382`), ni en `Pedido`, ni en el ticket de cocina (`KitchenBoard.tsx:68-78`). El cliente en la mesa no puede escribir nada.

Papaghetti tiene hogao, perejil, parmesano y aguacate — exactamente los ítems que la gente pide "aparte" o "sin". Y las **alergias** no tienen dónde declararse: para un local con reputación local en Pereira, un incidente alimentario es existencial.

**Esfuerzo S para la fase 1** (`notas?: string` de punta a punta + textarea de 140 caracteres en los tres canales + render destacado en el ticket, con fondo de alerta, no con la opacidad tenue de `.ticket-card__tops`). Es de lo más barato con más impacto diario de todo el informe.

### B3 — El panel no puede crear pedidos
Grep de `crearPedido|enviarPedido` en todo `web/`: los únicos importadores son `Configurator.tsx:16`, `PedirInsignia.tsx:22`, `EmplataClient.tsx:15` y `EmplataGame.tsx:33`. **Cero coincidencias bajo `app/admin/` o `components/admin/`.** El panel solo sabe avanzar, cobrar, cancelar y asignar mesa.

Suena el teléfono: "un Criollazo para llevar". El operario no tiene botón. Su única salida es escanear el QR de una mesa y armarlo como si fuera cliente (quedando `canal:"qr", tipo:"mesa"` en el ticket) o apuntarlo en papel. Todo el canal telefónico y de mostrador queda fuera del cerebro: ventas sin reportar e insumos sin descontar.

**Esfuerzo S.** El tipo ya lo soporta: `canal: "web" | "qr" | "salon"` (`menu.ts:413`) y **nadie produce `"salon"`**. Un formulario "Nuevo pedido" en `/admin/pedidos` con `guard()` que llame a `crearPedido` con `canal: "salon"`.

### B4 — Un domicilio no tiene dirección
`Pedido` (`menu.ts:410-436`) tiene `cliente?`, `telefono?`, `mesa?`. **No hay dirección, barrio, referencia ni notas.** El único `direccion` del repo es la del restaurante (`menu.ts:571`). Y sí se cobra el envío (`catalog.ts:460`).

Agravante que nadie citó: `domicilio` es el tipo de servicio **por defecto**, tanto en el configurador (`Configurator.tsx:58`) como en el servidor (`catalog.ts:459` `input.tipo ?? "domicilio"`). No es un caso de borde: es el camino más probable.

El domiciliario recoge el plato y no tiene a dónde ir. Alguien llama a cada cliente con el plato en la mano. **Esfuerzo S:** `direccion` obligatoria cuando `tipo === 'domicilio'`, validada en `crearPedido` igual que hoy se valida el mínimo, capturada en `Configurator.tsx:268-276`, y mostrada en `OrdersTable` con enlace a Google Maps. Añadir estado `en_camino` (ojo: `nextEstado` es un avance lineal por índice, `menu.ts:385`, así que el flujo debe depender de `tipo`).

### B5 — No hay arqueo de caja
`TurnoReportes.tsx:130-163` solo **imprime cifras calculadas**: ventas, ticket, impuesto, propinas, caja por método. No hay input de efectivo contado, ni base inicial, ni cálculo de diferencia, ni número de corte, ni quién cerró. Y no se persiste nada: se recalcula en vivo desde `catalog.pedidos` con `hoyStr` (`:25`). El `Catalog` no tiene dónde guardarlo. Al día siguiente, el cierre de ayer no se puede consultar.

Sin arqueo no hay control de efectivo: el faltante nunca se detecta ni se atribuye. Es el hueco por donde se va la plata en un restaurante. Y **sumado a A4**, el cajero aparecerá con sobrante sistemático de $5.000 por domicilio sin que nadie tenga dónde verlo.

**Esfuerzo M:** `cierres: CierreTurno[]` en `Catalog` con `{id, fechaISO, baseInicial, esperadoEfectivo, contadoEfectivo, diferencia, porMetodo, ventasNetas, impuesto, propinas, usuario}`, formulario que pida base inicial y efectivo contado, y `cerrarTurno` que congele el snapshot. **Cierre ciego por construcción**: la acción no devuelve el esperado hasta que se envía el conteo. Si `abs(diferencia) > umbral`, exigir PIN del dueño.

### B6 — Los métodos de pago son de 2015
`MetodoPago = "efectivo" | "tarjeta" | "transferencia"` (`menu.ts:402`). No distingue débito de crédito (comisiones distintas) y mete **Nequi, Daviplata, Bre-B y transferencia bancaria en una sola bolsa**.

Dato duro verificado: Bre-B entró en operación plena el 6-oct-2025; entre esa fecha y el 31-ene-2026 se liquidaron 370,4 millones de operaciones por $59 billones, con ticket promedio de $159.456. Con un ticket de Papaghetti de $25.000-60.000, el pago por llave/QR es lo normal en Pereira hoy.

Un POS que no puede decir cuánto entró por Bre-B versus efectivo **no puede cuadrar caja**. **Esfuerzo S**: ampliar el union, añadir el mapeo de valores viejos en el saneamiento que ya existe (`catalog.ts:107`), y ordenar los botones por frecuencia real de uso.

### B7 — El KDS no es un KDS
Siete carencias verificadas, todas de esfuerzo S salvo la última:

| # | Qué falta | Evidencia | Arreglo |
|---|---|---|---|
| 1 | **FIFO invertido**: el más nuevo arriba | `crearPedido` antepone (`:496`) y `KitchenBoard.tsx:45` no ordena | Una línea: `.sort((a,b) => a.creadoEn.localeCompare(b.creadoEn))` |
| 2 | **Sin cronómetro ni semáforo** | `:61` imprime `hora(p.creadoEn)` estática; el color depende de la columna (`globals.css:2334-2342`) | Un `setInterval(1000)` que solo actualiza `useState<number>(Date.now())`, más clases verde/ámbar/rojo con umbrales desde `cat.ajustes` |
| 3 | **Silencio absoluto al entrar un pedido** | 0 `new Audio`/`vibrate` en todo `admin/`; solo existen en el juego y EMPLATA | `AudioContext` + `OscillatorNode` (el patrón ya está en `web/game/view/audio.ts:46`), con botón "Activar sonido" al abrir turno porque el contexto arranca suspendido |
| 4 | **No se puede retroceder** | `nextEstado` solo suma (`menu.ts:385-386`); `COLUMNAS` no incluye "entregado" (`:17`) | `retrocederPedido` + franja "Entregados recientes" con "↩︎ Recuperar" |
| 5 | **El tablero nunca se limpia** | `:45` filtra solo por estado sobre 200 pedidos | Filtrar por jornada con toggle "ver anteriores" |
| 6 | **Tipografía de escritorio** | plato 0.95rem (`:2375`), toppings 0.82rem con `opacity:0.7` (`:2379-2383`), botón ~30px (`:2390`). Cero `prefers-color-scheme` en 4.925 líneas | Bloque `.kds`: plato 1.5rem/700, toppings 1.05rem con color propio (no opacidad), botón `min-height:64px` ancho completo, `repeat(auto-fit, minmax(300px,1fr))` |
| 7 | **La pantalla se apaga y comparte espacio con el sidebar y el chatbot** | `/admin/cocina` hereda `Sidebar`, topbar con Deshacer/Salir y `<GhettIA/>` (`admin/layout.tsx:37-80`); cero Wake Lock en `admin/` | Ruta `/kds` con layout propio sin cromo + Wake Lock copiando `GameClient.tsx:153-159` (incluido el re-request en `visibilitychange`) + manifest PWA |

Lo más caro que un cocinero sin gerente encima puede sufrir: un ticket de 14 minutos que está **debajo** de los cinco que entraron después, en letra de 13px al 70% de opacidad, sin sonido, en una tablet apagada.

### B8 — Mesas es un cartel informativo
`TablesBoard.tsx` (117 líneas leídas completas) no contiene ni un `<form>`, `<button>` ni import de server action. Cierra con "La mesa se asigna al crear el pedido" (`:106`). Y `asignarMesaAction` (`pedido-actions.ts:99-106`) **está huérfana**: grep sobre todo `web/` la encuentra solo en su definición.

No se puede mover una mesa, ni cobrar la mesa completa, ni dividir. Un grupo de 4 que pide por QR son 4 pedidos que el cajero busca entre todos los del día y cobra uno por uno.

Segundo defecto: **la mesa se muestra LIBRE en cuanto el plato se marca "entregado"**, aunque el cliente siga sentado sin pagar (`TablesBoard.tsx:20-22`, `p.pago` no participa en el criterio de ocupación). El KDS empuja exactamente a eso: el último botón del ticket es "Entregar ✓" (`KitchenBoard.tsx:109`). *Matiz: el dinero no se pierde del sistema — sigue contando en el "Por cobrar" de `/admin/pedidos` (`OrdersTable.tsx:36-38`) y del dashboard. Lo que se pierde es la atribución a la mesa.*

**Esfuerzo S para el 80%:** cablear `asignarMesaAction` (ya existe), añadir un tercer estado visual "servida · por cobrar", y un botón "Cobrar mesa" que cobre todos los pendientes de esa mesa. El split real depende de B1.

### B9 — Facturación electrónica DIAN: **decisión tuya, no técnica**
Ver sección D. Es la única brecha del informe que es riesgo legal, no operativo.

### B10 — El cliente nunca recibe un comprobante
El único `window.print()` del proyecto está en `TurnoReportes.tsx:87` (el reporte de turno). No hay vista de tiquete para el cliente en ningún canal. `estadoPedido` (`pedido-actions.ts:59-66`) devuelve solo `{id, estado, total, mesa}`: no hay ni con qué pintar un desglose.

**Esfuerzo M:** ruta pública `/t/[id]` con estilos de impresión (`@page { size: 80mm auto }`), y botón "Enviar cuenta por WhatsApp" usando el `telefono` ya capturado y `waLink` (`menu.ts:631`).

### B11 — Analítica que ya tienes los datos para hacer y no haces
Tres reportes de decisión, todos sobre campos que ya se guardan:

- **`canal` se guarda en cada pedido y no aparece en ningún reporte.** `crearPedido:476` lo persiste; grep de `canal` en `app/admin` da **una** coincidencia y es texto de copy. Añadir un `porCanal` idéntico al `porTipo` de `reportes/page.tsx:93`: **3 líneas** para saber si el QR vende más que la web.
- **Ventas por hora.** `creadoEn` es ISO completo desde siempre y la hora **jamás se usa**. Agrupar por `getHours()` y `getDay()` (en zona Bogotá, tras A7) responde a qué hora entra el refuerzo y cuánta papa se pre-frita. **Esfuerzo S.**
- **Ingeniería de menú.** El margen se calcula por componente suelto (`RecetasEditor.tsx:78-79`) y la popularidad por nombre (`reportes/page.tsx:84-88`), y **nunca se cruzan**. El `enredoId` que sí se guarda (`catalog.ts:493`) no se reportea. Papaghetti ya tiene lo difícil: `p.costo` congelado por pedido — dato que casi ningún POS pequeño tiene. Con `CM = p.subtotal - p.costo` y mix % por combinación salen los cuatro cuadrantes. **Esfuerzo M.**

Y dos ausencias de retención: **el cliente no existe como entidad** (`Lead` y `Pedido` no están relacionados; `crearLead` no deduplica por teléfono; el teléfono solo se pide a domicilio, `Configurator.tsx:117`), y **cero mecánica de reseñas de Google** (no hay campo de URL en `Ajustes`), pese a que el disparador correcto ya está en el código: el polling sabe cuándo el pedido pasó a "entregado" (`EmplataClient.tsx:209`).

---

# C. LO QUE **NO** DEBE HACERSE AHORA

Evitar trabajo inútil vale tanto como hacer el necesario. Esto lo digo con la misma firmeza que lo anterior:

| No hacer | Por qué |
|---|---|
| **Reservas y lista de espera formal** | Un local de bowls con ~10 mesas en la Circunvalar: la gente llega y se sienta. SpotOn Reserve cuesta US$150/mes por local. Lo único que un día tendrá sentido es una lista de espera de viernes: dos tablas y un botón que abra `waLink`. No una plataforma. |
| **Multi-sede** | Hoy no aplica. **Pero evita la deuda**: cuando normalices el esquema (Ola 3), pon `sede_id uuid not null default '<sede-1>'` en pedidos, cuentas, insumos, turnos y empleados, con índices `(sede_id, creado_en)`. Cuesta cero hoy y duele mucho después. Nada más. |
| **Motor de sync local-first (PowerSync / ElectricSQL / Zero)** | US$49/mes (~$200.000 COP recurrentes) y el plan gratis se **desactiva tras 1 semana de inactividad** — matador para un restaurante que cierra en vacaciones. Y obliga a reescribir todas las mutaciones como escrituras a SQLite local. Para 1 local con 1-3 pantallas, Dexie + cola de salida da el 90% por el 10% del trabajo y $0. Revisar la decisión si: segunda sede, más de 5 dispositivos escribiendo, o el KDS necesita operar offline con estado compartido. |
| **PWA offline completa (Serwist)** | Dos razones. (a) Es **incompatible** con el diseño actual, donde el servidor decide precio y stock: crear pedidos offline exigiría reconciliar despensa al volver, y hoy ni siquiera hay control de concurrencia entre dos escrituras **online**. Intentarlo antes de A12 produce corrupción, no resiliencia. (b) Serwist requiere Webpack y **no funciona con Turbopack**, el bundler por defecto de Next 16: obliga a `next build --webpack`. Sí hacer la mitad barata: manifest + iconos + `display:standalone` para instalar el KDS en la tablet. Cero dependencias. |
| **Integración API con Rappi** | El acceso no es self-serve: requiere gestión comercial con Rappi antes que código. **El arreglo barato es otro**: añadir `'rappi'` al union de `canal` y un botón "Pedido Rappi" en el panel que lo cree manualmente. Con eso el inventario se descuenta, el KDS lo ve y los reportes lo separan, sin ninguna API. La integración solo cuando Rappi sea volumen relevante. |
| **Precio por canal** — matiz | Esto **sí** hazlo pronto (es una columna y evita vender a pérdida en Rappi con comisión del 20-30%), pero no lo confundas con la integración. Son cosas distintas y el barato es el que rinde. |
| **Ruteo a estaciones y pantalla de Expo** | Con una sola línea de producción es folleto. Lo que sí duele es la coordinación por mesa, y eso se resuelve agrupando visualmente las tarjetas de la misma mesa en `KitchenBoard` con un botón "Listo toda la mesa" — derivado, cero cambios de esquema. |
| **Coursing (entradas → fuertes → postre)** | Restaurante de mantel. Los bowls salen rápido. |
| **Gift cards y programa de puntos con catálogo de premios** | Para un local en Pereira rinde más un sello simple ("cada 6 bowls, uno gratis") ligado al teléfono. El teléfono es la tarjeta; no hace falta app ni tabla de puntos: `visitas = pedidos con ese teléfono`. Y el canje entra como `descuento` del pedido, que `cobrarPedido:523` ya soporta. |
| **Agentes de voz al teléfono, pedidos por ChatGPT, upsell automático** | Humo para un local de un solo mostrador. |
| **Impresión térmica (WebUSB/QZ Tray)** | Depende de una decisión de negocio que no está en el código: ¿la cocina opera solo con pantalla? Si sí, no se toca nada. Y hay una trampa verificada: en Windows el driver de la impresora reclama el dispositivo en exclusiva, así que WebUSB **no funciona ahí**. Si hace falta, la ruta correcta es impresora 80mm LAN + un puente Node de ~60 líneas contra `IP:9100`, no una librería. Y ojo con Chrome 142: el puente debe responder `Access-Control-Allow-Private-Network: true`. |
| **TanStack Table** | La vista más usada (cocina) necesita tarjetas grandes, no tablas — ya las tiene. El único dolor real es ordenar los movimientos de Finanzas, y eso se resuelve con un query param `?orden=monto` igual que ya se hace con `?p=`. Si eso basta, no instales nada. |
| **Recharts / visx / Nivo / Tremor** | `reportes/page.tsx:108` ya pinta sus 7 barras con CSS dentro de un Server Component: funciona, no hidrata nada, coste cero. Un gráfico de barras no justifica una librería de charting. |
| **dinero.js / currency.js** | El peso colombiano no tiene decimales. El código ya trabaja en enteros de COP y redondea en el borde correcto (`precios.ts:46`, `:60`, `catalog.ts:467`). El error de coma flotante que dinero.js existe para evitar **no se puede materializar aquí**. Lo único que falta es redondeo a $50/$100 para el efectivo: una función de tres líneas. |
| **react-hook-form / Conform** | El panel usa `<form action={serverAction}>` con FormData nativo — el patrón idiomático de Next 16, funciona sin JS. La validación que falta es de **servidor** (A8), no de cliente. |
| **TanStack Query / SWR** | No hay estado de servidor que cachear: todo se lee en Server Components y se invalida con `revalidatePath`. Serían una segunda fuente de verdad compitiendo con el RSC cache. |
| **Clerk / Auth.js v5** | Clerk es SaaS de pago por usuario activo para un negocio de 3-4 usuarios. Auth.js v5 sigue publicándose como `next-auth@beta` en 2026 y no aporta nada sobre RLS. Si algún día hace falta identidad real, **Supabase Auth** — porque Supabase ya es la dependencia elegida y auth y datos comparten el mismo JWT. |
| **Tests de componentes (Testing Library)** | La UI cambia mucho y aporta poco. Sí hacer tests **del dominio**: `calcularTotales`, `desglosarPrecioFinal`, `costoReceta`, `diaNegocio`. Son funciones puras sin E/S y Playwright ya está pagado en `package.json:27` sin un solo test escrito. |

---

# D. DECISIONES QUE SON TUYAS, NO TÉCNICAS

Ninguna de estas la puedo tomar yo, y tres necesitan a tu contador.

### D1 — Verificar YA: ¿están las env vars de Supabase en Vercel?
Es la primera pregunta del informe y la única que no pude responder desde el repo. Entra al dashboard de Vercel → Settings → Environment Variables y busca `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE`. Si no están, **el POS no está guardando nada en producción** y eso reordena todo el plan.

### D2 — Con el contador, antes de tocar código de impuestos
Hoy el sistema cobra un 8% plano a todo (`menu.ts:610`, aplicado en `catalog.ts:447,456` y en el espejo del cliente `precios.ts:46`, y **reimplementado a mano** una cuarta vez en `EmplataClient.tsx:141` — contradiciendo el comentario de `precios.ts:6-7` que dice que son dos sitios). Cuatro preguntas:

1. **¿Papaghetti es responsable de INC o no responsable?** Una persona natural puede ser no responsable si sus ingresos brutos del año anterior por restaurante no superan 3.500 UVT y opera un solo establecimiento todo el año (con UVT 2026 de $52.374, eso es del orden de $183.000.000). **Si es no responsable, hoy estás cobrando un impuesto que no debes recaudar.** Eso no es un ajuste de configuración, es un problema serio.
2. **¿Estás en Régimen Simple?** El SIMPLE sustituye el INC de restaurantes.
3. **¿El domicilio y el empaque hacen parte de la base gravable del INC?**
4. Si mañana entran bebidas alcohólicas a la carta, ¿qué tarifa aplica a esos ítems? (Un solo porcentaje global no puede convivir con dos tarifas.)

Y un bug relacionado que sí es técnico: el `descuento` se resta **después** del impuesto (`catalog.ts:524`), o sea que se liquida INC sobre plata que no recibiste. En un POS fiscal el descuento reduce la base gravable **antes**.

Nota de honestidad sobre las fuentes: los plazos y umbrales del calendario DIAN los tomé de análisis secundarios (Siempre al Día, Alegra, Siigo), no del texto oficial. Confírmalo con tu contador antes de codificar fechas.

### D3 — Facturación electrónica: cuánto y con quién
Papaghetti cobra impoconsumo pero **no emite ningún documento fiscal**. El identificador del pedido es `crypto.randomUUID().slice(0,8)` (`catalog.ts:474`) — aleatorio, no un consecutivo autorizado. `Ajustes` (`menu.ts:568-585`) no tiene un solo campo tributario: ni NIT, ni razón social, ni resolución de numeración.

La obligación del documento equivalente P.O.S. electrónico venció el 1-jul-2024 para el último grupo. **No construyas el emisor** — no eres proveedor tecnológico autorizado. Integra por API: Factus, Alegra, Siigo o Dataico. Decisiones tuyas:

- ¿Qué proveedor y a qué costo? (Los precios que vi son de material comercial: Matías API publicita desde ~$196.000/año pagando por documento — **no verificado en fuente primaria**.)
- ¿Cuándo? Mi recomendación técnica: **no antes de que Supabase esté activo**. Emitir documentos fiscales contra un catálogo que vive en `/tmp` y se borra es garantizar registros huérfanos.

Dato a tu favor: el documento equivalente POS **electrónico** elimina el tope de 5 UVT (~$261.870 en 2026), así que resolverlo cubre también el caso corporativo parcialmente.

### D4 — Hardware
Configuración mínima recomendada, precios verificados en distribuidores colombianos (agosto 2026) pero que debes cotizar directo porque varían:

| Ítem | Rango | Por qué |
|---|---|---|
| Impresora 80mm USB+LAN ESC/POS con autocorte y RJ11 (DigitalPos DIG-E200I o Jaltech JALPOS80UL) | $260-350k | **80mm, no 58mm**: la de 58mm se queda corta para la información obligatoria de la factura electrónica. LAN para que impriman caja y cocina desde cualquier dispositivo. |
| Tablet Android 10" para el KDS | $400-600k | Android/Chrome habilita WebUSB, Wake Lock y PWA instalable, y evita el bug de driver exclusivo de Windows. |
| Cajón monedero RJ11 | $150-250k | Se abre con `ESC p` desde el mismo flujo de impresión. |
| UPS pequeña (router + impresora) | ~$200k | Sin ella, un corte de 30 s también tumba la red y anula cualquier ventaja de resiliencia. |

Total ~$1,1-1,5M COP. **Decide primero si la cocina opera solo con pantalla**: si sí, la impresora y el cajón se posponen.

### D5 — Política de toppings de cortesía
Ver A16. Tres opciones, todas defendibles; el código cambia 2 líneas. Es una decisión de márgenes y de percepción, no técnica.

### D6 — WhatsApp: cuándo migrar a la API
Hoy WhatsApp es un enlace suelto (`OrdersTable.tsx:109`). Para 200-400 clientes, lo que rinde son 20 mensajes 1-a-1 por semana desde el panel, con plantillas. **La API oficial (vía BSP) solo se justifica por encima de ~500-1.000 contactos**: a esa escala, 500 mensajes de marketing cuestan unos US$6-10 (~$25.000-45.000 COP) y se paga sola. Debajo de eso es gasto fijo. Y ojo: las listas de difusión de la app tienen tope de 256 y **el mensaje solo llega si el destinatario tiene tu número guardado** — difundir a lo bruto desde el celular es la vía rápida a que Meta banee la cuenta.

*(Tarifas de terceros, no confirmadas en documentación oficial de Meta.)*

### D7 — Consentimiento de datos personales
El formulario del Club Papaghetti (`LeadCapture.tsx`) capta nombre y contacto **sin pedir autorización de tratamiento de datos**. Ley 1581 de 2012. Es exposición legal real, no un detalle de UX. Añadir `consentimiento: boolean` y `origen` a `Lead`, y un checkbox explícito. Cuesta media hora.

### D8 — Reseñas de Google: la mecánica importa tanto como la feature
Si la haces, hazla conforme o Google borra las reseñas y pierdes el esfuerzo entero. Prohibido en 2026: incentivar (descuento a cambio de reseña), *review gating* (filtrar y mandar a Google solo a los contentos), presionar al cliente **mientras sigue en el local**, pedir que nombren a un mesero. Lo válido: enlace directo enviado **después** de que se fue, a su propio dispositivo, igual para todos.

---

# E. PLAN POR OLAS

Cada ola es un bloque que se puede desplegar y cuyo resultado se nota. El orden no es negociable en las tres primeras.

---

## OLA 0 — Parar la hemorragia (1-2 días)
**Desbloquea: dejar de perder plata y datos personales mientras se arregla lo estructural.**

| # | Qué | Esfuerzo |
|---|---|---|
| 1 | **Verificar env vars de Supabase en Vercel** (D1). Si faltan: crear proyecto, correr `schema.sql`, definirlas | 30 min + verificación |
| 2 | `getCatalogPublico()` y quitar el catálogo del HTML público (A2) | 1 h |
| 3 | Cookie firmada con HMAC + eliminar el fallback `"papaghetti"` + `secure:true` + rate limit en login (A3) | 3 h |
| 4 | `+ (p.domicilio ?? 0)` en `catalog.ts:524`, extraer `totalDe(p)`, migrar pedidos afectados (A4) | 1 h |
| 5 | `stripSnap` excluye `pedidos`/`movimientos`; `deshacer/rehacer` re-inyectan lo vivo; ocultar el botón en cocina (A5) | 3 h |
| 6 | `diaNegocio()` con `Intl` + reemplazar los 6 puntos de zona horaria (A7) | 2 h |
| 7 | `readFile`/`readSupabase` dejan de caer a la semilla ante error; escritura atómica tmp+rename (A10) | 2 h |
| 8 | Los 5 arreglos de reportes de A13 + helper único `ventasDelDia` | 3 h |
| 9 | `slice(0, 2000)` y recortar solo pedidos cerrados (A6, puente) | 30 min |
| 10 | `abastecerAPar`/`abastecerTodoAPar` con `Math.max`; quitar `|| length === 0` de `migrate` (A14.2, A14.3) | 30 min |
| 11 | Sentry + relanzar en los tres `catch` mudos (A11) | 2 h |
| 12 | Cabeceras de seguridad en `next.config.ts` | 30 min |

**Al terminar la Ola 0:** deja de perderse dinero en cada domicilio, el panel no se abre con una cookie inventada, los datos de clientes no viajan en el HTML público, el reporte del cierre deja de mentir después de las 7 p.m., y un clic de Deshacer no borra la operación del turno.

---

## OLA 1 — Cerrar la puerta pública (3-5 días)
**Desbloquea: que un cliente con una pestaña vieja, o alguien con curiosidad, no pueda vaciar la despensa ni tumbar el servicio.**

- Validación completa en `crearPedido`: cerrado, agotado/inactivo, ids inexistentes, topes y dedup, mesa contra `numMesas` (A8, puntos 1-4).
- Clave de idempotencia de punta a punta en los tres canales (A8.5).
- Rate limit por IP en `enviarPedido`, `capturarLead` y `estadoPedido`; `estadoPedido` devuelve solo `{id, estado}` (A8.6).
- `zod` + `next-safe-action` con un `actionClient` cuyo middleware `auth` reemplace las 31 copias de `if (!(await guard())) return;`. *(Verificado: next-safe-action 8.6.0 declara peers `next >= 14` y `react >= 18.2`, así que Next 16 + React 19 entran por rango, pero React 19 no está declarado explícitamente en su documentación — probar en rama.)*
- `FeaturedMenu` marca los insignias no disponibles; `Configurator` y `PedirInsignia` reciben `abierto`; `Configurator` filtra inactivos al pintar.
- `cobrarPedido` rechaza pedidos ya pagados o cancelados; `cancelarPedido` exige motivo y no cancela pagados en silencio (A9a, A15).
- `deleteInsumo` bloquea o avisa si el insumo está en recetas; `puedePreparar:393` pasa a fail-closed (A14.1).
- Confirmaciones destructivas: `resetTodo` conserva lo transaccional y exige escribir RESTAURAR; `eliminarInsumoAction` y el `✕` de movimientos piden confirmación.
- Guarda de `r.ok` en `EmplataClient` — **obligatorio en esta ola**, porque los arreglos anteriores convierten ese fallo latente en el modo de fallo real.
- Validación de `foto` en las cuatro acciones.
- `guard()` firmado en `api/asistente` + tope de monto en `registrar_gasto` + confirmación para las tres herramientas de escritura.

**Al terminar la Ola 1:** el servidor deja de aceptar lo que no puede cumplir. La carta pública y la realidad de la cocina vuelven a coincidir.

---

## OLA 2 — Que el operario pueda trabajar (1 semana)
**Desbloquea: cerrar caja con confianza y que la cocina no pierda tickets.**

- **Arqueo de caja real** (B5): `cierres` en `Catalog`, base inicial, conteo ciego, diferencia, quién cerró.
- **Notas y alergias** de punta a punta (B2, fase 1) — con render destacado en el ticket.
- **Dirección de domicilio** obligatoria + estado `en_camino` + enlace a Maps (B4).
- **"Nuevo pedido" en el panel** con `canal: "salon"` (B3).
- **KDS**: FIFO correcto, cronómetro con semáforo, sonido de pedido nuevo, recall, filtro por jornada, contadores arreglados, tipografía a distancia, ruta `/kds` sin cromo con Wake Lock y manifest (B7, los 7 puntos).
- **Caja auto-refresca** cada 10 s; **idempotencia de avanzar** con `desde`; `useFormStatus` en los botones; `sonner` para feedback; cookie que se renueva en cada acción (A15).
- **Mesas**: cablear `asignarMesaAction`, tercer estado "servida · por cobrar", botón "Cobrar mesa" (B8).
- **Métodos de pago granulares** con Bre-B, Nequi, Daviplata (B6) + migración de valores viejos.
- **Merma**: `TipoMovimiento` gana `"merma"` y `"ajuste"`; `updateInsumo` genera movimiento automático cuando el patch cambia `stock`; devolución de insumos al cancelar antes de cocina (A9b, A14.4).
- **Reportes de decisión baratos**: ventas por canal (3 líneas), ventas por hora, prime cost con semáforo (`foodCostPct + laborPct` contra la banda 55-60%).
- **Tests de dominio** con Vitest: `calcularTotales` vs la aritmética de `crearPedido` (el test que impide la divergencia que `precios.ts:5-7` ya teme), `desglosarPrecioFinal`, `diaNegocio` a las 23:30 y 00:30 hora Pereira.

---

## OLA 3 — Sacar los pedidos del documento (2 semanas)
**Desbloquea: histórico real, concurrencia segura, tiempo real, y todo lo de la Ola 4.**

Aquí es donde encaja lo que hoy es imposible. Migración incremental, no big bang:

1. Tablas `pedido`, `pedido_item`, `pago`, `insumo`, `mov_inventario` (libro append-only con vista `stock`), con `sede_id` por si acaso (C: multi-sede).
2. `crear_pedido(idem_key, payload)` como función RPC de Postgres: creación de líneas + descuento de insumos en **una transacción**, con `on conflict (idem_key) do nothing returning *` para la idempotencia.
3. Avanzar/cobrar con bloqueo optimista: `update ... where id = $1 and version = $3 returning *`; 0 filas = conflicto → recargar.
4. **Reescribir solo `lib/catalog.ts` manteniendo las firmas exportadas** — el prólogo del propio archivo (`:53-61`) promete exactamente eso, así que ningún componente ni server action cambia.
5. Doble escritura una semana (tablas + jsonb como respaldo), luego apagar el jsonb.
6. Sacar `undo/redo` a una tabla `evento` append-only, que además convierte el historial de 120 entradas volátiles en auditoría permanente.
7. Reemplazar los `setInterval` de KDS y Mesas por Supabase Realtime; `estadoPedido` pasa a `select estado from pedido where id = $1` en vez de traer el documento entero.

El catálogo (bases/proteínas/toppings/enredos/ajustes) **puede seguir como jsonb**: cambia poco, lo edita una sola persona y no tiene concurrencia. Lo urgente son pedidos e insumos.

**Al terminar la Ola 3:** desaparecen el `slice(200)`, las carreras, el polling de 8 s, el peso del documento, y el KDS ve el pedido en menos de un segundo.

---

## OLA 4 — El pedido multi-ítem (2-3 semanas)
**Desbloquea: vender bebidas y postres, cuenta de mesa, split, ticket promedio real.**

Solo después de la Ola 3, y en el mismo movimiento que ella si se puede — pagas una sola migración. `Cuenta` + `LineaPedido` con estado a nivel de línea. Los tres canales pasan a mandar `items[]`, con un adaptador de una línea para no romper los llamadores actuales. `Categoria` deja de ser un enum de 3 y pasa a tabla editable.

Es la brecha estructural que separa "el POS de Papaghetti" de "un POS". No antes.

---

## OLA 5 — Cumplimiento y crecimiento (según D2/D3)
Facturación electrónica DIAN vía proveedor, identidad por empleado con PIN y roles, precio por canal, CRM básico (cliente derivado por teléfono, dormidos, sello de fidelidad), reseñas de Google, pago con QR Bre-B en la pantalla de cierre de EMPLATA.

---

# F. Lo que quedó sin verificar

Lo digo explícitamente para que no lo tomes como confirmado:

1. **Las env vars de Supabase en el dashboard de Vercel.** Es el único hallazgo cuyo escenario depende de configuración externa al código. Todo el peso de A1 y de la Ola 0 cuelga de esto.
2. **El texto oficial de las resoluciones DIAN** (000165/2023, 000008/2024, 000119/2024) y el valor exacto de los umbrales. Todo viene de análisis secundarios concordantes (Siempre al Día, Alegra, Siigo). Tu contador debe confirmarlo.
3. **La clasificación tributaria real de Papaghetti** (responsable de INC / Régimen Simple / no responsable). Sin eso no se puede tocar el modelo de impuestos.
4. **Precios de proveedores fiscales y de pasarelas.** Los números de Factus, Matías API, Bold (2,89%) y Wompi vienen de material comercial, no de fuentes primarias.
5. **ESLint no se ejecutó** (auditoría de solo lectura), así que la cita textual del warning de `jsx-a11y` sobre el `role="tablist"` de `reportes/page.tsx:128` queda sin verificar — aunque la regla aplica claramente al código tal como está.
6. **La compatibilidad de next-safe-action 8.6.0 con React 19** entra por rango de peers pero no está declarada explícitamente en su documentación. Probar en rama antes de comprometerse.
7. **TanStack Table 9.0.0** es un major reciente; si algún día se usa, probar antes.
8. **El estado de Didi Food en Colombia en 2026** no lo pude verificar. No lo doy por bueno.

---

## Cierre

El trabajo que hay que hacer no es reescribir Papaghetti. Es que la plata deje de irse por tres grietas concretas (domicilio, Deshacer, `/tmp`), que la puerta pública deje de aceptar lo imposible, y que los números del panel signifiquen lo que dicen.

La Ola 0 son dos días y para la sangría. La Ola 3 es donde el sistema deja de ser frágil por diseño. Todo lo demás —bebidas, cuentas de mesa, facturación, CRM— es producto, y llega solo cuando la fontanería aguante.

Lo que **no** hay que hacer está en la sección C y vale la mitad del informe: ocho decisiones de "todavía no" que te ahorran semanas y suscripciones mensuales que no necesitas.