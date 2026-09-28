/**
 * Datos del inicio del líder de área según su área (planta o mantenimiento).
 * Se refresca al volver la red, al subir la cola offline y cada 2 minutos con la
 * pantalla visible. Si una consulta falla se muestra lo demás y se avisa.
 * Henry Stark Desarrollador
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { currentSlot } from '../../../hooks/useMachineChecks'
import { ROLE_LABEL } from '../../../lib/roles'

async function rows(table, build) {
  const { data, error } = await build(supabase.from(table))
  if (error) return { data: [], error: error.message }
  return { data: data ?? [] }
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000)

const WO_FIELDS =
  'id, code, title, description, type, priority, status, source, machine_id, plant_id, assigned_to, created_by, scheduled_for, started_at, completed_at, downtime_minutes, resolution, approved_by, created_at'

async function loadMachines(orgId) {
  const plants = await rows('plants', (q) => q.select('id').eq('org_id', orgId))
  const ids = plants.data.map((p) => p.id)
  if (!ids.length) return { data: [], error: plants.error }
  return rows('machines', (q) => q.select('id, code, name, type, room_id, plant_id, status').in('plant_id', ids))
}

async function loadPlant({ orgId, slot }) {
  const since = daysAgo(2).toISOString()
  const [checks, machines, workOrders, loadMaps, lots, arrivals, loads, transfers, hatches] = await Promise.all([
    rows('machine_checks', (q) =>
      q
        .select(
          'id, machine_id, plant_id, taken_by, taken_at, shift_date, shift_number, hour_slot, condition, notes, photo_path',
        )
        .eq('org_id', orgId)
        .eq('shift_date', slot.shiftDate)
        .eq('shift_number', slot.shift)
        .order('taken_at', { ascending: false })
        .limit(800),
    ),
    loadMachines(orgId),
    rows('work_orders', (q) =>
      q.select(WO_FIELDS).eq('org_id', orgId).in('status', ['open', 'in_progress']).limit(300),
    ),
    rows('load_maps', (q) =>
      q
        .select('id, machine_name, status, payload, approved_at, ordered_at, loaded_at, created_at')
        .eq('org_id', orgId)
        .in('status', ['pending_approval', 'approved', 'ordered'])
        .order('created_at', { ascending: true })
        .limit(40),
    ),
    rows('incubation_lots', (q) =>
      q
        .select('id, code, postures, status')
        .eq('org_id', orgId)
        .gte('updated_at', daysAgo(30).toISOString())
        .limit(200),
    ),
    rows('lot_arrivals', (q) =>
      q.select('*').eq('org_id', orgId).gte('arrived_at', daysAgo(1).toISOString()).limit(100),
    ),
    rows('setter_loads', (q) =>
      q.select('id, machine_id, lote, loaded_at, created_at').eq('org_id', orgId).gte('created_at', since).limit(200),
    ),
    rows('transfers', (q) =>
      q.select('id, lote, mode, transferred_at, created_at').eq('org_id', orgId).gte('created_at', since).limit(200),
    ),
    rows('hatch_events', (q) =>
      q
        .select('id, lote, mode, status, scheduled_at, started_at, ended_at, created_at')
        .eq('org_id', orgId)
        .or(`scheduled_at.gte.${since},started_at.gte.${since},created_at.gte.${since}`)
        .limit(200),
    ),
  ])
  const codeOf = new Map(machines.data.map((m) => [m.id, m.code || m.name]))
  return {
    checks: checks.data,
    machines: machines.data.filter((m) => m.status !== 'decommissioned'),
    workOrders: workOrders.data,
    loadMaps: loadMaps.data,
    lots: lots.data,
    arrivals: arrivals.data,
    loads: loads.data.map((l) => ({
      ...l,
      machine_code: codeOf.get(l.machine_id) || null,
    })),
    transfers: transfers.data,
    hatches: hatches.data,
    errors: [checks, machines, workOrders, loadMaps, lots, arrivals, loads, transfers, hatches]
      .map((r) => r.error)
      .filter(Boolean),
  }
}

async function loadMaintenance({ orgId }) {
  const [open, recent, machines, members] = await Promise.all([
    rows('work_orders', (q) =>
      q.select(WO_FIELDS).eq('org_id', orgId).in('status', ['open', 'in_progress']).limit(400),
    ),
    rows('work_orders', (q) =>
      q
        .select(WO_FIELDS)
        .eq('org_id', orgId)
        .eq('status', 'completed')
        .gte('completed_at', daysAgo(40).toISOString())
        .limit(400),
    ),
    loadMachines(orgId),
    rows('organization_members', (q) =>
      q
        .select('user_id, role, area, profiles ( full_name, email )')
        .eq('org_id', orgId)
        .in('role', ['maintenance_auxiliary', 'coordinator']),
    ),
  ])
  const technicians = members.data
    .filter((m) => m.role === 'maintenance_auxiliary' || (m.role === 'coordinator' && m.area === 'maintenance'))
    .map((m) => ({
      id: m.user_id,
      name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre',
      role: m.role,
      roleLabel: m.role === 'coordinator' ? 'Líder de mantenimiento' : ROLE_LABEL[m.role] || m.role,
    }))
  return {
    workOrders: [...new Map([...open.data, ...recent.data].map((w) => [w.id, w])).values()],
    machines: machines.data,
    technicians,
    errors: [open, recent, machines, members].map((r) => r.error).filter(Boolean),
  }
}

const daysAhead = (n) => new Date(Date.now() + n * 86400000)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const loadPreops = (orgId) =>
  rows('vehicle_preop_reports', (q) =>
    q
      .select(
        'id, driver_user_id, driver_name, vehicle_plate, route_name, inspection_date, compliant, commitments, status, created_at',
      )
      .eq('org_id', orgId)
      .gte('inspection_date', ymd(daysAgo(10)))
      .order('created_at', { ascending: false })
      .limit(300),
  )
const loadDrivers = (orgId) =>
  rows('logistics_drivers', (q) =>
    q
      .select('id, full_name, vehicle, plate, user_id, active, on_route, last_location_at')
      .eq('org_id', orgId)
      .limit(100),
  )

async function loadSst({ orgId }) {
  const [preops, supplies, drivers] = await Promise.all([
    loadPreops(orgId),
    rows('area_inventories', (q) =>
      q
        .select('id, item_name, unit, qty_on_hand, min_qty, location')
        .eq('org_id', orgId)
        .eq('category', 'supplies')
        .limit(300),
    ),
    loadDrivers(orgId),
  ])
  return {
    preops: preops.data,
    supplies: supplies.data,
    drivers: drivers.data,
    errors: [preops, supplies, drivers].map((r) => r.error).filter(Boolean),
  }
}

async function loadEnvironmental({ orgId }) {
  const [sensors, readings] = await Promise.all([
    rows('sensors', (q) =>
      q.select('id, code, kind, unit, min_threshold, max_threshold, status').eq('org_id', orgId).limit(200),
    ),
    rows('sensor_readings', (q) =>
      q
        .select('sensor_id, value, recorded_at')
        .eq('org_id', orgId)
        .gte('recorded_at', daysAgo(3).toISOString())
        .order('recorded_at', { ascending: false })
        .limit(2000),
    ),
  ])
  return {
    sensors: sensors.data,
    readings: readings.data,
    errors: [sensors, readings].map((r) => r.error).filter(Boolean),
  }
}

async function loadLogistics({ orgId }) {
  const [orders, remittances, routes, deliveries, drivers, preops, customers] = await Promise.all([
    rows('sales_orders', (q) =>
      q
        .select('id, code, customer_id, status, qty_females, qty_males, delivery_date')
        .eq('org_id', orgId)
        .in('status', ['confirmed', 'scheduled'])
        .limit(200),
    ),
    rows('sales_remittances', (q) =>
      q
        .select('id, code, order_id, customer_id, dispatch_date, status, qty_females, qty_males')
        .eq('org_id', orgId)
        .gte('dispatch_date', ymd(daysAgo(30)))
        .lte('dispatch_date', ymd(daysAhead(7)))
        .limit(400),
    ),
    rows('logistics_routes', (q) =>
      q
        .select('id, code, name, driver_id, status, started_at')
        .eq('org_id', orgId)
        .in('status', ['planned', 'en_route'])
        .limit(100),
    ),
    rows('logistics_deliveries', (q) =>
      q
        .select('id, route_id, operation_type, status, departed_at, arrived_at, created_at')
        .eq('org_id', orgId)
        .gte('created_at', daysAgo(2).toISOString())
        .limit(400),
    ),
    loadDrivers(orgId),
    loadPreops(orgId),
    rows('customers', (q) => q.select('id, name').eq('org_id', orgId).limit(500)),
  ])
  const all = [orders, remittances, routes, deliveries, drivers, preops, customers]
  return {
    orders: orders.data,
    remittances: remittances.data,
    routes: routes.data,
    deliveries: deliveries.data,
    drivers: drivers.data,
    preops: preops.data,
    customers: customers.data,
    errors: all.map((r) => r.error).filter(Boolean),
  }
}

async function loadVeterinary({ orgId }) {
  const [records, hatches, members] = await Promise.all([
    rows('veterinary_records', (q) =>
      q
        .select(
          'id, kind, title, site, batch_or_lote, sample_point, result, result_status, product_name, dose, units, recorded_at, created_by, created_at',
        )
        .eq('org_id', orgId)
        .gte('recorded_at', daysAgo(60).toISOString())
        .order('recorded_at', { ascending: false })
        .limit(600),
    ),
    rows('hatch_events', (q) =>
      q
        .select('id, lote, status, scheduled_at, started_at, created_at')
        .eq('org_id', orgId)
        .gte('scheduled_at', daysAgo(1).toISOString())
        .lte('scheduled_at', daysAhead(3).toISOString())
        .limit(100),
    ),
    rows('organization_members', (q) =>
      q
        .select('user_id, role, area, profiles ( full_name, email )')
        .eq('org_id', orgId)
        .in('role', ['plant_veterinarian', 'vaccination_auxiliary', 'barn_operator', 'coordinator']),
    ),
  ])
  const team = members.data
    .filter(
      (m) =>
        ['plant_veterinarian', 'vaccination_auxiliary', 'barn_operator'].includes(m.role) ||
        (m.role === 'coordinator' && ['veterinary', 'farm'].includes(m.area)),
    )
    .map((m) => ({
      id: m.user_id,
      name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre',
      roleLabel: ROLE_LABEL[m.role] || m.role,
    }))
  return {
    records: records.data,
    hatches: hatches.data,
    team,
    errors: [records, hatches, members].map((r) => r.error).filter(Boolean),
  }
}

const teamOf = (members, roles, area) =>
  members
    .filter((m) => roles.includes(m.role) || (m.role === 'coordinator' && m.area === area))
    .map((m) => ({
      id: m.user_id,
      name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre',
      roleLabel: ROLE_LABEL[m.role] || m.role,
    }))

async function loadHr({ orgId }) {
  const [members, assignments, punches, supplies] = await Promise.all([
    rows('organization_members', (q) =>
      q.select('user_id, role, area, profiles ( full_name, email )').eq('org_id', orgId),
    ),
    rows('shift_assignments', (q) =>
      q
        .select('user_id, work_date, shift_number, is_rest')
        .eq('org_id', orgId)
        .gte('work_date', ymd(new Date()))
        .lte('work_date', ymd(daysAhead(1)))
        .limit(1000),
    ),
    rows('attendance_punches', (q) =>
      q
        .select('user_id, punch_type, punched_at')
        .eq('org_id', orgId)
        .gte('punched_at', daysAgo(1).toISOString())
        .limit(2000),
    ),
    rows('area_inventories', (q) =>
      q.select('id, item_name, unit, qty_on_hand, min_qty').eq('org_id', orgId).eq('category', 'supplies').limit(300),
    ),
  ])
  return {
    members: members.data.map((m) => ({
      id: m.user_id,
      area: m.area,
      role: m.role,
      name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre',
    })),
    assignments: assignments.data,
    punches: punches.data,
    supplies: supplies.data,
    errors: [members, assignments, punches, supplies].map((r) => r.error).filter(Boolean),
  }
}

async function loadAccounting({ orgId }) {
  const [remittances, syncLog, workOrders, members] = await Promise.all([
    rows('sales_remittances', (q) =>
      q
        .select('*')
        .eq('org_id', orgId)
        .gte('dispatch_date', ymd(daysAgo(60)))
        .limit(1000),
    ),
    rows('siesa_sync_log', (q) =>
      q
        .select('id, mode, count_total, count_synced, count_errors, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20),
    ),
    rows('work_orders', (q) =>
      q
        .select('id, status, cost, completed_at')
        .eq('org_id', orgId)
        .eq('status', 'completed')
        .gte('completed_at', daysAgo(40).toISOString())
        .limit(500),
    ),
    rows('organization_members', (q) =>
      q
        .select('user_id, role, area, profiles ( full_name, email )')
        .eq('org_id', orgId)
        .in('role', ['accounting_auxiliary', 'coordinator']),
    ),
  ])
  return {
    remittances: remittances.data,
    syncLog: syncLog.data,
    workOrders: workOrders.data,
    team: teamOf(members.data, ['accounting_auxiliary'], 'accounting'),
    // Siesa puede no estar configurado: su bitácora no cuenta como falla.
    errors: [remittances, workOrders, members].map((r) => r.error).filter(Boolean),
  }
}

async function loadSales({ orgId }) {
  const [orders, customers, hatches] = await Promise.all([
    rows('sales_orders', (q) =>
      q
        .select('id, code, customer_id, status, qty_females, qty_males, delivery_date, created_at')
        .eq('org_id', orgId)
        .or(`status.in.(requested,confirmed,scheduled),delivery_date.gte.${ymd(daysAgo(40))}`)
        .limit(1000),
    ),
    rows('customers', (q) => q.select('id, name, status').eq('org_id', orgId).limit(1000)),
    rows('hatch_events', (q) =>
      q
        .select('id, lote, status, estimated_chicks, scheduled_at, started_at, created_at')
        .eq('org_id', orgId)
        .gte('scheduled_at', daysAgo(1).toISOString())
        .lte('scheduled_at', daysAhead(10).toISOString())
        .limit(100),
    ),
  ])
  return {
    orders: orders.data,
    customers: customers.data,
    hatches: hatches.data,
    errors: [orders, customers, hatches].map((r) => r.error).filter(Boolean),
  }
}

const LOADERS = {
  plant: loadPlant,
  maintenance: loadMaintenance,
  sst: loadSst,
  environmental: loadEnvironmental,
  logistics: loadLogistics,
  veterinary: loadVeterinary,
  hr: loadHr,
  accounting: loadAccounting,
  sales: loadSales,
}

export function useLeaderHome({ kind, orgId }) {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
    updatedAt: null,
  })
  const [slot, setSlot] = useState(() => currentSlot())
  const busy = useRef(false)

  const load = useCallback(async () => {
    const loader = LOADERS[kind]
    if (!loader || !orgId || busy.current) return
    busy.current = true
    const s = currentSlot()
    setSlot(s)
    setState((st) => ({ ...st, loading: true }))
    try {
      const data = await loader({ orgId, slot: s })
      setState({
        loading: false,
        data,
        error: data.errors?.length ? 'Algunos datos no cargaron. Revisa la conexión y actualiza.' : null,
        updatedAt: new Date(),
      })
    } catch (e) {
      setState((st) => ({
        ...st,
        loading: false,
        error:
          navigator.onLine === false ? 'Sin conexión: se muestran los últimos datos cargados.' : e.message || String(e),
      }))
    } finally {
      busy.current = false
    }
  }, [kind, orgId])

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

  return { ...state, slot, reload: load }
}

/** Asigna una OT a un técnico. */
export async function assignWorkOrder(orderId, technicianId) {
  const { error } = await supabase.from('work_orders').update({ assigned_to: technicianId }).eq('id', orderId)
  return { error: error?.message || null }
}

/** El líder da el visto bueno al cierre de una OT. */
export async function approveWorkOrder(orderId, { userId, userName }) {
  const { error } = await supabase
    .from('work_orders')
    .update({ approved_by: userId, approver_name: userName || null })
    .eq('id', orderId)
  return { error: error?.message || null }
}
