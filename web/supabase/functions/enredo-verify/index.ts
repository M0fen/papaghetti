// ============================================================================
// EL ENREDO · Edge Function "enredo-verify" (Deno) — ANTI-TRAMPA (Prompt Maestro §10)
// ----------------------------------------------------------------------------
// El score JAMÁS se confía al cliente. Aquí se RE-SIMULA la partida headless con
// EL MISMO /sim determinista: se recrea createWorld(seed,mode) y se reproduce cada
// entrada del input_log; si el score recomputado no coincide con el enviado, se
// rechaza (verified=false / 422). Solo las runs verificadas entran a la tabla.
//
// DESPLIEGUE (el sim vive fuera de la carpeta de la función, y Deno no puede subir
// de nivel arbitrariamente, así que hay que COPIAR el sim aquí):
//   cp -r web/game/sim  web/supabase/functions/_sim
//   supabase functions deploy enredo-verify --no-verify-jwt
//   supabase secrets set SB_URL=<project-url> SB_SERVICE_ROLE=<service_role_key>
// (El sim es TS puro y erasable → corre en Deno sin cambios. import con ".ts".)
// ============================================================================

import { createWorld, step, getScore } from "../_sim/index.ts";
import type { Input, World } from "../_sim/index.ts";

type LogEntry = { t: number; a: number; b: 0 | 1; c: number; r: 0 | 1 };
type Payload = {
  player_uuid: string;
  alias?: string;
  mode: "run" | "rush" | "daily" | "RUN" | "RUSH" | "RETO";
  seed: number;
  score: number;
  duration_ms: number;
  input_log: LogEntry[];
  cards_picked?: string[];
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODE_MAP: Record<string, "RUN" | "RUSH" | "RETO"> = {
  run: "RUN", rush: "RUSH", daily: "RETO", RUN: "RUN", RUSH: "RUSH", RETO: "RETO",
};
const TABLE_MODE: Record<string, string> = { RUN: "run", RUSH: "rush", RETO: "daily" };

const MAX_TICKS = 60 * 60 * 15; // 15 min hard ceiling (well past an 8–12 min run)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function reject(reason: string, status = 422): Response {
  return json({ ok: false, verified: false, reason }, status);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reject("method", 405);

  let p: Payload;
  try {
    p = await req.json();
  } catch {
    return reject("bad json", 400);
  }

  // --- Shape / sanity gates (cheap, before the replay) ---
  const mode = MODE_MAP[p.mode];
  if (!mode) return reject("mode");
  if (typeof p.seed !== "number" || (p.seed >>> 0) !== p.seed) return reject("seed");
  if (typeof p.score !== "number" || p.score < 0) return reject("score");
  if (!Array.isArray(p.input_log) || p.input_log.length === 0) return reject("empty log");
  if (p.input_log.length > MAX_TICKS) return reject("log too long");
  if (typeof p.player_uuid !== "string" || p.player_uuid.length < 8) return reject("player");

  // input rate must be humanly/engine-possible: exactly one entry per 60Hz tick,
  // with monotonic ticks and angles in range. duration coherent with tick count.
  const expectedTicks = Math.round((p.duration_ms / 1000) * 60);
  if (Math.abs(p.input_log.length - expectedTicks) > 180) return reject("duration mismatch");
  let prevT = -1;
  for (const e of p.input_log) {
    if (e.t <= prevT || e.t - prevT !== 1) return reject("non-monotonic ticks");
    prevT = e.t;
    if (e.a < 0 || e.a > 65535) return reject("angle range");
    if (e.b !== 0 && e.b !== 1) return reject("boost");
    if (e.r !== 0 && e.r !== 1) return reject("reroll");
  }

  // --- The real gate: RE-SIMULATE with the identical /sim and compare the score ---
  const world: World = createWorld(p.seed >>> 0, mode);
  const input: Input = { angle: 0, boost: false, cardPick: -1, reroll: 0 };
  for (const e of p.input_log) {
    input.angle = e.a;
    input.boost = e.b === 1;
    input.cardPick = e.c;
    input.reroll = e.r;
    step(world, input);
  }
  const recomputed = getScore(world);
  if (recomputed !== p.score) {
    return json({ ok: false, verified: false, reason: "score mismatch", recomputed }, 422);
  }

  // --- Persist as verified via the service role (bypasses RLS) ---
  const SB_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL");
  const SERVICE = Deno.env.get("SB_SERVICE_ROLE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SERVICE) {
    // Verified but not stored (secrets missing): still tell the client it was legit.
    return json({ ok: true, verified: true, stored: false, reason: "no db secrets" });
  }

  const row = {
    player_uuid: p.player_uuid,
    alias: p.alias ? String(p.alias).slice(0, 24) : null,
    mode: TABLE_MODE[mode],
    seed: p.seed >>> 0,
    score: p.score,
    duration_ms: p.duration_ms,
    input_log: p.input_log,
    cards_picked: Array.isArray(p.cards_picked) ? p.cards_picked.slice(0, 64) : [],
    verified: true,
  };

  try {
    const res = await fetch(`${SB_URL}/rest/v1/enredo_runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ ok: true, verified: true, stored: false, reason: "insert failed", detail: detail.slice(0, 200) });
    }
    const inserted = await res.json().catch(() => null);
    return json({ ok: true, verified: true, stored: true, row: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (e) {
    return json({ ok: true, verified: true, stored: false, reason: "db error", detail: String(e).slice(0, 200) });
  }
});
