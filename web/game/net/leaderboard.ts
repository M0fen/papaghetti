/**
 * leaderboard.ts — client submitter for EL ENREDO runs (Prompt Maestro §10).
 *
 * The score is NEVER trusted from the client. We POST the run (seed + score + duration +
 * cards + FULL input log) to a Supabase Edge Function that imports the SAME /sim module and
 * RE-SIMULATES the run headless; because the sim is fixed-point and deterministic, the
 * result must match or the row is stored with verified=false. This module just ships the
 * envelope and fails soft: no network / no Supabase configured must never break the game.
 *
 * Client-only, no React, no sim. The player identity (anon UUID + optional alias) rides along.
 */

import { getIdentity } from "@/game/net/identity.ts";
import type { RunResult } from "@/game/view/engine.ts";

/** Mode names as stored in Supabase (see supabase/enredo.sql: 'run' | 'rush' | 'daily'). */
const MODE_MAP: Record<RunResult["mode"], "run" | "rush" | "daily"> = {
  RUN: "run",
  RUSH: "rush",
  RETO: "daily",
};

export interface SubmitResult {
  ok: boolean;
  verified?: boolean;
  rank?: number;
  error?: string;
}

/**
 * Submit a finished run to the leaderboard Edge Function. Resolves { ok:false } (never
 * throws) when the leaderboard is offline or unconfigured, so callers can render calmly.
 */
export async function submitRun(run: RunResult): Promise<SubmitResult> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base) return { ok: false, error: "leaderboard-offline" };

  const id = getIdentity();
  const payload = {
    player_uuid: id.id,
    alias: id.alias ?? null,
    mode: MODE_MAP[run.mode],
    seed: run.seed,
    score: run.score,
    duration_ms: run.durationMs,
    victory: run.victory,
    best_enredo: run.bestEnredo,
    cards_picked: run.cardsPicked,
    input_log: run.inputLog,
  };

  try {
    const res = await fetch(`${base}/functions/v1/submit-run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(anon ? { authorization: `Bearer ${anon}`, apikey: anon } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true, // survive the page being closed right after game over
    });
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const data = (await res.json().catch(() => ({}))) as {
      verified?: boolean;
      rank?: number;
    };
    return { ok: true, verified: data.verified, rank: data.rank };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}
