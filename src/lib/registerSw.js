/**
 * Registro del Service Worker para shell offline.
 * Henry Stark Desarrollador
 */

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  // Recarga automática al detectar cambio de controlador (actualización del SW)
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Si hay SW esperando, actívalo
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch(() => {
        /* registro opcional en dev */
      })
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
}

/** Precarga assets clave en el SW (tras primer paint). */
export function warmOfflineCache(urls = []) {
  if (!navigator.serviceWorker?.controller) return
  const list = [
    '/',
    '/index.html',
    '/fondo.jpg',
    '/incubant-logo-full.png',
    '/manifest.webmanifest',
    ...urls,
  ]
  navigator.serviceWorker.controller.postMessage({
    type: 'CACHE_URLS',
    urls: list,
  })
}
