/**
 * IDENTIDAD DE JUGADOR (obligatoria desde el día 1 · Prompt Maestro §10).
 *
 * El lanzamiento es "en misterio": la gente juega sin saber que es Papaghetti, y
 * DESPUÉS recibe descuentos según lo que logró. Eso es imposible retroactivamente
 * si no persistimos QUIÉN logró qué desde la primera partida.
 *
 * - UUID anónimo en localStorage, creado en la primera partida.
 * - Captura de contacto OPCIONAL y elegante (alias/email), sin muro, con consentimiento.
 * - Este ID es el que canjea el descuento en la revelación.
 *
 * Módulo cliente puro (sin React, sin sim). Degrada sin romper si no hay localStorage.
 */

const UUID_KEY = "enredo:player";
const ALIAS_KEY = "enredo:alias";
const EMAIL_KEY = "enredo:email";
const CONSENT_KEY = "enredo:consent";

export interface PlayerIdentity {
  id: string;
  alias?: string;
  email?: string;
  consent: boolean;
}

function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value);
  } catch {
    /* modo incógnito / storage lleno: no rompemos el juego */
  }
}

function newUuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fallback abajo */
  }
  // Fallback razonable (no criptográfico) para navegadores viejos.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Devuelve el ID del jugador, creándolo la primera vez. */
export function getPlayerId(): string {
  let id = safeGet(UUID_KEY);
  if (!id) {
    id = newUuid();
    safeSet(UUID_KEY, id);
  }
  return id;
}

export function getIdentity(): PlayerIdentity {
  return {
    id: getPlayerId(),
    alias: safeGet(ALIAS_KEY) ?? undefined,
    email: safeGet(EMAIL_KEY) ?? undefined,
    consent: safeGet(CONSENT_KEY) === "1",
  };
}

/** Guarda la captura opcional de contacto (con consentimiento explícito). */
export function saveContact(input: { alias?: string; email?: string; consent: boolean }): PlayerIdentity {
  if (input.alias !== undefined) safeSet(ALIAS_KEY, input.alias.trim().slice(0, 24));
  if (input.email !== undefined) safeSet(EMAIL_KEY, input.email.trim().slice(0, 120));
  safeSet(CONSENT_KEY, input.consent ? "1" : "0");
  return getIdentity();
}
