# MASTERPROMPT v2 — "PAPAGHETTI · EMPLATA" (corregido)
### Capa de pedido 3D del cliente, MOBILE-FIRST, sobre el sistema que YA EXISTE

> **Corrección clave:** NO se construye un sistema nuevo. El repo M0fen/papaghetti YA tiene el menú,
> los precios, la creación de pedidos y el KDS de cocina. Esta tarea AÑADE la experiencia de pedido
> del cliente (la caja 3D en la mesa por QR) **enganchándose al cerebro existente**. Fable/Claude Code
> NO debe reinventar catálogo, precios, pedidos ni cocina: debe REUSARLOS.

---

## 0. LO QUE YA EXISTE (leer y respetar — no reconstruir)

Antes de escribir una línea, lee y reutiliza:

- **Stack real:** Next.js **16**, React **19**, Tailwind **4**, TypeScript. (NO son 15/18/3.)
- **El "cerebro" del menú: `web/lib/catalog.ts`.** El catálogo NO son tablas sueltas: es un documento
  con grupos `bases`, `proteinas`, `toppings`, cada ingrediente con `{ id, nombre, precio, ... }`.
  Se persiste como UN jsonb en la tabla `pg_catalog` (id='main') vía `web/lib/supabase.ts`. Si no hay
  env de Supabase, lee del archivo local. **Toda la data del menú sale de aquí. No hardcodear nada.**
- **Precios y reglas ya resueltos:** existe `TOPPINGS_INCLUIDOS` (N toppings gratis, el resto suma).
  El cálculo de precio del build YA está en catalog.ts (`base + proteina + toppings pagos`). REUSAR
  esa función, no reimplementar la lógica de precio.
- **Creación de pedido ya existe:** hay `crearPedido` / `NuevoPedido` en catalog.ts y una tabla/flujo
  de `pedidos` con canal (salón/QR/Rappi) y estado (recibido→cocina→listo→entregado). El pedido del
  cliente debe entrar por ESE mismo camino, con `canal='QR'`.
- **La cocina ya existe:** `app/admin/cocina` es el KDS. Si el pedido se crea bien, **aparece solo en
  cocina**. No construir cocina nueva.
- **El admin ya existe:** `/admin/menu` (CRUD), `/admin/mesas`, `/admin/pedidos`, inventario, recetas.
  La app de cliente es SOLO el front de pedido; todo lo administrativo ya está.

> Tu primer paso, Claude Code: **abre `lib/catalog.ts` y `lib/supabase.ts`, y reporta las firmas
> exactas** de: el tipo de ingrediente, la función de precio del build, y `crearPedido`. Construye
> sobre esas firmas reales. Si algo de este prompt no coincide con el código, gana el código.

---

## 1. QUÉ HAY QUE AÑADIR (el alcance real)

Una ruta nueva de cliente: **`app/m/[mesa]/page.tsx`** (pedido por QR en mesa). Eso es casi todo lo
nuevo. Lee el catálogo del cerebro, deja al cliente armar su caja, y crea el pedido por el flujo
existente con `canal='QR'` y el número de mesa del parámetro.

---

## 2. MOBILE-FIRST (requisito duro — el PLAN-MAESTRO ya lo exige: LCP<2.5s, reduced-motion)

Esto se diseña para **un teléfono de gama media/baja sostenido con una mano, en vertical**. No es
"responsive": es mobile-first de verdad. Desktop es el caso secundario.

- **Presupuesto de rendimiento innegociable (del PLAN-MAESTRO):** LCP < 2.5s en móvil. La página pinta
  la UI y el botón de pedir ANTES de cargar el 3D. El 3D nunca bloquea el primer render.
- **El 3D es progresivo, no obligatorio:** el Canvas carga en un chunk aparte (`next/dynamic`,
  `ssr:false`), después del contenido. Con `prefers-reduced-motion` o device débil → **se sirve la
  versión 2D directamente**, sin 3D.
- **Todo con el PULGAR:** controles en el tercio inferior, targets grandes (≥44px), una sola mano.
  Interacción por **TAP** como camino principal (añadir con un toque). El arrastre 3D es un plus
  opcional, nunca el único modo (arrastrar es difícil en pantallas pequeñas y para accesibilidad).
- **Viewport a prueba de móvil:** `dvh` (no `vh`), `touch-action: manipulation` en la UI y
  `touch-action: none` solo sobre el canvas, safe-area insets, sin zoom por doble-tap.
- **DPR capado a 2** (`dpr={[1,2]}`), instancing, glTF con Draco, texturas comprimidas. Watchdog de
  FPS que degrada sombras/post en gama baja. 60fps objetivo en gama media.
- **Se prueba en un Android real barato**, no en el emulador.

---

## 3. LA EXPERIENCIA (vertical, una mano)

```
Escanea QR de la mesa → app/m/[mesa]
   │  Header compacto + botón "PEDIR YA" (lista rápida) SIEMPRE visible arriba.
   │  Total en vivo, discreto, fijo abajo (sube al añadir; visible pero secundario).
   │
   ├─ PEDIR YA ───► lista clásica por tap (base/proteína/toppings) → confirmar. <15s.
   │
   └─ EMPLATAR (el juego, en vertical):
        1. BASE     → tap entre spaghetti / papa francesa / papa criolla
        2. PROTEÍNA → tap para añadir; cae en la caja con peso y sonido
        3. TOPPINGS → tap para sumar; cada uno rebota, suena, humea. TOPPINGS_INCLUIDOS
                      gratis, el resto suma al total (usar la lógica existente).
        4. TU CAJA  → la caja origami gira en 3/4, premium, humeante = ES tu pedido
        5. CONFIRMAR→ la caja se cierra en origami → crearPedido(canal='QR', mesa) → cocina (KDS)
        6. Estado en vivo: recibido → en cocina → listo (leyendo el estado del pedido existente)
```

La caja origami 3D (la marca vende en caja de origami; lo digital y lo físico son la misma cosa):
- Se **despliega** al abrir y se **cierra** al confirmar — los dos momentos "wow", con sonido.
- Material papel kraft cálido, una luz cálida arriba-izquierda (coherente con la estética del juego),
  wordmark en emboss. Los ingredientes caen DENTRO y se apilan.
- En modo 2D (fallback/reduced-motion): la misma caja como ilustración con juice 2D. Misma lógica,
  mismo pedido.

---

## 4. GAME FEEL (mobile)
- Cada tap = reacción en <1 frame: el ingrediente cae con rebote (squash & stretch), suena (diegético:
  chicharrón cruje, salsa chapotea, maicito tintinea), micro-vapor, y **haptic** donde exista
  (`navigator.vibrate` — no en iOS; nunca como feedback único).
- Apertura/cierre de la caja = los momentos estrella. Música ambiente cálida con toggle mute.
- Coherencia total con el juego EL ENREDO: misma paleta (crema/espresso/ámbar/tomate), misma
  tipografía de marca, mismo verbo ("arma / emplata"). Un cliente que jugó reconoce el gesto al pedir.

---

## 5. BACKEND (reusar, no crear)
- Leer catálogo y precios del **cerebro** (`lib/catalog.ts` + `pg_catalog`). Cero hardcode.
- Crear el pedido con la función **`crearPedido` existente**, `canal='QR'`, mesa = `params.mesa`.
- El pedido aparece automáticamente en `app/admin/cocina` (KDS). No tocar cocina.
- Estado del pedido para el cliente: leer el estado del pedido existente (recibido→cocina→listo).
- Si falta env de Supabase, el cerebro ya cae al archivo local: la app debe funcionar igual en dev.

---

## 6. ORDEN DE CONSTRUCCIÓN
1. **`app/m/[mesa]` con "PEDIR YA" 2D funcionando end-to-end:** lee el cerebro, arma el build con la
   lógica de precio existente, y crea el pedido real que llega a cocina. SIN 3D todavía.
   → PUERTA: no se avanza hasta que un pedido por QR aparezca en el KDS de cocina.
2. **Versión 2D con juice** de "Emplatar" (tap-to-add, caja ilustrada, total en vivo). Ya es shippeable.
3. **La caja origami 3D** (R3F, lazy, chunk aparte) montada ENCIMA de la v2, con fallback a la 2D.
4. **Pase de juice + sonido + vapor + haptics.**
5. **Perf (Draco/instancing/DPR cap/watchdog) + accesibilidad + QA en Android real. LCP<2.5s verificado.**

## 7. DEFINICIÓN DE "TERMINADO"
- Un cliente escanea el QR de su mesa, arma su caja y el pedido **llega al KDS de cocina existente**,
  en un Android de gama media, con LCP<2.5s.
- "PEDIR YA" funciona siempre, incluso sin 3D (fallback probado). `reduced-motion` respetado.
- Los precios salen del cerebro real y respetan `TOPPINGS_INCLUIDOS`. Cero data hardcodeada.
- Se siente premium en vertical, con una mano. La apertura de la caja da ganas de grabarla.

## 8. LO PRIMERO QUE DEBES HACER
Abre y reporta las firmas reales de `lib/catalog.ts` (tipo de ingrediente, función de precio del
build, `crearPedido`/`NuevoPedido`) y de `lib/supabase.ts`. Engancha TODO a esas firmas. Ante cualquier
discrepancia con este prompt, **manda el código existente**, no este documento.
```
