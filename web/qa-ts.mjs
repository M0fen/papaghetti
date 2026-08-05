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
