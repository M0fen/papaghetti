"use client";

/* El módulo PEREZOSO del juego (auditoría de optimización): EmplataGame son ~4800
 * líneas + WebGL que viajaban en el JS inicial del landing sin que nadie abriera el
 * juego (~166KB de chunk). Este wrapper agrupa juego + su CSS en un chunk propio que
 * solo se descarga cuando el cliente toca "Empezar a enredar" (ver JuegoProvider). */

import EmplataGame from "@/app/m/[mesa]/EmplataGame";
import "@/app/m/[mesa]/emplata.css";

export default EmplataGame;
