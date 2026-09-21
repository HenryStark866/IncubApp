/**
 * =============================================================================
 * ARCHIVO: src/hooks/useTodayBoard.js
 * PROPÓSITO: Hook «useTodayBoard»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { currentSlot } from './useMachineChecks'
import { isMissingTableError } from '../lib/salesLocalStore'
import { localListCustomers, localListOrders } from '../lib/salesLocalStore'
import { ROLE_LABEL } from '../lib/roles'

/**
 * Datos del tablero «Hoy» según rol.
 * Solo carga lo necesario para la experiencia de entrada de cada perfil.
 */
/** Export «useTodayBoard»: API pública de este módulo. Henry Stark Desarrollador */
export function useTodayBoard({
  orgId,
  userId,
  role,
  area,
  grantedScopeIds = [],
  isOmniscient = false,
}) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    title: 'Hoy',
    subtitle: '',
    kpis: [],
    alerts: [],
    actions: [],
    lines: [],
    updatedAt: null,
  })

  const load = useCallback(async () => {
    if (!orgId) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const board = await buildBoard({
        orgId,
        userId,
        role,
        area,
        grantedScopeIds,
        isOmniscient,
      })
      setState({ ...board, loading: false, error: null, updatedAt: new Date().toISOString() })
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e.message || String(e),
      }))
    }
  }, [orgId, userId, role, area, isOmniscient, grantedScopeIds.join('|')])

  useEffect(() => {
    load()
    const onOnline = () => load()
    window.addEventListener('online', onOnline)
    window.addEventListener('incubapp:queue-changed', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('incubapp:queue-changed', onOnline)
    }
  }, [load])

  return { ...state, reload: load }
}

async function buildBoard({
  orgId,
  userId,
  role,
  area,
  grantedScopeIds = [],
  isOmniscient = false,
}) {
  const roleName = ROLE_LABEL[role] ?? role
  const family = roleFamily(role, area)
  const privacy = { grantedScopeIds, isOmniscient }

  if (family === 'sales' || family === 'customer' || family === 'logistics') {
    return boardSales({ orgId, userId, role, roleName, family })
  }
  if (family === 'maintenance') {
    return boardMaintenance({ orgId, userId, roleName })
  }
  if (family === 'operator') {
    return boardOperator({ orgId, userId, roleName })
  }
  if (family === 'driver') {
    return boardDriver({ orgId, userId, roleName })
  }
  if (family === 'hr') {
    return boardHr({ orgId, roleName })
  }
  if (family === 'sst') {
    return {
      title: 'Hoy · SST',
      subtitle: `${roleName} · seguridad y salud (independiente de ambiental)`,
      kpis: [
        { label: 'Foco', value: 'EPP', sub: 'inspecciones · incidentes' },
        { label: 'Módulo', value: 'SST', sub: 'coord. + auxiliares' },
      ],
      alerts: [],
      actions: [
        { tab: 'sst', label: 'Módulo SST' },
        { tab: 'inventarios', label: 'Dotación / EPP' },
      ],
      lines: [],
    }
  }
  if (family === 'environmental') {
    return {
      title: 'Hoy · Gestión ambiental',
      subtitle: `${roleName} · residuos, emisiones y cumplimiento`,
      kpis: [
        { label: 'Foco', value: 'Ambiente', sub: 'separado de SST' },
        { label: 'Equipo', value: 'Coord. + aux.', sub: 'uno o varios auxiliares' },
      ],
      alerts: [],
      actions: [
        { tab: 'ambiental', label: 'Gestión ambiental' },
      ],
      lines: [],
    }
  }
  if (family === 'veterinary') {
    return {
      title: 'Hoy · Sanidad veterinaria',
      subtitle: `${roleName} · vacunas, medicina, fertilidad, wet tunnels`,
      kpis: [
        { label: 'Vacunas', value: '—', sub: 'ver módulo Sanidad' },
        { label: 'Lab / wet tunnel', value: '—', sub: 'muestras de ambiente' },
      ],
      alerts: [],
      actions: [
        { tab: 'veterinaria', label: 'Sanidad veterinaria' },
      ],
      lines: [],
    }
  }
  if (family === 'management' || family === 'owner') {
    return boardManagement({ orgId, roleName, privacy, role })
  }
  if (family === 'supervisor' || family === 'plant_coord') {
    return boardOpsLead({ orgId, userId, roleName, family })
  }
  if (family === 'barn') {
    return boardBarn({ orgId, userId, roleName })
  }
  if (family === 'reception') {
    return boardReception({ orgId, roleName })
  }
  // genérico
  return boardManagement({ orgId, roleName })
}

function roleFamily(role, area) {
  if (role === 'customer') return 'customer'
  if (
    role === 'sales_logistics_auxiliary' ||
    role === 'accounting_auxiliary' ||
    (role === 'coordinator' && ['sales', 'sales_logistics', 'accounting'].includes(area))
  ) {
    return 'sales'
  }
  if (
    role === 'logistics_auxiliary' ||
    (role === 'coordinator' && area === 'logistics')
  ) {
    return 'logistics'
  }
  if (
    role === 'maintenance_auxiliary' ||
    (role === 'coordinator' && area === 'maintenance')
  ) {
    return 'maintenance'
  }
  if (role === 'hr_auxiliary' || (role === 'coordinator' && area === 'hr')) return 'hr'
  if (role === 'management' || role === 'management_auxiliary') return 'management'
  if (role === 'owner' || role === 'admin') return 'owner'
  if (role === 'supervisor') return 'supervisor'
  if (role === 'coordinator' && (area === 'plant' || area === 'general' || !area)) {
    return 'plant_coord'
  }
  if (role === 'coordinator' && area === 'farm') return 'plant_coord'
  if (['operator', 'auxiliary', 'auxiliary_production'].includes(role)) return 'operator'
  if (role === 'driver') return 'driver'
  if (role === 'barn_operator') return 'barn'
  if (role === 'reception_operator') return 'reception'
  if (
    role === 'sst_auxiliary' ||
    role === 'hse_auxiliary' ||
    (role === 'coordinator' && (area === 'sst' || area === 'hse'))
  ) {
    return 'sst'
  }
  if (
    role === 'environmental_auxiliary' ||
    (role === 'coordinator' && area === 'environmental')
  ) {
    return 'environmental'
  }
  if (
    role === 'plant_veterinarian' ||
    role === 'vaccination_auxiliary' ||
    (role === 'coordinator' && ['farm', 'veterinary'].includes(area))
  ) {
    return 'veterinary'
  }
  if (role === 'accounting_auxiliary' || (role === 'coordinator' && area === 'accounting')) {
    return 'management'
  }
  return 'owner'
}

async function safeSelect(table, build) {
  let q = supabase.from(table)
  q = build(q)
  const { data, error } = await q
  if (error) {
    if (isMissingTableError(error.message)) return { data: [], missing: true }
    return { data: [], error }
  }
  return { data: data ?? [] }
}

async function boardManagement({ orgId, roleName, privacy = {}, role = null }) {
  const { grantedScopeIds = [], isOmniscient = false } = privacy
  // El gerente (management) monitorea toda su empresa sin pedir grants
  const canOps =
    isOmniscient ||
    role === 'management' ||
    grantedScopeIds.includes('plant') ||
    grantedScopeIds.includes('maintenance') ||
    grantedScopeIds.includes('farm')

  const members = await safeSelect('organization_members', (q) =>
    q.select('user_id, role').eq('org_id', orgId)
  )

  if (!canOps) {
    return {
      title: 'Hoy · Dirección (módulo hermético)',
      subtitle: `${roleName} · solo tu módulo de gerencia. Otros datos requieren acceso temporal.`,
      kpis: [
        { label: 'Personal (conteo)', value: members.data.length },
        { label: 'Operación', value: '🔒', sub: 'Sellada', warn: true },
        { label: 'OT / lotes', value: '🔒', sub: 'Pide acceso', warn: true },
      ],
      alerts: [
        {
          text: 'Los módulos de planta, granja y mantenimiento están sellados. Solicita autorización al responsable del módulo.',
          warn: true,
        },
      ],
      actions: [
        { tab: 'gerencia', label: 'Gerencia' },
        { tab: 'perfil', label: 'Perfil' },
      ],
      lines: [],
    }
  }

  const [plants, wo, batches, checks] = await Promise.all([
    safeSelect('plants', (q) => q.select('id, name, code').eq('org_id', orgId)),
    safeSelect('work_orders', (q) =>
      q
        .select('id, status, priority, title')
        .eq('org_id', orgId)
        .in('status', ['open', 'in_progress'])
        .limit(100)
    ),
    safeSelect('bird_batches', (q) =>
      q.select('id, status, code').eq('org_id', orgId).limit(80)
    ),
    safeSelect('machine_checks', (q) =>
      q
        .select('id, condition, shift_date')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(80)
    ),
  ])

  const openWO = wo.data
  const critical = openWO.filter((w) => w.priority === 'critical' || w.priority === 'high')
  const activeBatches = (batches.data || []).filter((b) =>
    ['received', 'levante', 'production'].includes(b.status)
  )
  const today = new Date().toISOString().slice(0, 10)
  const checksToday = (checks.data || []).filter((c) =>
    String(c.shift_date || '').startsWith(today)
  )
  // Solo warning/fault = alerta real. "off" = apagada a propósito (no cuenta como alerta).
  const alertChecks = checksToday.filter(
    (c) => c.condition === 'warning' || c.condition === 'fault'
  )
  const offChecks = checksToday.filter((c) => c.condition === 'off')

  const alerts = []
  if (critical.length) {
    alerts.push({
      text: `${critical.length} orden${critical.length === 1 ? '' : 'es'} de trabajo prioritaria${critical.length === 1 ? '' : 's'}`,
      tab: 'mantenimiento',
      warn: true,
    })
  }
  if (alertChecks.length) {
    alerts.push({
      text: `${alertChecks.length} check${alertChecks.length === 1 ? '' : 's'} con falla/aviso hoy (no incluye apagadas)`,
      tab: 'supervision',
      warn: true,
    })
  }
  if (offChecks.length && !alertChecks.length) {
    alerts.push({
      text: `${offChecks.length} máquina(s) marcada(s) apagada(s) hoy · informativo`,
      tab: 'supervision',
      warn: false,
    })
  }

  return {
    title: 'Hoy · Dirección',
    subtitle: `${roleName} · panorama con grants activos / vista ampliada`,
    kpis: [
      { label: 'Plantas / sedes', value: plants.data.length },
      { label: 'Personal', value: members.data.length },
      {
        label: 'OT activas',
        value: openWO.length,
        sub: critical.length ? `${critical.length} prioritarias` : 'sin prioridad alta',
        warn: critical.length > 0,
      },
      { label: 'Lotes activos', value: activeBatches.length },
      {
        label: 'Checks hoy',
        value: checksToday.length,
        sub: alertChecks.length
          ? `${alertChecks.length} alerta(s)${offChecks.length ? ` · ${offChecks.length} apagada(s)` : ''}`
          : offChecks.length
            ? `${offChecks.length} apagada(s) (no alerta)`
            : 'sin alertas',
        warn: alertChecks.length > 0,
      },
    ],
    alerts,
    actions: [
      { tab: 'gerencia', label: 'Gerencia' },
      { tab: 'panel', label: 'Panel planta' },
      { tab: 'mantenimiento', label: 'Órdenes OT' },
    ],
    lines: critical.slice(0, 4).map((w) => ({
      title: w.title || 'OT',
      meta: `${w.priority} · ${w.status}`,
    })),
  }
}

async function boardOpsLead({ orgId, userId, roleName, family }) {
  const slot = currentSlot()
  const [acts, wo, checks] = await Promise.all([
    safeSelect('shift_activities', (q) =>
      q
        .select('id, title, status, assigned_to')
        .eq('org_id', orgId)
        .in('status', ['pending', 'in_progress'])
        .limit(80)
    ),
    safeSelect('work_orders', (q) =>
      q
        .select('id, title, status, priority')
        .eq('org_id', orgId)
        .in('status', ['open', 'in_progress'])
        .limit(50)
    ),
    safeSelect('machine_checks', (q) =>
      q
        .select('id, machine_id, condition')
        .eq('org_id', orgId)
        .eq('shift_date', slot.shiftDate)
        .eq('hour_slot', slot.hour)
        .limit(100)
    ),
  ])

  const mine = (acts.data || []).filter((a) => a.assigned_to === userId)
  const pendingActs = (acts.data || []).filter((a) => a.status === 'pending')
  const critical = (wo.data || []).filter(
    (w) => w.priority === 'critical' || w.priority === 'high'
  )

  return {
    title: family === 'supervisor' ? 'Hoy · Supervisión de planta' : 'Hoy · Coordinación',
    subtitle: `${roleName} · turno ${slot.shift} · hora ${String(slot.hour).padStart(2, '0')}:00`,
    kpis: [
      { label: 'Actividades abiertas', value: acts.data.length },
      { label: 'Pendientes de iniciar', value: pendingActs.length, warn: pendingActs.length > 0 },
      { label: 'Asignadas a mí', value: mine.length },
      {
        label: 'Checks esta hora',
        value: checks.data.length,
        sub: `T${slot.shift}`,
      },
      {
        label: 'OT prioritarias',
        value: critical.length,
        warn: critical.length > 0,
      },
    ],
    alerts: critical.slice(0, 3).map((w) => ({
      text: w.title || 'OT prioritaria',
      tab: 'mantenimiento',
      warn: true,
    })),
    actions: [
      { tab: 'panel', label: 'Panel operativo' },
      { tab: 'supervision', label: 'Supervisión' },
      { tab: 'mantenimiento', label: 'Órdenes OT' },
      { tab: 'horarios', label: 'Horarios' },
    ],
    lines: (acts.data || []).slice(0, 5).map((a) => ({
      title: a.title || 'Actividad',
      meta: a.status,
    })),
  }
}

async function boardOperator({ orgId, userId, roleName }) {
  const slot = currentSlot()
  // Semana en curso: base del comparativo rápido contra los 7 días previos
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  const [acts, checks, doneActs] = await Promise.all([
    safeSelect('shift_activities', (q) =>
      q
        .select('id, title, status, assigned_to')
        .eq('org_id', orgId)
        .eq('assigned_to', userId)
        .in('status', ['pending', 'in_progress'])
        .limit(40)
    ),
    safeSelect('machine_checks', (q) =>
      q
        .select('id')
        .eq('org_id', orgId)
        .eq('taken_by', userId)
        .eq('shift_date', slot.shiftDate)
        .limit(50)
    ),
    safeSelect('shift_activities', (q) =>
      q
        .select('id, completed_at')
        .eq('org_id', orgId)
        .eq('assigned_to', userId)
        .eq('status', 'completed')
        .gte('completed_at', twoWeeksAgo)
        .limit(300)
    ),
  ])

  const pending = (acts.data || []).filter((a) => a.status === 'pending')
  const doing = (acts.data || []).filter((a) => a.status === 'in_progress')

  // Comparativo 7 días vs. 7 días anteriores (el detalle completo vive en «Mi historial»)
  const thisWeek = (doneActs.data || []).filter((a) => a.completed_at >= weekAgo).length
  const lastWeek = (doneActs.data || []).filter(
    (a) => a.completed_at < weekAgo && a.completed_at >= twoWeeksAgo
  ).length
  const trend = thisWeek - lastWeek

  return {
    title: 'Hoy · Mi turno',
    subtitle: `${roleName} · T${slot.shift} · ${slot.shiftDate}`,
    kpis: [
      { label: 'Mis tareas', value: acts.data.length },
      { label: 'Por iniciar', value: pending.length, warn: pending.length > 0 },
      { label: 'En curso', value: doing.length },
      { label: 'Rondas que registré hoy', value: checks.data.length },
      {
        label: 'Cerradas esta semana',
        value: thisWeek,
        sub:
          trend === 0
            ? `igual que la semana pasada (${lastWeek})`
            : `${trend > 0 ? '+' : ''}${trend} vs. semana pasada (${lastWeek})`,
      },
    ],
    alerts:
      pending.length > 0
        ? [{ text: `Tiene ${pending.length} actividad(es) por iniciar`, tab: 'supervision', warn: true }]
        : [],
    actions: [
      { tab: 'supervision', label: 'Mis actividades' },
      { tab: 'cargue', label: 'Órdenes de cargue' },
      { tab: 'monitoreo', label: 'Monitoreo' },
      { tab: 'horarios', label: 'Mis horarios' },
      { tab: 'historial', label: 'Mi historial' },
    ],
    lines: (acts.data || []).slice(0, 6).map((a) => ({
      title: a.title || 'Tarea',
      meta: a.status === 'pending' ? 'Pendiente' : 'En curso',
    })),
  }
}

async function boardDriver({ orgId, userId, roleName }) {
  const today = new Date().toLocaleDateString('sv-SE')
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString('sv-SE')
  const preop = await safeSelect('vehicle_preop_reports', (q) =>
    q
      .select('id, inspection_date, compliant, vehicle_plate, status')
      .eq('org_id', orgId)
      .eq('driver_user_id', userId)
      .gte('inspection_date', weekAgo)
      .order('inspection_date', { ascending: false })
      .limit(30)
  )
  const todayRep = (preop.data || []).filter((r) => r.inspection_date === today)
  const issues = (preop.data || []).filter((r) => r.compliant === false)

  return {
    title: 'Hoy · Conductor',
    subtitle: `${roleName} · preoperacional FOSST22 antes de salir`,
    kpis: [
      {
        label: 'Preoperacional de hoy',
        value: todayRep.length ? '✓ Hecho' : 'Pendiente',
        warn: !todayRep.length,
      },
      { label: 'Inspecciones esta semana', value: preop.data.length },
      { label: 'Con novedad', value: issues.length, warn: issues.length > 0 },
    ],
    alerts: !todayRep.length
      ? [
        {
          text: 'Realice la inspección preoperacional antes de usar el vehículo (los 5 minutos de vida).',
          tab: 'preoperacional',
          warn: true,
        },
      ]
      : [],
    actions: [
      { tab: 'preoperacional', label: 'Preoperacional FOSST22' },
      { tab: 'historial', label: 'Mi historial' },
      { tab: 'misionales', label: 'Desplazamientos' },
      { tab: 'asistencia', label: 'Asistencia' },
    ],
    lines: (preop.data || []).slice(0, 5).map((r) => ({
      title: `${r.vehicle_plate} · ${r.inspection_date}`,
      meta: r.compliant ? 'Cumple' : 'Con novedad',
    })),
  }
}

async function boardMaintenance({ orgId, userId, roleName }) {
  const wo = await safeSelect('work_orders', (q) =>
    q
      .select('id, title, status, priority, assigned_to')
      .eq('org_id', orgId)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(80)
  )
  const open = wo.data || []
  const mine = open.filter((w) => w.assigned_to === userId)
  const unassigned = open.filter((w) => !w.assigned_to)
  const critical = open.filter((w) => w.priority === 'critical' || w.priority === 'high')

  return {
    title: 'Hoy · Mantenimiento',
    subtitle: `${roleName} · órdenes y prioridades`,
    kpis: [
      { label: 'OT abiertas', value: open.filter((w) => w.status === 'open').length },
      { label: 'En ejecución', value: open.filter((w) => w.status === 'in_progress').length },
      { label: 'Asignadas a mí', value: mine.length },
      {
        label: 'Sin asignar',
        value: unassigned.length,
        warn: unassigned.length > 0,
      },
      { label: 'Prioritarias', value: critical.length, warn: critical.length > 0 },
    ],
    alerts: critical.slice(0, 4).map((w) => ({
      text: w.title || 'OT prioritaria',
      tab: 'mantenimiento',
      warn: true,
    })),
    actions: [
      { tab: 'mantenimiento', label: 'Órdenes OT' },
      { tab: 'coord_mantenimiento', label: 'Coord. mantenimiento' },
      { tab: 'plantas', label: 'Plantas' },
    ],
    lines: open.slice(0, 6).map((w) => ({
      title: w.title || 'OT',
      meta: `${w.priority || '—'} · ${w.status}`,
    })),
  }
}

async function boardSales({ orgId, role, roleName, family }) {
  let customers = []
  let orders = []
  let local = false

  const cRes = await safeSelect('customers', (q) =>
    q.select('id, name, status, buys_day_old_chicks, product_interest').eq('org_id', orgId).limit(500)
  )
  if (cRes.missing) {
    local = true
    customers = localListCustomers(orgId)
    orders = localListOrders(orgId)
  } else {
    customers = cRes.data || []
    const oRes = await safeSelect('sales_orders', (q) =>
      q
        .select('id, status, qty_females, qty_males, customer_id, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100)
    )
    if (oRes.missing) {
      local = true
      orders = localListOrders(orgId)
    } else {
      orders = oRes.data || []
    }
  }

  const dayOld = customers.filter(
    (c) =>
      c.buys_day_old_chicks &&
      ['prospect', 'active'].includes(c.status) &&
      (c.product_interest === 'day_old_chicks' || c.product_interest === 'both' || !c.product_interest)
  )
  const openOrders = orders.filter((o) =>
    ['requested', 'confirmed', 'scheduled'].includes(o.status)
  )
  const requested = orders.filter((o) => o.status === 'requested')

  if (family === 'customer') {
    return {
      title: 'Hoy · Mis pedidos',
      subtitle: `${roleName}`,
      kpis: [
        { label: 'Pedidos en curso', value: openOrders.length },
        { label: 'Solicitudes nuevas', value: requested.length },
      ],
      alerts: [],
      actions: [{ tab: 'ventas', label: 'Portal de pedidos' }, { tab: 'perfil', label: 'Perfil' }],
      lines: orders.slice(0, 5).map((o) => ({
        title: `Pedido ${o.code || o.id?.slice?.(0, 8) || ''}`,
        meta: o.status,
      })),
    }
  }

  const verified = customers.filter((c) => c.status === 'active').length
  const readyRemit = orders.filter((o) => ['confirmed', 'scheduled'].includes(o.status)).length
  const isLogistics = role === 'logistics_auxiliary' || family === 'logistics'
  const isAccounting = role === 'accounting_auxiliary'
  const isSalesAux = role === 'sales_logistics_auxiliary'
  const title = isLogistics
    ? 'Hoy · Logística'
    : isAccounting
      ? 'Hoy · Contabilidad / Siesa'
      : isSalesAux
        ? 'Hoy · Ventas'
        : 'Hoy · Ventas'
  return {
    title,
    subtitle: `${roleName}${local ? ' · datos en este dispositivo' : ''}${isLogistics ? ' · área separada de ventas' : ' · área separada de logística'
      }`,
    kpis: [
      { label: 'Clientes verificados', value: verified },
      {
        label: 'Potenciales pollito 1 día',
        value: dayOld.length,
        warn: dayOld.length === 0 && customers.length > 0,
      },
      { label: 'Listos para remisión', value: readyRemit, warn: readyRemit > 0 },
      { label: 'Por confirmar', value: requested.length, warn: requested.length > 0 },
    ],
    alerts: [
      ...(!isLogistics
        ? requested.slice(0, 2).map(() => ({
          text: 'Pedido pendiente de confirmación (ventas)',
          tab: 'ventas',
          warn: true,
        }))
        : []),
      ...(readyRemit > 0
        ? [
          {
            text: `${readyRemit} pedido(s) listos para remisión`,
            tab: isLogistics ? 'logistica' : 'ventas',
            warn: true,
          },
        ]
        : []),
    ],
    actions: isLogistics
      ? [
        { tab: 'logistica', label: 'Remisiones / despacho' },
        { tab: 'ventas', label: 'Ver pedidos (ventas)' },
        { tab: 'inventarios', label: 'Mi inventario' },
        { tab: 'cargue', label: 'Cargue' },
      ]
      : [
        {
          tab: isAccounting ? 'contabilidad' : 'ventas',
          label: isAccounting ? 'Siesa / contabilidad' : 'Pedidos y clientes',
        },
        { tab: 'ventas', label: isAccounting ? 'Cruce ventas' : 'Ventas' },
        { tab: 'logistica', label: 'Logística' },
        { tab: 'inventarios', label: 'Inventarios' },
      ],
    lines: openOrders.slice(0, 5).map((o) => ({
      title: o.customers?.name || `Pedido ${o.code || ''}`.trim() || 'Pedido',
      meta: o.status,
    })),
  }
}

async function boardHr({ orgId, roleName }) {
  const members = await safeSelect('organization_members', (q) =>
    q.select('user_id, role, area').eq('org_id', orgId)
  )
  const shifts = await safeSelect('shift_assignments', (q) =>
    q.select('id, user_id').eq('org_id', orgId).limit(300)
  )
  const withShift = new Set((shifts.data || []).map((s) => s.user_id)).size
  const coords = (members.data || []).filter((m) => m.role === 'coordinator').length
  const aux = (members.data || []).filter((m) => String(m.role || '').includes('auxiliary')).length

  return {
    title: 'Hoy · Recursos humanos',
    subtitle: `${roleName} · plantilla y cobertura`,
    kpis: [
      { label: 'Personas en la org', value: members.data.length },
      { label: 'Coordinadores', value: coords },
      { label: 'Auxiliares', value: aux },
      {
        label: 'Con horario cargado',
        value: withShift,
        warn: withShift === 0 && members.data.length > 0,
      },
    ],
    alerts:
      withShift === 0 && members.data.length > 0
        ? [{ text: 'Aún no hay asignaciones de turno registradas', tab: 'horarios', warn: true }]
        : [],
    actions: [
      { tab: 'rrhh', label: 'Módulo RR. HH.' },
      { tab: 'horarios', label: 'Horarios' },
    ],
    lines: [],
  }
}

async function boardBarn({ orgId, roleName }) {
  const reports = await safeSelect('egg_reports', (q) =>
    q
      .select('id, report_date, status')
      .eq('org_id', orgId)
      .order('report_date', { ascending: false })
      .limit(30)
  )
  const today = new Date().toISOString().slice(0, 10)
  const todayRep = (reports.data || []).filter((r) => String(r.report_date).startsWith(today))

  return {
    title: 'Hoy · Producción de huevo',
    subtitle: `${roleName}`,
    kpis: [
      { label: 'Reportes hoy', value: todayRep.length },
      { label: 'Reportes recientes', value: reports.data.length },
    ],
    alerts:
      todayRep.length === 0
        ? [{ text: 'Aún no hay reporte de huevo registrado hoy', tab: 'huevos', warn: true }]
        : [],
    actions: [
      { tab: 'huevos', label: 'Registrar huevos' },
      { tab: 'produccion', label: 'Producción' },
      { tab: 'historial', label: 'Mi historial' },
    ],
    lines: (reports.data || []).slice(0, 4).map((r) => ({
      title: `Reporte ${r.report_date || ''}`,
      meta: r.status || '',
    })),
  }
}

async function boardReception({ orgId, roleName }) {
  const cold = await safeSelect('cold_room_stock', (q) =>
    q.select('id').eq('org_id', orgId).limit(50)
  )
  return {
    title: 'Hoy · Recepción',
    subtitle: `${roleName}`,
    kpis: [
      {
        label: 'Registros cuarto frío',
        value: cold.missing ? '—' : cold.data.length,
        sub: cold.missing ? 'módulo según disponibilidad' : 'en consulta',
      },
    ],
    alerts: [],
    actions: [
      { tab: 'recepcion', label: 'Recepción y cuarto frío' },
      { tab: 'cargue', label: 'Órdenes de cargue' },
      { tab: 'historial', label: 'Mi historial' },
    ],
    lines: [],
  }
}
