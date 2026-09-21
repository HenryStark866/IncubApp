/**
 * =============================================================================
 * ARCHIVO: src/hooks/useBatches.js
 * PROPÓSITO: Hook «useBatches»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Lotes de aves en granja:
 *  recepción → levante (lote en galpones de levante)
 *  → grading → producción (traslado a módulo de producción).
 */
/** Export «useBatches»: API pública de este módulo. Henry Stark Desarrollador */
export function useBatches(orgId, userId) {
  const [batches, setBatches] = useState([])
  const [placements, setPlacements] = useState([])
  const [dailyLogs, setDailyLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [b, p, d] = await Promise.all([
      supabase
        .from('bird_batches')
        .select('id, org_id, farm_id, code, arrival_date, hens_received, roosters_received, arrival_age_weeks, estimated_levante_days, daily_feed_kg, status, notes, created_by, approved_by, approved_at, levante_started_at, production_started_at, avg_weight_g, grading_notes, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('batch_placements')
        .select('id, batch_id, room_id, stage, hens, roosters')
        .eq('org_id', orgId),
      supabase
        .from('farm_daily_logs')
        .select('id, batch_id, room_id, log_date, feed_kg, deaths, notes, recorded_by')
        .eq('org_id', orgId)
        .order('log_date', { ascending: false }),
    ])
    if (b.error) setError(b.error.message)
    else setBatches(b.data ?? [])
    if (!p.error) setPlacements(p.data ?? [])
    if (!d.error) setDailyLogs(d.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Recepción del lote (supervisor): datos base + distribución inicial en levante
  const createReception = useCallback(
    async ({ farmId, code, arrivalDate, hens, roosters, notes, distribution }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)
      const { data, error: err } = await supabase
        .from('bird_batches')
        .insert({
          org_id: orgId,
          farm_id: farmId,
          code: code.trim(),
          arrival_date: arrivalDate || undefined,
          hens_received: Number(hens) || 0,
          roosters_received: Number(roosters) || 0,
          notes: notes?.trim() || null,
          created_by: userId,
          status: 'received',
        })
        .select()
        .single()
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      const rows = (distribution ?? [])
        .filter((d) => d.roomId)
        .map((d) => ({
          org_id: orgId,
          batch_id: data.id,
          room_id: d.roomId,
          stage: 'levante',
          hens: Number(d.hens) || 0,
          roosters: Number(d.roosters) || 0,
        }))
      if (rows.length) {
        const { error: pe } = await supabase.from('batch_placements').insert(rows)
        if (pe) {
          setError(pe.message)
          return { error: pe.message }
        }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  // Aprobación e inicio de levante (coordinador de granja)
  const approveBatch = useCallback(
    async (batchId, { ageWeeks, levanteDays, feedKg }) => {
      setError(null)
      const num = (v) => (v === '' || v == null ? null : Number(v))
      const { error: err } = await supabase
        .from('bird_batches')
        .update({
          status: 'levante',
          arrival_age_weeks: num(ageWeeks),
          estimated_levante_days: num(levanteDays),
          daily_feed_kg: num(feedKg),
          approved_by: userId,
          approved_at: new Date().toISOString(),
          levante_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [userId, loadAll]
  )

  // Grading: pesaje + paso del lote a módulo de producción
  const startProduction = useCallback(
    async (batchId, { avgWeight, notes, placements: places }) => {
      setError(null)
      const num = (v) => (v === '' || v == null ? null : Number(v))
      const { error: err } = await supabase
        .from('bird_batches')
        .update({
          status: 'production',
          production_started_at: new Date().toISOString(),
          avg_weight_g: num(avgWeight),
          grading_notes: notes?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      const rows = (places ?? [])
        .filter((d) => d.roomId)
        .map((d) => ({
          org_id: orgId,
          batch_id: batchId,
          room_id: d.roomId,
          stage: 'production',
          hens: Number(d.hens) || 0,
          roosters: Number(d.roosters) || 0,
        }))
      if (rows.length) {
        const { error: pe } = await supabase.from('batch_placements').insert(rows)
        if (pe) {
          setError(pe.message)
          return { error: pe.message }
        }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, loadAll]
  )

  // Registro diario por galpón (consumo de comida y mortalidad). Upsert por lote+galpón+fecha.
  const saveDailyLog = useCallback(
    async ({ batchId, roomId, logDate, feedKg, deaths, notes }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)
      const { error: err } = await supabase.from('farm_daily_logs').upsert(
        {
          org_id: orgId,
          batch_id: batchId,
          room_id: roomId,
          log_date: logDate || undefined,
          feed_kg: feedKg === '' || feedKg == null ? null : Number(feedKg),
          deaths: deaths === '' || deaths == null ? 0 : Number(deaths),
          notes: notes?.trim() || null,
          recorded_by: userId,
        },
        { onConflict: 'batch_id,room_id,log_date' }
      )
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [orgId, userId, loadAll]
  )

  const updateBatch = useCallback(
    async (batchId, patch) => {
      setError(null)
      const { error: err } = await supabase
        .from('bird_batches')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', batchId)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [loadAll]
  )

  const deleteBatch = useCallback(
    async (batchId) => {
      setError(null)
      const { error: err } = await supabase.from('bird_batches').delete().eq('id', batchId)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadAll()
      return { error: null }
    },
    [loadAll]
  )

  return {
    batches,
    placements,
    dailyLogs,
    loading,
    error,
    reload: loadAll,
    createReception,
    approveBatch,
    startProduction,
    saveDailyLog,
    updateBatch,
    deleteBatch,
  }
}
