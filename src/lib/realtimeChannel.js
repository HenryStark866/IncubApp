/**
 * =============================================================================
 * ARCHIVO: src/lib/realtimeChannel.js
 * PROPÓSITO: Nombres de canal Realtime únicos por instancia de hook.
 * CÓMO FUNCIONA: supabase-js reutiliza el canal cuando dos hooks piden el MISMO
 * topic; el segundo `.on('postgres_changes'…)` llega con el canal ya suscrito y
 * revienta con «cannot add postgres_changes callbacks … after subscribe()»
 * (pasó con incu-lots al montar dos veces useIncubationLots). Para canales de
 * postgres_changes el nombre es local y arbitrario, así que un sufijo único por
 * suscripción elimina la colisión de raíz — también ante dobles montajes de
 * React (StrictMode / remontajes rápidos).
 * OJO: NO usar en canales de presencia o broadcast (useOrgPresence, chat):
 * esos topics deben ser idénticos entre clientes para compartir estado.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

let seq = 0

/** Nombre de canal único para suscripciones postgres_changes. */
export function uniqueChannel(base) {
  seq = (seq + 1) % Number.MAX_SAFE_INTEGER
  return `${base}#${seq.toString(36)}`
}
