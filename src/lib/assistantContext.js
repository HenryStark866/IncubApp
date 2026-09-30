/**
 * Lo que el asistente de voz sabe del turno del usuario en este momento.
 * Cada inicio (operario, supervisor, auxiliar de mantenimiento) publica aquí un
 * resumen de lo que muestra en pantalla; el asistente lo lee al responder.
 * Solo vive en memoria del navegador: no se guarda ni sale del teléfono salvo en
 * la pregunta que el propio usuario hace.
 */
let current = {}
const listeners = new Set()

export function setAssistantContext(ctx = {}) {
  current = { ...ctx, actualizado: new Date().toISOString() }
  for (const fn of listeners) fn(current)
}

export function getAssistantContext() {
  return current
}

export function subscribeAssistantContext(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
