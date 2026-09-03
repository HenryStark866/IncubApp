/**
 * Fallback local de reportes/bandeja si falta silo_dispatches en Supabase.
 * Henry Stark Desarrollador
 */

const KEY = (orgId) => `incubapp_dispatches_${orgId}`

export function localListDispatches(orgId) {
  try {
    const raw = localStorage.getItem(KEY(orgId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write(orgId, rows) {
  localStorage.setItem(KEY(orgId), JSON.stringify(rows.slice(0, 400)))
}

export function localInsertDispatch(orgId, row) {
  const rows = localListDispatches(orgId)
  const full = {
    id: row.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'sent',
    ...row,
    org_id: orgId,
    _local: true,
  }
  write(orgId, [full, ...rows])
  return full
}

export function localUpdateDispatch(orgId, id, patch) {
  const rows = localListDispatches(orgId)
  const i = rows.findIndex((r) => r.id === id)
  if (i < 0) return null
  rows[i] = { ...rows[i], ...patch, updated_at: new Date().toISOString() }
  write(orgId, rows)
  return rows[i]
}
