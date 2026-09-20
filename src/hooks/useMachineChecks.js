/**
 * =============================================================================
 * ARCHIVO: src/hooks/useMachineChecks.js
 * PROPÓSITO: Hook «useMachineChecks»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uniqueChannel } from '../lib/realtimeChannel'
import { enqueueCheck, pendingCheckMetas } from '../lib/offlineQueue'
import { isNetworkError, isOnline, withTimeout } from '../lib/network'
import { cacheRead, cacheWrite } from '../lib/offlineCache'
import { compressImage } from '../lib/image'
import { READING_COLUMNS, readingsPayload } from '../lib/machineReadings'

/**
 * Rondas de supervisión: registro horario por máquina con foto de la interfaz.
 *
 * Turnos (hora de Colombia):
 *   T1: 06:00–13:59 · T2: 14:00–21:59 · T3: 22:00–05:59
 *
 * Trazabilidad de las fotos en Storage (bucket privado machine-checks):
 *   org_id/machine_id/shift_date/T{turno}-H{hora}-{timestamp}.jpg
 */

/** Map de etiquetas de turno. Henry Stark Desarrollador */
export const SHIFT_LABEL = { 1: 'Turno 1 (06:00-14:00)', 2: 'Turno 2 (14:00-22:00)', 3: 'Turno 3 (22:00-06:00)' }

/** Export «shiftOfHour»: API pública de este módulo. Henry Stark Desarrollador */
export const shiftOfHour = (h) => (h >= 6 && h < 14 ? 1 : h >= 14 && h < 22 ? 2 : 3)

/** Export «currentSlot»: API pública de este módulo. Henry Stark Desarrollador */
export const currentSlot = () => {
  const now = new Date()
  const hour = now.getHours()
  const shift = shiftOfHour(hour)
  // El turno 3 (22–06) pertenece a la fecha en que inicia
  const date = new Date(now)
  if (shift === 3 && hour < 6) date.setDate(date.getDate() - 1)
  const shiftDate = date.toLocaleDateString('sv-SE') // YYYY-MM-DD
  return { hour, shift, shiftDate }
}

/** Export «useMachineChecks»: API pública de este módulo. Henry Stark Desarrollador */
export function useMachineChecks(orgId, userId, { canSupervise }) {
  const [checks, setChecks] = useState([])
  const [queued, setQueued] = useState([]) // checks guardados localmente, pendientes de subir
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  /* ── Pendientes offline como registros "virtuales" para que la ronda no se reinicie ── */
  const loadQueued = useCallback(async () => {
    if (!orgId) return
    try {
      const metas = await pendingCheckMetas()
      setQueued(
        metas
          .filter((m) => m.orgId === orgId)
          .map((m) => ({
            id: `offline-${m.queuedAt}-${m.machineId}`,
            machine_id: m.machineId,
            plant_id: m.plantId,
            taken_by: m.userId,
            taken_at: new Date(m.queuedAt || Date.now()).toISOString(),
            shift_date: m.shiftDate,
            shift_number: m.shiftNumber,
            hour_slot: m.hourSlot,
            condition: m.condition || 'normal',
            notes: m.notes || null,
            photo_path: m.storagePath || null,
            ...readingsPayload(m.readings),
            offline: true,
            has_local_photo: !!m.hasPhoto,
            local_photo_bytes: m.fileSize || 0,
          }))
      )
    } catch { /* IndexedDB no disponible */ }
  }, [orgId])

  const loadChecks = useCallback(async (filters = {}) => {
    if (!orgId) return
    setLoading(true)
    let q = supabase
      .from('machine_checks')
      .select(
        'id, machine_id, plant_id, taken_by, taken_at, shift_date, shift_number, hour_slot, ' +
          `condition, notes, photo_path, ${READING_COLUMNS.join(', ')}`
      )
      .eq('org_id', orgId)
      .order('taken_at', { ascending: false })
      .limit(400)
    if (filters.machineId) q = q.eq('machine_id', filters.machineId)
    if (filters.shiftDate) q = q.eq('shift_date', filters.shiftDate)
    if (filters.shiftNumber) q = q.eq('shift_number', filters.shiftNumber)
    const { data, error: err } = await q
    if (err) {
      if (isNetworkError(err.message) || !isOnline()) {
        const hit = cacheRead(orgId, 'machine_checks')
        if (hit?.data) {
          setChecks(hit.data)
          setError(null)
        } else setError(err.message)
      } else setError(err.message)
    } else {
      setChecks(data ?? [])
      cacheWrite(orgId, 'machine_checks', data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadChecks()
    loadQueued()
    const onSync = () => {
      loadChecks()
      loadQueued()
    }
    window.addEventListener('incubapp:sync-done', onSync)
    window.addEventListener('online', onSync)
    const channel = supabase
      .channel(uniqueChannel(`checks:${orgId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machine_checks', filter: `org_id=eq.${orgId}` },
        () => loadChecks()
      )
      .subscribe()
    // Al recuperar señal, recargar (el Realtime no reenvía lo que pasó sin conexión)
    const onOnline = () => loadChecks()
    // La cola offline cambió (nuevo pendiente o se sincronizó algo)
    const onQueueChanged = () => loadQueued()
    window.addEventListener('online', onOnline)
    window.addEventListener('incubapp:queue-changed', onQueueChanged)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('incubapp:queue-changed', onQueueChanged)
      window.removeEventListener('incubapp:sync-done', onSync)
    }
  }, [orgId, loadChecks, loadQueued])

  /* ── Lista combinada: servidor + pendientes offline (sin duplicar) ── */
  const allChecks = useMemo(() => {
    if (queued.length === 0) return checks
    const onServer = new Set(checks.map((c) => `${c.machine_id}|${c.shift_date}|${c.hour_slot}`))
    const extra = queued.filter((q) => !onServer.has(`${q.machine_id}|${q.shift_date}|${q.hour_slot}`))
    return extra.length ? [...extra, ...checks] : checks
  }, [checks, queued])

  /* ── Guardar en la cola local (foto en IndexedDB) + disparar sync si hay red ── */
  const queueOffline = useCallback(async (meta, file) => {
    try {
      if (file && (!(file instanceof Blob) || file.size === 0)) {
        const msg = 'La foto no se capturó bien (archivo vacío). Vuelve a tomar la foto.'
        setError(msg)
        return { error: msg }
      }
      await enqueueCheck(meta, file)
      await loadQueued()
      // Intento inmediato de subida si el navegador cree que hay red
      try {
        window.dispatchEvent(new Event('incubapp:queue-changed'))
      } catch { /* */ }
      return { error: null, offline: true }
    } catch (e) {
      const msg = e?.message || String(e)
      setError(msg)
      return { error: msg }
    }
  }, [loadQueued])

  /**
   * Registra una parada de ronda: foto obligatoria.
   * Offline-first: si no hay red (o la subida cuelga/falla por red),
   * guarda Blob en IndexedDB y sincroniza al recuperar señal.
   */
  const createCheck = useCallback(
    async ({ plantId, machineId, file, condition, notes, readings }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!file) return { error: 'La foto de la interfaz es obligatoria' }
      setError(null)

      // Normalizar foto (re-comprimir si llega sin comprimir o sin tipo)
      let photo = file
      try {
        if (!(photo instanceof Blob) || photo.size === 0) {
          return { error: 'La foto no se capturó bien. Vuelve a tomar la foto.' }
        }
        if (!photo.type || !photo.type.startsWith('image/')) {
          photo = new File([photo], photo.name || 'photo.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
        }
        // Asegurar tamaño razonable en móvil (si ya venía comprimida, es no-op)
        if (photo.size > 900_000) {
          photo = await compressImage(photo, 1280, 0.7)
        }
      } catch {
        /* usar original */
      }

      if (!photo || photo.size === 0) {
        return { error: 'La foto quedó vacía tras procesar. Vuelve a tomar la foto.' }
      }

      const { hour, shift, shiftDate } = currentSlot()
      const ext = (photo.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${orgId}/${machineId}/${shiftDate}/T${shift}-H${String(hour).padStart(2, '0')}-${Date.now()}.${ext}`
      const meta = {
        orgId,
        plantId,
        machineId,
        userId,
        shiftDate,
        shiftNumber: shift,
        hourSlot: hour,
        condition: condition || 'normal',
        notes: notes?.trim() || null,
        readings: readingsPayload(readings),
      }

      // 1) Offline real → guardar YA (no colgar esperando Storage)
      if (!isOnline()) {
        return queueOffline(meta, photo)
      }

      // 2) Intento online con timeout (móviles a menudo cuelgan sin error)
      try {
        const uploadResult = await withTimeout(
          supabase.storage
            .from('machine-checks')
            .upload(path, photo, {
              contentType: photo.type || 'image/jpeg',
              upsert: false,
              cacheControl: '3600',
            }),
          22000,
          'subida foto'
        )
        const upErr = uploadResult?.error
        if (upErr) {
          if (isNetworkError(upErr.message)) return queueOffline(meta, photo)
          // Ya existe en storage (reintento): seguir al insert
          if (!/already exists|Duplicate|409/i.test(upErr.message || '')) {
            // Otros errores de storage: aún así intentar guardar local para no perder la ronda
            if (/JWT|auth|permission|policy|RLS|403|401/i.test(upErr.message || '')) {
              setError(upErr.message)
              return { error: upErr.message }
            }
            // Fallo ambiguo → cola local (mejor perder nada que la foto)
            return queueOffline(meta, photo)
          }
        }

        const insertResult = await withTimeout(
          supabase.from('machine_checks').insert({
            org_id: orgId,
            plant_id: plantId,
            machine_id: machineId,
            taken_by: userId,
            shift_date: shiftDate,
            shift_number: shift,
            hour_slot: hour,
            condition: condition || 'normal',
            notes: notes?.trim() || null,
            photo_path: path,
            ...readingsPayload(readings),
          }),
          15000,
          'registro check'
        )
        const insErr = insertResult?.error
        if (insErr) {
          if (isNetworkError(insErr.message)) {
            // Foto ya en Storage: encolar solo el insert (sin re-subir)
            return queueOffline({ ...meta, storagePath: path }, null)
          }
          if (insErr.code === '23505' || /duplicate/i.test(insErr.message || '')) {
            // Si ya existe (p. ej. quedó como "off" por cierre de ronda), actualizar con la foto y estado real
            try {
              const { data: existing } = await supabase
                .from('machine_checks')
                .select('id, condition, photo_path')
                .eq('org_id', orgId)
                .eq('machine_id', machineId)
                .eq('shift_date', shiftDate)
                .eq('hour_slot', hour)
                .limit(1)
              if (existing?.length) {
                const prev = existing[0]
                if ((prev.condition || 'normal') === 'off' || !prev.photo_path) {
                  await supabase
                    .from('machine_checks')
                    .update({
                      condition: condition || 'normal',
                      notes: notes?.trim() || null,
                      photo_path: path,
                      taken_by: userId,
                      ...readingsPayload(readings),
                    })
                    .eq('id', prev.id)
                  await loadChecks()
                  return { error: null, offline: false }
                }
              }
            } catch {
              /* */
            }
            const msg =
              'Esta máquina ya tiene registro en esta hora. La siguiente toma es en la próxima hora.'
            setError(msg)
            return { error: msg }
          }
          // Registro falló por otra razón: no borrar storage si es red intermitente
          if (isNetworkError(insErr.message)) {
            return queueOffline({ ...meta, storagePath: path }, null)
          }
          try {
            await supabase.storage.from('machine-checks').remove([path])
          } catch { /* */ }
          setError(insErr.message)
          return { error: insErr.message }
        }
        await loadChecks()
        return { error: null, offline: false }
      } catch (e) {
        const msg = e?.message || String(e)
        // Timeout o red → cola local con la foto intacta
        if (isNetworkError(msg) || /timeout/i.test(msg)) {
          return queueOffline(meta, photo)
        }
        // Cualquier throw inesperado en móvil: no perder la foto
        return queueOffline(meta, photo)
      }
    },
    [orgId, userId, queueOffline, loadChecks]
  )

  /**
   * Termina la ronda: registra como "apagadas" las máquinas de la planta
   * que no fueron reportadas en la hora actual (sin foto).
   */
  const closeRound = useCallback(
    async (plantId, machineIds) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!machineIds || machineIds.length === 0) return { error: null }
      setError(null)
      const { hour, shift, shiftDate } = currentSlot()

      // No marcar como apagada una máquina que ya tiene reporte (servidor o cola offline)
      let skipIds = new Set()
      try {
        const metas = await pendingCheckMetas()
        for (const m of metas) {
          if (
            m.orgId === orgId &&
            m.shiftDate === shiftDate &&
            Number(m.hourSlot) === Number(hour) &&
            (m.condition || 'normal') !== 'off'
          ) {
            skipIds.add(m.machineId)
          }
        }
      } catch {
        /* */
      }
      const filteredIds = machineIds.filter((id) => !skipIds.has(id))
      if (filteredIds.length === 0) return { error: null }

      const rows = filteredIds.map((machineId) => ({
        org_id: orgId,
        plant_id: plantId,
        machine_id: machineId,
        taken_by: userId,
        shift_date: shiftDate,
        shift_number: shift,
        hour_slot: hour,
        condition: 'off',
        notes: 'Apagada — no reportada al terminar la ronda',
        photo_path: null,
      }))

      // Offline: encolar sin foto (condition=off no exige imagen)
      if (!isOnline()) {
        try {
          for (const r of rows) {
            await enqueueCheck(
              {
                orgId,
                plantId,
                machineId: r.machine_id,
                userId,
                shiftDate: r.shift_date,
                shiftNumber: r.shift_number,
                hourSlot: r.hour_slot,
                condition: 'off',
                notes: r.notes,
              },
              null
            )
          }
          await loadQueued()
          try {
            window.dispatchEvent(new Event('incubapp:queue-changed'))
          } catch {
            /* */
          }
          return { error: null, offline: true }
        } catch (e) {
          setError(e.message)
          return { error: e.message }
        }
      }

      try {
        const { error: err } = await withTimeout(
          supabase.from('machine_checks').insert(rows),
          15000,
          'cierre ronda'
        )
        if (err) {
          if (isNetworkError(err.message) || err.code === '23505') {
            // Duplicados parciales o red: encolar uno a uno
            try {
              for (const r of rows) {
                await enqueueCheck(
                  {
                    orgId,
                    plantId,
                    machineId: r.machine_id,
                    userId,
                    shiftDate: r.shift_date,
                    shiftNumber: r.shift_number,
                    hourSlot: r.hour_slot,
                    condition: 'off',
                    notes: r.notes,
                  },
                  null
                )
              }
              await loadQueued()
              return { error: null, offline: true }
            } catch (e) {
              setError(e.message)
              return { error: e.message }
            }
          }
          setError(err.message)
          return { error: err.message }
        }
        return { error: null }
      } catch (e) {
        const msg = e?.message || String(e)
        if (isNetworkError(msg) || /timeout/i.test(msg)) {
          try {
            for (const r of rows) {
              await enqueueCheck(
                {
                  orgId,
                  plantId,
                  machineId: r.machine_id,
                  userId,
                  shiftDate: r.shift_date,
                  shiftNumber: r.shift_number,
                  hourSlot: r.hour_slot,
                  condition: 'off',
                  notes: r.notes,
                },
                null
              )
            }
            await loadQueued()
            return { error: null, offline: true }
          } catch (e2) {
            setError(e2.message)
            return { error: e2.message }
          }
        }
        setError(msg)
        return { error: msg }
      }
    },
    [orgId, userId, loadQueued]
  )

  /** URL firmada (1 hora) para ver una foto del bucket privado. */
  const getPhotoUrl = useCallback(async (path) => {
    const { data, error: err } = await supabase.storage
      .from('machine-checks')
      .createSignedUrl(path, 3600)
    if (err) return null
    return data?.signedUrl ?? null
  }, [])

  const deleteCheck = useCallback(async (check) => {
    const { error: err } = await supabase.from('machine_checks').delete().eq('id', check.id)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    await supabase.storage.from('machine-checks').remove([check.photo_path])
    return { error: null }
  }, [])

  return { checks: allChecks, loading, error, loadChecks, createCheck, closeRound, getPhotoUrl, deleteCheck, canSupervise }
}
