# EMPLATA v2 — el pedido ES un juego (estudio + spec)

## Diagnóstico de la v1 (rechazada)
DOM con chips + caja CSS decorativa = kiosco bonito, no juego. **La caja era espectadora, no
escenario.** Sin física, sin escena, sin la artesanía del juego.

## Referencias
- **Papa's Pizzeria / Good Pizza Great Pizza**: armar el pedido ES el gameplay (el género lo probó:
  ingredientes físicos + feedback por ingrediente + el plato armándose a la vista).
- **Overcooked**: comida rechoncha iluminada apilándose — ya es la biblia de arte de /juego.
- **Kioscos (McDonald's)**: el anti-patrón — eficiente y muerto.

## Pilares v2
1. **Canvas2D como en EL ENREDO** (no DOM): mostrador de cocina, UNA luz cálida arriba-izquierda,
   caja origami kraft centro-escenario con volumen, vapor idle, 60fps.
2. **Comida FÍSICA**: tap → el ingrediente vuela en arco con gravedad, rebota con squash&stretch y
   se apila DENTRO de la caja. Sprites horneados con el modelo de 5 capas del juego
   (AO → volumen → sombra propia → rim cálido → especular por material). Mapeo por id del catálogo
   (papa-criolla, spaghetti, chicharron, tocineta, maicitos, hogao, parmesano, aguacate, piña,
   nuggets, bolonesa, pollo…); ingrediente desconocido → gema iluminada con su emoji.
3. **Mismo ADN**: paleta espresso/ámbar/crema/tomate, Bricolage/Manrope, partículas soft-dot,
   sonido diegético WebAudio (cruje/chapotea/tintinea), haptics.
4. **El cerebro manda**: catálogo/precios/TOPPINGS_INCLUIDOS/impuesto vivos; `enviarPedido`
   canal "qr" tipo "mesa" (flujo existente → KDS). El juego es la piel.
5. **Bandeja en zona de pulgar** dibujada en canvas (hit-test propio, targets ≥48px) con pestañas
   BASE/PROTEÍNA/TOPPINGS; **PEDIR YA** (DOM) queda como camino rápido/accesible (masterprompt).
6. **Confirmar = momento estrella**: la caja se pliega en origami (animación canvas), sello
   PAPAGHETTI, y pasa al estado en vivo (recibido→cocina→listo).
7. **Reduced-motion / gama baja**: cae a la v1 DOM (que queda como fallback accesible).

## Arquitectura
- `EmplataGame.tsx` (client): canvas + loop raf + física simple + sprites horneados on-mount +
  hit-testing + sonido; recibe el MISMO props shape que EmplataClient y llama enviarPedido.
- `page.tsx` decide: reduced-motion o `?2d=1` → EmplataClient (v1); si no → EmplataGame.
- La v1 NO se borra: es el fallback accesible y el modo PEDIR YA.
