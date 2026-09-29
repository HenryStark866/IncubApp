/**
 * Tablero del supervisor: el turno de un vistazo y lo que hay que hacer ya.
 * Funciones puras (se prueban sin red):
 *  - mapa de la ronda: salas × horas del turno, con cobertura y peor condición;
 *  - equipo: quién está, cómo llegó, cómo va en rondas, hace cuánto no registra nada;
 *  - pide atención: lo urgente primero, cada cosa con la acción que la resuelve;
 *  - actividades: pendientes, en curso y hechas; a quién conviene asignar;
 *  - filas nuevas: la actividad de revisión, el recordatorio de ronda.
 * Henry Stark Desarrollador · CDH Maker
 */
import { roundMachines, roundRoomOf } from '../../../lib/roundRecords'
import { SHIFT_WINDOWS, clock, localDate, roundsPace } from './shiftHome'

/* ── Horas del turno ──────────────────────────────────────────────────── */

/** Las 8 horas del turno en orden: T3 → 22, 23, 0 … 5. */
export function shiftHours(shift) {
  const w = SHIFT_WINDOWS[shift]
  if (!w) return []
  return Array.from({ length: 8 }, (_, i) => (w.start + i) % 24)
}

/** Posición (0..7) de la hora en el turno, o -1 si no es del turno. */
export const hourIndex = (shift, hour) => shiftHours(shift).indexOf(Number(hour))

const WORST = { fault: 4, warning: 3, normal: 2, off: 1 }
const worstOf = (a, b) => ((WORST[a] || 0) >= (WORST[b] || 0) ? a : b)

/* ── Mapa de la ronda ─────────────────────────────────────────────────── */

/**
 * Salas × horas del turno. Cada celda dice cuántas máquinas de la sala se
 * reportaron en esa hora y la peor condición (falla > alerta > normal > apagada).
 * @returns {{ hours: number[], currentIndex: number, rows: Array<{ room, total, cells: Array<{ hour, done, total, worst, state }> }>, byHour: Array<{hour, done, total}> }}
 */
export function roundMatrix({ machines = [], rooms = [], checks = [], plantId, shiftDate, shift, currentHour }) {
  const hours = shiftHours(shift)
  const currentIndex = hours.indexOf(Number(currentHour))
  const { rooms: roundRooms, machines: roundMs } = roundMachines({ machines, rooms, plantId })
  const ids = new Set(roundMs.map((m) => m.id))
  // Último registro por máquina y hora.
  const latest = new Map()
  for (const c of checks) {
    if (!ids.has(c.machine_id) || c.shift_date !== shiftDate || Number(c.shift_number) !== Number(shift)) continue
    const k = `${c.machine_id}|${Number(c.hour_slot)}`
    const prev = latest.get(k)
    if (!prev || String(c.taken_at || '') > String(prev.taken_at || '')) latest.set(k, c)
  }
  const stateOf = (i) => (currentIndex < 0 ? 'past' : i < currentIndex ? 'past' : i === currentIndex ? 'current' : 'future')
  const rows = roundRooms
    .map((room) => {
      const inRoom = roundMs.filter((m) => roundRoomOf(m) === room.id)
      const cells = hours.map((hour, i) => {
        let done = 0
        let worst = null
        for (const m of inRoom) {
          const c = latest.get(`${m.id}|${hour}`)
          if (!c) continue
          done += 1
          worst = worst ? worstOf(worst, c.condition || 'normal') : c.condition || 'normal'
        }
        return { hour, done, total: inRoom.length, worst, state: stateOf(i) }
      })
      return { room, total: inRoom.length, cells }
    })
    .sort((a, b) => String(a.room.name).localeCompare(String(b.room.name), 'es', { numeric: true }))
  const byHour = hours.map((hour, i) => ({
    hour,
    state: stateOf(i),
    done: rows.reduce((s, r) => s + r.cells[i].done, 0),
    total: roundMs.length,
  }))
  return { hours, currentIndex, rows, byHour, total: roundMs.length }
}

/** Máquinas de una sala en una hora, con su registro (o sin él). */
export function cellDetail({ machines = [], checks = [], roomId, shiftDate, shift, hour }) {
  return machines
    .filter((m) => roundRoomOf(m) === roomId && m.status !== 'decommissioned')
    .map((m) => {
      const mine = checks.filter(
        (c) => c.machine_id === m.id && c.shift_date === shiftDate && Number(c.shift_number) === Number(shift) && Number(c.hour_slot) === Number(hour)
      )
      const check = mine.sort((a, b) => String(b.taken_at || '').localeCompare(String(a.taken_at || '')))[0] || null
      return { machine: m, check }
    })
    .sort((a, b) => (WORST[b.check?.condition] || 0) - (WORST[a.check?.condition] || 0) || String(a.machine.code || '').localeCompare(String(b.machine.code || ''), 'es', { numeric: true }))
}

/* ── Equipo ───────────────────────────────────────────────────────────── */

export const SHIFT_ROLES = ['operator', 'auxiliary', 'auxiliary_production', 'reception_operator']

/** Minutos sin registrar nada para avisar «sin movimiento». */
export const IDLE_MIN = 75

const mins = (a, b) => Math.round((a.getTime() - b.getTime()) / 60000)

/**
 * @param {object} p
 * @param {object[]} p.members {id, name, role}
 * @param {object[]} p.assignments shift_assignments del día
 * @param {object[]} p.punches marcas de asistencia recientes
 * @param {object[]} p.checks machine_checks del turno
 * @param {object[]} p.acts shift_activities del turno
 * @param {Record<string, number>} p.roundsByUser rondas del turno por persona
 * @param {(uid: string) => object|null} [p.punctualityOf] resultado de buildPunctuality de la persona
 * @param {{start: Date, end: Date}} p.window horario del turno
 * @param {number} [p.inMin] tolerancia de llegada
 */
export function teamBoard({ members = [], assignments = [], punches = [], checks = [], acts = [], roundsByUser = {}, punctualityOf = () => null, shift, shiftDate, window, minRounds = 6, inMin = 10, now = new Date() }) {
  const scheduled = new Set(
    assignments
      .filter((a) => !a.is_rest && Number(a.shift_number) === Number(shift) && String(a.work_date || '').slice(0, 10) === shiftDate)
      .map((a) => a.user_id)
  )
  const since = window ? new Date(window.start.getTime() - 3 * 3600000) : new Date(0)
  const until = window ? new Date(window.end.getTime() + 3 * 3600000) : now
  const shiftPunches = punches.filter((p) => {
    const t = new Date(p.punched_at)
    return t >= since && t <= until
  })
  const byUser = (list, key) => {
    const m = new Map()
    for (const x of list) {
      const uid = x[key]
      if (!uid) continue
      if (!m.has(uid)) m.set(uid, [])
      m.get(uid).push(x)
    }
    return m
  }
  const punchesBy = byUser(shiftPunches, 'user_id')
  const checksBy = byUser(checks, 'taken_by')
  const actsBy = byUser(acts, 'assigned_to')
  const pace = roundsPace({ done: 0, min: minRounds, shift, now })
  const started = window ? now >= window.start : true
  const lateAbsence = window ? now.getTime() > window.start.getTime() + inMin * 60000 : true

  const people = members
    .filter((m) => SHIFT_ROLES.includes(m.role))
    .filter((m) => (scheduled.size ? scheduled.has(m.id) : punchesBy.has(m.id)))
    .map((m) => {
      const ps = (punchesBy.get(m.id) || []).sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)))
      const firstIn = ps.find((p) => p.punch_type === 'in') || null
      const last = ps[ps.length - 1] || null
      const present = !!firstIn && last?.punch_type === 'in'
      const left = !!firstIn && last?.punch_type === 'out'
      const myChecks = checksBy.get(m.id) || []
      const myActs = actsBy.get(m.id) || []
      const seen = [
        ...ps.map((p) => p.punched_at),
        ...myChecks.map((c) => c.taken_at),
        ...myActs.flatMap((a) => [a.started_at, a.completed_at]),
      ]
        .filter(Boolean)
        .map((t) => new Date(t))
        .filter((d) => !Number.isNaN(d.getTime()) && d <= now)
        .sort((a, b) => b - a)[0] || null
      const rounds = Number(roundsByUser[m.id] || 0)
      const punctuality = punctualityOf(m.id)
      const behind = present && rounds < pace.expectedNow
      const idleMin = present && seen ? mins(now, seen) : null
      const idle = present && idleMin != null && idleMin >= IDLE_MIN
      const absent = !firstIn && scheduled.has(m.id) && lateAbsence
      const late = punctuality?.inStatus === 'late'
      const status = absent ? 'absent' : !firstIn ? 'expected' : left ? 'left' : behind ? 'behind' : idle ? 'idle' : late ? 'late' : 'ok'
      return {
        id: m.id,
        name: m.name || 'Sin nombre',
        role: m.role,
        scheduled: scheduled.has(m.id),
        present,
        left,
        inAt: firstIn?.punched_at || null,
        outAt: left ? last.punched_at : null,
        punctuality,
        lateMin: late ? punctuality.inDeltaMin : 0,
        rounds,
        expectedNow: pace.expectedNow,
        behind,
        photos: myChecks.filter((c) => c.photo_path).length,
        lastSeen: seen,
        idleMin,
        idle,
        absent,
        acts: {
          doing: myActs.filter((a) => a.status === 'in_progress').length,
          todo: myActs.filter((a) => a.status === 'pending' || a.status === 'assigned').length,
          done: myActs.filter((a) => a.status === 'completed').length,
        },
        status,
      }
    })
  const ORDER = { absent: 0, behind: 1, idle: 2, late: 3, expected: 4, ok: 5, left: 6 }
  people.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name))
  return {
    people,
    total: people.length,
    present: people.filter((p) => p.present).length,
    absent: people.filter((p) => p.absent),
    behind: people.filter((p) => p.behind),
    idle: people.filter((p) => p.idle),
    late: people.filter((p) => p.lateMin > 0),
    expectedNow: pace.expectedNow,
    started,
  }
}

/** Texto corto del estado de una persona. */
export function personStatusText(p) {
  switch (p.status) {
    case 'absent':
      return 'Sin marca de ingreso'
    case 'expected':
      return 'Por llegar'
    case 'left':
      return `Salió a las ${clock(p.outAt)}`
    case 'behind':
      return `${p.rounds} de ${p.expectedNow} rondas a esta hora`
    case 'idle':
      return `Sin registrar nada hace ${p.idleMin} min`
    case 'late':
      return `Llegó ${p.lateMin} min tarde`
    default:
      return p.lastSeen ? `Activo · último registro ${clock(p.lastSeen)}` : `Ingreso ${clock(p.inAt)}`
  }
}

/* ── Pide atención ────────────────────────────────────────────────────── */

/**
 * Lo que el supervisor debe resolver, lo más grave primero. Cada ítem trae la
 * acción que lo resuelve desde el tablero.
 * @param {object} p
 * @param {Array} p.machineIssues [{ machineId, code, condition, notes, at }] (machineHealth.attention)
 * @param {Map<string, object>} p.openOrdersByMachine OT abierta por máquina
 * @param {object} p.team salida de teamBoard
 * @param {object[]} p.acts actividades del turno
 * @param {{ pending: number, minutesLeft: number, hour: number }} [p.round] ronda de la hora
 */
export function attentionFeed({ machineIssues = [], openOrdersByMachine = new Map(), team = { people: [] }, acts = [], round = null, now = new Date() }) {
  const items = []
  for (const m of machineIssues) {
    const ot = openOrdersByMachine.get(m.machineId) || null
    if (m.condition === 'fault') {
      items.push(
        ot
          ? { key: `fault-${m.machineId}`, severity: 2, tone: 'fault', kind: 'fault_ot', title: `${m.code} en falla`, sub: `OT ${ot.code || ''} ${ot.status === 'in_progress' ? 'en atención' : 'abierta'}`.trim(), machineId: m.machineId, order: ot, action: { id: 'open_ot', label: 'Ver OT' } }
          : { key: `fault-${m.machineId}`, severity: 3, tone: 'fault', kind: 'fault_no_ot', title: `${m.code} en falla sin OT`, sub: m.notes || `Reportada a las ${clock(m.at)}`, machineId: m.machineId, issue: m, action: { id: 'create_ot', label: 'Crear OT' } }
      )
    } else if (m.condition === 'warning') {
      items.push({ key: `warn-${m.machineId}`, severity: 2, tone: 'warning', kind: 'warning', title: `${m.code} en alerta`, sub: m.notes || `Reportada a las ${clock(m.at)}`, machineId: m.machineId, issue: m, action: ot ? { id: 'open_ot', label: 'Ver OT' } : { id: 'assign_check', label: 'Mandar a revisar' }, order: ot })
    }
  }
  for (const p of team.people || []) {
    if (p.absent) items.push({ key: `absent-${p.id}`, severity: 2, tone: 'warning', kind: 'absent', title: `${p.name} no ha llegado`, sub: 'Programado en este turno, sin marca de ingreso', personId: p.id, action: { id: 'horarios', label: 'Horarios' } })
    else if (p.behind) items.push({ key: `behind-${p.id}`, severity: 1, tone: 'warning', kind: 'behind', title: `${p.name} va atrasado en rondas`, sub: `${p.rounds} de ${p.expectedNow} a esta hora`, personId: p.id, action: { id: 'remind', label: 'Recordarle' } })
    else if (p.idle) items.push({ key: `idle-${p.id}`, severity: 1, tone: 'warning', kind: 'idle', title: `${p.name} sin movimiento`, sub: `No registra nada hace ${p.idleMin} min`, personId: p.id, action: { id: 'person', label: 'Ver' } })
    // Llegó tarde: solo si no hay ya otro aviso de la persona (uno por persona basta).
    if (p.lateMin > 0 && !p.absent && !p.behind && !p.idle) items.push({ key: `late-${p.id}`, severity: 0, tone: 'info', kind: 'late', title: `${p.name} llegó ${p.lateMin} min tarde`, sub: `Ingreso ${clock(p.inAt)}`, personId: p.id, action: { id: 'person', label: 'Ver' } })
  }
  for (const a of acts) {
    if ((a.status === 'pending' || a.status === 'assigned') && a.created_at && mins(now, new Date(a.created_at)) >= 60) {
      items.push({ key: `act-${a.id}`, severity: 1, tone: 'warning', kind: 'stalled', title: `«${a.title}» sin iniciar`, sub: `Asignada hace ${Math.round(mins(now, new Date(a.created_at)) / 60)} h`, activity: a, action: { id: 'reassign', label: 'Reasignar' } })
    }
  }
  if (round && round.pending > 0 && round.minutesLeft <= 15) {
    items.push({ key: `round-${round.hour}`, severity: 2, tone: 'warning', kind: 'round_closing', title: `Ronda ${String(round.hour).padStart(2, '0')}:00 sin terminar`, sub: `Faltan ${round.pending} máquina${round.pending === 1 ? '' : 's'} y quedan ${round.minutesLeft} min`, action: { id: 'open_round', label: 'Ver ronda' } })
  }
  return items.sort((a, b) => b.severity - a.severity || a.title.localeCompare(b.title))
}

/** Semáforo del turno a partir de lo que pide atención. */
export function shiftStatus(feed = []) {
  const real = feed.filter((i) => i.severity > 0)
  const faults = real.filter((i) => i.tone === 'fault').length
  if (faults) return { tone: 'alert', headline: `${faults} falla${faults === 1 ? '' : 's'} por resolver`, count: real.length }
  if (real.length) return { tone: 'warn', headline: `${real.length} cosa${real.length === 1 ? '' : 's'} piden atención`, count: real.length }
  return { tone: 'ok', headline: 'Todo en orden', count: 0 }
}

/* ── Actividades ──────────────────────────────────────────────────────── */

export function activityColumns(acts = [], today = localDate()) {
  const col = { todo: [], doing: [], done: [] }
  for (const a of acts) {
    if (a.status === 'in_progress') col.doing.push(a)
    else if (a.status === 'pending' || a.status === 'assigned') col.todo.push(a)
    else if (a.status === 'completed' && a.completed_at && localDate(new Date(a.completed_at)) === today) col.done.push(a)
  }
  col.todo.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  col.doing.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
  col.done.sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)))
  return col
}

/** A quién asignar: presentes primero, luego los de menos actividades abiertas. */
export function assigneeOptions(team = { people: [] }) {
  return [...(team.people || [])]
    .filter((p) => !p.absent && !p.left)
    .sort((a, b) => Number(b.present) - Number(a.present) || a.acts.todo + a.acts.doing - (b.acts.todo + b.acts.doing) || a.name.localeCompare(b.name))
}

/** Actividad de revisión de una máquina en alerta. */
export function buildCheckActivity({ issue, machine, assignedTo, orgId, userId }) {
  return {
    org_id: orgId,
    plant_id: machine?.plant_id || null,
    room_id: machine?.room_id || null,
    machine_id: machine?.id || issue?.machineId || null,
    title: `Revisar ${issue?.code || machine?.code || 'máquina'}`,
    description: [issue?.notes ? `Alerta en la ronda: ${issue.notes}` : 'Alerta en la ronda.', 'Verificar la máquina y reportar en la ronda o pedir OT si es falla.'].join(' '),
    assigned_to: assignedTo,
    assigned_by: userId,
    status: 'pending',
  }
}

/** Recordatorio de ronda: una actividad para la persona (le aparece en «Me asignaron»). */
export function buildRoundReminder({ person, hour, orgId, userId }) {
  return {
    org_id: orgId,
    title: `Ponerse al día con la ronda de las ${String(hour).padStart(2, '0')}:00`,
    description: `Llevas ${person.rounds} de ${person.expectedNow} rondas esperadas a esta hora. Toma las fotos de tus máquinas en la ronda.`,
    assigned_to: person.id,
    assigned_by: userId,
    status: 'pending',
  }
}

/* ── Vistos ───────────────────────────────────────────────────────────── */

/** Clave para guardar lo que el supervisor ya marcó como visto en este turno. */
export const seenKey = (userId, shiftDate, shift) => `incubapp:sup-seen:${userId}:${shiftDate}:T${shift}`
