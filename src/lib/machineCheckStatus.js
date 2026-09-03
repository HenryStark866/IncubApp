/**
 * Condiciones de check de máquina y qué cuenta como “alerta real”.
 *
 * - normal  → sin novedad (OK)
 * - warning → aviso / alerta operativa
 * - fault   → falla (alerta crítica)
 * - off     → máquina apagada a propósito (NO es alerta de gerencia)
 *
 * Henry Stark Desarrollador
 */

export const CHECK_CONDITION = {
  normal: { label: 'Sin novedad', isAlert: false, isOff: false },
  warning: { label: 'Aviso / alerta', isAlert: true, isOff: false },
  fault: { label: 'Falla', isAlert: true, isOff: false },
  off: { label: 'Apagada', isAlert: false, isOff: true },
}

/** Solo warning y fault son alertas de gerencia/tablero. */
export function isRealMachineAlert(condition) {
  return condition === 'warning' || condition === 'fault'
}

export function isMachineOff(condition) {
  return condition === 'off'
}

export function conditionLabel(condition) {
  return CHECK_CONDITION[condition]?.label || condition || '—'
}

/**
 * Clasifica checks del día.
 * @returns {{ alerts: object[], offs: object[], normal: object[], today: object[] }}
 */
export function classifyChecksToday(checks, todayStr) {
  const today = todayStr || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const list = (checks || []).filter((c) => String(c.shift_date || '').startsWith(today))
  const alerts = list.filter((c) => isRealMachineAlert(c.condition))
  const offs = list.filter((c) => isMachineOff(c.condition))
  const normal = list.filter((c) => c.condition === 'normal' || !c.condition)
  return { alerts, offs, normal, today: list }
}
