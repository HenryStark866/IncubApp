/**
 * Sincronización offline → nube: inmediata al detectar conexión.
 * Henry Stark Desarrollador
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { flushQueue, pendingCount, enqueueCheck } from '../lib/offlineQueue'
import { hasAnyReading, readingsPayload } from '../lib/machineReadings'

function notifySyncDone(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent('incubapp:sync-done', { detail }))
  } catch {
    /* */
  }
}

/** Prueba real de red (navigator.onLine a veces miente en móvil). */
async function probeOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${window.location.origin}/manifest.webmanifest`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    })
    clearTimeout(t)
    return res.ok || res.status === 304 || res.type === 'opaque'
  } catch {
    // Segundo intento: recurso de la app (no confiar en getSession — funciona offline)
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3500)
      const res = await fetch(`${window.location.origin}/?_ping=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: ctrl.signal,
      })
      clearTimeout(t)
      return !!res
    } catch {
      return false
    }
  }
}

/**
 * Vacía la cola IndexedDB hacia Supabase apenas hay red.
 */
export function useOfflineSync() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const flushTimer = useRef(null)
  const syncingRef = useRef(false)
  const pendingRef = useRef(0)
  const syncRef = useRef(async () => {})

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  const refreshCount = useCallback(async () => {
    try {
      const n = await pendingCount()
      setPending(n)
      pendingRef.current = n
      return n
    } catch {
      return 0
    }
  }, [])

  const sync = useCallback(async (reason = 'manual') => {
    if (syncingRef.current) return lastSync
    const ok = await probeOnline()
    if (!ok) {
      setOnline(false)
      return { synced: 0, failed: 0, offline: 'offline' }
    }
    setOnline(true)
    syncingRef.current = true
    setSyncing(true)

    try {
      const result = await flushQueue({
        uploadCheck: async (meta, file) => {
          // condition=off puede ir sin foto; el resto exige bytes o storagePath
          const isOff = (meta.condition || 'normal') === 'off'
          let path = meta.storagePath || null

          if (file && file.size > 0) {
            const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
            path =
              meta.storagePath ||
              `${meta.orgId}/${meta.machineId}/${meta.shiftDate}/T${meta.shiftNumber}-H${String(meta.hourSlot).padStart(2, '0')}-${Date.now()}.${ext}`
            const blob =
              file instanceof File
                ? file
                : new File([file], `photo.${ext}`, { type: file.type || 'image/jpeg' })
            const { error: upErr } = await supabase.storage
              .from('machine-checks')
              .upload(path, blob, {
                contentType: blob.type || 'image/jpeg',
                upsert: false,
                cacheControl: '3600',
              })
            if (upErr && !/already exists|Duplicate|409/i.test(upErr.message || '')) {
              return { error: upErr.message }
            }
          } else if (!isOff && !path) {
            return { error: 'Cola sin foto: no se puede subir el check' }
          }

          const condition = meta.condition || 'normal'
          const row = {
            org_id: meta.orgId,
            plant_id: meta.plantId || null,
            machine_id: meta.machineId,
            taken_by: meta.userId,
            shift_date: meta.shiftDate,
            shift_number: meta.shiftNumber,
            hour_slot: meta.hourSlot,
            condition,
            notes: meta.notes || null,
            photo_path: path,
            ...readingsPayload(meta.readings),
          }
          // Evitar duplicado exacto del mismo slot (misma máquina/hora/día)
          if (meta.machineId && meta.shiftDate != null && meta.hourSlot != null) {
            const { data: existing } = await supabase
              .from('machine_checks')
              .select('id, photo_path, condition, notes, taken_by')
              .eq('org_id', meta.orgId)
              .eq('machine_id', meta.machineId)
              .eq('shift_date', meta.shiftDate)
              .eq('hour_slot', meta.hourSlot)
              .limit(1)
            if (existing?.length) {
              const prev = existing[0]
              const prevIsOff = (prev.condition || 'normal') === 'off'
              const incomingIsOff = condition === 'off'
              // Un reporte real (con foto o condición ≠ apagada) SIEMPRE gana sobre "apagada"
              // y debe actualizar estado + foto en el instante del sync.
              if (!incomingIsOff || (path && !prev.photo_path)) {
                const patch = {}
                if (path && (!prev.photo_path || !incomingIsOff)) patch.photo_path = path
                if (!incomingIsOff) {
                  patch.condition = condition
                  if (meta.notes != null) patch.notes = meta.notes
                  if (meta.userId) patch.taken_by = meta.userId
                  if (hasAnyReading(meta.readings)) {
                    Object.assign(patch, readingsPayload(meta.readings))
                  }
                  // Si venía como off y ahora es real, anotar
                  if (prevIsOff && !meta.notes) {
                    patch.notes = meta.notes || 'Sincronizado desde ronda offline'
                  }
                } else if (prevIsOff && path && !prev.photo_path) {
                  patch.photo_path = path
                }
                // No degradar un reporte real a "apagada"
                if (incomingIsOff && !prevIsOff) {
                  return { error: null }
                }
                if (Object.keys(patch).length) {
                  const { error: upErr } = await supabase
                    .from('machine_checks')
                    .update(patch)
                    .eq('id', prev.id)
                  if (upErr) return { error: upErr.message }
                }
                return { error: null }
              }
              // Incoming off y prev ya es off (o peor): no tocar
              return { error: null }
            }
          }
          const { error: insErr } = await supabase.from('machine_checks').insert(row)
          if (insErr && (insErr.code === '23505' || /duplicate/i.test(insErr.message || ''))) {
            // Carrera: reintentar como update del existente
            const { data: raced } = await supabase
              .from('machine_checks')
              .select('id, photo_path, condition')
              .eq('org_id', meta.orgId)
              .eq('machine_id', meta.machineId)
              .eq('shift_date', meta.shiftDate)
              .eq('hour_slot', meta.hourSlot)
              .limit(1)
            if (raced?.length && condition !== 'off') {
              await supabase
                .from('machine_checks')
                .update({
                  condition,
                  notes: meta.notes || null,
                  photo_path: path || raced[0].photo_path,
                  taken_by: meta.userId || undefined,
                  ...(hasAnyReading(meta.readings) ? readingsPayload(meta.readings) : {}),
                })
                .eq('id', raced[0].id)
            }
            return { error: null }
          }
          return insErr ? { error: insErr.message } : { error: null }
        },

        completeActivity: async (meta, file) => {
          let photoPath = null
          if (file) {
            const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
            const path = `${meta.orgId}/activities/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
            const { error: upErr } = await supabase.storage
              .from('machine-checks')
              .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
            if (upErr && !/already exists/i.test(upErr.message || '')) {
              return { error: upErr.message }
            }
            if (!upErr) photoPath = path
          }
          const patch = {
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion: meta.completion || 'complete',
            result_qty: meta.resultQty == null ? null : Number(meta.resultQty),
            result_note: meta.resultNote?.trim() || null,
            updated_at: new Date().toISOString(),
          }
          if (meta.roomId) patch.room_id = meta.roomId
          if (meta.machineId) patch.machine_id = meta.machineId
          if (photoPath) patch.photo_path = photoPath
          const { error } = await supabase
            .from('shift_activities')
            .update(patch)
            .eq('id', meta.activityId)
          return error ? { error: error.message } : { error: null }
        },

        runMutation: async (type, payload, file) => {
          try {
            if (type === 'storage_upload') {
              if (!file) return { error: 'Sin archivo para storage_upload' }
              const { error } = await supabase.storage
                .from(payload.bucket || 'machine-checks')
                .upload(payload.path, file, {
                  contentType: payload.contentType || file.type || 'application/octet-stream',
                  upsert: !!payload.upsert,
                })
              if (error && !/already exists|Duplicate|409/i.test(error.message || '')) {
                return { error: error.message }
              }
              return { error: null }
            }
            if (type === 'db_insert') {
              // Limpiar campos solo locales
              const row = { ...(payload.row || {}) }
              delete row._local
              delete row._fallback
              if (String(row.id || '').startsWith('local_')) delete row.id
              const { error } = await supabase.from(payload.table).insert(row)
              if (error?.code === '23505' || /duplicate/i.test(error?.message || '')) {
                return { error: null }
              }
              return error ? { error: error.message } : { error: null }
            }
            if (type === 'db_update') {
              const idField = payload.idField || 'id'
              const row = { ...(payload.row || {}) }
              delete row._local
              const { error } = await supabase
                .from(payload.table)
                .update(row)
                .eq(idField, payload.id)
              return error ? { error: error.message } : { error: null }
            }
            if (type === 'db_upsert') {
              const row = { ...(payload.row || {}) }
              delete row._local
              const opts = payload.onConflict
                ? { onConflict: payload.onConflict }
                : undefined
              const { error } = await supabase.from(payload.table).upsert(row, opts)
              return error ? { error: error.message } : { error: null }
            }
            return { error: `Tipo de mutación desconocido: ${type}` }
          } catch (e) {
            return { error: e.message || String(e) }
          }
        },
      })

      const detail = { ...result, at: new Date().toISOString(), reason }
      setLastSync(detail)
      await refreshCount()

      // Recargar reportes cuando se subió algo (estado + foto deben verse al instante)
      if (result.synced > 0) {
        notifySyncDone(detail)
      }

      // Reintento rápido si falló algo y hay red
      if (result.failed > 0) {
        if (flushTimer.current) clearTimeout(flushTimer.current)
        flushTimer.current = setTimeout(() => {
          syncingRef.current = false
          setSyncing(false)
          syncRef.current('retry')
        }, 2500)
      }

      return detail
    } catch (e) {
      const detail = { error: e.message, at: new Date().toISOString(), reason }
      setLastSync(detail)
      return detail
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refreshCount()
    }
  }, [refreshCount, lastSync])

  useEffect(() => {
    syncRef.current = sync
  }, [sync])

  /** Encola sync: delay 0 = inmediato al recuperar red */
  const scheduleSync = useCallback((delayMs = 0, reason = 'scheduled') => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    if (delayMs <= 0) {
      syncRef.current(reason)
      return
    }
    flushTimer.current = setTimeout(() => syncRef.current(reason), delayMs)
  }, [])

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      // Inmediato: la idea es subir en cuanto hay señal
      scheduleSync(0, 'online-event')
      // Segundo intento por si la red aún estabiliza (móviles)
      scheduleSync(1200, 'online-stabilize')
    }
    const goOffline = () => setOnline(false)

    const onQueueChanged = () => {
      refreshCount().then((n) => {
        if (n > 0 && navigator.onLine) scheduleSync(0, 'queue-changed')
      })
    }

    const onVisible = () => {
      if (!document.hidden) {
        refreshCount().then((n) => {
          if (n > 0) scheduleSync(0, 'visible')
        })
      }
    }

    const onFocus = () => {
      refreshCount().then((n) => {
        if (n > 0 && navigator.onLine) scheduleSync(0, 'focus')
      })
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('incubapp:queue-changed', onQueueChanged)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    refreshCount().then((n) => {
      if (n > 0 || navigator.onLine) scheduleSync(300, 'boot')
    })

    // Poll: si hay pendientes, intentar cada 8s + probe de red cada 5s
    const retry = setInterval(() => {
      if (pendingRef.current > 0) {
        probeOnline().then((ok) => {
          setOnline(ok)
          if (ok) syncRef.current('interval')
        })
      }
    }, 8000)

    const netPoll = setInterval(() => {
      const nav = typeof navigator !== 'undefined' ? navigator.onLine : true
      setOnline((prev) => {
        if (!prev && nav) {
          // Acaba de recuperarse según el navegador
          scheduleSync(0, 'nav-online-poll')
        }
        return nav
      })
    }, 3000)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('incubapp:queue-changed', onQueueChanged)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      if (flushTimer.current) clearTimeout(flushTimer.current)
      clearInterval(retry)
      clearInterval(netPoll)
    }
  }, [refreshCount, scheduleSync])

  const saveCheckOffline = useCallback(
    async (meta, file) => {
      try {
        await enqueueCheck(meta, file)
        await refreshCount()
        if (navigator.onLine) scheduleSync(0, 'after-enqueue')
        return { error: null, offline: true }
      } catch (e) {
        return { error: e.message, offline: true }
      }
    },
    [refreshCount, scheduleSync]
  )

  return {
    online,
    pending,
    syncing,
    lastSync,
    sync: () => sync('manual'),
    saveCheckOffline,
    refreshCount,
  }
}
