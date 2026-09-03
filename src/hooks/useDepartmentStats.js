/**
 * =============================================================================
 * ARCHIVO: src/hooks/useDepartmentStats.js
 * PROPÓSITO: Hook «useDepartmentStats»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/roles'
import {
  classifyChecksToday,
  conditionLabel,
  isRealMachineAlert,
} from '../lib/machineCheckStatus'
import { getSiesaConfig, siesaQueueStats } from '../lib/siesa'

/**
 * KPIs reales por módulo corporativo (desde tablas operativas de Supabase).
 * - gerencia: panorama multi-área
 * - coord_mantenimiento: OT y equipos
 * - rrhh: plantilla y roles
 * - resto: subset útil si se abre el panel
 */

const isFarmPlant = (p) =>
  Boolean(p?.code?.startsWith('G') || p?.name?.startsWith('G-'))

function emptyStats() {
  return {
    loading: true,
    error: null,
    kpis: [],
    health: null,
    lists: {},
    updatedAt: null,
  }
}

/** Resultado usable aunque falle una tabla (no tumba el dashboard). */
function rowsOf(res) {
  if (!res || res.error) return []
  return res.data ?? []
}

function softErr(res) {
  if (!res?.error) return null
  const m = res.error.message || ''
  if (/does not exist|schema cache|Could not find|relation|permission/i.test(m)) return null
  return m
}

/**
 * @param {string} orgId
 * @param {string} moduleId
 * @param {{ grantedScopeIds?: string[], isOmniscient?: boolean }} [privacy]
 */
/** Export «useDepartmentStats»: API pública de este módulo. Henry Stark Desarrollador */
export function useDepartmentStats(orgId, moduleId, privacy = {}) {
  const [state, setState] = useState(emptyStats)
  const grantedScopeIds = privacy.grantedScopeIds || []
  const isOmniscient = !!privacy.isOmniscient

  const load = useCallback(async () => {
    if (!orgId || !moduleId) {
      setState({ ...emptyStats(), loading: false })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      if (moduleId === 'gerencia') {
        // Datos de planta/mantenimiento solo con grant de módulo o vista omnisciente
        const canOps =
          isOmniscient ||
          grantedScopeIds.includes('plant') ||
          grantedScopeIds.includes('maintenance') ||
          grantedScopeIds.includes('farm')
        setState(await loadGerencia(orgId, { canOps, grantedScopeIds, isOmniscient }))
        return
      }
      if (moduleId === 'coord_mantenimiento') {
        setState(await loadMantenimiento(orgId))
        return
      }
      if (moduleId === 'rrhh') {
        setState(await loadRrhh(orgId))
        return
      }
      // Contabilidad / ventas / SST: KPIs cruzados básicos
      if (moduleId === 'contabilidad') {
        setState(await loadContabilidad(orgId))
        return
      }
      if (moduleId === 'ventas') {
        setState(await loadVentas(orgId))
        return
      }
      if (moduleId === 'logistica') {
        setState(await loadLogistica(orgId))
        return
      }
      if (moduleId === 'sst') {
        setState(await loadSst(orgId))
        return
      }
      if (moduleId === 'ambiental') {
        setState(await loadAmbiental(orgId))
        return
      }
      if (moduleId === 'veterinaria') {
        setState(await loadVeterinaria(orgId))
        return
      }
      setState({ ...emptyStats(), loading: false })
    } catch (e) {
      setState({
        loading: false,
        error: e.message || String(e),
        kpis: [],
        health: null,
        lists: {},
        updatedAt: null,
      })
    }
  }, [orgId, moduleId, isOmniscient, grantedScopeIds.join('|')])

  useEffect(() => {
    load()
  }, [load])

  // Tras sincronizar cola del móvil, refrescar KPIs (checks/alertas)
  useEffect(() => {
    const onSync = () => {
      load()
    }
    window.addEventListener('incubapp:sync-done', onSync)
    window.addEventListener('online', onSync)
    return () => {
      window.removeEventListener('incubapp:sync-done', onSync)
      window.removeEventListener('online', onSync)
    }
  }, [load])

  return { ...state, reload: load }
}

async function loadGerencia(orgId, { canOps = false, grantedScopeIds = [], isOmniscient = false } = {}) {
  // Siempre: plantilla (solo conteo por rol, sin PII) — útil a dirección
  const membersR = await supabase
    .from('organization_members')
    .select('user_id, role, area')
    .eq('org_id', orgId)
  const members = rowsOf(membersR)

  const byRole = {}
  for (const m of members) {
    const key = m.role || 'sin_rol'
    byRole[key] = (byRole[key] || 0) + 1
  }
  const roleBreakdown = Object.entries(byRole)
    .map(([role, count]) => ({
      role,
      label: ROLE_LABEL[role] ?? role,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  if (!canOps) {
    return {
      loading: false,
      error: null,
      sealed: true,
      kpis: [
        {
          label: 'Personal (conteo)',
          value: members.length,
          sub: 'sin detalle operativo de otros módulos',
        },
        {
          label: 'Datos de planta',
          value: '🔒',
          sub: 'Solicita acceso al módulo en Accesos',
          warn: true,
        },
        {
          label: 'OT / lotes / sensores',
          value: '🔒',
          sub: 'Hermético hasta grant temporal',
          warn: true,
        },
      ],
      health: {
        pending: 0,
        alarms: 0,
        critical: 0,
        openWO: 0,
        plants: 0,
        farms: 0,
        members: members.length,
      },
      lists: {
        criticalOrders: [],
        activeBatches: [],
        roleBreakdown,
      },
      privacyNote:
        'Los indicadores de planta, granja y mantenimiento están sellados. Pide acceso temporal al responsable del módulo (pestaña Accesos).',
      updatedAt: new Date().toISOString(),
    }
  }

  const [plantsR, woR, batchesR, sensorsR, checksR] = await Promise.all([
    supabase.from('plants').select('id, name, code, status').eq('org_id', orgId),
    supabase
      .from('work_orders')
      .select('id, status, priority, title, code, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('bird_batches')
      .select('id, code, status, hens_received, roosters_received')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('sensors').select('id, status').eq('org_id', orgId),
    supabase
      .from('machine_checks')
      .select('id, condition, shift_date, machine_id, notes, hour_slot, shift_number, taken_at, taken_by')
      .eq('org_id', orgId)
      .order('taken_at', { ascending: false })
      .limit(200),
  ])

  const plants = rowsOf(plantsR)
  const orders = rowsOf(woR)
  const batches = rowsOf(batchesR)
  const sensors = rowsOf(sensorsR)
  let checksUse = rowsOf(checksR)
  if (checksR.error) {
    const c2 = await supabase
      .from('machine_checks')
      .select('id, condition, shift_date, machine_id, notes, hour_slot')
      .eq('org_id', orgId)
      .limit(200)
    checksUse = rowsOf(c2)
  }

  // Nombres de máquinas para listar alertas legibles
  const machineIds = [...new Set(checksUse.map((c) => c.machine_id).filter(Boolean))]
  let machineNames = {}
  if (machineIds.length) {
    const mR = await supabase.from('machines').select('id, name, code').in('id', machineIds)
    for (const m of mR.data ?? []) {
      machineNames[m.id] = m.name || m.code || m.id.slice(0, 8)
    }
  }

  const realPlants = plants.filter((p) => !isFarmPlant(p))
  const farms = plants.filter(isFarmPlant)
  const openWO = orders.filter((w) => w.status === 'open' || w.status === 'in_progress')
  const criticalWO = openWO.filter((w) => w.priority === 'critical' || w.priority === 'high')
  const activeBatches = batches.filter((b) =>
    ['received', 'levante', 'production'].includes(b.status)
  )
  const activeSensors = sensors.filter((s) => s.status === 'active' || !s.status)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const classified = classifyChecksToday(checksUse, today)
  const alertsChecks = classified.alerts
  const offsToday = classified.offs
  const checksToday = classified.today

  const formatCheckItem = (c) => ({
    id: c.id,
    title: machineNames[c.machine_id] || `Máquina ${String(c.machine_id || '').slice(0, 8) || '—'}`,
    meta: [
      conditionLabel(c.condition),
      c.hour_slot != null ? `H${c.hour_slot}` : null,
      c.shift_number != null ? `T${c.shift_number}` : null,
      c.notes ? String(c.notes).slice(0, 60) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    warn: isRealMachineAlert(c.condition),
  })

  const kpis = [
    { label: 'Plantas', value: realPlants.length, sub: `${farms.length} granja(s)` },
    { label: 'Personal', value: members.length, sub: 'miembros en la org' },
    {
      label: 'OT activas',
      value: openWO.length,
      sub: criticalWO.length ? `${criticalWO.length} prioritaria(s)` : 'sin prioridad alta',
      warn: criticalWO.length > 0,
    },
    {
      label: 'Lotes activos',
      value: activeBatches.length,
      sub: `${batches.length} en total`,
    },
    {
      label: 'Sensores',
      value: activeSensors.length,
      sub: `${sensors.length} configurados`,
    },
    {
      label: 'Checks hoy',
      value: checksToday.length,
      sub: alertsChecks.length
        ? `${alertsChecks.length} alerta(s) real(es)${offsToday.length ? ` · ${offsToday.length} apagada(s)` : ''}`
        : offsToday.length
          ? `${offsToday.length} apagada(s) (no son alerta)`
          : 'sin alertas',
      warn: alertsChecks.length > 0,
    },
  ]

  return {
    loading: false,
    error: null,
    sealed: false,
    kpis,
    health: {
      pending: 0,
      alarms: alertsChecks.length,
      critical: criticalWO.length,
      openWO: openWO.length,
      plants: realPlants.length,
      farms: farms.length,
      members: members.length,
      checksOff: offsToday.length,
    },
    lists: {
      criticalOrders: criticalWO.slice(0, 5).map((w) => ({
        id: w.id,
        title: w.title || w.code || 'OT',
        meta: `${w.priority ?? '—'} · ${w.status}`,
      })),
      activeBatches: activeBatches.slice(0, 5).map((b) => ({
        id: b.id,
        title: b.code || b.id,
        meta: `${b.status} · ${(b.hens_received ?? 0) + (b.roosters_received ?? 0)} aves`,
      })),
      roleBreakdown,
      /** Solo falla/aviso — lo que gerencia debe ver como alerta */
      machineAlerts: alertsChecks.slice(0, 30).map(formatCheckItem),
      /** Apagadas: informativo, no alarma */
      machineOff: offsToday.slice(0, 20).map(formatCheckItem),
    },
    privacyNote: isOmniscient
      ? null
      : `Vista ampliada por grant: ${grantedScopeIds.join(', ') || 'ops'}`,
    updatedAt: new Date().toISOString(),
  }
}

async function loadMantenimiento(orgId) {
  const [woR, machinesR, membersR, evidenceR] = await Promise.all([
    supabase
      .from('work_orders')
      .select(
        'id, code, title, status, priority, type, assigned_to, machine_id, created_at, cost, downtime_minutes'
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('machines').select('id, name, code, status, plant_id, plants!inner(org_id)').eq('plants.org_id', orgId),
    supabase
      .from('organization_members')
      .select('user_id, role, area, profiles ( full_name, email )')
      .eq('org_id', orgId),
    supabase
      .from('wo_evidence')
      .select('id, work_order_id, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Fallback machines si join falla
  let machines = machinesR.data ?? []
  if (machinesR.error) {
    const plants = await supabase.from('plants').select('id').eq('org_id', orgId)
    const plantIds = (plants.data ?? []).map((p) => p.id)
    if (plantIds.length) {
      const m2 = await supabase
        .from('machines')
        .select('id, name, code, status, plant_id')
        .in('plant_id', plantIds)
      machines = m2.data ?? []
    } else {
      machines = []
    }
  }

  const orders = rowsOf(woR)
  const members = rowsOf(membersR)
  const evidence = rowsOf(evidenceR)

  const open = orders.filter((w) => w.status === 'open')
  const inProg = orders.filter((w) => w.status === 'in_progress')
  const done = orders.filter((w) => w.status === 'completed')
  const critical = orders.filter(
    (w) =>
      (w.status === 'open' || w.status === 'in_progress') &&
      (w.priority === 'critical' || w.priority === 'high')
  )
  const unassigned = open.filter((w) => !w.assigned_to)
  const aux = members.filter(
    (m) => m.role === 'maintenance_auxiliary' || (m.role === 'coordinator' && m.area === 'maintenance')
  )
  const downMachines = machines.filter((m) =>
    ['maintenance', 'fault', 'offline', 'down'].includes(String(m.status || '').toLowerCase())
  )
  const costSum = orders.reduce((s, w) => s + (Number(w.cost) || 0), 0)
  const downtimeSum = orders.reduce((s, w) => s + (Number(w.downtime_minutes) || 0), 0)

  const nameOf = (uid) => {
    const m = members.find((x) => x.user_id === uid)
    return m?.profiles?.full_name || m?.profiles?.email || uid?.slice(0, 8) || '—'
  }

  const kpis = [
    {
      label: 'OT abiertas',
      value: open.length,
      sub: `${unassigned.length} sin asignar`,
      warn: unassigned.length > 0,
    },
    {
      label: 'En ejecución',
      value: inProg.length,
      sub: `${critical.length} prioritaria(s)`,
      warn: critical.length > 0,
    },
    { label: 'Completadas', value: done.length, sub: 'en el histórico cargado' },
    {
      label: 'Equipos',
      value: machines.length,
      sub: downMachines.length ? `${downMachines.length} en mant./falla` : 'operativos',
      warn: downMachines.length > 0,
    },
    { label: 'Equipo mant.', value: aux.length, sub: 'coord. + auxiliares' },
    {
      label: 'Evidencias',
      value: evidence.length,
      sub: costSum > 0 ? `costos ~ ${costSum.toLocaleString('es-CO')}` : `${downtimeSum} min downtime`,
    },
  ]

  return {
    loading: false,
    error: null,
    kpis,
    lists: {
      criticalOrders: critical.slice(0, 6).map((w) => ({
        id: w.id,
        title: w.title || w.code || 'OT',
        meta: `${w.priority} · ${w.status}${w.assigned_to ? ` · ${nameOf(w.assigned_to)}` : ' · sin asignar'}`,
      })),
      recentOrders: orders.slice(0, 6).map((w) => ({
        id: w.id,
        title: w.title || w.code || 'OT',
        meta: `${w.status} · ${w.type || '—'}`,
      })),
      team: aux.slice(0, 8).map((m) => ({
        id: m.user_id,
        title: m.profiles?.full_name || m.profiles?.email || m.user_id,
        meta: ROLE_LABEL[m.role] ?? m.role,
      })),
    },
    updatedAt: new Date().toISOString(),
  }
}

async function loadRrhh(orgId) {
  const [membersR, shiftsR, plantsR] = await Promise.all([
    supabase
      .from('organization_members')
      .select('user_id, role, area, job_title, profiles ( full_name, email, phone, is_approved )')
      .eq('org_id', orgId),
    supabase
      .from('shift_assignments')
      .select('id, user_id, plant_id, shift_number, day_of_week')
      .eq('org_id', orgId)
      .limit(500),
    supabase.from('plants').select('id, name, code').eq('org_id', orgId),
  ])

  const members = rowsOf(membersR)
  const shifts = rowsOf(shiftsR)
  const plants = rowsOf(plantsR)

  const byRole = {}
  for (const m of members) {
    const key = m.role || 'sin_rol'
    byRole[key] = (byRole[key] || 0) + 1
  }
  const roleBreakdown = Object.entries(byRole)
    .map(([role, count]) => ({
      role,
      label: ROLE_LABEL[role] ?? role,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const withPhone = members.filter((m) => m.profiles?.phone).length
  const coords = members.filter((m) => m.role === 'coordinator')
  const aux = members.filter((m) => String(m.role || '').includes('auxiliary'))
  const operators = members.filter((m) =>
    ['operator', 'barn_operator', 'reception_operator', 'supervisor'].includes(m.role)
  )
  const usersWithShift = new Set(shifts.map((s) => s.user_id)).size

  const kpis = [
    { label: 'Plantilla', value: members.length, sub: `${plants.length} sede(s)` },
    { label: 'Coordinadores', value: coords.length, sub: 'por área' },
    { label: 'Auxiliares', value: aux.length, sub: 'todos los módulos' },
    { label: 'Operación', value: operators.length, sub: 'sup. + operarios' },
    {
      label: 'Con horario',
      value: usersWithShift,
      sub: `${shifts.length} asignaciones`,
      warn: usersWithShift === 0 && members.length > 0,
    },
    {
      label: 'Con teléfono',
      value: withPhone,
      sub: `${members.length - withPhone} sin contacto`,
    },
  ]

  const people = members
    .map((m) => ({
      id: m.user_id,
      title: m.profiles?.full_name || m.profiles?.email || m.user_id,
      meta: [
        ROLE_LABEL[m.role] ?? m.role,
        m.area && m.role === 'coordinator' ? `área ${m.area}` : null,
        m.job_title || null,
      ]
        .filter(Boolean)
        .join(' · '),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'es'))
    .slice(0, 12)

  return {
    loading: false,
    error: null,
    kpis,
    lists: {
      roleBreakdown,
      people,
      coordinators: coords.slice(0, 8).map((m) => ({
        id: m.user_id,
        title: m.profiles?.full_name || m.profiles?.email || m.user_id,
        meta: m.area ? `Área: ${m.area}` : 'Área general',
      })),
    },
    updatedAt: new Date().toISOString(),
  }
}

async function loadContabilidad(orgId) {
  const ordersR = await supabase
    .from('work_orders')
    .select('id, status, cost, downtime_minutes, completed_at')
    .eq('org_id', orgId)
    .limit(400)
  const list = rowsOf(ordersR)
  const withCost = list.filter((w) => w.cost != null && Number(w.cost) > 0)
  const totalCost = withCost.reduce((s, w) => s + Number(w.cost), 0)
  const downtime = list.reduce((s, w) => s + (Number(w.downtime_minutes) || 0), 0)
  const completed = list.filter((w) => w.status === 'completed')

  // Remisiones / cruce contable + estado Siesa
  let remPending = 0
  let remSiesa = 0
  let remTotal = 0
  const remR = await supabase
    .from('sales_remittances')
    .select('id, status, accounting_exported_at, siesa_synced_at')
    .eq('org_id', orgId)
    .limit(400)
  if (!remR.error) {
    const rems = rowsOf(remR).filter((r) => r.status !== 'cancelled')
    remTotal = rems.length
    remPending = rems.filter((r) => !r.accounting_exported_at).length
    remSiesa = rems.filter((r) => r.siesa_synced_at).length
  } else if (/siesa_|column/i.test(remR.error.message || '')) {
    const rem2 = await supabase
      .from('sales_remittances')
      .select('id, status, accounting_exported_at')
      .eq('org_id', orgId)
      .limit(400)
    const rems = rowsOf(rem2).filter((r) => r.status !== 'cancelled')
    remTotal = rems.length
    remPending = rems.filter((r) => !r.accounting_exported_at).length
  }

  const siesaCfg = getSiesaConfig(orgId)
  const siesaEnabled = !!siesaCfg.enabled
  const queueStats = siesaQueueStats(orgId)

  return {
    loading: false,
    error: null,
    kpis: [
      { label: 'OT con costo', value: withCost.length, sub: `${list.length} OT totales` },
      {
        label: 'Costo acum.',
        value: totalCost > 0 ? totalCost.toLocaleString('es-CO') : '0',
        sub: 'desde OT de mantenimiento',
      },
      {
        label: 'Remisiones',
        value: remTotal,
        sub: remPending ? `${remPending} pendientes Excel/Siesa` : 'al día',
        warn: remPending > 0,
      },
      {
        label: 'Siesa',
        value: siesaEnabled ? remSiesa : '—',
        sub: siesaEnabled
          ? `sync · cola ${queueStats.queued || 0}`
          : 'integración inactiva',
        warn: (queueStats.error || 0) > 0,
      },
      { label: 'Downtime (min)', value: downtime, sub: 'registrado en OT' },
      { label: 'OT cerradas', value: completed.length, sub: 'base para liquidación' },
    ],
    lists: {
      costly: withCost
        .sort((a, b) => Number(b.cost) - Number(a.cost))
        .slice(0, 5)
        .map((w) => ({
          id: w.id,
          title: `OT ${w.id.slice(0, 8)}`,
          meta: `$${Number(w.cost).toLocaleString('es-CO')} · ${w.downtime_minutes ?? 0} min`,
        })),
    },
    updatedAt: new Date().toISOString(),
  }
}

async function loadVentas(orgId) {
  const [loadsR, transfersR, hatchesR] = await Promise.all([
    supabase.from('setter_loads').select('id, created_at').eq('org_id', orgId).limit(100),
    supabase.from('transfers').select('id, lote, transferred_at').eq('org_id', orgId).limit(100),
    supabase
      .from('hatch_events')
      .select('id, status, actual_chicks, females_count, males_count, lote')
      .eq('org_id', orgId)
      .limit(100),
  ])

  const loads = loadsR.data ?? []
  const transfers = transfersR.data ?? []
  const hatches = hatchesR.data ?? []
  const completed = hatches.filter((h) => h.status === 'completed')
  const chicks = completed.reduce((s, h) => s + (Number(h.actual_chicks) || 0), 0)

  return {
    loading: false,
    error: null,
    kpis: [
      { label: 'Cargues', value: loads.length, sub: 'setter_loads' },
      { label: 'Transferencias', value: transfers.length, sub: 'a nacedoras' },
      { label: 'Nacimientos', value: hatches.length, sub: `${completed.length} cerrados` },
      { label: 'Pollitos (reg.)', value: chicks, sub: 'en eventos completados' },
    ],
    lists: {
      recentTransfers: transfers.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.lote || 'Transferencia',
        meta: t.transferred_at
          ? new Date(t.transferred_at).toLocaleDateString('es-CO')
          : '—',
      })),
    },
    updatedAt: new Date().toISOString(),
  }
}

async function loadLogistica(orgId) {
  const [ordersR, membersR] = await Promise.all([
    supabase
      .from('sales_orders')
      .select('id, status, code, qty_females, qty_males')
      .eq('org_id', orgId)
      .limit(300),
    supabase.from('organization_members').select('user_id, role, area').eq('org_id', orgId),
  ])
  const orders = ordersR.error ? [] : ordersR.data ?? []
  const ready = orders.filter((o) => ['confirmed', 'scheduled'].includes(o.status))
  const dispatched = orders.filter((o) => o.status === 'dispatched' || o.status === 'delivered')
  const team = (membersR.data ?? []).filter(
    (m) =>
      m.role === 'logistics_auxiliary' ||
      (m.role === 'coordinator' && (m.area === 'logistics' || m.area === 'sales_logistics'))
  )
  return {
    loading: false,
    error: ordersR.error && !/does not exist|schema cache/i.test(ordersR.error.message)
      ? ordersR.error.message
      : null,
    kpis: [
      { label: 'Listos para remisión', value: ready.length, warn: ready.length > 0 },
      { label: 'Despachados / entregados', value: dispatched.length },
      { label: 'Equipo logística', value: team.length, sub: 'coord. + auxiliares' },
      { label: 'Área', value: 'Separada', sub: 'independiente de ventas' },
    ],
    lists: {
      ready: ready.slice(0, 6).map((o) => ({
        id: o.id,
        title: o.code || 'Pedido',
        meta: o.status,
      })),
    },
    updatedAt: new Date().toISOString(),
  }
}

async function loadSst(orgId) {
  const [woR, checksR, membersR] = await Promise.all([
    supabase
      .from('work_orders')
      .select('id, title, priority, status, type')
      .eq('org_id', orgId)
      .limit(200),
    supabase
      .from('machine_checks')
      .select('id, condition, shift_date')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(150),
    supabase.from('organization_members').select('user_id, role, area').eq('org_id', orgId),
  ])

  const orders = woR.data ?? []
  const checks = checksR.data ?? []
  const critical = orders.filter(
    (w) =>
      (w.status === 'open' || w.status === 'in_progress') &&
      (w.priority === 'critical' || w.priority === 'high')
  )
  const faultChecks = checks.filter((c) => c.condition === 'fault' || c.condition === 'warning')
  const sstTeam = (membersR.data ?? []).filter(
    (m) =>
      m.role === 'sst_auxiliary' ||
      m.role === 'hse_auxiliary' ||
      (m.role === 'coordinator' && (m.area === 'sst' || m.area === 'hse'))
  )

  return {
    loading: false,
    error: null,
    kpis: [
      {
        label: 'OT prioritarias',
        value: critical.length,
        sub: 'riesgo operativo / seguridad',
        warn: critical.length > 0,
      },
      {
        label: 'Checks alerta',
        value: faultChecks.length,
        sub: 'en últimos registros',
        warn: faultChecks.length > 0,
      },
      { label: 'Checks revisados', value: checks.length, sub: 'ventana reciente' },
      { label: 'Equipo SST', value: sstTeam.length, sub: 'coord. + auxiliares SST' },
    ],
    lists: {
      criticalOrders: critical.slice(0, 5).map((w) => ({
        id: w.id,
        title: w.title || 'OT',
        meta: `${w.priority} · ${w.status}`,
      })),
    },
    updatedAt: new Date().toISOString(),
  }
}

async function loadAmbiental(orgId) {
  const membersR = await supabase
    .from('organization_members')
    .select('user_id, role, area')
    .eq('org_id', orgId)
  const plantsR = await supabase.from('plants').select('id, name, code').eq('org_id', orgId)
  const envTeam = (membersR.data ?? []).filter(
    (m) =>
      m.role === 'environmental_auxiliary' ||
      (m.role === 'coordinator' && m.area === 'environmental')
  )
  const plants = plantsR.data ?? []
  return {
    loading: false,
    error: null,
    kpis: [
      { label: 'Equipo ambiental', value: envTeam.length, sub: 'coord. + auxiliares' },
      { label: 'Sedes / plantas', value: plants.length },
      {
        label: 'Foco',
        value: 'Residuos',
        sub: 'emisiones · agua · cumplimiento',
      },
      {
        label: 'Separado de SST',
        value: 'Sí',
        sub: 'gestión ambiental independiente',
      },
    ],
    lists: {
      sites: plants.slice(0, 6).map((p) => ({
        id: p.id,
        title: p.name,
        meta: p.code,
      })),
    },
    updatedAt: new Date().toISOString(),
  }
}

async function loadVeterinaria(orgId) {
  const [membersR, vetR] = await Promise.all([
    supabase.from('organization_members').select('user_id, role, area').eq('org_id', orgId),
    supabase
      .from('veterinary_records')
      .select('id, kind, result_status, recorded_at, title')
      .eq('org_id', orgId)
      .order('recorded_at', { ascending: false })
      .limit(200),
  ])

  const team = (membersR.data ?? []).filter(
    (m) =>
      ['plant_veterinarian', 'vaccination_auxiliary'].includes(m.role) ||
      (m.role === 'coordinator' && ['farm', 'veterinary', 'plant'].includes(m.area))
  )
  const recs = vetR.error ? [] : vetR.data ?? []
  const vac = recs.filter((r) => r.kind === 'vaccination').length
  const wet = recs.filter((r) => r.kind === 'wet_tunnel_lab' || r.kind === 'other_lab').length
  const fert = recs.filter((r) => r.kind === 'fertility').length
  const alerts = recs.filter((r) => r.result_status === 'alert' || r.result_status === 'fail')

  return {
    loading: false,
    error: vetR.error && !/does not exist|schema cache/i.test(vetR.error.message)
      ? vetR.error.message
      : null,
    kpis: [
      { label: 'Equipo sanidad', value: team.length, sub: 'vet. planta · vacunación · granja' },
      { label: 'Vacunaciones reg.', value: vac },
      { label: 'Fertilidad', value: fert },
      {
        label: 'Lab / wet tunnel',
        value: wet,
        warn: alerts.length > 0,
        sub: alerts.length ? `${alerts.length} en alerta` : 'muestras',
      },
    ],
    lists: {
      recent: recs.slice(0, 6).map((r) => ({
        id: r.id,
        title: r.title || r.kind,
        meta: `${r.kind} · ${r.result_status || '—'}`,
      })),
    },
    updatedAt: new Date().toISOString(),
  }
}
