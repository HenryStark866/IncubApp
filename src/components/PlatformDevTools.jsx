/**
 * Herramientas de desarrollo de plataforma (CDH Maker).
 */

import { useEffect, useState } from 'react'
import { pendingCount } from '../lib/offlineQueue'
import { BRAND } from '../lib/brandIdentity'

export default function PlatformDevTools({ online, pendingOffline, onSync, activeTenantName }) {
  const [localPending, setLocalPending] = useState(pendingOffline ?? 0)

  useEffect(() => {
    pendingCount().then(setLocalPending).catch(() => {})
  }, [pendingOffline])

  return (
    <div className="card wide">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>Herramientas de desarrollo</h2>
      </div>
      <p className="hint">
        Utilidades del producto {BRAND.productName} para el equipo CDH Maker. No forman parte del menú
        del cliente.
      </p>

      <div className="landing-grid2" style={{ marginTop: 14 }}>
        <article className="landing-card">
          <h3>Red y cola offline</h3>
          <p>
            Estado: {online ? 'en línea' : 'sin red'} · pendientes: {localPending}
          </p>
          {typeof onSync === 'function' && (
            <button type="button" className="primary small" style={{ marginTop: 8 }} onClick={onSync}>
              Forzar sincronización
            </button>
          )}
        </article>
        <article className="landing-card">
          <h3>Tenant activo (dev)</h3>
          <p>
            {activeTenantName
              ? `Modo desarrollador en: ${activeTenantName}`
              : 'Ninguno — usa «Elegir compañía» para entrar a un cliente.'}
          </p>
        </article>
        <article className="landing-card">
          <h3>Identidad de assets</h3>
          <p>
            Producto: <code>/brand/</code> · Clientes: <code>/client-brands/</code>. Nunca mezclar en
            consola plataforma.
          </p>
        </article>
        <article className="landing-card">
          <h3>Stack</h3>
          <p>React + Vite + Supabase · multi-tenant por org_id · RLS · PWA offline.</p>
        </article>
      </div>
    </div>
  )
}
