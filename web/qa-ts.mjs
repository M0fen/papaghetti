/**
 * Resolvedor mínimo para correr los módulos del dominio (TypeScript) con node a secas.
 *
 * Node 24 sabe quitar los tipos, pero exige extensión explícita en los imports; el
 * código de la app usa el estilo de TypeScript (`from "./menu"`). Este hook completa
 * la `.ts` y traduce el alias `@/`. Así las pruebas de dominio corren sin instalar
 * ningún runner ni bundler.
 *
 *   node --import ./qa-ts.mjs qa-dominio.mjs
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

/* LAS PRUEBAS NUNCA TOCAN PRODUCCIÓN. Con el token del almacén Y (VERCEL o PG_BLOB), o
   con la pareja de Supabase, el cerebro deja de ser data/catalog.json y pasa a ser el
   documento REAL del restaurante: una suite que pone el negocio en cero lo pondría en
   cero de verdad. Ojo: PG_BLOB=0 también lo enciende (cualquier valor cuenta). Si hace
   falta a propósito (un script de mantenimiento), PG_PERMITIR_PRODUCCION=1. */
{
  const e = process.env;
  const blob = Boolean(e.BLOB_READ_WRITE_TOKEN) && Boolean(e.VERCEL || e.PG_BLOB);
  const supabase = Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE);
  if ((blob || supabase || e.VERCEL) && e.PG_PERMITIR_PRODUCCION !== "1") {
    console.error(
      "✋ No se corren pruebas con el almacén de producción a la vista " +
        `(${[blob && "Vercel Blob", supabase && "Supabase", e.VERCEL && "VERCEL"].filter(Boolean).join(", ")}). ` +
        "Quita esas variables del entorno y vuelve a intentarlo.",
    );
    process.exit(1);
  }
}

registerHooks({
  resolve(especificador, contexto, siguiente) {
    // Las dependencias se resuelven solas (y varias son CommonJS, que no entiende
    // las URLs file:// que produce este hook). Solo tocamos NUESTRO código.
    if (contexto.parentURL?.includes("node_modules")) return siguiente(especificador, contexto);
    let spec = especificador;
    if (spec.startsWith("@/")) {
      spec = pathToFileURL(path.join(RAIZ, spec.slice(2))).href;
    }
    if ((spec.startsWith(".") || spec.startsWith("file:")) && !/\.[a-z]+$/i.test(spec)) {
      const base = spec.startsWith("file:")
        ? fileURLToPath(spec)
        : path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), spec);
      for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
        if (existsSync(base + ext)) return siguiente(pathToFileURL(base + ext).href, contexto);
      }
    }
    return siguiente(spec, contexto);
  },
});
