"use client";

/**
 * Hud — thin DOM control bar layered over the canvas.
 *
 * The rich HUD (score bars, heat palette, cosecha/almidón, draft cards) is rendered
 * INSIDE the canvas by the engine. This DOM overlay only carries the controls that must
 * stay reachable as real, accessible tap targets even if the canvas is busy: PAUSE and
 * REDUCE EFFECTS. It also mirrors score/multiplier from HudSnapshot for a quick readout.
 *
 * Steering must pass THROUGH the empty parts of this bar, so the container is
 * pointer-events:none and only the actual buttons opt back in (pointer-events:auto).
 */

import type { HudSnapshot } from "@/game/view/engine.ts";

export default function Hud(props: {
  hud: HudSnapshot | null;
  paused: boolean;
  reduceEffects: boolean;
  onTogglePause: () => void;
  onToggleReduce: () => void;
}) {
  const { hud, paused, reduceEffects, onTogglePause, onToggleReduce } = props;

  // NOTE: score + multiplier are drawn IN the canvas HUD; do NOT mirror them here (that caused
  // the doubled "x1.00"). This overlay only carries the reachable controls.
  void hud;
  return (
    <div className="enredo-hud">
      <div className="enredo-hud__controls">
        <button
          type="button"
          className="enredo-hud__btn"
          aria-pressed={reduceEffects}
          aria-label="Reducir efectos"
          onClick={onToggleReduce}
        >
          {reduceEffects ? "FX·off" : "FX·on"}
        </button>
        <button
          type="button"
          className="enredo-hud__btn"
          aria-pressed={paused}
          aria-label={paused ? "Reanudar" : "Pausa"}
          onClick={onTogglePause}
        >
          {paused ? "▶" : "II"}
        </button>
      </div>

      {paused && (
        <div className="enredo-hud__paused" role="status">
          <span>Pausa</span>
          <button
            type="button"
            className="enredo-play enredo-play--sm"
            onClick={onTogglePause}
          >
            Reanudar
          </button>
        </div>
      )}
    </div>
  );
}
