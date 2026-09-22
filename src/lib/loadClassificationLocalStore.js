/**
 * Persistencia local de clasificación por cinta y mapas de cargue
 * (fallback si aún no hay tablas Supabase).
 */

const KEY_T = 'incubapp_tape_class_v1'
const KEY_M = 'incubapp_load_maps_v1'

function read(key) {
  try {
    const storage = globalThis.localStorage
    const raw = storage ? storage.getItem(key) : null
    if (!raw) return {}
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

function write(key, val) {
  try {
    const storage = globalThis.localStorage
    if (storage) {
      storage.setItem(key, JSON.stringify(val))
    }
  } catch {
    /* */
  }
}

function orgList(store, orgId) {
  const all = read(store)
  return Array.isArray(all[orgId]) ? all[orgId] : []
}

function orgSave(store, orgId, list) {
  const all = read(store)
  all[orgId] = list
  write(store, all)
}

export function localListTape(orgId) {
  return orgList(KEY_T, orgId)
}

export function localInsertTape(orgId, row) {
  const list = localListTape(orgId)
  list.unshift(row)
  orgSave(KEY_T, orgId, list)
  return row
}

export function localUpdateTape(orgId, id, patch) {
  const list = localListTape(orgId).map((r) => (r.id === id ? { ...r, ...patch } : r))
  orgSave(KEY_T, orgId, list)
}

export function localDeleteTape(orgId, id) {
  orgSave(
    KEY_T,
    orgId,
    localListTape(orgId).filter((r) => r.id !== id)
  )
}

export function localListMaps(orgId) {
  return orgList(KEY_M, orgId)
}

export function localInsertMap(orgId, row) {
  const list = localListMaps(orgId)
  list.unshift(row)
  orgSave(KEY_M, orgId, list)
  return row
}

export function localUpdateMap(orgId, id, patch) {
  const list = localListMaps(orgId).map((r) => (r.id === id ? { ...r, ...patch } : r))
  orgSave(KEY_M, orgId, list)
}

export function localDeleteMap(orgId, id) {
  orgSave(
    KEY_M,
    orgId,
    localListMaps(orgId).filter((r) => r.id !== id)
  )
}
