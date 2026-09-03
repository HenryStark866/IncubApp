/**
 * =============================================================================
 * ARCHIVO: src/lib/opsLocalStore.js
 * PROPÓSITO: Utilidades de almacenamiento operativo local.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Respaldo local para remisiones e inventarios si aún no hay tablas en Supabase.
 */

const KEY_R = 'incubapp_remittances_v1'
const KEY_I = 'incubapp_inventories_v1'
const KEY_M = 'incubapp_inv_movements_v1'
const KEY_L = 'incubapp_inv_leads_v1'

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}
function write(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows))
}
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Export «isMissingOpsTable»: API pública de este módulo. Henry Stark Desarrollador */
export function isMissingOpsTable(msg) {
  return /schema cache|does not exist|Could not find the table|relation .* does not exist/i.test(
    String(msg || '')
  )
}

// ── Remisiones ─────────────────────────────────────────────
/** Export «localListRemittances»: API pública de este módulo. Henry Stark Desarrollador */
export function localListRemittances(orgId) {
  return read(KEY_R)
    .filter((r) => r.org_id === orgId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

/** Export «localInsertRemittance»: API pública de este módulo. Henry Stark Desarrollador */
export function localInsertRemittance(row) {
  const all = read(KEY_R)
  const rec = {
    id: row.id || uid(),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...row,
  }
  all.unshift(rec)
  write(KEY_R, all)
  return rec
}

/** Export «localUpdateRemittance»: API pública de este módulo. Henry Stark Desarrollador */
export function localUpdateRemittance(id, patch) {
  const all = read(KEY_R)
  const i = all.findIndex((r) => r.id === id)
  if (i < 0) return null
  all[i] = { ...all[i], ...patch, updated_at: new Date().toISOString() }
  write(KEY_R, all)
  return all[i]
}

// ── Inventario ─────────────────────────────────────────────
/** Export «localListInventories»: API pública de este módulo. Henry Stark Desarrollador */
export function localListInventories(orgId) {
  return read(KEY_I)
    .filter((r) => r.org_id === orgId)
    .sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), 'es'))
}

/** Export «localUpsertInventory»: API pública de este módulo. Henry Stark Desarrollador */
export function localUpsertInventory(row) {
  const all = read(KEY_I)
  if (row.id) {
    const i = all.findIndex((r) => r.id === row.id)
    if (i >= 0) {
      all[i] = { ...all[i], ...row, updated_at: new Date().toISOString() }
      write(KEY_I, all)
      return all[i]
    }
  }
  const rec = {
    id: row.id || uid(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    qty_on_hand: 0,
    ...row,
  }
  all.push(rec)
  write(KEY_I, all)
  return rec
}

/** Export «localAdjustInventory»: API pública de este módulo. Henry Stark Desarrollador */
export function localAdjustInventory(id, delta, movement) {
  const all = read(KEY_I)
  const i = all.findIndex((r) => r.id === id)
  if (i < 0) return { error: 'Ítem no encontrado' }
  const next = Number(all[i].qty_on_hand || 0) + Number(delta)
  all[i] = { ...all[i], qty_on_hand: next, updated_at: new Date().toISOString() }
  write(KEY_I, all)
  if (movement) {
    const movs = read(KEY_M)
    movs.unshift({
      id: uid(),
      created_at: new Date().toISOString(),
      ...movement,
      inventory_id: id,
      qty: Math.abs(Number(delta)),
    })
    write(KEY_M, movs)
  }
  return { item: all[i] }
}

/** Export «localListMovements»: API pública de este módulo. Henry Stark Desarrollador */
export function localListMovements(orgId, inventoryId) {
  return read(KEY_M)
    .filter((m) => m.org_id === orgId && (!inventoryId || m.inventory_id === inventoryId))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

/** Export «localListLeads»: API pública de este módulo. Henry Stark Desarrollador */
export function localListLeads(orgId) {
  return read(KEY_L).filter((r) => r.org_id === orgId)
}

/** Export «localUpsertLead»: API pública de este módulo. Henry Stark Desarrollador */
export function localUpsertLead(row) {
  const all = read(KEY_L)
  const i = all.findIndex((r) => r.org_id === row.org_id && r.category === row.category)
  if (i >= 0) all[i] = { ...all[i], ...row, updated_at: new Date().toISOString() }
  else all.push({ ...row, updated_at: new Date().toISOString() })
  write(KEY_L, all)
  return row
}
