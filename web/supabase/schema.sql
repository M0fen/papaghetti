-- ============================================================================
-- Papaghetti · Esquema Supabase (Fase 2/3 — persistencia real)
-- ----------------------------------------------------------------------------
-- El "cerebro" (lib/catalog.ts) se persiste como UN documento jsonb en la fila
-- id = 'main'. Activación zero-touch: en cuanto defines NEXT_PUBLIC_SUPABASE_URL
-- y SUPABASE_SERVICE_ROLE, el código empieza a leer/escribir aquí en vez del
-- archivo local. No hace falta tocar más código.
--
-- Cómo correrlo: Supabase → tu proyecto → SQL Editor → pega esto → Run.
-- ============================================================================

create table if not exists pg_catalog (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- El servidor usa la SERVICE ROLE key (bypassa RLS). Activamos RLS y NO creamos
-- políticas públicas → nadie con la anon key puede leer/escribir el cerebro.
alter table pg_catalog enable row level security;

-- ----------------------------------------------------------------------------
-- (Opcional · Fase 4) Usuarios y roles del panel: mesero / cajero / admin.
-- Descomenta cuando quieras multi-usuario con Supabase Auth.
-- ----------------------------------------------------------------------------
-- do $$ begin
--   create type pg_rol as enum ('admin', 'cajero', 'mesero');
-- exception when duplicate_object then null; end $$;
--
-- create table if not exists pg_usuarios (
--   id        uuid primary key references auth.users(id) on delete cascade,
--   nombre    text,
--   rol       pg_rol not null default 'mesero',
--   creado_en timestamptz default now()
-- );
-- alter table pg_usuarios enable row level security;
-- create policy "usuario ve su fila" on pg_usuarios
--   for select using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Reset (si alguna vez quieres borrar el cerebro y que se resiembre solo):
--   delete from pg_catalog where id = 'main';
-- ----------------------------------------------------------------------------
