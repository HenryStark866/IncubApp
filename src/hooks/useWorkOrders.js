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
        .select('id, code, title, description, type, priority, status, source, machine_id, room_id, plant_id, location_type, location_name, assigned_to, created_by, scheduled_for, started_at, completed_at, downtime_minutes, cost, resolution, created_at')
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

    const channel = supabase
      .channel(`work_orders:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders', filter: `org_id=eq.${orgId}` },
        () => loadAll()
      )
      .subscribe()

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

  const completeOrder = useCallback(
    (orderId, { resolution, downtimeMinutes, cost }) =>
      updateOrder(orderId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        resolution: resolution?.trim() || null,
        downtime_minutes: downtimeMinutes === '' || downtimeMinutes == null ? null : Number(downtimeMinutes),
        cost: cost === '' || cost == null ? null : Number(cost),
      }),
    [updateOrder]
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
