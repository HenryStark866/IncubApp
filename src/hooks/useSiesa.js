/**
 * Hook de configuración y sincronización Siesa para contabilidad y dependencias.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadSiesaConfig,
  persistSiesaConfig,
  isSiesaReady,
  testSiesaConnection,
  listSiesaQueue,
  listSiesaLog,
  enqueueMany,
  clearSiesaQueue,
  runSiesaSync,
  buildQueueFromDomain,
  siesaQueueStats,
  SIESA_ACCOUNTING_DEPS,
  SIESA_MODES,
  SIESA_ENTITY_TYPES,
  SIESA_INTEGRATION_VERSION,
} from '../lib/siesa'

export function useSiesa(orgId) {
  const [config, setConfig] = useState(null)
  const [source, setSource] = useState('local')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [queue, setQueue] = useState([])
  const [log, setLog] = useState([])
  const [tick, setTick] = useState(0)

  const refreshLocal = useCallback(() => {
    if (!orgId) {
      setQueue([])
      setLog([])
      return
    }
    setQueue(listSiesaQueue(orgId))
    setLog(listSiesaLog(orgId))
    setTick((t) => t + 1)
  }, [orgId])

  const reload = useCallback(async () => {
    if (!orgId) {
      setConfig(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await loadSiesaConfig(orgId)
    setConfig(res.config)
    setSource(res.source)
    refreshLocal()
    setLoading(false)
  }, [orgId, refreshLocal])

  useEffect(() => {
    reload()
  }, [reload])

  const saveConfig = useCallback(
    async (partial) => {
      if (!orgId) return { error: 'Sin organización' }
      setBusy(true)
      setMessage(null)
      const res = await persistSiesaConfig(orgId, partial)
      setConfig(res.config)
      setSource(res.source)
      setBusy(false)
      if (res.error) {
        setMessage({ kind: 'error', text: res.error })
        return { error: res.error, config: res.config }
      }
      setMessage({
        kind: 'ok',
        text:
          res.source === 'supabase'
            ? 'Configuración Siesa guardada en la empresa.'
            : 'Configuración Siesa guardada en este dispositivo (tabla cloud opcional).',
      })
      return { error: null, config: res.config }
    },
    [orgId]
  )

  const testConnection = useCallback(async () => {
    if (!config) return { ok: false, error: 'Sin config' }
    setBusy(true)
    setMessage(null)
    const res = await testSiesaConnection(config)
    setBusy(false)
    setMessage(
      res.ok
        ? { kind: 'ok', text: res.message || 'Conexión OK' }
        : { kind: 'error', text: res.error || 'Fallo de conexión' }
    )
    return res
  }, [config])

  const enqueueDomain = useCallback(
    (domain) => {
      if (!orgId || !config) return { error: 'Sin config', count: 0 }
      const items = buildQueueFromDomain({ ...domain, config })
      enqueueMany(orgId, items)
      refreshLocal()
      return { error: null, count: items.length }
    },
    [orgId, config, refreshLocal]
  )

  const syncNow = useCallback(
    async (opts = {}) => {
      if (!orgId || !config) return { ok: false, error: 'Sin config' }
      if (!config.enabled) {
        const msg = 'Activa la integración Siesa en la configuración.'
        setMessage({ kind: 'error', text: msg })
        return { ok: false, error: msg }
      }
      setBusy(true)
      setMessage(null)
      const res = await runSiesaSync(orgId, config, opts)
      refreshLocal()
      setBusy(false)
      setMessage({
        kind: res.ok ? 'ok' : 'error',
        text: res.message || (res.ok ? 'Sincronización completa' : 'Error al sincronizar'),
      })
      return res
    },
    [orgId, config, refreshLocal]
  )

  const clearQueue = useCallback(
    (onlySynced = false) => {
      if (!orgId) return
      clearSiesaQueue(orgId, onlySynced)
      refreshLocal()
    },
    [orgId, refreshLocal]
  )

  const stats = useMemo(() => (orgId ? siesaQueueStats(orgId) : null), [orgId, tick])
  const ready = useMemo(() => isSiesaReady(config || {}), [config])

  return {
    config,
    source,
    loading,
    busy,
    message,
    setMessage,
    queue,
    log,
    stats,
    ready,
    version: SIESA_INTEGRATION_VERSION,
    deps: SIESA_ACCOUNTING_DEPS,
    modes: SIESA_MODES,
    entityTypes: SIESA_ENTITY_TYPES,
    reload,
    saveConfig,
    testConnection,
    enqueueDomain,
    syncNow,
    clearQueue,
    refreshLocal,
  }
}
