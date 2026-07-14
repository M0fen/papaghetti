# EL ENREDO — Referencias y recursos (scouting verificado)

> Norte de diseño: **"el juego de la culebrita, versión fideo"** (slither.io + spaghetti), con
> capa incremental/roguelite (Brotato / Vampire Survivors / TFT) como cóctel. Simple y vistoso.
> Todo lo de abajo se verificó abriendo cada URL. Leyenda: ⭐ = licencia permisiva + alto encaje.

## 🚀 Empezar por aquí
1. **m0Corut/snake-io-multiplayer** (MIT) — https://github.com/m0Corut/snake-io-multiplayer — TS con separación sim tick-fijo / view (tu stack exacto). Game loop determinista + BotController como base de bots/oleadas.
2. **DesirePathGames/Slay-The-Robot** (MIT) — https://github.com/DesirePathGames/Slay-The-Robot — cartas-como-datos + pipeline Validator/Interceptor/Hook = molde para el shop con SINERGIAS estilo TFT.
3. **Elixonus/worm** (MIT, https://github.com/Elixonus/worm) + **600 Snakes on the Edge** (concepto, https://dev.to/linmingren/600-snakes-on-the-edge-...-24ca) — cuerpo-fideo: cadena de nodos equidistantes + trail sampling.
4. **Kenney CC0** (UI Pack + Particle Pack + Food Kit) + **fuentes Google OFL** (Fredoka, Titan One, Baloo 2, Nunito) + **paleta Fire** (coolors) — look "calidad Steam" con cero riesgo legal/costo.
5. **guerrillacontra rope** (MIT) + **Mulberry32** (CC0) + charlas de juice — capa "premium": jiggle glossy del fideo anclado al sim, RNG de view separado, squash/shake/hitstop. Todo en view, sin tocar determinismo.

## Repos snake/slither
- ⭐ m0Corut/snake-io-multiplayer (MIT) · ⭐ Elixonus/worm (MIT) · ⭐ bibhuticoder/snake.io (MIT, multi-canvas por capas)
- mathe00/slither-clone-sio (MIT, Spatial Grid + Area of Interest) · vzhou842/example-.io-game (MIT, interpolación de estados) · simondiep/node-multiplayer-snake (MIT)
- ⚠️ knagaitsev/slither.io-clone — SIN licencia, solo referencia conceptual.

## Repos survivor/roguelite/deckbuilder (shop, oleadas, sinergias)
- ⭐ yudinikita/rick-survival (MIT, TS+Phaser, generador de oleadas por dato) · ⭐ brettchalupa/minimal_survivors (Unlicense, funciones puras sobre estado único)
- DesirePathGames/Slay-The-Robot (MIT) · Arefnue/NueDeck (MIT) · getsentry/sentaur-survivors (Apache-2.0) · twanvl/sts-synergy-relic (MIT, sugerencia de sinergias)

## Técnicas / librerías (todo en VIEW, no toca el sim)
- ⭐ @tweenjs/tween.js (MIT, easings) · ⭐ tsParticles (MIT — `autoPlay:false`, avanzar con dt de render) · ⭐ guerrillacontra/html5-es6-physics-rope (MIT — jiggle cosmético anclado al sim) · ⭐ Mulberry32 (CC0 — RNG de view separado)
- Charlas: "Juice it or lose it" (Jonasson/Purho) · "The Art of Screenshake" (Vlambeer). Hitstop = pausa solo del reloj de render / N ticks contados; shake = offset de cámara en draw().

## Packs de assets
**Comida CC0 (sin atribución):** ⭐ Henry Software Free Pixel Food (henrysoftware.itch.io/pixel-food) · ⭐ ghostpixxells pixelfood · Kenney Food Kit · OGA CC0 Food Icons.
**Comida con atribución (CC BY):** alexkovacsart 100 foods (CC BY 4.0) · game-icons.net Food (CC BY 3.0) · CraftPix 40 Food Icons (royalty-free, PSD por capas — permite arepa/chicharrón en tu paleta).
**UI / partículas / marcos (Kenney CC0):** ⭐ UI Pack · ⭐ Particle Pack · Fantasy UI Borders (marcos de rareza) · Smoke Particles.

## Juegos de inspiración
- **ENREDO/área:** splix.io / Paper.io (flood-fill de área encerrada = tu multiplicador de lazo).
- **Snake+roguelite:** Rogue Snake (Steam) · Little Big Snake · Snake.io (feel táctil de referencia).
- **Shop/sinergias:** Brotato (reroll + sinergias) · Vampire Survivors (snowball, 1 dedo).
- **Comer=poder / arte de comida:** Bite the Bullet · Cuisineer (arte apetitoso, damage-by-flavor) · Overcooked 2 (legibilidad) · Cook Serve Delicious 3 (ritmo por servicio) · Diner Dash (servicio cronometrado).
- **Pulido móvil:** Holedown ("just one more round", upgrades minimalistas, Canvas puede sentirse Steam).

## Fuentes / paleta / audio
- **Fuentes OFL (self-host woff2):** ⭐ Fredoka (wordmark) · Titan One (banners/números) · Baloo 2 (cartas) · Nunito (HUD).
- **Paleta:** ⭐ Coolors "Fire" (003049·D62828·F77F00·FCBF49·EAE2B7) — calcada al brief; añadir verde #06D6A0 para hierbas/estado seguro.
- **Audio CC0:** ⭐ Kenney Interface Sounds · ⭐ Kenney Impact Sounds · ⭐ OGA 50 retro/synth SFX · ⭐ Tallbeard Music Loop Bundle · Freesound 527780 (bite/chew/gulp, CC0).

## ⚖️ Licencias para lanzamiento comercial SIN marca
- **Verde (sin miedo):** MIT / Apache-2.0 (conserva LICENSE/NOTICE) · Unlicense / CC0 / dominio público (Kenney, Henry, ghostpixxells, OGA, Tallbeard, Freesound D.jones, Mulberry32) · OFL-1.1 (fuentes; self-host, no vender la fuente suelta) · paletas (colores no son IP).
- **Amarillo (obligación):** CC BY 3.0/4.0 (alexkovacsart, game-icons.net) → exigen pantalla de créditos. Prioriza equivalentes CC0.
- **Rojo (no incorporar al build):** "sin licencia" = todos los derechos reservados (knagaitsev, blogs) → solo referencia conceptual, reimplementar a mano. jasonmayes/Particle-Engine → propietaria.

**Regla práctica:** construir sobre MIT + CC0 (los ⭐) = juego 100% shippeable sin una sola línea de créditos obligatorios.
