/**
 * =============================================================================
 * ARCHIVO: src/hooks/useOperatorHistory.js
 * PROPÓSITO: Hook «useOperatorHistory»: historial de trabajo realizado por un
 *   operario / auxiliar (actividades de turno, checks de máquina y órdenes de
 *   trabajo) con comparativo entre dos períodos.
 * CÓMO FUNCIONA: Consulta Supabase por rango de fechas, agrega métricas del
 *   período actual y del período anterior de igual longitud, y expone los
 *   deltas para que el panel muestre «mejoró / bajó» sin recalcular en la UI.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Rangos comparables predefinidos (el comparativo usa el período previo de igual duración) */
export const HISTORY_RANGES = [
  { id: '7d', label: 'Últimos 7 días', days: 7 },
  { id: '14d', label: 'Últimos 14 días', days: 14 },
  { id: '30d', label: 'Últimos 30 días', days: 30 },
  { id: '90d', label: 'Últimos 90 días', days: 90 },
]

export function rangeById(id) {
  return HISTORY_RANGES.find((r) => r.id === id) || HISTORY_RANGES[0]
}

/** YYYY-MM-DD en hora local (evita el corrimiento de día de toISOString) */
function isoDay(date) {
  return date.toLocaleDateString('sv-SE')
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Ventanas actual y anterior para un número de días.
 * Actual: [hoy-(days-1) 00:00, ahora]. Anterior: los `days` inmediatamente previos.
 */
export function buildWindows(days) {
  const now = new Date()
  const currentFrom = startOfDay(new Date(now.getTime() - (days - 1) * 86400000))
  const previousTo = new Date(currentFrom.getTime() - 1)
  const previousFrom = startOfDay(new Date(currentFrom.getTime() - days * 86400000))
  return {
    current: { from: currentFrom, to: now },
    previous: { from: previousFrom, to: previousTo },
  }
}

function isMissing(error) {
  const msg = String(error?.message || '')
  return (
    error?.code === '42P01' ||
    /does not exist|schema cache|Could not find|PGRST205/i.test(msg)
  )
}

async function safeQuery(build) {
  const { data, error } = await build()
  if (error) {
    if (isMissing(error)) return { rows: [], missing: true }
    return { rows: [], error: error.message }
  }
  return { rows: data ?? [] }
}

/** Métricas de un conjunto de registros dentro de una ventana */
function summarize(activities, checks, workOrders) {
  const completed = activities.filter((a) => a.status === 'completed')
  const partial = completed.filter((a) => a.completion === 'partial')
  const full = completed.filter((a) => a.completion !== 'partial')

  // Duración media (min) de las actividades con inicio y fin registrados
  const durations = completed
    .filter((a) => a.started_at && a.completed_at)
    .map((a) => (new Date(a.completed_at) - new Date(a.started_at)) / 60000)
    .filter((m) => Number.isFinite(m) && m >= 0)
  const avgMinutes = durations.length
    ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length)
    : 0

  const withPhoto = completed.filter((a) => !!a.photo_path).length
  const alertChecks = checks.filter(
    (c) => c.condition === 'warning' || c.condition === 'fault'
  ).length
  const qty = completed.reduce((s, a) => s + (Number(a.result_qty) || 0), 0)

  const assigned = activities.length
  const completionRate = assigned ? Math.round((completed.length / assigned) * 100) : 0

  return {
    assigned,
    completed: completed.length,
    fullCompleted: full.length,
    partialCompleted: partial.length,
    pending: activities.filter((a) => a.status === 'pending').length,
    inProgress: activities.filter((a) => a.status === 'in_progress').length,
    completionRate,
    avgMinutes,
    withPhoto,
    photoRate: completed.length ? Math.round((withPhoto / completed.length) * 100) : 0,
    checks: checks.length,
    alertChecks,
    workOrders: workOrders.length,
    workOrdersDone: workOrders.filter((w) => w.status === 'completed').length,
    resultQty: qty,
  }
}

/** Serie diaria para el gráfico de barras (actividades completadas por día) */
function dailySeries(activities, checks, from, to) {
  const days = []
  const cursor = startOfDay(from)
  const end = startOfDay(to)
  while (cursor <= end) {
    days.push(isoDay(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  const actByDay = new Map(days.map((d) => [d, 0]))
  const checkByDay = new Map(days.map((d) => [d, 0]))

  for (const a of activities) {
    if (a.status !== 'completed' || !a.completed_at) continue
    const d = isoDay(new Date(a.completed_at))
    if (actByDay.has(d)) actByDay.set(d, actByDay.get(d) + 1)
  }
  for (const c of checks) {
    const d = c.shift_date || (c.taken_at ? isoDay(new Date(c.taken_at)) : null)
    if (d && checkByDay.has(d)) checkByDay.set(d, checkByDay.get(d) + 1)
  }
  return days.map((d) => ({
    day: d,
    activities: actByDay.get(d) || 0,
    checks: checkByDay.get(d) || 0,
  }))
}

/**
 * Historial y comparativo del operario.
 * @param {{ orgId?: string, userId?: string, rangeId?: string, targetUserId?: string }} opts
 *   `targetUserId` permite a un líder revisar el historial de un miembro del equipo.
 */
export function useOperatorHistory({ orgId, userId, rangeId = '7d', targetUserId }) {
  const subject = targetUserId || userId
  const [state, setState] = useState({
    loading: true,
    error: null,
    missing: false,
    activities: [],
    checks: [],
    workOrders: [],
    calibrations: [],
  })

  const range = rangeById(rangeId)
  const windows = useMemo(() => buildWindows(range.days), [range.days])

  const load = useCallback(async () => {
    if (!orgId || !subject) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))

    // Se trae desde el inicio de la ventana ANTERIOR para cubrir ambos períodos
    const fromIso = windows.previous.from.toISOString()
    const fromDay = isoDay(windows.previous.from)

    const [acts, checks, wos, cal] = await Promise.all([
      safeQuery(() =>
        supabase
          .from('shift_activities')
          .select(
            'id, title, description, status, completion, started_at, completed_at, created_at, result_qty, result_note, photo_path, machine_id, room_id'
          )
          .eq('org_id', orgId)
          .eq('assigned_to', subject)
          .gte('created_at', fromIso)
          .order('created_at', { ascending: false })
          .limit(600)
      ),
      safeQuery(() =>
        supabase
          .from('machine_checks')
          .select('id, machine_id, condition, shift_date, hour_slot, taken_at, notes, photo_path')
          .eq('org_id', orgId)
          .eq('taken_by', subject)
          .gte('shift_date', fromDay)
          .order('taken_at', { ascending: false })
          .limit(800)
      ),
      safeQuery(() =>
        supabase
          .from('work_orders')
          .select('id, title, status, priority, created_at, updated_at, source')
          .eq('org_id', orgId)
          .eq('assigned_to', subject)
          .gte('created_at', fromIso)
          .order('created_at', { ascending: false })
          .limit(300)
      ),
      safeQuery(() =>
        supabase
          .from('machine_calibrations')
          .select(
            'id, machine_id, scope, reason, temp_machine_f, temp_calibrator_f, rh_machine_pct, rh_calibrator_pct, calibrated_at, notes, photo_calibrator_path, photo_screen_path'
          )
          .eq('org_id', orgId)
          .eq('performed_by', subject)
          .gte('calibrated_at', fromIso)
          .order('calibrated_at', { ascending: false })
          .limit(200)
      ),
    ])

    const err = acts.error || checks.error || wos.error || null
    setState({
      loading: false,
      error: err,
      missing: !!(acts.missing && checks.missing),
      activities: acts.rows,
      checks: checks.rows,
      workOrders: wos.rows,
      calibrations: cal.rows || [],
    })
  }, [orgId, subject, windows.previous.from])

  useEffect(() => {
    load()
  }, [load])

  /** Reparte los registros en la ventana actual y la anterior */
  const buckets = useMemo(() => {
    const inWindow = (ts, w) => {
      if (!ts) return false
      const t = new Date(ts).getTime()
      return t >= w.from.getTime() && t <= w.to.getTime()
    }
    // Una actividad pertenece al período en el que se cerró; si sigue abierta,
    // al período en que se creó.
    const actWindow = (a) => a.completed_at || a.created_at
    const checkWindow = (c) => c.taken_at || c.shift_date

    const pick = (w) => ({
      activities: state.activities.filter((a) => inWindow(actWindow(a), w)),
      checks: state.checks.filter((c) => inWindow(checkWindow(c), w)),
      workOrders: state.workOrders.filter((x) => inWindow(x.updated_at || x.created_at, w)),
      calibrations: (state.calibrations || []).filter((c) => inWindow(c.calibrated_at, w)),
    })

    return { current: pick(windows.current), previous: pick(windows.previous) }
  }, [state.activities, state.checks, state.workOrders, state.calibrations, windows])

  const current = useMemo(
    () => summarize(buckets.current.activities, buckets.current.checks, buckets.current.workOrders),
    [buckets.current]
  )
  const previous = useMemo(
    () =>
      summarize(buckets.previous.activities, buckets.previous.checks, buckets.previous.workOrders),
    [buckets.previous]
  )

  /** Delta absoluto y porcentual por métrica */
  const deltas = useMemo(() => {
    const out = {}
    for (const key of Object.keys(current)) {
      const now = current[key]
      const before = previous[key]
      const diff = now - before
      out[key] = {
        diff,
        pct: before ? Math.round((diff / before) * 100) : now ? 100 : 0,
      }
    }
    return out
  }, [current, previous])

  const series = useMemo(
    () =>
      dailySeries(
        buckets.current.activities,
        buckets.current.checks,
        windows.current.from,
        windows.current.to
      ),
    [buckets.current, windows.current]
  )

  /** Línea de tiempo de lo realizado (actividades cerradas + checks), más reciente primero */
  const timeline = useMemo(() => {
    const rows = []
    for (const a of buckets.current.activities) {
      if (a.status !== 'completed') continue
      rows.push({
        id: `act-${a.id}`,
        kind: 'activity',
        at: a.completed_at || a.created_at,
        title: a.title || 'Actividad de turno',
        meta: [
          a.completion === 'partial' ? 'Parcial' : 'Completa',
          a.result_qty ? `${a.result_qty} und.` : null,
          a.photo_path ? 'Con evidencia' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        note: a.result_note || a.description || null,
        warn: a.completion === 'partial',
      })
    }
    for (const c of buckets.current.checks) {
      rows.push({
        id: `chk-${c.id}`,
        kind: 'check',
        at: c.taken_at || c.shift_date,
        title: `Ronda de máquina · ${c.condition}`,
        meta: [
          c.shift_date,
          c.hour_slot != null ? `${String(c.hour_slot).padStart(2, '0')}:00` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        note: c.notes || null,
        warn: c.condition === 'warning' || c.condition === 'fault',
      })
    }
    for (const cal of buckets.current.calibrations || []) {
      const sensors =
        cal.scope === 'temperature'
          ? 'Temperatura °F'
          : cal.scope === 'humidity'
            ? 'Humedad %'
            : 'T°F + HR%'
      rows.push({
        id: `cal-${cal.id}`,
        kind: 'calibration',
        at: cal.calibrated_at,
        title: `Calibración · ${sensors}`,
        meta: [
          cal.temp_machine_f != null ? `T ${cal.temp_machine_f}→${cal.temp_calibrator_f} °F` : null,
          cal.rh_machine_pct != null ? `HR ${cal.rh_machine_pct}→${cal.rh_calibrator_pct} %` : null,
          cal.photo_calibrator_path || cal.photo_screen_path ? 'Con evidencia' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        note: cal.notes || null,
        warn: false,
      })
    }
    return rows.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [buckets.current])

  return {
    loading: state.loading,
    error: state.error,
    missing: state.missing,
    range,
    windows,
    current,
    previous,
    deltas,
    series,
    timeline,
    calibrations: buckets.current.calibrations || [],
    reload: load,
  }
}
