/**
 * Abrir «Mis actividades» (SupervisionPanel) directo en una sección desde otra
 * pantalla (el inicio del turno): se deja pedida la sección y el panel la toma
 * una sola vez al montarse.
 */
const KEY = 'incubapp:supervision-view'
export const SUPERVISION_VIEWS = ['ronda', 'cargue', 'transferencia', 'incidencias', 'ot', 'actividades', 'mercancia']

export function requestSupervisionView(view) {
  if (!SUPERVISION_VIEWS.includes(view)) return
  try {
    sessionStorage.setItem(KEY, view)
  } catch {
    /* sin almacenamiento: abre en la sección por defecto */
  }
}

export function takeRequestedSupervisionView() {
  try {
    const v = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return SUPERVISION_VIEWS.includes(v) ? v : null
  } catch {
    return null
  }
}
