/**
 * Datos del inicio del líder de área según su área (planta o mantenimiento).
 * Se refresca al volver la red, al subir la cola offline y cada 2 minutos con la
 * pantalla visible. Si una consulta falla se muestra lo demás y se avisa.
 * Henry Stark Desarrollador
 */
import { queryRows, loadWarning } from '../../../lib/queryRows'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { currentSlot } from '../../../hooks/useMachineChecks'
import { ROLE_LABEL } from '../../../lib/roles'
import { isMissingTable } from '../../../lib/missingTable'

// Reintenta una vez si la red o la base fallaron de forma momentánea (lib/queryRows).
const rows = (table, build) => queryRows(table, build)

/** Como rows(), pero si la tabla no existe devuelve vacío sin marcar error: lo demás sigue. */
async function optionalRows(table, build) {
  const res = await queryRows(table, build)
  if (res.error && isMissingTable({ message: res.error })) return { data: [], missing: true }
  return res
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
  const [checks, machines, workOrders, loadMaps, lots, arrivals, loads, transfers, hatches, techs] = await Promise.all([
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
        .select('id, machine_name, status, payload, approved_at, ordered_at, created_at')
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
    // Para asignar las OT abiertas desde el indicador (06-10-2026)
    loadTechnicians(orgId),
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
    technicians: techs.data,
    errors: [checks, machines, workOrders, loadMaps, lots, arrivals, loads, transfers, hatches, techs]
      .map((r) => r.error)
      .filter(Boolean),
  }
}

/** Técnicos de mantenimiento (y el líder de mantenimiento) a quienes se asignan OT */
async function loadTechnicians(orgId) {
  const members = await rows('organization_members', (q) =>
    q
      .select('user_id, role, area, profiles ( full_name, email )')
      .eq('org_id', orgId)
      .in('role', ['maintenance_auxiliary', 'coordinator']),
  )
  return {
    error: members.error,
    data: members.data
      .filter((m) => m.role === 'maintenance_auxiliary' || (m.role === 'coordinator' && m.area === 'maintenance'))
      .map((m) => ({
        id: m.user_id,
        name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre',
        role: m.role,
        roleLabel: m.role === 'coordinator' ? 'Líder de mantenimiento' : ROLE_LABEL[m.role] || m.role,
      })),
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
    loadTechnicians(orgId),
  ])
  const technicians = members.data
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
  const [preops, supplies, drivers, incidents, inspections, accident, confined] = await Promise.all([
    loadPreops(orgId),
    rows('area_inventories', (q) =>
      q
        .select('id, item_name, unit, qty_on_hand, min_qty, location')
        .eq('org_id', orgId)
        .eq('category', 'supplies')
        .limit(300),
    ),
    loadDrivers(orgId),
    // Abiertos (cualquier fecha) y cerrados recientes.
    optionalRows('sst_incidents', (q) =>
      q
        .select(
          'id, occurred_at, site, area, kind, affected_person, description, severity, has_disability, disability_days, status, corrective_action, action_owner, action_due, action_done_at, closed_at, created_at',
        )
        .eq('org_id', orgId)
        .or(`status.neq.closed,occurred_at.gte.${daysAgo(60).toISOString()}`)
        .order('occurred_at', { ascending: false })
        .limit(300),
    ),
    optionalRows('sst_inspections', (q) =>
      q
        .select('id, kind, kind_other, site, scheduled_for, done_at, responsible_name, result, findings')
        .eq('org_id', orgId)
        .or(`done_at.is.null,scheduled_for.gte.${ymd(daysAgo(14))},done_at.gte.${daysAgo(14).toISOString()}`)
        .order('scheduled_for', { ascending: true })
        .limit(300),
    ),
    // El último accidente, aunque sea viejo, para «Días sin accidente».
    optionalRows('sst_incidents', (q) =>
      q
        .select('id, occurred_at, kind, status')
        .eq('org_id', orgId)
        .eq('kind', 'accident')
        .order('occurred_at', { ascending: false })
        .limit(1),
    ),
    // Permisos de espacio confinado por autorizar o suspendidos.
    optionalRows('sst_confined_permits', (q) =>
      q
        .select('id, status, work_description, suspended_reason, sst_confined_spaces ( code, name )')
        .eq('org_id', orgId)
        .in('status', ['draft', 'suspended'])
        .limit(50),
    ),
  ])
  return {
    preops: preops.data,
    supplies: supplies.data,
    drivers: drivers.data,
    incidents: [...new Map([...accident.data, ...incidents.data].map((x) => [x.id, { ...x }])).values()],
    inspections: inspections.data,
    confinedPermits: confined.data.map((p) => ({
      ...p,
      space_code: p.sst_confined_spaces?.code,
      space_name: p.sst_confined_spaces?.name,
    })),
    errors: [preops, supplies, drivers, incidents, inspections].map((r) => r.error).filter(Boolean),
  }
}

async function loadEnvironmental({ orgId }) {
  const [sensors, readings, waste, meterReadings, obligations] = await Promise.all([
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
    // Mes en curso (residuos del mes) y retiros programados pendientes.
    optionalRows('env_waste', (q) =>
      q
        .select('id, recorded_on, kind, kg, manager, recovered, status')
        .eq('org_id', orgId)
        .or(`status.eq.scheduled,recorded_on.gte.${ymd(daysAgo(40))}`)
        .limit(1000),
    ),
    // Tres semanas: la actual, la anterior y la lectura base de la anterior.
    optionalRows('env_meter_readings', (q) =>
      q
        .select('id, read_on, meter, site, reading, unit')
        .eq('org_id', orgId)
        .gte('read_on', ymd(daysAgo(35)))
        .order('read_on', { ascending: true })
        .limit(2000),
    ),
    optionalRows('env_obligations', (q) =>
      q.select('id, name, due_on, status, notes').eq('org_id', orgId).neq('status', 'done').limit(300),
    ),
  ])
  return {
    sensors: sensors.data,
    readings: readings.data,
    waste: waste.data,
    meterReadings: meterReadings.data,
    obligations: obligations.data,
    errors: [sensors, readings, waste, meterReadings, obligations].map((r) => r.error).filter(Boolean),
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

/**
 * Gerencia: carga las nueve áreas en paralelo con las mismas consultas del inicio de
 * cada líder. Si un área falla, las demás se muestran y se avisa.
 */
async function loadManagement({ orgId, slot }) {
  const kinds = ['plant', 'maintenance', 'veterinary', 'sst', 'environmental', 'logistics', 'sales', 'hr', 'accounting']
  const results = await Promise.allSettled(kinds.map((k) => AREA_LOADERS[k]({ orgId, slot })))
  const areas = {}
  const errors = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      areas[kinds[i]] = r.value
      if (r.value?.errors?.length) errors.push(...r.value.errors)
    } else {
      areas[kinds[i]] = null
      errors.push(r.reason?.message || String(r.reason))
    }
  })
  return { areas, errors }
}

const AREA_LOADERS = {
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


/**
 * Líder de producción (06-10-2026): recepción, cuarto frío, mapas de cargue, máquinas y su
 * contenido, transferencias, nacimientos, y lo que registra y tiene asignado su equipo.
 */
async function loadProductionLead({ orgId }) {
  const d1 = daysAgo(1).toISOString()
  const d7 = daysAgo(7).toISOString()
  const d30 = daysAgo(30).toISOString()
  const [
    lots, arrivals, stock, batches, plants, rooms, maps, machines, loads, transfers, hatches, checks,
    workOrders, members, tasks, vet, classifications,
  ] = await Promise.all([
    rows('incubation_lots', (q) =>
      q.select('id, code, origin, postures, expected_arrival_date, status').eq('org_id', orgId)
        .gte('expected_arrival_date', daysAgo(14).toLocaleDateString('sv-SE')).order('expected_arrival_date').limit(300),
    ),
    rows('lot_arrivals', (q) => q.select('*').eq('org_id', orgId).gte('arrived_at', d7).order('arrived_at', { ascending: false }).limit(200)),
    optionalRows('cold_room_stock', (q) =>
      q.select('id, batch_id, room_id, stock_date, counts, notes, updated_by, updated_at').eq('org_id', orgId)
        .order('stock_date', { ascending: false }).limit(600),
    ),
    optionalRows('bird_batches', (q) => q.select('id, code, farm_id, lay_date').eq('org_id', orgId).limit(800)),
    rows('plants', (q) => q.select('id, name, code, type').eq('org_id', orgId)),
    optionalRows('rooms', (q) => q.select('id, name, code, plant_id, type').limit(1500)),
    rows('load_maps', (q) =>
      q.select('id, machine_id, machine_name, status, payload, approved_at, approved_by, rejected_reason, image_path, created_at')
        .eq('org_id', orgId).or(`status.in.(pending_approval,approved,ordered),created_at.gte.${d7}`)
        .order('created_at', { ascending: false }).limit(120),
    ),
    loadMachines(orgId),
    rows('setter_loads', (q) =>
      q.select('id, machine_id, lote, loaded_at, cycle_start_at, created_by, created_at').eq('org_id', orgId).gte('loaded_at', d30).limit(600),
    ),
    rows('transfers', (q) =>
      q.select('*').eq('org_id', orgId).gte('transferred_at', d30).order('transferred_at', { ascending: false }).limit(300),
    ),
    rows('hatch_events', (q) =>
      q.select('*').eq('org_id', orgId).or(`scheduled_at.gte.${d30},started_at.gte.${d30},created_at.gte.${d30}`).limit(300),
    ),
    rows('machine_checks', (q) =>
      q.select('id, machine_id, taken_by, taken_at, condition, temp_air, humidity, notes').eq('org_id', orgId)
        .gte('taken_at', d1).order('taken_at', { ascending: false }).limit(1500),
    ),
    rows('work_orders', (q) => q.select('id, machine_id, status, priority, title, code').eq('org_id', orgId).in('status', ['open', 'in_progress']).limit(300)),
    rows('organization_members', (q) =>
      q.select('user_id, role, area, profiles ( full_name, email )').eq('org_id', orgId)
        .in('role', ['auxiliary_production', 'quality_auxiliary', 'vaccination_auxiliary', 'reception_operator']),
    ),
    optionalRows('shift_activities', (q) =>
      q.select('id, title, description, assigned_to, assigned_by, status, created_at, started_at, completed_at, result_note, photo_path, machine_id')
        .eq('org_id', orgId).gte('created_at', d7).order('created_at', { ascending: false }).limit(400),
    ),
    optionalRows('veterinary_records', (q) =>
      q.select('id, kind, title, batch_or_lote, result_status, product_name, recorded_at, created_by, created_at')
        .eq('org_id', orgId).gte('created_at', d7).order('created_at', { ascending: false }).limit(200),
    ),
    optionalRows('egg_classifications', (q) =>
      q.select('id, batch_id, activity_date, carts_count, classification_type, created_by, created_at')
        .eq('org_id', orgId).gte('created_at', d7).limit(200),
    ),
  ])
  const codeOf = new Map(machines.data.map((m) => [m.id, m.code || m.name]))
  const all = [lots, arrivals, stock, batches, plants, rooms, maps, machines, loads, transfers, hatches, checks, workOrders, members, tasks, vet, classifications]
  return {
    lots: lots.data,
    arrivals: arrivals.data,
    stock: stock.data,
    batches: batches.data,
    farms: plants.data,
    rooms: rooms.data,
    maps: maps.data,
    machines: machines.data,
    loads: loads.data.map((l) => ({ ...l, machine_code: codeOf.get(l.machine_id) || null })),
    transfers: transfers.data,
    hatches: hatches.data,
    checks: checks.data,
    workOrders: workOrders.data,
    members: members.data.map((m) => ({
      id: m.user_id,
      role: m.role,
      roleLabel: ROLE_LABEL[m.role] || m.role,
      name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre',
    })),
    tasks: tasks.data,
    vet: vet.data,
    classifications: classifications.data,
    errors: all.map((r) => r.error).filter(Boolean),
  }
}

/** Tablas que cambian el inicio de producción en vivo */
const REALTIME_TABLES = {
  production: ['lot_arrivals', 'cold_room_stock', 'load_maps', 'setter_loads', 'transfers', 'hatch_events', 'machine_checks', 'shift_activities'],
}

const LOADERS = { ...AREA_LOADERS, management: loadManagement, production: loadProductionLead }

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
        error: loadWarning(data.errors, { source: `inicio del líder (${kind})` }),
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
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') load()
      },
      kind === 'management' ? 300000 : 120000,
    )
    // En vivo: cualquier cambio en las tablas del área recarga (agrupado en 1,5 s)
    let canal = null
    let espera = null
    const tablas = REALTIME_TABLES[kind]
    if (tablas && orgId) {
      canal = supabase.channel(`lider-${kind}-${orgId}-${Math.random().toString(36).slice(2, 7)}`)
      for (const table of tablas) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, () => {
          clearTimeout(espera)
          espera = setTimeout(() => load(), 1500)
        })
      }
      canal.subscribe()
    }
    return () => {
      window.removeEventListener('online', onChange)
      window.removeEventListener('incubapp:queue-changed', onChange)
      clearInterval(timer)
      clearTimeout(espera)
      if (canal) supabase.removeChannel(canal)
    }
  }, [load, kind, orgId])

  return { ...state, slot, reload: load }
}

/** Asigna una OT a un técnico. */
export async function assignWorkOrder(orderId, technicianId) {
  const { error } = await supabase.from('work_orders').update({ assigned_to: technicianId }).eq('id', orderId)
  return { error: error?.message || null }
}

/** Asigna varias OT al mismo técnico de una vez. */
export async function assignWorkOrders(orderIds, technicianId) {
  if (!orderIds?.length) return { error: null, count: 0 }
  const { data, error } = await supabase
    .from('work_orders')
    .update({ assigned_to: technicianId })
    .in('id', orderIds)
    .select('id')
  if (error) return { error: error.message, count: 0 }
  // Sin filas devueltas = la base no dejó cambiarlas (permisos)
  if (Array.isArray(data) && data.length < orderIds.length) {
    return { error: `Solo se asignaron ${data.length} de ${orderIds.length}: revise los permisos sobre las OT.`, count: data.length }
  }
  return { error: null, count: data?.length ?? orderIds.length }
}

/** El líder da el visto bueno al cierre de una OT. */
export async function approveWorkOrder(orderId, { userId, userName }) {
  const { error } = await supabase
    .from('work_orders')
    .update({ approved_by: userId, approver_name: userName || null })
    .eq('id', orderId)
  return { error: error?.message || null }
}
