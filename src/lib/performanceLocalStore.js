/**
 * Fallback local: metas, rondas y racha de uso (cumplimiento / bonos).
 * Henry Stark Desarrollador
 */

const k = (orgId, part) => `incubapp_perf_${part}_${orgId}`

function read(orgId, part, fallback) {
  try {
    const raw = localStorage.getItem(k(orgId, part))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(orgId, part, value) {
  localStorage.setItem(k(orgId, part), JSON.stringify(value))
}

export function localListTargets(orgId) {
  return read(orgId, 'targets', [])
}

export function localSaveTargets(orgId, rows) {
  write(orgId, 'targets', rows.slice(0, 200))
  return rows
}

export function localUpsertTarget(orgId, row) {
  const rows = localListTargets(orgId)
  const id = row.id || `local_tgt_${row.labor_key}_${row.role || 'all'}_${row.user_id || 'any'}`
  const full = {
    ...row,
    id,
    updated_at: new Date().toISOString(),
    _local: true,
  }
  const i = rows.findIndex(
    (r) =>
      r.id === id ||
      (r.labor_key === row.labor_key &&
        (r.role || null) === (row.role || null) &&
        (r.user_id || null) === (row.user_id || null))
  )
  if (i >= 0) rows[i] = { ...rows[i], ...full }
  else rows.unshift(full)
  localSaveTargets(orgId, rows)
  return full
}

export function localListRounds(orgId) {
  return read(orgId, 'rounds', [])
}

export function localInsertRound(orgId, row) {
  const rows = localListRounds(orgId)
  const full = {
    id: row.id || `local_rnd_${Date.now()}`,
    created_at: row.created_at || new Date().toISOString(),
    ...row,
    org_id: orgId,
    _local: true,
  }
  write(orgId, 'rounds', [full, ...rows].slice(0, 500))
  return full
}

export function localGetUsage(orgId, userId) {
  const map = read(orgId, 'usage', {})
  return map[userId] || null
}

export function localSetUsage(orgId, userId, usage) {
  const map = read(orgId, 'usage', {})
  map[userId] = usage
  write(orgId, 'usage', map)
  return usage
}

export function localListLabors(orgId) {
  return read(orgId, 'labors', [])
}

export function localInsertLabor(orgId, row) {
  const rows = localListLabors(orgId)
  const full = {
    id: row.id || `local_lab_${Date.now()}`,
    created_at: row.created_at || new Date().toISOString(),
    ...row,
    org_id: orgId,
    _local: true,
  }
  write(orgId, 'labors', [full, ...rows].slice(0, 500))
  return full
}
