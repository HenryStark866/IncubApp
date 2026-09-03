/**
 * =============================================================================
 * ARCHIVO: src/lib/browserNotify.js
 * PROPÓSITO: API de notificaciones del navegador (permiso y toast del sistema).
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Notificaciones del sistema (Web Notification API + permiso).
 */

/** Export «ensureNotifyPermission»: API pública de este módulo. Henry Stark Desarrollador */
export async function ensureNotifyPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const p = await Notification.requestPermission()
    return p
  } catch {
    return 'denied'
  }
}

/** Export «showBrowserNotification»: API pública de este módulo. Henry Stark Desarrollador */
export function showBrowserNotification({ title, body, tag, onClick } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(title || 'IncubApp', {
      body: body || '',
      tag: tag || `incubapp-${Date.now()}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
    if (onClick) {
      n.onclick = () => {
        window.focus()
        onClick()
        n.close()
      }
    }
  } catch {
    /* algunos navegadores bloquean sin gesture */
  }
}
