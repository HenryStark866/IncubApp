/**
 * Datos de las pantallas de inicio de la operación de planta. Carga solo lo que
 * necesita la pantalla del rol (`kind`) y se refresca al volver la red, al subir
 * la cola offline y cada 2 minutos con la pantalla visible.
 * El cumplimiento (rondas del turno, asistencia, puntaje del bono) no se calcula
 * aquí: viene de usePerformance, la misma fuente de la pestaña «Cumplimiento».
 * Henry Stark Desarrollador · CDH Maker
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { queryRows, loadWarning } from '../../../lib/queryRows'
import { currentSlot } from '../../../hooks/useMachineChecks'
import { localDate } from '../lib/shiftHome'
import { uniqueChannel } from '../../../lib/realtimeChannel'

// Reintenta una vez si la red o la base fallaron de forma momentánea (lib/queryRows).
const rows = (table, build) => queryRows(table, build)

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

async function loadMachines(orgId) {
  const plants = await rows('plants', (q) => q.select('id').eq('org_id', orgId))
  const ids = plants.data.map((p) => p.id)
  if (!ids.length) return { data: [], error: plants.error }
  return rows('machines', (q) => q.select('id, code, name, type, status, room_id, panel_room_id, plant_id').in('plant_id', ids))
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

async function loadOperator({ orgId, userId, slot }) {
  const today = startOfToday().toISOString()
  const weekAhead = new Date()
  weekAhead.setDate(weekAhead.getDate() + 7)
  const [acts, checks, machines, plants, rooms, assignments, incidents] = await Promise.all([
    // Asignadas por hacer + las que cerró hoy (para «Hecho hoy»).
    rows('shift_activities', (q) =>
      q
        .select('id, title, description, machine_id, room_id, status, created_at, started_at, completed_at, completion, result_qty, result_note, photo_path, assigned_to')
        .eq('org_id', orgId)
        .eq('assigned_to', userId)
        .or(`status.in.(pending,in_progress),completed_at.gte.${today}`)
        .order('created_at', { ascending: true })
        .limit(60)
    ),
    rows('machine_checks', (q) =>
      q
        .select('id, machine_id, plant_id, taken_by, taken_at, shift_date, shift_number, hour_slot, condition, notes, photo_path')
        .eq('org_id', orgId)
        .eq('shift_date', slot.shiftDate)
        .eq('shift_number', slot.shift)
        .order('taken_at', { ascending: false })
        .limit(600)
    ),
    loadMachines(orgId),
    rows('plants', (q) => q.select('id, name, code').eq('org_id', orgId).order('created_at')),
    rows('rooms', (q) => q.select('id, plant_id, name, code, type').order('code')),
    rows('shift_assignments', (q) =>
      q
        .select('user_id, work_date, shift_number, is_rest')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .gte('work_date', localDate())
        .lte('work_date', localDate(weekAhead))
    ),
    // Fallas e incidencias que la persona reportó hoy (quedan como OT abiertas).
    rows('work_orders', (q) =>
      q.select('*').eq('org_id', orgId).eq('created_by', userId).eq('source', 'incident').gte('created_at', today).order('created_at', { ascending: false }).limit(20)
    ),
  ])
  const plantIds = new Set(plants.data.map((p) => p.id))
  return {
    acts: acts.data,
    checks: checks.data,
    machines: machines.data,
    plants: plants.data,
    rooms: rooms.data.filter((r) => plantIds.has(r.plant_id)),
    assignments: assignments.data,
    incidents: incidents.data,
    myPhotos: checks.data.filter((c) => c.taken_by === userId).length,
    errors: [acts.error, checks.error, machines.error].filter(Boolean),
  }
}

async function loadProduction({ orgId }) {
  const since = daysAgo(2).toISOString()
  const [loads, transfers, hatches, maps, machines] = await Promise.all([
    rows('setter_loads', (q) =>
      q.select('id, machine_id, lote, loaded_at, created_at').eq('org_id', orgId).gte('created_at', since).limit(200)
    ),
    rows('transfers', (q) =>
      q.select('id, lote, mode, transferred_at, created_at').eq('org_id', orgId).gte('created_at', since).limit(200)
    ),
    rows('hatch_events', (q) =>
      q
        .select('id, lote, mode, status, scheduled_at, started_at, ended_at, created_at')
        .eq('org_id', orgId)
        .or(`scheduled_at.gte.${since},started_at.gte.${since},created_at.gte.${since}`)
        .limit(200)
    ),
    rows('load_maps', (q) =>
      q
        .select('id, machine_name, status, payload, approved_at, ordered_at, created_at')
        .eq('org_id', orgId)
        .in('status', ['approved', 'ordered'])
        .order('created_at', { ascending: true })
        .limit(40)
    ),
    loadMachines(orgId),
  ])
  const codeOf = new Map(machines.data.map((m) => [m.id, m.code || m.name]))
  return {
    loads: loads.data.map((l) => ({ ...l, machine_code: codeOf.get(l.machine_id) || null })),
    transfers: transfers.data,
    hatches: hatches.data,
    loadMaps: maps.data,
    errors: [loads.error, transfers.error, hatches.error, maps.error].filter(Boolean),
  }
}

async function loadReception({ orgId }) {
  const [lots, arrivals, orders] = await Promise.all([
    rows('incubation_lots', (q) =>
      q
        .select('id, code, origin, postures, expected_arrival_date, status')
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gte('expected_arrival_date', localDate(daysAgo(14)))
        .order('expected_arrival_date', { ascending: true })
        .limit(200)
    ),
    rows('lot_arrivals', (q) =>
      q
        .select('id, lot_id, lot_code, arrived_at, received_postures, created_at')
        .eq('org_id', orgId)
        .gte('arrived_at', daysAgo(14).toISOString())
        .limit(300)
    ),
    rows('classification_orders', (q) =>
      q.select('id, status').eq('org_id', orgId).in('status', ['published', 'in_progress']).limit(50)
    ),
  ])
  return {
    lots: lots.data,
    arrivals: arrivals.data,
    coldRoom: {
      waiting: lots.data.filter((l) => l.status === 'arrived').length,
      classifying: lots.data.filter((l) => l.status === 'classifying').length,
      openOrders: orders.data.length,
    },
    errors: [lots.error, arrivals.error, orders.error].filter(Boolean),
  }
}

async function loadSupervisor({ orgId, slot }) {
  const today = startOfToday().toISOString()
  const since = daysAgo(1).toISOString()
  const [acts, checks, machines, assignments, workOrders, plants, rooms, catalog, loads, transfers, hatches, punches] = await Promise.all([
    // Abiertas + las cerradas hoy (columna «Hechas»).
    rows('shift_activities', (q) =>
      q
        .select('id, title, description, status, assigned_to, assigned_by, machine_id, room_id, created_at, started_at, completed_at, completion, result_note')
        .eq('org_id', orgId)
        .or(`status.in.(pending,in_progress),completed_at.gte.${today}`)
        .order('created_at', { ascending: true })
        .limit(200)
    ),
    rows('machine_checks', (q) =>
      q
        .select('id, machine_id, plant_id, taken_by, taken_at, shift_date, shift_number, hour_slot, condition, notes, photo_path')
        .eq('org_id', orgId)
        .eq('shift_date', slot.shiftDate)
        .eq('shift_number', slot.shift)
        .order('taken_at', { ascending: false })
        .limit(1500)
    ),
    loadMachines(orgId),
    rows('shift_assignments', (q) =>
      q
        .select('user_id, work_date, shift_number, is_rest')
        .eq('org_id', orgId)
        .eq('work_date', slot.shiftDate)
    ),
    rows('work_orders', (q) =>
      q
        .select('*')
        .eq('org_id', orgId)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(200)
    ),
    rows('plants', (q) => q.select('id, name, code').eq('org_id', orgId).order('created_at')),
    rows('rooms', (q) => q.select('id, plant_id, name, code, type').order('code')),
    rows('shift_activity_catalog', (q) => q.select('id, name, description').eq('org_id', orgId).eq('active', true).order('name')),
    rows('setter_loads', (q) => q.select('id, machine_id, lote, loaded_at, created_at').eq('org_id', orgId).gte('created_at', since).limit(200)),
    rows('transfers', (q) => q.select('id, lote, mode, transferred_at, created_at').eq('org_id', orgId).gte('created_at', since).limit(200)),
    rows('hatch_events', (q) =>
      q.select('id, lote, mode, status, scheduled_at, started_at, ended_at, created_at').eq('org_id', orgId).or(`scheduled_at.gte.${since},started_at.gte.${since},created_at.gte.${since}`).limit(200)
    ),
    // Marcas del turno (para el tablero en vivo; usePerformance trae el historial largo).
    rows('attendance_punches', (q) =>
      q.select('id, user_id, punch_type, punched_at, shift_date, site_name').eq('org_id', orgId).gte('punched_at', since).order('punched_at').limit(600)
    ),
  ])
  const plantIds = new Set(plants.data.map((p) => p.id))
  const openOrdersByMachine = new Map()
  for (const w of workOrders.data) if (w.machine_id && !openOrdersByMachine.has(w.machine_id)) openOrdersByMachine.set(w.machine_id, w)
  return {
    acts: acts.data,
    checks: checks.data,
    machines: machines.data,
    assignments: assignments.data,
    workOrders: workOrders.data,
    openOrdersByMachine,
    openWorkOrderMachines: new Set(openOrdersByMachine.keys()),
    plants: plants.data,
    rooms: rooms.data.filter((r) => plantIds.has(r.plant_id)),
    catalog: catalog.data,
    loads: loads.data,
    transfers: transfers.data,
    hatches: hatches.data,
    punches: punches.data,
    errors: [acts.error, checks.error, machines.error, assignments.error].filter(Boolean),
  }
}

const LOADERS = {
  operator: loadOperator,
  production: loadProduction,
  reception: loadReception,
  supervisor: loadSupervisor,
}

export function useShiftHome({ kind, orgId, userId }) {
  const [state, setState] = useState({ loading: true, data: null, error: null, updatedAt: null })
  const [slot, setSlot] = useState(() => currentSlot())
  const [live, setLive] = useState(false)
  const busy = useRef(false)

  const load = useCallback(async () => {
    const loader = LOADERS[kind]
    if (!loader || !orgId || busy.current) return
    busy.current = true
    const s = currentSlot()
    setSlot(s)
    setState((st) => ({ ...st, loading: true }))
    try {
      const data = await loader({ orgId, userId, slot: s })
      setState({
        loading: false,
        data,
        // Parcial: si una consulta falla se muestra lo demás; solo se avisa si es la conexión.
        error: loadWarning(data.errors, { source: `inicio de turno (${kind})` }),
        updatedAt: new Date(),
      })
    } catch (e) {
      setState((st) => ({
        ...st,
        loading: false,
        error: navigator.onLine === false ? 'Sin conexión: se muestran los últimos datos cargados.' : e.message || String(e),
      }))
    } finally {
      busy.current = false
    }
  }, [kind, orgId, userId])

  // Supervisor: se recarga solo cuando el equipo registra algo (fotos, actividades,
  // marcas, OT). Varios cambios seguidos se juntan en una sola recarga.
  useEffect(() => {
    if (kind !== 'supervisor' || !orgId) return undefined
    let timer = null
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(() => load(), 2500)
    }
    const channel = supabase.channel(uniqueChannel(`shift-home:${orgId}`))
    for (const table of ['machine_checks', 'shift_activities', 'attendance_punches', 'work_orders', 'round_reports']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, soon)
    }
    channel.subscribe((status) => setLive(status === 'SUBSCRIBED'))
    return () => {
      clearTimeout(timer)
      setLive(false)
      supabase.removeChannel(channel)
    }
  }, [kind, orgId, load])

  useEffect(() => {
    load()
    const onChange = () => load()
    window.addEventListener('online', onChange)
    window.addEventListener('incubapp:queue-changed', onChange)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 120000)
    return () => {
      window.removeEventListener('online', onChange)
      window.removeEventListener('incubapp:queue-changed', onChange)
      clearInterval(timer)
    }
  }, [load])

  return { ...state, slot, live, reload: load }
}
