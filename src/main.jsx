/**
 * Arranque IncubApp — registra SW para offline (ya no se desregistra).
 * AppRoot monta directamente el workspace; la autenticación se resuelve en App.
 * Henry Stark Desarrollador · CDH Maker
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './incubant-theme.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initTheme } from './lib/theme'
import { registerServiceWorker, warmOfflineCache } from './lib/registerSw'

// Limpiar SOLO service workers / caches viejos de versiones rotas (v1–v3),
// no el shell offline actual.
async function migrateOldCaches() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) {
        const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || ''
        if (url && !url.endsWith('/sw.js') && !url.includes('/sw.js')) {
          await r.unregister()
        }
      }
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      for (const k of keys) {
        if (/incubapp-shell-v[1234]$/i.test(k) || /incubant/i.test(k)) {
          await caches.delete(k)
        }
      }
    }
  } catch {
    /* */
  }
}

try {
  initTheme()
} catch {
  /* */
}

// Tras publicar una versión nueva, una pestaña que ya estaba abierta pide los
// módulos con el nombre viejo, que el servidor ya no tiene, y el panel no abre.
// Con red se recarga una vez (máximo una por minuto) para tomar la versión nueva.
window.addEventListener('vite:preloadError', (event) => {
  if (navigator.onLine === false) return
  const KEY = 'incubapp:reload-por-version'
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* sin sessionStorage: recargar igual */
  }
  event.preventDefault()
  window.location.reload()
})

/**
 * AppRoot — puerta de entrada directa al workspace autenticado.
 */
function AppRoot() {
  return <App />
}

const el = document.getElementById('root')
if (!el) {
  document.body.textContent = 'Falta #root en index.html'
} else {
  el.innerHTML = ''
  try {
    createRoot(el).render(
      <StrictMode>
        <ErrorBoundary>
          <AppRoot />
        </ErrorBoundary>
      </StrictMode>
    )
  } catch (err) {
    el.innerHTML = `<div style="font-family:system-ui;padding:24px;max-width:480px;margin:40px auto">
      <h1>Error al iniciar</h1>
      <p>${String(err?.message || err)}</p>
      <a href="/reparar.html">Reparar caché</a>
    </div>`
  }

  // Offline: migrar basura vieja y registrar SW v5
  migrateOldCaches().finally(() => {
    registerServiceWorker()
    setTimeout(() => warmOfflineCache(), 2500)
  })
}
