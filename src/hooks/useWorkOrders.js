/**
 * =============================================================================
 * ARCHIVO: src/hooks/useWorkOrders.js
 * PROPÓSITO: Hook «useWorkOrders»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { enqueueInsert, enqueueUpdate } from '../lib/offlineQueue'
import { isNetworkError } from '../lib/network'
import { uniqueChannel } from '../lib/realtimeChannel'

export const MAINTENANCE_RESPONSIBLE = 'Henry Camilo Taborda Galeano'

function maintenanceFormatFor(order) {
  if (order?.source === 'calibration' || /^calibraci[oó]n/i.test(order?.title || '')) return 'FOMAT08'
  return 'FOMAT01'
}

function completionDocument(order, result = {}) {
  const formatCode = maintenanceFormatFor(order)
  const date = new Date().toLocaleString('es-CO')
  const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${formatCode} ${esc(order.code)}</title><style>body{font-family:Arial,sans-serif;color:#202634;margin:36px}h1{color:#0b1428}table{border-collapse:collapse;width:100%}td{border:1px solid #d9e0e8;padding:8px}td:first-child{font-weight:bold;background:#f3f6fa;width:28%}.stamp{color:#9a4d05;font-weight:bold}</style></head><body><div class="stamp">ANTIOQUEÑA DE INCUBACIÓN S.A.S. · SIG</div><h1>${formatCode} · Registro de actividad de mantenimiento</h1><table><tr><td>Orden</td><td>${esc(order.code || order.id)}</td></tr><tr><td>Actividad</td><td>${esc(order.title)}</td></tr><tr><td>Descripción</td><td>${esc(order.description)}</td></tr><tr><td>Equipo</td><td>${esc(order.machine_id || 'Planta / ubicación general')}</td></tr><tr><td>Responsable de mantenimiento</td><td>${MAINTENANCE_RESPONSIBLE}</td></tr><tr><td>Usuario que reporta/cierra</td><td>${esc(order.assigned_to || order.created_by)}</td></tr><tr><td>Resultado / resolución</td><td>${esc(result.resolution)}</td></tr><tr><td>Parada (minutos)</td><td>${esc(result.downtimeMinutes)}</td></tr><tr><td>Costo</td><td>${esc(result.cost)}</td></tr><tr><td>Fecha de cierre</td><td>${esc(date)}</td></tr></table><p>Registro generado automáticamente al cerrar la OT. La evidencia fotográfica o documental adicional se adjunta a esta misma orden.</p></body></html>`
}

async function saveCompletionEvidence(order, result, userId) {
  if (!order?.org_id || !order?.id || !userId) return { error: 'Datos incompletos para evidencia' }
  const formatCode = maintenanceFormatFor(order)
  const file = new Blob([completionDocument(order, result)], { type: 'application/msword' })
  const path = `${order.org_id}/${order.id}/${Date.now()}-${formatCode}-${order.code || 'OT'}.doc`
  const { error: uploadError } = await supabase.storage.from('wo-evidence').upload(path, file, { contentType: 'application/msword', upsert: false })
  if (uploadError) return { error: uploadError.message }
  const { error: insertError } = await supabase.from('wo_evidence').insert({
    org_id: order.org_id,
    work_order_id: order.id,
    uploaded_by: userId,
    file_path: path,
    file_name: `${formatCode}-${order.code || 'OT'}.doc`,
    file_type: 'document',
    note: `${formatCode} generado automáticamente al cerrar la actividad de mantenimiento`,
  })
  if (insertError) {
    await supabase.storage.from('wo-evidence').remove([path])
    return { error: insertError.message }
  }
  return { error: null }
}

/**
 * Órdenes de trabajo (mantenimiento) de una organización.
 *  - Lectura + Realtime (RLS: miembros aprobados de la org)
 *  - createOrder: cualquier miembro reporta
 *  - updateOrder: admins/owners o el técnico asignado (RLS)
 *  - deleteOrder: solo admins/owners
 *  - Ciclo de vida: open → in_progress → completed/cancelled
 *    (el trigger de BD sincroniza el estado de la máquina automáticamente)
 */
/** Export «useWorkOrders»: API pública de este módulo. Henry Stark Desarrollador */
export function useWorkOrders(orgId, userId) {
  const [orders, setOrders] = useState([])
  const [team, setTeam] = useState([]) // colegas de la org para asignación
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [o, m] = await Promise.all([
      supabase
        .from('work_orders')
        .select('id, org_id, code, title, description, type, priority, status, source, machine_id, room_id, plant_id, location_type, location_name, assigned_to, created_by, scheduled_for, started_at, completed_at, downtime_minutes, cost, resolution, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('organization_members')
        .select('user_id, role, profiles ( id, full_name, email )')
        .eq('org_id', orgId),
    ])
    if (o.error) setError(o.error.message)
    else setOrders(o.data ?? [])
    if (!m.error) {
      setTeam(
        (m.data ?? []).map((row) => ({
          id: row.user_id,
          role: row.role,
          name: row.profiles?.full_name || row.profiles?.email || row.user_id,
        }))
      )
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadAll()

    const channel = supabase.channel(uniqueChannel(`work_orders:${orgId}`))
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'work_orders', filter: `org_id=eq.${orgId}` },
      () => loadAll()
    )
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, loadAll])

  const createOrder = useCallback(
    async ({ plantId, machineId, title, description, type, priority, scheduledFor, assignedTo, locationType, locationName }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)
      const row = {
        org_id: orgId,
        plant_id: locationType === 'plant' ? plantId : null,
        machine_id: locationType === 'plant' ? machineId || null : null,
        location_type: locationType || 'plant',
        location_name: locationType === 'plant' ? null : locationName?.trim() || null,
        title: title.trim(),
        description: description?.trim() || null,
        type: type || 'corrective',
        priority: priority || 'medium',
        assigned_to: assignedTo || null,
        created_by: userId,
        scheduled_for: scheduledFor || null,
      }
      const { error: err } = await supabase.from('work_orders').insert(row)
      if (err) {
        if (isNetworkError(err.message)) {
          await enqueueInsert('work_orders', row)
          return { error: null, offline: true }
        }
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  const updateOrder = useCallback(async (orderId, patch) => {
    setError(null)
    const { error: err } = await supabase.from('work_orders').update(patch).eq('id', orderId)
    if (err) {
      if (isNetworkError(err.message)) {
        await enqueueUpdate('work_orders', orderId, {
          ...patch,
          updated_at: new Date().toISOString(),
        })
        return { error: null, offline: true }
      }
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  // Reporte de incidencia: crea una OT general (sin asignar) y devuelve su id para adjuntar la foto
  const createIncident = useCallback(
    async ({ plantId, machineId, roomId, title, description, priority }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setError(null)
      const { data, error: err } = await supabase
        .from('work_orders')
        .insert({
          org_id: orgId,
          plant_id: plantId || null,
          machine_id: machineId || null,
          room_id: roomId || null,
          location_type: 'plant',
          title: title.trim(),
          description: description?.trim() || null,
          type: 'corrective',
          priority: priority || 'critical',
          source: 'incident',
          assigned_to: null,
          created_by: userId,
        })
        .select('id, code')
        .single()
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      return { error: null, id: data.id, code: data.code }
    },
    [orgId, userId]
  )

  // Un atendedor toma una OT general para trabajarla
  const claimOrder = useCallback(
    (orderId) => updateOrder(orderId, { assigned_to: userId, status: 'in_progress', started_at: new Date().toISOString() }),
    [updateOrder, userId]
  )

  const startOrder = useCallback(
    (orderId) => updateOrder(orderId, { status: 'in_progress', started_at: new Date().toISOString() }),
    [updateOrder]
  )

  /**
   * El tiempo de parada alimenta MTO-01 (disponibilidad), MTO-06 (MTTR) y
   * MTO-07 (MTBF): sin él esos tres indicadores no se pueden calcular. Por eso
   * es obligatorio al cerrar una orden de mantenimiento — si el equipo no paró,
   * se registra 0, que también es un dato.
   */
  const completeOrder = useCallback(
    async (orderId, { resolution, downtimeMinutes, cost }) => {
      const orden = orders.find((o) => o.id === orderId)
      const exigeParo = !orden || orden.type === 'corrective' || orden.type === 'preventive'
      const sinParo = downtimeMinutes === '' || downtimeMinutes == null
      if (exigeParo && sinParo) {
        const msg =
          'Registre el tiempo de parada del equipo en minutos (0 si no hubo parada). ' +
          'Sin este dato no se pueden calcular la disponibilidad, el MTTR ni el MTBF.'
        setError(msg)
        return { error: msg }
      }
      const result = await updateOrder(orderId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        resolution: resolution?.trim() || null,
        downtime_minutes: sinParo ? null : Number(downtimeMinutes),
        cost: cost === '' || cost == null ? null : Number(cost),
      })
      if (result.error) return result
      const evidence = await saveCompletionEvidence(orden, { resolution, downtimeMinutes, cost }, userId)
      return evidence.error ? { ...result, evidenceError: evidence.error } : result
    },
    [updateOrder, orders, userId]
  )

  const cancelOrder = useCallback(
    (orderId) => updateOrder(orderId, { status: 'cancelled', completed_at: new Date().toISOString() }),
    [updateOrder]
  )

  const deleteOrder = useCallback(async (orderId) => {
    const { error: err } = await supabase.from('work_orders').delete().eq('id', orderId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  return {
    orders, team, loading, error, reload: loadAll,
    createOrder, createIncident, claimOrder, updateOrder, startOrder, completeOrder, cancelOrder, deleteOrder,
  }
}
