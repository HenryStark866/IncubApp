/**
 * =============================================================================
 * ARCHIVO: src/lib/network.js
 * PROPÓSITO: Detección de errores de red / offline.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/** Detecta fallos de red para encolar en offline y reintentar al volver la señal. */
/** Export «isNetworkError»: API pública de este módulo. Henry Stark Desarrollador */
export function isNetworkError(msg) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const s = String(msg || '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|timeout|abort|ERR_INTERNET|offline|QUIC|connection|TypeError:\s*Failed|NetworkError|ECONN|ENOTFOUND|ETIMEDOUT|net::|ERR_NAME|ERR_CONNECTION|ERR_NETWORK|SocketError|The Internet connection appears to be offline|Load failed|A network error|network is unreachable|temporarily unavailable|503|502|504|Gateway/i.test(
    s
  )
}

/** Promesa con tope de tiempo (subidas móviles a veces cuelgan sin error). */
export function withTimeout(promise, ms = 20000, label = 'operación') {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${label} (${ms}ms)`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Export «isOnline»: API pública de este módulo. Henry Stark Desarrollador */
export function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Ejecuta fn; si hay error de red, llama onOffline y devuelve su resultado.
 * @template T
 */
export async function withOfflineFallback(fn, onOffline) {
  if (!isOnline()) return onOffline()
  try {
    return await fn()
  } catch (e) {
    if (isNetworkError(e?.message || e)) return onOffline(e)
    throw e
  }
}
