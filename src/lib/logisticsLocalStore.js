/**
 * =============================================================================
 * ARCHIVO: src/lib/logisticsLocalStore.js
 * PROPÓSITO: Respaldo local de logística / flota.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

const K = {
  drivers: 'incubapp_log_drivers_v1',
  routes: 'incubapp_log_routes_v1',
  deliveries: 'incubapp_log_deliveries_v1',
  contacts: 'incubapp_log_contacts_v1',
  messages: 'incubapp_log_messages_v1',
}

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
/** Export «logUid»: API pública de este módulo. Henry Stark Desarrollador */
export function logUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Export «isMissingLogisticsTable»: API pública de este módulo. Henry Stark Desarrollador */
export function isMissingLogisticsTable(msg) {
  return /schema cache|does not exist|Could not find the table|relation .* does not exist/i.test(
    String(msg || '')
  )
}

function crud(key) {
  return {
    list: (orgId) => read(key).filter((r) => r.org_id === orgId),
    insert: (row) => {
      const rec = {
        id: row.id || logUid(),
        created_at: row.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...row,
      }
      write(key, [rec, ...read(key)])
      return rec
    },
    update: (id, patch) => {
      const all = read(key)
      const i = all.findIndex((r) => r.id === id)
      if (i < 0) return null
      all[i] = { ...all[i], ...patch, updated_at: new Date().toISOString() }
      write(key, all)
      return all[i]
    },
    remove: (id) => {
      write(
        key,
        read(key).filter((r) => r.id !== id)
      )
    },
  }
}

/** Export «localDrivers»: API pública de este módulo. Henry Stark Desarrollador */
export const localDrivers = crud(K.drivers)
/** Export «localRoutes»: API pública de este módulo. Henry Stark Desarrollador */
export const localRoutes = crud(K.routes)
/** Export «localDeliveries»: API pública de este módulo. Henry Stark Desarrollador */
export const localDeliveries = {
  ...crud(K.deliveries),
  listByRoute: (orgId, routeId) =>
    read(K.deliveries)
      .filter((r) => r.org_id === orgId && r.route_id === routeId)
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
  removeByRoute: (routeId) => {
    write(
      K.deliveries,
      read(K.deliveries).filter((r) => r.route_id !== routeId)
    )
  },
}
/** Export «localContacts»: API pública de este módulo. Henry Stark Desarrollador */
export const localContacts = crud(K.contacts)
/** Export «localDriverMessages»: API pública de este módulo. Henry Stark Desarrollador */
export const localDriverMessages = {
  list: (orgId, driverId) =>
    read(K.messages)
      .filter((m) => m.org_id === orgId && (!driverId || m.driver_id === driverId))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
  insert: (row) => {
    const rec = {
      id: row.id || logUid(),
      created_at: new Date().toISOString(),
      ...row,
    }
    write(K.messages, [...read(K.messages), rec])
    return rec
  },
}
