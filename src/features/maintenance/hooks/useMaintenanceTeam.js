/**
 * Equipo de mantenimiento en vivo: técnicos con su sede, sus OT, su último lugar de
 * trabajo y su traslado misional; sedes de la empresa; y las acciones del líder
 * (asignar sede, crear/asignar OT, iniciar una OT propia, reportar lugar).
 * Se actualiza solo con Realtime (team_locations, work_orders, mission_inspections,
 * organization_members) y cada 2 minutos con la pantalla visible. 12-10-2026.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { queryRows, loadWarning } from '../../../lib/queryRows'
import { uniqueChannel } from '../../../lib/realtimeChannel'
import { isMissingTable } from '../../../lib/missingTable'
import { saveWorkOrderWithEvidence } from '../../../lib/workOrderSave'
import { currentStatusByUser, reportLocation } from '../../../lib/teamLocations'

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString()
const WO_FIELDS =
  'id, code, title, description, type, priority, status, machine_id, plant_id, location_type, location_name, assigned_to, created_by, scheduled_for, started_at, completed_at, created_at'

/** ¿Puede asignar sedes y trabajos? (la base vuelve a validar el rango) */
export function canLeadMaintenance(role, area) {
  if (['owner', 'admin', 'management'].includes(role)) return true
  return role === 'coordinator' && ['maintenance', 'plant', 'general', ''].includes(area ?? '')
}

/** ¿Es del equipo de mantenimiento? (auxiliares y líderes de mantenimiento) */
export const isMaintenancePerson = (m) =>
  m.role === 'maintenance_auxiliary' || (m.role === 'coordinator' && m.area === 'maintenance')

async function loadMembers(orgId) {
  const cols = 'user_id, role, area, site_id, profiles ( full_name, email, phone )'
  let res = await queryRows('organization_members', (q) => q.select(cols).eq('org_id', orgId))
  // Servidor sin la columna site_id (migración 20261006 pendiente)
  if (res.error && /site_id/.test(res.error)) {
    res = await queryRows('organization_members', (q) => q.select('user_id, role, area, profiles ( full_name, email, phone )').eq('org_id', orgId))
    return { ...res, noSites: true }
  }
  return res
}

export function useMaintenanceTeam({ orgId, userId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState(null)
  const [missing, setMissing] = useState(false)
  const timer = useRef(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [members, plants, workOrders, locations, trips] = await Promise.all([
      loadMembers(orgId),
      queryRows('plants', (q) => q.select('id, name, code').eq('org_id', orgId).order('name')),
      queryRows('work_orders', (q) =>
        q.select(WO_FIELDS).eq('org_id', orgId).in('status', ['open', 'in_progress']).order('created_at', { ascending: false }).limit(400),
      ),
      queryRows('team_locations', (q) => q.select('*').eq('org_id', orgId).gte('reported_at', hoursAgo(48)).order('reported_at', { ascending: false }).limit(400)),
      queryRows('mission_inspections', (q) =>
        q
          .select('id, user_id, driver_name, plate, vehicle_type, process, origin, destination, optimal, inspected_at')
          .eq('org_id', orgId)
          .gte('inspected_at', hoursAgo(24))
          .order('inspected_at', { ascending: false })
          .limit(200),
      ),
    ])
    const locMissing = Boolean(locations.error && isMissingTable({ message: locations.error.replace(/^team_locations: /, '') }))
    setMissing(locMissing || Boolean(members.noSites))
    const plantIds = plants.data.map((p) => p.id)
    const machines = plantIds.length
      ? await queryRows('machines', (q) => q.select('id, plant_id, code, name, status').in('plant_id', plantIds))
      : { data: [] }
    setData({
      members: members.data,
      plants: plants.data,
      machines: machines.data.filter((m) => m.status !== 'decommissioned'),
      workOrders: workOrders.data,
      locations: locMissing ? [] : locations.data,
      trips: trips.data,
      noSites: Boolean(members.noSites),
    })
    setWarning(
      loadWarning(
        [members, plants, workOrders, locMissing ? {} : locations, trips, machines].map((r) => r.error).filter(Boolean),
        { source: 'equipo de mantenimiento' },
      ),
    )
    setLoading(false)
  }, [orgId])

  const reloadSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 800)
  }, [load])

  useEffect(() => {
    if (!orgId) return undefined
    load()
    const channel = supabase.channel(uniqueChannel(`mto-team:${orgId}`))
    for (const table of ['team_locations', 'work_orders', 'mission_inspections', 'organization_members']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, reloadSoon)
    }
    channel.subscribe()
    const every = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 120_000)
    return () => {
      clearInterval(every)
      clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [orgId, load, reloadSoon])

  const sitesById = useMemo(() => Object.fromEntries((data?.plants || []).map((p) => [p.id, p])), [data])

  const team = useMemo(() => {
    if (!data) return []
    const status = currentStatusByUser({ locations: data.locations, trips: data.trips, workOrders: data.workOrders, sitesById })
    return data.members
      .filter(isMaintenancePerson)
      .map((m) => {
        const mine = data.workOrders.filter((o) => o.assigned_to === m.user_id)
        return {
          id: m.user_id,
          name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre',
          phone: m.profiles?.phone || null,
          role: m.role,
          isLeader: m.role === 'coordinator',
          isMe: m.user_id === userId,
          siteId: m.site_id || null,
          site: sitesById[m.site_id] || null,
          open: mine.filter((o) => o.status === 'open'),
          inProgress: mine.filter((o) => o.status === 'in_progress'),
          now: status.get(m.user_id) || null,
        }
      })
      .sort((a, b) => Number(b.isMe) - Number(a.isMe) || Number(a.isLeader) - Number(b.isLeader) || a.name.localeCompare(b.name, 'es'))
  }, [data, sitesById, userId])

  const unassigned = useMemo(() => (data?.workOrders || []).filter((o) => o.status === 'open' && !o.assigned_to), [data])

  const setMemberSite = useCallback(
    async (memberId, siteId) => {
      const { error } = await supabase.rpc('incubapp_set_member_site', { p_org: orgId, p_user: memberId, p_site: siteId || null })
      if (error) {
        if (/function .* does not exist|Could not find the function/i.test(error.message)) {
          return { error: 'El servidor aún no tiene la migración 20261012_equipo_mantenimiento_traslados.' }
        }
        return { error: error.message }
      }
      await load()
      return { error: null }
    },
    [orgId, load],
  )

  /** Crea una OT (o actividad asignada) en cualquier sede y, si se indica, la asigna. */
  const createAssignedOrder = useCallback(
    async ({ plantId, machineId, title, description, type, priority, scheduledFor, assignedTo, files = [] }) => {
      if (!title || title.trim().length < 3) return { error: 'Escribe qué hay que hacer (mínimo 3 letras).' }
      if (!plantId) return { error: 'Elige la sede.' }
      const res = await saveWorkOrderWithEvidence({
        orgId,
        userId,
        files,
        order: {
          org_id: orgId,
          plant_id: plantId,
          machine_id: machineId || null,
          location_type: 'plant',
          location_name: sitesById[plantId]?.name || null,
          title: title.trim(),
          description: description?.trim() || null,
          type: type || 'preventive',
          priority: priority || 'medium',
          status: 'open',
          assigned_to: assignedTo || null,
          created_by: userId,
          scheduled_for: scheduledFor || null,
        },
      })
      if (!res.error) await load()
      return res
    },
    [orgId, userId, sitesById, load],
  )

  const assignOrder = useCallback(
    async (orderId, memberId) => {
      const { error } = await supabase.from('work_orders').update({ assigned_to: memberId || null }).eq('id', orderId)
      if (!error) await load()
      return { error: error?.message || null }
    },
    [load],
  )

  /** Atender una OT: queda en ejecución y el lugar de trabajo se reporta solo. */
  const startOrder = useCallback(
    async (order) => {
      const patch = { status: 'in_progress', started_at: new Date().toISOString() }
      if (!order.assigned_to) patch.assigned_to = userId
      const { error } = await supabase.from('work_orders').update(patch).eq('id', order.id)
      if (error) return { error: error.message }
      await reportLocation({
        orgId,
        userId,
        status: 'en_sitio',
        siteId: order.plant_id,
        place: order.location_name,
        activity: `${order.code || 'OT'} · ${order.title}`,
        workOrderId: order.id,
      })
      await load()
      return { error: null }
    },
    [orgId, userId, load],
  )

  const report = useCallback(
    async (fields) => {
      const res = await reportLocation({ orgId, userId, ...fields })
      if (!res.error) await load()
      return res
    },
    [orgId, userId, load],
  )

  return {
    ...(data || {}),
    team,
    unassigned,
    sitesById,
    loading,
    warning,
    missing,
    reload: load,
    setMemberSite,
    createAssignedOrder,
    assignOrder,
    startOrder,
    report,
  }
}
