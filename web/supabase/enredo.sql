-- ============================================================================
-- EL ENREDO · Leaderboard + anti-trampa (Prompt Maestro §10)
-- ----------------------------------------------------------------------------
-- El score JAMÁS se confía al cliente. El cliente envía seed + score + duración +
-- el LOG DE INPUTS; una Edge Function (Deno) importa EL MISMO módulo /sim y
-- RE-SIMULA la partida headless. Como el sim es punto fijo y determinista, el
-- resultado es idéntico; si el score no coincide, se rechaza (verified=false).
--
-- Correr en Supabase → SQL Editor.
-- ============================================================================

create table if not exists enredo_runs (
  id           uuid primary key default gen_random_uuid(),
  player_uuid  text not null,               -- ID anónimo del jugador (localStorage)
  alias        text,                         -- captura opcional (sin muro)
  mode         text not null default 'run',  -- 'run' | 'rush' | 'daily'
  seed         bigint not null,
  score        integer not null,
  duration_ms  integer not null,
  input_log    jsonb not null,               -- [{t, a, b, c}] frame+ángulo+boost+carta
  cards_picked text[] default '{}',
  verified     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists enredo_runs_mode_score_idx
  on enredo_runs (mode, score desc) where verified;
create index if not exists enredo_runs_player_idx on enredo_runs (player_uuid);
create index if not exists enredo_runs_daily_idx
  on enredo_runs (seed, score desc) where mode = 'daily' and verified;

-- RLS: nadie escribe directo con la anon key. Toda inserción pasa por la Edge
-- Function (service role) que re-simula y setea verified. Lectura pública solo de
-- lo verificado (leaderboard).
alter table enredo_runs enable row level security;

create policy "leaderboard lectura pública (verificados)"
  on enredo_runs for select
  using (verified = true);

-- (Sin policy de insert/update para anon/authenticated → solo service role escribe.)

-- Vista del top por modo (útil para el leaderboard del cliente).
create or replace view enredo_top as
  select mode, seed, player_uuid, alias, score, duration_ms, created_at
  from enredo_runs
  where verified = true
  order by score desc;

-- Reto diario: el mejor por jugador para la semilla del día (evita spam del mismo user).
-- select distinct on (player_uuid) player_uuid, alias, score
--   from enredo_runs where mode='daily' and seed = :seed_del_dia and verified
--   order by player_uuid, score desc;
