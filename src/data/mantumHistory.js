/**
 * Historial de OT de Mantum (~6,5 MB) bajo demanda.
 *
 * Antes venía pegado al catálogo Mantum y cualquier pantalla de mantenimiento lo
 * descargaba al abrir. Ahora vive en su propio archivo (vite.config.js →
 * «mantum-historial») y solo se baja cuando alguien necesita el historial.
 * Una vez cargado queda en memoria y el navegador lo conserva entre versiones.
 */

let cache = null
let pending = null

/** El historial si ya se cargó; si no, null (no dispara la descarga). */
export function mantumHistoryLoaded() {
  return cache
}

/** Descarga el historial una sola vez y lo devuelve ({ [codigoEquipo]: OT[] }). */
export function loadMantumHistory() {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = import('./mantumHistoricalOTs.json')
      .then((mod) => {
        cache = mod.default || mod
        return cache
      })
      .catch((err) => {
        pending = null
        throw err
      })
  }
  return pending
}
