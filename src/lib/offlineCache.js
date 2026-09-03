/**
 * Caché de lecturas offline (última respuesta buena por clave).
 * localStorage + memoria. Henry Stark Desarrollador
 */

const PREFIX = 'incubapp_readcache_v1_'
const MEM = new Map()
const MAX_CHARS = 1_800_000

function key(orgId, name) {
  return `${PREFIX}${orgId || 'x'}_${name}`
}

/**
 * Guarda un snapshot JSON legible offline.
 * @param {string} orgId
 * @param {string} name
 * @param {unknown} data
 */
export function cacheWrite(orgId, name, data) {
  try {
    const payload = {
      at: Date.now(),
      data,
    }
    const raw = JSON.stringify(payload)
    if (raw.length > MAX_CHARS) return false
    MEM.set(key(orgId, name), payload)
    localStorage.setItem(key(orgId, name), raw)
    return true
  } catch {
    // cuota llena: intenta limpiar entradas viejas
    try {
      pruneOldest(8)
      localStorage.setItem(key(orgId, name), JSON.stringify({ at: Date.now(), data }))
      return true
    } catch {
      return false
    }
  }
}

/**
 * Lee snapshot (memoria → localStorage).
 * @returns {{ data: any, at: number, stale: boolean } | null}
 */
export function cacheRead(orgId, name, maxAgeMs = 1000 * 60 * 60 * 72) {
  const k = key(orgId, name)
  let payload = MEM.get(k)
  if (!payload) {
    try {
      const raw = localStorage.getItem(k)
      if (!raw) return null
      payload = JSON.parse(raw)
      MEM.set(k, payload)
    } catch {
      return null
    }
  }
  if (!payload || payload.data === undefined) return null
  const age = Date.now() - (payload.at || 0)
  return {
    data: payload.data,
    at: payload.at,
    stale: age > maxAgeMs,
    ageMs: age,
  }
}

function pruneOldest(n = 5) {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) {
      try {
        const p = JSON.parse(localStorage.getItem(k) || '{}')
        keys.push({ k, at: p.at || 0 })
      } catch {
        keys.push({ k, at: 0 })
      }
    }
  }
  keys
    .sort((a, b) => a.at - b.at)
    .slice(0, n)
    .forEach(({ k }) => localStorage.removeItem(k))
}

/**
 * Helper: intenta fetch async; si falla y hay caché, devuelve caché.
 * @template T
 * @param {string} orgId
 * @param {string} name
 * @param {() => Promise<T>} loader
 * @returns {Promise<{ data: T|null, fromCache: boolean, error: string|null }>}
 */
export async function loadWithCache(orgId, name, loader) {
  try {
    const data = await loader()
    if (data != null) cacheWrite(orgId, name, data)
    return { data, fromCache: false, error: null }
  } catch (e) {
    const hit = cacheRead(orgId, name)
    if (hit) {
      return {
        data: hit.data,
        fromCache: true,
        error: e?.message || String(e),
      }
    }
    return { data: null, fromCache: false, error: e?.message || String(e) }
  }
}
