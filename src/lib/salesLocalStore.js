/**
 * =============================================================================
 * ARCHIVO: src/lib/salesLocalStore.js
 * PROPÓSITO: Respaldo local de ventas si falta tabla en Supabase.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Respaldo local (localStorage) para CRM de ventas cuando las tablas
 * public.customers / public.sales_orders aún no existen en Supabase.
 * Respaldo operativo mientras se publica el esquema en servidor.
 * Con tablas en Supabase, la app usa la base remota de forma preferente.
 */

const KEY_C = 'incubapp_sales_customers_v1'
const KEY_O = 'incubapp_sales_orders_v1'
const LEGACY_C = 'incubant_sales_customers_v1'
const LEGACY_O = 'incubant_sales_orders_v1'

function read(key) {
  try {
    const legacy = key === KEY_C ? LEGACY_C : key === KEY_O ? LEGACY_O : null
    const raw = localStorage.getItem(key) ?? (legacy ? localStorage.getItem(legacy) : null) ?? '[]'
    return JSON.parse(raw || '[]')
  } catch {
    return []
  }
}

function write(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows))
  try {
    if (key === KEY_C) localStorage.removeItem(LEGACY_C)
    if (key === KEY_O) localStorage.removeItem(LEGACY_O)
  } catch {
    /* */
  }
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Export «isMissingTableError»: API pública de este módulo. Henry Stark Desarrollador */
export function isMissingTableError(msg) {
  return /schema cache|does not exist|Could not find the table|relation .* does not exist/i.test(
    String(msg || '')
  )
}

/** Export «localListCustomers»: API pública de este módulo. Henry Stark Desarrollador */
export function localListCustomers(orgId) {
  return read(KEY_C)
    .filter((c) => c.org_id === orgId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))
}

/** Export «localSaveCustomer»: API pública de este módulo. Henry Stark Desarrollador */
export function localSaveCustomer(row, id = null) {
  const all = read(KEY_C)
  const now = new Date().toISOString()
  if (id) {
    const i = all.findIndex((c) => c.id === id)
    if (i < 0) throw new Error('Cliente local no encontrado')
    all[i] = { ...all[i], ...row, id, updated_at: now }
    write(KEY_C, all)
    return all[i]
  }
  const created = {
    ...row,
    id: uid(),
    created_at: now,
    updated_at: now,
  }
  all.push(created)
  write(KEY_C, all)
  return created
}

/** Export «localDeleteCustomer»: API pública de este módulo. Henry Stark Desarrollador */
export function localDeleteCustomer(id) {
  write(
    KEY_C,
    read(KEY_C).filter((c) => c.id !== id)
  )
}

/** Export «localBulkUpsertCustomers»: API pública de este módulo. Henry Stark Desarrollador */
export function localBulkUpsertCustomers(orgId, rows) {
  const all = read(KEY_C)
  let inserted = 0
  let updated = 0
  const now = new Date().toISOString()
  for (const row of rows) {
    const i = all.findIndex((c) => c.org_id === orgId && c.code && c.code === row.code)
    if (i >= 0) {
      all[i] = { ...all[i], ...row, id: all[i].id, org_id: orgId, updated_at: now }
      updated++
    } else {
      all.push({ ...row, id: uid(), org_id: orgId, created_at: now, updated_at: now })
      inserted++
    }
  }
  write(KEY_C, all)
  return { inserted, updated }
}

/** Export «localListOrders»: API pública de este módulo. Henry Stark Desarrollador */
export function localListOrders(orgId) {
  const customers = read(KEY_C)
  return read(KEY_O)
    .filter((o) => o.org_id === orgId)
    .map((o) => ({
      ...o,
      customers: customers.find((c) => c.id === o.customer_id) || null,
      qty_total: (Number(o.qty_females) || 0) + (Number(o.qty_males) || 0),
    }))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

/** Export «localInsertOrder»: API pública de este módulo. Henry Stark Desarrollador */
export function localInsertOrder(row) {
  const all = read(KEY_O)
  const now = new Date().toISOString()
  const created = {
    ...row,
    id: uid(),
    created_at: row.created_at || now,
    updated_at: now,
  }
  all.unshift(created)
  write(KEY_O, all)
  // touch customer last_order
  const custs = read(KEY_C)
  const ci = custs.findIndex((c) => c.id === row.customer_id)
  if (ci >= 0) {
    custs[ci] = {
      ...custs[ci],
      last_order_at: now,
      status: custs[ci].status === 'prospect' ? 'active' : custs[ci].status,
      updated_at: now,
    }
    write(KEY_C, custs)
  }
  return created
}

/** Export «localUpdateOrder»: API pública de este módulo. Henry Stark Desarrollador */
export function localUpdateOrder(id, patch) {
  const all = read(KEY_O)
  const i = all.findIndex((o) => o.id === id)
  if (i < 0) throw new Error('Pedido local no encontrado')
  all[i] = { ...all[i], ...patch, updated_at: new Date().toISOString() }
  write(KEY_O, all)
  return all[i]
}
