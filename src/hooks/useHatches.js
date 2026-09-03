/**
 * =============================================================================
 * ARCHIVO: src/hooks/useHatches.js
 * PROPÓSITO: Hook «useHatches»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Sube la foto de la pantalla al bucket privado machine-checks (carpeta hatches/).
async function uploadPhoto(orgId, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${orgId}/hatches/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await supabase.storage
    .from('machine-checks')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  return { path, error }
}

/**
 * Nacimientos (hatch_events) — jornada del día 21.
 *  - El supervisor inicia el nacimiento a partir de una transferencia: el modo
 *    (sencilla/doble), las salas de nacedoras, el lote y el estimado llegan
 *    automáticamente. Registra la dotación (sexaje / vacunadoras / adicionales)
 *    y arranca el cronómetro (started_at).
 *  - Al cerrar la jornada se registran los pollitos reales que salieron.
 *  - Lectura + Realtime por organización.
 */
/** Export «useHatches»: API pública de este módulo. Henry Stark Desarrollador */
export function useHatches(orgId, userId) {
  const [hatches, setHatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('hatch_events')
      .select(
        'id, plant_id, transfer_id, batch_id, lote, mode, room_ids, incubable_eggs, estimated_chicks, sexing_ops, vaccination_ops, extra_ops, actual_chicks, females_count, males_count, notes, status, scheduled_at, started_at, ended_at, started_by, closed_by, photo_path, created_at'
      )
      .eq('org_id', orgId)
      .order('started_at', { ascending: false })
      .limit(400)
    if (err) setError(err.message)
    else setHatches(data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadAll()
    const channel = supabase
      .channel(`hatches:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hatch_events', filter: `org_id=eq.${orgId}` }, () => loadAll())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, loadAll])

  const toInt = (v) => (v === '' || v == null ? null : Number(v))

  // Programar el nacimiento (status 'planned') a una hora; auto-detecta modo/salas/lote.
  const scheduleHatch = useCallback(
    async ({ transfer, scheduledAt, incubableEggs, estimatedChicks }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!transfer) return { error: 'Selecciona la transferencia' }
      if (!scheduledAt) return { error: 'Indica la fecha y hora del nacimiento' }
      setError(null)
      const { error: err } = await supabase.from('hatch_events').insert({
        org_id: orgId,
        plant_id: transfer.plant_id,
        transfer_id: transfer.id,
        batch_id: transfer.batch_id || null,
        lote: transfer.lote,
        mode: transfer.mode === 'double' ? 'double' : 'single',
        room_ids: transfer.room_ids ?? [],
        incubable_eggs: toInt(incubableEggs),
        estimated_chicks: toInt(estimatedChicks),
        status: 'planned',
        scheduled_at: scheduledAt,
      })
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  // Iniciar un nacimiento que estaba PROGRAMADO (planned → in_progress) con la dotación.
  const beginPlanned = useCallback(
    async (id, { sexingOps, vaccinationOps, extraOps, file }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)
      let photoPath
      if (file) {
        const { path, error: upErr } = await uploadPhoto(orgId, file)
        if (upErr) { setError(upErr.message); return { error: upErr.message } }
        photoPath = path
      }
      const patch = {
        status: 'in_progress',
        started_at: new Date().toISOString(),
        sexing_ops: toInt(sexingOps),
        vaccination_ops: toInt(vaccinationOps),
        extra_ops: toInt(extraOps),
      }
      if (photoPath) patch.photo_path = photoPath
      const { error: err } = await supabase.from('hatch_events').update(patch).eq('id', id)
      if (err) { setError(err.message); return { error: err.message } }
      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  const cancelHatch = useCallback(
    async (id) => {
      setError(null)
      const { error: err } = await supabase.from('hatch_events').delete().eq('id', id)
      if (err) { setError(err.message); return { error: err.message } }
      await loadAll()
      return { error: null }
    },
    [loadAll]
  )

  // Iniciar nacimiento desde una transferencia (auto-detecta modo/salas/lote).
  const startHatch = useCallback(
    async ({ transfer, incubableEggs, estimatedChicks, sexingOps, vaccinationOps, extraOps, file }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!transfer) return { error: 'Selecciona la transferencia de origen' }
      setError(null)

      let photoPath = null
      if (file) {
        const { path, error: upErr } = await uploadPhoto(orgId, file)
        if (upErr) {
          setError(upErr.message)
          return { error: upErr.message }
        }
        photoPath = path
      }

      const toInt = (v) => (v === '' || v == null ? null : Number(v))
      const { error: err } = await supabase.from('hatch_events').insert({
        org_id: orgId,
        plant_id: transfer.plant_id,
        transfer_id: transfer.id,
        batch_id: transfer.batch_id || null,
        lote: transfer.lote,
        mode: transfer.mode === 'double' ? 'double' : 'single',
        room_ids: transfer.room_ids ?? [],
        incubable_eggs: toInt(incubableEggs),
        estimated_chicks: toInt(estimatedChicks),
        sexing_ops: toInt(sexingOps),
        vaccination_ops: toInt(vaccinationOps),
        extra_ops: toInt(extraOps),
        status: 'in_progress',
        // started_at, started_by los pone la BD (now / auth.uid())
        photo_path: photoPath,
      })
      if (err) {
        if (photoPath) await supabase.storage.from('machine-checks').remove([photoPath])
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  // Cerrar la jornada con los pollitos reales por sexo (hembras/machos para la venta).
  const closeHatch = useCallback(
    async (id, { femalesCount, malesCount, notes, file }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)

      let photoPath
      if (file) {
        const { path, error: upErr } = await uploadPhoto(orgId, file)
        if (upErr) {
          setError(upErr.message)
          return { error: upErr.message }
        }
        photoPath = path
      }

      const f = toInt(femalesCount)
      const m = toInt(malesCount)
      const total = f == null && m == null ? null : (f ?? 0) + (m ?? 0) // total pollitos = hembras + machos
      const patch = {
        status: 'completed',
        ended_at: new Date().toISOString(),
        closed_by: userId,
        females_count: f,
        males_count: m,
        actual_chicks: total,
        notes: notes?.trim() || null,
      }
      if (photoPath) patch.photo_path = photoPath

      // Necesitamos room_ids del nacimiento para generar OT de calibración de nacedoras
      const { data: hatchRow } = await supabase
        .from('hatch_events')
        .select('room_ids, lote')
        .eq('id', id)
        .maybeSingle()

      const { error: err } = await supabase.from('hatch_events').update(patch).eq('id', id)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }

      // Después de cada nacimiento: OT de calibración de las nacedoras del salón
      try {
        const rooms = hatchRow?.room_ids || []
        if (rooms.length) {
          const { generateHatcherCalibrationOrders } = await import('./useMachineCalibration')
          const { CALIB_REASON } = await import('../lib/machineCalibration')
          await generateHatcherCalibrationOrders({
            orgId,
            userId,
            roomIds: rooms,
            reason: CALIB_REASON.post_hatch,
            extra: `Post-nacimiento lote ${hatchRow?.lote || '—'}`,
          })
        }
      } catch {
        /* no bloquear cierre */
      }

      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  const getPhotoUrl = useCallback(async (path) => {
    if (!path) return null
    const { data, error: err } = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600)
    if (err) return null
    return data?.signedUrl ?? null
  }, [])

  return { hatches, loading, error, scheduleHatch, beginPlanned, cancelHatch, startHatch, closeHatch, getPhotoUrl, reload: loadAll }
}
