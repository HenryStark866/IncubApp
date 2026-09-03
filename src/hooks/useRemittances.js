/**
 * =============================================================================
 * ARCHIVO: src/hooks/useRemittances.js
 * PROPÓSITO: Hook «useRemittances»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  isMissingOpsTable,
  localInsertRemittance,
  localListRemittances,
  localUpdateRemittance,
} from '../lib/opsLocalStore'
import { isNetworkError } from '../lib/network'
import { enqueueInsert, enqueueUpdate } from '../lib/offlineQueue'

const SELECT_BASE =
  'id, org_id, order_id, customer_id, code, dispatch_date, vehicle, driver_name, qty_females, qty_males, delivery_address, notes, status, created_by, accounting_exported_at, accounting_exported_by, created_at, customers ( id, name, nit, phone, city, contact_name ), sales_orders ( id, code, status, product_type, unit_price )'

const SELECT_SIESA =
  'id, org_id, order_id, customer_id, code, dispatch_date, vehicle, driver_name, qty_females, qty_males, delivery_address, notes, status, created_by, accounting_exported_at, accounting_exported_by, siesa_synced_at, siesa_synced_by, siesa_external_id, created_at, customers ( id, name, nit, phone, city, contact_name ), sales_orders ( id, code, status, product_type, unit_price )'

/**
 * Remisiones de despacho (auxiliar de logística).
 * Se generan desde pedidos confirmados/programados de clientes verificados.
 */
/** Export «useRemittances»: API pública de este módulo. Henry Stark Desarrollador */
export function useRemittances(orgId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    let { data, error: err } = await supabase
      .from('sales_remittances')
      .select(SELECT_SIESA)
      .eq('org_id', orgId)
      .order('dispatch_date', { ascending: false })
      .limit(400)

    // Columnas Siesa opcionales (migración aún no aplicada)
    if (err && /siesa_|column/i.test(err.message || '')) {
      const r2 = await supabase
        .from('sales_remittances')
        .select(SELECT_BASE)
        .eq('org_id', orgId)
        .order('dispatch_date', { ascending: false })
        .limit(400)
      data = r2.data
      err = r2.error
    }

    if (err) {
      if (isMissingOpsTable(err.message)) {
        setLocalMode(true)
        setRows(localListRemittances(orgId))
        setError(null)
      } else {
        setError(err.message)
        setRows([])
      }
    } else {
      setLocalMode(false)
      setRows(data ?? [])
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const createFromOrder = useCallback(
    async ({ order, userId, vehicle, driver_name, notes, dispatch_date }) => {
      if (!orgId || !order) return { error: 'Pedido inválido' }
      if (!['confirmed', 'scheduled', 'dispatched'].includes(order.status) && order.status !== 'confirmed') {
        // allow confirmed and scheduled primarily
      }
      if (!['confirmed', 'scheduled'].includes(order.status)) {
        return { error: 'Solo se remiten pedidos confirmados o programados' }
      }
      const code = `REM-${Date.now().toString(36).toUpperCase()}`
      const row = {
        org_id: orgId,
        order_id: order.id,
        customer_id: order.customer_id,
        code,
        dispatch_date: dispatch_date || new Date().toLocaleDateString('sv-SE'),
        vehicle: vehicle?.trim() || null,
        driver_name: driver_name?.trim() || null,
        qty_females: Number(order.qty_females) || 0,
        qty_males: Number(order.qty_males) || 0,
        delivery_address: order.delivery_address || order.customers?.address || null,
        notes: notes?.trim() || null,
        status: 'dispatched',
        created_by: userId || null,
        created_at: new Date().toISOString(),
        customers: order.customers || null,
        sales_orders: {
          id: order.id,
          code: order.code,
          status: order.status,
          product_type: order.product_type,
          unit_price: order.unit_price,
        },
      }

      if (localMode) {
        localInsertRemittance(row)
        await load()
        return { error: null, local: true, remittance: row }
      }

      const insertRow = { ...row }
      delete insertRow.customers
      delete insertRow.sales_orders
      delete insertRow.created_at

      const { error: err } = await supabase.from('sales_remittances').insert(insertRow)
      if (err) {
        if (isMissingOpsTable(err.message)) {
          setLocalMode(true)
          localInsertRemittance(row)
          await load()
          return { error: null, local: true, remittance: row }
        }
        if (isNetworkError(err.message)) {
          await enqueueInsert('sales_remittances', insertRow)
          return { error: null, offline: true }
        }
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [orgId, load, localMode]
  )

  const markAccountingExported = useCallback(
    async (ids, userId) => {
      if (!ids?.length) return { error: 'Sin remisiones' }
      const patch = {
        accounting_exported_at: new Date().toISOString(),
        accounting_exported_by: userId || null,
        updated_at: new Date().toISOString(),
      }
      if (localMode) {
        for (const id of ids) localUpdateRemittance(id, patch)
        await load()
        return { error: null, local: true }
      }
      const { error: err } = await supabase
        .from('sales_remittances')
        .update(patch)
        .in('id', ids)
      if (err) {
        if (isMissingOpsTable(err.message)) {
          setLocalMode(true)
          for (const id of ids) localUpdateRemittance(id, patch)
          await load()
          return { error: null, local: true }
        }
        if (isNetworkError(err.message)) {
          for (const id of ids) await enqueueUpdate('sales_remittances', id, patch)
          return { error: null, offline: true }
        }
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [load, localMode]
  )

  const updateStatus = useCallback(
    async (id, status) => {
      const patch = { status, updated_at: new Date().toISOString() }
      if (localMode) {
        localUpdateRemittance(id, patch)
        await load()
        return { error: null }
      }
      const { error: err } = await supabase.from('sales_remittances').update(patch).eq('id', id)
      if (err) {
        if (isMissingOpsTable(err.message)) {
          localUpdateRemittance(id, patch)
          setLocalMode(true)
          await load()
          return { error: null }
        }
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [load, localMode]
  )

  const pendingAccounting = rows.filter(
    (r) => r.status !== 'cancelled' && !r.accounting_exported_at
  )
  const pendingSiesa = rows.filter(
    (r) => r.status !== 'cancelled' && !r.siesa_synced_at && !r.accounting_exported_at
  )
  const readyForDispatch = rows.filter((r) => r.status === 'dispatched').length

  return {
    remittances: rows,
    loading,
    error,
    localMode,
    pendingAccounting,
    pendingSiesa,
    readyForDispatch,
    reload: load,
    createFromOrder,
    markAccountingExported,
    updateStatus,
  }
}

/** Export «REMITTANCE_STATUS»: API pública de este módulo. Henry Stark Desarrollador */
export const REMITTANCE_STATUS = {
  draft: 'Borrador',
  dispatched: 'Despachada',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
}
