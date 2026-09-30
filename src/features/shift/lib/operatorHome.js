/**
 * Inicio del operario de turno (y del auxiliar de turno): todo lo que hace en su
 * turno desde una sola pantalla. Funciones puras, probadas sin red:
 *  - asistencia: en qué momento del ingreso/salida va y cuándo sugerir la salida;
 *  - ronda de la hora: cuántas máquinas de la planta faltan, sala por sala;
 *  - actividades asignadas: en curso, por hacer y hechas hoy;
 *  - próximos turnos del calendario;
 *  - novedades: la OT de una falla o incidencia y los reportes escritos.
 * Henry Stark Desarrollador · CDH Maker
 */
import { roundMachines, roundRoomOf } from '../../../lib/roundRecords'
import { localDate } from './shiftHome'

/* ── Asistencia ───────────────────────────────────────────────────────── */

/** Minutos antes del fin del turno en que el inicio ya ofrece marcar la salida. */
export const SUGGEST_OUT_MIN = 45

/**
 * @param {object} p
 * @param {object[]} p.punches marcas recientes (las más nuevas primero o en cualquier orden)
 * @param {boolean} p.isInside hay un ingreso abierto
 * @param {Date|null} p.shiftEnd fin del turno en curso
 * @returns {{ stage: 'in'|'inside'|'done', inPunch: object|null, outPunch: object|null, suggestOut: boolean }}
 */
export function attendanceStage({ punches = [], isInside = false, shiftEnd = null, now = new Date(), today = localDate(now) }) {
  const sorted = [...punches].filter((p) => p?.punched_at).sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)))
  const lastIn = [...sorted].reverse().find((p) => p.punch_type === 'in') || null
  if (isInside) {
    const suggestOut = !!shiftEnd && now.getTime() >= shiftEnd.getTime() - SUGGEST_OUT_MIN * 60000
    return { stage: 'inside', inPunch: lastIn, outPunch: null, suggestOut }
  }
  const last = sorted[sorted.length - 1] || null
  // Salió hoy (o en este turno de noche): turno cerrado.
  if (last?.punch_type === 'out' && (localDate(new Date(last.punched_at)) === today || (shiftEnd && new Date(last.punched_at) > new Date(shiftEnd.getTime() - 12 * 3600000)))) {
    return { stage: 'done', inPunch: lastIn, outPunch: last, suggestOut: false }
  }
  return { stage: 'in', inPunch: null, outPunch: null, suggestOut: false }
}

/* ── Ronda de la hora ─────────────────────────────────────────────────── */

/** Planta de la ronda: donde la persona ya tomó fotos en el turno; si no, la primera con máquinas de ronda. */
export function pickRoundPlant({ plants = [], machines = [], rooms = [], checks = [], userId }) {
  const mine = checks.filter((c) => c.taken_by === userId && c.plant_id)
  if (mine.length) {
    const count = new Map()
    for (const c of mine) count.set(c.plant_id, (count.get(c.plant_id) || 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  const withRound = plants.find((p) => roundMachines({ machines, rooms, plantId: p.id }).machines.length)
  return withRound?.id || plants[0]?.id || null
}

/**
 * Avance de la ronda de la hora en la planta: la misma regla de máquinas del FOMAT04.
 * @returns {{ total, done, pending, mine, complete, issues, rooms: Array<{id,name,done,total}> }}
 */
export function roundHourStatus({ machines = [], rooms = [], checks = [], plantId, shiftDate, hour, userId }) {
  const { rooms: roundRooms, machines: roundMs } = roundMachines({ machines, rooms, plantId })
  const now = checks.filter((c) => c.shift_date === shiftDate && Number(c.hour_slot) === Number(hour))
  const byMachine = new Map()
  for (const c of now) {
    const prev = byMachine.get(c.machine_id)
    if (!prev || String(c.taken_at || '') > String(prev.taken_at || '')) byMachine.set(c.machine_id, c)
  }
  const done = roundMs.filter((m) => byMachine.has(m.id)).length
  const perRoom = roundRooms.map((r) => {
    const inRoom = roundMs.filter((m) => roundRoomOf(m) === r.id)
    return { id: r.id, name: r.name, total: inRoom.length, done: inRoom.filter((m) => byMachine.has(m.id)).length }
  })
  return {
    total: roundMs.length,
    done,
    pending: roundMs.length - done,
    mine: roundMs.filter((m) => byMachine.get(m.id)?.taken_by === userId).length,
    complete: roundMs.length > 0 && done === roundMs.length,
    issues: roundMs.filter((m) => ['warning', 'fault'].includes(byMachine.get(m.id)?.condition)).length,
    rooms: perRoom.sort((a, b) => Number(a.done === a.total) - Number(b.done === b.total) || a.name.localeCompare(b.name)),
  }
}

/* ── Actividades asignadas ────────────────────────────────────────────── */

export function activityBuckets({ activities = [], userId, today = localDate() }) {
  const mine = activities.filter((a) => a.assigned_to === userId)
  const byOld = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))
  return {
    doing: mine.filter((a) => a.status === 'in_progress').sort(byOld),
    todo: mine.filter((a) => a.status === 'pending' || a.status === 'assigned').sort(byOld),
    doneToday: mine
      .filter((a) => a.status === 'completed' && a.completed_at && localDate(new Date(a.completed_at)) === today)
      .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))),
  }
}

/* ── Próximos turnos ──────────────────────────────────────────────────── */

const DAY_FMT = { weekday: 'short', day: 'numeric', month: 'short' }

/** Los turnos del calendario de hoy en adelante (hasta `days`), con «Hoy» y «Mañana». */
export function upcomingShifts({ assignments = [], userId, today = localDate(), days = 7 }) {
  const end = new Date(`${today}T12:00:00`)
  end.setDate(end.getDate() + days)
  const endYmd = localDate(end)
  const tomorrow = new Date(`${today}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowYmd = localDate(tomorrow)
  return assignments
    .filter((a) => a.user_id === userId)
    .map((a) => ({ ...a, date: String(a.work_date).slice(0, 10) }))
    .filter((a) => a.date >= today && a.date <= endYmd)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => ({
      date: a.date,
      label: a.date === today ? 'Hoy' : a.date === tomorrowYmd ? 'Mañana' : new Date(`${a.date}T12:00:00`).toLocaleDateString('es-CO', DAY_FMT),
      shiftNumber: a.is_rest ? null : Number(a.shift_number) || null,
      isRest: !!a.is_rest,
    }))
}

/* ── Novedades ────────────────────────────────────────────────────────── */

export const INCIDENT_TYPES = [
  'Temperatura fuera de rango',
  'Humedad fuera de rango',
  'Falla de volteo',
  'Falla eléctrica',
  'Ruido anormal',
  'Puerta / sello',
  'Refrigeración',
  'Fuga de agua',
  'Infraestructura / locativo',
  'Otra novedad',
]

export const INCIDENT_PRIORITIES = [
  { value: 'critical', label: 'Crítica · la máquina o el lote están en riesgo' },
  { value: 'high', label: 'Alta · hay que atenderla en el turno' },
  { value: 'medium', label: 'Media · puede esperar a mantenimiento' },
]

/** OT correctiva abierta y sin asignar (la ven mantenimiento y el supervisor). */
export function buildIncidentOrder({ type, detail = '', machine = null, room = null, plantId = null, priority = 'high', orgId, userId }) {
  const where = machine ? machine.code || machine.name : room ? room.name : null
  const title = [where, type || 'Novedad'].filter(Boolean).join(' · ')
  return {
    org_id: orgId,
    plant_id: machine?.plant_id || room?.plant_id || plantId || null,
    machine_id: machine?.id || null,
    room_id: machine?.room_id || room?.id || null,
    location_type: 'plant',
    title: title.length > 160 ? `${title.slice(0, 159)}…` : title,
    description: [String(detail || '').trim(), 'Reportada por el operario desde el inicio del turno.'].filter(Boolean).join('\n'),
    type: 'corrective',
    priority,
    status: 'open',
    source: 'incident',
    assigned_to: null,
    created_by: userId,
  }
}

export const WRITTEN_REPORTS = [
  { id: 'novedad', title: 'Novedad del turno', hint: 'Qué pasó, en qué máquina o sala, qué hiciste.' },
  { id: 'entrega', title: 'Entrega de turno', hint: 'Cómo quedan las máquinas, qué queda pendiente y para quién.' },
  { id: 'observacion', title: 'Observación', hint: 'Algo que el supervisor o el siguiente turno deba saber.' },
]

/* ── Accesos ──────────────────────────────────────────────────────────── */

/**
 * Accesos del operario a lo que no se hace en el inicio. `view` abre esa sección
 * dentro de «Mis actividades» (SupervisionPanel).
 */
export const OPERATOR_SHORTCUTS = [
  { id: 'cargue', label: 'Cargue', tab: 'supervision', view: 'cargue', icon: 'load' },
  { id: 'transferencia', label: 'Transferencia', tab: 'supervision', view: 'transferencia', icon: 'swap' },
  { id: 'calibracion', label: 'Calibración', tab: 'calibracion', icon: 'calibrate' },
  { id: 'mercancia', label: 'Mercancía recibida', tab: 'supervision', view: 'mercancia', icon: 'box' },
  { id: 'ot', label: 'Órdenes de trabajo', tab: 'supervision', view: 'ot', icon: 'wrench' },
  { id: 'monitoreo', label: 'Máquinas', tab: 'monitoreo', icon: 'grid' },
  { id: 'horarios', label: 'Mis horarios', tab: 'horarios', icon: 'clock' },
  { id: 'cumplimiento', label: 'Mi cumplimiento', tab: 'cumplimiento', icon: 'bars' },
]

/** Los accesos que el rol puede abrir (el auxiliar de turno solo tiene sus actividades en «Mis actividades»). */
export function shortcutsFor({ role, can = () => true }) {
  const auxOnlyActivities = role === 'auxiliary'
  return OPERATOR_SHORTCUTS.filter((s) => {
    if (auxOnlyActivities && s.tab === 'supervision') return false
    return s.tab === 'cumplimiento' || can(s.tab)
  })
}
