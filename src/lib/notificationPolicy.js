/**
 * =============================================================================
 * ARCHIVO: src/lib/notificationPolicy.js
 * PROPÓSITO: Reglas de quién ve qué notificación (p. ej. OT no van a gerencia).
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Quién ve qué notificación (módulos herméticos).
 * OT y fallas de planta → coordinación de planta (no gerencia).
 * OC, facturas, cotizaciones, reportes de área, solicitudes → gerencia.
 */

/** Export «NOTIF_KINDS»: API pública de este módulo. Henry Stark Desarrollador */
export const NOTIF_KINDS = {
  general: { label: 'General', icon: '📢' },
  hatch_scheduled: { label: 'Nacimiento', icon: '🐣' },
  ot: { label: 'Orden de trabajo', icon: '🛠️' },
  machine_alert: { label: 'Alerta de máquina', icon: '⚠️' },
  purchase_order: { label: 'Orden de compra', icon: '🛒' },
  invoice: { label: 'Factura', icon: '🧾' },
  quotation: { label: 'Cotización', icon: '📋' },
  area_report: { label: 'Reporte de área', icon: '📊' },
  leader_request: { label: 'Solicitud de líder', icon: '📨' },
  dispatch: { label: 'Reporte / envío', icon: '📬' },
  management: { label: 'Gerencia', icon: '💼' },
  attendance: { label: 'Asistencia', icon: '⏱️' },
  load_map: { label: 'Mapa de cargue', icon: '🗺️' },
  load_order: { label: 'Orden de cargue', icon: '🥚' },
}

const OT_KINDS = new Set(['ot', 'machine_alert'])
const MGMT_KINDS = new Set([
  'purchase_order',
  'invoice',
  'quotation',
  'area_report',
  'leader_request',
  'management',
  'dispatch',
])

/** Export «isManagementRole»: API pública de este módulo. Henry Stark Desarrollador */
export function isManagementRole(role, area) {
  return (
    role === 'management' ||
    role === 'management_auxiliary' ||
    (role === 'coordinator' && area === 'management')
  )
}

/** Export «isPlantOpsRole»: API pública de este módulo. Henry Stark Desarrollador */
export function isPlantOpsRole(role, area) {
  return (
    role === 'supervisor' ||
    (role === 'coordinator' &&
      ['plant', 'general', 'quality', 'maintenance', null, undefined].includes(area || 'general')) ||
    role === 'maintenance_auxiliary'
  )
}

/** ¿Este rol debe ver la notificación? */
export function canSeeNotification(n, role, area, isOmniscient = false) {
  if (isOmniscient) return true
  const kind = n?.kind || 'general'
  const title = `${n?.title || ''} ${n?.body || ''}`

  const looksLikeOt =
    OT_KINDS.has(kind) ||
    /\bOT\b|orden(es)? de trabajo|falla de máquina|novedad de máquina/i.test(title)

  if (isManagementRole(role, area)) {
    // Gerencia: NUNCA alertas de OT / planta operativa
    if (looksLikeOt) return false
    // Sí: documentos y bandeja gerencial + generales de empresa (no OT)
    if (MGMT_KINDS.has(kind) || kind === 'general' || kind === 'hatch_scheduled') return true
    return !looksLikeOt
  }

  if (isPlantOpsRole(role, area)) {
    // Planta: OT y operación; no saturar con cola de facturas (pueden ver general)
    if (MGMT_KINDS.has(kind) && kind !== 'area_report' && kind !== 'leader_request') {
      // facturas/OC/cotizaciones van a gerencia
      if (['purchase_order', 'invoice', 'quotation'].includes(kind)) return false
    }
    return true
  }

  // Operarios de turno y aux. mantenimiento ven OT (p. ej. calibración de máquina)
  if (
    looksLikeOt &&
    !['maintenance_auxiliary', 'operator', 'auxiliary', 'auxiliary_production'].includes(role)
  ) {
    return false
  }
  return true
}

/** Export «notifIcon»: API pública de este módulo. Henry Stark Desarrollador */
export function notifIcon(kind) {
  return NOTIF_KINDS[kind]?.icon || '📢'
}
