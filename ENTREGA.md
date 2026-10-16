# Papaghetti — entrega del sistema

Esta guía es para el dueño del restaurante. Cuenta qué hay en el sistema, cómo se usa todos los días, qué se puede cambiar sin programador y cómo quedarse con todas las cuentas a su nombre.

- **El sitio:** https://papaghetti.vercel.app (la carta, el juego para armar el plato y el pedido por QR en `/pedir`).
- **El panel ("el cerebro"):** https://papaghetti.vercel.app/admin, con la contraseña del negocio.
- **La pantalla de cocina:** https://papaghetti.vercel.app/kds, para dejarla abierta en la tablet de la cocina.

---

## 1. Entrar al panel

1. Abre `/admin`, toca tu nombre y escribe la contraseña.
2. La contraseña es una sola para todo el equipo. El nombre sirve para que el **Historial** diga quién cobró, quién canceló y quién tocó la despensa.
3. Los nombres se cambian en **Ajustes → Usuarios del panel** (hasta 8 personas). Quien ya está dentro conserva su nombre hasta que salga y vuelva a entrar.
4. La sesión dura 8 horas y se renueva sola mientras se usa el panel.

## 2. El día a día

1. **Abrir el negocio.** En **Ajustes** (o en el Resumen), el botón *Abrir el negocio*. Con el negocio cerrado, el sitio y el QR no reciben pedidos.
2. **Abrir la caja.** En el **Resumen**, *Abrir caja* con el fondo con el que arrancas.
3. **Contar la despensa.** En **Inventario**, ajusta lo que de verdad hay. Cuando llegue mercancía, escribe la cantidad y **lo que pagaste**: el sistema registra el gasto exacto y aprende el costo por unidad.
4. **Recibir pedidos.** Entran por tres puertas y todas caen en el mismo sitio: el **QR** (`/pedir`), el **sitio web** y el botón **+ Nueva comanda** de **Pedidos** (teléfono y mostrador).
5. **Cocinar.** La pantalla de **Cocina** (o `/kds` en la tablet) muestra los pedidos en orden de llegada con su cronómetro. El botón grande los avanza: *A cocina → Listo → Entregar*.
6. **Cobrar.** En **Pedidos**, elige el método de pago (efectivo, Nequi, Daviplata, Bre-B, tarjeta, transferencia). El botón **🧾 Comprobante** imprime el papel o lo manda por WhatsApp.
7. **Cerrar.** En el **Resumen**, *Cerrar caja y contar*: cuentas el cajón primero y después el sistema te dice cuánto debería haber y la diferencia. Al final, *Cerrar el negocio*.

## 3. Qué hay en cada pantalla del panel

| Pantalla | Para qué sirve |
|---|---|
| **Resumen** | Ventas de hoy, tareas pendientes, abrir y cerrar caja, cierre del turno. |
| **Pedidos** | La caja de hoy: tomar comandas, cobrar, corregir un cobro, cancelar, devolver dinero, imprimir o mandar el comprobante. |
| **Comprobantes** | Todos los comprobantes de cualquier día: buscar, reimprimir, mandar por WhatsApp y exportar a Excel para el contador. |
| **Precios** | Cambiar el precio de cualquier cosa, **ajustar todos los precios de una vez** con un porcentaje y configurar los adicionales de la caja. |
| **Cocina** | El tablero de la cocina (el mismo de `/kds`). |
| **Salón** | Los pedidos agrupados por dónde está el cliente, para cobrar una mesa entera. |
| **Inventario** | La despensa: cantidades, abastecer, insumos bajos. |
| **Recetas** | Qué gasta cada porción y cuánto cuesta: el margen de cada plato. |
| **Menú** | Crear, editar, fotografiar, activar o apagar productos y platos. |
| **Leads** | Las personas que se inscribieron en el Club desde el sitio. |
| **Finanzas** | Ventas, gastos, utilidad, lo más vendido y las ventas por hora. |
| **Historial** | Cada acción con su hora y quién la hizo. Desde aquí también se deshace. |
| **Ajustes** | Cobro y servicio, comprobante, sitio web, usuarios, copia de seguridad (ver la sección 4). |
| **Impresora** | Preparar y probar la impresora térmica, y el kit para el PC de la caja. |
| **Ayuda** | La guía corta del día a día, dentro del panel. |

Arriba de todas las pantallas están **Deshacer** y **Rehacer**: revierten el último cambio de carta o de ajustes (un precio, una receta, un texto del sitio). No deshacen pedidos, cobros ni movimientos de caja: eso queda como pasó.

## 4. Lo que se cambia sin programador

Todo esto se hace desde el panel y se ve en el sitio en segundos:

- **Precios:** uno por uno en **Precios**, o todos a la vez con **Precios → Ajustar precios**: *Subir* o *Bajar*, el porcentaje (hasta 50 %) y los grupos (Bases, Proteínas, Acompañantes, Platos y Adicionales). La vista previa muestra cada precio antes y después, redondeado a $100, y avisa si una promoción o una descripción tiene un precio escrito a mano (ese lo corriges tú). Las salsas no se tocan y lo que está apagado también se ajusta. Si no era eso, **Deshacer** lo revierte entero. Si alguien cambia un precio desde otro aparato mientras miras la vista previa, no se aplica nada y te pide revisarla otra vez.
- **La carta:** productos, platos, fotos y qué está activo, en **Menú**. Lo que se acabó se marca en **Inventario** (poniendo el insumo en 0) o como agotado.
- **Dos bases en un plato:** en **Ajustes → Cobro y servicio**: una base o hasta dos, y si dos bases se cobran *mitad y mitad* (la más cara, media porción de cada una) o *las dos completas*. Vale en el sitio, en el juego, en el QR y en **Pedidos → + Nueva comanda**, y el plato sale en cocina y en el papel como «Spaghetti / Papa criolla · mitad y mitad». **De fábrica viene encendido** (hasta dos, mitad y mitad): si prefieres una sola base, cámbialo ahí.
- **El comprobante:** en **Ajustes → Comprobante**: nombre comercial, razón social, NIT, dirección, teléfono, logo propio, mensaje de cierre, hasta 3 líneas al pie (Wi-Fi, Instagram, web) y qué datos del cliente salen. La vista previa muestra el papel como sale en la térmica, en la impresora de texto y en WhatsApp: las cuatro salidas dicen lo mismo. El logo se pasa solo a blanco y negro (*Más fino* o *Más grueso* si hace falta); *Quitar logo* vuelve al de la casa. Los emojis no se imprimen, y la clave del Wi-Fi va sin tildes ni eñes. El título "COMPROBANTE DE CONSUMO" no se cambia (ver la sección 8).
- **El sitio web:** en **Ajustes → Sitio web**, por bloques que se guardan cada uno por su lado: *Contacto y horarios*, *Domicilios y mapa* (Rappi, DiDi, Google Maps), *Redes*, *Reseñas reales*, *Portada*, *Historia*, *Textos sueltos* y *Buscadores y compartir* (lo que muestran Google y WhatsApp). Un texto en blanco vuelve al original. El teléfono, las redes y las reseñas vienen apagados: salen cuando se encienden. Mientras el WhatsApp sea el número de ejemplo, el sitio esconde sus botones. La dirección y el teléfono son los mismos del comprobante. Las fotos tienen su botón *Volver a la foto original*. Las reseñas solo pueden ser reales, copiadas tal cual de una fuente pública. El diseño (letras, colores, animaciones) es fijo.
- **Promociones** del sitio, **domicilio**, **pedido mínimo**, **impuesto** y **control de inventario:** en **Ajustes**.
- **Quién entra al panel:** en **Ajustes → Usuarios del panel**.

## 5. Copias de seguridad

- **Automática:** todos los días el sistema guarda una copia del cerebro en el mismo almacén de Vercel.
- **La tuya:** en **Ajustes → Dónde se guarda todo → Descargar copia completa**. Baja un archivo con todo el negocio: carta, despensa, pedidos y comprobantes archivados, caja, gastos y ajustes. **Lleva nombres y teléfonos de clientes:** guárdalo en un lugar privado (por ejemplo, una carpeta tuya de Google Drive). Las fotos van como enlaces, no como imágenes.
- Recomendado: descargarla una vez por semana y siempre antes de cualquier cambio de cuentas.
- Restaurar una copia lo hace un desarrollador (no hay botón de restaurar en el panel, a propósito: es una operación delicada).

## 6. Las variables de entorno

Son los datos secretos y de configuración que el sistema lee en Vercel (*Project → Settings → Environment Variables*). **Cualquier cambio exige volver a desplegar** (*Deployments → Redeploy*) para que cuente.

| Variable | Para qué sirve | ¿Obligatoria? | ¿De quién debe ser? |
|---|---|---|---|
| `ADMIN_PASSWORD` | La contraseña del panel. Sin ella nadie entra. | **Sí** | Del dueño. Cámbiala al recibir el sistema. |
| `SESSION_SECRET` | La llave con la que se firman las sesiones. Si falta, se usa la contraseña. | Recomendada | Del dueño: una cadena larga al azar. Cambiarla saca a todo el mundo del panel. |
| `BLOB_READ_WRITE_TOKEN` | El acceso al almacén donde vive todo el negocio (Vercel Blob). Sin él, nada se guarda de un día para otro. | **Sí** | Del almacén del dueño (Vercel la pone sola al conectar el almacén al proyecto). |
| `BLOB_STORE_ID` | La otra forma de conectar el almacén (la que pone Vercel al conectar un almacén nuevo). Sirve en lugar del token. | Según cómo se conecte | Vercel la pone sola. |
| `NEXT_PUBLIC_SITIO_URL` | La dirección del sitio (por ejemplo `https://papaghetti.co`) para Google, las redes y la foto que se comparte desde el juego. Sin ella, `https://papaghetti.vercel.app`. | No | Del dueño, cuando tenga dominio propio. |
| `DEEPSEEK_API_KEY` | La llave del asistente **Ghett-IA** del panel. Sin ella, el asistente dice que no está configurado y todo lo demás funciona. | No | Del dueño (su propia cuenta de DeepSeek) o ninguna. |
| `NEXT_PUBLIC_PG_USUARIOS` | Respaldo de los nombres del panel (separados por coma) si Ajustes no tiene nombres. | No | Opcional; lo normal es usar Ajustes. |
| `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE` | Una base de datos alternativa (Supabase). **Hoy no se usa: no las pongas.** Si se ponen las dos, el sistema empieza a leer de Supabase, que está vacío. | No | Solo para una migración planeada por un desarrollador. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Solo para la tabla de puntajes del juego "El Enredo" (en pausa). | No | Nadie por ahora. |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_OIDC_TOKEN`, `NODE_ENV` | Las pone Vercel o Next.js solas. | — | Nadie las toca. |
| `PG_BLOB`, `PG_PERMITIR_PRODUCCION` | Herramientas del desarrollador en su computador. **Nunca en Vercel.** | No | Nadie. |

## 7. Quedarse con todo a nombre del dueño

Hoy el proyecto vive en la cuenta de Vercel y en el GitHub del desarrollador. Para que el negocio no dependa de nadie:

**Antes de empezar (con el local cerrado):**
1. **Ajustes → Cerrar el negocio.** Que todos cierren el panel en la caja, la cocina y los celulares.
2. **Ajustes → Descargar copia completa.** Guárdala en dos lugares.
3. Anota lo que dice **Ajustes → Dónde se guarda todo**: el almacén, el número de pedidos y el peso.

**El proyecto y el almacén (Vercel):**
4. El dueño crea su cuenta de Vercel. Para un negocio se recomienda el plan **Pro**: el plan gratuito (Hobby) es solo para uso no comercial.
5. En el proyecto `papaghetti`: *Settings → General → Transfer Project* → la cuenta del dueño.
6. **El almacén no viaja solo con el proyecto.** Sin el siguiente paso, el sitio sigue funcionando pero los datos se quedan en la cuenta del desarrollador. En *Storage → (el almacén del proyecto) → Settings → Transfer Store* → la misma cuenta del dueño. Luego, en la pestaña del almacén, confirmar que está conectado al proyecto.
7. **Volver a desplegar** (*Deployments → Redeploy*) y **verificar**:
   - No aparece ninguna franja roja arriba del panel.
   - **Ajustes → Dónde se guarda todo** dice *Almacén de Vercel*, en verde, con el **mismo** número de pedidos y el mismo almacén que anotaste.
   - Se abre un comprobante de hoy y uno de un mes viejo, y el sitio muestra la carta con sus precios y fotos.
   - Al día siguiente sigue todo ahí.

**Si al verificar algo no cuadra:** no operes el negocio. Si el panel muestra la carta de fábrica y 0 pedidos, el proyecto está leyendo OTRO almacén: los datos reales siguen intactos en el original; hay que corregir la conexión del almacén. Si dice "Disco temporal", falta conectar el almacén en Producción. En último caso, un desarrollador restaura la copia del paso 2.

**El código (GitHub):**
8. El repositorio es `M0fen/papaghetti`. Se puede **transferir** (*Settings → Danger Zone → Transfer ownership*) a la cuenta del dueño, o dejarlo donde está y darle acceso (*Settings → Collaborators*).
9. Hoy subir código a GitHub **no despliega** el sitio: el proyecto de Vercel no está conectado al repositorio y se despliega a mano (`cd web && vercel --prod`). En la cuenta del dueño conviene conectarlos (*Vercel → Project → Settings → Git*) para que cada cambio aprobado se publique solo.

**Las llaves:**
10. Nueva `ADMIN_PASSWORD` (la elige el dueño) y nuevo `SESSION_SECRET` (una cadena larga al azar), y volver a desplegar. Eso **cierra todas las sesiones abiertas**: el desarrollador ya no puede entrar, y el equipo entra con la clave nueva.
11. **Ghett-IA:** poner la `DEEPSEEK_API_KEY` de una cuenta del dueño, o borrarla (el asistente queda apagado y todo lo demás funciona). El desarrollador debe revocar la suya.
12. El desarrollador borra de su computador cualquier copia de las variables de producción (el archivo `web/.env.local`).

**El dominio propio (cuando se compre):**
13. Comprar el dominio (por ejemplo `papaghetti.co`) a nombre del negocio.
14. En Vercel: *Project → Settings → Domains → Add*, y crear en el proveedor del dominio los registros DNS que Vercel indique.
15. Poner `NEXT_PUBLIC_SITIO_URL=https://el-dominio` y volver a desplegar.
16. Dejar funcionando también `papaghetti.vercel.app`: los QR que ya estén impresos apuntan ahí. Los QR nuevos se imprimen con el dominio propio (`https://el-dominio/pedir`).

## 8. Lo que el sistema NO hace

- **No emite factura electrónica de la DIAN.** El papel que entrega es un **comprobante de consumo**, un documento interno de control: por eso su título no se puede cambiar desde Ajustes, y Ajustes rechaza las palabras de los documentos fiscales. La nota legal que llevaba al pie se quitó a pedido del dueño (octubre de 2026: el negocio no es responsable del impuesto al consumo y el trámite ante la DIAN está en curso). Si el negocio está obligado a facturar electrónicamente (lo define el RUT con el contador), hay que integrar un **proveedor tecnológico autorizado por la DIAN** (por ejemplo Factus, Alegra o Dataico) mediante su API. Es un desarrollo aparte.
- **No cobra en línea.** Los pagos se registran en la caja; no hay pasarela de pago.
- **Rappi y DiDi** son solo enlaces a la tienda del negocio en esas plataformas: sus pedidos no entran solos al panel.
- **No funciona sin internet.** Si se cae la conexión, se anota en papel y se teclea después (la Ayuda del panel lo explica).
- **Un solo local, una sola contraseña.** No hay permisos distintos por persona: los nombres sirven para saber quién hizo qué, no para restringir.

## 9. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| Franja roja arriba del panel: "los pedidos no se están guardando" | El almacén no está conectado en Producción. Revisar la sección 7 (paso 6) y volver a desplegar. |
| "El panel no tiene contraseña configurada" | Falta `ADMIN_PASSWORD` en Vercel. Ponerla y volver a desplegar. |
| El sitio no muestra los botones de WhatsApp | El número sigue siendo el de ejemplo. Ponerlo en **Ajustes → Sitio web**. |
| Todo sale agotado y no se puede vender | Contar la despensa en **Inventario**, o apagar *Controlar el inventario* en **Ajustes → Cobro y servicio** mientras tanto. |
| La impresora no imprime | **Impresora** en el panel: tiene los pasos y el kit para el PC de la caja. |
| Hice un cambio por error | **Deshacer**, arriba. Para ver qué pasó y quién, **Historial**. |
| *Deshacer* no devolvió una foto o el logo | Las fotos y el logo no van en Deshacer: *Volver a la foto original* en **Ajustes → Sitio web**, *Quitar logo* en **Ajustes → Comprobante**. |
| No aparece el botón de Rappi o DiDi | El enlace está vacío. Pegarlo completo en **Ajustes → Sitio web → Domicilios y mapa**. |
| Una reseña no se ve en el sitio | Falta tocar *Mostrarlas en el sitio* en **Reseñas reales**. |
| Google o WhatsApp muestran el título o la foto de antes | Ellos guardan su propia copia y tardan unos días en actualizarla. |

## 10. Para el desarrollador que continúe

- La app está en `web/`. Antes de tocar código: `web/AGENTS.md` (Next.js 16 cambia APIs) y los comentarios de `web/lib/catalog.ts`.
- Desplegar **siempre desde `web/`**: `cd web && vercel --prod --yes`. Desde la raíz del repositorio el build falla y el sitio sigue mostrando la versión anterior.
- Pruebas: `cd web && npm test` (Node 22.15 o más nuevo). Escriben solo en `web/data/catalog.json` y lo dejan como estaba. **Se niegan a correr si hay variables de producción en el entorno**; nunca las pongas a propósito.
- Nunca correr contra producción los scripts `qa-persistencia`, `qa-poner-a-cero`, `qa-sembrar` ni `qa-prod`.
- Las pruebas de navegador (`qa-comprobante`, `qa-impresion-profunda`, `qa-directa`, `qa-comprobantes-ui`) van contra un `next start` local: `PG_URL=http://127.0.0.1:PUERTO node qa-comprobante.mjs`.
- Si `tsc` se queja de `RouteContext`, falta `npx next typegen` (los tipos de rutas no están en git).
- **Restaurar una copia completa** (la que baja Ajustes): `cd web && node --import ./qa-ts.mjs restaurar-copia.mjs copia.json` solo simula y dice qué haría; con `--de-verdad` escribe, y antes guarda lo que había como `respaldo-antes-de-restaurar-<fecha>`. Sin variables de producción restaura el cerebro local. Para producción: el negocio cerrado y todas las pantallas cerradas, `PG_BLOB=1`, el `BLOB_READ_WRITE_TOKEN` del almacén y `PG_PERMITIR_PRODUCCION=1`; después, volver a desplegar.
- **Fotos:** las nuevas se guardan en el almacén privado y se sirven desde el mismo sitio en `/foto/fotos/…`. Las que ya estaban guardadas como texto dentro del cerebro siguen funcionando y pasan al almacén cuando se vuelven a subir. La caché de un año de `next.config.ts` deja fuera `/foto/` a propósito.
- **Después de cada despliegue grande, sin crear pedidos:** abrir `/`, `/pedir` y `/admin`; en **Ajustes → Dónde se guarda todo** ver *Almacén de Vercel* en verde y el mismo almacén; subir una foto y comprobar que su dirección empieza por `/foto/fotos/` y que carga; bajar la copia completa; mandar el enlace del sitio por WhatsApp y mirar la vista previa.
- Escrituras al mismo tiempo: el cerebro une a tres vías lo que cambió cada aparato (carta, despensa y ajustes; `fusionar` en `lib/catalog.ts`, probado en `qa-fusion.mjs`). Deshacer solo guarda cambios de carta y ajustes; los pedidos y la caja se escriben como *transaccionales* y no ocupan la pila.
