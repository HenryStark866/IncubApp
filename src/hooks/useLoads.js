/**
 * =============================================================================
 * ARCHIVO: src/hooks/useLoads.js
 * PROPÓSITO: Hook «useLoads»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uniqueChannel } from '../lib/realtimeChannel'

// Sube la foto de la pantalla al bucket privado machine-checks (ruta bajo el org_id).
async function uploadPhoto(orgId, folder, key, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${orgId}/${folder}/${key}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('machine-checks')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  return { path, error }
}

/**
 * Cargues de incubadora (setter_loads) y transferencias a nacedora (transfers).
 *  - Lectura + Realtime por organización.
 *  - createLoad: registra un cargue (fecha/hora auto, operario = usuario actual).
 *  - createTransfer: registra la transferencia de un cargue a una nacedora
 *    (trae los datos del cargue; el operario solo aporta nacedora y diferencia de peso).
 */
/** Export «useLoads»: API pública de este módulo. Henry Stark Desarrollador */
export function useLoads(orgId, userId) {
  const [loads, setLoads] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [l, t] = await Promise.all([
      supabase
        .from('setter_loads')
        .select('id, plant_id, machine_id, batch_id, lote, loaded_at, cycle_start_at, tape_color, tape_color_name, created_by, created_at')
        .eq('org_id', orgId)
        .order('loaded_at', { ascending: false })
        .limit(400),
      supabase
        .from('transfers')
        .select('id, plant_id, batch_id, lote, mode, room_ids, weight_diff, cycle_start_at, transferred_at, created_by, created_at, photo_path')
        .eq('org_id', orgId)
        .order('transferred_at', { ascending: false })
        .limit(400),
    ])
    if (l.error) setError(l.error.message)
    else setLoads(l.data ?? [])
    if (t.error) setError(t.error.message)
    else setTransfers(t.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadAll()
    const channel = supabase
      .channel(uniqueChannel(`loads:${orgId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'setter_loads', filter: `org_id=eq.${orgId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers', filter: `org_id=eq.${orgId}` }, () => loadAll())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, loadAll])

  const createLoad = useCallback(
    async ({ plantId, machineId, lote, cycleStartAt, file }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!plantId || !machineId) return { error: 'Selecciona la incubadora' }
      if (!lote?.trim()) return { error: 'El lote es obligatorio' }
      if (!file) return { error: 'La foto de la pantalla es obligatoria' }
      setError(null)

      const { path, error: upErr } = await uploadPhoto(orgId, 'loads', machineId, file)
      if (upErr) {
        setError(upErr.message)
        return { error: upErr.message }
      }

      const { error: err } = await supabase.from('setter_loads').insert({
        org_id: orgId,
        plant_id: plantId,
        machine_id: machineId,
        lote: lote.trim(),
        // loaded_at lo pone la BD (now) automáticamente
        cycle_start_at: cycleStartAt || null,
        photo_path: path,
        created_by: userId,
      })
      if (err) {
        await supabase.storage.from('machine-checks').remove([path]) // no dejar foto huérfana
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  // Mapa de cargue (coordinador de planta): planea el cargue desde el cuarto frío.
  // Sin foto (planeación de escritorio); enlaza el lote de aves de origen.
  const createPlannedLoad = useCallback(
    async ({ plantId, machineId, batchId, lote, loadedAt, cycleStartAt, tapeColor, tapeColorName }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!plantId || !machineId) return { error: 'Selecciona la incubadora' }
      if (!lote?.trim()) return { error: 'El lote es obligatorio' }
      setError(null)
      const { error: err } = await supabase.from('setter_loads').insert({
        org_id: orgId,
        plant_id: plantId,
        machine_id: machineId,
        batch_id: batchId || null,
        lote: lote.trim(),
        loaded_at: loadedAt || undefined, // si no se indica, la BD pone now()
        cycle_start_at: cycleStartAt || null,
        tape_color: tapeColor || null,
        tape_color_name: tapeColorName || null,
        created_by: userId,
      })
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  // Transferencia por salón: mueve un lote a 1 (sencilla) o 2 (doble) salas de
  // nacedoras completas. El origen es el LOTE (agregado de cargues), no una máquina.
  const createTransfer = useCallback(
    async ({ plantId, batchId, lote, mode, roomIds, weightDiff, cycleStartAt, file }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!plantId) return { error: 'Falta la planta' }
      if (!lote?.trim()) return { error: 'Selecciona el lote a transferir' }
      const rooms = (roomIds ?? []).filter(Boolean)
      const expected = mode === 'double' ? 2 : 1
      if (rooms.length !== expected) {
        return { error: `Selecciona ${expected} sala${expected > 1 ? 's' : ''} de nacedoras (${mode === 'double' ? 'doble' : 'sencilla'})` }
      }
      if (!file) return { error: 'La foto de la pantalla es obligatoria' }
      setError(null)

      const { path, error: upErr } = await uploadPhoto(orgId, 'transfers', batchId || 'lote', file)
      if (upErr) {
        setError(upErr.message)
        return { error: upErr.message }
      }

      // Antes/al transferir: OT de calibración de nacedoras destino (si aún no hay abierta)
      try {
        const { generateHatcherCalibrationOrders } = await import('./useMachineCalibration')
        const { CALIB_REASON } = await import('../lib/machineCalibration')
        await generateHatcherCalibrationOrders({
          orgId,
          userId,
          roomIds: rooms,
          reason: CALIB_REASON.pre_transfer,
          extra: `Pre-transferencia lote ${lote.trim()}`,
        })
      } catch {
        /* no bloquear transferencia si falla la OT */
      }

      const { error: err } = await supabase.from('transfers').insert({
        org_id: orgId,
        plant_id: plantId,
        batch_id: batchId || null,
        lote: lote.trim(),
        mode: mode === 'double' ? 'double' : 'single',
        room_ids: rooms,
        weight_diff: weightDiff === '' || weightDiff == null ? null : Number(weightDiff),
        cycle_start_at: cycleStartAt || null,
        // transferred_at lo pone la BD (now) automáticamente
        photo_path: path,
        created_by: userId,
      })
      if (err) {
        await supabase.storage.from('machine-checks').remove([path])
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  const getPhotoUrl = useCallback(async (path) => {
    if (!path) return null
    const { data, error: err } = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600)
    if (err) return null
    return data?.signedUrl ?? null
  }, [])

  return { loads, transfers, loading, error, createLoad, createPlannedLoad, createTransfer, getPhotoUrl, reload: loadAll }
}
