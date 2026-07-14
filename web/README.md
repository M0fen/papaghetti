# Papaghetti — Sitio web (Fase 1)

Sitio de marca premium-lúdico para "arma tu bowl". Next.js 16 (App Router) +
React 19 + Tailwind v4. Ver estrategia completa en [`../PLAN-MAESTRO.md`](../PLAN-MAESTRO.md).

## Correr en local

```bash
npm install       # solo la primera vez
npm run dev        # http://localhost:3000
npm run build && npm run start   # producción
```

## Arquitectura

| Ruta | Qué es |
|---|---|
| `lib/menu.ts` | **Tipos + semilla** del catálogo (bases, proteínas, toppings, enredos). Cliente-safe. |
| `lib/catalog.ts` | **El cerebro** (server): lee/escribe el catálogo. Hoy persiste en `data/catalog.json`; interfaz lista para Supabase. |
| `app/admin/` | **Panel de admin** (`/admin`): login + edición de precios/activo/agotado + enredos. |
| `components/AdminDashboard.tsx` | UI del admin (mismos tokens que la web). |
| `app/pedido-actions.ts` | Server actions de pedidos: `enviarPedido` (público) y `avanzarPedidoAction` (cocina). |
| `app/admin/cocina/` + `components/KitchenBoard.tsx` | **Tablero de cocina**: pedidos por estado, avanzar, auto-refresh. |
| `app/globals.css` | **Design tokens** (color/tipografía/motion) como CSS vars, mapeados a Tailwind (`bg-espresso`, `text-oro`…). Única fuente de verdad visual, compartida web+admin. |
| `app/page.tsx` | Home (server, `force-dynamic`): carga el catálogo del cerebro y lo pasa a la web. |
| `components/` | Hero, Configurator, secciones y efectos de marca (hebra, cursor-tenedor, scroll). |

## El cerebro / Admin (Fase 2)

**Un solo lugar** define el catálogo y la web lo consume en vivo.

```bash
# 1) define la clave del panel (o usa la de por defecto: "papaghetti")
cp .env.example .env.local     # y edita ADMIN_PASSWORD
npm run dev
# 2) abre el panel
http://localhost:3000/admin
```

En el panel editas precio, `activo` y `agotado` de cada ingrediente, y el
precio/nombre de los enredos insignia. Al guardar, el cambio se refleja de
inmediato en la web y en el configurador (marca *agotado* un topping y se
desactiva solo en "arma tu enredo"). El estado vive en `data/catalog.json`
(ignorado por git; se regenera desde la semilla).

> Persistencia en archivo = ideal para operar en el local (dev/`next start`),
> **no** para Vercel serverless (FS de solo lectura). Para producción → Supabase.

## Pedidos + inventario en vivo (Fase 3)

El bucle completo del cerebro, ya funcional y verificado E2E:

1. En "arma tu enredo", **Pedir aquí** crea un pedido real en el cerebro
   (`enviarPedido`) — o el cliente usa el enlace a WhatsApp.
2. Cada pedido **descuenta stock** de base + proteína + toppings. Cuando un
   ingrediente llega a **0, se auto-marca `agotado`** y desaparece del
   configurador — sin tocar nada más.
3. El **tablero de cocina** (`/admin/cocina`) muestra los pedidos por estado
   (Recibido → En cocina → Listo) y se avanzan con un botón. Auto-refresca
   cada 8s.
4. En el admin editas el **stock** por ingrediente y ves los **pedidos activos**.

> El bucle usa la misma capa `lib/catalog.ts`, así que migra a Supabase igual
> que el resto (los pedidos van a la tabla `pedidos`, el stock a `ingredientes`).

## Consola de administración (Fase 3.5)

`/admin` es ahora una consola completa con navegación lateral (mismos tokens
que el sitio). Un solo login (`ADMIN_PASSWORD`) protege todo (`app/admin/layout.tsx`).

| Sección | Ruta | Qué hace |
|---|---|---|
| **Resumen** | `/admin` | KPIs del día: ventas, pedidos, ticket promedio, activos, agotados, leads nuevos + últimos pedidos y alertas de inventario. |
| **Pedidos** | `/admin/pedidos` | Lista con filtros por estado, ingresos entregados, avanzar estado. |
| **Cocina** | `/admin/cocina` | Tablero en vivo (auto-refresh 8s). |
| **Inventario** | `/admin/inventario` | Stock editable, alertas de poco stock, reposición rápida (+10/+50), agotado. |
| **Menú** | `/admin/menu` | Precios de ingredientes y enredos insignia; restaurar a semilla. |
| **Leads** | `/admin/leads` | CRM: leads capturados en el sitio ("Club Papaghetti"), gestión de estado (nuevo→contactado→cliente→descartado). |
| **Reportes** | `/admin/reportes` | Ventas últimos 7 días, top bases/proteínas, ticket promedio, leads por estado. |

Los leads se capturan desde el sitio (sección Ubicación → "Club Papaghetti",
`components/LeadCapture.tsx` → `capturarLead`) y caen directo en el CRM.

## Inventario real: Insumos + Recetas + Promos

- **Insumos** (`/admin/inventario`): la despensa real en unidades de verdad
  (lb, paquete, und, g, l…), con **stock**, **nivel estándar (par)**, **costo/unidad**,
  botones de **Abastecer** (+N, "a estándar", cantidad libre) y "🌅 Abastecer todo a
  estándar" para la apertura. Muestra **valor de despensa** y alertas de reposición.
- **Recetas / ficha técnica** (`/admin/recetas`): por cada componente defines cuánto
  insumo consume una porción (½ lb papa, 0.2 paq spaghetti…). Cada **venta descuenta la
  despensa según la receta** (`crearPedido` en `lib/catalog.ts`), y si falta insumo el
  plato **se agota solo** (y vuelve al reponer). Muestra **costo y margen** por plato.
- **Promociones** (`/admin/ajustes`): el operador crea/edita/enciende promos; las marcadas
  "barra superior" salen como **banner** en el sitio (`components/PromoBanner.tsx`). Ajustes
  ampliados: abierto/cerrado, Instagram, costo de domicilio, pedido mínimo.

Tipos en `lib/menu.ts` (`Insumo`, `RecetaItem`, `Promo`); lógica en `lib/catalog.ts`
(`createInsumo`/`abastecerInsumo`/`abastecerAPar`/`setReceta`/`upsertPromo`…).

## Supabase (persistencia real — Fase 2/3)

**Activación zero-touch.** El cerebro se guarda como **un documento jsonb** (tabla
`pg_catalog`, fila `main`). `lib/catalog.ts` usa Supabase automáticamente en cuanto
existen las env vars; si no, cae al archivo local / `/tmp`. No hay que reescribir código.

Pasos:

1. Crea un proyecto en **supabase.com**.
2. **SQL Editor** → pega y corre [`supabase/schema.sql`](supabase/schema.sql).
3. **Settings → API** → copia `Project URL`, `anon public` y `service_role`.
4. Setéalas (local en `.env.local`, y en Vercel → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (público; aún no lo usa el código)
   - `SUPABASE_SERVICE_ROLE` (**secreto**, solo servidor)
5. Redeploy. Listo: los cambios del panel ahora **persisten** entre instancias.

Cliente en `lib/supabase.ts` (service role, solo servidor; `supabaseEnabled()` decide el
backend). Modelo actual = documento (simple, robusto, last-write-wins para 1 local). La
normalización por tablas y **usuarios/roles** (mesero/cajero/admin con Supabase Auth) están
esbozados y comentados en `supabase/schema.sql` para la Fase 4.

## Ghett-IA (DeepSeek) + botones de turno + variables de entorno

- **Ghett-IA:** botón flotante global en el panel (`components/admin/GhettIA.tsx`), asesor de
  negocio (estilo contador) que responde con **tablas markdown**. Ruta server
  `app/api/asistente/route.ts`: gateada por login, rate-limit, inyecta un resumen del cerebro
  (ventas, inventario actual vs **estándar/par**, pedidos, mesas, leads) y llama a DeepSeek
  (`deepseek-chat`). Es **asesor** (no ejecuta acciones). La key vive solo en el servidor y se
  **sanea** (quita BOM/no-ASCII).
- **Botones de turno** (deterministas, no IA — `components/admin/TurnoReportes.tsx` en el
  Resumen): **Apertura** (reposición actual vs. estándar), **Cierre de caja** (ventas del día,
  caja por método, impuesto, propinas), **Jornada** (snapshot). Cada uno imprimible.
- **Env vars** (`.env.local` local; en Vercel: Settings → Environment Variables):
  - `ADMIN_PASSWORD` — clave del panel (default `papaghetti` si no se define).
  - `DEEPSEEK_API_KEY` — key del asistente. **No commitear.** Rotar si se filtra.
- Todas las **server actions del panel están gateadas** por la cookie de sesión.

## POS: pagos, propina, impuesto, mesas

- Pedido con **tipo** (mesa/llevar/domicilio), **mesa**, **pago** (pendiente/pagado) + método,
  **subtotal/impuesto/propina/descuento/total**. Impuesto y propina sugerida se configuran en
  **Ajustes** (`impuestoPct`, `propinaSugeridaPct`) y el sitio los lee.
- El operador **crea/edita/elimina** ingredientes y enredos desde **Menú**.

## Deploy a Vercel

```bash
npm i -g vercel   # si no lo tienes
vercel            # enlaza el proyecto y despliega (preview)
vercel --prod     # producción
```

En el dashboard de Vercel: agrega las env vars (`ADMIN_PASSWORD`, y las de
Supabase cuando apliquen). **Antes de ir a `--prod`, migra el catálogo a
Supabase** (el JSON local no persiste en serverless). Genera el QR apuntando a
la URL de producción.

## Efectos de marca ("el enredo")

- **Hero:** la hebra (SVG `stroke-dashoffset`) se dibuja sola y los toppings caen con rebote.
- **Cursor-tenedor** que sigue el puntero y hace *twirl* al hacer clic.
- **Hebra de scroll** lateral como barra de progreso.
- **Configurador** "arma tu enredo": el bowl se llena con micro-rebote y calcula el ticket en vivo.
- **Divisores de hebra** (garabatos) y **twirl** en hover de los platos.
- Sin librerías de animación → mejor rendimiento (se escanea por QR). Respeta `prefers-reduced-motion`.

## Pendientes antes de producción

- [ ] Reemplazar el WhatsApp placeholder en `components/Configurator.tsx` (`WHATSAPP`).
- [ ] Confirmar dirección/horarios reales en `components/Location.tsx`.
- [ ] **Fuentes licenciadas:** hoy usa Bricolage Grotesque + Manrope (gratis) como
      stand-in de Recoleta + Satoshi. Al licenciarlas, self-hostearlas con
      `next/font/local` (los tokens ya las priorizan en el font-stack).
- [ ] Fotografía real de producto para el menú (hoy usa arte de marca).
- [ ] Handle de redes: `@papaghetti` está tomado en IG por una marca extranjera → usar variante (`@papaghetti.co` / `@papaghetti.pereira`).
