/**
 * =============================================================================
 * ARCHIVO: src/hooks/useFlockLots.js
 * PROPÓSITO: CRUD + Realtime de flock_lots (edad de parvada por código de lote),
 *   usado por el mapa de cargue para estimar fertilidad sin volver a preguntarla
 *   cada vez que un lote entra a clasificación.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uniqueChannel } from '../lib/realtimeChannel'
import { buildFlockRegistry, normalizeLotCode } from '../lib/flockLots'

function missingTable(msg) {
  return /does not exist|schema cache|Could not find|relation|PGRST205|column/i.test(
    String(msg || '')
  )
}

export function useFlockLots(orgId, userId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('flock_lots')
      .select('id, lot_code, age_weeks_at, reference_date, status, notes, updated_at')
      .eq('org_id', orgId)
      .order('lot_code', { ascending: true })
    if (err) {
      setError(missingTable(err.message) ? null : err.message)
      setRows([])
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }, [orgId])

  const loadAllRef = useRef(loadAll)
  useEffect(() => {
    loadAllRef.current = loadAll
  }, [loadAll])

  useEffect(() => {
    if (!orgId) return
    loadAll()
  }, [orgId, loadAll])

  useEffect(() => {
    if (!orgId) return
    const ch = supabase
      .channel(uniqueChannel(`flock-lots:${orgId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flock_lots', filter: `org_id=eq.${orgId}` },
        () => loadAllRef.current()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId])

  /**
   * Crea o actualiza la edad de un lote: age_weeks_at = valor dado,
   * reference_date = hoy (snapshot nuevo desde el cual se sigue sumando).
   */
  const upsertAge = useCallback(
    async ({ lotCode, ageWeeks, status = 'active', notes }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      const code = normalizeLotCode(lotCode)
      if (!code) return { error: 'Código de lote requerido' }
      const row = {
        org_id: orgId,
        lot_code: code,
        age_weeks_at: status === 'retired' ? null : Math.max(0, Number(ageWeeks) || 0),
        reference_date: new Date().toLocaleDateString('sv-SE'),
        status,
        notes: notes?.trim() || null,
        updated_by: userId,
      }
      const { data, error: err } = await supabase
        .from('flock_lots')
        .upsert(row, { onConflict: 'org_id,lot_code' })
        .select()
        .single()
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      setRows((list) => {
        const rest = list.filter((r) => normalizeLotCode(r.lot_code) !== code)
        return [...rest, data].sort((a, b) => a.lot_code.localeCompare(b.lot_code, 'es'))
      })
      return { error: null, row: data }
    },
    [orgId, userId]
  )

  const retireLot = useCallback(
    (lotCode) => upsertAge({ lotCode, ageWeeks: null, status: 'retired' }),
    [upsertAge]
  )

  const registry = useMemo(() => buildFlockRegistry(rows), [rows])

  return { rows, registry, loading, error, reload: loadAll, upsertAge, retireLot }
}
