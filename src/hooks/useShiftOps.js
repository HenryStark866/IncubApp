/**
 * =============================================================================
 * ARCHIVO: src/hooks/useShiftOps.js
 * PROPÓSITO: Hook «useShiftOps»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { enqueueActivity } from '../lib/offlineQueue'
import { isNetworkError } from '../lib/network'

// Sube una foto al bucket privado machine-checks bajo el prefijo del org.
async function uploadPhoto(orgId, folder, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${orgId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await supabase.storage
    .from('machine-checks')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  return { path, error }
}

/**
 * Operaciones del turno del operario de planta:
 *  - shift_activities: actividades asignadas por el supervisor/coordinador que
 *    el operario ejecuta (inicio/fin con tiempo, cantidad, completa/parcial, foto).
 *  - merchandise_receipts: reporte de mercancía recibida (foto + ubicación/sala).
 */
/** Export «useShiftOps»: API pública de este módulo. Henry Stark Desarrollador */
export function useShiftOps(orgId, userId) {
  const [activities, setActivities] = useState([])
  const [merchandise, setMerchandise] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [a, m, c] = await Promise.all([
      supabase
        .from('shift_activities')
        .select('id, plant_id, room_id, machine_id, title, description, assigned_to, assigned_by, status, started_at, completed_at, completion, result_qty, result_note, photo_path, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('merchandise_receipts')
        .select('id, plant_id, room_id, description, photo_path, received_by, received_at')
        .eq('org_id', orgId)
        .order('received_at', { ascending: false }),
      supabase
        .from('shift_activity_catalog')
        .select('id, name, description, active, grants_module')
        .eq('org_id', orgId)
        .eq('active', true)
        .order('name', { ascending: true }),
    ])
    if (a.error) setError(a.error.message)
    else setActivities(a.data ?? [])
    if (!m.error) setMerchandise(m.data ?? [])
    if (!c.error) setCatalog(c.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Supervisor/coordinador asigna una actividad a un operario
  const createActivity = useCallback(
    async ({ plantId, roomId, machineId, title, description, assignedTo, grantsModule }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)
      const { error: err } = await supabase.from('shift_activities').insert({
        org_id: orgId,
        plant_id: plantId || null,
        room_id: roomId || null,
        machine_id: machineId || null,
        title: title.trim(),
        description: description?.trim() || null,
        assigned_to: assignedTo || null,
        assigned_by: userId,
        grants_module: grantsModule || null,
        status: 'pending',
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

  const startActivity = useCallback(
    async (id) => {
      setError(null)
      const { error: err } = await supabase
        .from('shift_activities')
        .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [loadAll]
  )

  // Cierre de la actividad: completa/parcial, cantidad, sala/máquina y foto de evidencia
  const completeActivity = useCallback(
    async (id, { completion, resultQty, resultNote, roomId, machineId, file }) => {
      setError(null)
      const meta = {
        orgId,
        activityId: id,
        completion: completion || 'complete',
        resultQty: resultQty === '' || resultQty == null ? null : Number(resultQty),
        resultNote: resultNote?.trim() || null,
        roomId: roomId || null,
        machineId: machineId || null,
      }
      let photoPath
      if (file) {
        const { path, error: upErr } = await uploadPhoto(orgId, 'activities', file)
        if (upErr) {
          if (isNetworkError(upErr.message)) {
            try {
              await enqueueActivity(meta, file)
              return { error: null, offline: true }
            } catch (e) {
              setError(e.message)
              return { error: e.message }
            }
          }
          setError(upErr.message)
          return { error: upErr.message }
        }
        photoPath = path
      }
      const patch = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion: completion || 'complete',
        result_qty: resultQty === '' || resultQty == null ? null : Number(resultQty),
        result_note: resultNote?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (roomId) patch.room_id = roomId
      if (machineId) patch.machine_id = machineId
      if (photoPath) patch.photo_path = photoPath
      const { error: err } = await supabase.from('shift_activities').update(patch).eq('id', id)
      if (err) {
        if (isNetworkError(err.message)) {
          try {
            await enqueueActivity(meta, file || null)
            return { error: null, offline: true }
          } catch (e) {
            setError(e.message)
            return { error: e.message }
          }
        }
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, loadAll]
  )

  const deleteActivity = useCallback(
    async (id) => {
      setError(null)
      const { error: err } = await supabase.from('shift_activities').delete().eq('id', id)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [loadAll]
  )

  // Reporte de mercancía recibida: foto obligatoria + ubicación (sala)
  const saveMerchandise = useCallback(
    async ({ plantId, roomId, description, file }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!file) return { error: 'La foto es obligatoria' }
      setError(null)
      const { path, error: upErr } = await uploadPhoto(orgId, 'merchandise', file)
      if (upErr) {
        setError(upErr.message)
        return { error: upErr.message }
      }
      const { error: err } = await supabase.from('merchandise_receipts').insert({
        org_id: orgId,
        plant_id: plantId || null,
        room_id: roomId || null,
        description: description?.trim() || null,
        photo_path: path,
        received_by: userId,
      })
      if (err) {
        await supabase.storage.from('machine-checks').remove([path])
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  // Catálogo de actividades (gestión: owner/admin/coordinador/supervisor)
  const addCatalogItem = useCallback(
    async ({ name, description, grantsModule }) => {
      if (!orgId) return { error: 'Sin organización' }
      setError(null)
      const { error: err } = await supabase.from('shift_activity_catalog').insert({
        org_id: orgId,
        name: name.trim(),
        description: description?.trim() || null,
        grants_module: grantsModule || null,
      })
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, loadAll]
  )

  const removeCatalogItem = useCallback(
    async (id) => {
      setError(null)
      const { error: err } = await supabase.from('shift_activity_catalog').update({ active: false }).eq('id', id)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [loadAll]
  )

  const getPhotoUrl = useCallback(async (path) => {
    if (!path) return null
    const { data, error: err } = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600)
    if (err) return null
    return data?.signedUrl ?? null
  }, [])

  return {
    activities,
    merchandise,
    catalog,
    loading,
    error,
    reload: loadAll,
    createActivity,
    startActivity,
    completeActivity,
    deleteActivity,
    saveMerchandise,
    addCatalogItem,
    removeCatalogItem,
    getPhotoUrl,
  }
}
