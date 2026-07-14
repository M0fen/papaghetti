# PAPAGHETTI — Plan Maestro

> *Un delicioso enredo.*
> Documento vivo. Es la única fuente de verdad de estrategia + marca + roadmap.
> Última actualización: 2026-07-01 · Mercado: **Pereira, Risaralda** · Etapa: **1 local operando** · Stack web: **Next.js (código real)**

---

## ESTADO ACTUAL (handoff)

**En vivo:** https://papaghetti.vercel.app (Vercel, proyecto `papaghetti`). Deploy: `cd web && vercel --prod --yes`.

**✅ Hecho (Fases 0–3.5 + POS + IA + Inventario por receta):**
- Sitio: hero con **video del logo** optimizado (fondo `#F2E2C5` exacto → flota), 3 pasos, configurador con bowl que se llena, menú con modal, captura de leads, **banner de promos** configurable. Mobile-first, accesible.
- Panel `/admin` estilo **POS**: Resumen (KPIs + **botones de turno** Apertura/Cierre/Jornada → tablas imprimibles), Pedidos (pago + método, cobrar con propina/descuento, cancelar), Cocina (KDS), **Mesas**, **Inventario = Despensa de INSUMOS reales** (lb/paq/und/g/l, stock+par+costo, botones **Abastecer**, valor de despensa, alertas), **Recetas/ficha técnica** (cada plato consume insumos → costo/margen, descuento por venta + auto-agotado), Menú (**CRUD**), Leads (CRM), Reportes, **Ajustes ampliados** (IG/domicilio/mínimo/abierto + **Promos**), **Ghett-IA** (asesor DeepSeek, ahora con despensa + márgenes). Acciones gateadas por auth.
- **Supabase cableado (zero-touch):** cerebro = 1 documento jsonb en `pg_catalog`; `lib/supabase.ts` + `read/write` en `lib/catalog.ts` conmutan con `supabaseEnabled()`. SQL en `web/supabase/schema.sql`.

**⛔ Pendiente (siguiente):**
1. **Activar Supabase** (el usuario crea el proyecto y da las llaves → ya cableado) + usuarios/roles.
2. IA que **ejecuta acciones**; **pedido manual desde el panel**; caja (apertura/cierre formal); comanda imprimible.
3. Del usuario: datos reales en /admin/ajustes, fotos de producto, Rappi/DiDi + pago, Google Business, dominio .co + marca SIC.

---

## 0. TL;DR — La apuesta en una frase

**Papaghetti es la primera marca *premium-lúdica* de "arma tu bowl" del Eje Cafetero**: base de papa criolla / papa francesa / spaghetti + proteína + toppings, servida *hermosa* (anti-slop-bowl) y con una firma gráfica imposible de copiar — **la hebra (el enredo)**. No competimos en la guerra de la hamburguesa artesanal; **abrimos categoría**.

**Las 3 decisiones que rigen todo:**
1. **Categoría, no hamburguesa.** El rival de Pereira es un monocultivo de burger premium. Nuestra ventaja es *no* ser eso.
2. **Belleza como producto.** Los gigantes globales (Chipotle/Sweetgreen) son criticados por el "slop bowl" feo. Nuestro bowl se ve de foto. Esa es la venta.
3. **Un solo cerebro.** Menú, web, configurador, pedidos e inventario salen del mismo catálogo. Se cambia una vez, se refleja en todos lados.

---

## 1. Diagnóstico competitivo (Pereira + contexto)

### 1.1 El mercado
- Comida rápida en Colombia ≈ **USD 1.964M (2025)**, creciendo **~6,4%/año**. Los segmentos que más crecen: **personalización + delivery** — exactamente donde vive "arma tu enredo".
- Premium nacional de referencia: **Crepes & Waffles** (el patrón oro de "premium + hermoso + con alma local", pero *calmado/aspiracional*, no joven ni lúdico). Deja libre el espacio "premium + divertido + joven".

### 1.2 Pereira en concreto
| Actor | Categoría | Lectura |
|---|---|---|
| Bandidos, 20.30, Alextremo, La Milagrosa, La Mafia, One Seven, La30 | Hamburguesa artesanal Angus | **Categoría saturada.** Ticket premium ~$37.500–38.500. Es la referencia de precio, no el rival directo. |
| Burger Green | Bowls/plant-based | Único jugador "bowl", pero débil en marca y sin factor lúdico/instagrameable. |
| Latino, Ciao, Cherry Hill Food Hall | Gourmet / food hall | Confirman que Pereira paga por experiencia y presentación. Circunvalar/Pinares = zona premium; Circunvalar = vida nocturna. |
| Rappi | Canal | Domicilio pasa por Rappi. Hay que estar y verse bien ahí. |

### 1.3 La grieta (dónde ganamos)
1. **Anti-slop-bowl:** el formato bowl está validado globalmente pero se ve feo. Nosotros lo hacemos hermoso.
2. **Categoría virgen local:** nadie en Pereira tiene "arma tu bowl premium" con papa/pasta de héroe.
3. **Orgullo del Eje:** papa criolla, chicharrón, maicitos — ingrediente real, local, elevado. Diferencia emocional que una burger Angus genérica no tiene.
4. **Firma ownable:** la hebra es *marca-sistema*, on-trend 2025-26 ("firmas visuales por encima de logos" + marcas-mascota).

### 1.4 Trampas a evitar
- Ser "otro criollo gourmet" (ya existen). El diferenciador es **el enredo + armar + belleza**, no el ingrediente solo.
- Rojo+amarillo planos = "barato". El ancla **espresso** lo rescata (ver tokens).
- Animación bonita que mata el rendimiento móvil (se escanea por QR). Presupuesto de performance obligatorio.

---

## 2. ADN de marca (consolidado)

- **Posicionamiento:** comfort food premium para armar a tu gusto — *antojito de autor*, no fast food barato.
- **Público objetivo (Pereira):** 18–35, universitario/joven-profesional, activo en redes, sensible a lo *instagrameable*, con poder para pagar un ticket premium ocasional. Zona natural: Circunvalar/Pinares + domicilio (Rappi).
- **Personalidad:** alegre, cálida, un poco pícara, segura. Premium sin ser estirada.
- **Voz (español Colombia):** "Enrédate rico" · "Arma tu enredo" · "Papa + pasta + tu toque" · microcopys con guiño (*"sí, se puede pedir todo"*, *"el enredo es la gracia"*).
- **Idea rectora — EL ENREDO:** la hebra de spaghetti es un **trazo continuo** que forma letras, subraya, envuelve, divide, se anima y es el cuerpo de la mascota.

### 2.1 Hipótesis de precio (validar en el local)
Referencia premium local: burger ~$37.500. Objetivo de ticket Papaghetti: **$22.000–38.000** según build.
- **Base** (papa criolla / francesa / spaghetti): incluida.
- **Proteína** define el *tier* (pollo/cerdo estándar → res/mixtas premium).
- **Toppings**: 2–3 incluidos + toppings premium con cargo (nuggets calados en piña, chicharrón, tocineta, maicitos con queso).
> Acción: montar 3 "enredos insignia" a precio fijo para anclar, y el configurador para el resto.

---

## 3. El sistema "HEBRA" (no es un dibujo, es un sistema)

La hebra debe existir en **tres niveles** para sobrevivir todos los usos:

| Nivel | Qué es | Dónde se usa |
|---|---|---|
| **Hebra completa** | Trazo largo, expresivo, animable (SVG path) | Hero web, murales del local, empaques grandes |
| **Hebra-firma / wordmark** | La hebra formando "Papaghetti" | Logo principal, fachada, menú |
| **Marca reducida** | Un nudo/rulo mínimo del trazo | Favicon, ícono de app, sticker, bordado de delantal, tapa de domicilio |

**Reglas del trazo:** grosor consistente, remates redondeados, nunca líneas rectas para dividir secciones (siempre garabato de hebra). La mascota es la *misma* hebra animada — no un personaje aparte.

---

## 4. Design Tokens (listos para código)

Fuente única de verdad visual. Se consumen igual en la web y en el panel de admin → cohesión real.

### 4.1 Color
```css
:root {
  /* Base / anclas */
  --pg-crema:        #FBF1DE; /* fondo claro, aire premium */
  --pg-espresso:     #1E1611; /* fondo oscuro / texto, el ancla que da gourmet */
  /* Cálidos (apetito) */
  --pg-oro:          #F2A516; /* primario cálido, papa criolla */
  --pg-pomodoro:     #C8321E; /* acento apetito / CTAs */
  --pg-salsa:        #7A1F12; /* sombras profundas, premium */
  /* Acento mínimo */
  --pg-perejil:      #4C9A5A; /* frescura, uso <5% */

  /* Estados derivados (para UI/admin) */
  --pg-success:      #4C9A5A;
  --pg-warning:      #F2A516;
  --pg-danger:       #C8321E;
  --pg-agotado:      #9A8F82; /* topping sin stock: gris cálido, no rojo */

  /* Superficies */
  --pg-surface:      #FBF1DE;
  --pg-surface-2:    #F3E4C9;
  --pg-on-dark:      #FBF1DE;
  --pg-on-light:     #1E1611;
}
```
**Regla de proporción:** 60% crema/espresso · 30% oro · 10% pomodoro · pizca de perejil. **Nunca** rojo+amarillo planos a partes iguales.

### 4.2 Tipografía
```css
--pg-font-display: "Recoleta", "Bricolage Grotesque", serif; /* titulares, wordmark */
--pg-font-body:    "Satoshi", "General Sans", system-ui, sans-serif; /* UI y cuerpo */
```
Escala sugerida (móvil→desktop, `clamp`): display 40→72px · h2 28→40 · body 16→18 · caption 13.

### 4.3 Motion (con freno de rendimiento)
```css
--pg-ease-twirl: cubic-bezier(.22,1,.36,1); /* rebote suave de toppings */
--pg-dur-fast: 180ms; --pg-dur: 320ms; --pg-dur-slow: 900ms;
--pg-draw-hebra: 1600ms; /* dibujado del path en hero */
```
- **Obligatorio** respetar `prefers-reduced-motion`: sin dibujado ni parallax, solo fade.
- **Budget:** LCP < 2.5s móvil, animaciones a 60fps, JS de animación *lazy* bajo el pliegue.

### 4.4 Otros
```css
--pg-radius: 16px; --pg-radius-lg: 28px; /* redondeado = cálido/premium */
--pg-shadow: 0 10px 30px -12px rgba(30,22,17,.35);
--pg-grain: url(...); /* textura de grano sutil sobre superficies */
--pg-space: 4,8,12,16,24,32,48,64,96 (px, escala de 4);
```

> **Entregable Fase 0:** este bloque vive como `tokens.css` + `tokens.ts` (tipado) y como config de Tailwind. Un solo cambio de hex se propaga a web y admin.

---

## 5. El "CEREBRO" — arquitectura de cohesión

### 5.1 Principio
**Single source of truth:** un catálogo define los *módulos del enredo* y todo lo demás *consume* de ahí.

```
        ┌──────────────────────────────────────────┐
        │      PANEL ADMIN  (un solo catálogo)      │
        │  bases · proteínas · toppings · enredos   │
        │  precio · foto · estado · reglas de combo │
        │  + Design Tokens (color/tipografía/hebra) │
        └───────────────┬──────────────────────────┘
     publica ▼           ▼            ▼            ▼
   Sitio/Menú     Configurador   Pedidos/       Inventario
   (Next.js)      "arma enredo"  ticket cocina   (stock/insumos)
```
Beneficio concreto: marcas un topping **"agotado" una vez** → desaparece del menú, del configurador y del ticket; el inventario descuenta insumos solo; si un insumo llega a 0, su topping se marca agotado automáticamente.

### 5.2 Modelo de datos (borrador)
- `bases`, `proteinas`, `toppings` — cada uno: nombre, precio/cargo, foto, `activo`, `stock`/insumos ligados, tags (picante, veggie…).
- `enredos_insignia` — combos con nombre y precio fijo.
- `reglas` — combinaciones válidas / incompatibles / máximos.
- `pedidos` — build del cliente, canal (salón/QR/Rappi), estado (recibido→cocina→listo→entregado).
- `insumos` + `movimientos_inventario` — descuento por venta.

### 5.3 Stack recomendado (a confirmar en Fase 2)
- **Front:** Next.js (App Router) + TypeScript + Tailwind (tokens como CSS vars).
- **Animación:** GSAP (dibujado de la hebra) + Framer Motion (transiciones) + Lenis (scroll suave). Todo *lazy* y con `reduced-motion`.
- **Cerebro/back:** **Supabase** (Postgres + Auth + Storage + Realtime) como fuente de verdad que alimenta web, configurador, admin y ticket de cocina en vivo. Alternativa de contenido: Sanity si se prioriza edición tipo CMS.
- **Deploy:** Vercel. **Pedidos día 1:** handoff a WhatsApp/Rappi + modelo de pedido interno + vista de ticket para cocina.

---

## 6. Roadmap por fases

### Fase 0 — Fundamentos (marca viva) · *ahora*
- [ ] **Verificar nombre**: marca en SIC, dominio (`.com`/`.co`), @handles en IG/TikTok. *Bloqueante antes de imprimir nada.*
- [ ] Cerrar sistema de marca: hebra completa + firma + reducida.
- [ ] `tokens.css` / `tokens.ts` / config Tailwind (sección 4).
- [ ] 3 "enredos insignia" + tabla de precios ancla.
- **Hecho cuando:** tokens versionados en el repo y nombre/dominio confirmados.

### Fase 1 — Sitio web (el prompt de diseño) · Next.js
Secciones: Hero · Cómo funciona (3 pasos) · **Arma tu enredo** (configurador) · Menú destacado · Nuestra historia (el enredo) · Ubicación/pedidos · Footer con la hebra-firma.
Efectos clave: hebra que se dibuja y forma el wordmark · cursor-tenedor · hebra = barra de progreso de scroll · configurador con bowl que se llena · divisores de hebra · twirl en hover de platos.
- **Hecho cuando:** móvil primero, LCP<2.5s, `reduced-motion` ok, configurador funcional (aunque aún no conecte a cocina), desplegado en Vercel con QR para el local.

### Fase 2 — El cerebro  · *en marcha*
- [x] Capa de datos única (`web/lib/catalog.ts`) con interfaz lista para Supabase.
- [x] Panel admin en `/admin` (login + editar precio/activo/agotado + enredos), mismos tokens que la web.
- [x] Web y configurador leen del catálogo en vivo (precio/agotado se reflejan sin re-deploy). *Verificado E2E.*
- [ ] Migrar persistencia de JSON local → **Supabase** (esquema en `web/README.md`) para producción/serverless.
- [ ] Migrar el gate de `/admin` a Supabase Auth; cachear con ISR + `revalidateTag`.
- **Hecho cuando:** ✅ cambiar un precio/estado en admin se refleja en la web sin re-deploy (local). Falta Supabase para producción.

### Fase 3 — Pedidos + inventario en vivo  · *funcional (local), verificado E2E*
- [x] El enredo armado genera pedido → ticket de cocina → descuento de stock.
- [x] "Agotado" automático cuando el stock de un ingrediente llega a 0.
- [x] Tablero de cocina `/admin/cocina` (estados recibido→cocina→listo→entregado, auto-refresh).
- [x] Admin con stock editable + contador de pedidos activos.
- [ ] Persistir en Supabase (tablas `pedidos`/`insumos`) para producción/multi-canal.
- [ ] Realtime de cocina vía Supabase (hoy: auto-refresh cada 8s).
- **Hecho cuando:** ✅ un pedido desde "arma tu enredo" aparece en cocina y mueve inventario (local). Falta Supabase para producción.

### Fase 3.5 — Consola de administración  · *completa (local), verificada E2E*
Panel `/admin` con navegación lateral y estética de marca. Un solo login protege todo.
- [x] **Resumen** — KPIs (ventas hoy, ticket promedio, activos, agotados, leads) + últimos pedidos + alertas.
- [x] **Pedidos** — lista con filtros por estado, ingresos entregados, avanzar.
- [x] **Cocina** — tablero en vivo (auto-refresh).
- [x] **Inventario** — stock editable, poco-stock, reposición rápida (+10/+50), agotado.
- [x] **Menú** — precios de ingredientes y enredos.
- [x] **Leads (CRM)** — captura en el sitio ("Club Papaghetti") + gestión de estados.
- [x] **Reportes** — ventas 7 días, top productos, ticket promedio, leads por estado.
- [ ] Multi-usuario/roles y auth real (Supabase Auth); realtime en cocina.
- **Hecho cuando:** ✅ las 7 secciones operan sobre el cerebro local y se verificaron con datos sembrados.

---

## 7. Métricas (¿funciona?)
- **Marca/atracción:** guardados/compartidos en IG-TikTok, escaneos de QR, tráfico web.
- **Conversión:** % de sesiones que completan "arma tu enredo", ticket promedio vs. objetivo ($22–38k).
- **Operación:** tiempo pedido→listo, % de topping agotado no reflejado (debe tender a 0 con el cerebro).

## 8. Riesgos y decisiones abiertas
- ⚠️ **Nombre/marca:** confirmar disponibilidad antes de invertir en identidad e impresos.
- ⚠️ **Rendimiento vs. animación:** presupuesto fijo; degradar con elegancia.
- ❓ **Pedidos:** ¿arrancamos con handoff a Rappi/WhatsApp o pedido propio desde el día 1?
- ❓ **CMS vs. DB:** ¿Supabase (operación) o Sanity (contenido)? Decisión de Fase 2.

## 9. Próximos pasos inmediatos
1. **Verificar nombre + dominio + handles** (te confirmo yo con búsquedas si quieres).
2. Aprobar tokens de la sección 4 (o ajustar hex/tipografías).
3. Definir los **3 enredos insignia** y precios ancla.
4. Con eso cerrado, arrancamos **Fase 1 (Next.js)**: scaffold del proyecto + hero con la hebra.
