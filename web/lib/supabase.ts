import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase SOLO para el servidor (usa la service role key).
 * Nunca importes este módulo desde componentes cliente.
 *
 * El cerebro (lib/catalog.ts) usa Supabase automáticamente cuando estas dos
 * variables están definidas; si no, cae al archivo JSON local / /tmp.
 * Así, "preparar Supabase" es zero-touch: defines las env vars y persiste.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE;

/** ¿Está Supabase configurado? (URL + service role presentes) */
export const supabaseEnabled = (): boolean => Boolean(URL && SERVICE);

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!URL || !SERVICE) throw new Error("Supabase no configurado (faltan env vars).");
  if (!_client) {
    _client = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

/** El cerebro se guarda como un único documento jsonb (fila 'main'). */
export const CATALOG_TABLE = "pg_catalog";
export const CATALOG_ID = "main";
