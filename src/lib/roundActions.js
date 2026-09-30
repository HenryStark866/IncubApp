/**
 * Acciones de la ronda que van más allá de la foto: pedir la orden de trabajo de una
 * máquina con novedad sin salir de la ronda, y el resumen antes de terminarla.
 * Henry Stark Desarrollador · CDH Maker
 */
import { supabase } from './supabase'

/**
 * Crea la OT correctiva de la máquina reportada en la ronda. Falla → prioridad alta;
 * alerta → media. Devuelve { error } (sin red la OT no se crea y se avisa: la
 * novedad sí queda guardada en la ronda).
 */
export async function requestWorkOrderFromRound({ orgId, userId, machine, condition, alarmType, note }) {
  if (!orgId || !userId || !machine?.id) return { error: 'Faltan datos para pedir la OT' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { error: 'Sin conexión: la novedad quedó en la ronda, pero la OT se debe pedir cuando vuelva la señal.' }
  }
  const code = machine.code || machine.name || 'Máquina'
  const { error } = await supabase.from('work_orders').insert({
    org_id: orgId,
    plant_id: machine.plant_id || null,
    machine_id: machine.id,
    location_type: 'plant',
    title: `${code} · ${alarmType || (condition === 'fault' ? 'Falla' : 'Alerta')} (ronda)`,
    description: [note, 'Reportada en la ronda de supervisión con foto de la pantalla.'].filter(Boolean).join('\n'),
    type: 'corrective',
    priority: condition === 'fault' ? 'high' : 'medium',
    created_by: userId,
  })
  return { error: error ? error.message : null }
}

/**
 * Resumen de la ronda de la hora antes de terminarla: cuántas tienen foto, las
 * novedades y las que quedarán como apagadas por no haberse reportado.
 */
export function roundFinishSummary({ plantMachines = [], checksNow = [] }) {
  const byMachine = new Map(checksNow.map((c) => [c.machine_id, c]))
  const codeOf = (m) => m?.code || m?.name || 'Máquina'
  const inRound = plantMachines.map((m) => ({ machine: m, check: byMachine.get(m.id) || null }))
  return {
    total: plantMachines.length,
    withPhoto: inRound.filter((x) => x.check && x.check.condition !== 'off').length,
    off: inRound.filter((x) => x.check?.condition === 'off').length,
    issues: inRound
      .filter((x) => x.check && (x.check.condition === 'fault' || x.check.condition === 'warning'))
      .map((x) => ({ code: codeOf(x.machine), condition: x.check.condition, notes: x.check.notes || '' }))
      .sort((a, b) => (a.condition === b.condition ? 0 : a.condition === 'fault' ? -1 : 1)),
    pending: inRound.filter((x) => !x.check).map((x) => ({ id: x.machine.id, code: codeOf(x.machine) })),
    people: new Set(checksNow.map((c) => c.taken_by).filter(Boolean)).size,
  }
}

/** Minutos que le quedan a la hora de la ronda. */
export function minutesLeftInHour(now = new Date()) {
  return 60 - now.getMinutes()
}
