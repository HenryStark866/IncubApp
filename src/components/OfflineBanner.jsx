/**
 * Banner global de estado offline / cola de sincronización.
 * La subida es automática al recuperar red; el botón es respaldo manual.
 * Henry Stark Desarrollador
 */
export default function OfflineBanner({
  online,
  pending = 0,
  syncing = false,
  lastSync = null,
  onSync,
}) {
  if (online && pending === 0 && !syncing) {
    // Breve confirmación si acaba de sincronizar
    if (lastSync?.synced > 0 && lastSync?.at) {
      const age = Date.now() - new Date(lastSync.at).getTime()
      if (age < 8000) {
        return (
          <div className="offline-banner sync" role="status">
            <strong>Sincronizado</strong>
            <span>
              Se subieron {lastSync.synced} operación(es) del móvil/offline a la nube.
              {lastSync.failed > 0 ? ` · ${lastSync.failed} con reintento…` : ''}
            </span>
          </div>
        )
      }
    }
    return null
  }

  if (!online) {
    return (
      <div className="offline-banner offline" role="status">
        <strong>Sin conexión</strong>
        <span>
          Siga trabajando: los registros se guardan en este dispositivo. Al volver la señal se
          suben <strong>en automático e inmediato</strong>.
          {pending > 0 ? ` · ${pending} pendiente(s) en cola` : ''}
        </span>
      </div>
    )
  }

  if (syncing || pending > 0) {
    return (
      <div className="offline-banner sync" role="status">
        <strong>{syncing ? 'Sincronizando ahora…' : 'Hay pendientes'}</strong>
        <span>
          {pending} operación(es) en cola · subida automática al detectar red
          {onSync && (
            <>
              {' · '}
              <button type="button" className="offline-banner-btn" onClick={onSync}>
                Forzar subida
              </button>
            </>
          )}
        </span>
      </div>
    )
  }

  return null
}
