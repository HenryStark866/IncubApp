/**
 * =============================================================================
 * ARCHIVO: src/hooks/useSalesOrders.js
 * PROPÓSITO: Hook «useSalesOrders»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
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
import {
  isMissingTableError,
  localListOrders,
  localInsertOrder,
  localUpdateOrder,
} from '../lib/salesLocalStore'

const ORDER_SELECT =
  'id, org_id, customer_id, code, product_type, qty_females, qty_males, qty_total, unit_price, status, requested_date, delivery_date, delivery_address, notes, created_by, created_at, customers ( id, name, phone, city, contact_name )'

/** Export «useSalesOrders»: API pública de este módulo. Henry Stark Desarrollador */
export function useSalesOrders(orgId) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('sales_orders')
      .select(ORDER_SELECT)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(300)

    if (err) {
      if (isMissingTableError(err.message)) {
        setLocalMode(true)
        setOrders(localListOrders(orgId))
        setError(null)
        setLoading(false)
        return
      }
      if (/qty_total|column/i.test(err.message)) {
        const r2 = await supabase
          .from('sales_orders')
          .select(
            'id, org_id, customer_id, code, product_type, qty_females, qty_males, unit_price, status, requested_date, delivery_date, delivery_address, notes, created_by, created_at, customers ( id, name, phone, city, contact_name )'
          )
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(300)
        if (r2.error) {
          if (isMissingTableError(r2.error.message)) {
            setLocalMode(true)
            setOrders(localListOrders(orgId))
            setError(null)
          } else {
            setError(r2.error.message)
            setOrders([])
          }
        } else {
          setLocalMode(false)
          setOrders(
            (r2.data ?? []).map((o) => ({
              ...o,
              qty_total: (Number(o.qty_females) || 0) + (Number(o.qty_males) || 0),
            }))
          )
        }
        setLoading(false)
        return
      }
      setError(err.message)
      setOrders([])
    } else {
      setLocalMode(false)
      setOrders(data ?? [])
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const createOrder = useCallback(
    async ({
      customerId,
      qty_females,
      qty_males,
      unit_price,
      notes,
      requested_date,
      delivery_date,
      delivery_address,
      status,
      created_by,
    }) => {
      if (!orgId) return { error: 'Sin organización' }
      if (!customerId) return { error: 'Selecciona un cliente' }
      const f = Number(qty_females) || 0
      const m = Number(qty_males) || 0
      if (f + m <= 0) return { error: 'Indica cantidad de pollitos (hembras y/o machos)' }

      const row = {
        org_id: orgId,
        customer_id: customerId,
        product_type: 'day_old_chicks',
        qty_females: f,
        qty_males: m,
        unit_price: unit_price === '' || unit_price == null ? null : Number(unit_price),
        status: status || 'confirmed',
        notes: notes?.trim() || null,
        requested_date: requested_date || null,
        delivery_date: delivery_date || null,
        delivery_address: delivery_address?.trim() || null,
        created_by: created_by || null,
        code: `PV-${Date.now().toString(36).toUpperCase()}`,
        created_at: new Date().toISOString(),
      }

      if (localMode) {
        localInsertOrder(row)
        await load()
        return { error: null, local: true }
      }

      const { error: err } = await supabase.from('sales_orders').insert(row)
      if (err) {
        if (isMissingTableError(err.message)) {
          setLocalMode(true)
          localInsertOrder(row)
          await load()
          return { error: null, local: true }
        }
        if (isNetworkError(err.message)) {
          await enqueueInsert('sales_orders', row)
          return { error: null, offline: true }
        }
        setError(err.message)
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [orgId, load, localMode]
  )

  const updateStatus = useCallback(
    async (orderId, status, extra = {}) => {
      const patch = { status, updated_at: new Date().toISOString(), ...extra }
      if (localMode) {
        localUpdateOrder(orderId, patch)
        await load()
        return { error: null, local: true }
      }
      const { error: err } = await supabase.from('sales_orders').update(patch).eq('id', orderId)
      if (err) {
        if (isMissingTableError(err.message)) {
          setLocalMode(true)
          localUpdateOrder(orderId, patch)
          await load()
          return { error: null, local: true }
        }
        if (isNetworkError(err.message)) {
          await enqueueUpdate('sales_orders', orderId, patch)
          return { error: null, offline: true }
        }
        setError(err.message)
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [load, localMode]
  )

  const openCount = orders.filter((o) =>
    ['requested', 'confirmed', 'scheduled'].includes(o.status)
  ).length

  return {
    orders,
    loading,
    error,
    localMode,
    openCount,
    reload: load,
    createOrder,
    updateStatus,
  }
}

/** Export «ORDER_STATUS_LABEL»: API pública de este módulo. Henry Stark Desarrollador */
export const ORDER_STATUS_LABEL = {
  requested: 'Solicitado',
  confirmed: 'Confirmado',
  scheduled: 'Programado',
  dispatched: 'Despachado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

/** Export «ORDER_STATUS_NEXT»: API pública de este módulo. Henry Stark Desarrollador */
export const ORDER_STATUS_NEXT = {
  requested: 'confirmed',
  confirmed: 'scheduled',
  scheduled: 'dispatched',
  dispatched: 'delivered',
}
