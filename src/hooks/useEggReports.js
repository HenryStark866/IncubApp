/**
 * =============================================================================
 * ARCHIVO: src/hooks/useEggReports.js
 * PROPÓSITO: Hook «useEggReports»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { enqueueUpsert } from '../lib/offlineQueue'
import { isNetworkError } from '../lib/network'
import { compressImage } from '../lib/image'

/**
 * Reporte diario de huevos por galpón (operario galponero).
 *  - categories: tipificación configurable por empresa (incubable, comercial, …)
 *  - reports: reportes por lote/galpón/fecha, con cantidades por categoría (JSONB)
 *  - saveReport: upsert por (lote, galpón, fecha) — reportar o corregir el día
 * El backend protege quién reporta/verifica vía RLS.
 */
/** Export «useEggReports»: API pública de este módulo. Henry Stark Desarrollador */
export function useEggReports(orgId, userId) {
  const [categories, setCategories] = useState([])
  const [reports, setReports] = useState([])
  const [arrivals, setArrivals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [c, r, a] = await Promise.all([
      supabase
        .from('egg_categories')
        .select('id, code, name, kind, sort_order, active')
        .eq('org_id', orgId)
        .eq('active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('egg_reports')
        .select('id, farm_id, batch_id, room_id, report_date, counts, status, notes, reported_by, verified_by, verified_at, received_by, received_at, received_counts, created_at')
        .eq('org_id', orgId)
        .order('report_date', { ascending: false }),
      supabase
        .from('egg_plant_arrivals')
        .select(
          'id, seal_number, photo_path, notes, vehicle_plate, farm_hint, arrived_at, reported_by, created_at'
        )
        .eq('org_id', orgId)
        .order('arrived_at', { ascending: false })
        .limit(100),
    ])
    if (c.error) setError(c.error.message)
    else setCategories(c.data ?? [])
    if (!r.error) setReports(r.data ?? [])
    if (!a.error) setArrivals(a.data ?? [])
    else setArrivals([])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Upsert por (lote, galpón, fecha): registra o corrige el reporte del día
  const saveReport = useCallback(
    async ({ farmId, batchId, roomId, reportDate, counts, notes }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)
      const clean = {}
      for (const [k, v] of Object.entries(counts ?? {})) {
        clean[k] = v === '' || v == null ? 0 : Number(v)
      }
      const row = {
        org_id: orgId,
        farm_id: farmId,
        batch_id: batchId,
        room_id: roomId,
        report_date: reportDate || undefined,
        counts: clean,
        notes: notes?.trim() || null,
        reported_by: userId,
        updated_at: new Date().toISOString(),
      }
      const { error: err } = await supabase
        .from('egg_reports')
        .upsert(row, { onConflict: 'batch_id,room_id,report_date' })
      if (err) {
        if (isNetworkError(err.message)) {
          await enqueueUpsert('egg_reports', row, 'batch_id,room_id,report_date')
          return { error: null, offline: true }
        }
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  // Verificación (supervisor / coordinador de granja): reported -> verified
  const verifyReport = useCallback(
    async (reportId) => {
      setError(null)
      const { error: err } = await supabase
        .from('egg_reports')
        .update({ status: 'verified', verified_by: userId, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', reportId)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [userId, loadAll]
  )

  // Certificación (operario de recepción): verified -> received, con conteo recibido
  const certifyReport = useCallback(
    async (reportId, receivedCounts) => {
      setError(null)
      const clean = {}
      for (const [k, v] of Object.entries(receivedCounts ?? {})) clean[k] = v === '' || v == null ? 0 : Number(v)
      const { error: err } = await supabase
        .from('egg_reports')
        .update({
          status: 'received',
          received_by: userId,
          received_at: new Date().toISOString(),
          received_counts: clean,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reportId)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [userId, loadAll]
  )

  const deleteReport = useCallback(
    async (reportId) => {
      setError(null)
      const { error: err } = await supabase.from('egg_reports').delete().eq('id', reportId)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [loadAll]
  )

  /**
   * Reporte de llegada de huevo a planta: foto + número de sello.
   */
  const reportPlantArrival = useCallback(
    async ({ sealNumber, file, notes, vehiclePlate, farmHint }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      const seal = String(sealNumber || '').trim()
      if (!seal) return { error: 'Indique el número del sello' }
      if (!file) return { error: 'La foto del sello / llegada es obligatoria' }
      setError(null)

      let photo = file
      try {
        if (photo.size > 900_000) photo = await compressImage(photo, 1280, 0.7)
      } catch {
        /* usar original */
      }

      const ext =
        (photo.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${orgId}/egg-arrivals/${Date.now()}-${seal.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('machine-checks')
        .upload(path, photo, {
          contentType: photo.type || 'image/jpeg',
          upsert: false,
        })
      if (upErr) {
        setError(upErr.message)
        return { error: upErr.message }
      }

      const row = {
        org_id: orgId,
        seal_number: seal,
        photo_path: path,
        notes: notes?.trim() || null,
        vehicle_plate: vehiclePlate?.trim() || null,
        farm_hint: farmHint?.trim() || null,
        reported_by: userId,
        arrived_at: new Date().toISOString(),
      }

      const { data, error: err } = await supabase
        .from('egg_plant_arrivals')
        .insert(row)
        .select('id, seal_number, arrived_at')
        .single()

      if (err) {
        try {
          await supabase.storage.from('machine-checks').remove([path])
        } catch {
          /* */
        }
        if (/does not exist|schema cache|relation|PGRST/i.test(err.message || '')) {
          const msg =
            'Falta la tabla egg_plant_arrivals en Supabase. Ejecute supabase_migration_egg_plant_arrival.sql'
          setError(msg)
          return { error: msg }
        }
        setError(err.message)
        return { error: err.message }
      }

      await loadAll()
      return { error: null, id: data?.id, seal: data?.seal_number }
    },
    [orgId, userId, loadAll]
  )

  const getArrivalPhotoUrl = useCallback(async (path) => {
    if (!path) return null
    const { data, error: err } = await supabase.storage
      .from('machine-checks')
      .createSignedUrl(path, 3600)
    if (err) return null
    return data?.signedUrl ?? null
  }, [])

  return {
    categories,
    reports,
    arrivals,
    loading,
    error,
    reload: loadAll,
    saveReport,
    verifyReport,
    certifyReport,
    deleteReport,
    reportPlantArrival,
    getArrivalPhotoUrl,
  }
}
