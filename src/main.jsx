/**
 * Arranque IncubApp — registra SW para offline (ya no se desregistra).
 * Henry Stark Desarrollador
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
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
        // Si el SW no es el nuestro de /sw.js, quitarlo
        const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || ''
        if (url && !url.endsWith('/sw.js') && !url.includes('/sw.js')) {
          await r.unregister()
        }
      }
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      for (const k of keys) {
        // borrar shells antiguos
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

const el = document.getElementById('root')
if (!el) {
  document.body.textContent = 'Falta #root en index.html'
} else {
  el.innerHTML = ''
  try {
    createRoot(el).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
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
