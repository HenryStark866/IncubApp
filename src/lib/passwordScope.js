/**
 * ¿Quién puede asignar una contraseña temporal a quién? Espejo de la regla de la base
 * (supabase/migrations/20260930_admin_set_password_por_area.sql) para mostrar el botón
 * «Contraseña» solo cuando la base lo va a permitir.
 *  - owner/admin: cualquier miembro de la empresa;
 *  - gerencia: todos menos owner/admin/gerencia;
 *  - líder de área: solo la gente de rango menor de SU área (misma área, o sin área y con
 *    un cargo que depende de esa área: operario de turno → planta, conductor → logística…).
 *  - líder con área «General» (07-10-2026): no tiene un área sola, responde por todas, así
 *    que puede con toda la gente de rango menor. Antes no podía con nadie.
 * Henry Stark Desarrollador · 30-09-2026
 */

const HIGHER = ['owner', 'admin', 'management', 'coordinator']

/** Cargos que dependen de cada área (COORD_AUXILIARIES + el personal de turno de planta). */
export const AREA_ROLES = {
  plant: [
    'operator',
    'auxiliary',
    'auxiliary_production',
    'quality_auxiliary',
    'supervisor',
    'reception_operator',
    'vaccination_auxiliary',
    'plant_veterinarian',
  ],
  maintenance: ['maintenance_auxiliary'],
  sst: ['sst_auxiliary', 'hse_auxiliary'],
  environmental: ['environmental_auxiliary'],
  hr: ['hr_auxiliary'],
  accounting: ['accounting_auxiliary'],
  sales: ['sales_logistics_auxiliary'],
  logistics: ['logistics_auxiliary', 'driver'],
  sales_logistics: ['sales_logistics_auxiliary', 'logistics_auxiliary', 'driver'],
  quality: ['auxiliary_production', 'quality_auxiliary', 'vaccination_auxiliary', 'reception_operator'],
  farm: ['barn_operator', 'vaccination_auxiliary'],
  veterinary: ['vaccination_auxiliary', 'plant_veterinarian'],
  management: ['management_auxiliary'],
}

export function normArea(area) {
  const a = String(area ?? '').trim() || 'general'
  return a === 'hse' ? 'sst' : a
}

/** ¿La persona (área + cargo) es del área del líder? */
export function isInLeaderArea(leaderArea, targetArea, targetRole) {
  const l = normArea(leaderArea)
  const t = normArea(targetArea)
  if (l === 'general') return false
  if (t === l) return true
  if (l === 'sales_logistics' && (t === 'sales' || t === 'logistics')) return true
  if ((l === 'sales' || l === 'logistics') && t === 'sales_logistics') return true
  return t === 'general' && (AREA_ROLES[l] || []).includes(targetRole)
}

/**
 * @param {{ role: string, area?: string }|null} caller membresía de quien asigna (misma empresa)
 * @param {{ role: string, area?: string }|null} target membresía de la persona
 */
export function canSetPasswordFor(caller, target) {
  if (!caller || !target) return false
  if (caller.role === 'owner' || caller.role === 'admin') return true
  if (caller.role === 'management') return !['owner', 'admin', 'management'].includes(target.role)
  if (caller.role === 'coordinator') {
    if (HIGHER.includes(target.role)) return false
    return normArea(caller.area) === 'general' || isInLeaderArea(caller.area, target.area, target.role)
  }
  return false
}
