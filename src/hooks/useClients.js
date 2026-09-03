/**
 * =============================================================================
 * ARCHIVO: src/hooks/useClients.js
 * PROPÓSITO: Hook «useClients»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { enqueueInsert, enqueueUpdate } from '../lib/offlineQueue'
import { isNetworkError } from '../lib/network'
import {
  isMissingTableError,
  localListCustomers,
  localSaveCustomer,
  localDeleteCustomer,
  localBulkUpsertCustomers,
  localInsertOrder,
} from '../lib/salesLocalStore'

/**
 * CRM de clientes. Si Supabase no tiene la tabla `customers`, usa almacenamiento
 * local del dispositivo si el esquema en servidor aún no está publicado.
 */
/** Export «useClients»: API pública de este módulo. Henry Stark Desarrollador */
export function useClients(orgId) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('customers')
      .select(
        'id, org_id, user_id, code, name, contact_name, email, phone, city, department, address, website, nit, status, product_interest, buys_day_old_chicks, farm_type, capacity_birds, notes, last_order_at, created_at, updated_at'
      )
      .eq('org_id', orgId)
      .order('name', { ascending: true })

    if (err) {
      if (isMissingTableError(err.message)) {
        setLocalMode(true)
        setClients(localListCustomers(orgId))
        setError(null)
      } else {
        setLocalMode(false)
        setError(err.message)
        setClients([])
      }
    } else {
      setLocalMode(false)
      setClients(data ?? [])
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    let list = clients
    if (filter === 'day_old') {
      list = list.filter(
        (c) =>
          c.buys_day_old_chicks &&
          ['prospect', 'active'].includes(c.status) &&
          (c.product_interest === 'day_old_chicks' || c.product_interest === 'both')
      )
    } else if (filter === 'prospect') {
      list = list.filter((c) => c.status === 'prospect')
    } else if (filter === 'active') {
      list = list.filter((c) => c.status === 'active')
    }
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => {
      const hay = [
        c.name,
        c.contact_name,
        c.email,
        c.phone,
        c.city,
        c.department,
        c.code,
        c.nit,
        c.website,
        c.farm_type,
        c.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [clients, filter, query])

  const stats = useMemo(() => {
    const dayOld = clients.filter(
      (c) =>
        c.buys_day_old_chicks &&
        ['prospect', 'active'].includes(c.status) &&
        (c.product_interest === 'day_old_chicks' || c.product_interest === 'both')
    ).length
    return {
      total: clients.length,
      dayOld,
      prospect: clients.filter((c) => c.status === 'prospect').length,
      active: clients.filter((c) => c.status === 'active').length,
    }
  }, [clients])

  const saveClient = useCallback(
    async (payload, id = null) => {
      if (!orgId) return { error: 'Sin organización' }
      setError(null)
      const row = {
        org_id: orgId,
        name: payload.name?.trim(),
        contact_name: payload.contact_name?.trim() || null,
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        city: payload.city?.trim() || null,
        department: payload.department?.trim() || null,
        address: payload.address?.trim() || null,
        website: payload.website?.trim() || null,
        nit: payload.nit?.trim() || null,
        code: payload.code?.trim() || null,
        status: payload.status || 'prospect',
        product_interest: payload.product_interest || 'day_old_chicks',
        buys_day_old_chicks:
          payload.buys_day_old_chicks !== undefined
            ? Boolean(payload.buys_day_old_chicks)
            : true,
        farm_type: payload.farm_type?.trim() || null,
        capacity_birds:
          payload.capacity_birds === '' || payload.capacity_birds == null
            ? null
            : Number(payload.capacity_birds),
        notes: payload.notes?.trim() || null,
        user_id: payload.user_id || null,
        updated_at: new Date().toISOString(),
      }
      if (!row.name) return { error: 'El nombre del cliente es obligatorio' }

      if (localMode) {
        localSaveCustomer(row, id)
        await load()
        return { error: null, local: true }
      }

      if (id) {
        const { error: err } = await supabase.from('customers').update(row).eq('id', id)
        if (err) {
          if (isMissingTableError(err.message)) {
            setLocalMode(true)
            localSaveCustomer(row, id)
            await load()
            return { error: null, local: true }
          }
          if (isNetworkError(err.message)) {
            await enqueueUpdate('customers', id, row)
            return { error: null, offline: true }
          }
          setError(err.message)
          return { error: err.message }
        }
      } else {
        const insertRow = { ...row, created_at: new Date().toISOString() }
        const { error: err } = await supabase.from('customers').insert(insertRow)
        if (err) {
          if (isMissingTableError(err.message)) {
            setLocalMode(true)
            localSaveCustomer(insertRow, null)
            await load()
            return { error: null, local: true }
          }
          if (isNetworkError(err.message)) {
            await enqueueInsert('customers', insertRow)
            return { error: null, offline: true }
          }
          setError(err.message)
          return { error: err.message }
        }
      }
      await load()
      return { error: null }
    },
    [orgId, load, localMode]
  )

  const deleteClient = useCallback(
    async (id) => {
      if (localMode) {
        localDeleteCustomer(id)
        await load()
        return { error: null }
      }
      const { error: err } = await supabase.from('customers').delete().eq('id', id)
      if (err) {
        if (isMissingTableError(err.message)) {
          setLocalMode(true)
          localDeleteCustomer(id)
          await load()
          return { error: null }
        }
        setError(err.message)
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [load, localMode]
  )

  const seedDayOldProspects = useCallback(
    async (userId) => {
      if (!orgId) return { error: 'Sin organización', inserted: 0 }
      const { prospectsToRows, DEMO_DAY_OLD_PROSPECTS } = await import(
        '../data/demoDayOldProspects'
      )
      const rows = prospectsToRows(orgId, userId).map(({ _maps_url, ...row }) => row)
      const codes = DEMO_DAY_OLD_PROSPECTS.map((p) => p.code)

      // Si ya estamos en local o falla el servidor → local
      const tryLocal = () => {
        const r = localBulkUpsertCustomers(orgId, rows)
        setLocalMode(true)
        return {
          error: null,
          inserted: r.inserted,
          updated: r.updated,
          local: true,
          message:
            r.inserted || r.updated
              ? `Cartera local: ${r.inserted} nuevos, ${r.updated} actualizados (pendiente de esquema en servidor).`
              : 'La cartera local ya estaba actualizada.',
        }
      }

      if (localMode) {
        const res = tryLocal()
        await load()
        return res
      }

      const { data: existing, error: exErr } = await supabase
        .from('customers')
        .select('code')
        .eq('org_id', orgId)
        .in('code', codes)

      if (exErr && isMissingTableError(exErr.message)) {
        const res = tryLocal()
        await load()
        return res
      }

      const have = new Set((existing ?? []).map((r) => r.code))
      const toUpdate = rows.filter((r) => have.has(r.code))
      for (const row of toUpdate) {
        const { org_id: _o, code, created_at: _c, created_by: _b, ...patch } = row
        await supabase
          .from('customers')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
          .eq('code', code)
      }

      const toInsert = rows.filter((r) => !have.has(r.code))
      if (!toInsert.length) {
        await load()
        return {
          error: null,
          inserted: 0,
          updated: toUpdate.length,
          message: toUpdate.length
            ? `Se actualizaron ${toUpdate.length} prospectos.`
            : 'Ya estaban cargados',
        }
      }

      const { error: err } = await supabase.from('customers').insert(toInsert)
      if (err) {
        if (isMissingTableError(err.message) || isNetworkError(err.message)) {
          const res = tryLocal()
          await load()
          return res
        }
        return { error: err.message, inserted: 0 }
      }
      await load()
      return { error: null, inserted: toInsert.length, updated: toUpdate.length }
    },
    [orgId, load, localMode]
  )

  return {
    clients,
    filtered,
    stats,
    loading,
    error,
    localMode,
    query,
    setQuery,
    filter,
    setFilter,
    reload: load,
    saveClient,
    deleteClient,
    seedDayOldProspects,
  }
}

/** Export «useMyCustomerOrders»: API pública de este módulo. Henry Stark Desarrollador */
export function useMyCustomerOrders(orgId, userId) {
  const [customer, setCustomer] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)

  const load = useCallback(async () => {
    if (!orgId || !userId) return
    setLoading(true)
    setError(null)

    const { data: cust, error: cErr } = await supabase
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()

    if (cErr && isMissingTableError(cErr.message)) {
      setLocalMode(true)
      const localCust = localListCustomers(orgId).find((c) => c.user_id === userId) || null
      setCustomer(localCust)
      setOrders([])
      setLoading(false)
      return
    }
    if (cErr) {
      setError(cErr.message)
      setLoading(false)
      return
    }
    setLocalMode(false)
    setCustomer(cust)
    if (!cust) {
      setOrders([])
      setLoading(false)
      return
    }
    const { data, error: oErr } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('customer_id', cust.id)
      .order('created_at', { ascending: false })
    if (oErr) setError(oErr.message)
    else setOrders(data ?? [])
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => {
    load()
  }, [load])

  const requestOrder = useCallback(
    async ({ qty_females, qty_males, notes, requested_date, delivery_address }) => {
      if (!customer) return { error: 'No hay ficha de cliente vinculada a tu usuario' }
      const row = {
        org_id: customer.org_id,
        customer_id: customer.id,
        product_type: 'day_old_chicks',
        qty_females: Number(qty_females) || 0,
        qty_males: Number(qty_males) || 0,
        status: 'requested',
        notes: notes?.trim() || null,
        requested_date: requested_date || null,
        delivery_address: delivery_address?.trim() || customer.address || null,
        created_by: userId,
      }
      if (customer.status && customer.status !== 'active') {
        return {
          error:
            'Su cuenta de cliente no está verificada. Ventas debe marcar su ficha como Activo antes de pedir.',
        }
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
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [customer, userId, load, localMode]
  )

  return { customer, orders, loading, error, localMode, reload: load, requestOrder }
}
