/**
 * =============================================================================
 * ARCHIVO: src/features/maintenance/hooks/useMaintenanceRecords.js
 * PROPÓSITO: Trae, una sola vez por sesión, todo lo que evidencia la ejecución
 *   del mantenimiento en el último año: OT y calibraciones de IncubApp, reportes
 *   de ronda y lo importado de Mántum. Lo usan el cumplimiento del Plan AM y los
 *   indicadores, así los dos cuentan exactamente lo mismo.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { normalizeRecords } from '../../../lib/planCompliance'
import mantumRecent from '../../../data/mantumRecentExecutions.json'

const CACHE_MS = 5 * 60 * 1000
const cache = new Map()

/** Un año atrás, al inicio del día: es la ventana que pidió Henry («este último año»). */
export function sinceOneYear(now = new Date()) {
  const d = new Date(now)
  d.setFullYear(d.getFullYear() - 1)
  d.setHours(0, 0, 0, 0)
  return d
}

async function rows(label, query) {
  try {
    const { data, error } = await query
    if (error) return { rows: [], failed: `${label}: ${error.message}` }
    return { rows: data || [], failed: null }
  } catch (e) {
    return { rows: [], failed: `${label}: ${e?.message || 'sin respuesta'}` }
  }
}

async function fetchAll(orgId) {
  const since = sinceOneYear().toISOString()
  const [wo, cal, rr, ma, ro, pl, me] = await Promise.all([
    // select('*'): no todas las columnas nuevas existen en producción (lección del 42703).
    rows('las órdenes de trabajo', supabase.from('work_orders').select('*').eq('org_id', orgId).gte('created_at', since).order('created_at', { ascending: false }).limit(5000)),
    rows('las calibraciones', supabase.from('machine_calibrations').select('id, machine_id, work_order_id, performed_by, scope, reason, notes, calibrated_at, created_at').eq('org_id', orgId).gte('calibrated_at', since).limit(5000)),
    rows('los reportes de ronda', supabase.from('round_reports').select('id, user_id, shift_date, shift_code, title, created_at').eq('org_id', orgId).gte('created_at', since).limit(5000)),
    rows('las máquinas', supabase.from('machines').select('id, plant_id, room_id, name, code, type, status')),
    rows('las salas', supabase.from('rooms').select('id, plant_id, name, code, type')),
    rows('las sedes', supabase.from('plants').select('id, name, code').eq('org_id', orgId)),
    rows('el personal', supabase.from('organization_members').select('user_id, role, profiles(full_name, email)').eq('org_id', orgId)),
  ])
  const people = {}
  for (const m of me.rows) people[m.user_id] = { name: m.profiles?.full_name || m.profiles?.email || 'Usuario', role: m.role }
  return {
    workOrders: wo.rows,
    calibrations: cal.rows,
    roundReports: rr.rows,
    machines: ma.rows,
    rooms: ro.rows,
    plants: pl.rows,
    people,
    warnings: [wo, cal, rr, ma, ro, pl, me].map((r) => r.failed).filter(Boolean),
    at: Date.now(),
  }
}

/**
 * @param {string} orgId
 * @param {{ enabled?: boolean }} [opts] enabled=false no consulta (pestaña cerrada)
 */
export function useMaintenanceRecords(orgId, { enabled = true } = {}) {
  const [state, setState] = useState(() => cache.get(orgId) || null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!orgId || !enabled) return undefined
    const hit = cache.get(orgId)
    if (hit && Date.now() - hit.at < CACHE_MS && !tick) {
      setState(hit)
      return undefined
    }
    let alive = true
    setLoading(true)
    fetchAll(orgId).then((data) => {
      cache.set(orgId, data)
      if (!alive) return
      setState(data)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [orgId, enabled, tick])

  const reload = useCallback(() => {
    cache.delete(orgId)
    setTick((t) => t + 1)
  }, [orgId])

  const derived = useMemo(() => {
    if (!state) return null
    const machinesById = Object.fromEntries(state.machines.map((m) => [m.id, m]))
    const roomsById = Object.fromEntries(state.rooms.map((r) => [r.id, r]))
    const plantsById = Object.fromEntries(state.plants.map((p) => [p.id, p]))
    const since = sinceOneYear()
    const records = normalizeRecords({
      workOrders: state.workOrders,
      calibrations: state.calibrations,
      roundReports: state.roundReports,
      mantumRecords: mantumRecent.records || [],
      machinesById,
    }).filter((r) => r.date >= since)
    return { machinesById, roomsById, plantsById, records }
  }, [state])

  return {
    loading: loading || (enabled && !!orgId && !state),
    data: state,
    ...(derived || { machinesById: {}, roomsById: {}, plantsById: {}, records: [] }),
    mantum: { generatedAt: mantumRecent.generatedAt, since: mantumRecent.since, files: mantumRecent.files || [], count: (mantumRecent.records || []).length },
    reload,
  }
}
